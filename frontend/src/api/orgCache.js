import api from "./client";
import { clearSlotCache } from "./slotCache";

let _alias = null;
const _cache = new Map();

export function setOrgAlias(alias) {
  if (alias !== _alias) {
    _alias = alias;
    _cache.clear();
    clearSlotCache();
  }
}

export function cachedGet(url) {
  if (!_cache.has(url)) {
    _cache.set(url, api.get(url).then((r) => r.data).catch((err) => {
      _cache.delete(url);
      throw err;
    }));
  }
  return _cache.get(url);
}

export function invalidateCachedGet(url) {
  _cache.delete(url);
}
