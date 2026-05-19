from fastapi import APIRouter, BackgroundTasks, HTTPException, Query
from pydantic import BaseModel
from typing import Optional, List
from services.salesforce import sf_get, sf_post, sf_patch, sf_delete
from services.sf_cache import cached_sf_get, invalidate_key, invalidate_prefix
from services.org_store import get_active_alias
import random
from datetime import date, datetime, timedelta

router = APIRouter()
SF_API = "/services/data/v65.0"

# ── Helpers ──────────────────────────────────────────────────────────────────

def _is_operating_day(operating_days: str, d: date) -> bool:
    """operating_days: "1,2,3,4,5" where 1=Mon … 7=Sun"""
    if not operating_days:
        return True
    try:
        days = [int(x.strip()) for x in operating_days.split(",")]
        return (d.weekday() + 1) in days  # weekday() 0=Mon → 1-indexed
    except Exception:
        return True


def _cutoff_passed(cutoff_time: str) -> bool:
    """Returns True if today's cutoff has passed (order must ship tomorrow)."""
    if not cutoff_time:
        return False
    try:
        now = datetime.now()
        h, m = map(int, cutoff_time.split(":"))
        cutoff = now.replace(hour=h, minute=m, second=0, microsecond=0)
        return now >= cutoff
    except Exception:
        return False


def _add_business_days(d: date, n: int, operating_days: str) -> date:
    """Advance d by n business days (respecting operating_days)."""
    current = d
    added = 0
    while added < n:
        current += timedelta(days=1)
        if _is_operating_day(operating_days, current):
            added += 1
    return current


# ── Config endpoints ──────────────────────────────────────────────────────────

@router.get("/configs")
async def list_configs():
    soql = (
        "SELECT Id, Name, ShippingMethodRef__c, "
        "(SELECT Id, Name, WindowStart__c, WindowEnd__c, MaxCapacity__c FROM TmsTimeWindows__r ORDER BY WindowStart__c) "
        "FROM TmsConfig__c WHERE IsDeleted = false ORDER BY ShippingMethodRef__c"
    )
    result = await sf_get(f"{SF_API}/query", params={"q": soql})
    return result.get("records", [])


class TmsWindowBody(BaseModel):
    window_start: str  # HH:MM
    window_end: str    # HH:MM
    max_capacity: int = 10


class TmsConfigBody(BaseModel):
    shipping_method_ref: str
    windows: List[TmsWindowBody] = []


@router.post("/configs")
async def create_config(body: TmsConfigBody):
    payload = {
        "ShippingMethodRef__c": body.shipping_method_ref,
    }
    result = await sf_post(f"{SF_API}/sobjects/TmsConfig__c", payload)
    config_id = result.get("id")

    for w in body.windows:
        await sf_post(f"{SF_API}/sobjects/TmsTimeWindow__c", {
            "TmsConfig__c": config_id,
            "WindowStart__c": w.window_start,
            "WindowEnd__c": w.window_end,
            "MaxCapacity__c": w.max_capacity,
        })

    return {"id": config_id}


@router.patch("/configs/{config_id}")
async def update_config(config_id: str, body: TmsConfigBody):
    payload = {
        "ShippingMethodRef__c": body.shipping_method_ref,
    }
    await sf_patch(f"{SF_API}/sobjects/TmsConfig__c/{config_id}", payload)
    return {"ok": True}


@router.post("/configs/{config_id}/windows")
async def add_window(config_id: str, body: TmsWindowBody):
    result = await sf_post(f"{SF_API}/sobjects/TmsTimeWindow__c", {
        "TmsConfig__c": config_id,
        "WindowStart__c": body.window_start,
        "WindowEnd__c": body.window_end,
        "MaxCapacity__c": body.max_capacity,
    })
    return result


@router.patch("/configs/{config_id}/windows/{window_id}")
async def update_window(config_id: str, window_id: str, body: TmsWindowBody):
    await sf_patch(f"{SF_API}/sobjects/TmsTimeWindow__c/{window_id}", {
        "WindowStart__c": body.window_start,
        "WindowEnd__c": body.window_end,
        "MaxCapacity__c": body.max_capacity,
    })
    return {"ok": True}


@router.delete("/configs/{config_id}/windows/{window_id}")
async def delete_window(config_id: str, window_id: str):
    await sf_delete(f"{SF_API}/sobjects/TmsTimeWindow__c/{window_id}")
    return {"ok": True}


# ── Slot availability ─────────────────────────────────────────────────────────

