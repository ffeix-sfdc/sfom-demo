import time
from typing import Any

TTL_SECONDS = 60  # aligns with B2C OCI sync interval

# { (alias, location_key, sku): (aft, ato, expires_at) }
_cache: dict[tuple[str, str, str], tuple[int, int, float]] = {}

# SKUs/locations seen recently — used for periodic background refresh
# { alias: set of (location_key, frozenset(skus)) }
_hot_queries: dict[str, list[tuple[str, list[str]]]] = {}


def _cache_key(alias: str, location_key: str, sku: str) -> tuple:
    return (alias or "", location_key, sku)


def get(alias: str, location_key: str, sku: str) -> dict | None:
    entry = _cache.get(_cache_key(alias, location_key, sku))
    if entry is None:
        return None
    aft, ato, expires_at = entry
    if time.monotonic() > expires_at:
        return None
    return {"aft": aft, "ato": ato}


def set_sku(alias: str, location_key: str, sku: str, aft: int, ato: int) -> None:
    _cache[_cache_key(alias, location_key, sku)] = (aft, ato, time.monotonic() + TTL_SECONDS)


def set_bulk(alias: str, location_key: str, by_sku: dict[str, dict]) -> None:
    now = time.monotonic()
    expires_at = now + TTL_SECONDS
    for sku, data in by_sku.items():
        key = _cache_key(alias, location_key, sku)
        existing = _cache.get(key)
        # If an apply_delta extended the TTL beyond now+TTL_SECONDS, a soft reservation
        # is still pending on OCI — preserve the optimistic values instead of overwriting.
        if existing is not None and existing[2] > expires_at:
            continue
        _cache[key] = (data.get("aft", 0), data.get("ato", 0), expires_at)


def apply_delta(alias: str, location_key: str, sku: str, delta_aft: int, delta_ato: int = 0) -> None:
    key = _cache_key(alias, location_key, sku)
    entry = _cache.get(key)
    if entry is None:
        return
    aft, ato, expires_at = entry
    # Extend TTL so the cache stays valid for at least TTL_SECONDS from now —
    # this guarantees OCI has enough time to reflect the reservation before the
    # next fetch overwrites our optimistic delta.
    new_expires_at = max(expires_at, time.monotonic() + TTL_SECONDS)
    _cache[key] = (max(0, aft + delta_aft), max(0, ato + delta_ato), new_expires_at)


def get_bulk(alias: str, location_key: str, skus: list[str]) -> dict[str, dict] | None:
    now = time.monotonic()
    result = {}
    for sku in skus:
        entry = _cache.get(_cache_key(alias, location_key, sku))
        if entry is None:
            return None  # any miss → full cache miss
        aft, ato, expires_at = entry
        if now > expires_at:
            return None  # any expired → full cache miss
        result[sku] = {"aft": aft, "ato": ato}
    return result


def register_hot_query(alias: str, location_key: str, skus: list[str]) -> None:
    queries = _hot_queries.setdefault(alias or "", [])
    # keep at most 50 distinct queries per alias
    entry = (location_key, skus)
    if entry not in queries:
        queries.append(entry)
        if len(queries) > 50:
            queries.pop(0)


def get_hot_queries(alias: str) -> list[tuple[str, list[str]]]:
    return list(_hot_queries.get(alias or "", []))


def list_entries(alias: str) -> list[dict]:
    now = time.monotonic()
    result = []
    for (a, location_key, sku), (aft, ato, expires_at) in _cache.items():
        if a != (alias or ""):
            continue
        remaining = expires_at - now
        result.append({
            "alias": a,
            "key": f"oci:inv:{location_key}:{sku}",
            "location_key": location_key,
            "sku": sku,
            "aft": aft,
            "ato": ato,
            "expires_in": max(0.0, remaining),
            "expired": remaining <= 0,
        })
    result.sort(key=lambda e: e["key"])
    return result


def clear_alias(alias: str) -> None:
    keys = [k for k in _cache if k[0] == (alias or "")]
    for k in keys:
        del _cache[k]
    _hot_queries.pop(alias or "", None)


def clear_all() -> None:
    _cache.clear()
    _hot_queries.clear()
