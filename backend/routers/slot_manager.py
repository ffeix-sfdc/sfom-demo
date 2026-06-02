from fastapi import APIRouter, BackgroundTasks, HTTPException, Query
from pydantic import BaseModel
from typing import Optional, List
from services.salesforce import sf_get, sf_post, sf_patch, sf_delete
from services.org_store import get_active_alias
from services.sf_cache import cached_sf_get, invalidate_key, invalidate_prefix
import random
from datetime import date, datetime, timedelta

router = APIRouter()
SF_API = "/services/data/v65.0"

# ── Helpers ──────────────────────────────────────────────────────────────────

def _parse_sf_time(t) -> Optional[int]:
    """BusinessHours time fields are milliseconds since midnight."""
    if t is None:
        return None
    return int(t) // 1000 // 60  # → minutes since midnight


def _minutes_to_hhmm(m: int) -> str:
    return f"{m // 60:02d}:{m % 60:02d}"


DAY_FIELDS = {
    0: ("MondayStartTime", "MondayEndTime", "MondayIsOpen"),
    1: ("TuesdayStartTime", "TuesdayEndTime", "TuesdayIsOpen"),
    2: ("WednesdayStartTime", "WednesdayEndTime", "WednesdayIsOpen"),
    3: ("ThursdayStartTime", "ThursdayEndTime", "ThursdayIsOpen"),
    4: ("FridayStartTime", "FridayEndTime", "FridayIsOpen"),
    5: ("SaturdayStartTime", "SaturdayEndTime", "SaturdayIsOpen"),
    6: ("SundayStartTime", "SundayEndTime", "SundayIsOpen"),
}

BH_FIELDS = (
    "Id,Name,IsActive,"
    "MondayStartTime,MondayEndTime,MondayIsOpen,"
    "TuesdayStartTime,TuesdayEndTime,TuesdayIsOpen,"
    "WednesdayStartTime,WednesdayEndTime,WednesdayIsOpen,"
    "ThursdayStartTime,ThursdayEndTime,ThursdayIsOpen,"
    "FridayStartTime,FridayEndTime,FridayIsOpen,"
    "SaturdayStartTime,SaturdayEndTime,SaturdayIsOpen,"
    "SundayStartTime,SundayEndTime,SundayIsOpen"
)


def _slots_for_day(bh: dict, weekday: int, duration: int, max_concurrent: int, existing: List[str]) -> List[dict]:
    """Generate slot list for a given weekday from BusinessHours, subtracting existing bookings."""
    start_f, end_f, open_f = DAY_FIELDS[weekday]
    if not bh.get(open_f):
        return []
    start_min = _parse_sf_time(bh.get(start_f))
    end_min = _parse_sf_time(bh.get(end_f))
    if start_min is None or end_min is None:
        return []

    slots = []
    t = start_min
    while t + duration <= end_min:
        hhmm = _minutes_to_hhmm(t)
        booked = sum(1 for e in existing if e == hhmm)
        slots.append({
            "time": hhmm,
            "available": max(0, max_concurrent - booked),
            "capacity": max_concurrent,
        })
        t += duration
    return slots


# ── Config endpoints ──────────────────────────────────────────────────────────

@router.get("/configs")
async def list_configs():
    soql = (
        "SELECT Id, Name, SlotDurationMinutes__c, MaxConcurrentSlots__c, "
        "Location__c, Location__r.Name, Location__r.ExternalReference, Location__r.FulfillingBusinessHoursId "
        "FROM SlotConfig__c WHERE IsDeleted = false ORDER BY Location__r.Name"
    )
    result = await sf_get(f"{SF_API}/query", params={"q": soql})
    return result.get("records", [])


class SlotConfigBody(BaseModel):
    location_id: str
    slot_duration_minutes: int = 15
    max_concurrent_slots: int = 1


@router.post("/configs")
async def create_config(body: SlotConfigBody):
    payload = {
        "Location__c": body.location_id,
        "SlotDurationMinutes__c": body.slot_duration_minutes,
        "MaxConcurrentSlots__c": body.max_concurrent_slots,
    }
    result = await sf_post(f"{SF_API}/sobjects/SlotConfig__c", payload)
    return result


@router.patch("/configs/{config_id}")
async def update_config(config_id: str, body: SlotConfigBody):
    payload = {
        "SlotDurationMinutes__c": body.slot_duration_minutes,
        "MaxConcurrentSlots__c": body.max_concurrent_slots,
    }
    await sf_patch(f"{SF_API}/sobjects/SlotConfig__c/{config_id}", payload)
    return {"ok": True}


