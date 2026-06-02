import React, { useState, useEffect, useRef, startTransition } from "react";
import { flushSync } from "react-dom";
import api from "../api/client";
import { cachedGet } from "../api/orgCache";
import { getSlots } from "../api/slotCache";
import { findFirstAvailableTmsSlot, clearTmsSlotsForMethod, invalidateTmsSlots } from "../api/tmsBookingCache";
import { addLog } from "../log/store";
import CountryStateSelector from "./CountryStateSelector";
import { useLang } from "../i18n/LangContext";
import CreateOrderForm from "./CreateOrderForm";

// ── Session keys ──────────────────────────────────────────────────────────────

const SESSION_CATALOG_ID     = "ecom_catalog_id";
const SESSION_CATALOG_NAME   = "ecom_catalog_name";
const SESSION_CATALOG_LOGO   = "ecom_catalog_logo";
const SESSION_CATALOG_DE     = "ecom_catalog_de_setup";
const SESSION_CATALOG_DEFAULTS = "ecom_catalog_defaults"; // JSON: checkout default fields
const SESSION_LG_ID          = "ecom_lg_id";
const SESSION_LG_NAME        = "ecom_lg_name";
const SESSION_LG_EXT_REF     = "ecom_lg_ext_ref";
const SESSION_STORE_ID       = "ecom_store_id";
const SESSION_STORE_NAME     = "ecom_store_name";
const SESSION_STORE_EXT_REF  = "ecom_store_ext_ref";
const SESSION_RESERVATIONS   = "ecom_reservations"; // { [productId]: { reservationId, isBopis, locationIdentifier, locationGroupIdentifier } }
const SESSION_VIEW           = "ecom_view";
const SESSION_CART           = "ecom_cart";          // JSON array
const SESSION_CATEGORY       = "ecom_category_id";   // active category id or ""
const SESSION_PRODUCT        = "ecom_product";        // selected product JSON or ""

// ── Helpers ───────────────────────────────────────────────────────────────────

const LANG_LOCALE = { en: "en-GB", fr: "fr-FR", es: "es-ES" };

function WirePlaceholder({ className = "", children }) {
  return (
    <div className={`bg-gray-100 border-2 border-dashed border-gray-200 rounded flex items-center justify-center text-gray-400 text-sm ${className}`}>
      {children}
    </div>
  );
}

