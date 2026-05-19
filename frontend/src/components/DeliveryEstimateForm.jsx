import React, { useState, useEffect } from "react";
import api from "../api/client";
import { cachedGet } from "../api/orgCache";
import { addLog } from "../log/store";
import { useLang } from "../i18n/LangContext";
import CountryStateSelector from "./CountryStateSelector";

const emptyProduct = () => ({ stockKeepingUnit: "", quantity: 1 });
const emptyMethod = () => ({ name: "" });

const UNITS = ["mi", "km"];

function CdsConfigPanel({ onConfigured }) {
  const [cfg, setCfg] = useState({ client_id: "", client_secret: "", scope: "", org_short_code: "", region: "us-east-2", correlation_id: "" });
  const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    api.get("/delivery-estimate/cds-config").then((r) => {
      setCfg(r.data);
      setOpen(!r.data.configured);
    }).catch(() => setOpen(true));
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      await api.post("/delivery-estimate/cds-config", cfg);
      setCfg((p) => ({ ...p, configured: true }));
      setOpen(false);
      onConfigured?.();
    } finally {
      setSaving(false);
    }
  };

  const inputCls = "w-full border rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-[#00A1E0]";
  const labelCls = "block text-xs font-medium text-gray-600 mb-0.5";

  return (
    <div className="border rounded-lg overflow-hidden">
      <button type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-2.5 bg-gray-50 hover:bg-gray-100 text-sm font-medium text-gray-700">
        <span>
          CDS Credentials
          {cfg.configured
            ? <span className="text-green-600 text-xs font-normal ml-2">✓ configured</span>
            : <span className="text-orange-500 text-xs font-normal ml-2">⚠ not configured</span>}
        </span>
        <span className="text-gray-400">{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div className="p-4 space-y-3 border-t">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Client ID</label>
              <input className={inputCls} value={cfg.client_id}
                onChange={(e) => setCfg((p) => ({ ...p, client_id: e.target.value }))}
                placeholder="af905942-7079-465c-8e3f-…" />
            </div>
            <div>
              <label className={labelCls}>Client Secret</label>
              <input type="password" className={inputCls} value={cfg.client_secret}
                onChange={(e) => setCfg((p) => ({ ...p, client_secret: e.target.value }))}
                placeholder="••••••••" />
            </div>
          </div>
          <div>
            <label className={labelCls}>Scope</label>
            <input className={inputCls} value={cfg.scope}
              onChange={(e) => setCfg((p) => ({ ...p, scope: e.target.value }))}
              placeholder="SALESFORCE_COMMERCE_API:zzse_281 sfcc.commercedeliveryservice.shopper" />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className={labelCls}>Org Short Code</label>
              <input className={inputCls} value={cfg.org_short_code}
                onChange={(e) => setCfg((p) => ({ ...p, org_short_code: e.target.value }))}
                placeholder="zzse_281" />
            </div>
            <div>
              <label className={labelCls}>Region</label>
              <input className={inputCls} value={cfg.region}
                onChange={(e) => setCfg((p) => ({ ...p, region: e.target.value }))}
                placeholder="us-east-2" />
            </div>
            <div>
              <label className={labelCls}>Correlation-ID (optional)</label>
              <input className={inputCls} value={cfg.correlation_id}
                onChange={(e) => setCfg((p) => ({ ...p, correlation_id: e.target.value }))}
                placeholder="auto-generated if empty" />
            </div>
          </div>
          <button type="button" disabled={saving} onClick={save}
            className="bg-[#00A1E0] text-white text-sm px-4 py-1.5 rounded hover:bg-[#0086b3] disabled:opacity-50">
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      )}
    </div>
  );
}

// Format a date range { min, max } as readable strings
function fmtDateRange(obj) {
  if (!obj) return "—";
  const fmt = (d) => d ? new Date(d).toLocaleDateString("en-CA") : "?";
  if (obj.min === obj.max) return fmt(obj.min);
  return `${fmt(obj.min)} → ${fmt(obj.max)}`;
}

