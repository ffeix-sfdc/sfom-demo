import React, { useState } from "react";
import api from "../api/client";

const SESSION_CATALOG_DE      = "ecom_catalog_de_setup";
const SESSION_CATALOG_DEFAULTS = "ecom_catalog_defaults";

// ── Helpers ───────────────────────────────────────────────────────────────────

function Step({ label, status, children }) {
  const icon =
    status === "pending"  ? <span className="w-4 h-4 rounded-full border-2 border-gray-300 inline-block" /> :
    status === "loading"  ? <svg className="animate-spin w-4 h-4 text-[#00A1E0] shrink-0" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg> :
    status === "ok"       ? <span className="text-green-500 font-bold text-sm">✓</span> :
    status === "warn"     ? <span className="text-yellow-500 font-bold text-sm">⚠</span> :
    /* error */             <span className="text-red-500 font-bold text-sm">✕</span>;

  return (
    <div className="flex gap-2.5 items-start">
      <div className="mt-0.5 shrink-0">{icon}</div>
      <div className="flex-1 min-w-0">
        <p className={`text-xs font-medium ${status === "error" ? "text-red-600" : status === "warn" ? "text-yellow-700" : "text-gray-700"}`}>{label}</p>
        {children && <div className="mt-1">{children}</div>}
      </div>
    </div>
  );
}

function JsonBox({ data }) {
  return (
    <pre className="text-[10px] bg-gray-50 border rounded p-2 overflow-x-auto whitespace-pre-wrap break-all text-gray-600 max-h-40">
      {JSON.stringify(data, null, 2)}
    </pre>
  );
}