async def _compute_tms_slots(method_ref: str, date_str: str) -> dict:
    try:
        d = datetime.strptime(date_str, "%Y-%m-%d").date()
    except ValueError:
        raise HTTPException(status_code=400, detail="date must be YYYY-MM-DD")

    soql_cfg = (
        f"SELECT Id, "
        f"(SELECT Id, WindowStart__c, WindowEnd__c, MaxCapacity__c FROM TmsTimeWindows__r ORDER BY WindowStart__c) "
        f"FROM TmsConfig__c WHERE ShippingMethodRef__c = '{method_ref}' LIMIT 1"
    )
    cfg_res = await sf_get(f"{SF_API}/query", params={"q": soql_cfg})
    records = cfg_res.get("records", [])
    if not records:
        raise HTTPException(status_code=404, detail="No active TmsConfig found for this shipping method")
    cfg = records[0]

    if not _is_operating_day(cfg.get("OperatingDays__c") or "", d):
        return {"date": date_str, "operating": False, "windows": []}

    windows = (cfg.get("TmsTimeWindows__r") or {}).get("records", [])
    if not windows:
        return {"date": date_str, "operating": True, "windows": []}

    soql_bk = (
        f"SELECT WindowStart__c FROM TmsBooking__c "
        f"WHERE TmsConfig__c = '{cfg['Id']}' "
        f"AND DeliveryDate__c = {date_str} "
        f"AND Status__c != 'Cancelled'"
    )
    bk_res = await sf_get(f"{SF_API}/query", params={"q": soql_bk})
    booking_counts: dict = {}
    for bk in bk_res.get("records", []):
        k = bk.get("WindowStart__c", "")
        booking_counts[k] = booking_counts.get(k, 0) + 1

    result_windows = []
    for w in windows:
        capacity = int(w.get("MaxCapacity__c", 0))
        booked = booking_counts.get(w["WindowStart__c"], 0)
        result_windows.append({
            "id": w["Id"],
            "start": w["WindowStart__c"],
            "end": w["WindowEnd__c"],
            "capacity": capacity,
            "available": max(0, capacity - booked),
        })

    return {"date": date_str, "config_id": cfg["Id"], "operating": True, "windows": result_windows}


async def _prefetch_tms_days(alias: str, method_ref: str, from_date: str, days: int = 5):
    base = datetime.strptime(from_date, "%Y-%m-%d").date()
    for i in range(1, days + 1):
        d = (base + timedelta(days=i)).isoformat()
        try:
            await cached_sf_get(alias, f"tms:{method_ref}:{d}", _compute_tms_slots, method_ref, d)
        except Exception:
            pass


@router.get("/slots")
async def get_slots(background_tasks: BackgroundTasks, method_ref: str = Query(...), date_str: str = Query(..., alias="date")):
    alias = get_active_alias() or ""
    key = f"tms:{method_ref}:{date_str}"
    result = await cached_sf_get(alias, key, _compute_tms_slots, method_ref, date_str)
    background_tasks.add_task(_prefetch_tms_days, alias, method_ref, date_str)
    return result


# ── Bookings ──────────────────────────────────────────────────────────────────

async def _get_method_ref(config_id: str) -> Optional[str]:
    try:
        res = await sf_get(f"{SF_API}/sobjects/TmsConfig__c/{config_id}", params={"fields": "ShippingMethodRef__c"})
        return res.get("ShippingMethodRef__c")
    except Exception:
        return None


class TmsBookingBody(BaseModel):
    tms_config_id: str
    delivery_date: str  # YYYY-MM-DD
    window_start: str   # HH:MM
    window_end: str     # HH:MM
    order_summary_id: Optional[str] = None
    fulfillment_order_id: Optional[str] = None
    status: str = "Confirmed"
    shipping_method_ref: Optional[str] = None  # passed by frontend to avoid extra SF query


@router.post("/bookings")
async def create_booking(body: TmsBookingBody):
    payload: dict = {
        "TmsConfig__c": body.tms_config_id,
        "DeliveryDate__c": body.delivery_date,
        "WindowStart__c": body.window_start,
        "WindowEnd__c": body.window_end,
        "Status__c": body.status,
    }
    result = await sf_post(f"{SF_API}/sobjects/TmsBooking__c", payload)
    try:
        method_ref = body.shipping_method_ref or await _get_method_ref(body.tms_config_id)
        if method_ref:
            alias = get_active_alias() or ""
            invalidate_key(alias, f"tms:{method_ref}:{body.delivery_date}")
    except Exception:
        pass
    return result


@router.get("/bookings")
async def list_bookings(
    method_ref: Optional[str] = Query(None),
    date_str: Optional[str] = Query(None, alias="date"),
    config_id: Optional[str] = Query(None),
):
    conditions = ["IsDeleted = false"]
    if config_id:
        conditions.append(f"TmsConfig__c = '{config_id}'")
    elif method_ref:
        conditions.append(f"TmsConfig__r.ShippingMethodRef__c = '{method_ref}'")
    if date_str:
        conditions.append(f"DeliveryDate__c = {date_str}")

    where = " AND ".join(conditions)
    soql = (
        "SELECT Id, Name, DeliveryDate__c, WindowStart__c, WindowEnd__c, Status__c, TmsConfig__c "
        f"FROM TmsBooking__c WHERE {where} ORDER BY DeliveryDate__c, WindowStart__c"
    )
    result = await sf_get(f"{SF_API}/query", params={"q": soql})
    return result.get("records", [])


class TmsBookingPatch(BaseModel):
    status: Optional[str] = None
    fulfillment_order_id: Optional[str] = None


