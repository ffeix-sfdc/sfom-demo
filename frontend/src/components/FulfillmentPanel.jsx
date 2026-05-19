import React, { useState, useEffect, useCallback, useRef } from "react";
import api from "../api/client";
import { getLocations } from "../api/locationCache";
import { addLog } from "../log/store";

const LOCATION_KEY      = "fulfillment_location_id";
const LOCATION_NAME_KEY = "fulfillment_location_name";

const PICKUP_STATUSES = ["Draft", "New", "Allocated", "Accepted", "Pickpack", "Pick Complete", "Ready for Pickup", "Fulfilled"];
const SHIP_STATUSES   = ["Draft", "New", "Allocated", "Assigned", "Pickpack", "Pick Complete", "Pack Complete", "Ready To Ship", "Shipped", "Fulfilled"];
const TERMINAL        = ["Cancelled", "Rejected"];
const ARROW_PX        = 7;

function getSequence(recordType) {
  return recordType === "Ship_From_Store" ? SHIP_STATUSES : PICKUP_STATUSES;
}

function stepClip(i, total) {
  const isFirst = i === 0;
  const isLast  = i === total - 1;
  const r = `${ARROW_PX}px`;
  const w = `calc(100% - ${ARROW_PX}px)`;
  if (isFirst && isLast) return "none";
  if (isFirst) return `polygon(0 0, ${w} 0, 100% 50%, ${w} 100%, 0 100%)`;
  if (isLast)  return `polygon(${r} 0, 100% 0, 100% 100%, ${r} 100%, 0 50%)`;
  return `polygon(${r} 0, ${w} 0, 100% 50%, ${w} 100%, ${r} 100%, 0 50%)`;
}

function StatusStepper({ fo, onStatusChange, saving }) {
  const sequence    = getSequence(fo.record_type);
  const currentIdx  = sequence.indexOf(fo.status);
  const isTerminal  = TERMINAL.includes(fo.status);

  if (isTerminal) {
    return (
      <div className="px-3 pb-2">
        <span className="text-[10px] px-2 py-0.5 rounded bg-red-50 text-red-400 font-medium">{fo.status}</span>
      </div>
    );
  }

  return (
    <div className="px-3 pb-2.5 overflow-x-auto">
      <div className="flex items-stretch" style={{ gap: 0 }}>
        {sequence.map((status, i) => {
          const isPast    = currentIdx >= 0 && i < currentIdx;
          const isCurrent = i === currentIdx;
          const isFuture  = currentIdx >= 0 && i > currentIdx;
          const canClick  = isFuture && !saving;

          const bg = isPast ? "#6ee7b7" : isCurrent ? "#1e3a5f" : "#e5e7eb";
          const textColor = isPast ? "#065f46" : isCurrent ? "#ffffff" : "#9ca3af";

          return (
            <button
              key={status}
              type="button"
              disabled={!canClick}
              onClick={canClick ? () => onStatusChange(status) : undefined}
              title={isPast ? status : canClick ? `Advance to "${status}"` : undefined}
              style={{
                background: bg,
                color: textColor,
                clipPath: stepClip(i, sequence.length),
                marginLeft: i > 0 ? "-1px" : 0,
                zIndex: sequence.length - i,
                position: "relative",
                minWidth: isPast ? "26px" : undefined,
              }}
              className={`px-3 py-1 text-[10px] font-medium whitespace-nowrap leading-4 ${canClick ? "cursor-pointer" : "cursor-default"}`}
            >
              {isPast ? "✓" : status}
            </button>
          );
        })}

        {/* Terminal actions — separated by a gap */}
        {TERMINAL.map((status, ti) => (
          <button
            key={status}
            type="button"
            disabled={saving}
            onClick={!saving ? () => onStatusChange(status) : undefined}
            title={`Mark as ${status}`}
            style={{
              background: "#f3f4f6",
              color: "#9ca3af",
              clipPath: stepClip(ti === 0 ? 0 : 1, 2),
              marginLeft: ti === 0 ? "8px" : "-1px",
              zIndex: 2 - ti,
              position: "relative",
            }}
            className={`px-3 py-1 text-[10px] font-medium whitespace-nowrap leading-4 ${saving ? "cursor-default" : "cursor-pointer hover:!bg-red-50 hover:!text-red-400"}`}
            onMouseEnter={(e) => { if (!saving) { e.currentTarget.style.background = "#fef2f2"; e.currentTarget.style.color = "#f87171"; } }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "#f3f4f6"; e.currentTarget.style.color = "#9ca3af"; }}
          >
            {status}
          </button>
        ))}
      </div>
    </div>
  );
}

