import api from "./client";

// Promise-level dedup: évite les appels doubles en vol pour la même clé.
// Le pre-fetch et le TTL sont désormais gérés côté backend (sf_cache.py).
const _cache = new Map();

function makeKey(params) {
  if (params.config_id) return `cfg:${params.config_id}:${params.date}`;
  if (params.location_ref) return `loc:${params.location_ref}:${params.date}`;
  return null;
}

export function getSlots(params) {
  const key = makeKey(params);
  if (!key) return Promise.reject(new Error("config_id or location_ref required"));

  if (!_cache.has(key)) {
    const p = {};
    if (params.config_id) p.config_id = params.config_id;
    if (params.location_ref) p.location_ref = params.location_ref;
    p.date = params.date;

    const promise = api.get("/slot-manager/slots", { params: p })
      .then((r) => r.data)
      .catch((err) => { _cache.delete(key); throw err; });
    _cache.set(key, promise);
  }

  return _cache.get(key);
}

export function invalidateSlots(params) {
  const key = makeKey(params);
  if (key) _cache.delete(key);
}

export function clearSlotsForConfig(configId) {
  const prefix = `cfg:${configId}:`;
  for (const key of _cache.keys()) {
    if (key.startsWith(prefix)) _cache.delete(key);
  }
}

export function clearSlotsForLocation(locationRef) {
  const prefix = `loc:${locationRef}:`;
  for (const key of _cache.keys()) {
    if (key.startsWith(prefix)) _cache.delete(key);
  }
}

export function clearSlotCache() {
  _cache.clear();
}