function StoreHeader({ storeName, onChangeStore }) {
  const { t } = useLang();
  const displayName = storeName || t.ecomStoreNotDefined;
  return (
    <button
      type="button"
      onClick={onChangeStore}
      className="flex items-center gap-1.5 bg-white/90 hover:bg-white border rounded-full px-2.5 py-1 shadow text-xs transition-colors"
    >
      <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-[#00A1E0] shrink-0" viewBox="0 0 20 20" fill="currentColor">
        <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
      </svg>
      <span className="text-gray-500">{t.ecomYourStore}</span>
      <span className={`font-semibold max-w-[120px] truncate ${storeName ? "text-gray-800" : "text-gray-400 italic"}`}>{displayName}</span>
      <span className="text-[#00A1E0] font-medium">›</span>
    </button>
  );
}

function StorePickerModal({ lgId, lgName, currentStoreId, currentStoreName, onSelect, onClose }) {
  const { t } = useLang();
  const [locations, setLocations] = useState([]);
  const [filter, setFilter] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!lgId) { setLoading(false); return; }
    cachedGet(`/oci/location-groups/${lgId}/locations`)
      .then((locs) => setLocations(locs.filter((l) => l.LocationType === "Store")))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [lgId]);

  const filtered = filter.trim()
    ? locations.filter((l) =>
        l.Name.toLowerCase().includes(filter.toLowerCase()) ||
        (l.ExternalReference || "").toLowerCase().includes(filter.toLowerCase())
      )
    : locations;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-80 overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="bg-[#00A1E0] px-4 py-3 flex items-center justify-between">
          <h3 className="text-white font-semibold text-sm">{t.ecomChooseStore}</h3>
          <button onClick={onClose} className="text-white/70 hover:text-white text-lg leading-none">×</button>
        </div>
        <div className="p-3 space-y-2">
          {lgName && (
            <p className="text-xs text-gray-500">{t.ecomLocationGroup} <span className="font-medium text-gray-700">{lgName}</span></p>
          )}
          <button
            onClick={() => onSelect(null, null, null)}
            className={`w-full text-left px-3 py-2 rounded text-sm border ${!currentStoreId ? "bg-blue-50 border-[#00A1E0] text-[#00A1E0] font-medium" : "border-gray-200 text-gray-600 hover:bg-gray-50"}`}
          >
            {t.ecomAllStores(lgName)}
          </button>
          {loading ? (
            <p className="text-xs text-gray-400 text-center py-3">{t.ecomLoadingStores}</p>
          ) : (
            <>
              {locations.length > 5 && (
                <input
                  className="w-full border rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-[#00A1E0]"
                  placeholder={t.ecomFilterStores}
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                />
              )}
              <div className="max-h-56 overflow-y-auto space-y-1">
                {filtered.map((l) => (
                  <button
                    key={l.Id}
                    onClick={() => onSelect(l.Id, l.Name, l.ExternalReference || "")}
                    className={`w-full text-left px-3 py-2 rounded text-sm border ${currentStoreId === l.Id ? "bg-blue-50 border-[#00A1E0] text-[#00A1E0] font-medium" : "border-gray-200 text-gray-700 hover:bg-gray-50"}`}
                  >
                    <span className="font-medium">{l.Name}</span>
                    {l.ExternalReference && <span className="ml-2 text-xs text-gray-400">{l.ExternalReference}</span>}
                  </button>
                ))}
                {filtered.length === 0 && !loading && (
                  <p className="text-xs text-gray-400 text-center py-2">{t.ecomNoStores}</p>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Inventory badges (PLP + PDP) ──────────────────────────────────────────────

function InventoryBadges({ sku, inventory }) {
  if (!inventory) return null;
  const data = inventory[sku];
  if (!data) return null;

  return (
    <div className="flex gap-1">
      <span
        className={`group/aft inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded cursor-default select-none ${data.aft > 0 ? "bg-green-100 text-green-700" : "bg-red-50 text-red-400"}`}
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5 shrink-0" viewBox="0 0 20 20" fill="currentColor">
          <path d="M8 16.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0zM15 16.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z" />
          <path d="M3 4a1 1 0 00-1 1v1a1 1 0 001 1h1.22l1.3 5.15A2 2 0 007.46 14h5.08a2 2 0 001.93-1.47L16.12 7H17a1 1 0 000-2H3z" />
        </svg>
        <span className="hidden group-hover/aft:inline">AFT {data.aft}</span>
      </span>
      <span
        className={`group/ato inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded cursor-default select-none ${data.ato > 0 ? "bg-blue-100 text-blue-600" : "bg-gray-100 text-gray-400"}`}
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5 shrink-0" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M10 2a4 4 0 00-4 4v1H5a1 1 0 00-.994.89l-1 9A1 1 0 004 18h12a1 1 0 00.994-1.11l-1-9A1 1 0 0015 7h-1V6a4 4 0 00-4-4zm2 5V6a2 2 0 10-4 0v1h4z" clipRule="evenodd" />
        </svg>
        <span className="hidden group-hover/ato:inline">ATO {data.ato}</span>
      </span>
    </div>
  );
}

// ── BOPIS Pickup widget ───────────────────────────────────────────────────────
// Two modes:
//   • storeExtRef set  → single-store check (existing behaviour)
//   • storeExtRef empty → geo-locate + radius search, show store list picker

// Resolves the earliest available slot at a given storeExtRef after earliestISO.
// Uses slotCache so results are shared with SlotManagerConfig and pre-fetched.
async function resolvePickupSlot(storeExtRef, earliestISO) {
  const earliest = new Date(earliestISO);
  const dateStr = earliest.toISOString().slice(0, 10);
  let resolved = earliestISO;
  try {
    const data = await getSlots({ location_ref: storeExtRef, date: dateStr });
    const slots = data?.slots || [];
    const matchSlot = slots.find((s) => {
      if (s.available <= 0) return false;
      const [h, m] = s.time.split(":").map(Number);
      const dt = new Date(earliest); dt.setHours(h, m, 0, 0);
      return dt >= earliest;
    });
    if (matchSlot) {
      const [h, m] = matchSlot.time.split(":").map(Number);
      const dt = new Date(earliest); dt.setHours(h, m, 0, 0);
      resolved = dt.toISOString();
    } else {
      for (let d = 1; d <= 7; d++) {
        const next = new Date(earliest); next.setDate(next.getDate() + d);
        try {
          const nd = await getSlots({ location_ref: storeExtRef, date: next.toISOString().slice(0, 10) });
          const ns = (nd?.slots || []).find((s) => s.available > 0);
          if (ns) {
            const [h2, m2] = ns.time.split(":").map(Number);
            next.setHours(h2, m2, 0, 0);
            resolved = next.toISOString();
            break;
          }
        } catch { /* skip day */ }
      }
    }
  } catch { /* no slot config — use earliestISO as-is */ }
  return resolved;
}

// checked / onChange / onPickupStore: controlled by parent
// onPickupStore({ storeExtRef, storeName, pickupTime }) — called when user picks a store (geo mode)
// onPickupTime(isoString) — called when single-store slot is resolved
function BopisPickup({ sku, storeId, storeExtRef, storeName: storeNameProp, deSetupName, lgId, lgExtRef, catalogTransferDmId, checked, onChange, onPickupTime, onPickupStore, deDefaultCountry, deDefaultPostalCode }) {
  const { t, lang } = useLang();
  const locale = LANG_LOCALE[lang] || "en-GB";
  // single-store state
  const [state, setState] = useState("idle"); // idle | loading | done | error | no-config | no-stock
  const [pickupTime, setPickupTime] = useState(null);
  const [resolvedStoreName, setResolvedStoreName] = useState(storeNameProp || "");
  const loadedRef = useRef(false);
  // geo state
  const [geoState, setGeoState] = useState("idle"); // idle | loading | done | error | no-config
  const [nearbyStores, setNearbyStores] = useState([]); // [{extRef, name, atf, ato, pickupTime}]
  const [selectedNearby, setSelectedNearby] = useState(null);
  const geoLoadedRef = useRef(false);

  // Single-store mode
  useEffect(() => {
    if (!storeExtRef) return;
    if (!deSetupName || !sku) { setState("no-config"); return; }
    if (loadedRef.current) return;
    loadedRef.current = true;
    setState("loading");

    const run = async () => {
      // Resolve display name from full locations list (has VisitorAddress)
      try {
        const allLocs = await cachedGet("/oci/locations");
        const sfLoc = allLocs.find((l) => l.ExternalReference === storeExtRef);
        if (sfLoc) {
          const city = sfLoc.VisitorAddress?.City || "";
          setResolvedStoreName(city ? `${sfLoc.Name} - ${city}` : sfLoc.Name);
        }
      } catch { /* keep storeNameProp */ }

      try {
        const deRes = await api.post("/delivery-estimate", {
          operation: "bopis",
          deliveryEstimationSetupName: deSetupName,
          products: [{ stockKeepingUnit: sku, quantity: 1 }],
          locations: [storeExtRef],
          unit: "km",
        });
        const results = deRes.data?.result?.results || [];
        if (!results.length) { setState("error"); return; }
        const hit = results.find((r) => r.location === storeExtRef && r.stockKeepingUnit === sku)
          || results.find((r) => r.location === storeExtRef)
          || results[0];
        const atf = hit?.inventory?.availableToFulfill ?? 0;
        const ato = hit?.inventory?.availableToOrder ?? 0;
        if (atf <= 0 && ato <= 0) { setState("no-stock"); return; }

        let baseISO = null;
        if (atf > 0) {
          baseISO = hit?.inStore?.earliestPickupTime || null;
        } else {
          // ATO only — fetch OCI futures for this store+SKU
          try {
            const atoRes = await api.post("/oci/availability", {
              items: [{ sku, quantity: 1, location_identifier: storeExtRef, location_group_identifier: "" }],
            });
            const records = [];
            const r = atoRes.data?.result || {};
            for (const loc of r.locations || []) records.push(...(loc.availabilityRecords || loc.inventoryRecords || []));
            records.push(...(r.availabilityRecords || r.inventoryRecords || []));
            const skuRec = records.find((rec) => rec.stockKeepingUnit === sku);
            const futures = skuRec?.futures || [];
            const earliest = futures.map((f) => f.expectedDate || f.date || "").filter(Boolean).sort()[0];
            baseISO = earliest || null;
          } catch { baseISO = hit?.inStore?.earliestPickupTime || null; }
        }

        if (!baseISO) { setState("error"); return; }
        const resolved = await resolvePickupSlot(storeExtRef, baseISO);
        setPickupTime(resolved);
        onPickupTime?.(resolved);
        setState("done");
      } catch { setState("error"); }
    };
    run();
  }, [sku, storeExtRef, deSetupName, lgId]);

  // Geo mode — fires when no store is selected
  useEffect(() => {
    if (storeExtRef) return;
    if (!deSetupName || !sku) { setGeoState("no-config"); return; }
    if (geoLoadedRef.current) return;
    geoLoadedRef.current = true;
    setGeoState("loading");

    const run = async () => {
      let lat = null, lng = null;
      try {
        const pos = await new Promise((res, rej) =>
          navigator.geolocation.getCurrentPosition(res, rej, { timeout: 5000 })
        );
        lat = pos.coords.latitude;
        lng = pos.coords.longitude;
      } catch { /* no geo — skip BOPIS radius, go straight to fallback */ }

      try {
        let results = [];
        if (lat !== null && lng !== null) {
          const deRes = await api.post("/delivery-estimate", {
            operation: "bopis",
            deliveryEstimationSetupName: deSetupName,
            products: [{ stockKeepingUnit: sku, quantity: 1 }],
            locations: [],
            radius: 500,
            unit: "km",
            maxReturnedLocations: 5,
            bopisAddress: { latitude: lat, longitude: lng },
          });
          results = deRes.data?.result?.results || [];
        }

        // Build sfLocations: full org locations (has VisitorAddress) filtered to LG Store members
        let sfLocations = [];
        try {
          const [allLocs, lgLocs] = await Promise.all([
            cachedGet("/oci/locations"),
            lgId ? cachedGet(`/oci/location-groups/${lgId}/locations`) : Promise.resolve([]),
          ]);
          if (lgId && lgLocs.length) {
            const lgExtRefs = new Set(lgLocs.filter((l) => l.LocationType === "Store").map((l) => l.ExternalReference));
            sfLocations = allLocs.filter((l) => l.LocationType === "Store" && lgExtRefs.has(l.ExternalReference));
          } else {
            sfLocations = allLocs.filter((l) => l.LocationType === "Store");
          }
        } catch { /* use extRef as fallback */ }

        const buildStoreList = async (hits, isTransfer = false) => {
          // Group by location — keep best atf per location
          const byLoc = new Map();
          for (const r of hits) {
            const loc = r.location;
            if (!byLoc.has(loc)) byLoc.set(loc, r);
            else {
              const existingAtf = byLoc.get(loc)?.inventory?.availableToFulfill ?? 0;
              const newAtf = r?.inventory?.availableToFulfill ?? 0;
              if (newAtf > existingAtf) byLoc.set(loc, r);
            }
          }
          const promises = [...byLoc.values()].map(async (hit) => {
            const atf = hit?.inventory?.availableToFulfill ?? 0;
            const ato = hit?.inventory?.availableToOrder ?? 0;
            if (atf <= 0 && ato <= 0) return null;
            const extRef = hit.location;
            const sfLoc = sfLocations.find((l) => l.ExternalReference === extRef);
            if (!sfLoc || sfLoc.LocationType !== "Store") return null;
            const city = sfLoc?.VisitorAddress?.City || "";
            const locationName = city ? `${sfLoc.Name} - ${city}` : sfLoc.Name;

            let baseISO = null;
            if (atf > 0) {
              // ATF available — use DE bopis earliestPickupTime directly
              baseISO = hit?.inStore?.earliestPickupTime || null;
            } else {
              // ATO only — fetch OCI futures for this store+SKU to get earliest expectedDate
              try {
                const atoRes = await api.post("/oci/availability", {
                  items: [{ sku, quantity: 1, location_identifier: extRef, location_group_identifier: "" }],
                });
                const records = [];
                const r = atoRes.data?.result || {};
                for (const loc of r.locations || []) records.push(...(loc.availabilityRecords || loc.inventoryRecords || []));
                records.push(...(r.availabilityRecords || r.inventoryRecords || []));
                const skuRec = records.find((rec) => rec.stockKeepingUnit === sku);
                const futures = skuRec?.futures || [];
                const earliest = futures
                  .map((f) => f.expectedDate || f.date || "")
                  .filter(Boolean)
                  .sort()[0];
                baseISO = earliest || null;
              } catch { /* fall back to DE date */ baseISO = hit?.inStore?.earliestPickupTime || null; }
            }

            return { extRef, name: locationName, atf, ato, pickupTime: baseISO || null, isTransfer, _resolveSlot: baseISO ? sfLoc.ExternalReference : null, _resolveBase: baseISO };
          });
          return (await Promise.all(promises)).filter(Boolean);
        };

        // First try: geo results with ATF/ATO > 0
        let storeList = results.length ? await buildStoreList(results, false) : [];

        // Capture resolve metadata before stripping for geo results
        const geoResolveList = storeList
          .map((store, i) => store._resolveSlot ? { i, ref: store._resolveSlot, base: store._resolveBase } : null)
          .filter(Boolean);
        storeList = storeList.map(({ _resolveSlot: _s, _resolveBase: _b, ...rest }) => rest);

        // Fallback: if no stores from geo (or all geo hits were non-Store locations),
        // use delivery-date to get estimated arrival, then show all Store-type locations
        // with that date +1 day as pickup basis (transfer mode)
        if (!storeList.length) {
          try {
            // Reverse-geocode lat/lng → postalCode + countryCode via Nominatim (only if geo available)
            let postalCode = "";
            let countryCode = "";
            if (lat !== null && lng !== null) {
              try {
                const geoResp = await fetch(
                  `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`,
                  { headers: { "Accept-Language": "en" } }
                );
                const geoJson = await geoResp.json();
                postalCode = geoJson?.address?.postcode || "";
                countryCode = geoJson?.address?.country_code?.toUpperCase() || "";
              } catch { /* proceed with empty address */ }
            }

            // Get ATO future date from OCI LG futures, fallback to delivery-date DE
            let maxDeliveryISO = null;

            // 1. Try OCI LG availability — abort if product truly unavailable (no ATF, no ATO, no futures)
            try {
              const atoRes = await api.post("/oci/availability", {
                items: [{ sku, quantity: 1, location_group_identifier: lgExtRef, location_identifier: "" }],
              });
              const records = [];
              const r = atoRes.data?.result || {};
              for (const lg of r.locationGroups || []) records.push(...(lg.availabilityRecords || lg.inventoryRecords || []));
              for (const loc of r.locations || []) records.push(...(loc.availabilityRecords || loc.inventoryRecords || []));
              records.push(...(r.availabilityRecords || r.inventoryRecords || []));
              const skuRec = records.find((rec) => rec.stockKeepingUnit === sku);
              const atfLg = skuRec?.availableToFulfill ?? 0;
              const atoLg = skuRec?.availableToOrder ?? 0;
              const futures = skuRec?.futures || [];
              if (atfLg <= 0 && atoLg <= 0 && !futures.length) {
                // Product genuinely out of stock — don't show transfer stores
                storeList = [];
                throw new Error("out-of-stock");
              }
              const earliest = futures.map((f) => f.expectedDate || f.date || "").filter(Boolean).sort()[0];
              if (earliest) maxDeliveryISO = earliest;
            } catch (e) { if (e?.message === "out-of-stock") throw e; /* else fall through to DE */ }

            // 2. If OCI returned no future date, try delivery-date DE
            if (!maxDeliveryISO) {
              try {
                const ddRes = await api.post("/delivery-estimate", {
                  operation: "delivery-date",
                  deliveryEstimationSetupName: deSetupName,
                  products: [{ stockKeepingUnit: sku, quantity: 1 }],
                  deliveryAddress: { country: countryCode || deDefaultCountry || "", state: "", city: "", postalCode: postalCode || deDefaultPostalCode || "" },
                });
                const deliveryEstimates = ddRes.data?.result?.deliveryEstimates || [];
                for (const dg of deliveryEstimates) {
                  for (const grp of dg.deliveryEstimateGroup || []) {
                    for (const sm of grp.shippingMethods || []) {
                      const maxStr = sm.estimatedDeliveryDate?.max;
                      if (maxStr && (!maxDeliveryISO || new Date(maxStr) > new Date(maxDeliveryISO))) {
                        maxDeliveryISO = maxStr;
                      }
                    }
                  }
                }
              } catch { /* will use default offset below */ }
            }

            // 3. Hard fallback: today + 3 days
            if (!maxDeliveryISO) {
              const fallbackDate = new Date();
              fallbackDate.setDate(fallbackDate.getDate() + 3);
              maxDeliveryISO = fallbackDate.toISOString();
            }

            // Add 1 day for transfer handling time
            const transferBase = new Date(maxDeliveryISO);
            transferBase.setDate(transferBase.getDate() + 1);
            const transferBaseISO = transferBase.toISOString();

            // Show all Store-type SF locations immediately with base transfer date,
            // then resolve slots asynchronously per store
            const storeLocs = sfLocations.filter((l) => l.LocationType === "Store" && l.ExternalReference);

            storeList = storeLocs.map((sfLoc) => {
              const city = sfLoc?.VisitorAddress?.City || "";
              return {
                extRef: sfLoc.ExternalReference,
                name: city ? `${sfLoc.Name} - ${city}` : sfLoc.Name,
                atf: 0,
                ato: 1,
                pickupTime: transferBaseISO,
                isTransfer: true,
                slotLoading: true,
                _storeLocs: storeLocs,
                _transferBaseISO: transferBaseISO,
              };
            });
          } catch (e) { if (e?.message === "out-of-stock") { /* storeList already [] */ } }
        }

        const cleanList = storeList.map(({ _resolveSlot: _s, _resolveBase: _b, _storeLocs: _sl, _transferBaseISO: _tb, ...rest }) => rest);
        // Capture resolve metadata before stripping
        const storeLocs = storeList[0]?._storeLocs || null;
        const transferBaseISO = storeList[0]?._transferBaseISO || null;

        // Force React to paint the stores immediately before resolving slots
        flushSync(() => {
          setNearbyStores(cleanList);
          setGeoState("done");
        });

        // Slots resolve after the paint — each .then() triggers its own re-render
        if (geoResolveList.length) {
          geoResolveList.forEach(({ i, ref, base }) => {
            resolvePickupSlot(ref, base).then((resolvedSlot) => {
              setNearbyStores((prev) => {
                const next = [...prev];
                if (next[i]) next[i] = { ...next[i], pickupTime: resolvedSlot };
                return next;
              });
            }).catch(() => {});
          });
        }

        if (storeLocs && transferBaseISO) {
          storeLocs.forEach((sfLoc, i) => {
            resolvePickupSlot(sfLoc.ExternalReference, transferBaseISO).then((resolvedSlot) => {
              setNearbyStores((prev) => {
                const next = [...prev];
                if (next[i]) next[i] = { ...next[i], pickupTime: resolvedSlot, slotLoading: false };
                return next;
              });
            }).catch(() => {
              setNearbyStores((prev) => {
                const next = [...prev];
                if (next[i]) next[i] = { ...next[i], slotLoading: false };
                return next;
              });
            });
          });
        }
      } catch { setGeoState("done"); setNearbyStores([]); }
    };
    run();
  }, [sku, storeExtRef, deSetupName, lgId]);

  // ── Single-store rendering ──────────────────────────────────────────────────
  if (storeExtRef) {
    if (state === "no-config") return null;
    if (state === "loading") {
      return (
        <div className="flex items-center gap-1.5 text-xs text-gray-400 mt-2">
          <svg className="animate-spin w-3.5 h-3.5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
          </svg>
          {t.ecomCheckingPickup}
        </div>
      );
    }
    if (state === "no-stock") {
      return (
        <div className="flex items-center gap-1 text-xs text-orange-400 mt-2">
          <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd"/>
          </svg>
          {t.ecomPickupNoStock}
        </div>
      );
    }
    if (state === "error") {
      return (
        <div className="flex items-center gap-1 text-xs text-red-400 mt-2">
          <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd"/>
          </svg>
          {t.ecomPickupError}
        </div>
      );
    }
    if (state === "done" && pickupTime) {
      const dt = new Date(pickupTime);
      const dateLabel = dt.toLocaleDateString(locale, { weekday: "short", day: "numeric", month: "short" });
      const timeLabel = dt.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });
      return (
        <label className="flex items-start gap-2 mt-2 bg-green-50 border border-green-200 rounded-lg px-3 py-2 cursor-pointer select-none">
          <input type="checkbox" className="mt-0.5 accent-green-600 shrink-0" checked={!!checked} onChange={(e) => onChange?.(e.target.checked)} />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-green-800">{t.ecomPickupInStore}{resolvedStoreName ? ` · ${resolvedStoreName}` : ""}</p>
            <p className="text-xs text-green-700">{t.ecomPickupAvailableFrom(dateLabel, timeLabel)}</p>
          </div>
        </label>
      );
    }
    return null;
  }

  // ── Geo / no-store rendering ────────────────────────────────────────────────
  if (geoState === "no-config") return null;
  if (geoState === "loading") {
    return (
      <div className="flex items-center gap-1.5 text-xs text-gray-400 mt-2">
        <svg className="animate-spin w-3.5 h-3.5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
        </svg>
        {t.ecomPickupGeoLoading}
      </div>
    );
  }
  if (geoState === "error") {
    return (
      <div className="flex items-center gap-1 text-xs text-red-400 mt-2">
        <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd"/>
        </svg>
        {t.ecomPickupGeoError}
      </div>
    );
  }
  if (geoState === "done") {
    if (!nearbyStores.length) {
      return (
        <div className="flex items-center gap-1 text-xs text-orange-400 mt-2">
          <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd"/>
          </svg>
          {t.ecomPickupNoNearby}
        </div>
      );
    }

    // Store already chosen via geo
    if (selectedNearby) {
      const dt = selectedNearby.pickupTime ? new Date(selectedNearby.pickupTime) : null;
      const dateLabel = dt?.toLocaleDateString(locale, { weekday: "short", day: "numeric", month: "short" });
      const timeLabel = dt?.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });
      const isTransfer = selectedNearby.isTransfer;
      return (
        <label className={`flex items-start gap-2 mt-2 rounded-lg px-3 py-2 cursor-pointer select-none border ${isTransfer ? "bg-purple-50 border-purple-200" : "bg-green-50 border-green-200"}`}>
          <input type="checkbox" className="mt-0.5 accent-green-600 shrink-0" checked={!!checked} onChange={(e) => onChange?.(e.target.checked)} />
          <div className="flex-1 min-w-0">
            <p className={`text-xs font-semibold ${isTransfer ? "text-purple-800" : "text-green-800"}`}>
              {isTransfer ? t.ecomPickupTransfer : t.ecomPickupInStore} · {selectedNearby.name}
            </p>
            {selectedNearby.slotLoading
              ? <p className="text-xs italic text-gray-400">Searching pickup slot…</p>
              : dt && <p className={`text-xs ${isTransfer ? "text-purple-700" : "text-green-700"}`}>{t.ecomPickupAvailableFrom(dateLabel, timeLabel)}</p>
            }
          </div>
          <button type="button" onClick={() => { setSelectedNearby(null); onChange?.(false); }} className="text-gray-400 hover:text-red-400 text-sm leading-none shrink-0">×</button>
        </label>
      );
    }

    const hasTransfer = nearbyStores.some((s) => s.isTransfer);
    return (
      <div className="mt-2 space-y-1.5">
        <p className="text-xs font-semibold text-gray-600">
          {hasTransfer ? t.ecomPickupTransferTitle : t.ecomPickupNearbyTitle}
        </p>
        {nearbyStores.map((s) => {
          const dt = s.pickupTime ? new Date(s.pickupTime) : null;
          const dateLabel = dt?.toLocaleDateString(locale, { weekday: "short", day: "numeric", month: "short" });
          const timeLabel = dt?.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });
          const available = s.atf > 0;
          const isTransfer = s.isTransfer;
          const colorCls = isTransfer
            ? "border-purple-200 bg-purple-50"
            : available ? "border-green-200 bg-green-50" : "border-blue-100 bg-blue-50";
          const textCls = isTransfer ? "text-purple-800" : available ? "text-green-800" : "text-blue-800";
          const btnCls = isTransfer
            ? "bg-purple-600 text-white hover:bg-purple-700"
            : available ? "bg-green-600 text-white hover:bg-green-700" : "bg-blue-500 text-white hover:bg-blue-600";
          return (
            <div key={s.extRef} className={`border rounded-lg px-3 py-2 flex items-center gap-2 ${colorCls}`}>
              <svg xmlns="http://www.w3.org/2000/svg" className={`w-4 h-4 shrink-0 ${isTransfer ? "text-purple-500" : available ? "text-green-500" : "text-blue-500"}`} viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd"/>
              </svg>
              <div className="flex-1 min-w-0">
                <p className={`text-[10px] font-medium truncate ${isTransfer ? "text-purple-500" : available ? "text-green-600" : "text-blue-500"}`}>{s.name}</p>
                <p className={`text-xs font-medium ${textCls}`}>
                  {available ? t.ecomPickupAtf(s.atf) : t.ecomPickupAto(s.ato)}
                </p>
                {s.slotLoading
                  ? <p className="text-[10px] text-gray-400 mt-0.5">Searching pickup slot…</p>
                  : dt
                    ? <p className="text-[10px] font-medium mt-0.5 text-orange-600">📦 {t.ecomPickupAvailableFrom(dateLabel, timeLabel)}</p>
                    : null
                }
              </div>
              <button
                type="button"
                onClick={() => {
                  setSelectedNearby(s);
                  onChange?.(true);
                  onPickupStore?.({ storeExtRef: s.extRef, storeName: s.name, pickupTime: s.pickupTime, isTransfer: s.isTransfer || false });
                }}
                className={`shrink-0 text-xs font-medium px-2 py-1 rounded ${btnCls}`}
              >
                {t.ecomPickupSelectStore}
              </button>
            </div>
          );
        })}
      </div>
    );
  }
  return null;
}

