import React, { useState, useEffect } from "react";
import api from "../api/client";
import { cachedGet } from "../api/orgCache";
import { addLog } from "../log/store";
import { useLang } from "../i18n/LangContext";
import ManageStockForm from "./ManageStockForm";

const genRequestId = () => {
  const a = Math.random().toString(20).slice(2);
  const b = Math.random().toString(25).slice(2);
  const c = Date.now().toString(36);
  return `${a}-${b}-${c}`;
};

const emptyItem = () => ({ sku: "", quantity: 1 });

// Mirror of backend payload builder — mutually exclusive SF OCI availability modes
function buildAvailabilityPayload(items) {
  const skus = items.map((item) => item.sku);
  const locGroups = items.map((item) => item.location_group_identifier).filter(Boolean);
  const locIds = items.flatMap((item) => item.location_identifiers || (item.location_identifier ? [item.location_identifier] : []));

  if (items.length === 1) {
    const item = items[0];
    const ids = item.location_identifiers?.length ? item.location_identifiers : (item.location_identifier ? [item.location_identifier] : []);
    if (item.location_group_identifier) {
      return { locationGroupIdentifier: item.location_group_identifier, stockKeepingUnit: item.sku };
    } else if (ids.length) {
      return { locationIdentifiers: ids, stockKeepingUnits: [item.sku] };
    }
    return { stockKeepingUnit: item.sku };
  }
  if (locGroups.length) {
    return { locationGroupIdentifiers: [...new Set(locGroups)], stockKeepingUnits: skus };
  }
  if (locIds.length) {
    return { locationIdentifiers: locIds, stockKeepingUnits: skus };
  }
  return { stockKeepingUnits: skus };
}

