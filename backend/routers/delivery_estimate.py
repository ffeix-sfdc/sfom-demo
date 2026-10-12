from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional, List
from services.salesforce import sf_get, sf_post
from services.org_store import get_active_alias
from services.sf_cache import cached_sf_get
from services.org_store import get_active_alias, _load as state_load, _save as state_save
import httpx
import uuid
import time
import logging

logger = logging.getLogger("sfom.cds")

router = APIRouter()

from services.sf_version import SF_API
CDS_BASE = "https://api.salesforce.com/commerce/delivery"
CDS_TOKEN_URL = "https://account.demandware.com/dw/oauth2/access_token"

# In-memory token cache
_token_cache: dict = {"token": None, "expires_at": 0}


# ── CDS credentials stored in app_state.json ────────────────────────────────

def get_cds_config() -> dict:
    return state_load().get("cds", {})


def set_cds_config(cfg: dict):
    data = state_load()
    data["cds"] = cfg
    state_save(data)


# ── Token acquisition ────────────────────────────────────────────────────────

async def get_cds_token() -> str:
    now = time.time()
    if _token_cache["token"] and now < _token_cache["expires_at"] - 60:
        return _token_cache["token"]

    cfg = get_cds_config()
    if not cfg.get("client_id") or not cfg.get("client_secret") or not cfg.get("scope"):
        raise HTTPException(
            status_code=400,
            detail="CDS credentials not configured. Please set them in the Delivery Estimate settings."
        )

    import base64
    basic = base64.b64encode(f"{cfg['client_id']}:{cfg['client_secret']}".encode()).decode()

    async with httpx.AsyncClient() as client:
        resp = await client.post(
            CDS_TOKEN_URL,
            params={"grant_type": "client_credentials", "scope": cfg["scope"]},
            headers={"Authorization": f"Basic {basic}"},
        )
        if not resp.is_success:
            raise HTTPException(status_code=resp.status_code, detail=f"CDS token error: {resp.text}")
        data = resp.json()

    _token_cache["token"] = data["access_token"]
    _token_cache["expires_at"] = now + data.get("expires_in", 1800)
    return _token_cache["token"]


async def cds_post(path: str, payload: dict) -> dict:
    cfg = get_cds_config()
    token = await get_cds_token()
    url = f"{CDS_BASE}{path}"
    corr_id = cfg.get("correlation_id") or str(uuid.uuid4())

    def _build_headers(t: str) -> dict:
        h = {
            "Authorization": f"Bearer {t}",
            "Content-Type": "application/json",
            "Correlation-ID": corr_id,
            "x-salesforce-region": cfg.get("region", "us-east-2"),
        }
        if cfg.get("org_short_code"):
            h["SALESFORCE_COMMERCE_API"] = cfg["org_short_code"]
        return h

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.post(url, json=payload, headers=_build_headers(token))
            if resp.status_code in (401, 403):
                _token_cache["token"] = None
                _token_cache["expires_at"] = 0
                token = await get_cds_token()
                resp = await client.post(url, json=payload, headers=_build_headers(token))
            if not resp.is_success:
                try:
                    detail = resp.json()
                except Exception:
                    detail = resp.text or f"(empty) — {url}"
                if not detail:
                    detail = f"(empty) — {url}"
                logger.error("CDS %s → %d  %s", url, resp.status_code, detail)
                raise HTTPException(status_code=resp.status_code, detail=detail)
            if not resp.content:
                return {}
            return resp.json()
    except HTTPException:
        raise
    except (httpx.ConnectTimeout, httpx.ReadTimeout, httpx.ConnectError) as exc:
        raise HTTPException(status_code=504, detail=f"CDS unreachable: {type(exc).__name__}")


# ── Config endpoints ─────────────────────────────────────────────────────────

class CdsConfigBody(BaseModel):
    client_id: str
    client_secret: str
    scope: str            # e.g. "SALESFORCE_COMMERCE_API:zzse_281 sfcc.commercedeliveryservice.shopper"
    org_short_code: str   # e.g. "zzse_281" — sent as SALESFORCE_COMMERCE_API header
    region: str = "us-east-2"
    correlation_id: str = ""  # static prefix; auto-generated per request if empty


@router.get("/cds-config")
async def get_cds_config_endpoint():
    cfg = get_cds_config()
    return {
        "client_id": cfg.get("client_id", ""),
        "client_secret": cfg.get("client_secret", ""),
        "scope": cfg.get("scope", ""),
        "org_short_code": cfg.get("org_short_code", ""),
        "region": cfg.get("region", "us-east-2"),
        "correlation_id": cfg.get("correlation_id", ""),
        "configured": bool(cfg.get("client_id") and cfg.get("client_secret") and cfg.get("scope")),
    }


@router.post("/cds-config")
async def save_cds_config(body: CdsConfigBody):
    _token_cache["token"] = None
    _token_cache["expires_at"] = 0
    set_cds_config(body.model_dump())
    return {"ok": True}


# ── Pydantic models ──────────────────────────────────────────────────────────

class ShippingMethod(BaseModel):
    name: str


class ShippingCarrier(BaseModel):
    name: str = ""
    methods: List[ShippingMethod] = []


class DeliveryAddressModel(BaseModel):
    country: str = ""
    state: str = ""
    city: str = ""
    postalCode: str = ""


class ProductItem(BaseModel):
    stockKeepingUnit: str
    quantity: int = 1


class CustomerAddress(BaseModel):
    countryCode: str = ""
    postalCode: str = ""
    latitude: Optional[float] = None
    longitude: Optional[float] = None