// Floating result popup
function DeResult({ operation, result, onClose }) {
  if (!result) return null;

  const renderDelivery = () => {
    const estimates = result.deliveryEstimates || [];
    if (estimates.length === 0) {
      return <pre className="text-xs whitespace-pre-wrap text-gray-600">{JSON.stringify(result, null, 2)}</pre>;
    }
    // Flatten: for each deliveryGroup → for each deliveryEstimateGroup entry → for each shippingMethod → one row
    const rows = [];
    estimates.forEach((grp) => {
      (grp.deliveryEstimateGroup || []).forEach((eg) => {
        if (eg.error) {
          rows.push({ location: eg.location, skus: "", method: "—", shipDate: "—", deliveryDate: "—", error: eg.error.message || eg.error.code });
          return;
        }
        const skus = (eg.productDeliveryEstimations || []).map((p) => `${p.stockKeepingUnit} ×${p.quantity}`).join(", ");
        (eg.shippingMethods || []).forEach((sm) => {
          rows.push({
            location: eg.location || "—",
            skus,
            method: sm.shippingCarrierMethod || "—",
            routing: sm.routingCalculationType || "",
            shipDate: fmtDateRange(sm.estimatedShipDate),
            deliveryDate: fmtDateRange(sm.estimatedDeliveryDate),
            error: null,
          });
        });
        if ((eg.shippingMethods || []).length === 0) {
          rows.push({ location: eg.location || "—", skus, method: "—", shipDate: "—", deliveryDate: "—", error: null });
        }
      });
    });

    return (
      <table className="w-full text-xs border-collapse">
        <thead>
          <tr className="bg-gray-50">
            {["Location", "SKUs", "Shipping Method", "Routing", "Est. Ship Date", "Est. Delivery Date"].map((h) => (
              <th key={h} className="border border-gray-200 px-3 py-1.5 text-left font-medium text-gray-600">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, ri) => (
            <tr key={ri} className={ri % 2 === 0 ? "" : "bg-gray-50"}>
              <td className="border border-gray-200 px-3 py-1.5 text-[#00A1E0] font-medium">{r.location}</td>
              <td className="border border-gray-200 px-3 py-1.5 font-mono">{r.skus}</td>
              <td className="border border-gray-200 px-3 py-1.5">{r.method}</td>
              <td className="border border-gray-200 px-3 py-1.5 text-gray-500">{r.routing}</td>
              <td className="border border-gray-200 px-3 py-1.5">{r.error ? <span className="text-red-600">{r.error}</span> : r.shipDate}</td>
              <td className="border border-gray-200 px-3 py-1.5">{r.error ? "" : r.deliveryDate}</td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  };

  const renderBopis = () => {
    const errors = result.error || [];
    if (errors.length > 0) {
      return (
        <div className="space-y-2">
          {errors.map((e, i) => (
            <div key={i} className="bg-red-50 border border-red-200 rounded px-4 py-2 text-sm">
              <span className="font-medium text-red-700">{e.code}</span>
              <span className="text-red-600 ml-2">{e.message}</span>
            </div>
          ))}
        </div>
      );
    }
    const rows = result.results || [];
    if (rows.length === 0) {
      return <pre className="text-xs whitespace-pre-wrap text-gray-600">{JSON.stringify(result, null, 2)}</pre>;
    }
    return (
      <table className="w-full text-xs border-collapse">
        <thead>
          <tr className="bg-gray-50">
            {["SKU", "Location", "On Hand", "ATO", "ATF", "Distance", "Earliest Pickup"].map((h) => (
              <th key={h} className="border border-gray-200 px-3 py-1.5 text-left font-medium text-gray-600">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, ri) => (
            <tr key={ri} className={ri % 2 === 0 ? "" : "bg-gray-50"}>
              <td className="border border-gray-200 px-3 py-1.5 font-mono">{r.stockKeepingUnit}</td>
              <td className="border border-gray-200 px-3 py-1.5 text-[#00A1E0]">{r.location}</td>
              <td className="border border-gray-200 px-3 py-1.5">{r.inventory?.onHand ?? ""}</td>
              <td className="border border-gray-200 px-3 py-1.5">{r.inventory?.availableToOrder ?? ""}</td>
              <td className="border border-gray-200 px-3 py-1.5">{r.inventory?.availableToFulfill ?? ""}</td>
              <td className="border border-gray-200 px-3 py-1.5">{r.distance != null ? `${r.distance} ${r.unit ?? ""}` : ""}</td>
              <td className="border border-gray-200 px-3 py-1.5">{r.inStore?.earliestPickupTime ?? ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  };

  const ref = result.estimatedDeliveryReference;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-16 px-4 bg-black/20" onClick={onClose}>
      <div
        className="bg-white rounded-lg shadow-2xl border border-gray-200 w-full max-w-5xl max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bg-gray-50 border-b border-gray-200 flex items-center justify-between px-4 py-3 rounded-t-lg shrink-0">
          <div className="flex items-center gap-3">
            <span className="text-gray-700 font-semibold text-sm">✓ Delivery Estimate</span>
            {ref && <span className="text-gray-400 text-xs font-mono">{ref}</span>}
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-xl leading-none px-1">×</button>
        </div>
        <div className="overflow-auto flex-1 p-4">
          {operation === "bopis" ? renderBopis() : renderDelivery()}
        </div>
      </div>
    </div>
  );
}

export default function DeliveryEstimateForm({ onFormChange, pendingRestore, onRestoreDone, activeCatalogId, onCatalogChange }) {
  const { t } = useLang();

  const [operation, setOperation] = useState("delivery-date");
  const [setupName, setSetupName] = useState("");
  const [carrierName, setCarrierName] = useState("");
  const [methods, setMethods] = useState([emptyMethod()]);
  const [products, setProducts] = useState([emptyProduct()]);
  const [deliveryAddress, setDeliveryAddress] = useState({ country: "", state: "", city: "", postalCode: "" });
  const [locationFilter, setLocationFilter] = useState("");
  const [selectedLocations, setSelectedLocations] = useState([]);
  const [radius, setRadius] = useState("");
  const [unit, setUnit] = useState("km");
  const [maxReturnedLocations, setMaxReturnedLocations] = useState("");
  const [bopisAddress, setBopisAddress] = useState({ countryCode: "", postalCode: "", latitude: "", longitude: "" });

  const [setupNames, setSetupNames] = useState([]);
  const [shippingMethods, setShippingMethods] = useState([]);
  const [locations, setLocations] = useState([]);
  const [catalogs, setCatalogs] = useState([]);
  const [localCatalogId, setLocalCatalogId] = useState(null);
  const [catalogProducts, setCatalogProducts] = useState([]);

  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [geoResolving, setGeoResolving] = useState(false);
  const [geoError, setGeoError] = useState(null);

  const resolveLatLng = async (countryCode, postalCode) => {
    setGeoResolving(true);
    setGeoError(null);
    try {
      const params = new URLSearchParams({ postalcode: postalCode, country: countryCode, format: "json", limit: "1" });
      const res = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
        headers: { "Accept-Language": "en", "User-Agent": "sfom-demo-app" },
      });
      const data = await res.json();
      if (!data.length) {
        setGeoError(`No result for ${postalCode}, ${countryCode}`);
        return;
      }
      setBopisAddress((p) => ({ ...p, latitude: data[0].lat, longitude: data[0].lon }));
    } catch {
      setGeoError("Geocoding failed. Check your connection.");
    } finally {
      setGeoResolving(false);
    }
  };

  const fetchCatalogs = () => cachedGet("/catalogs").then(setCatalogs).catch(() => {});

  const selectCatalog = async (id) => {
    const numId = id ? Number(id) : null;
    setLocalCatalogId(numId);
    if (numId) {
      const data = await cachedGet(`/catalogs/${numId}/products`).catch(() => []);
      setCatalogProducts(data);
      onCatalogChange?.(numId, data);
    } else {
      setCatalogProducts([]);
      onCatalogChange?.(null, []);
    }
  };

  useEffect(() => {
    if (activeCatalogId && activeCatalogId !== localCatalogId) {
      cachedGet(`/catalogs/${activeCatalogId}/products`)
        .then((data) => { setLocalCatalogId(activeCatalogId); setCatalogProducts(data); })
        .catch(() => {});
    }
  }, [activeCatalogId]);

  useEffect(() => {
    Promise.all([
      cachedGet("/delivery-estimate/locations").then(setLocations).catch(() => {}),
      cachedGet("/delivery-estimate/setup-names").then(setSetupNames).catch(() => {}),
      cachedGet("/delivery-estimate/shipping-methods").then(setShippingMethods).catch(() => {}),
      fetchCatalogs(),
    ]);
  }, []);

  // Build preview payload
  useEffect(() => {
    const prods = products.map((p) => ({ stockKeepingUnit: p.stockKeepingUnit, quantity: p.quantity }));
    let payload;
    if (operation === "bopis") {
      const bAddr = {};
      if (bopisAddress.countryCode) bAddr.countryCode = bopisAddress.countryCode;
      if (bopisAddress.postalCode) bAddr.postalCode = bopisAddress.postalCode;
      if (bopisAddress.latitude) bAddr.latitude = Number(bopisAddress.latitude);
      if (bopisAddress.longitude) bAddr.longitude = Number(bopisAddress.longitude);
      payload = {
        deliveryEstimationSetupName: setupName,
        products: prods,
        ...(selectedLocations.length ? { locations: selectedLocations } : {}),
        ...(radius ? { radius: Number(radius) } : {}),
        ...(unit ? { unit } : {}),
        ...(maxReturnedLocations ? { maxReturnedLocations: Number(maxReturnedLocations) } : {}),
        ...(Object.keys(bAddr).length ? { address: bAddr } : {}),
      };
    } else {
      const carrier = {
        methods: methods.filter((m) => m.name).map((m) => ({ name: m.name })),
        ...(carrierName ? { name: carrierName } : {}),
      };
      payload = {
        deliveryEstimationSetupName: setupName,
        shippingCarrier: carrier,
        products: prods,
        deliveryAddress: { ...deliveryAddress },
        ...(selectedLocations.length ? { locations: selectedLocations } : {}),
      };
    }
    addLog({ type: "preview", label: "Delivery Estimate Payload", body: payload });
    onFormChange?.({
      operation, setupName, carrierName, methods, deliveryAddress,
      selectedLocations, radius, unit, maxReturnedLocations, bopisAddress,
      _catalogId: localCatalogId, _products: products,
    }, products, null);
  }, [operation, setupName, carrierName, methods, products, deliveryAddress, selectedLocations, radius, unit, maxReturnedLocations, bopisAddress, localCatalogId]);

  useEffect(() => {
    if (!pendingRestore) return;
    const { form: savedForm, products: savedProds } = pendingRestore;
    if (!savedForm) { onRestoreDone?.(); return; }
    if (savedForm.operation) setOperation(savedForm.operation);
    if (savedForm.setupName) setSetupName(savedForm.setupName);
    if (savedForm.carrierName !== undefined) setCarrierName(savedForm.carrierName);
    if (savedForm.methods?.length) setMethods(savedForm.methods);
    if (savedForm.deliveryAddress && typeof savedForm.deliveryAddress === "object") {
      setDeliveryAddress({
        country: savedForm.deliveryAddress.country ?? "",
        state: savedForm.deliveryAddress.state ?? "",
        city: savedForm.deliveryAddress.city ?? "",
        postalCode: savedForm.deliveryAddress.postalCode ?? "",
      });
    }
    if (Array.isArray(savedForm.selectedLocations)) setSelectedLocations(savedForm.selectedLocations);
    if (savedForm.radius !== undefined && savedForm.radius !== null) setRadius(savedForm.radius);
    if (savedForm.unit) setUnit(savedForm.unit);
    if (savedForm.maxReturnedLocations !== undefined && savedForm.maxReturnedLocations !== null) setMaxReturnedLocations(savedForm.maxReturnedLocations);
    if (savedForm.bopisAddress && typeof savedForm.bopisAddress === "object") setBopisAddress(savedForm.bopisAddress);
    if (savedForm._catalogId) selectCatalog(savedForm._catalogId);
    if (savedProds?.length) setProducts(savedProds);
    onRestoreDone?.();
  }, [pendingRestore]);

  const updateProduct = (i, field, value) => {
    setProducts((prev) => { const u = [...prev]; u[i] = { ...u[i], [field]: value }; return u; });
  };

  const updateMethod = (i, value) => {
    setMethods((prev) => { const u = [...prev]; u[i] = { name: value }; return u; });
  };

  const toggleLocation = (extRef) => {
    setSelectedLocations((prev) =>
      prev.includes(extRef) ? prev.filter((x) => x !== extRef) : [...prev, extRef]
    );
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setResult(null);
    try {
      const body = {
        operation,
        deliveryEstimationSetupName: setupName,
        products: products.filter((p) => p.stockKeepingUnit),
        locations: selectedLocations,
        ...(operation !== "bopis" ? {
          shippingCarrier: {
            name: carrierName,
            methods: methods.filter((m) => m.name).map((m) => ({ name: m.name })),
          },
          deliveryAddress,
        } : {
          radius: radius ? Number(radius) : null,
          unit,
          maxReturnedLocations: maxReturnedLocations ? Number(maxReturnedLocations) : null,
          bopisAddress: {
            countryCode: bopisAddress.countryCode || undefined,
            postalCode: bopisAddress.postalCode || undefined,
            latitude: bopisAddress.latitude ? Number(bopisAddress.latitude) : undefined,
            longitude: bopisAddress.longitude ? Number(bopisAddress.longitude) : undefined,
          },
        }),
      };
      const res = await api.post("/delivery-estimate", body);
      setResult(res.data.result);
      addLog({ type: "preview", label: "Delivery Estimate Payload", body: res.data.payload });
    } catch (err) {
      const detail = err.response?.data?.detail;
      setError(typeof detail === "string" ? detail : JSON.stringify(detail, null, 2));
    } finally {
      setSubmitting(false);
    }
  };

  const clearForm = () => {
    setOperation("delivery-date");
    setSetupName("");
    setCarrierName("");
    setMethods([emptyMethod()]);
    setProducts([emptyProduct()]);
    setDeliveryAddress({ country: "", state: "", city: "", postalCode: "" });
    setLocationFilter("");
    setSelectedLocations([]);
    setRadius("");
    setUnit("km");
    setMaxReturnedLocations("");
    setBopisAddress({ countryCode: "", postalCode: "", latitude: "", longitude: "" });
    setLocalCatalogId(null);
    setCatalogProducts([]);
    onCatalogChange?.(null, []);
    setResult(null);
    setError(null);
    setGeoError(null);
  };

  const inputCls = "w-full border rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-[#00A1E0]";
  const labelCls = "block text-xs font-medium text-gray-600 mb-0.5";
  const sectionCls = "border rounded-lg p-4 space-y-3";

  const filteredLocs = locations.filter((l) =>
    !locationFilter || l.Name.toLowerCase().includes(locationFilter.toLowerCase()) || (l.ExternalReference || "").toLowerCase().includes(locationFilter.toLowerCase())
  );

  return (
    <>
      {result && <DeResult operation={operation} result={result} onClose={() => setResult(null)} />}

      <form onSubmit={handleSubmit} className="space-y-5">
        <h2 className="text-lg font-semibold text-gray-800">Delivery Estimate</h2>

        <CdsConfigPanel />

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded px-4 py-2 text-sm whitespace-pre-wrap">{error}</div>
        )}

        {/* Operation */}
        <div className={sectionCls}>
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-gray-700">Operation</p>
            <button type="button" onClick={clearForm}
              className="text-xs text-gray-400 hover:text-red-500 border border-gray-200 hover:border-red-300 rounded px-2 py-0.5 transition-colors">
              Clear Form
            </button>
          </div>
          <div className="flex gap-4">
            {[["delivery-date", "Delivery Date"], ["delivery-date-by-locations", "By Locations"], ["bopis", "BOPIS"]].map(([val, label]) => (
              <label key={val} className="flex items-center gap-2 cursor-pointer">
                <input type="radio" name="de_op" value={val} checked={operation === val}
                  onChange={() => setOperation(val)} className="accent-[#00A1E0]" />
                <span className="text-sm">{label}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Setup */}
        <div className={sectionCls}>
          <p className="text-sm font-semibold text-gray-700">Configuration</p>
          <div>
            <label className={labelCls}>Delivery Estimation Setup *</label>
            <select className={inputCls} value={setupName} onChange={(e) => setSetupName(e.target.value)} required>
              <option value="">— select setup —</option>
              {setupNames.map((s) => <option key={s.Id} value={s.ExternalReference || s.Name}>{s.Name}</option>)}
            </select>
          </div>
        </div>

        {/* Shipping Carrier — not for BOPIS */}
        {operation !== "bopis" && (
          <div className={sectionCls}>
            <p className="text-sm font-semibold text-gray-700">Shipping Carrier</p>
            <div>
              <label className={labelCls}>Carrier Name (optional)</label>
              <input className={inputCls} value={carrierName} onChange={(e) => setCarrierName(e.target.value)}
                placeholder="e.g. UPS" />
            </div>
            <div>
              <label className={labelCls}>Shipping Methods *</label>
              <div className="space-y-1.5">
                {methods.map((m, i) => (
                  <div key={i} className="flex gap-2">
                    <select className={`${inputCls} flex-1`} value={m.name}
                      onChange={(e) => {
                        const sm = shippingMethods.find((s) => (s.ExternalReference || s.Name) === e.target.value);
                        updateMethod(i, e.target.value);
                        if (sm?.ShippingCarrier?.ExternalReference) {
                          setCarrierName(sm.ShippingCarrier.ExternalReference);
                        }
                      }}>
                      <option value="">— select method —</option>
                      {shippingMethods.map((sm) => (
                        <option key={sm.Id} value={sm.ExternalReference || sm.Name}>{sm.Name}</option>
                      ))}
                    </select>
                    {methods.length > 1 && (
                      <button type="button" onClick={() => setMethods(methods.filter((_, idx) => idx !== i))}
                        className="text-red-400 hover:text-red-600 px-2">✕</button>
                    )}
                  </div>
                ))}
              </div>
              <button type="button" onClick={() => setMethods([...methods, emptyMethod()])}
                className="mt-1.5 text-sm text-[#00A1E0] hover:underline">+ Add method</button>
            </div>
          </div>
        )}

        {/* Products */}
        <div className={sectionCls}>
          <p className="text-sm font-semibold text-gray-700">Products *</p>
          <div>
            <label className={labelCls}>{t.catalogLabel}</label>
            <select className={inputCls} value={localCatalogId || ""}
              onChange={(e) => selectCatalog(e.target.value)} onFocus={fetchCatalogs}>
              <option value="">{t.selectCatalogOption}</option>
              {catalogs.map((cat) => (
                <option key={cat.id} value={cat.id}>{cat.name}{cat.description ? ` — ${cat.description}` : ""} ({cat.product_count})</option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            {products.map((p, i) => (
              <div key={i} className="bg-gray-50 rounded p-3 space-y-2 border">
                {localCatalogId && (
                  <select className={inputCls}
                    value={catalogProducts.find((cp) => cp.sku === p.stockKeepingUnit)?.id || ""}
                    onChange={(e) => {
                      const cp = catalogProducts.find((c) => String(c.id) === e.target.value);
                      if (cp) updateProduct(i, "stockKeepingUnit", cp.sku);
                    }}>
                    <option value="">— select from catalog —</option>
                    {catalogProducts.map((cp) => (
                      <option key={cp.id} value={cp.id}>{cp.name} ({cp.sku})</option>
                    ))}
                  </select>
                )}
                <div className="flex gap-2 items-end">
                  <div className="flex-1">
                    <label className={labelCls}>SKU *</label>
                    <input className={inputCls} value={p.stockKeepingUnit}
                      onChange={(e) => updateProduct(i, "stockKeepingUnit", e.target.value)} placeholder="SKU" />
                  </div>
                  <div className="w-24">
                    <label className={labelCls}>Qty</label>
                    <input type="number" min="1" className={inputCls} value={p.quantity}
                      onChange={(e) => updateProduct(i, "quantity", Number(e.target.value))} />
                  </div>
                  {products.length > 1 && (
                    <button type="button" onClick={() => setProducts(products.filter((_, idx) => idx !== i))}
                      className="text-red-400 hover:text-red-600 text-sm px-2 pb-1.5">✕</button>
                  )}
                </div>
              </div>
            ))}
          </div>
          <button type="button" onClick={() => setProducts([...products, emptyProduct()])}
            className="text-sm text-[#00A1E0] hover:underline">+ Add product</button>
        </div>

        {/* Delivery Address — not for BOPIS */}
        {operation !== "bopis" && (
          <div className={sectionCls}>
            <p className="text-sm font-semibold text-gray-700">Delivery Address</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>City</label>
                <input className={inputCls} value={deliveryAddress.city}
                  onChange={(e) => setDeliveryAddress((prev) => ({ ...prev, city: e.target.value }))} />
              </div>
              <div>
                <label className={labelCls}>Postal Code</label>
                <input className={inputCls} value={deliveryAddress.postalCode}
                  onChange={(e) => setDeliveryAddress((prev) => ({ ...prev, postalCode: e.target.value }))} />
              </div>
            </div>
            <CountryStateSelector
              countryCode={deliveryAddress.country}
              stateCode={deliveryAddress.state}
              onCountryChange={(code) => setDeliveryAddress((prev) => ({ ...prev, country: code }))}
              onStateChange={(code) => setDeliveryAddress((prev) => ({ ...prev, state: code }))}
              labelCountry="Country *"
              labelState="State"
              labelCls={labelCls}
            />
          </div>
        )}

        {/* BOPIS specific */}
        {operation === "bopis" && (
          <div className={sectionCls}>
            <p className="text-sm font-semibold text-gray-700">BOPIS Options</p>
            <p className="text-xs text-gray-500">Search address — center point for the radius search</p>
            <CountryStateSelector
              countryCode={bopisAddress.countryCode}
              stateCode=""
              onCountryChange={(code) => setBopisAddress((p) => ({ ...p, countryCode: code }))}
              onStateChange={() => {}}
              labelCountry="Country"
              labelCls={labelCls}
              className="grid grid-cols-1 gap-3"
              showState={false}
            />
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Postal Code</label>
                <input className={inputCls} value={bopisAddress.postalCode}
                  onChange={(e) => setBopisAddress((p) => ({ ...p, postalCode: e.target.value }))}
                  placeholder="e.g. 98108" />
              </div>
              <div className="flex items-end">
                <button
                  type="button"
                  onClick={() => resolveLatLng(bopisAddress.countryCode, bopisAddress.postalCode)}
                  disabled={!bopisAddress.countryCode || !bopisAddress.postalCode || geoResolving}
                  className="w-full border rounded px-3 py-1.5 text-sm text-[#00A1E0] border-[#00A1E0] hover:bg-blue-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  {geoResolving ? "Resolving…" : "📍 Resolve lat/lng"}
                </button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Latitude</label>
                <input type="number" step="any" className={inputCls} value={bopisAddress.latitude}
                  onChange={(e) => setBopisAddress((p) => ({ ...p, latitude: e.target.value }))}
                  placeholder="e.g. 47.6062" />
              </div>
              <div>
                <label className={labelCls}>Longitude</label>
                <input type="number" step="any" className={inputCls} value={bopisAddress.longitude}
                  onChange={(e) => setBopisAddress((p) => ({ ...p, longitude: e.target.value }))}
                  placeholder="e.g. -122.3321" />
              </div>
            </div>
            {geoError && <p className="text-xs text-red-500">{geoError}</p>}
            <div className="grid grid-cols-3 gap-3 pt-1">
              <div>
                <label className={labelCls}>Radius</label>
                <input type="number" min="0" className={inputCls} value={radius}
                  onChange={(e) => setRadius(e.target.value)} placeholder="e.g. 50" />
              </div>
              <div>
                <label className={labelCls}>Unit</label>
                <select className={inputCls} value={unit} onChange={(e) => setUnit(e.target.value)}>
                  {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>Max Locations</label>
                <input type="number" min="1" className={inputCls} value={maxReturnedLocations}
                  onChange={(e) => setMaxReturnedLocations(e.target.value)} placeholder="optional" />
              </div>
            </div>
          </div>
        )}

        {/* Locations filter — not for delivery-date */}
        {operation !== "delivery-date" && <div className={sectionCls}>
          <p className="text-sm font-semibold text-gray-700">Locations <span className="font-normal text-gray-400">(optional)</span></p>
          {selectedLocations.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-2">
              {selectedLocations.map((loc) => {
                const name = locations.find((l) => l.ExternalReference === loc)?.Name || loc;
                return (
                  <span key={loc} className="bg-blue-100 text-blue-800 text-xs px-2 py-0.5 rounded-full flex items-center gap-1">
                    {name}
                    <button type="button" onClick={() => toggleLocation(loc)} className="hover:text-red-600 font-bold">×</button>
                  </span>
                );
              })}
            </div>
          )}
          <input className={inputCls} placeholder="Filter locations…" value={locationFilter}
            onChange={(e) => setLocationFilter(e.target.value)} />
          {locationFilter.length > 0 && (
            <div className="border rounded mt-0.5 shadow-sm bg-white max-h-40 overflow-y-auto">
              {filteredLocs.map((l) => {
                const selected = selectedLocations.includes(l.ExternalReference);
                return (
                  <button type="button" key={l.Id}
                    onClick={() => { toggleLocation(l.ExternalReference); setLocationFilter(""); }}
                    className={`w-full text-left px-3 py-1.5 text-xs border-b last:border-0 flex justify-between items-center ${selected ? "bg-blue-50 text-blue-700" : "hover:bg-gray-50"}`}>
                    <span>{l.Name}</span>
                    <span className="text-gray-400 font-mono">{l.ExternalReference}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>}

        <button type="submit" disabled={submitting}
          className="w-full bg-[#00A1E0] text-white px-6 py-2.5 rounded font-medium hover:bg-[#0086b3] transition disabled:opacity-50">
          {submitting ? "Submitting…" : operation === "bopis" ? "Get BOPIS Estimate" : "Get Delivery Estimate"}
        </button>
      </form>
    </>
  );
}
