import api from "./client";

// Promise-level dedup for TMS slot queries.
// Key: `tms:{method_ref}:{date}`
// Backend TTL is managed server-side; this cache only deduplicates in-flight requests.
const _cache = new Map();

function makeKey(methodRef, date) {
  if (!methodRef || !date) return null;
  return `tms:${methodRef}:${date}`;
}

export function getTmsSlots(methodRef, date) {
  const key = makeKey(methodRef, date);
  if (!key) return Promise.reject(new Error("methodRef and date required"));

  if (!_cache.has(key)) {
    const promise = api.get("/tms/slots", { params: { method_ref: methodRef, date } })
      .then((r) => r.data)
      .catch((err) => { _cache.delete(key); throw err; });
    _cache.set(key, promise);
  }

  return _cache.get(key);
}

export function invalidateTmsSlots(methodRef, date) {
  const key = makeKey(methodRef, date);
  if (key) _cache.delete(key);
}

export function clearTmsSlotsForMethod(methodRef) {
  const prefix = `tms:${methodRef}:`;
  for (const key of _cache.keys()) {
    if (key.startsWith(prefix)) _cache.delete(key);
  }
}

export function clearTmsCache() {
  _cache.clear();
}

// Finds the first available TMS window on or after `afterDate` (ISO string or Date).
// Returns { date, windowStart, windowEnd } or null if nothing found within `maxDays`.
export async function findFirstAvailableTmsSlot(methodRef, afterDate, maxDays = 14) {
  if (!methodRef) return null;
  const after = afterDate ? new Date(afterDate) : new Date();
  for (let d = 0; d < maxDays; d++) {
    const day = new Date(after);
    day.setDate(day.getDate() + d);
    const dateStr = day.toISOString().slice(0, 10);
    try {
      const data = await getTmsSlots(methodRef, dateStr);
      if (!data.operating) continue;
      for (const w of data.windows || []) {
        if ((w.available ?? 0) <= 0) continue;
        if (d === 0) {
          // Skip windows whose end is before `after` time
          const [h, m] = (w.start || "00:00").split(":").map(Number);
          const windowStart = new Date(after);
          windowStart.setHours(h, m, 0, 0);
          if (windowStart < after) continue;
        }
        return { date: dateStr, windowStart: w.start, windowEnd: w.end };
      }
    } catch { /* no config for this day */ }
  }
  return null;
}
