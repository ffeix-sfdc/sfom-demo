from fastapi import APIRouter, BackgroundTasks, HTTPException
from pydantic import BaseModel
from typing import Optional, List
from services.salesforce import sf_post, sf_get
from services.org_store import get_active_alias
from services.sf_cache import cached_sf_get
from services.sf_cli import get_org_token
import services.oci_inventory_cache as oci_cache
import httpx
import uuid
import json
from datetime import date

router = APIRouter()

SF_API = "/services/data/v65.0"


class OciReservationItem(BaseModel):
    sku: str
    quantity: float
    location_identifier: str = ""
    location_group_identifier: str = ""


class OciReservationRequest(BaseModel):
    action_request_id: str
    items: list[OciReservationItem]


class OciReleaseRequest(BaseModel):
    action_request_id: str
    items: list[OciReservationItem]
    async_release: bool = False


class OciAvailabilityItem(BaseModel):
    sku: str
    quantity: float
    location_identifiers: List[str] = []
    location_identifier: str = ""  # legacy single, kept for backward compat
    location_group_identifier: str = ""


class OciAvailabilityRequest(BaseModel):
    items: list[OciAvailabilityItem]


class PlpAvailabilityRequest(BaseModel):
    skus: List[str]
    location_group_ext_ref: Optional[str] = ""
    location_ext_ref: Optional[str] = ""


@router.post("/reservations")
async def create_reservation(body: OciReservationRequest):
    records = []
    for item in body.items:
        rec: dict = {
            "quantity": item.quantity,
            "stockKeepingUnit": item.sku,
        }
        if item.location_identifier:
            rec["locationIdentifier"] = item.location_identifier
        elif item.location_group_identifier:
            rec["locationGroupIdentifier"] = item.location_group_identifier
        records.append(rec)

    payload = {
        "actionRequestId": body.action_request_id,
        "createRecords": records,
    }
    result = await sf_post(
        f"{SF_API}/commerce/oci/reservation/actions/reservations",
        payload,
    )

    # Optimistic cache update — apply delta to every non-empty location key so both
    # the store-level cache (BOPIS) and the LG-level cache (PLP) stay in sync.
    alias = get_active_alias()
    for item in body.items:
        for loc_key in filter(None, [item.location_identifier, item.location_group_identifier]):
            oci_cache.apply_delta(alias, loc_key, item.sku, delta_aft=-int(item.quantity), delta_ato=-int(item.quantity))

    return {"payload": payload, "result": result}


async def _do_release(payload: dict) -> None:
    try:
        await sf_post(f"{SF_API}/commerce/oci/reservation/actions/releases", payload)
    except Exception:
        pass  # fire-and-forget — stock will reconcile on next periodic sync


@router.post("/releases")
async def release_reservation(body: OciReleaseRequest, background_tasks: BackgroundTasks):
    records = []
    for item in body.items:
        rec: dict = {
            "actionRequestId": body.action_request_id,
            "quantity": item.quantity,
            "stockKeepingUnit": item.sku,
        }
        if item.location_identifier:
            rec["locationIdentifier"] = item.location_identifier
        elif item.location_group_identifier:
            rec["locationGroupIdentifier"] = item.location_group_identifier
        records.append(rec)

    payload = {"releaseRecords": records}

    if body.async_release:
        # eCom context — optimistic cache update, OCI call in background
        alias = get_active_alias()
        for item in body.items:
            for loc_key in filter(None, [item.location_identifier, item.location_group_identifier]):
                oci_cache.apply_delta(alias, loc_key, item.sku, delta_aft=int(item.quantity), delta_ato=int(item.quantity))
        background_tasks.add_task(_do_release, payload)
        return {"payload": payload, "result": "release_queued"}
    else:
        # OCI form context — synchrone, retourne le résultat réel
        result = await sf_post(f"{SF_API}/commerce/oci/reservation/actions/releases", payload)
        alias = get_active_alias()
        for item in body.items:
            for loc_key in filter(None, [item.location_identifier, item.location_group_identifier]):
                oci_cache.apply_delta(alias, loc_key, item.sku, delta_aft=int(item.quantity), delta_ato=int(item.quantity))
        return {"payload": payload, "result": result}