function Field({ label, value, mono = false }) {
  return (
    <div className="flex gap-2 text-xs">
      <span className="text-gray-400 shrink-0 w-28">{label}</span>
      <span className={`text-gray-700 truncate ${mono ? "font-mono" : ""}`}>{value || <em className="text-gray-300">—</em>}</span>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function GeoLocPanel({ open }) {
  const [running, setRunning] = useState(false);
  const [steps, setSteps] = useState(null);

  const setStep = (key, update) =>
    setSteps((prev) => ({ ...prev, [key]: { ...prev?.[key], ...update } }));

  const run = async () => {
    setRunning(true);

    // Read catalog config from sessionStorage
    let deSetupName = sessionStorage.getItem(SESSION_CATALOG_DE) || "";
    let defaults = {};
    try { defaults = JSON.parse(sessionStorage.getItem(SESSION_CATALOG_DEFAULTS) || "{}"); } catch {}
    const deDefaultCountry    = defaults.de_default_country    || "";
    const deDefaultPostalCode = defaults.de_default_postal_code || "";
    const deCarrierName       = defaults.de_carrier_name       || "";
    const deCarrierMethods    = Array.isArray(defaults.de_carrier_methods) ? defaults.de_carrier_methods : [];

    setSteps({
      catalog:   { status: "ok",      label: "Catalog config" },
      geo:       { status: "loading", label: "Geolocation (navigator.geolocation)" },
      nominatim: { status: "pending", label: "Reverse geocode (Nominatim)" },
      bopis:     { status: "pending", label: "BOPIS estimate (delivery-estimate)" },
      delivery:  { status: "pending", label: "Delivery-date estimate (delivery-estimate)" },
      resolve:   { status: "pending", label: "Resolution summary" },
    });

    // ── Step 1: Catalog ───────────────────────────────────────────────────────
    setStep("catalog", {
      status: deSetupName ? "ok" : "warn",
      data: { deSetupName, deDefaultCountry, deDefaultPostalCode, deCarrierName, methods: deCarrierMethods.map((m) => m.ref || m.name) },
    });

    // ── Step 2: Geolocation ───────────────────────────────────────────────────
    let lat = null, lng = null;
    try {
      const pos = await new Promise((res, rej) =>
        navigator.geolocation.getCurrentPosition(res, rej, { timeout: 6000 })
      );
      lat = pos.coords.latitude;
      lng = pos.coords.longitude;
      setStep("geo", { status: "ok", data: { lat, lng, accuracy: `${Math.round(pos.coords.accuracy)}m` } });
    } catch (e) {
      const msg = e?.code === 1 ? "Permission denied" : e?.code === 2 ? "Position unavailable" : e?.code === 3 ? "Timeout" : String(e);
      setStep("geo", { status: "warn", data: { error: msg, fallback: "Will use catalog defaults for address" } });
    }

    // ── Step 3: Nominatim reverse geocode ─────────────────────────────────────
    let postalCode = deDefaultPostalCode;
    let countryCode = deDefaultCountry;

    if (lat !== null && lng !== null) {
      setStep("nominatim", { status: "loading" });
      try {
        const resp = await fetch(
          `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`,
          { headers: { "Accept-Language": "en" } }
        );
        const geo = await resp.json();
        const resolvedPostal   = geo?.address?.postcode || "";
        const resolvedCountry  = geo?.address?.country_code?.toUpperCase() || "";
        setStep("nominatim", {
          status: resolvedPostal && resolvedCountry ? "ok" : "warn",
          data: {
            resolvedPostalCode: resolvedPostal || "(empty)",
            resolvedCountry:    resolvedCountry || "(empty)",
            city:               geo?.address?.city || geo?.address?.town || "(empty)",
            displayName:        geo?.display_name,
          },
        });
        if (resolvedPostal)  postalCode  = resolvedPostal;
        if (resolvedCountry) countryCode = resolvedCountry;
      } catch (e) {
        setStep("nominatim", { status: "error", data: { error: String(e), fallback: "Using catalog defaults" } });
      }
    } else {
      setStep("nominatim", { status: "warn", data: { skipped: "No GPS coordinates — using catalog defaults", country: countryCode, postalCode } });
    }

    // ── Step 4: BOPIS estimate ────────────────────────────────────────────────
    if (deSetupName && lat !== null && lng !== null) {
      setStep("bopis", { status: "loading" });
      try {
        const res = await api.post("/delivery-estimate", {
          operation: "bopis",
          deliveryEstimationSetupName: deSetupName,
          products: [{ stockKeepingUnit: "TEST-SKU", quantity: 1 }],
          locations: [],
          radius: 500,
          unit: "km",
          maxReturnedLocations: 5,
          bopisAddress: { latitude: lat, longitude: lng },
        });
        const results = res.data?.result?.results || [];
        setStep("bopis", {
          status: results.length ? "ok" : "warn",
          data: {
            locationsFound: results.length,
            locations: results.slice(0, 5).map((r) => ({
              location: r.location,
              atf: r.inventory?.availableToFulfill ?? "—",
              ato: r.inventory?.availableToOrder ?? "—",
              earliestPickup: r.inStore?.earliestPickupTime || "—",
            })),
          },
        });
      } catch (e) {
        setStep("bopis", { status: "error", data: { error: e?.response?.data?.detail || String(e) } });
      }
    } else {
      setStep("bopis", {
        status: "warn",
        data: { skipped: lat === null ? "No GPS — BOPIS radius search requires coordinates" : "No DE setup configured" },
      });
    }

    // ── Step 5: Delivery-date estimate ────────────────────────────────────────
    if (deSetupName) {
      setStep("delivery", { status: "loading" });
      const carrier = deCarrierName && deCarrierMethods.length
        ? { name: deCarrierName, methods: deCarrierMethods.map((m) => ({ name: m.ref || m.name })) }
        : undefined;
      try {
        const res = await api.post("/delivery-estimate", {
          operation: "delivery-date",
          deliveryEstimationSetupName: deSetupName,
          products: [{ stockKeepingUnit: "TEST-SKU", quantity: 1 }],
          deliveryAddress: { country: countryCode, state: "", city: "", postalCode },
          ...(carrier ? { shippingCarrier: carrier } : {}),
        });
        const estimates = res.data?.result?.deliveryEstimates || [];
        const methods = [];
        for (const dg of estimates)
          for (const grp of dg.deliveryEstimateGroup || [])
            for (const sm of grp.shippingMethods || [])
              methods.push({
                method: sm.shippingCarrierMethod,
                shipMin: sm.estimatedShipDate?.min?.slice(0, 10),
                shipMax: sm.estimatedShipDate?.max?.slice(0, 10),
                delivMin: sm.estimatedDeliveryDate?.min?.slice(0, 10),
                delivMax: sm.estimatedDeliveryDate?.max?.slice(0, 10),
              });
        setStep("delivery", {
          status: methods.length ? "ok" : "warn",
          data: { addressUsed: { country: countryCode, postalCode }, methods },
        });
      } catch (e) {
        setStep("delivery", { status: "error", data: { error: e?.response?.data?.detail || String(e), addressUsed: { country: countryCode, postalCode } } });
      }
    } else {
      setStep("delivery", { status: "warn", data: { skipped: "No DE setup configured in catalog" } });
    }

    // ── Step 6: Resolution summary ────────────────────────────────────────────
    setStep("resolve", {
      status: "ok",
      data: {
        finalCountry:    countryCode || "(empty — CDS will reject)",
        finalPostalCode: postalCode  || "(empty — CDS will reject)",
        geoAvailable:    lat !== null,
        catalogDefaults: { country: deDefaultCountry, postalCode: deDefaultPostalCode },
      },
    });

    setRunning(false);
  };

  const STEP_ORDER = ["catalog", "geo", "nominatim", "bopis", "delivery", "resolve"];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-gray-700">Geo Location Diagnostics</p>
        <button
          type="button"
          disabled={running}
          onClick={run}
          className="text-sm bg-[#00A1E0] text-white px-3 py-1.5 rounded hover:bg-[#0086b3] disabled:opacity-50"
        >
          {running ? "Running…" : steps ? "Re-run" : "Run"}
        </button>
      </div>

      <p className="text-xs text-gray-400">
        Runs each step of the geo resolution flow and shows the result. Uses <code>TEST-SKU</code> as a placeholder — inventory results may be empty.
      </p>

      {steps && (
        <div className="space-y-3">
          {STEP_ORDER.map((key) => {
            const s = steps[key];
            if (!s) return null;
            return (
              <Step key={key} label={s.label} status={s.status}>
                {s.data && (
                  key === "catalog" ? (
                    <div className="space-y-0.5">
                      <Field label="DE Setup"        value={s.data.deSetupName}        />
                      <Field label="Default Country" value={s.data.deDefaultCountry}   mono />
                      <Field label="Default Postal"  value={s.data.deDefaultPostalCode} mono />
                      <Field label="Carrier"         value={s.data.deCarrierName}       />
                      <Field label="Methods"         value={s.data.methods?.join(", ")} />
                    </div>
                  ) : key === "geo" ? (
                    s.data.error
                      ? <div className="space-y-0.5"><Field label="Error"    value={s.data.error} /><Field label="Fallback" value={s.data.fallback} /></div>
                      : <div className="space-y-0.5"><Field label="Latitude"  value={String(s.data.lat)} mono /><Field label="Longitude" value={String(s.data.lng)} mono /><Field label="Accuracy"  value={s.data.accuracy} /></div>
                  ) : key === "nominatim" ? (
                    s.data.skipped
                      ? <div className="space-y-0.5"><Field label="Skipped" value={s.data.skipped} /><Field label="Country" value={s.data.country} mono /><Field label="Postal" value={s.data.postalCode} mono /></div>
                      : <div className="space-y-0.5">
                          <Field label="Country"   value={s.data.resolvedCountry}   mono />
                          <Field label="Postal"    value={s.data.resolvedPostalCode} mono />
                          <Field label="City"      value={s.data.city}              />
                          {s.data.displayName && <p className="text-[10px] text-gray-400 truncate mt-0.5">{s.data.displayName}</p>}
                        </div>
                  ) : key === "bopis" ? (
                    s.data.skipped
                      ? <Field label="Skipped" value={s.data.skipped} />
                      : <div className="space-y-1">
                          <Field label="Locations" value={String(s.data.locationsFound)} />
                          {s.data.locations?.map((l, i) => (
                            <div key={i} className="text-[10px] font-mono bg-gray-50 border rounded px-2 py-1 space-y-0.5">
                              <div className="font-semibold text-gray-700">{l.location}</div>
                              <div className="text-gray-500">ATF: {l.atf}  ATO: {l.ato}  Pickup: {l.earliestPickup}</div>
                            </div>
                          ))}
                        </div>
                  ) : key === "delivery" ? (
                    s.data.skipped
                      ? <Field label="Skipped" value={s.data.skipped} />
                      : <div className="space-y-1">
                          <Field label="Country" value={s.data.addressUsed?.country}    mono />
                          <Field label="Postal"  value={s.data.addressUsed?.postalCode} mono />
                          {s.data.error
                            ? <JsonBox data={s.data.error} />
                            : s.data.methods?.map((m, i) => (
                                <div key={i} className="text-[10px] font-mono bg-gray-50 border rounded px-2 py-1">
                                  <div className="font-semibold text-gray-700">{m.method}</div>
                                  <div className="text-gray-500">Ship: {m.shipMin} → {m.shipMax}  Deliver: {m.delivMin} → {m.delivMax}</div>
                                </div>
                              ))
                          }
                        </div>
                  ) : key === "resolve" ? (
                    <div className="space-y-0.5">
                      <Field label="Final Country"  value={s.data.finalCountry}    mono />
                      <Field label="Final Postal"   value={s.data.finalPostalCode} mono />
                      <Field label="GPS available"  value={s.data.geoAvailable ? "Yes" : "No — using catalog defaults"} />
                      <Field label="Catalog Country" value={s.data.catalogDefaults?.country}    mono />
                      <Field label="Catalog Postal"  value={s.data.catalogDefaults?.postalCode} mono />
                    </div>
                  ) : null
                )}
              </Step>
            );
          })}
        </div>
      )}
    </div>
  );
}