function FoLines({ foId }) {
  const [lines, setLines] = useState(null);

  useEffect(() => {
    api.get(`/fulfillment/orders/${foId}/lines`)
      .then((r) => setLines(r.data))
      .catch(() => setLines([]));
  }, [foId]);

  if (!lines) return <div className="px-3 py-2 text-xs text-gray-400">Loading…</div>;
  if (lines.length === 0) return <div className="px-3 py-2 text-xs text-gray-400">No product lines.</div>;

  return (
    <div className="border-t bg-gray-50 divide-y divide-gray-100">
      {lines.map((l) => (
        <div key={l.id} className="px-3 py-1.5 flex items-center gap-2 text-xs">
          <div className="flex-1 min-w-0">
            <p className="text-gray-700 font-medium truncate">{l.product_name || l.description || "—"}</p>
            {l.sku && <p className="text-gray-400">SKU: {l.sku}</p>}
          </div>
          <span className="text-gray-500 shrink-0">× {l.quantity}</span>
          <span className="text-gray-600 shrink-0 font-mono">{l.total?.toFixed(2)}</span>
        </div>
      ))}
    </div>
  );
}

function FoCard({ fo: initialFo, onExpand, expanded }) {
  const [fo, setFo] = useState(initialFo);
  const [saving, setSaving] = useState(false);
  const [statusError, setStatusError] = useState(null);

  // Sync when parent refreshes the list
  useEffect(() => { setFo(initialFo); }, [initialFo.id, initialFo.status]); // eslint-disable-line

  const handleStatusChange = async (newStatus) => {
    setSaving(true);
    setStatusError(null);
    const payload = { status: newStatus };
    addLog({ type: "preview", label: `FulfillmentOrder ${fo.number} — set status`, body: payload });
    try {
      await api.patch(`/fulfillment/orders/${fo.id}/status`, payload);
      setFo((prev) => ({ ...prev, status: newStatus }));
    } catch (e) {
      const detail = e.response?.data;
      const msg = Array.isArray(detail)
        ? detail[0]?.message
        : detail?.detail || "Failed to update status";
      setStatusError(msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="border rounded-lg overflow-hidden">
      <button type="button" onClick={() => { onExpand(fo.id); addLog({ type: "preview", label: `FulfillmentOrder ${fo.number}`, body: fo }); }}
        className="w-full text-left px-3 py-2 hover:bg-gray-50 transition-colors">
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono font-semibold text-gray-700 shrink-0">{fo.number}</span>
          <span className="text-xs text-gray-400 flex-1 truncate">
            {fo.account_name || fo.fulfilled_to || "—"}
          </span>
          {fo.product_count != null && (
            <span className="text-xs text-gray-400 shrink-0">{fo.product_count} product{fo.product_count !== 1 ? "s" : ""}</span>
          )}
          <span className="text-xs text-gray-500 shrink-0 font-mono">
            {fo.total != null ? fo.total.toFixed(2) : "—"}
          </span>
          <span className="text-gray-300 text-xs shrink-0">{expanded ? "▲" : "▶"}</span>
        </div>
        {fo.order_number && (
          <p className="text-[10px] text-gray-400 mt-0.5">Order {fo.order_number}</p>
        )}
      </button>

      {saving && <p className="px-3 pb-0.5 text-[10px] text-gray-400">Updating…</p>}
      <StatusStepper fo={fo} onStatusChange={handleStatusChange} saving={saving} />
      {statusError && <p className="px-3 pb-2 -mt-1 text-xs text-red-500">{statusError}</p>}

      {expanded && <FoLines foId={fo.id} />}
    </div>
  );
}

function FoGroup({ title, orders, icon }) {
  const [expandedId, setExpandedId] = useState(null);
  const toggle = (id) => setExpandedId((prev) => (prev === id ? null : id));

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <span className="text-base">{icon}</span>
        <h3 className="text-sm font-semibold text-gray-700">{title}</h3>
        <span className="text-xs text-gray-400 bg-gray-100 rounded-full px-2 py-0.5">{orders.length}</span>
      </div>
      {orders.length === 0 ? (
        <p className="text-xs text-gray-400 pl-1">No orders.</p>
      ) : (
        <div className="space-y-1.5">
          {orders.map((fo) => (
            <FoCard key={fo.id} fo={fo} expanded={expandedId === fo.id} onExpand={toggle} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function FulfillmentPanel() {
  const [locations, setLocations]         = useState([]);
  const [filter, setFilter]               = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [locationId, setLocationId]       = useState(() => sessionStorage.getItem(LOCATION_KEY) || "");
  const [locationName, setLocationName]   = useState(() => sessionStorage.getItem(LOCATION_NAME_KEY) || "");
  const [orders, setOrders]               = useState(null);
  const [loading, setLoading]             = useState(false);
  const [error, setError]                 = useState(null);
  const inputRef   = useRef(null);
  const dropdownRef = useRef(null);

  useEffect(() => { getLocations().then(setLocations).catch(() => {}); }, []);

  useEffect(() => {
    const handler = (e) => {
      if (!dropdownRef.current?.contains(e.target)) setShowSuggestions(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const fetchOrders = useCallback(async (locId) => {
    if (!locId) return;
    setLoading(true);
    setError(null);
    try {
      const r = await api.get("/fulfillment/orders", { params: { location_id: locId } });
      setOrders(r.data);
    } catch (e) {
      setError(e.response?.data?.detail || "Failed to load orders");
      setOrders(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (locationId) fetchOrders(locationId);
    else setOrders(null);
  }, [locationId]); // eslint-disable-line

  const suggestions = filter.trim().length > 0
    ? locations.filter((l) =>
        l.Name.toLowerCase().includes(filter.toLowerCase()) ||
        (l.ExternalReference || "").toLowerCase().includes(filter.toLowerCase())
      ).slice(0, 10)
    : [];

  const selectLocation = (loc) => {
    setLocationId(loc.Id);
    setLocationName(loc.Name);
    sessionStorage.setItem(LOCATION_KEY, loc.Id);
    sessionStorage.setItem(LOCATION_NAME_KEY, loc.Name);
    setFilter("");
    setShowSuggestions(false);
  };

  const clearLocation = () => {
    setLocationId("");
    setLocationName("");
    sessionStorage.removeItem(LOCATION_KEY);
    sessionStorage.removeItem(LOCATION_NAME_KEY);
    setOrders(null);
    setFilter("");
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const inputCls = "w-full border rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-[#00A1E0]";

  return (
    <div className="space-y-5">
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <label className="text-xs font-medium text-gray-600">Location</label>
          {locationId && orders && (
            <button type="button" onClick={() => fetchOrders(locationId)}
              className="text-xs text-[#00A1E0] hover:underline">
              ↻ Refresh
            </button>
          )}
        </div>

        {locationId ? (
          <div className="flex items-center gap-2 border rounded px-2 py-1.5 bg-blue-50 border-blue-200">
            <span className="text-sm text-blue-800 flex-1 truncate font-medium">{locationName}</span>
            <button type="button" onClick={clearLocation}
              className="text-blue-400 hover:text-red-500 text-sm leading-none shrink-0">×</button>
          </div>
        ) : (
          <div className="relative" ref={dropdownRef}>
            <input
              ref={inputRef}
              className={inputCls}
              placeholder="Type to filter locations…"
              value={filter}
              onChange={(e) => { setFilter(e.target.value); setShowSuggestions(true); }}
              onFocus={() => filter && setShowSuggestions(true)}
            />
            {showSuggestions && suggestions.length > 0 && (
              <div className="absolute z-20 left-0 right-0 top-full mt-0.5 bg-white border rounded shadow-lg max-h-56 overflow-y-auto">
                {suggestions.map((l) => (
                  <button key={l.Id} type="button"
                    onMouseDown={(e) => { e.preventDefault(); selectLocation(l); }}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50 border-b last:border-0">
                    <span className="font-medium text-gray-800">{l.Name}</span>
                    {l.ExternalReference && (
                      <span className="text-xs text-gray-400 ml-2">{l.ExternalReference}</span>
                    )}
                    {l.LocationType && (
                      <span className="text-xs text-gray-300 ml-1">· {l.LocationType}</span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {loading && <p className="text-xs text-gray-400">Loading fulfillment orders…</p>}
      {error && <p className="text-xs text-red-500">{error}</p>}

      {orders && !loading && (
        <div className="space-y-6">
          <FoGroup title="Pickup" icon="🏪" orders={orders.pickup} />
          <FoGroup title="Ship from Store" icon="📦" orders={orders.ship} />
        </div>
      )}

      {!locationId && !loading && (
        <p className="text-xs text-gray-400">Select a location to view fulfillment orders.</p>
      )}
    </div>
  );
}