class DeliveryEstimateRequest(BaseModel):
    operation: str  # "delivery-date" | "delivery-date-by-locations" | "bopis"
    deliveryEstimationSetupName: str
    shippingCarrier: Optional[ShippingCarrier] = None
    products: List[ProductItem]
    deliveryAddress: Optional[DeliveryAddressModel] = None
    locations: List[str] = []
    radius: Optional[float] = None
    unit: Optional[str] = None
    maxReturnedLocations: Optional[int] = None
    bopisAddress: Optional[CustomerAddress] = None


# ── Main estimate endpoint ───────────────────────────────────────────────────

@router.post("")
async def get_delivery_estimate(body: DeliveryEstimateRequest):
    prods = [{"stockKeepingUnit": p.stockKeepingUnit, "quantity": p.quantity} for p in body.products]

    if body.operation == "bopis":
        payload: dict = {
            "deliveryEstimationSetupName": body.deliveryEstimationSetupName,
            "products": prods,
        }
        if body.locations:
            payload["locations"] = body.locations
        if body.radius is not None:
            payload["radius"] = body.radius
        if body.unit:
            payload["unit"] = body.unit
        if body.maxReturnedLocations is not None:
            payload["maxReturnedLocations"] = body.maxReturnedLocations
        if body.bopisAddress:
            addr: dict = {}
            if body.bopisAddress.countryCode:
                addr["countryCode"] = body.bopisAddress.countryCode
            if body.bopisAddress.postalCode:
                addr["postalCode"] = body.bopisAddress.postalCode
            if body.bopisAddress.latitude is not None:
                addr["latitude"] = body.bopisAddress.latitude
            if body.bopisAddress.longitude is not None:
                addr["longitude"] = body.bopisAddress.longitude
            if addr:
                payload["address"] = addr
        result = await cds_post("/v2/estimate/bopis", payload)
    else:
        payload = {
            "deliveryEstimationSetupName": body.deliveryEstimationSetupName,
            "products": prods,
            "deliveryAddress": {
                "country": body.deliveryAddress.country if body.deliveryAddress else "",
                "state": body.deliveryAddress.state if body.deliveryAddress else "",
                "city": body.deliveryAddress.city if body.deliveryAddress else "",
                "postalCode": body.deliveryAddress.postalCode if body.deliveryAddress else "",
            },
        }
        carrier: dict = {"methods": []}
        if body.shippingCarrier:
            if body.shippingCarrier.name:
                carrier["name"] = body.shippingCarrier.name
            if body.shippingCarrier.methods:
                carrier["methods"] = [{"name": m.name} for m in body.shippingCarrier.methods]
        payload["shippingCarrier"] = carrier
        if body.locations:
            payload["locations"] = body.locations

        if body.operation == "delivery-date-by-locations":
            # v1, not v2: v2 by-locations ignores `locations` and routes the whole
            # location group with DRE (sf-oms-core E-282). v1 estimates each requested
            # location but skips inventory, so OCI availability is returned alongside.
            result = await cds_post("/v1/estimate/delivery-date-by-locations", payload)
            # Unknown locations come back as per-entry LOCATION_NOT_FOUND; OCI would
            # reject the whole availability call for them, so leave them out.
            unknown = {
                e.get("location") for e in result.get("deliveryEstimates", [])
                if (e.get("error") or {}).get("code") == "LOCATION_NOT_FOUND"
            }
            availability = await _availability_by_location(
                [l for l in body.locations if l not in unknown],
                [p["stockKeepingUnit"] for p in prods],
            )
            return {"payload": payload, "result": result, "availability": availability}
        result = await cds_post("/v2/estimate/delivery-date", payload)

    return {"payload": payload, "result": result}


async def _availability_by_location(locations: List[str], skus: List[str]) -> dict:
    """OCI availability as { location: { sku: {atf, ato, onHand} } } — {} on failure."""
    if not locations or not skus:
        return {}
    try:
        result = await sf_post(
            f"{SF_API}/commerce/oci/availability/availability-records/actions/get-availability",
            {"locationIdentifiers": locations, "stockKeepingUnits": skus, "useCache": False},
        )
    except Exception as exc:
        logger.warning("OCI availability for by-locations estimate failed: %s", exc)
        return {}
    out: dict = {}
    for loc in result.get("locations", []):
        records = loc.get("inventoryRecords") or loc.get("availabilityRecords") or []
        out[loc.get("locationIdentifier")] = {
            r.get("stockKeepingUnit"): {
                "atf": r.get("availableToFulfill"),
                "ato": r.get("availableToOrder"),
                "onHand": r.get("onHand"),
            }
            for r in records
        }
    return out


# ── Salesforce reference data ────────────────────────────────────────────────

@router.get("/setup-names")
async def get_setup_names():
    alias = get_active_alias()
    soql = "SELECT Id, Name, ExternalReference FROM DeliveryEstimationSetup ORDER BY Name LIMIT 50"
    result = await cached_sf_get(alias, "de:setup-names", sf_get, f"{SF_API}/query", params={"q": soql})
    return result.get("records", [])


@router.get("/shipping-methods")
async def get_shipping_methods():
    alias = get_active_alias()
    soql = "SELECT Id, Name, ExternalReference, ShippingCarrier.Name, ShippingCarrier.ExternalReference FROM ShippingCarrierMethod ORDER BY Name LIMIT 100"
    result = await cached_sf_get(alias, "de:shipping-methods", sf_get, f"{SF_API}/query", params={"q": soql})
    return result.get("records", [])


@router.get("/locations")
async def get_locations():
    alias = get_active_alias()
    soql = (
        "SELECT Id, Name, ExternalReference, LocationType "
        "FROM Location WHERE IsInventoryLocation = true AND ShouldSyncWithOci = true AND IsDeleted = false ORDER BY Name"
    )
    result = await cached_sf_get(alias, "de:locations", sf_get, f"{SF_API}/query", params={"q": soql})
    return result.get("records", [])