# ── Slot availability ─────────────────────────────────────────────────────────

DEFAULT_BH = {
    "MondayIsOpen": True, "MondayStartTime": 32400000, "MondayEndTime": 64800000,
    "TuesdayIsOpen": True, "TuesdayStartTime": 32400000, "TuesdayEndTime": 64800000,
    "WednesdayIsOpen": True, "WednesdayStartTime": 32400000, "WednesdayEndTime": 64800000,
    "ThursdayIsOpen": True, "ThursdayStartTime": 32400000, "ThursdayEndTime": 64800000,
    "FridayIsOpen": True, "FridayStartTime": 32400000, "FridayEndTime": 64800000,
    "SaturdayIsOpen": False, "SaturdayStartTime": 32400000, "SaturdayEndTime": 64800000,
    "SundayIsOpen": False, "SundayStartTime": 32400000, "SundayEndTime": 64800000,
}


async def _compute_slots(config_id: Optional[str], location_ref: Optional[str], date_str: str) -> dict:
    """Fetch config, business hours and bookings from SF and compute slot availability."""
    try:
        d = datetime.strptime(date_str, "%Y-%m-%d").date()
    except ValueError:
        raise HTTPException(status_code=400, detail="date must be YYYY-MM-DD")

    if config_id:
        where = f"Id = '{config_id}'"
    elif location_ref:
        where = f"Location__r.ExternalReference = '{location_ref}'"
    else:
        raise HTTPException(status_code=400, detail="config_id or location_ref required")

    soql_cfg = (
        f"SELECT Id, SlotDurationMinutes__c, MaxConcurrentSlots__c, "
        f"Location__r.FulfillingBusinessHoursId "
        f"FROM SlotConfig__c WHERE {where} LIMIT 1"
    )
    cfg_res = await sf_get(f"{SF_API}/query", params={"q": soql_cfg})
    records = cfg_res.get("records", [])
    if not records:
        raise HTTPException(status_code=404, detail="SlotConfig not found")
    cfg = records[0]
    duration = int(cfg["SlotDurationMinutes__c"])
    max_concurrent = int(cfg["MaxConcurrentSlots__c"])
    bh_id = cfg.get("Location__r", {}).get("FulfillingBusinessHoursId")

    bh = DEFAULT_BH
    if bh_id:
        try:
            bh_res = await sf_get(f"{SF_API}/sobjects/BusinessHours/{bh_id}", params={"fields": BH_FIELDS})
            bh = bh_res
        except Exception:
            pass

    date_start = f"{date_str}T00:00:00Z"
    date_end = f"{date_str}T23:59:59Z"
    soql_bk = (
        f"SELECT SlotDateTime__c FROM SlotBooking__c "
        f"WHERE SlotConfig__c = '{cfg['Id']}' "
        f"AND SlotDateTime__c >= {date_start} AND SlotDateTime__c <= {date_end} "
        f"AND Status__c != 'Cancelled'"
    )
    bk_res = await sf_get(f"{SF_API}/query", params={"q": soql_bk})
    existing_times = []
    for bk in bk_res.get("records", []):
        dt_str = bk.get("SlotDateTime__c", "")
        if dt_str:
            try:
                dt = datetime.fromisoformat(dt_str.replace("Z", "+00:00"))
                existing_times.append(f"{dt.hour:02d}:{dt.minute:02d}")
            except Exception:
                pass

    weekday = d.weekday()
    slots = _slots_for_day(bh, weekday, duration, max_concurrent, existing_times)
    return {"date": date_str, "config_id": cfg["Id"], "slots": slots}


def _slot_cache_key(config_id: Optional[str], location_ref: Optional[str], date_str: str) -> str:
    if config_id:
        return f"slots:{config_id}:{date_str}"
    return f"slots:loc:{location_ref}:{date_str}"


async def _prefetch_days(alias: str, config_id: Optional[str], location_ref: Optional[str], from_date: str, days: int = 5):
    import asyncio
    base = datetime.strptime(from_date, "%Y-%m-%d").date()
    dates = [(base + timedelta(days=i)).isoformat() for i in range(1, days + 1)]

    async def _fetch_one(d: str):
        key = _slot_cache_key(config_id, location_ref, d)
        try:
            await cached_sf_get(alias, key, _compute_slots, config_id, location_ref, d)
        except Exception:
            pass

    await asyncio.gather(*[_fetch_one(d) for d in dates])


