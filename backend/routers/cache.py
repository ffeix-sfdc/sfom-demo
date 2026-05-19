from fastapi import APIRouter, HTTPException
from services.sf_cache import list_entries as sf_list_entries, refresh_entry, invalidate_key, clear_all as sf_clear_all
from services.oci_inventory_cache import list_entries as oci_list_entries, clear_all as oci_clear_all
import services.oci_inventory_cache as oci_cache
from services.org_store import get_active_alias

router = APIRouter()


def _all_entries(alias: str) -> list[dict]:
    sf = [{"source": "sf", **e} for e in sf_list_entries() if e["alias"] == alias]
    oci = [{"source": "oci", **e} for e in oci_list_entries(alias)]
    return sf + oci


@router.get("")
def get_cache():
    alias = get_active_alias() or ""
    return {"alias": alias, "entries": _all_entries(alias)}


@router.post("/refresh/{key}")
async def refresh_cache_entry(key: str):
    alias = get_active_alias() or ""
    try:
        await refresh_entry(alias, key)
    except KeyError:
        raise HTTPException(status_code=404, detail=f"No cache entry for key '{key}'")
    return {"alias": alias, "entries": _all_entries(alias)}


@router.delete("/{key}")
def delete_cache_entry(key: str):
    alias = get_active_alias() or ""
    invalidate_key(alias, key)
    return {"alias": alias, "entries": _all_entries(alias)}


@router.delete("")
def clear_cache():
    alias = get_active_alias() or ""
    sf_clear_all()
    oci_clear_all()
    return {"alias": alias, "entries": []}
