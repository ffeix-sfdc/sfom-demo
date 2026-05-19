import math
import time
from typing import Any, Callable, Awaitable

TTL_SECONDS = 300  # 5 minutes

# Keys that never expire — only invalidated by explicit refresh or org switch.
PERSISTENT_KEYS: frozenset[str] = frozenset({
    "countries",
    "currencies",
    "de:setup-names",
    "de:shipping-methods",
    "delivery-methods",
    "location-groups",
    "locations",
    "oci:location-groups",
    "oci:locations",
    "payment-gateways",
    "promotions",
    "saleschannels",
    "shipping-products",
    "webstores",
})

# { (alias, key): (data, expires_at, cached_at, fetch_fn, args, kwargs) }
# expires_at = math.inf for persistent keys
_cache: dict[tuple[str, str], tuple] = {}


async def cached_sf_get(
    alias: str,
    key: str,
    fetch_fn: Callable[..., Awaitable[Any]],
    *args,
    **kwargs,
) -> Any:
    cache_key = (alias or "", key)
    entry = _cache.get(cache_key)
    if entry is not None:
        data, expires_at, _cached_at, _fn, _args, _kwargs = entry
        if time.monotonic() < expires_at:
            return data

    data = await fetch_fn(*args, **kwargs)
    expires_at = math.inf if key in PERSISTENT_KEYS else time.monotonic() + TTL_SECONDS
    _cache[cache_key] = (data, expires_at, time.time(), fetch_fn, args, kwargs)
    return data


async def refresh_entry(alias: str, key: str) -> Any:
    cache_key = (alias or "", key)
    entry = _cache.get(cache_key)
    if entry is None:
        raise KeyError(f"No cache entry for key '{key}' (alias '{alias}')")
    _, _, _, fetch_fn, args, kwargs = entry
    data = await fetch_fn(*args, **kwargs)
    expires_at = math.inf if key in PERSISTENT_KEYS else time.monotonic() + TTL_SECONDS
    _cache[cache_key] = (data, expires_at, time.time(), fetch_fn, args, kwargs)
    return data


def list_entries() -> list[dict]:
    now_mono = time.monotonic()
    result = []
    for (alias, key), (_, expires_at, cached_at, _, _, _) in _cache.items():
        persistent = expires_at == math.inf
        remaining = None if persistent else expires_at - now_mono
        result.append({
            "alias": alias,
            "key": key,
            "cached_at": cached_at,
            "expires_in": None if persistent else max(0.0, remaining),
            "expired": False if persistent else remaining <= 0,
            "persistent": persistent,
        })
    result.sort(key=lambda e: e["key"])
    return result


def invalidate(alias: str):
    keys = [k for k in _cache if k[0] == (alias or "")]
    for k in keys:
        del _cache[k]


def invalidate_key(alias: str, key: str):
    _cache.pop((alias or "", key), None)


def invalidate_prefix(alias: str, prefix: str):
    a = alias or ""
    keys = [k for k in _cache if k[0] == a and k[1].startswith(prefix)]
    for k in keys:
        del _cache[k]


def clear_all():
    _cache.clear()