// Render a table of SKU availability records
function SkuTable({ records }) {
  if (!records || records.length === 0) return null;
  return (
    <table className="w-full text-xs border-collapse">
      <thead>
        <tr className="bg-gray-50">
          {["SKU", "ATF", "ATO", "Qty on Hand", "Futures", "Reservations", "Safety Stock"].map((h) => (
            <th key={h} className="border border-gray-200 px-3 py-1.5 text-left font-medium text-gray-600">{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {records.map((r, ri) => (
          <tr key={ri} className={ri % 2 === 0 ? "" : "bg-gray-50"}>
            <td className="border border-gray-200 px-3 py-1.5 font-mono">{r.stockKeepingUnit ?? ""}</td>
            <td className="border border-gray-200 px-3 py-1.5">{r.availableToFulfill ?? ""}</td>
            <td className="border border-gray-200 px-3 py-1.5">{r.availableToOrder ?? ""}</td>
            <td className="border border-gray-200 px-3 py-1.5">{r.onHand ?? ""}</td>
            <td className="border border-gray-200 px-3 py-1.5">{r.futures ?? ""}</td>
            <td className="border border-gray-200 px-3 py-1.5">{r.reservations ?? ""}</td>
            <td className="border border-gray-200 px-3 py-1.5">{r.safetyStockCount ?? ""}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// Futures cell: shows sum on hover → tooltip with sorted date:qty list
function FuturesCell({ futures }) {
  if (!Array.isArray(futures) || futures.length === 0) {
    return <span>{typeof futures === "number" ? futures : ""}</span>;
  }
  const sorted = [...futures].sort((a, b) => new Date(a.expectedDate || 0) - new Date(b.expectedDate || 0));
  const total = sorted.reduce((s, f) => s + (f.quantity ?? 0), 0);
  const tip = sorted.map((f) => {
    const dateStr = f.expectedDate ? new Date(f.expectedDate).toLocaleDateString("en-CA") : "?";
    return `${dateStr}: ${f.quantity ?? 0}`;
  }).join("\n");
  return (
    <span className="cursor-help underline decoration-dotted" title={tip}>{total}</span>
  );
}

// Shared row renderer for inventory records
function buildInvRows(records, label) {
  if (records.length === 0) return [{ label, extRef: "", atf: "", ato: "", onHand: "", reserved: "", futuresRaw: [], safety: "" }];
  return records.map((s) => ({
    label,
    extRef: s.stockKeepingUnit ?? "",
    atf: s.availableToFulfill ?? "",
    ato: s.availableToOrder ?? "",
    onHand: s.onHand ?? "",
    reserved: s.reserved ?? s.reservations ?? "",
    futuresRaw: Array.isArray(s.futures) ? s.futures : [],
    safety: s.safetyStockCount ?? "",
  }));
}

function AvailTable({ labelHeader, extRefHeader = "Ext. Reference", rows }) {
  return (
    <table className="w-full text-xs border-collapse">
      <thead><tr className="bg-gray-50">
        {[labelHeader, extRefHeader, "ATF", "ATO", "Qty on Hand", "Reserved", "Futures", "Safety Stock"].map((h) => (
          <th key={h} className="border border-gray-200 px-3 py-1.5 text-left font-medium text-gray-600">{h}</th>
        ))}
      </tr></thead>
      <tbody>
        {rows.map((r, ri) => (
          <tr key={ri} className={ri % 2 === 0 ? "" : "bg-gray-50"}>
            <td className="border border-gray-200 px-3 py-1.5 text-[#00A1E0] font-medium">{r.label}</td>
            <td className="border border-gray-200 px-3 py-1.5 font-mono">{r.extRef}</td>
            <td className="border border-gray-200 px-3 py-1.5">{r.atf}</td>
            <td className="border border-gray-200 px-3 py-1.5">{r.ato}</td>
            <td className="border border-gray-200 px-3 py-1.5">{r.onHand}</td>
            <td className="border border-gray-200 px-3 py-1.5">{r.reserved}</td>
            <td className="border border-gray-200 px-3 py-1.5"><FuturesCell futures={r.futuresRaw} /></td>
            <td className="border border-gray-200 px-3 py-1.5">{r.safety}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// Floating result panel — shared for all three OCI modes
function OciResult({ mode, result, onClose, locationList }) {
  if (!result) return null;

  // locationList: [{ Name, ExternalReference }] — used to resolve locationIdentifier → Name
  const locMap = Object.fromEntries((locationList || []).map((l) => [l.ExternalReference, l.Name]));

  const isGreen = mode === "reservation" || mode === "release";
  const title = mode === "reservation" ? "Reservation created"
    : mode === "release" ? "Reservation released"
    : "Availability retrieved";

  // Normalize actual SF OCI response:
  // { locationGroups: [{ locationGroupIdentifier, inventoryRecords: [...] }], locations: [...] }
  const lgAvail = result.locationGroups || result.locationGroupAvailabilities || [];
  const locAvail = result.locations || result.locationAvailabilities || [];

  // Reservation/release: { reservationResults } or { releaseResults } — array of records
  const resRecords = result.reservationResults || result.releaseResults || [];

  const headerCls = isGreen
    ? "bg-green-600 border-b border-green-700"
    : "bg-gray-50 border-b border-gray-200";
  const titleCls = isGreen ? "text-white font-semibold text-sm" : "text-gray-700 font-semibold text-sm";
  const closeCls = isGreen ? "text-green-200 hover:text-white text-xl leading-none px-1" : "text-gray-400 hover:text-gray-700 text-xl leading-none px-1";
  const bodyCls = isGreen ? "bg-green-50" : "bg-white";

  const renderGroupTable = (groups) => {
    const rows = groups.flatMap((g) =>
      buildInvRows(g.inventoryRecords || g.stockKeepingUnitAvailabilities || [], g.locationGroupIdentifier || "—")
    );
    return (
      <div>
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Location Group</p>
        <AvailTable labelHeader="Location Group" extRefHeader="SKU" rows={rows} />
      </div>
    );
  };

  const renderLocationTable = (locs) => {
    const allSkus = new Set(locs.flatMap((l) => (l.inventoryRecords || []).map((s) => s.stockKeepingUnit).filter(Boolean)));
    const multiSku = allSkus.size > 1;
    const rows = [...locs].sort((a, b) => (a.locationIdentifier ?? "").localeCompare(b.locationIdentifier ?? "")).flatMap((l) => {
      const name = locMap[l.locationIdentifier] || l.locationIdentifier || "—";
      const records = l.inventoryRecords || l.stockKeepingUnitAvailabilities || [];
      if (records.length === 0) return [{ label: name, extRef: multiSku ? "" : (l.locationIdentifier ?? ""), atf: "", ato: "", onHand: "", reserved: "", futuresRaw: [], safety: "" }];
      return records.map((s) => ({
        label: name,
        extRef: multiSku ? (s.stockKeepingUnit ?? "") : (l.locationIdentifier ?? ""),
        atf: s.availableToFulfill ?? "",
        ato: s.availableToOrder ?? "",
        onHand: s.onHand ?? "",
        reserved: s.reserved ?? s.reservations ?? "",
        futuresRaw: Array.isArray(s.futures) ? s.futures : [],
        safety: s.safetyStockCount ?? "",
      }));
    });
    return (
      <div>
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Locations ({locs.length})</p>
        <AvailTable labelHeader="Location" extRefHeader={multiSku ? "SKU" : "Ext. Reference"} rows={rows} />
      </div>
    );
  };

  const renderContent = () => {
    // Reservation / release records table
    if (isGreen && resRecords.length > 0) {
      return (
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="bg-green-100">
              {["SKU", "Location", "Location Group", "Quantity", "Status"].map((h) => (
                <th key={h} className="border border-green-200 px-3 py-1.5 text-left font-medium text-green-800">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {resRecords.map((r, ri) => (
              <tr key={ri} className={ri % 2 === 0 ? "bg-white" : "bg-green-50"}>
                <td className="border border-green-200 px-3 py-1.5 font-mono">{r.stockKeepingUnit ?? ""}</td>
                <td className="border border-green-200 px-3 py-1.5">{r.locationIdentifier ?? ""}</td>
                <td className="border border-green-200 px-3 py-1.5">{r.locationGroupIdentifier ?? ""}</td>
                <td className="border border-green-200 px-3 py-1.5">{r.quantity ?? ""}</td>
                <td className="border border-green-200 px-3 py-1.5">
                  {r.success === false
                    ? <span className="text-red-600 font-medium">✗ {(r.errors || []).map((e) => e.message || e).join(", ") || "Error"}</span>
                    : <span className="text-green-700 font-medium">✓</span>
                  }
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      );
    }

    // Both tables when response has locationGroups + locations
    if (!isGreen && lgAvail.length > 0 && locAvail.length > 0) {
      return (
        <div className="space-y-6">
          {renderGroupTable(lgAvail)}
          {renderLocationTable(locAvail)}
        </div>
      );
    }

    if (!isGreen && lgAvail.length > 0) return renderGroupTable(lgAvail);
    if (!isGreen && locAvail.length > 0) return renderLocationTable(locAvail);

    // All other combinations → raw JSON
    return <pre className="text-xs whitespace-pre-wrap overflow-x-auto text-gray-600">{JSON.stringify(result, null, 2)}</pre>;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-16 px-4 bg-black/20" onClick={onClose}>
      <div
        className={`${bodyCls} rounded-lg shadow-2xl border border-gray-200 w-full max-w-5xl max-h-[80vh] flex flex-col`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={`${headerCls} flex items-center justify-between px-4 py-3 rounded-t-lg shrink-0`}>
          <span className={titleCls}>✓ {title}</span>
          <button onClick={onClose} className={closeCls}>×</button>
        </div>
        <div className="overflow-auto flex-1 p-4">
          {renderContent()}
        </div>
      </div>
    </div>
  );
}

export default function OciForm({ onFormChange, pendingRestore, onRestoreDone, activeCatalogId, onCatalogChange }) {
  const { t } = useLang();
  const [mode, setMode] = useState("availability");
  const [actionRequestId, setActionRequestId] = useState(genRequestId);
  const [items, setItems] = useState([emptyItem()]);
  // Global location selection — shared across all SKUs
  const [selectedLocationGroup, setSelectedLocationGroup] = useState("");
  const [selectedLocations, setSelectedLocations] = useState([]);
  const [locationFilter, setLocationFilter] = useState("");
  // Reference data
  const [locations, setLocations] = useState([]);
  const [locationGroups, setLocationGroups] = useState([]);
  const [catalogs, setCatalogs] = useState([]);
  const [localCatalogId, setLocalCatalogId] = useState(null);
  const [localCatalogProducts, setLocalCatalogProducts] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const fetchCatalogs = () =>
    cachedGet("/catalogs").then(setCatalogs).catch(() => {});

  const selectCatalog = async (id) => {
    const numId = id ? Number(id) : null;
    setLocalCatalogId(numId);
    if (numId) {
      const data = await cachedGet(`/catalogs/${numId}/products`).catch(() => []);
      setLocalCatalogProducts(data);
      onCatalogChange?.(numId, data);
    } else {
      setLocalCatalogProducts([]);
      onCatalogChange?.(null, []);
    }
  };

  useEffect(() => {
    Promise.all([
      cachedGet("/oci/locations").then(setLocations).catch(() => {}),
      cachedGet("/oci/location-groups").then(setLocationGroups).catch(() => {}),
      fetchCatalogs(),
    ]);
  }, []);

  useEffect(() => {
    if (activeCatalogId && activeCatalogId !== localCatalogId) {
      cachedGet(`/catalogs/${activeCatalogId}/products`)
        .then((data) => { setLocalCatalogId(activeCatalogId); setLocalCatalogProducts(data); })
        .catch(() => {});
    }
  }, [activeCatalogId]);

  useEffect(() => {
    onFormChange?.({ mode, actionRequestId, selectedLocationGroup, selectedLocations, _catalogId: localCatalogId, _items: items }, items, null);
    let previewBody;
    if (mode === "availability") {
      // Build items with global location injected for payload preview
      const enriched = items.map((item) => ({
        ...item,
        location_group_identifier: selectedLocationGroup,
        location_identifiers: selectedLocations,
      }));
      previewBody = buildAvailabilityPayload(enriched);
    } else {
      const records = items.map((item) => {
        const rec = { quantity: item.quantity, stockKeepingUnit: item.sku };
        if (selectedLocations.length === 1) rec.locationIdentifier = selectedLocations[0];
        else if (selectedLocationGroup) rec.locationGroupIdentifier = selectedLocationGroup;
        return rec;
      });
      if (mode === "reservation") {
        previewBody = { actionRequestId, createRecords: records };
      } else {
        previewBody = { releaseRecords: records.map((r) => ({ actionRequestId, ...r })) };
      }
    }
    addLog({ type: "preview", label: "OCI Payload", body: previewBody });
  }, [mode, actionRequestId, items, selectedLocationGroup, selectedLocations, localCatalogId]);

  useEffect(() => {
    if (!pendingRestore) return;
    const { form: savedForm, products: savedItems } = pendingRestore;
    if (savedForm?.mode) setMode(savedForm.mode);
    if (savedForm?.actionRequestId) setActionRequestId(savedForm.actionRequestId);
    if (savedForm?.selectedLocationGroup !== undefined) setSelectedLocationGroup(savedForm.selectedLocationGroup);
    if (Array.isArray(savedForm?.selectedLocations)) setSelectedLocations(savedForm.selectedLocations);
    if (savedForm?._catalogId) selectCatalog(savedForm._catalogId);
    if (savedItems?.length) setItems(savedItems.map((item) => ({ sku: item.sku, quantity: item.quantity ?? 1 })));
    onRestoreDone?.();
  }, [pendingRestore]);

  const updateItem = (i, field, value) => {
    const updated = [...items];
    updated[i] = { ...updated[i], [field]: value };
    setItems(updated);
  };

  const addItem = () => setItems((prev) => [...prev, emptyItem()]);

  const removeItem = (i) => setItems((prev) => prev.filter((_, idx) => idx !== i));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setResult(null);
    try {
      const endpoint = mode === "availability" ? "/oci/availability"
        : mode === "release" ? "/oci/releases"
        : "/oci/reservations";
      const enrichedItems = items.map((item) => ({
        ...item,
        location_group_identifier: selectedLocationGroup,
        location_identifiers: selectedLocations,
        location_identifier: "",
      }));
      const body = mode === "availability"
        ? { items: enrichedItems }
        : { action_request_id: actionRequestId, items: enrichedItems };
      const res = await api.post(endpoint, body);
      setResult(res.data.result);
      addLog({ type: "preview", label: "OCI Payload", body: res.data.payload });
    } catch (err) {
      const detail = err.response?.data?.detail;
      setError(typeof detail === "string" ? detail : JSON.stringify(detail, null, 2));
    } finally {
      setSubmitting(false);
    }
  };

  const inputCls = "w-full border rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-[#00A1E0]";
  const labelCls = "block text-xs font-medium text-gray-600 mb-0.5";
  const sectionCls = "border rounded-lg p-4 space-y-3";

  return (
    <>
      {/* Floating result panel — all three modes */}
      {result && (
        <OciResult mode={mode} result={result} onClose={() => setResult(null)} locationList={locations} />
      )}

      <form onSubmit={handleSubmit} className="space-y-5">
        <h2 className="text-lg font-semibold text-gray-800">OmniChannel Inventory</h2>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded px-4 py-2 text-sm whitespace-pre-wrap">
            {error}
          </div>
        )}

        {/* Mode selector */}
        <div className={sectionCls}>
          <p className="text-sm font-semibold text-gray-700">Operation</p>
          <div className="flex gap-3">
            {[["availability", "Get Availability"], ["reservation", "Create Reservation"], ["release", "Release Reservation"], ["manage-stock", "Manage Stock"]].map(([val, label]) => (
              <label key={val} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="oci_mode"
                  value={val}
                  checked={mode === val}
                  onChange={() => setMode(val)}
                  className="accent-[#00A1E0]"
                />
                <span className="text-sm">{label}</span>
              </label>
            ))}
          </div>
          {(mode === "reservation" || mode === "release") && (
            <div>
              <label className={labelCls}>{mode === "reservation" ? "Action Request ID" : "Reservation ID"}</label>
              <div className="flex gap-2">
                <input className={`${inputCls} flex-1 font-mono text-xs`} value={actionRequestId}
                  onChange={(e) => setActionRequestId(e.target.value)} />
                <button type="button" onClick={() => setActionRequestId(genRequestId())}
                  className="text-xs bg-gray-100 border rounded px-2 hover:bg-gray-200">↺</button>
              </div>
            </div>
          )}
        </div>

        {mode === "manage-stock" && <ManageStockForm />}

        {/* Global Location selection — mutually exclusive: group OR locations */}
        <div className={sectionCls} style={mode === "manage-stock" ? { display: "none" } : {}}>
          <p className="text-sm font-semibold text-gray-700">Location</p>

          {/* Location Group */}
          <div>
            <label className={labelCls}>Location Group</label>
            <select
              className={inputCls}
              value={selectedLocationGroup}
              onChange={(e) => {
                setSelectedLocationGroup(e.target.value);
                if (e.target.value) setSelectedLocations([]);
              }}
            >
              <option value="">— none —</option>
              {locationGroups.map((lg) => (
                <option key={lg.Id} value={lg.ExternalReference || lg.Id}>
                  {lg.LocationGroupName}{lg.ExternalReference ? ` (${lg.ExternalReference})` : ""}
                </option>
              ))}
            </select>
          </div>

          {/* Specific Locations */}
          <div>
            <label className={labelCls}>Locations</label>
            {selectedLocations.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-2">
                {selectedLocations.map((extRef) => {
                  const loc = locations.find((l) => l.ExternalReference === extRef);
                  return (
                    <span key={extRef} className="bg-blue-100 text-blue-800 text-xs px-2 py-0.5 rounded-full flex items-center gap-1">
                      {loc?.Name || extRef}
                      <button
                        type="button"
                        onClick={() => setSelectedLocations((prev) => prev.filter((x) => x !== extRef))}
                        className="hover:text-red-600 font-bold"
                      >×</button>
                    </span>
                  );
                })}
              </div>
            )}
            <input
              className={inputCls}
              placeholder="Filter locations…"
              value={locationFilter}
              onChange={(e) => setLocationFilter(e.target.value)}
            />
            {locationFilter.length > 0 && (
              <div className="border rounded mt-0.5 shadow-sm bg-white max-h-40 overflow-y-auto">
                {locations
                  .filter((l) => {
                    const q = locationFilter.toLowerCase();
                    return (l.Name || "").toLowerCase().includes(q) || (l.ExternalReference || "").toLowerCase().includes(q);
                  })
                  .map((l) => {
                    const extRef = l.ExternalReference || l.Id;
                    const selected = selectedLocations.includes(extRef);
                    return (
                      <button
                        type="button"
                        key={l.Id}
                        onClick={() => {
                          if (!selected) {
                            setSelectedLocations((prev) => [...prev, extRef]);
                            setSelectedLocationGroup("");
                          }
                          setLocationFilter("");
                        }}
                        className={`w-full text-left px-3 py-1.5 text-xs border-b last:border-0 flex justify-between items-center ${selected ? "bg-blue-50 text-blue-700" : "hover:bg-gray-50"}`}
                      >
                        <span>{l.Name}</span>
                        <span className="text-gray-400 font-mono">{l.ExternalReference}</span>
                      </button>
                    );
                  })}
              </div>
            )}
          </div>
        </div>

        {/* Items */}
        <div className={sectionCls} style={mode === "manage-stock" ? { display: "none" } : {}}>
          <p className="text-sm font-semibold text-gray-700">Items</p>

          {/* Catalog selector */}
          <div>
            <label className={labelCls}>{t.catalogLabel}</label>
            <select className={inputCls} value={localCatalogId || ""}
              onChange={(e) => selectCatalog(e.target.value)} onFocus={fetchCatalogs}>
              <option value="">{t.selectCatalogOption}</option>
              {catalogs.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.name}{cat.description ? ` — ${cat.description}` : ""} ({cat.product_count})
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-3">
            {items.map((item, i) => (
              <div key={i} className="bg-gray-50 rounded p-3 space-y-2 border">
                {/* Product picker from catalog */}
                {localCatalogId && (
                  <div>
                    <label className={labelCls}>{t.selectProductOption}</label>
                    <select className={inputCls}
                      value={localCatalogProducts.find((p) => p.sku === item.sku)?.id || ""}
                      onChange={(e) => {
                        const cp = localCatalogProducts.find((p) => String(p.id) === e.target.value);
                        if (cp) updateItem(i, "sku", cp.sku);
                      }}>
                      <option value="">— select from catalog —</option>
                      {localCatalogProducts.map((cp) => (
                        <option key={cp.id} value={cp.id}>{cp.name} ({cp.sku})</option>
                      ))}
                    </select>
                  </div>
                )}
                <div className="flex gap-2 items-end">
                  <div className="flex-1">
                    <label className={labelCls}>SKU *</label>
                    <input className={inputCls} value={item.sku}
                      onChange={(e) => updateItem(i, "sku", e.target.value)} placeholder="SKU" />
                  </div>
                  {mode !== "availability" && (
                    <div className="w-24">
                      <label className={labelCls}>Qty</label>
                      <input type="number" min="1" className={inputCls} value={item.quantity}
                        onChange={(e) => updateItem(i, "quantity", e.target.value)} />
                    </div>
                  )}
                  {items.length > 1 && (
                    <button type="button" onClick={() => removeItem(i)}
                      className="text-red-400 hover:text-red-600 text-sm px-2 pb-1.5">✕</button>
                  )}
                </div>

              </div>
            ))}
          </div>
          <button type="button" onClick={addItem} className="text-sm text-[#00A1E0] hover:underline">
            + Add item
          </button>
        </div>

        {mode !== "manage-stock" && (
          <button type="submit" disabled={submitting}
            className="w-full bg-[#00A1E0] text-white px-6 py-2.5 rounded font-medium hover:bg-[#0086b3] transition disabled:opacity-50">
            {submitting ? "Submitting…" : mode === "reservation" ? "Create Reservation" : mode === "release" ? "Release" : "Get Availability"}
          </button>
        )}
      </form>
    </>
  );
}