@router.get("/slots")
async def get_slots(
    background_tasks: BackgroundTasks,
    config_id: Optional[str] = Query(None),
    location_ref: Optional[str] = Query(None),
    date_str: str = Query(..., alias="date"),
):
    alias = get_active_alias() or ""
    key = _slot_cache_key(config_id, location_ref, date_str)
    result = await cached_sf_get(alias, key, _compute_slots, config_id, location_ref, date_str)
    background_tasks.add_task(_prefetch_days, alias, config_id, location_ref, date_str)
    return result


# ── Bookings ──────────────────────────────────────────────────────────────────

class SlotBookingBody(BaseModel):
    slot_config_id: str
    slot_datetime: str  # ISO datetime string
    location_ref: Optional[str] = None
    order_summary_id: Optional[str] = None
    fulfillment_order_id: Optional[str] = None
    status: str = "Confirmed"


@router.post("/bookings")
async def create_booking(body: SlotBookingBody):
    payload: dict = {
        "SlotConfig__c": body.slot_config_id,
        "SlotDateTime__c": body.slot_datetime,
        "Status__c": body.status,
    }
    result = await sf_post(f"{SF_API}/sobjects/SlotBooking__c", payload)
    try:
        date_str = body.slot_datetime[:10]
        alias = get_active_alias() or ""
        invalidate_key(alias, _slot_cache_key(body.slot_config_id, None, date_str))
        if body.location_ref:
            invalidate_key(alias, _slot_cache_key(None, body.location_ref, date_str))
    except Exception:
        pass
    return result


@router.get("/bookings")
async def list_bookings(
    location_ref: Optional[str] = Query(None),
    date_str: Optional[str] = Query(None, alias="date"),
    config_id: Optional[str] = Query(None),
):
    conditions = ["IsDeleted = false"]
    if config_id:
        conditions.append(f"SlotConfig__c = '{config_id}'")
    elif location_ref:
        conditions.append(f"SlotConfig__r.Location__r.ExternalReference = '{location_ref}'")
    if date_str:
        conditions.append(f"SlotDateTime__c >= {date_str}T00:00:00Z AND SlotDateTime__c <= {date_str}T23:59:59Z")

    where = " AND ".join(conditions)
    soql = (
        "SELECT Id, Name, SlotDateTime__c, Status__c, SlotConfig__c, "
        "SlotConfig__r.Location__r.Name, SlotConfig__r.Location__r.ExternalReference "
        f"FROM SlotBooking__c WHERE {where} ORDER BY SlotDateTime__c"
    )
    result = await sf_get(f"{SF_API}/query", params={"q": soql})
    return result.get("records", [])


class SlotBookingPatch(BaseModel):
    status: Optional[str] = None
    fulfillment_order_id: Optional[str] = None


@router.patch("/bookings/{booking_id}")
async def update_booking(booking_id: str, body: SlotBookingPatch):
    payload: dict = {}
    if body.status:
        payload["Status__c"] = body.status
    if not payload:
        raise HTTPException(status_code=400, detail="Nothing to update")
    await sf_patch(f"{SF_API}/sobjects/SlotBooking__c/{booking_id}", payload)
    return {"ok": True}


@router.delete("/bookings/{booking_id}")
async def cancel_booking(booking_id: str):
    # Fetch config+date before cancelling so we can invalidate the right cache key
    try:
        bk = await sf_get(f"{SF_API}/sobjects/SlotBooking__c/{booking_id}", params={"fields": "SlotConfig__c,SlotDateTime__c,SlotConfig__r.Location__r.ExternalReference"})
        cfg_id = bk.get("SlotConfig__c")
        date_str = (bk.get("SlotDateTime__c") or "")[:10]
        location_ref = (bk.get("SlotConfig__r") or {}).get("Location__r", {}).get("ExternalReference") or None
    except Exception:
        cfg_id = None
        date_str = None
        location_ref = None

    await sf_patch(f"{SF_API}/sobjects/SlotBooking__c/{booking_id}", {"Status__c": "Cancelled"})

    if cfg_id and date_str:
        alias = get_active_alias() or ""
        invalidate_key(alias, _slot_cache_key(cfg_id, None, date_str))
        if location_ref:
            invalidate_key(alias, _slot_cache_key(None, location_ref, date_str))

    return {"ok": True}


