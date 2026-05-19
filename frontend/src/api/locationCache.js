import { cachedGet, invalidateCachedGet } from "./orgCache";

const URL = "/fulfillment/locations";

export function clearLocationCache() {
  invalidateCachedGet(URL);
}

export function getLocations() {
  return cachedGet(URL).catch(() => []);
}
