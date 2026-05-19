import React, { useState, useEffect, useCallback } from "react";
import api from "../api/client";
import { cachedGet } from "../api/orgCache";
import { addLog } from "../log/store";

const inputCls = "border rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-[#00A1E0] w-full";
const labelCls = "block text-xs font-medium text-gray-600 mb-0.5";

// ── Futures editor ────────────────────────────────────────────────────────────
function FuturesEditor({ futures, onChange }) {
  const rows = Array.isArray(futures) ? futures : [];
  const update = (i, field, val) => {
    const next = rows.map((r, ri) => ri === i ? { ...r, [field]: val } : r);
    onChange(next);
  };
  const add = () => onChange([...rows, { quantity: "", expectedDate: "" }]);
  const remove = (i) => onChange(rows.filter((_, ri) => ri !== i));

  return (
    <div className="space-y-1">
      {rows.map((r, i) => (
        <div key={i} className="flex gap-1 items-center">
          <input
            type="date"
            className="border rounded px-1.5 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-[#00A1E0] w-28"
            value={r.expectedDate || ""}
            onChange={(e) => update(i, "expectedDate", e.target.value)}
          />
          <input
            type="number"
            min="0"
            className="border rounded px-1.5 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-[#00A1E0] w-16"
            value={r.quantity === "" ? "" : r.quantity}
            onChange={(e) => update(i, "quantity", e.target.value === "" ? "" : Number(e.target.value))}
            placeholder="qty"
          />
          <button type="button" onClick={() => remove(i)} className="text-red-400 hover:text-red-600 text-xs leading-none">✕</button>
        </div>
      ))}
      <button type="button" onClick={add} className="text-[10px] text-[#00A1E0] hover:underline">+ future</button>
    </div>
  );
}

