from fastapi import APIRouter, HTTPException
import asyncio
from pydantic import BaseModel
from services.sf_cli import list_orgs, get_org_token, refresh_orgs_cache, get_cached_orgs
from services.org_store import get_active_alias, set_active_alias
from services.sf_cache import clear_all as clear_sf_cache
from services.oci_inventory_cache import clear_all as clear_oci_cache

router = APIRouter()


@router.get("")
async def get_orgs():
    cached = get_cached_orgs()
    if cached is not None:
        # Serve from cache immediately, refresh in background
        asyncio.create_task(refresh_orgs_cache())
        orgs = cached
    else:
        # First call before warm-up finished — wait for real data
        orgs = await refresh_orgs_cache()

    active = get_active_alias()
    if not active:
        default = next((o for o in orgs if o["is_default"]), None)
        if default:
            active = default["alias"]
            set_active_alias(active)
    return {"orgs": orgs, "active": active}


class ActivateRequest(BaseModel):
    alias: str


@router.post("/activate")
def activate_org(body: ActivateRequest):
    clear_sf_cache()
    clear_oci_cache()
    set_active_alias(body.alias)
    return {"status": "ok", "active": body.alias}


@router.get("/token")
def get_token(alias: str):
    try:
        return get_org_token(alias)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