# ── Generate random bookings ──────────────────────────────────────────────────

class GenerateBody(BaseModel):
    config_id: str
    location_ref: str
    start_date: str  # YYYY-MM-DD
    end_date: str    # YYYY-MM-DD
    fill_rate: float = 0.4  # 0.0–1.0: fraction of available slots to fill


@router.post("/bookings/generate")
async def generate_bookings(body: GenerateBody):
    try:
        start = datetime.strptime(body.start_date, "%Y-%m-%d").date()
        end = datetime.strptime(body.end_date, "%Y-%m-%d").date()
    except ValueError:
        raise HTTPException(status_code=400, detail="Dates must be YYYY-MM-DD")
    if end < start:
        raise HTTPException(status_code=400, detail="end_date must be >= start_date")

    # Fetch config
    soql_cfg = (
        f"SELECT Id, SlotDurationMinutes__c, MaxConcurrentSlots__c, "
        f"Location__r.FulfillingBusinessHoursId "
        f"FROM SlotConfig__c WHERE Id = '{body.config_id}' LIMIT 1"
    )
    cfg_res = await sf_get(f"{SF_API}/query", params={"q": soql_cfg})
    records = cfg_res.get("records", [])
    if not records:
        raise HTTPException(status_code=404, detail="SlotConfig not found")
    cfg = records[0]
    duration = int(cfg["SlotDurationMinutes__c"])
    max_concurrent = int(cfg["MaxConcurrentSlots__c"])
    bh_id = cfg.get("Location__r", {}).get("FulfillingBusinessHoursId")

    bh = DEFAULT_BH
    if bh_id:
        try:
            bh_res = await sf_get(f"{SF_API}/sobjects/BusinessHours/{bh_id}", params={"fields": BH_FIELDS})
            bh = bh_res
        except Exception:
            pass

    created = 0
    current = start
    while current <= end:
        weekday = current.weekday()
        slots = _slots_for_day(bh, weekday, duration, max_concurrent, [])
        for slot in slots:
            for _ in range(slot["capacity"]):
                if random.random() < body.fill_rate:
                    iso_dt = f"{current.isoformat()}T{slot['time']}:00.000+0000"
                    payload = {
                        "SlotConfig__c": body.config_id,
                        "SlotDateTime__c": iso_dt,
                        "Status__c": random.choice(["Confirmed", "Confirmed", "Pending"]),
                    }
                    await sf_post(f"{SF_API}/sobjects/SlotBooking__c", payload)
                    created += 1
        current += timedelta(days=1)

    alias = get_active_alias()
    invalidate_prefix(alias, f"slots:{body.config_id}:")
    if body.location_ref:
        invalidate_prefix(alias, f"slots:loc:{body.location_ref}:")

    return {"created": created}


# ── Clean bookings ────────────────────────────────────────────────────────────

class CleanBody(BaseModel):
    start_date: str  # YYYY-MM-DD
    end_date: str    # YYYY-MM-DD
    config_id: Optional[str] = None
    location_ref: Optional[str] = None
    keep_linked_orders: bool = True  # if True, skip bookings with OrderSummary__c


@router.post("/bookings/clean")
async def clean_bookings(body: CleanBody):
    conditions = [
        f"SlotDateTime__c >= {body.start_date}T00:00:00Z",
        f"SlotDateTime__c <= {body.end_date}T23:59:59Z",
        "IsDeleted = false",
    ]
    if body.config_id:
        conditions.append(f"SlotConfig__c = '{body.config_id}'")
    if body.keep_linked_orders:
        conditions.append("OrderSummary__c = null")

    where = " AND ".join(conditions)
    soql = f"SELECT Id FROM SlotBooking__c WHERE {where}"
    result = await sf_get(f"{SF_API}/query", params={"q": soql})
    ids = [r["Id"] for r in result.get("records", [])]

    deleted = 0
    for record_id in ids:
        await sf_delete(f"{SF_API}/sobjects/SlotBooking__c/{record_id}")
        deleted += 1

    alias = get_active_alias()
    if body.config_id:
        invalidate_prefix(alias, f"slots:{body.config_id}:")
    if body.location_ref:
        invalidate_prefix(alias, f"slots:loc:{body.location_ref}:")

    return {"deleted": deleted, "kept_linked": body.keep_linked_orders}