// ── Stock cell ────────────────────────────────────────────────────────────────
// Collapsed: shows QoH / Safety / Futures count as compact numbers.
// Click → expanded inline editor.
function StockCell({ original, edited, onEdit }) {
  const [open, setOpen] = useState(false);
  const cur = edited ?? original;
  const isDirty = edited != null;

  const qoh = cur?.onHandQuantity ?? null;
  const safety = cur?.safetyStockCount ?? null;
  const futures = cur?.futures ?? [];
  const futuresTotal = futures.reduce((s, f) => s + (Number(f.quantity) || 0), 0);

  const val = (v) => v != null ? v : <span className="text-gray-300">—</span>;
  const dirtyVal = (v, origV) =>
    isDirty && v !== origV
      ? <span className="font-semibold text-amber-700">{v != null ? v : <span className="text-gray-300">—</span>}</span>
      : val(v);

  if (!open) {
    return (
      <td
        className={`border border-gray-200 px-2 py-1.5 text-xs cursor-pointer hover:bg-blue-50 ${isDirty ? "bg-amber-50" : ""}`}
        onClick={() => setOpen(true)}
        title="Click to edit"
      >
        <div className="text-[11px] space-y-0.5">
          <div className="flex justify-between gap-3">
            <span className="text-gray-400">QoH</span>
            <span className="font-mono">{dirtyVal(qoh, original?.onHandQuantity ?? null)}</span>
          </div>
          <div className="flex justify-between gap-3">
            <span className="text-gray-400">Safety</span>
            <span className="font-mono">{dirtyVal(safety, original?.safetyStockCount ?? null)}</span>
          </div>
          {(futures.length > 0 || (original?.futures ?? []).length > 0) && (
            <div className="flex justify-between gap-3">
              <span className="text-gray-400">Futures</span>
              <span className="font-mono">
                {isDirty ? <span className="font-semibold text-amber-700">{futuresTotal}</span> : futuresTotal || <span className="text-gray-300">—</span>}
              </span>
            </div>
          )}
        </div>
      </td>
    );
  }

  return (
    <td className="border border-gray-200 px-2 py-2 bg-blue-50 align-top z-10" onClick={(e) => e.stopPropagation()}>
      <div className="space-y-1.5 min-w-[150px]">
        <div className="flex gap-2">
          <div className="flex-1">
            <label className={labelCls}>QoH</label>
            <input type="number" min="0" className={inputCls} value={qoh ?? ""}
              onChange={(e) => onEdit({ ...(cur || {}), onHandQuantity: e.target.value === "" ? null : Number(e.target.value) })} />
          </div>
          <div className="flex-1">
            <label className={labelCls}>Safety</label>
            <input type="number" min="0" className={inputCls} value={safety ?? ""}
              onChange={(e) => onEdit({ ...(cur || {}), safetyStockCount: e.target.value === "" ? null : Number(e.target.value) })} />
          </div>
        </div>
        <div>
          <label className={labelCls}>Futures</label>
          <FuturesEditor futures={futures} onChange={(f) => onEdit({ ...(cur || {}), futures: f })} />
        </div>
        <button type="button" onClick={() => setOpen(false)}
          className="text-[10px] text-[#00A1E0] hover:underline">Done</button>
      </div>
    </td>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function ManageStockForm() {
  const [locationGroups, setLocationGroups] = useState([]);
  const [catalogs, setCatalogs] = useState([]);
  const [selectedLgId, setSelectedLgId] = useState(""); // SF Id for fetching locations
  const [selectedLgExtRef, setSelectedLgExtRef] = useState(""); // ExternalReference for OCI calls
  const [selectedCatalogId, setSelectedCatalogId] = useState("");
  const [locations, setLocations] = useState([]); // [{ Id, Name, ExternalReference }]
  const [products, setProducts] = useState([]); // [{ id, sku, name }]
  const [pivot, setPivot] = useState("sku"); // "sku" = rows:SKU cols:Location | "location" = rows:Location cols:SKU

  // original[locationExtRef][sku] = { onHandQuantity, safetyStockCount, futures }
  const [original, setOriginal] = useState({});
  // edited[locationExtRef][sku] = { onHandQuantity, safetyStockCount, futures } — only cells touched
  const [edited, setEdited] = useState({});

  const [loading, setLoading] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState(null);
  const [publishResult, setPublishResult] = useState(null);

  // Load reference data once
  useEffect(() => {
    cachedGet("/oci/location-groups").then(setLocationGroups).catch(() => {});
    cachedGet("/catalogs").then(setCatalogs).catch(() => {});
  }, []);

  // Load locations when LG changes
  useEffect(() => {
    if (!selectedLgId) { setLocations([]); return; }
    cachedGet(`/oci/location-groups/${selectedLgId}/locations`).then(setLocations).catch(() => setLocations([]));
  }, [selectedLgId]);

  // Load products when catalog changes
  useEffect(() => {
    if (!selectedCatalogId) { setProducts([]); return; }
    cachedGet(`/catalogs/${selectedCatalogId}/products`).then(setProducts).catch(() => setProducts([]));
  }, [selectedCatalogId]);

  // Load current stock when both LG + catalog are selected and locations/products are ready
  const loadStock = useCallback(async () => {
    if (!selectedLgExtRef || products.length === 0 || locations.length === 0) return;
    const skus = products.map((p) => p.sku).filter(Boolean);
    const locExtRefs = locations.map((l) => l.ExternalReference).filter(Boolean);
    if (skus.length === 0 || locExtRefs.length === 0) return;
    setLoading(true);
    setError(null);
    setEdited({});

    // OCI limit: SKUs × locations ≤ 100 — chunk SKUs to stay under the limit
    const chunkSize = Math.max(1, Math.floor(100 / locExtRefs.length));
    const chunks = [];
    for (let i = 0; i < skus.length; i += chunkSize) chunks.push(skus.slice(i, i + chunkSize));

    try {
      const byLocSku = {};
      for (const extRef of locExtRefs) {
        byLocSku[extRef] = {};
        for (const sku of skus) byLocSku[extRef][sku] = { onHandQuantity: null, safetyStockCount: null, futures: [] };
      }

      for (const chunkSkus of chunks) {
        const res = await api.post("/oci/availability", {
          items: chunkSkus.map((sku) => ({ sku, location_identifiers: locExtRefs, quantity: 1 })),
        });
        const locData = (res.data?.result || {}).locations || [];
        for (const loc of locData) {
          const extRef = loc.locationIdentifier;
          if (!extRef || !byLocSku[extRef]) continue;
          for (const rec of loc.inventoryRecords || loc.stockKeepingUnitAvailabilities || []) {
            const sku = rec.stockKeepingUnit;
            if (!sku) continue;
            byLocSku[extRef][sku] = {
              onHandQuantity: rec.onHand ?? rec.onHandQuantity ?? null,
              safetyStockCount: rec.safetyStockCount ?? null,
              futures: Array.isArray(rec.futures)
                ? rec.futures.map((f) => ({
                    quantity: f.quantity ?? 0,
                    expectedDate: (f.expectedDate || f.date || "").slice(0, 10),
                  }))
                : [],
            };
          }
        }
        addLog({ type: "preview", label: `OCI Stock chunk (${chunkSkus.length} SKUs)`, body: res.data?.result });
      }

      setOriginal(byLocSku);
    } catch (err) {
      const detail = err.response?.data?.detail;
      setError(typeof detail === "string" ? detail : detail ? JSON.stringify(detail) : "Failed to load stock data");
    } finally {
      setLoading(false);
    }
  }, [selectedLgExtRef, products, locations]);

  useEffect(() => { loadStock(); }, [loadStock]);

  const setCell = (locExtRef, sku, value) => {
    setEdited((prev) => ({
      ...prev,
      [locExtRef]: { ...(prev[locExtRef] || {}), [sku]: value },
    }));
  };

  const dirtyCount = Object.values(edited).reduce(
    (s, byLoc) => s + Object.keys(byLoc).length, 0
  );

  const handlePublish = async () => {
    if (dirtyCount === 0) return;
    setPublishing(true);
    setError(null);
    setPublishResult(null);
    try {
      const records = [];
      for (const [locExtRef, bySku] of Object.entries(edited)) {
        for (const [sku, vals] of Object.entries(bySku)) {
          const rec = { locationIdentifier: locExtRef, stockKeepingUnit: sku };
          if (vals.onHandQuantity != null) rec.onHandQuantity = vals.onHandQuantity;
          if (vals.safetyStockCount != null) rec.safetyStockCount = vals.safetyStockCount;
          // Always send futures (even empty array = clear)
          rec.futures = (vals.futures || [])
            .filter((f) => f.expectedDate && f.quantity !== "" && f.quantity != null)
            .map((f) => ({ quantity: Number(f.quantity), expectedDate: f.expectedDate }));
          records.push(rec);
        }
      }
      const res = await api.post("/oci/stock-records/upload", { records });
      setPublishResult(res.data);
      addLog({ type: "preview", label: "OCI Stock Upload", body: res.data?.payload });
      // Refresh original with edited values on success
      setOriginal((prev) => {
        const next = { ...prev };
        for (const [locExtRef, bySku] of Object.entries(edited)) {
          next[locExtRef] = { ...(next[locExtRef] || {}) };
          for (const [sku, vals] of Object.entries(bySku)) {
            next[locExtRef][sku] = vals;
          }
        }
        return next;
      });
      setEdited({});
    } catch (err) {
      const detail = err.response?.data?.detail;
      setError(typeof detail === "string" ? detail : detail ? JSON.stringify(detail) : "Failed to publish stock");
    } finally {
      setPublishing(false);
    }
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  const ready = locations.length > 0 && products.length > 0;

  // SKU-pivot: rows = products, cols = locations
  const renderSkuPivot = () => (
    <table className="text-xs border-collapse w-full">
      <thead>
        <tr className="bg-gray-50 sticky top-0 z-10">
          <th className="border border-gray-200 px-3 py-2 text-left font-medium text-gray-600 min-w-[180px]">SKU / Product</th>
          {locations.filter(l => l.ExternalReference).map((loc) => (
            <th key={loc.ExternalReference} className="border border-gray-200 px-3 py-2 text-left font-medium text-gray-600 min-w-[100px]">
              <div className="font-medium">{loc.Name}</div>
              <div className="text-[10px] text-gray-400 font-mono">{loc.ExternalReference}</div>
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {products.filter(p => p.sku).map((p) => (
          <tr key={p.sku} className="hover:bg-gray-50">
            <td className="border border-gray-200 px-3 py-2">
              <div className="font-medium text-gray-800">{p.name}</div>
              <div className="text-[10px] text-gray-400 font-mono">{p.sku}</div>
            </td>
            {locations.filter(l => l.ExternalReference).map((loc) => (
              <StockCell
                key={loc.ExternalReference}
                original={original[loc.ExternalReference]?.[p.sku] ?? null}
                edited={edited[loc.ExternalReference]?.[p.sku] ?? null}
                onEdit={(val) => setCell(loc.ExternalReference, p.sku, val)}
              />
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );

  // Location-pivot: rows = locations, cols = products
  const renderLocationPivot = () => (
    <table className="text-xs border-collapse w-full">
      <thead>
        <tr className="bg-gray-50 sticky top-0 z-10">
          <th className="border border-gray-200 px-3 py-2 text-left font-medium text-gray-600 min-w-[180px]">Location</th>
          {products.filter(p => p.sku).map((p) => (
            <th key={p.sku} className="border border-gray-200 px-3 py-2 text-left font-medium text-gray-600 min-w-[100px]">
              <div className="font-medium">{p.name}</div>
              <div className="text-[10px] text-gray-400 font-mono">{p.sku}</div>
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {locations.filter(l => l.ExternalReference).map((loc) => (
          <tr key={loc.ExternalReference} className="hover:bg-gray-50">
            <td className="border border-gray-200 px-3 py-2">
              <div className="font-medium text-gray-800">{loc.Name}</div>
              <div className="text-[10px] text-gray-400 font-mono">{loc.ExternalReference}</div>
            </td>
            {products.filter(p => p.sku).map((p) => (
              <StockCell
                key={p.sku}
                original={original[loc.ExternalReference]?.[p.sku] ?? null}
                edited={edited[loc.ExternalReference]?.[p.sku] ?? null}
                onEdit={(val) => setCell(loc.ExternalReference, p.sku, val)}
              />
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );

  return (
    <div className="space-y-5">
      {/* Selectors */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelCls}>Location Group</label>
          <select
            className="w-full border rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-[#00A1E0]"
            value={selectedLgId}
            onChange={(e) => {
              const lg = locationGroups.find((g) => g.Id === e.target.value);
              setSelectedLgId(e.target.value);
              setSelectedLgExtRef(lg?.ExternalReference || "");
              setOriginal({});
              setEdited({});
            }}
          >
            <option value="">— select —</option>
            {locationGroups.map((lg) => (
              <option key={lg.Id} value={lg.Id}>
                {lg.LocationGroupName}{lg.ExternalReference ? ` (${lg.ExternalReference})` : ""}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelCls}>Catalog</label>
          <select
            className="w-full border rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-[#00A1E0]"
            value={selectedCatalogId}
            onChange={(e) => { setSelectedCatalogId(e.target.value); setOriginal({}); setEdited({}); }}
          >
            <option value="">— select —</option>
            {catalogs.map((c) => (
              <option key={c.id} value={c.id}>{c.name} ({c.product_count})</option>
            ))}
          </select>
        </div>
      </div>

      {/* Errors / results */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded px-4 py-2 text-sm whitespace-pre-wrap">{error}</div>
      )}
      {publishResult && (
        <div className="bg-green-50 border border-green-200 text-green-700 rounded px-4 py-2 text-sm">
          ✓ Stock published successfully.
          <button onClick={() => setPublishResult(null)} className="ml-2 text-green-500 hover:text-green-700 text-xs underline">dismiss</button>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center gap-2 text-sm text-gray-400 py-4">
          <svg className="animate-spin w-4 h-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
          </svg>
          Loading stock data…
        </div>
      )}

      {/* Table toolbar + table */}
      {!loading && ready && (
        <>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              {/* Pivot toggle */}
              <div className="flex items-center gap-1 text-xs border rounded overflow-hidden">
                <button
                  type="button"
                  onClick={() => setPivot("sku")}
                  className={`px-3 py-1.5 ${pivot === "sku" ? "bg-[#00A1E0] text-white font-medium" : "text-gray-600 hover:bg-gray-50"}`}
                >
                  SKU × Location
                </button>
                <button
                  type="button"
                  onClick={() => setPivot("location")}
                  className={`px-3 py-1.5 ${pivot === "location" ? "bg-[#00A1E0] text-white font-medium" : "text-gray-600 hover:bg-gray-50"}`}
                >
                  Location × SKU
                </button>
              </div>
              {dirtyCount > 0 && (
                <span className="text-xs text-amber-600 font-medium">{dirtyCount} cell{dirtyCount > 1 ? "s" : ""} modified</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {dirtyCount > 0 && (
                <button type="button" onClick={() => setEdited({})}
                  className="text-xs text-gray-500 hover:text-gray-700 border rounded px-3 py-1.5">
                  Reset
                </button>
              )}
              <button
                type="button"
                onClick={handlePublish}
                disabled={publishing || dirtyCount === 0}
                className="bg-[#00A1E0] text-white px-4 py-1.5 rounded text-sm font-medium hover:bg-[#0086b3] disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {publishing ? "Publishing…" : `Publish Stock${dirtyCount > 0 ? ` (${dirtyCount})` : ""}`}
              </button>
            </div>
          </div>

          <div className="overflow-x-auto border rounded-lg">
            {pivot === "sku" ? renderSkuPivot() : renderLocationPivot()}
          </div>

          <p className="text-[10px] text-gray-400">Click a cell to edit. Modified cells are highlighted in amber. Only modified cells are sent on Publish.</p>
        </>
      )}

      {!loading && !ready && selectedLgId && selectedCatalogId && (
        <p className="text-sm text-gray-400 text-center py-8">No data — check that the location group has locations and the catalog has products.</p>
      )}
    </div>
  );
}