@router.post("/availability")
async def get_availability(body: OciAvailabilityRequest):
    # Build payload per SF docs — mutually exclusive modes:
    # A) single location group: { locationGroupIdentifier, stockKeepingUnit }
    # B) multiple groups: { locationGroupIdentifiers, stockKeepingUnits }
    # C) specific locations: { locationIdentifiers, stockKeepingUnits }
    # D) no location: { stockKeepingUnit } or { stockKeepingUnits }
    skus = [item.sku for item in body.items]
    loc_groups = [item.location_group_identifier for item in body.items if item.location_group_identifier]
    # Merge location_identifiers (new multi) and location_identifier (legacy single)
    loc_ids = []
    for item in body.items:
        if item.location_identifiers:
            loc_ids.extend(item.location_identifiers)
        elif item.location_identifier:
            loc_ids.append(item.location_identifier)

    if len(body.items) == 1:
        item = body.items[0]
        ids = item.location_identifiers or ([item.location_identifier] if item.location_identifier else [])
        if item.location_group_identifier:
            payload = {
                "locationGroupIdentifier": item.location_group_identifier,
                "stockKeepingUnit": item.sku,
                "useCache": False,
            }
        elif ids:
            payload = {
                "locationIdentifiers": ids,
                "stockKeepingUnits": [item.sku],
                "useCache": False,
            }
        else:
            payload = {"stockKeepingUnit": item.sku, "useCache": False}
    else:
        if loc_groups:
            payload = {
                "locationGroupIdentifiers": list(dict.fromkeys(loc_groups)),
                "stockKeepingUnits": skus,
                "useCache": False,
            }
        elif loc_ids:
            payload = {
                "locationIdentifiers": list(dict.fromkeys(loc_ids)),
                "stockKeepingUnits": skus,
                "useCache": False,
            }
        else:
            payload = {"stockKeepingUnits": skus, "useCache": False}

    result = await sf_post(
        f"{SF_API}/commerce/oci/availability/availability-records/actions/get-availability",
        payload,
    )
    return {"payload": payload, "result": result}


def _parse_oci_by_sku(result: dict) -> dict[str, dict]:
    def _records(obj: dict) -> list:
        return obj.get("availabilityRecords") or obj.get("inventoryRecords") or []

    all_records = []
    for lg in result.get("locationGroups", []):
        all_records.extend(_records(lg))
    for loc in result.get("locations", []):
        all_records.extend(_records(loc))
    all_records.extend(_records(result))

    by_sku: dict = {}
    for r in all_records:
        sku = r.get("stockKeepingUnit")
        if not sku:
            continue
        if sku not in by_sku:
            by_sku[sku] = {"aft": 0, "ato": 0}
        by_sku[sku]["aft"] += r.get("availableToFulfill", 0) or 0
        by_sku[sku]["ato"] += r.get("availableToOrder", 0) or 0
    return by_sku


@router.post("/availability/plp")
async def get_plp_availability(body: PlpAvailabilityRequest):
    """Cached availability for eCommerce PLP/PDP — TTL 60s, optimistic deltas on reserve/release."""
    if not body.skus:
        return {}

    location_key = body.location_ext_ref or body.location_group_ext_ref
    if not location_key:
        return {}

    alias = get_active_alias()

    # Cache hit
    cached = oci_cache.get_bulk(alias, location_key, body.skus)
    if cached is not None:
        return cached

    # Cache miss — fetch from OCI
    if body.location_ext_ref:
        payload = {"locationIdentifiers": [body.location_ext_ref], "stockKeepingUnits": body.skus}
    else:
        payload = {"locationGroupIdentifiers": [body.location_group_ext_ref], "stockKeepingUnits": body.skus}

    result = await sf_post(
        f"{SF_API}/commerce/oci/availability/availability-records/actions/get-availability",
        payload,
    )
    by_sku = _parse_oci_by_sku(result)

    oci_cache.set_bulk(alias, location_key, by_sku)
    oci_cache.register_hot_query(alias, location_key, body.skus)

    return by_sku


@router.get("/locations")
async def get_locations():
    alias = get_active_alias()
    soql = (
        "SELECT Id, Name, ExternalReference, LocationType, "
        "VisitorAddressId, VisitorAddress.Street, VisitorAddress.City, "
        "VisitorAddress.StateCode, VisitorAddress.PostalCode, VisitorAddress.CountryCode "
        "FROM Location WHERE IsInventoryLocation = true AND ShouldSyncWithOci = true AND IsDeleted = false ORDER BY Name"
    )
    result = await cached_sf_get(alias, "oci:locations", sf_get, f"{SF_API}/query", params={"q": soql})
    return result.get("records", [])


@router.get("/location-groups")
async def get_location_groups():
    alias = get_active_alias()
    soql = (
        "SELECT Id, LocationGroupName, ExternalReference "
        "FROM LocationGroup WHERE ShouldSyncWithOci = true AND IsDeleted = false ORDER BY LocationGroupName LIMIT 50"
    )
    result = await cached_sf_get(alias, "oci:location-groups", sf_get, f"{SF_API}/query", params={"q": soql})
    return result.get("records", [])