@router.patch("/bookings/{booking_id}")
async def update_booking(booking_id: str, body: TmsBookingPatch):
    payload: dict = {}
    if body.status:
        payload["Status__c"] = body.status
    if not payload:
        raise HTTPException(status_code=400, detail="Nothing to update")
    await sf_patch(f"{SF_API}/sobjects/TmsBooking__c/{booking_id}", payload)
    return {"ok": True}


@router.delete("/bookings/{booking_id}")
async def cancel_booking(booking_id: str):
    try:
        bk = await sf_get(f"{SF_API}/sobjects/TmsBooking__c/{booking_id}",
                          params={"fields": "DeliveryDate__c,TmsConfig__c,TmsConfig__r.ShippingMethodRef__c"})
        date_str = (bk.get("DeliveryDate__c") or "")[:10]
        method_ref = (bk.get("TmsConfig__r") or {}).get("ShippingMethodRef__c") or None
    except Exception:
        date_str = None
        method_ref = None

    await sf_patch(f"{SF_API}/sobjects/TmsBooking__c/{booking_id}", {"Status__c": "Cancelled"})

    if method_ref and date_str:
        alias = get_active_alias() or ""
        invalidate_key(alias, f"tms:{method_ref}:{date_str}")

    return {"ok": True}


# ── Generate random bookings ──────────────────────────────────────────────────

class TmsGenerateBody(BaseModel):
    config_id: str
    start_date: str  # YYYY-MM-DD
    end_date: str    # YYYY-MM-DD
    fill_rate: float = 0.4


@router.post("/bookings/generate")
async def generate_bookings(body: TmsGenerateBody):
    try:
        start = datetime.strptime(body.start_date, "%Y-%m-%d").date()
        end = datetime.strptime(body.end_date, "%Y-%m-%d").date()
    except ValueError:
        raise HTTPException(status_code=400, detail="Dates must be YYYY-MM-DD")
    if end < start:
        raise HTTPException(status_code=400, detail="end_date must be >= start_date")

    soql_cfg = (
        f"SELECT Id, ShippingMethodRef__c, "
        f"(SELECT Id, WindowStart__c, WindowEnd__c, MaxCapacity__c FROM TmsTimeWindows__r) "
        f"FROM TmsConfig__c WHERE Id = '{body.config_id}' LIMIT 1"
    )
    cfg_res = await sf_get(f"{SF_API}/query", params={"q": soql_cfg})
    records = cfg_res.get("records", [])
    if not records:
        raise HTTPException(status_code=404, detail="TmsConfig not found")
    cfg = records[0]
    windows = (cfg.get("TmsTimeWindows__r") or {}).get("records", [])

    created = 0
    current = start
    while current <= end:
        if _is_operating_day(cfg.get("OperatingDays__c") or "", current):
            for w in windows:
                capacity = int(w.get("MaxCapacity__c", 1))
                for _ in range(capacity):
                    if random.random() < body.fill_rate:
                        payload = {
                            "TmsConfig__c": body.config_id,
                            "DeliveryDate__c": current.isoformat(),
                            "WindowStart__c": w["WindowStart__c"],
                            "WindowEnd__c": w["WindowEnd__c"],
                            "Status__c": random.choice(["Confirmed", "Confirmed", "Pending"]),
                        }
                        await sf_post(f"{SF_API}/sobjects/TmsBooking__c", payload)
                        created += 1
        current += timedelta(days=1)

    method_ref = cfg.get("ShippingMethodRef__c") or await _get_method_ref(body.config_id)
    if method_ref:
        alias = get_active_alias() or ""
        invalidate_prefix(alias, f"tms:{method_ref}:")

    return {"created": created}


# ── Clean bookings ────────────────────────────────────────────────────────────

class TmsCleanBody(BaseModel):
    start_date: str  # YYYY-MM-DD
    end_date: str    # YYYY-MM-DD
    config_id: Optional[str] = None
    keep_linked_orders: bool = True


@router.post("/bookings/clean")
async def clean_bookings(body: TmsCleanBody):
    conditions = [
        f"DeliveryDate__c >= {body.start_date}",
        f"DeliveryDate__c <= {body.end_date}",
        "IsDeleted = false",
    ]
    if body.config_id:
        conditions.append(f"TmsConfig__c = '{body.config_id}'")
    if body.keep_linked_orders:
        conditions.append("OrderSummary__c = null")

    where = " AND ".join(conditions)
    soql = f"SELECT Id FROM TmsBooking__c WHERE {where}"
    result = await sf_get(f"{SF_API}/query", params={"q": soql})
    ids = [r["Id"] for r in result.get("records", [])]

    deleted = 0
    for record_id in ids:
        await sf_delete(f"{SF_API}/sobjects/TmsBooking__c/{record_id}")
        deleted += 1

    if body.config_id:
        method_ref = await _get_method_ref(body.config_id)
        if method_ref:
            alias = get_active_alias() or ""
            invalidate_prefix(alias, f"tms:{method_ref}:")

    return {"deleted": deleted, "kept_linked": body.keep_linked_orders}