// ── Store banner (shared across PLP / PDP / Cart) ────────────────────────────

function StoreBanner({ catalog, hasLg, storeName, onChangeStore, topRight }) {
  const { t } = useLang();
  return (
    <div className="relative">
      <div className="h-24 rounded-t bg-gray-100 border-2 border-dashed border-gray-200 flex items-center justify-center">
        {catalog?.logo ? (
          <img src={catalog.logo} alt={catalog.name} className="h-16 max-w-[200px] object-contain" />
        ) : (
          <div className="text-center text-gray-400">
            <p className="text-xs mb-0.5">{t.ecomLogoPlaceholder}</p>
            <p className="text-lg font-semibold text-gray-500">{catalog?.name} Store</p>
          </div>
        )}
      </div>
      <div className="absolute top-3 right-3 flex flex-col items-end gap-1.5">
        {topRight}
        {hasLg && <StoreHeader storeName={storeName} onChangeStore={onChangeStore} />}
      </div>
    </div>
  );
}

// ── Catalog Select View ───────────────────────────────────────────────────────

function CatalogSelectView({ onSelect }) {
  const { t } = useLang();
  const [catalogs, setCatalogs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    cachedGet("/catalogs")
      .then(setCatalogs)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-gray-800 mb-1">{t.ecomSimTitle}</h2>
        <p className="text-sm text-gray-500">{t.ecomSimSubtitle}</p>
      </div>
      {loading ? (
        <p className="text-gray-400 text-sm">{t.ecomLoadingCatalogs}</p>
      ) : catalogs.length === 0 ? (
        <p className="text-gray-400 text-sm">{t.ecomNoCatalogsFound}</p>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          {catalogs.map((cat) => (
            <button
              key={cat.id}
              onClick={() => onSelect(cat)}
              className="border-2 border-gray-200 rounded-lg p-4 text-left hover:border-[#00A1E0] hover:bg-blue-50 transition-colors group"
            >
              <p className="font-semibold text-gray-800 group-hover:text-[#00A1E0] text-sm">{cat.name}</p>
              {cat.description && (
                <p className="text-xs text-gray-500 mt-1 line-clamp-2">{cat.description}</p>
              )}
              <p className="text-xs text-gray-400 mt-2">{t.ecomProductCount(cat.product_count)}</p>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── PLP — Product List Page ───────────────────────────────────────────────────

function PLPView({ catalog, products, categories, cart, onAddToCart, onGoToPDP, onGoToCart, onChangeCatalog, activeCategoryId, onSelectCategory, hasLg, storeName, onChangeStore, lgExtRef, storeExtRef, inventory, inventoryLoading, onRefreshInventory }) {
  const { t } = useLang();
  const filteredProducts =
    activeCategoryId === null
      ? products
      : products.filter((p) => (p.category_ids || []).includes(activeCategoryId));

  const cartCount = cart.reduce((s, item) => s + item.quantity, 0);

  let activeCatName = t.ecomAllProducts;
  const findCatName = (cats) => {
    for (const c of cats) {
      if (c.id === activeCategoryId) { activeCatName = c.name; return; }
      if (c.children?.length) findCatName(c.children);
    }
  };
  if (activeCategoryId !== null) findCatName(categories);

  return (
    <div className="space-y-0">
      <StoreBanner
        catalog={catalog}
        hasLg={hasLg}
        storeName={storeName}
        onChangeStore={onChangeStore}
        topRight={
          <button
            onClick={onGoToCart}
            className="flex items-center gap-1 bg-white border rounded-full px-3 py-1.5 shadow text-sm hover:bg-gray-50"
          >
            🛒
            {cartCount > 0 && (
              <span className="bg-[#00A1E0] text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">{cartCount}</span>
            )}
          </button>
        }
      />
      <div className="bg-white border-b px-4 py-2 flex items-center gap-1 text-xs text-gray-500">
          <button onClick={() => onSelectCategory(null)} className="hover:text-[#00A1E0]">{t.ecomHome}</button>
          {activeCategoryId !== null && (
            <><span>/</span><span className="text-gray-700 font-medium">{activeCatName}</span></>
          )}
        </div>

      <WirePlaceholder className="h-10 rounded-none border-t-0 border-b-2">
        {t.ecomPromoBanner}
      </WirePlaceholder>

      <div className="bg-white border-b px-4 py-2 flex items-center gap-2">
        <span className="inline-flex items-center gap-1 bg-[#00A1E0] text-white text-xs font-medium rounded-full px-3 py-1">
          {catalog.name}
          <button onClick={onChangeCatalog} className="ml-1 text-white/70 hover:text-white text-sm leading-none" title="Change catalog">×</button>
        </span>
        <span className="text-xs text-gray-400">{t.ecomProductCount(products.length)}</span>
      </div>

      <div className="flex gap-0 bg-white border-b">
        {/* Sidebar */}
        <div className="w-44 shrink-0 border-r p-3 space-y-1">
          <button
            onClick={() => onSelectCategory(null)}
            className={`block w-full text-left text-xs px-2 py-1.5 rounded ${activeCategoryId === null ? "bg-[#00A1E0] text-white font-semibold" : "text-gray-700 hover:bg-gray-100"}`}
          >
            {t.ecomAllProducts}
          </button>
          {categories.map((cat) => (
            <div key={cat.id}>
              <button
                onClick={() => onSelectCategory(cat.id)}
                className={`block w-full text-left text-xs px-2 py-1.5 rounded ${activeCategoryId === cat.id ? "bg-[#00A1E0] text-white font-semibold" : "text-gray-700 hover:bg-gray-100"}`}
              >
                {cat.name}
              </button>
              {cat.children?.map((sub) => (
                <button
                  key={sub.id}
                  onClick={() => onSelectCategory(sub.id)}
                  className={`block w-full text-left text-xs px-4 py-1 rounded ${activeCategoryId === sub.id ? "bg-[#00A1E0]/80 text-white font-medium" : "text-gray-500 hover:bg-gray-50"}`}
                >
                  ↳ {sub.name}
                </button>
              ))}
            </div>
          ))}
        </div>

        {/* Product grid */}
        <div className="flex-1 p-4">
          {filteredProducts.length === 0 ? (
            <p className="text-gray-400 text-sm">{t.ecomNoProductsInCategory}</p>
          ) : (
            <div className="grid grid-cols-3 gap-4">
              {filteredProducts.map((p) => (
                <div key={p.id} className="border rounded-lg overflow-hidden hover:shadow-md transition-shadow cursor-pointer group"
                  onClick={() => onGoToPDP(p)}>
                  <WirePlaceholder className="aspect-[4/3] rounded-none border-0 border-b-2">
                    📷
                  </WirePlaceholder>
                  <div className="p-3 space-y-1">
                    <p className="text-sm font-semibold text-gray-800 line-clamp-2 group-hover:text-[#00A1E0]">{p.name}</p>
                    <p className="text-xs text-gray-400">SKU: {p.sku}</p>
                    <p className="text-sm font-bold text-gray-900">${p.unit_price.toFixed(2)}</p>
                    {inventory !== null && <InventoryBadges sku={p.sku} inventory={inventory} />}
                    {(() => {
                      const inv = inventory === null ? null : (inventory?.[p.sku] ?? null);
                      const noData = lgExtRef && inv === null && !inventoryLoading;
                      const outOfStock = inv && inv.aft === 0 && inv.ato === 0;
                      const disabled = (lgExtRef && inv === null) || outOfStock;
                      return noData ? (
                        <button
                          onClick={(e) => { e.stopPropagation(); onRefreshInventory?.(); }}
                          className="w-full mt-2 border border-[#00A1E0] text-[#00A1E0] text-xs py-1.5 rounded hover:bg-blue-50 transition-colors"
                        >
                          ↻ {t.ecomRefreshStock}
                        </button>
                      ) : (
                        <button
                          onClick={(e) => { e.stopPropagation(); if (!disabled) onAddToCart(p); }}
                          disabled={disabled}
                          className="w-full mt-2 bg-[#00A1E0] text-white text-xs py-1.5 rounded hover:bg-[#0086b3] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          {t.ecomAddToCart}
                        </button>
                      );
                    })()}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Home Delivery estimate widget ────────────────────────────────────────────

// HomeDelivery — shows delivery estimates per shipping method.
// When product.require_tms_booking=true, also finds the first available TMS slot
// after the estimatedShipDate for each method and lets the user pick a method.
// onSelectMethod(methodRef, methodName, tmsBooking|null) — called when user picks a method.
// selectedMethodRef — currently selected method (controlled externally).
function HomeDelivery({ product, deSetupName, deCarrierName, deCarrierMethods, deDefaultCountry, deDefaultPostalCode, onSelectMethod, selectedMethodRef }) {
  const { t, lang } = useLang();
  const locale = LANG_LOCALE[lang] || "en-GB";
  const sku = product?.sku || "";
  const requireTms = product?.require_tms_booking || false;
  const [state, setState] = useState("idle"); // idle | loading | done | error | no-config
  const [methodResults, setMethodResults] = useState([]); // [{name, ref, min, max, tmsSlot, tmsLoading}]

  useEffect(() => {
    if (!deSetupName || !sku) { setState("no-config"); return; }
    let cancelled = false;
    setState("loading");

    (async () => {
      try {
        const methods = Array.isArray(deCarrierMethods) ? deCarrierMethods : [];
        const carrier = deCarrierName && methods.length
          ? { shippingCarrier: { name: deCarrierName, methods: methods.map((m) => ({ name: m.ref })) } }
          : {};
        const postalCode = deDefaultPostalCode || "";
        const countryCode = deDefaultCountry || "";

        const payload = {
          operation: "delivery-date",
          deliveryEstimationSetupName: deSetupName,
          ...carrier,
          products: [{ stockKeepingUnit: sku, quantity: 1 }],
          deliveryAddress: { country: countryCode, state: "", city: "", postalCode },
        };
        const ddRes = await api.post("/delivery-estimate", payload);
        if (cancelled) return;

        // Build a ref→method map so CDS response order doesn't matter
        const methodByRef = Object.fromEntries(methods.map((m) => [m.ref, m]));

        const raw = [];
        const estimates = ddRes.data?.result?.deliveryEstimates || [];
        for (const dg of estimates) {
          for (const grp of dg.deliveryEstimateGroup || []) {
            for (const sm of grp.shippingMethods || []) {
              const mx = sm.estimatedDeliveryDate?.max || null;
              if (!mx) continue;
              const ref = sm.shippingCarrierMethod || "";
              const method = methodByRef[ref] || methods.find((m) => m.ref === ref) || {};
              raw.push({
                min: sm.estimatedDeliveryDate?.min || null,
                max: mx,
                ref,
                name: method.name || method.ref || ref,
              });
            }
          }
        }

        const results = raw.map((r) => ({
          ...r,
          tmsSlot: null,
          tmsLoading: requireTms && !!r.ref,
        }));

        if (results.length) {
          setMethodResults(results);
          setState("done");

          // If TMS required, fetch first available slot per method asynchronously
          if (requireTms) {
            results.forEach((r, i) => {
              if (!r.ref) return;
              // Use start-of-day so TMS windows on the delivery date aren't filtered by time
              const afterDate = r.max ? new Date(r.max.slice(0, 10) + "T00:00:00") : new Date();
              findFirstAvailableTmsSlot(r.ref, afterDate).then((slot) => {
                if (cancelled) return;
                setMethodResults((prev) => {
                  const updated = [...prev];
                  updated[i] = { ...updated[i], tmsSlot: slot, tmsLoading: false };
                  return updated;
                });
              }).catch(() => {
                if (cancelled) return;
                setMethodResults((prev) => {
                  const updated = [...prev];
                  updated[i] = { ...updated[i], tmsLoading: false };
                  return updated;
                });
              });
            });
          }
        } else {
          if (!cancelled) setState("error");
        }
      } catch { if (!cancelled) setState("error"); }
    })();

    return () => { cancelled = true; };
  }, [sku, deSetupName, deCarrierName, deCarrierMethods]);

  if (state === "no-config" || state === "idle") return null;

  const fmtDate = (iso) => new Date(iso).toLocaleDateString(locale, { weekday: "short", day: "numeric", month: "short" });
  const fmtSlot = (slot) => {
    if (!slot) return null;
    const [y, m, d] = slot.date.split("-").map(Number);
    const dt = new Date(y, m - 1, d);
    return `${dt.toLocaleDateString(locale, { weekday: "short", day: "numeric", month: "short" })} ${slot.windowStart}`;
  };

  if (state === "loading") {
    return (
      <div className="flex items-center gap-1.5 text-xs text-gray-400 mt-3 pt-3 border-t">
        <svg className="animate-spin w-3.5 h-3.5 shrink-0" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
        </svg>
        {t.ecomHomeDeliveryLoading}
      </div>
    );
  }

  if (state === "error") {
    return (
      <div className="mt-3 pt-3 border-t">
        <p className="text-xs font-semibold text-gray-600 mb-1">{t.ecomHomeDeliveryTitle}</p>
        <p className="text-xs text-gray-400">{t.ecomHomeDeliveryNoEstimate}</p>
      </div>
    );
  }

  const isSelectable = !!onSelectMethod;

  return (
    <div className="mt-3 pt-3 border-t">
      <p className="text-xs font-semibold text-gray-600 mb-1.5">{t.ecomHomeDeliveryTitle}</p>
      <div className="space-y-1.5">
        {methodResults.map((r, i) => {
          const isSelected = selectedMethodRef && r.ref === selectedMethodRef;
          const noTmsSlot = requireTms && !r.tmsLoading && !r.tmsSlot;
          return (
            <button
              key={r.ref || r.name || i}
              type="button"
              disabled={isSelectable && requireTms && noTmsSlot}
              onClick={isSelectable ? () => onSelectMethod(r.ref, r.name, r.tmsSlot, r.max, Object.fromEntries(methodResults.filter(x => x.max).map(x => [x.ref, x.max]))) : undefined}
              className={`w-full flex items-center gap-2 rounded-lg px-3 py-2 border text-left transition-colors ${
                isSelected
                  ? "bg-blue-100 border-[#00A1E0]"
                  : isSelectable && !(requireTms && noTmsSlot)
                    ? "bg-blue-50 border-blue-200 hover:border-[#00A1E0] hover:bg-blue-100 cursor-pointer"
                    : "bg-blue-50 border-blue-200 opacity-60 cursor-not-allowed"
              }`}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-blue-500 shrink-0" viewBox="0 0 20 20" fill="currentColor">
                <path d="M8 16.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0zM15 16.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z"/>
                <path d="M3 4a1 1 0 00-1 1v1a1 1 0 001 1h1.22l1.3 5.15A2 2 0 007.46 14h5.08a2 2 0 001.93-1.47L16.12 7H17a1 1 0 000-2H3z"/>
              </svg>
              <div className="flex-1 min-w-0">
                {r.name && <p className="text-[10px] text-blue-500 font-medium truncate">{r.name}</p>}
                <p className="text-xs text-blue-800 font-medium">
                  {t.ecomHomeDeliveryEstimate(r.min ? fmtDate(r.min) : null, fmtDate(r.max))}
                </p>
                {requireTms && (
                  r.tmsLoading
                    ? <p className="text-[10px] text-gray-400 mt-0.5">Searching delivery slot…</p>
                    : r.tmsSlot
                      ? <p className="text-[10px] text-orange-600 font-medium mt-0.5">🚚 Slot: {fmtSlot(r.tmsSlot)}</p>
                      : <p className="text-[10px] text-red-500 mt-0.5">No delivery slot available</p>
                )}
              </div>
              {isSelected && (
                <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-[#00A1E0] shrink-0" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd"/>
                </svg>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── PDP — Product Detail Page ─────────────────────────────────────────────────

function PDPView({ product, categories, catalog, onAddToCart, onBack, onGoToCart, cart, hasLg, storeName, onChangeStore, inventory, inventoryLoading, onRefreshInventory, storeId, storeExtRef, lgId, lgExtRef, deSetupName, deCarrierName, deCarrierMethods, deDefaultCountry, deDefaultPostalCode }) {
  const { t } = useLang();
  const [qty, setQty] = useState(1);
  const [pickupChecked, setPickupChecked] = useState(false);
  const [resolvedPickupTime, setResolvedPickupTime] = useState(null);
  const [resolvedPickupStore, setResolvedPickupStore] = useState(null); // geo mode: {storeExtRef, storeName, pickupTime}
  // Home delivery — selected shipping method + TMS booking (when applicable)
  const [selectedShippingMethod, setSelectedShippingMethod] = useState(null); // ref string
  const [selectedShippingMethodName, setSelectedShippingMethodName] = useState(null);
  const [selectedTmsBooking, setSelectedTmsBooking] = useState(null); // {date, windowStart, windowEnd}
  const [selectedDeMax, setSelectedDeMax] = useState(null); // ISO string — DE max delivery date for selected method
  const [selectedAllDeMax, setSelectedAllDeMax] = useState({}); // { [methodRef]: ISO string } — all methods

  const handleSelectShippingMethod = (methodRef, methodName, tmsSlot, deMax, allDeMax) => {
    setSelectedShippingMethod(methodRef);
    setSelectedShippingMethodName(methodName);
    setSelectedTmsBooking(tmsSlot);
    setSelectedDeMax(deMax || null);
    setSelectedAllDeMax(allDeMax || {});
  };

  let catName = null;
  if (product.category_ids?.length) {
    const findCat = (cats) => {
      for (const c of cats) {
        if (product.category_ids.includes(c.id)) return c.name;
        if (c.children?.length) { const n = findCat(c.children); if (n) return n; }
      }
      return null;
    };
    catName = findCat(categories);
  }

  return (
    <div className="space-y-0">
      <StoreBanner
        catalog={catalog}
        hasLg={hasLg}
        storeName={storeName}
        onChangeStore={onChangeStore}
        topRight={
          <button
            onClick={onGoToCart}
            className="flex items-center gap-1 bg-white border rounded-full px-3 py-1.5 shadow text-sm hover:bg-gray-50"
          >
            🛒
            {cart?.length > 0 && (
              <span className="bg-[#00A1E0] text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
                {cart.reduce((s, i) => s + i.quantity, 0)}
              </span>
            )}
          </button>
        }
      />

      {/* Breadcrumb */}
      <div className="bg-white border-b px-4 py-2 flex items-center gap-1 text-xs text-gray-500">
        <button onClick={onBack} className="hover:text-[#00A1E0]">{t.ecomHome}</button>
        {catName && <><span>/</span><span>{catName}</span></>}
        <span>/</span>
        <span className="text-gray-700 font-medium truncate">{product.name}</span>
      </div>

      <div className="px-4 py-4 space-y-4">
        {/* Two-column layout */}
        <div className="grid grid-cols-2 gap-6">
          <WirePlaceholder className="aspect-[3/2]">📷</WirePlaceholder>

          <div className="space-y-4">
            <div>
              <h2 className="text-xl font-bold text-gray-900">{product.name}</h2>
              <p className="text-xs text-gray-400 mt-1">SKU: {product.sku}</p>
              <p className="text-2xl font-bold text-gray-900 mt-2">${product.unit_price.toFixed(2)}</p>
              {inventory !== null && (
                <div className="mt-2">
                  <InventoryBadges sku={product.sku} inventory={inventory} />
                </div>
              )}
            </div>

            {(() => {
              const inv = inventory?.[product.sku];
              // Only show delivery options if inventory is not yet loaded (null) or product has stock/futures
              const hasStock = !inv || inv.aft > 0 || inv.ato > 0 || (inv.futures?.length > 0);
              return hasStock ? (
                <>
                  <BopisPickup
                    sku={product.sku}
                    storeId={storeId}
                    storeExtRef={storeExtRef}
                    lgId={lgId}
                    lgExtRef={lgExtRef}
                    catalogTransferDmId={catalog?.transfer_delivery_method_id || ""}
                    deSetupName={deSetupName}
                    checked={pickupChecked}
                    onChange={setPickupChecked}
                    onPickupTime={setResolvedPickupTime}
                    onPickupStore={(s) => { setResolvedPickupStore(s); }}
                    deDefaultCountry={deDefaultCountry}
                    deDefaultPostalCode={deDefaultPostalCode}
                  />

                  <HomeDelivery
                    product={product}
                    deSetupName={deSetupName}
                    deCarrierName={deCarrierName}
                    deCarrierMethods={deCarrierMethods}
                    deDefaultCountry={deDefaultCountry}
                    deDefaultPostalCode={deDefaultPostalCode}
                    onSelectMethod={handleSelectShippingMethod}
                    selectedMethodRef={selectedShippingMethod}
                  />
                </>
              ) : (
                <p className="text-xs text-gray-400 mt-2">{t.ecomOutOfStock}</p>
              );
            })()}

            <div className="space-y-2">
              <p className="text-xs font-medium text-gray-500">{t.ecomDescription}</p>
              <div className="space-y-1.5">
                {[100, 80, 90, 60].map((w, i) => (
                  <div key={i} className="h-2.5 bg-gray-100 rounded" style={{ width: `${w}%` }} />
                ))}
              </div>
            </div>

            <div className="flex items-center gap-3">
              <label className="text-sm font-medium text-gray-700">{t.ecomQtyLabel}</label>
              <div className="flex items-center border rounded">
                <button onClick={() => setQty(Math.max(1, qty - 1))}
                  className="px-3 py-1 text-gray-500 hover:bg-gray-100 text-lg leading-none">−</button>
                <span className="px-4 py-1 text-sm font-semibold border-x">{qty}</span>
                <button onClick={() => {
                    const maxQty = Math.max(1, inventory?.[product.sku]?.ato ?? Infinity);
                    setQty(Math.min(qty + 1, maxQty));
                  }}
                  className="px-3 py-1 text-gray-500 hover:bg-gray-100 text-lg leading-none">+</button>
              </div>
            </div>

            <button
              onClick={() => {
                if (pickupChecked) {
                  const pickupOpts = storeExtRef
                    ? { isBopis: true, storeId, storeExtRef, storeName, pickupTime: resolvedPickupTime }
                    : resolvedPickupStore
                      ? { isBopis: true, storeId: "", storeExtRef: resolvedPickupStore.storeExtRef, storeName: resolvedPickupStore.storeName, pickupTime: resolvedPickupStore.pickupTime, isTransfer: resolvedPickupStore.isTransfer || false }
                      : null;
                  onAddToCart(product, qty, pickupOpts, null);
                } else {
                  const homeOpts = selectedShippingMethod
                    ? { shippingMethod: selectedShippingMethod, shippingMethodName: selectedShippingMethodName, tmsBooking: selectedTmsBooking, estimatedDeliveryMax: selectedDeMax, allDeMax: selectedAllDeMax }
                    : null;
                  onAddToCart(product, qty, null, homeOpts);
                }
              }}
              disabled={(() => {
                const inv = inventory === null ? null : (inventory?.[product.sku] ?? null);
                if (inv === null) return true;
                if (inv.aft === 0 && inv.ato === 0) return true;
                const hasDeliveryMethods = Array.isArray(deCarrierMethods) && deCarrierMethods.length > 0;
                if (!pickupChecked && hasDeliveryMethods && !selectedShippingMethod) return true;
                if (!pickupChecked && product.require_tms_booking && !selectedTmsBooking) return true;
                return false;
              })()}
              className="w-full bg-[#00A1E0] text-white py-2.5 rounded font-medium hover:bg-[#0086b3] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {pickupChecked ? t.ecomAddToCartPickup : t.ecomAddToCart}
            </button>
            {!pickupChecked && Array.isArray(deCarrierMethods) && deCarrierMethods.length > 0 && !selectedShippingMethod && (
              <p className="text-xs text-orange-600 text-center">Select a delivery method above</p>
            )}
            {!pickupChecked && product.require_tms_booking && selectedShippingMethod && !selectedTmsBooking && (
              <p className="text-xs text-orange-600 text-center">Select a delivery method with an available slot above</p>
            )}
            {inventory === null && !inventoryLoading && (
              <button type="button" onClick={onRefreshInventory}
                className="w-full border border-[#00A1E0] text-[#00A1E0] py-2 rounded text-sm hover:bg-blue-50 transition-colors">
                ↻ {t.ecomRefreshStock}
              </button>
            )}
            <button onClick={onBack} className="w-full border rounded py-2 text-sm text-gray-600 hover:bg-gray-50">
              {t.ecomBack}
            </button>
          </div>
        </div>

        <div className="pt-2">
          <p className="text-sm font-semibold text-gray-700 mb-3">{t.ecomYouMayAlsoLike}</p>
          <div className="grid grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <WirePlaceholder key={i} className="aspect-[3/2]">📷</WirePlaceholder>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Slot Picker Modal (cart group) ────────────────────────────────────────────
// Opens when user clicks "Change slot" on a pickup group.
// Fetches days starting from `afterISO` (the latest pickup time in the group)
// and shows only slots at or after that time.

function SlotPickerModal({ storeExtRef, afterISO, onSelect, onClose }) {
  const { t, lang } = useLang();
  const locale = LANG_LOCALE[lang] || "en-GB";
  const [slots, setSlots] = useState([]); // [{date, time, available}]
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null); // {date, time}

  useEffect(() => {
    const after = afterISO ? new Date(afterISO) : new Date();
    const found = [];
    let cancelled = false;

    const fetchDays = async () => {
      // Scan up to 14 days from `after` to collect available slots
      for (let d = 0; d < 14 && !cancelled; d++) {
        const day = new Date(after);
        day.setDate(day.getDate() + d);
        const dateStr = day.toISOString().slice(0, 10);
        try {
          const r = await api.get("/slot-manager/slots", { params: { location_ref: storeExtRef, date: dateStr } });
          for (const s of r.data?.slots || []) {
            if (s.available <= 0) continue;
            // On the first day, skip slots before `after`
            if (d === 0) {
              const [h, m] = s.time.split(":").map(Number);
              const dt = new Date(after);
              dt.setHours(h, m, 0, 0);
              if (dt < after) continue;
            }
            found.push({ date: dateStr, time: s.time });
          }
          if (found.length >= 10) break; // enough choices
        } catch { /* day has no config — skip */ }
      }
      if (!cancelled) { setSlots(found); setLoading(false); }
    };
    fetchDays();
    return () => { cancelled = true; };
  }, [storeExtRef, afterISO]);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-80 overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="bg-[#00A1E0] px-4 py-3 flex items-center justify-between">
          <h3 className="text-white font-semibold text-sm">{t.ecomSlotPickerTitle}</h3>
          <button onClick={onClose} className="text-white/70 hover:text-white text-lg leading-none">×</button>
        </div>
        <div className="p-3 space-y-2 max-h-72 overflow-y-auto">
          {loading ? (
            <p className="text-xs text-gray-400 text-center py-4">{t.ecomSlotLoadingDays}</p>
          ) : slots.length === 0 ? (
            <p className="text-xs text-gray-400 text-center py-4">{t.ecomSlotNoAvailable}</p>
          ) : (
            slots.map((s) => {
              const dt = new Date(`${s.date}T${s.time}`);
              const label = dt.toLocaleString(locale, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
              const isSelected = selected?.date === s.date && selected?.time === s.time;
              return (
                <button
                  key={`${s.date}-${s.time}`}
                  onClick={() => setSelected(s)}
                  className={`w-full text-left px-3 py-2 rounded text-sm border ${isSelected ? "bg-blue-50 border-[#00A1E0] text-[#00A1E0] font-medium" : "border-gray-200 text-gray-700 hover:bg-gray-50"}`}
                >
                  {label}
                </button>
              );
            })
          )}
        </div>
        {selected && (
          <div className="px-3 pb-3">
            <button
              onClick={() => {
                const iso = new Date(`${selected.date}T${selected.time}`).toISOString();
                onSelect(iso);
              }}
              className="w-full bg-[#00A1E0] text-white py-2 rounded text-sm font-medium hover:bg-[#0086b3]"
            >
              {t.ecomSlotConfirm}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── TMS Booking Picker Modal ──────────────────────────────────────────────────
// Similar to SlotPickerModal but for TMS windows.
// methodRef: TMS ShippingMethodRef__c; afterDate: scan from this date onward.
// onSelect({ date, windowStart, windowEnd }) — called when confirmed.

function TmsBookingPickerModal({ methodRef, afterDate, onSelect, onClose }) {
  const { t, lang } = useLang();
  const locale = LANG_LOCALE[lang] || "en-GB";
  const [slots, setSlots] = useState([]); // [{date, windowStart, windowEnd}]
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    if (!methodRef) return;
    let cancelled = false;
    const after = afterDate ? new Date(afterDate) : new Date();
    const found = [];

    const fetchDays = async () => {
      for (let d = 0; d < 14 && !cancelled; d++) {
        const day = new Date(after);
        day.setDate(day.getDate() + d);
        const dateStr = day.toISOString().slice(0, 10);
        try {
          const r = await api.get("/tms/slots", { params: { method_ref: methodRef, date: dateStr } });
          if (!r.data.operating) continue;
          for (const w of r.data.windows || []) {
            if ((w.available ?? 0) <= 0) continue;
            if (d === 0) {
              const [h, m] = (w.start || "00:00").split(":").map(Number);
              const wStart = new Date(after);
              wStart.setHours(h, m, 0, 0);
              if (wStart < after) continue;
            }
            found.push({ date: dateStr, windowStart: w.start, windowEnd: w.end });
          }
          if (found.length >= 10) break;
        } catch { /* no config for this day */ }
      }
      if (!cancelled) { setSlots(found); setLoading(false); }
    };
    fetchDays();
    return () => { cancelled = true; };
  }, [methodRef, afterDate]);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-80 overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="bg-orange-500 px-4 py-3 flex items-center justify-between">
          <h3 className="text-white font-semibold text-sm">{t.tmsSlotTitle}</h3>
          <button onClick={onClose} className="text-white/70 hover:text-white text-lg leading-none">×</button>
        </div>
        <div className="p-3 space-y-2 max-h-72 overflow-y-auto">
          {loading ? (
            <p className="text-xs text-gray-400 text-center py-4">{t.tmsSlotSearching}</p>
          ) : slots.length === 0 ? (
            <p className="text-xs text-gray-400 text-center py-4">{t.tmsSlotNone}</p>
          ) : (
            slots.map((s) => {
              const d = new Date(s.date + "T00:00:00");
              const label = `${d.toLocaleDateString(locale, { weekday: "short", day: "numeric", month: "short" })} ${s.windowStart}–${s.windowEnd}`;
              const isSelected = selected?.date === s.date && selected?.windowStart === s.windowStart;
              return (
                <button
                  key={`${s.date}-${s.windowStart}`}
                  onClick={() => setSelected(s)}
                  className={`w-full text-left px-3 py-2 rounded text-sm border ${isSelected ? "bg-orange-50 border-orange-400 text-orange-700 font-medium" : "border-gray-200 text-gray-700 hover:bg-gray-50"}`}
                >
                  {label}
                </button>
              );
            })
          )}
        </div>
        {selected && (
          <div className="px-3 pb-3">
            <button
              onClick={() => onSelect(selected)}
              className="w-full bg-orange-500 text-white py-2 rounded text-sm font-medium hover:bg-orange-600"
            >
              {t.tmsSlotConfirm}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Cart View ─────────────────────────────────────────────────────────────────

function CartView({ cart, onUpdateQty, onRemove, onCheckout, onContinueShopping, catalog, hasLg, storeName, onChangeStore, deSetupName, onUpdatePickupTime, onUpdateShipDelivery, inventory, deCarrierMethods }) {
  const { t, lang } = useLang();
  const locale = LANG_LOCALE[lang] || "en-GB";
  const subtotal = cart.reduce((s, item) => s + item.product.unit_price * item.quantity, 0);
  const [slotPickerStore, setSlotPickerStore] = useState(null); // { storeExtRef, afterISO }
  const [tmsPickerInfo, setTmsPickerInfo] = useState(null); // { methodRef, afterDate }
  const [methodPickerInfo, setMethodPickerInfo] = useState(null); // { currentMethodRef, methods: [{name,ref}], requireTms }
  const [methodPickerLoading, setMethodPickerLoading] = useState(null); // ref being resolved

  return (
    <div className="space-y-4">
      <StoreBanner catalog={catalog} hasLg={hasLg} storeName={storeName} onChangeStore={onChangeStore} />

      <h2 className="text-xl font-semibold text-gray-800">{t.ecomCartTitle}</h2>
      {cart.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <p className="text-4xl mb-3">🛒</p>
          <p>{t.ecomCartEmpty}</p>
          <button onClick={onContinueShopping} className="mt-4 text-[#00A1E0] text-sm hover:underline">{t.ecomContinueShopping}</button>
        </div>
      ) : (
        <div className="space-y-3">
          {(() => {
            // Build ordered groups: ship first, then one group per store (by storeExtRef)
            const groups = new Map();
            cart.forEach((item, i) => {
              const key = item.isBopis ? `pickup:${item.pickupStore?.storeExtRef || ""}:${item.pickupStore?.isTransfer ? "transfer" : "pickup"}` : "ship";
              if (!groups.has(key)) {
                if (key === "ship") {
                  groups.set(key, { label: t.ecomGroupShip, isPickup: false, isTransfer: false, storeExtRef: null, items: [] });
                } else {
                  const isTransfer = item.pickupStore?.isTransfer || false;
                  groups.set(key, { label: t.ecomGroupPickup(item.pickupStore?.storeName || ""), isPickup: true, isTransfer, storeExtRef: item.pickupStore?.storeExtRef || "", items: [] });
                }
              }
              groups.get(key).items.push({ item, globalIndex: i });
            });
            // Ship group first, then pickup groups
            const ordered = [
              ...(groups.has("ship") ? [["ship", groups.get("ship")]] : []),
              ...[...groups.entries()].filter(([k]) => k !== "ship"),
            ];
            return ordered.map(([key, group]) => {
              // For pickup groups: find the latest pickupTime across all items in this group
              let latestSlotISO = null;
              if (group.isPickup) {
                for (const { item } of group.items) {
                  const t2 = item.pickupStore?.pickupTime;
                  if (t2 && (!latestSlotISO || new Date(t2) > new Date(latestSlotISO))) latestSlotISO = t2;
                }
              }
              const latestDt = latestSlotISO ? new Date(latestSlotISO) : null;
              const dateLabel = latestDt ? latestDt.toLocaleDateString(locale, { weekday: "short", day: "numeric", month: "short" }) : null;
              const timeLabel = latestDt ? latestDt.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" }) : null;

              // For ship groups: collect TMS booking info (from first item that has homeDelivery)
              let shipMethodName = null;
              let shipMethodRef = null;
              let tmsBooking = null;
              let requireTmsInGroup = false;
              let deMaxByMethod = {}; // ref → ISO string — all methods from PDP
              if (!group.isPickup) {
                for (const { item } of group.items) {
                  if (item.product?.require_tms_booking) requireTmsInGroup = true;
                  if (item.homeDelivery?.shippingMethod) {
                    shipMethodName = item.homeDelivery.shippingMethodName || item.homeDelivery.shippingMethod;
                    shipMethodRef = item.homeDelivery.shippingMethod;
                    tmsBooking = item.homeDelivery.tmsBooking || null;
                    // allDeMax contains dates for all methods computed on PDP
                    if (item.homeDelivery.allDeMax) deMaxByMethod = { ...deMaxByMethod, ...item.homeDelivery.allDeMax };
                    if (item.homeDelivery.estimatedDeliveryMax)
                      deMaxByMethod[item.homeDelivery.shippingMethod] = item.homeDelivery.estimatedDeliveryMax;
                  }
                }
              }
              const tmsDate = tmsBooking ? new Date(tmsBooking.date + "T00:00:00") : null;
              const tmsDateLabel = tmsDate ? tmsDate.toLocaleDateString(locale, { weekday: "short", day: "numeric", month: "short" }) : null;

              return (
                <div key={key} className="border rounded-lg overflow-hidden">
                  {/* Group header */}
                  <div className={`px-3 py-2 border-b ${group.isPickup ? "bg-green-50 border-green-100" : "bg-blue-50 border-blue-100"}`}>
                    <div className={`flex items-center gap-2 text-xs font-semibold ${group.isPickup ? "text-green-800" : "text-blue-700"}`}>
                      {group.isPickup ? (
                        <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5 shrink-0" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd"/>
                        </svg>
                      ) : (
                        <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5 shrink-0" viewBox="0 0 20 20" fill="currentColor">
                          <path d="M8 16.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0zM15 16.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z"/>
                          <path d="M3 4a1 1 0 00-1 1v1a1 1 0 001 1h1.22l1.3 5.15A2 2 0 007.46 14h5.08a2 2 0 001.93-1.47L16.12 7H17a1 1 0 000-2H3z"/>
                        </svg>
                      )}
                      <span className="flex-1">{group.label}</span>
                      {!group.isPickup && shipMethodName && (
                        <span className="text-[10px] font-normal bg-blue-100 text-blue-700 rounded px-1.5 py-0.5">{shipMethodName}</span>
                      )}
                      {!group.isPickup && Array.isArray(deCarrierMethods) && deCarrierMethods.length > 1 && (
                        <button
                          type="button"
                          onClick={() => setMethodPickerInfo({
                            currentMethodRef: shipMethodRef,
                            methods: deCarrierMethods,
                            requireTms: requireTmsInGroup,
                            skus: group.items.map(({ item }) => ({ sku: item.product.sku, qty: item.quantity })),
                            deMaxByMethod,
                          })}
                          className="text-[10px] text-[#00A1E0] hover:underline font-medium shrink-0"
                        >
                          Change method
                        </button>
                      )}
                    </div>
                    {/* Pickup slot line */}
                    {group.isPickup && latestDt && (
                      <div className="flex items-center gap-2 mt-1.5">
                        <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5 text-green-600 shrink-0" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd"/>
                        </svg>
                        <span className="text-xs text-green-700 font-medium">{t.ecomPickupSlot(dateLabel, timeLabel)}</span>
                        <button
                          type="button"
                          onClick={() => setSlotPickerStore({ storeExtRef: group.storeExtRef, afterISO: latestSlotISO })}
                          className="ml-auto text-[10px] text-[#00A1E0] hover:underline font-medium shrink-0"
                        >
                          {t.ecomChangeSlot}
                        </button>
                      </div>
                    )}
                    {/* TMS booking line */}
                    {!group.isPickup && tmsBooking && (
                      <div className="flex items-center gap-2 mt-1.5">
                        <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5 text-orange-500 shrink-0" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd"/>
                        </svg>
                        <span className="text-xs text-orange-700 font-medium">
                          📦 {tmsDateLabel} {tmsBooking.windowStart}–{tmsBooking.windowEnd}
                        </span>
                        <button
                          type="button"
                          onClick={() => setTmsPickerInfo({ methodRef: shipMethodRef, afterDate: deMaxByMethod[shipMethodRef] ? new Date(deMaxByMethod[shipMethodRef]) : (tmsDate || new Date()) })}
                          className="ml-auto text-[10px] text-[#00A1E0] hover:underline font-medium shrink-0"
                        >
                          Change slot
                        </button>
                      </div>
                    )}
                  </div>
                  {/* Items */}
                  <div className="divide-y">
                    {group.items.map(({ item, globalIndex }) => (
                      <div key={globalIndex} className="flex items-center gap-4 p-3 bg-white">
                        <WirePlaceholder className="w-16 h-16 shrink-0">📷</WirePlaceholder>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm text-gray-800 truncate">{item.product.name}</p>
                          <p className="text-xs text-gray-400">SKU: {item.product.sku}</p>
                          <p className="text-sm font-semibold text-gray-700 mt-0.5">${item.product.unit_price.toFixed(2)}</p>
                        </div>
                        <div className="flex items-center border rounded">
                          <button onClick={() => onUpdateQty(globalIndex, Math.max(1, item.quantity - 1))}
                            className="px-2 py-1 text-gray-500 hover:bg-gray-100">−</button>
                          <input
                            type="number" min="1"
                            max={inventory?.[item.product.sku]?.ato ?? undefined}
                            value={item.quantity}
                            onChange={(e) => {
                              const maxQty = inventory?.[item.product.sku]?.ato ?? Infinity;
                              onUpdateQty(globalIndex, Math.min(Math.max(1, parseInt(e.target.value) || 1), maxQty));
                            }}
                            className="w-12 text-center text-sm border-x py-1"
                          />
                          <button onClick={() => {
                              const maxQty = inventory?.[item.product.sku]?.ato ?? Infinity;
                              onUpdateQty(globalIndex, Math.min(item.quantity + 1, maxQty));
                            }}
                            className="px-2 py-1 text-gray-500 hover:bg-gray-100">+</button>
                        </div>
                        <p className="text-sm font-bold w-20 text-right">${(item.product.unit_price * item.quantity).toFixed(2)}</p>
                        <button onClick={() => onRemove(globalIndex)} className="text-gray-300 hover:text-red-400 ml-1">✕</button>
                      </div>
                    ))}
                  </div>
                </div>
              );
            });
          })()}

          <div className="border rounded-lg p-4 bg-gray-50 space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">{t.ecomSubtotal}</span>
              <span className="font-semibold">${subtotal.toFixed(2)}</span>
            </div>
            <div className="border-t pt-3 flex justify-between text-base font-bold">
              <span>{t.ecomTotal}</span>
              <span>${subtotal.toFixed(2)}</span>
            </div>
            <button onClick={onCheckout}
              className="w-full bg-[#00A1E0] text-white py-2.5 rounded font-medium hover:bg-[#0086b3] transition-colors">
              {t.ecomProceedToCheckout}
            </button>
            <button onClick={onContinueShopping}
              className="w-full border rounded py-2 text-sm text-gray-600 hover:bg-gray-50">
              {t.ecomContinueShopping}
            </button>
          </div>
        </div>
      )}

      {slotPickerStore && (
        <SlotPickerModal
          storeExtRef={slotPickerStore.storeExtRef}
          afterISO={slotPickerStore.afterISO}
          onSelect={(newISO) => {
            onUpdatePickupTime(slotPickerStore.storeExtRef, newISO);
            setSlotPickerStore(null);
          }}
          onClose={() => setSlotPickerStore(null)}
        />
      )}

      {tmsPickerInfo && (
        <TmsBookingPickerModal
          methodRef={tmsPickerInfo.methodRef}
          afterDate={tmsPickerInfo.afterDate}
          onSelect={(newBooking) => {
            onUpdateShipDelivery({ tmsBooking: newBooking });
            setTmsPickerInfo(null);
          }}
          onClose={() => setTmsPickerInfo(null)}
        />
      )}

      {methodPickerInfo && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm overflow-hidden">
            <div className="bg-[#00A1E0] px-4 py-3 flex items-center justify-between">
              <h3 className="text-white font-semibold text-sm">Change shipping method</h3>
              <button onClick={() => setMethodPickerInfo(null)} className="text-white/80 hover:text-white text-lg leading-none">✕</button>
            </div>
            <div className="p-4 space-y-2">
              {methodPickerInfo.methods.map((m) => {
                const isCurrent = m.ref === methodPickerInfo.currentMethodRef;
                const isLoading = methodPickerLoading === m.ref;
                return (
                  <button
                    key={m.ref}
                    type="button"
                    disabled={isLoading}
                    onClick={async () => {
                      if (isCurrent) { setMethodPickerInfo(null); return; }
                      // Apply method change immediately, then resolve TMS slot in background
                      let deMax = null;
                      if (methodPickerInfo.requireTms) {
                        setMethodPickerLoading(m.ref);
                        const knownMax = (methodPickerInfo.deMaxByMethod || {})[m.ref];
                        if (knownMax) {
                          deMax = knownMax;
                        } else {
                          try {
                            const skus = (methodPickerInfo.skus || []);
                            const deRes = await api.post("/delivery-estimate", {
                              operation: "delivery-date",
                              deliveryEstimationSetupName: deSetupName,
                              shippingCarrier: { name: catalog?.de_carrier_name || "", methods: [{ name: m.ref }] },
                              products: skus.map(({ sku, qty }) => ({ stockKeepingUnit: sku, quantity: qty })),
                              deliveryAddress: { country: "", state: "", city: "", postalCode: "" },
                            });
                            const estimates = deRes.data?.result?.deliveryEstimates || [];
                            outer: for (const dg of estimates)
                              for (const grp of dg.deliveryEstimateGroup || [])
                                for (const sm of grp.shippingMethods || [])
                                  if (sm.estimatedDeliveryDate?.max) { deMax = sm.estimatedDeliveryDate.max; break outer; }
                          } catch { /* use today as fallback */ }
                        }
                        setMethodPickerLoading(null);
                      }
                      // Close modal and update method immediately — slot search happens after
                      const afterDate = deMax ? new Date(deMax) : new Date();
                      const newDeMax = { ...(methodPickerInfo.deMaxByMethod || {}), ...(deMax ? { [m.ref]: deMax } : {}) };
                      onUpdateShipDelivery({ shippingMethod: m.ref, shippingMethodName: m.name, tmsBooking: null, estimatedDeliveryMax: deMax || null, allDeMax: newDeMax });
                      setMethodPickerInfo(null);
                      // Find slot async without blocking UI
                      if (methodPickerInfo.requireTms) {
                        findFirstAvailableTmsSlot(m.ref, afterDate).then((slot) => {
                          if (slot) onUpdateShipDelivery({ tmsBooking: slot });
                        }).catch(() => {});
                      }
                    }}
                    className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg border text-sm transition-colors ${
                      isCurrent
                        ? "border-[#00A1E0] bg-blue-50 text-[#00A1E0] font-medium"
                        : "border-gray-200 hover:border-[#00A1E0] hover:bg-blue-50 text-gray-700"
                    }`}
                  >
                    <span>{m.name}</span>
                    {isCurrent && <span className="text-[10px] bg-[#00A1E0] text-white rounded px-1.5 py-0.5">Selected</span>}
                    {isLoading && <span className="text-[10px] text-gray-400">Searching slot…</span>}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Build pendingRestore from cart ────────────────────────────────────────────
// Translates ecom cart into a CreateOrderForm-compatible pendingRestore object.
// Uses catalog checkout defaults to pre-fill webstore, delivery methods, shipping charges.
// Ship items → delivery group with lgExtRef + standard DM
// Pickup items → one group per store with storeId + storeExtRef + pickup DM

function buildCheckoutRestore(cart, catalog, lgId, lgExtRef, locations = []) {
  const c = catalog || {};
  const today = new Date().toISOString().split("T")[0];

  // Collect distinct groups in order: ship first, then pickup stores
  // Key includes isTransfer so same store with pickup vs transfer gets separate DGs
  const groupKeys = [];
  const groupMeta = {};
  for (const item of cart) {
    const key = item.isBopis ? `pickup:${item.pickupStore?.storeExtRef || ""}:${item.pickupStore?.isTransfer ? "transfer" : "pickup"}` : "ship";
    if (!groupKeys.includes(key)) {
      groupKeys.push(key);
      if (item.isBopis) {
        groupMeta[key] = {
          isPickup: true,
          isTransfer: item.pickupStore?.isTransfer || false,
          storeId: item.pickupStore?.storeId || "",
          storeExtRef: item.pickupStore?.storeExtRef || "",
          storeName: item.pickupStore?.storeName || "",
          pickupTime: item.pickupStore?.pickupTime || null,
        };
      } else {
        // Capture home delivery selection (shipping method + TMS booking) from first ship item
        groupMeta[key] = {
          isPickup: false,
          shippingMethod: item.homeDelivery?.shippingMethod || null,
          shippingMethodName: item.homeDelivery?.shippingMethodName || null,
          tmsBooking: item.homeDelivery?.tmsBooking || null,
        };
      }
    }
  }

  const emptyDg = () => ({
    order_delivery_method_id: "",
    location_group_id: "",
    location_group_ext_ref: "",
    reserved_at_location_id: "",
    location_ext_ref: "",
    shipping_name: "",
    shipping_email: "",
    shipping_phone: "",
    shipping_street: "",
    shipping_city: "",
    shipping_state: "",
    shipping_state_code: "",
    shipping_postal_code: "",
    shipping_country: "",
    shipping_country_code: "",
    shipping_unit_price: 0,
    shipping_gross_unit_price: 0,
    shipping_tax_amount: 0,
    shipping_tax_rate: 5,
  });

  const deliveryGroups = groupKeys.map((key) => {
    const meta = groupMeta[key];
    const dg = emptyDg();
    if (meta.isPickup) {
      dg.order_delivery_method_id = meta.isTransfer
        ? (c.transfer_delivery_method_id || "")
        : (c.pickup_delivery_method_id || "");
      if (meta.isTransfer) {
        dg.location_group_id = lgId || "";
        dg.location_group_ext_ref = lgExtRef || "";
      }
      dg.reserved_at_location_id = meta.isTransfer ? "" : meta.storeId;
      dg.location_ext_ref = meta.storeExtRef;
      dg.shipping_name = meta.storeName;
      dg.shipping_unit_price = meta.isTransfer
        ? (c.transfer_shipping_unit_price ?? 0)
        : (c.pickup_shipping_unit_price ?? 0);
      dg.shipping_tax_rate = meta.isTransfer
        ? (c.transfer_shipping_tax_rate ?? 5)
        : (c.pickup_shipping_tax_rate ?? 5);
      if (meta.pickupTime) dg.pickup_time = meta.pickupTime;
      const loc = locations.find(
        (l) => l.Id === meta.storeId || l.ExternalReference === meta.storeExtRef
      );
      const va = loc?.VisitorAddress;
      if (va) {
        dg.shipping_street = va.Street || "";
        dg.shipping_city = va.City || "";
        dg.shipping_state_code = va.StateCode || "";
        dg.shipping_postal_code = va.PostalCode || "";
        dg.shipping_country_code = va.CountryCode || "";
      }
    } else {
      // Use the selected shipping method's delivery method if available, else catalog standard
      const hd = meta;
      dg.order_delivery_method_id = c.standard_delivery_method_id || "";
      dg.location_group_id = lgId || "";
      dg.location_group_ext_ref = lgExtRef || "";
      dg.shipping_unit_price = c.standard_shipping_unit_price ?? 0;
      dg.shipping_tax_rate = c.standard_shipping_tax_rate ?? 5;
      if (hd.tmsBooking) {
        dg.tms_booking_date = hd.tmsBooking.date;
        dg.tms_booking_window_start = hd.tmsBooking.windowStart;
        dg.tms_booking_window_end = hd.tmsBooking.windowEnd || null;
        dg.tms_shipping_method_ref = hd.shippingMethod || null;
        dg.tms_shipping_method_name = hd.shippingMethodName || null;
      }
    }
    return dg;
  });

  const taxRate = c.default_tax_rate ?? 0;
  const round2 = (v) => Math.round(v * 100) / 100;

  const products = cart.map((item) => {
    const key = item.isBopis ? `pickup:${item.pickupStore?.storeExtRef || ""}:${item.pickupStore?.isTransfer ? "transfer" : "pickup"}` : "ship";
    const dgIndex = groupKeys.indexOf(key);
    const price = item.product.unit_price;
    const tax = round2(price * taxRate / 100);
    const gross = round2(price + tax);
    return {
      catalog_product_id: item.product.id,
      product2_id: item.product.sku,
      product_code: item.product.sku,
      product_name: item.product.name,
      description: item.product.name,
      sku: item.product.sku,
      quantity: item.quantity,
      unit_price: price,
      gross_unit_price: gross,
      list_price: price,
      tax_amount: round2(tax * item.quantity),
      tax_rate: taxRate,
      discount_amount: 0,
      discount_tax_amount: 0,
      delivery_group_index: dgIndex >= 0 ? dgIndex : 0,
      reserved_at_location_id: (item.isBopis && !item.pickupStore?.isTransfer) ? (item.pickupStore?.storeId || "") : "",
      location_ext_ref: (item.isBopis && !item.pickupStore?.isTransfer) ? (item.pickupStore?.storeExtRef || "") : "",
      location_group_ext_ref: item.isBopis ? (item.pickupStore?.isTransfer ? (lgExtRef || "") : "") : (lgExtRef || ""),
      l1_category: "",
      l2_category: "",
      variation_color: "",
      variation_size: "",
    };
  });

  return {
    form: {
      order_reference: "",
      oci_action_request_id: "",
      catalog_id: c.id || null,
      ordered_date: today,
      currency_iso_code: "",
      tax_locale_type: "Net",
      webstore_id: c.webstore_id || "",
      sales_channel_id: c.sales_channel_id || "",
      payment_gateway_id: c.payment_gateway_id || "",
      first_name: "",
      last_name: "",
      billing_email: "",
      billing_phone: "",
      billing_street: "",
      billing_street2: "",
      billing_city: "",
      billing_state: "",
      billing_state_code: "",
      billing_postal_code: "",
      billing_country: "",
      billing_country_code: "",
      gateway_token: "undefined",
      card_type: "Visa",
      card_holder_name: "",
      masked_card_number: "************1111",
      expiry_year: "2030",
      expiry_month: "7",
      card_category: "CreditCard",
      processing_mode: "External",
      promotion_id: "",
      promotion_name: "",
      promotion_display_name: "",
      promotion_description: "",
      promotion_start_date: today,
      promotion_end_date: today,
      _deliveryGroups: deliveryGroups,
    },
    products,
    account: null,
  };
}

// ── Result View ───────────────────────────────────────────────────────────────

function ResultView({ result, onReset }) {
  const { t } = useLang();
  const orderId = result?.orderId || result?.OrderId || result?.id || result?.Id || "—";
  const orderNumber = result?.orderNumber || result?.OrderNumber || orderId;

  return (
    <div className="space-y-6">
      <div className="bg-green-50 border-2 border-green-200 rounded-xl p-6 text-center space-y-3">
        <div className="text-5xl">✅</div>
        <h2 className="text-2xl font-bold text-green-800">{t.ecomOrderPlaced}</h2>
        <p className="text-green-700">{t.ecomThankYou}</p>
        {orderNumber !== "—" && (
          <p className="text-sm text-green-600 font-mono bg-green-100 rounded px-3 py-1 inline-block">
            {t.ecomOrderNumber(orderNumber)}
          </p>
        )}
      </div>
      <WirePlaceholder className="h-16">
        <div className="text-center">
          <p className="text-xs text-gray-400">Order confirmation / tracking links</p>
        </div>
      </WirePlaceholder>
      <button onClick={onReset}
        className="w-full bg-[#00A1E0] text-white py-2.5 rounded font-medium hover:bg-[#0086b3] transition-colors">
        {t.ecomPlaceAnother}
      </button>
    </div>
  );
}

// ── Main EcomForm ─────────────────────────────────────────────────────────────

export default function EcomForm() {
  const { t } = useLang();
  const [view, setView] = useState(() => sessionStorage.getItem(SESSION_VIEW) || "catalog-select");

  const [catalog, setCatalog] = useState(() => {
    const id = sessionStorage.getItem(SESSION_CATALOG_ID);
    const name = sessionStorage.getItem(SESSION_CATALOG_NAME);
    const logo = sessionStorage.getItem(SESSION_CATALOG_LOGO) || "";
    const deSetupName = sessionStorage.getItem(SESSION_CATALOG_DE) || "";
    let defaults = {};
    try { defaults = JSON.parse(sessionStorage.getItem(SESSION_CATALOG_DEFAULTS) || "{}"); } catch {}
    return id ? { id: Number(id), name: name || "", logo, de_setup_name: deSetupName, ...defaults } : null;
  });

  const [lgId, setLgId]         = useState(() => sessionStorage.getItem(SESSION_LG_ID) || "");
  const [lgName, setLgName]     = useState(() => sessionStorage.getItem(SESSION_LG_NAME) || "");
  const [lgExtRef, setLgExtRef] = useState(() => sessionStorage.getItem(SESSION_LG_EXT_REF) || "");
  const [storeId, setStoreId]   = useState(() => sessionStorage.getItem(SESSION_STORE_ID) || "");
  const [storeName, setStoreName]   = useState(() => sessionStorage.getItem(SESSION_STORE_NAME) || "");
  const [storeExtRef, setStoreExtRef] = useState(() => sessionStorage.getItem(SESSION_STORE_EXT_REF) || "");
  const [storePickerOpen, setStorePickerOpen] = useState(false);

  const [products, setProducts]     = useState([]);
  const [categories, setCategories] = useState([]);
  const [activeCategoryId, setActiveCategoryId] = useState(() => {
    const v = sessionStorage.getItem(SESSION_CATEGORY);
    return v ? Number(v) : null;
  });
  const [cart, setCart] = useState(() => {
    try { return JSON.parse(sessionStorage.getItem(SESSION_CART) || "[]"); } catch { return []; }
  });
  const [selectedProduct, setSelectedProduct] = useState(() => {
    try { return JSON.parse(sessionStorage.getItem(SESSION_PRODUCT) || "null"); } catch { return null; }
  });
  const [checkoutResult, setCheckoutResult] = useState(null);
  const [checkoutRestore, setCheckoutRestore] = useState(null);

  // Inventory — fetched at this level, shared between PLP and PDP
  const [inventory, setInventory] = useState(null);
  const [inventoryLoading, setInventoryLoading] = useState(false);

  // Refs so refreshInventory always reads current values regardless of closure age
  const productsRef = useRef(products);
  const lgExtRefRef = useRef(lgExtRef);
  useEffect(() => { productsRef.current = products; }, [products]);
  useEffect(() => { lgExtRefRef.current = lgExtRef; }, [lgExtRef]);

  // Monotonic counter: only the call with the highest sequence number may write inventory.
  // Prevents a slow background refresh from overwriting a newer result.
  const refreshSeqRef = useRef(0);

  // Soft reservations — { [productId]: { reservationId, isBopis, locationIdentifier, locationGroupIdentifier } }
  const [reservations, setReservations] = useState(() => {
    try { return JSON.parse(sessionStorage.getItem(SESSION_RESERVATIONS) || "{}"); } catch { return {}; }
  });

  const reservationsRef = useRef(reservations);
  const saveReservations = (r) => {
    reservationsRef.current = r;
    setReservations(r);
    sessionStorage.setItem(SESSION_RESERVATIONS, JSON.stringify(r));
  };

  const navTo = (v) => {
    setView(v);
    sessionStorage.setItem(SESSION_VIEW, v);
  };

  const saveCart = (updater) => {
    setCart((prev) => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      sessionStorage.setItem(SESSION_CART, JSON.stringify(next));
      return next;
    });
  };

  const saveCategory = (id) => {
    setActiveCategoryId(id);
    if (id !== null) sessionStorage.setItem(SESSION_CATEGORY, String(id));
    else sessionStorage.removeItem(SESSION_CATEGORY);
  };

  const saveProduct = (p) => {
    setSelectedProduct(p);
    if (p) sessionStorage.setItem(SESSION_PRODUCT, JSON.stringify(p));
    else sessionStorage.removeItem(SESSION_PRODUCT);
  };

  // Load products/categories when catalog is set
  useEffect(() => {
    if (!catalog) { setProducts([]); setCategories([]); return; }
    cachedGet(`/catalogs/${catalog.id}/products`).then(setProducts).catch(() => {});
    api.get(`/catalogs/${catalog.id}/categories`).then((r) => setCategories(r.data)).catch(() => {});
  }, [catalog]);

  const refreshInventory = async (skuList, lgRef) => {
    const seq = ++refreshSeqRef.current;
    const skus = skuList ?? [...new Set(productsRef.current.map((p) => p.sku).filter(Boolean))];
    const lg = lgRef ?? lgExtRefRef.current;
    if (!skus.length || !lg) { setInventory(null); setInventoryLoading(false); return; }
    setInventoryLoading(true);
    try {
      const r = await api.post("/oci/availability/plp", { skus, location_group_ext_ref: lg });
      if (seq < refreshSeqRef.current) return;
      setInventory(r.data && typeof r.data === "object" ? r.data : {});
      setInventoryLoading(false);
    } catch (err) {
      if (seq >= refreshSeqRef.current) {
        addLog({ type: "error", label: "OCI PLP inventory error", body: err?.response?.data || err?.message || String(err) });
        setInventoryLoading(false);
        // keep existing inventory on error — don't wipe optimistic state
      }
    }
  };

  // Fetch OCI inventory whenever products or lg changes — always from location group
  useEffect(() => {
    if (!products.length) { setInventory(null); setInventoryLoading(false); return; }
    refreshInventory();
  }, [products, lgExtRef]);

  // Refresh inventory when navigating to PLP or PDP (stock may have changed)
  useEffect(() => {
    if ((view === "plp" || view === "pdp") && productsRef.current.length) {
      refreshInventory();
    }
  }, [view]);

  // Poll inventory every 60s while on PLP or PDP — aligns with OCI cache TTL
  useEffect(() => {
    if (view !== "plp" && view !== "pdp") return;
    const id = setInterval(() => {
      if (productsRef.current.length && lgExtRefRef.current) refreshInventory();
    }, 60_000);
    return () => clearInterval(id);
  }, [view]);

  const applyLg = (id, name, extRef) => {
    setLgId(id); setLgName(name); setLgExtRef(extRef);
    if (id) sessionStorage.setItem(SESSION_LG_ID, id); else sessionStorage.removeItem(SESSION_LG_ID);
    if (name) sessionStorage.setItem(SESSION_LG_NAME, name); else sessionStorage.removeItem(SESSION_LG_NAME);
    if (extRef) sessionStorage.setItem(SESSION_LG_EXT_REF, extRef); else sessionStorage.removeItem(SESSION_LG_EXT_REF);
  };

  const resolveAndApplyLg = async (lgId, lgName, knownExtRef) => {
    if (!lgId) { applyLg("", "", ""); return; }
    if (knownExtRef) { applyLg(lgId, lgName, knownExtRef); return; }
    const groups = await cachedGet("/oci/location-groups").catch(() => []);
    const found = groups.find((g) => g.Id === lgId);
    applyLg(lgId, lgName, found?.ExternalReference || "");
  };

  const refreshCatalogFromApi = (catalogId) => {
    api.get(`/catalogs/${catalogId}`)
      .then((r) => {
        const fresh = r.data;
        setCatalog((prev) => (prev?.id === catalogId ? { ...prev, ...fresh } : prev));
        sessionStorage.setItem(SESSION_CATALOG_DEFAULTS, JSON.stringify({
          webstore_id: fresh.webstore_id || "",
          sales_channel_id: fresh.sales_channel_id || "",
          payment_gateway_id: fresh.payment_gateway_id || "",
          pickup_delivery_method_id: fresh.pickup_delivery_method_id || "",
          pickup_shipping_unit_price: fresh.pickup_shipping_unit_price ?? 0,
          pickup_shipping_tax_rate: fresh.pickup_shipping_tax_rate ?? 5,
          transfer_delivery_method_id: fresh.transfer_delivery_method_id || "",
          transfer_shipping_unit_price: fresh.transfer_shipping_unit_price ?? 0,
          transfer_shipping_tax_rate: fresh.transfer_shipping_tax_rate ?? 5,
          standard_delivery_method_id: fresh.standard_delivery_method_id || "",
          standard_shipping_unit_price: fresh.standard_shipping_unit_price ?? 0,
          standard_shipping_tax_rate: fresh.standard_shipping_tax_rate ?? 5,
          default_tax_rate: fresh.default_tax_rate ?? 0,
          de_carrier_name: fresh.de_carrier_name || "",
          de_carrier_methods: Array.isArray(fresh.de_carrier_methods) ? fresh.de_carrier_methods : [],
          de_default_country: fresh.de_default_country || "",
          de_default_postal_code: fresh.de_default_postal_code || "",
        }));
      })
      .catch(() => {});
  };

  useEffect(() => {
    if (catalog) {
      navTo("plp");
      if (lgId && !lgExtRef) resolveAndApplyLg(lgId, lgName, "");
      refreshCatalogFromApi(catalog.id);
    }
  }, []);

  // Reload when CatalogPanel saves the active catalog
  useEffect(() => {
    const handler = (e) => {
      const savedId = e.detail?.id;
      setCatalog((current) => {
        if (current && (savedId === null || savedId === current.id)) {
          refreshCatalogFromApi(current.id);
        }
        return current;
      });
    };
    window.addEventListener("catalog-saved", handler);
    return () => window.removeEventListener("catalog-saved", handler);
  }, []);

  const selectCatalog = async (cat) => {
    setCatalog(cat);
    saveCart([]);
    saveCategory(null);
    saveProduct(null);
    setInventory(null);
    setInventoryLoading(true);
    sessionStorage.setItem(SESSION_CATALOG_ID, String(cat.id));
    sessionStorage.setItem(SESSION_CATALOG_NAME, cat.name);
    sessionStorage.setItem(SESSION_CATALOG_LOGO, cat.logo || "");
    sessionStorage.setItem(SESSION_CATALOG_DE, cat.de_setup_name || "");
    sessionStorage.setItem(SESSION_CATALOG_DEFAULTS, JSON.stringify({
      webstore_id: cat.webstore_id || "",
      sales_channel_id: cat.sales_channel_id || "",
      payment_gateway_id: cat.payment_gateway_id || "",
      pickup_delivery_method_id: cat.pickup_delivery_method_id || "",
      pickup_shipping_unit_price: cat.pickup_shipping_unit_price ?? 0,
      pickup_shipping_tax_rate: cat.pickup_shipping_tax_rate ?? 5,
      transfer_delivery_method_id: cat.transfer_delivery_method_id || "",
      transfer_shipping_unit_price: cat.transfer_shipping_unit_price ?? 0,
      transfer_shipping_tax_rate: cat.transfer_shipping_tax_rate ?? 5,
      standard_delivery_method_id: cat.standard_delivery_method_id || "",
      standard_shipping_unit_price: cat.standard_shipping_unit_price ?? 0,
      standard_shipping_tax_rate: cat.standard_shipping_tax_rate ?? 5,
      de_carrier_name: cat.de_carrier_name || "",
      de_carrier_methods: Array.isArray(cat.de_carrier_methods) ? cat.de_carrier_methods : [],
      de_default_country: cat.de_default_country || "",
      de_default_postal_code: cat.de_default_postal_code || "",
    }));
    setStoreId(""); setStoreName(""); setStoreExtRef("");
    sessionStorage.removeItem(SESSION_STORE_ID);
    sessionStorage.removeItem(SESSION_STORE_NAME);
    sessionStorage.removeItem(SESSION_STORE_EXT_REF);
    await resolveAndApplyLg(cat.location_group_id || "", cat.location_group_name || "", cat.location_group_ext_ref || "");
    navTo("plp");
  };

  const deselectCatalog = () => {
    setCatalog(null);
    saveCart([]); saveCategory(null); saveProduct(null);
    setProducts([]); setCategories([]); setInventory(null); setInventoryLoading(false); saveReservations({});
    sessionStorage.removeItem(SESSION_CATALOG_ID);
    sessionStorage.removeItem(SESSION_CATALOG_NAME);
    sessionStorage.removeItem(SESSION_CATALOG_LOGO);
    sessionStorage.removeItem(SESSION_CATALOG_DE);
    sessionStorage.removeItem(SESSION_CATALOG_DEFAULTS);
    sessionStorage.removeItem(SESSION_LG_ID);
    sessionStorage.removeItem(SESSION_LG_NAME);
    sessionStorage.removeItem(SESSION_LG_EXT_REF);
    sessionStorage.removeItem(SESSION_STORE_ID);
    sessionStorage.removeItem(SESSION_STORE_NAME);
    sessionStorage.removeItem(SESSION_STORE_EXT_REF);
    setLgId(""); setLgName(""); setLgExtRef("");
    setStoreId(""); setStoreName(""); setStoreExtRef("");
    navTo("catalog-select");
  };

  const handleSelectStore = (newStoreId, newStoreName, newStoreExtRef) => {
    setStoreId(newStoreId || "");
    setStoreName(newStoreName || "");
    setStoreExtRef(newStoreExtRef || "");
    if (newStoreId) {
      sessionStorage.setItem(SESSION_STORE_ID, newStoreId);
      sessionStorage.setItem(SESSION_STORE_NAME, newStoreName || "");
      sessionStorage.setItem(SESSION_STORE_EXT_REF, newStoreExtRef || "");
    } else {
      sessionStorage.removeItem(SESSION_STORE_ID);
      sessionStorage.removeItem(SESSION_STORE_NAME);
      sessionStorage.removeItem(SESSION_STORE_EXT_REF);
    }
    setStorePickerOpen(false);
  };

  const genRequestId = () => `${Math.random().toString(20).slice(2)}-${Date.now().toString(36)}`;

  // homeOpts = { shippingMethod, shippingMethodName, tmsBooking } — home delivery selection
  const addToCart = (product, qty = 1, pickupOpts = null, homeOpts = null) => {
    // Update cart immediately
    const isBopis = !!(pickupOpts?.isBopis && pickupOpts.storeExtRef);
    const pickupStore = isBopis ? { storeId: pickupOpts.storeId || "", storeExtRef: pickupOpts.storeExtRef, storeName: pickupOpts.storeName || "", pickupTime: pickupOpts.pickupTime || null, isTransfer: pickupOpts.isTransfer || false } : null;
    const homeDelivery = (!isBopis && homeOpts) ? { shippingMethod: homeOpts.shippingMethod || null, shippingMethodName: homeOpts.shippingMethodName || null, tmsBooking: homeOpts.tmsBooking || null, estimatedDeliveryMax: homeOpts.estimatedDeliveryMax || null, allDeMax: homeOpts.allDeMax || {} } : null;
    saveCart((prev) => {
      // Match on product + delivery mode: same product in BOPIS and home delivery = two separate lines
      const idx = prev.findIndex((item) =>
        item.product.id === product.id &&
        item.isBopis === isBopis &&
        (item.pickupStore?.storeExtRef || "") === (pickupStore?.storeExtRef || "")
      );
      if (idx >= 0) {
        const updated = [...prev];
        updated[idx] = { ...updated[idx], quantity: updated[idx].quantity + qty };
        return updated;
      }
      return [...prev, { product, quantity: qty, isBopis, pickupStore, homeDelivery }];
    });

    // Soft reservation — sync (actionRequestId needed for order), then optimistic cache update
    (async () => {
      const isTransfer = isBopis && (pickupOpts?.isTransfer || false);
      const locationIdentifier = (isBopis && !isTransfer) ? pickupOpts.storeExtRef : "";
      // Always include lgExtRef so the backend can apply the delta to both the store
      // cache entry and the LG cache entry used by the PLP.
      const locationGroupIdentifier = (lgExtRef || "");
      if (locationIdentifier || locationGroupIdentifier) {
        try {
          const reservationId = genRequestId();
          const res = await api.post("/oci/reservations", {
            action_request_id: reservationId,
            items: [{ sku: product.sku, quantity: qty, location_identifier: locationIdentifier, location_group_identifier: locationGroupIdentifier }],
          });
          addLog({ type: "preview", label: "OCI Soft Reservation", body: res.data });
          saveReservations({ ...reservationsRef.current, [product.id]: { reservationId, isBopis, locationIdentifier, locationGroupIdentifier, quantity: qty } });
          // Optimistic inventory update — backend already applied delta to cache
          setInventory((prev) => {
            if (!prev || !prev[product.sku]) return prev;
            const cur = prev[product.sku];
            return { ...prev, [product.sku]: { aft: Math.max(0, cur.aft - qty), ato: Math.max(0, cur.ato - qty) } };
          });
        } catch (err) {
          addLog({ type: "error", label: "OCI Reservation Error", body: err?.response?.data || err?.message });
        }
      }
    })();
  };

  const updateCartQty = (i, qty) => {
    saveCart((prev) => { const u = [...prev]; u[i] = { ...u[i], quantity: qty }; return u; });
  };

  const removeFromCart = (i) => {
    // Remove from cart immediately
    const item = cart[i];
    saveCart((prev) => prev.filter((_, idx) => idx !== i));

    // Release reservation if one exists
    const res = item && reservationsRef.current[item.product.id];
    if (res) {
      const updated = { ...reservations };
      delete updated[item.product.id];
      saveReservations(updated);

      // Optimistic inventory update — stock back immediately in UI and backend cache
      const relQty = res.quantity ?? item.quantity;
      setInventory((prev) => {
        if (!prev || !prev[item.product.sku]) return prev;
        const cur = prev[item.product.sku];
        return { ...prev, [item.product.sku]: { aft: cur.aft + relQty, ato: cur.ato + relQty } };
      });

      // OCI release is fire-and-forget — backend handles it async
      api.post("/oci/releases", {
        action_request_id: res.reservationId,
        async_release: true,
        items: [{ sku: item.product.sku, quantity: relQty, location_identifier: res.locationIdentifier, location_group_identifier: lgExtRefRef.current || res.locationGroupIdentifier }],
      })
        .then((rel) => addLog({ type: "preview", label: "OCI Release", body: rel.data }))
        .catch((err) => addLog({ type: "error", label: "OCI Release Error", body: err?.response?.data || err?.message }));
    }
  };

  const resetEcom = () => {
    saveCart([]);
    setCheckoutResult(null);
    setCheckoutRestore(null);
    saveCategory(null);
    saveReservations({});
    navTo("plp");
  };

  const storeProps = {
    hasLg: !!lgId,
    storeName,
    onChangeStore: () => setStorePickerOpen(true),
    catalog,
  };

  return (
    <div className="max-w-4xl">
      {view === "catalog-select" && (
        <CatalogSelectView onSelect={selectCatalog} />
      )}

      {view === "plp" && catalog && (
        <PLPView
          {...storeProps}
          catalog={catalog}
          products={products}
          categories={categories}
          cart={cart}
          activeCategoryId={activeCategoryId}
          onSelectCategory={saveCategory}
          onAddToCart={(p) => addToCart(p, 1)}
          onGoToPDP={(p) => { saveProduct(p); navTo("pdp"); }}
          onGoToCart={() => navTo("cart")}
          onChangeCatalog={deselectCatalog}
          lgExtRef={lgExtRef}
          storeExtRef={storeExtRef}
          inventory={inventory}
          inventoryLoading={inventoryLoading}
          onRefreshInventory={refreshInventory}
        />
      )}

      {view === "pdp" && selectedProduct && (
        <PDPView
          {...storeProps}
          product={selectedProduct}
          categories={categories}
          onAddToCart={(p, qty, pickupOpts, homeOpts) => { addToCart(p, qty, pickupOpts, homeOpts); }}
          onBack={() => navTo("plp")}
          onGoToCart={() => navTo("cart")}
          cart={cart}
          inventory={inventory}
          inventoryLoading={inventoryLoading}
          onRefreshInventory={refreshInventory}
          storeId={storeId}
          storeExtRef={storeExtRef}
          lgId={lgId}
          lgExtRef={lgExtRef}
          deSetupName={catalog?.de_setup_name || ""}
          deCarrierName={catalog?.de_carrier_name || ""}
          deCarrierMethods={Array.isArray(catalog?.de_carrier_methods) ? catalog.de_carrier_methods : []}
          deDefaultCountry={catalog?.de_default_country || ""}
          deDefaultPostalCode={catalog?.de_default_postal_code || ""}
        />
      )}

      {view === "cart" && (
        <CartView
          {...storeProps}
          cart={cart}
          inventory={inventory}
          onUpdateQty={updateCartQty}
          onRemove={removeFromCart}
          onCheckout={async () => {
              let freshCatalog = catalog;
              let locations = [];
              await Promise.all([
                catalog?.id
                  ? api.get(`/catalogs/${catalog.id}`)
                      .then((r) => { freshCatalog = r.data; setCatalog(freshCatalog); })
                      .catch(() => {})
                  : Promise.resolve(),
                api.get("/oci/locations")
                  .then((r) => { locations = r.data || []; })
                  .catch(() => {}),
              ]);
              const restore = buildCheckoutRestore(cart, freshCatalog, lgId, lgExtRef, locations);
              setCheckoutRestore(restore);
              navTo("checkout");
            }}
          onContinueShopping={() => navTo("plp")}
          deSetupName={catalog?.de_setup_name || ""}
          deCarrierMethods={Array.isArray(catalog?.de_carrier_methods) ? catalog.de_carrier_methods : []}
          onUpdatePickupTime={(storeExtRef, newTime) => {
            saveCart((prev) => prev.map((item) =>
              item.isBopis && item.pickupStore?.storeExtRef === storeExtRef
                ? { ...item, pickupStore: { ...item.pickupStore, pickupTime: newTime } }
                : item
            ));
          }}
          onUpdateShipDelivery={({ shippingMethod, shippingMethodName, tmsBooking, estimatedDeliveryMax, allDeMax }) => {
            saveCart((prev) => prev.map((item) =>
              !item.isBopis
                ? { ...item, homeDelivery: {
                    ...item.homeDelivery,
                    ...(shippingMethod !== undefined ? { shippingMethod, shippingMethodName } : {}),
                    ...(tmsBooking !== undefined ? { tmsBooking } : {}),
                    ...(estimatedDeliveryMax !== undefined ? { estimatedDeliveryMax } : {}),
                    ...(allDeMax !== undefined ? { allDeMax: { ...(item.homeDelivery?.allDeMax || {}), ...allDeMax } } : {}),
                  }}
                : item
            ));
          }}
        />
      )}

      {view === "checkout" && (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => navTo("cart")}
              className="text-sm text-gray-500 hover:text-gray-700"
            >
              ← {t.ecomBackToCart}
            </button>
            <h2 className="text-xl font-semibold text-gray-800">{t.ecomCheckoutTitle}</h2>
          </div>
          <CreateOrderForm
            pendingRestore={checkoutRestore}
            onRestoreDone={() => setCheckoutRestore(null)}
            activeCatalogId={catalog?.id || null}
            onOrderCreated={(data) => {
              const result = data?.result || data;
              setCheckoutResult(result);
              saveCart([]);
              saveReservations({});
              navTo("result");
            }}
          />
        </div>
      )}

      {view === "result" && (
        <ResultView
          result={checkoutResult}
          onReset={resetEcom}
        />
      )}

      {storePickerOpen && (
        <StorePickerModal
          lgId={lgId}
          lgName={lgName}
          currentStoreId={storeId}
          currentStoreName={storeName}
          onSelect={handleSelectStore}
          onClose={() => setStorePickerOpen(false)}
        />
      )}
    </div>
  );
}