class StockFuture(BaseModel):
    quantity: float
    expectedDate: str  # YYYY-MM-DD


class StockRecord(BaseModel):
    locationIdentifier: str
    stockKeepingUnit: str
    onHandQuantity: Optional[float] = None
    safetyStockCount: Optional[float] = None
    futures: Optional[List[StockFuture]] = None


class StockUploadBody(BaseModel):
    records: List[StockRecord]


@router.post("/stock-records/upload")
async def upload_stock_records(body: StockUploadBody):
    # OCI upload uses multipart form-data with NDJSON.
    # First line per location block: {"location":"...","mode":"UPDATE"}
    # Then one record per SKU: {"recordId","sku","effectiveDate","onHand","safetyStockCount","futures"}
    effective_date = date.today().isoformat() + "T12:00:00.000000-00:00"

    by_location: dict[str, list] = {}
    for r in body.records:
        by_location.setdefault(r.locationIdentifier, []).append(r)

    lines: list[str] = []
    for loc, records in by_location.items():
        lines.append(json.dumps({"location": loc, "mode": "UPDATE"}))
        for r in records:
            rec: dict = {
                "recordId": str(uuid.uuid4()),
                "sku": r.stockKeepingUnit,
                "effectiveDate": effective_date,
            }
            if r.onHandQuantity is not None:
                rec["onHand"] = r.onHandQuantity
            if r.safetyStockCount is not None:
                rec["safetyStockCount"] = r.safetyStockCount
            if r.futures:
                rec["futures"] = [
                    {"quantity": f.quantity, "expectedDate": f.expectedDate + "T12:00:00.000000-00:00"}
                    for f in r.futures
                ]
            lines.append(json.dumps(rec))

    ndjson_body = "\n".join(lines) + "\n"
    filename = f"inventory({uuid.uuid4().hex[:8]}).json"
    boundary = "abc"

    multipart = (
        f"--{boundary}\r\n"
        f'Content-Disposition: form-data; name="fileUpload"; filename="{filename}"\r\n'
        f"Content-Type: application/json; charset=UTF-8;\r\n"
        f"Content-Transfer-Encoding: binary\r\n"
        f"\r\n"
        f"{ndjson_body}"
        f"--{boundary}--\r\n"
    )

    org = get_org_token(get_active_alias())
    if not org:
        raise HTTPException(status_code=503, detail="No active org")

    url = f"{org['instance_url']}{SF_API}/commerce/oci/availability-records/uploads"
    headers = {
        "Authorization": f"Bearer {org['access_token']}",
        "Content-Type": f"multipart/form-data; boundary={boundary}",
        "Accept-Encoding": "gzip",
    }

    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(60.0, connect=15.0)) as client:
            resp = await client.post(url, content=multipart.encode("utf-8"), headers=headers)
    except (httpx.ConnectTimeout, httpx.ReadTimeout, httpx.ConnectError) as exc:
        raise HTTPException(status_code=504, detail=f"Salesforce unreachable: {type(exc).__name__}")

    if not resp.is_success:
        try:
            detail = resp.json()
        except Exception:
            detail = resp.text
        raise HTTPException(status_code=resp.status_code, detail=detail)

    result = resp.json() if resp.content else {}
    payload_summary = {"locations": list(by_location.keys()), "records": len(body.records), "ndjson": ndjson_body}
    return {"payload": payload_summary, "result": result}


@router.get("/location-groups/{lg_id}/locations")
async def get_location_group_locations(lg_id: str):
    alias = get_active_alias()
    soql = (
        f"SELECT Location.Id, Location.Name, Location.ExternalReference, Location.LocationType, "
        f"Location.VisitorAddress.Street, Location.VisitorAddress.City, "
        f"Location.VisitorAddress.StateCode, Location.VisitorAddress.PostalCode, Location.VisitorAddress.CountryCode "
        f"FROM LocationGroupAssignment "
        f"WHERE LocationGroup.Id = '{lg_id}' AND Location.IsInventoryLocation = true AND Location.IsDeleted = false "
        f"ORDER BY Location.Name LIMIT 100"
    )
    raw = await cached_sf_get(alias, f"oci:lg-locations:{lg_id}", sf_get, f"{SF_API}/query", params={"q": soql})
    records = raw.get("records", [])
    return [
        {
            "Id": r["Location"]["Id"],
            "Name": r["Location"]["Name"],
            "ExternalReference": r["Location"].get("ExternalReference", ""),
            "LocationType": r["Location"].get("LocationType", ""),
            "VisitorAddress": r["Location"].get("VisitorAddress") or {},
        }
        for r in records
        if r.get("Location")
    ]
