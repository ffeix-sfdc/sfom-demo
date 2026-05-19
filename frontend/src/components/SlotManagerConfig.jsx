import React, { useState, useEffect } from "react";
import api from "../api/client";
import { getSlots, invalidateSlots, clearSlotsForConfig, clearSlotsForLocation } from "../api/slotCache";

const TODAY = new Date().toISOString().slice(0, 10);

const STATUS_COLORS = {
  Confirmed: "bg-green-100 text-green-800 border-green-200",
  Pending: "bg-yellow-100 text-yellow-800 border-yellow-200",
  Cancelled: "bg-red-100 text-red-600 border-red-200",
};

export default function SlotManagerConfig({ open }) {
  const [configs, setConfigs] = useState([]);
  const [locations, setLocations] = useState([]);
  const [selectedConfig, setSelectedConfig] = useState(null);
  const [showNewConfig, setShowNewConfig] = useState(false);
  const [showTools, setShowTools] = useState(false);
  const [newCfg, setNewCfg] = useState({ location_id: "", slot_duration_minutes: 15, max_concurrent_slots: 1 });
  const [savingCfg, setSavingCfg] = useState(false);

  // Booking view
  const [bookingDate, setBookingDate] = useState(TODAY);
  const [slots, setSlots] = useState(null);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [bookings, setBookings] = useState([]);
  const [bookingForm, setBookingForm] = useState(null); // { slotTime } | null
  const [orderSearch, setOrderSearch] = useState("");
  const [orderResults, setOrderResults] = useState([]);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [submittingBooking, setSubmittingBooking] = useState(false);

  // Generate / Clean
  const [genForm, setGenForm] = useState({ start_date: TODAY, end_date: TODAY, fill_rate: 0.4 });
  const [generating, setGenerating] = useState(false);
  const [genResult, setGenResult] = useState(null);
  const [cleanForm, setCleanForm] = useState({ start_date: TODAY, end_date: TODAY, keep_linked_orders: true });
  const [cleaning, setCleaning] = useState(false);
  const [cleanResult, setCleanResult] = useState(null);

  const inputCls = "w-full border rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-[#00A1E0]";
  const labelCls = "block text-xs font-medium text-gray-600 mb-0.5";
  const sectionCls = "border rounded-lg p-4 space-y-3";

  useEffect(() => {
    if (!open) return;
    api.get("/slot-manager/configs").then((r) => setConfigs(r.data)).catch(() => {});
    api.get("/oci/locations").then((r) => setLocations(r.data)).catch(() => {});
  }, [open]);

  useEffect(() => {
    if (!selectedConfig) { setSlots(null); setBookings([]); return; }
    fetchSlots();
    fetchBookings();
  }, [selectedConfig, bookingDate]);

  const invalidateConfigSlots = () => {
    if (!selectedConfig) return;
    clearSlotsForConfig(selectedConfig.Id);
    const locationRef = selectedConfig.Location__r?.ExternalReference;
    if (locationRef) clearSlotsForLocation(locationRef);
  };

  const fetchSlots = async ({ invalidate = false } = {}) => {
    if (!selectedConfig) return;
    if (invalidate) {
      invalidateSlots({ config_id: selectedConfig.Id, date: bookingDate });
      const locationRef = selectedConfig.Location__r?.ExternalReference;
      if (locationRef) invalidateSlots({ location_ref: locationRef, date: bookingDate });
    }
    setLoadingSlots(true);
    try {
      const data = await getSlots({ config_id: selectedConfig.Id, date: bookingDate });
      setSlots(data.slots);
    } catch { setSlots([]); }
    finally { setLoadingSlots(false); }
  };

  const fetchBookings = async () => {
    if (!selectedConfig) return;
    try {
      const r = await api.get("/slot-manager/bookings", { params: { config_id: selectedConfig.Id, date: bookingDate } });
      setBookings(r.data);
    } catch { setBookings([]); }
  };

  const saveConfig = async () => {
    setSavingCfg(true);
    try {
      await api.post("/slot-manager/configs", newCfg);
      const r = await api.get("/slot-manager/configs");
      setConfigs(r.data);
      setShowNewConfig(false);
    } finally { setSavingCfg(false); }
  };

  const searchOrders = async () => {
    if (!orderSearch.trim()) return;
    try {
      const r = await api.get("/orders/search", { params: { q: orderSearch.trim() } });
      setOrderResults(r.data || []);
    } catch { setOrderResults([]); }
  };

  const submitBooking = async () => {
    if (!bookingForm || !selectedConfig) return;
    setSubmittingBooking(true);
    try {
      const iso = `${bookingDate}T${bookingForm.slotTime}:00.000+0000`;
      const body = {
        slot_config_id: selectedConfig.Id,
        slot_datetime: iso,
        location_ref: selectedConfig.Location__r?.ExternalReference || "",
        status: "Confirmed",
      };
      if (selectedOrder) body.order_summary_id = selectedOrder.Id;
      await api.post("/slot-manager/bookings", body);
      setBookingForm(null);
      setSelectedOrder(null);
      setOrderSearch("");
      setOrderResults([]);
      invalidateConfigSlots();
      await fetchSlots({ invalidate: true });
      await fetchBookings();
    } finally { setSubmittingBooking(false); }
  };

  const cancelBooking = async (id) => {
    await api.delete(`/slot-manager/bookings/${id}`);
    invalidateConfigSlots();
    await fetchSlots({ invalidate: true });
    await fetchBookings();
  };

  const generate = async () => {
    if (!selectedConfig) return;
    setGenerating(true);
    setGenResult(null);
    try {
      const r = await api.post("/slot-manager/bookings/generate", {
        config_id: selectedConfig.Id,
        location_ref: selectedConfig.Location__r?.ExternalReference || "",
        ...genForm,
      });
      setGenResult(r.data);
      invalidateConfigSlots();
      await fetchSlots({ invalidate: true });
      await fetchBookings();
    } finally { setGenerating(false); }
  };

  const clean = async () => {
    if (!selectedConfig) return;
    setCleaning(true);
    setCleanResult(null);
    try {
      const locationRef = selectedConfig.Location__r?.ExternalReference || "";
      const r = await api.post("/slot-manager/bookings/clean", {
        config_id: selectedConfig.Id,
        location_ref: locationRef,
        ...cleanForm,
      });
      setCleanResult(r.data);
      invalidateConfigSlots();
      await fetchSlots({ invalidate: true });
      await fetchBookings();
    } finally { setCleaning(false); }
  };

  return (
    <div className="space-y-4">
      {/* Config selector */}
      <div className={sectionCls}>
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-gray-700">Store Configuration</p>
          <div className="flex items-center gap-3">
            {selectedConfig && (
              <button type="button" onClick={() => setShowTools((v) => !v)}
                className="text-xs text-gray-500 hover:text-gray-700 border rounded px-2 py-1 hover:bg-gray-50">
                {showTools ? "Hide tools ▲" : "Tools ▼"}
              </button>
            )}
            <button type="button" onClick={() => setShowNewConfig((v) => !v)}
              className="text-xs text-[#00A1E0] hover:underline">
              {showNewConfig ? "Cancel" : "+ New config"}
            </button>
          </div>
        </div>

        {showNewConfig && (
          <div className="bg-gray-50 border rounded p-3 space-y-2">
            <div>
              <label className={labelCls}>Location *</label>
              <select className={inputCls} value={newCfg.location_id}
                onChange={(e) => setNewCfg((p) => ({ ...p, location_id: e.target.value }))}>
                <option value="">— select —</option>
                {locations.map((l) => (
                  <option key={l.Id} value={l.Id}>{l.Name}{l.ExternalReference ? ` (${l.ExternalReference})` : ""}</option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className={labelCls}>Slot Duration (min)</label>
                <input type="number" min="5" className={inputCls} value={newCfg.slot_duration_minutes}
                  onChange={(e) => setNewCfg((p) => ({ ...p, slot_duration_minutes: Number(e.target.value) }))} />
              </div>
              <div>
                <label className={labelCls}>Max Concurrent</label>
                <input type="number" min="1" className={inputCls} value={newCfg.max_concurrent_slots}
                  onChange={(e) => setNewCfg((p) => ({ ...p, max_concurrent_slots: Number(e.target.value) }))} />
              </div>
            </div>
            <button type="button" onClick={saveConfig} disabled={savingCfg || !newCfg.location_id}
              className="w-full bg-[#00A1E0] text-white text-sm py-1.5 rounded hover:bg-[#0086b3] disabled:opacity-50">
              {savingCfg ? "Saving…" : "Save Config"}
            </button>
          </div>
        )}

        {/* Generate / Clean tools (collapsible) */}
        {selectedConfig && showTools && (
          <div className="space-y-3 pt-1">
            {/* Generate */}
            <div className="bg-gray-50 border rounded p-3 space-y-2">
              <p className="text-xs font-semibold text-gray-600">Generate Random Bookings</p>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className={labelCls}>From</label>
                  <input type="date" className={inputCls} value={genForm.start_date}
                    onChange={(e) => setGenForm((p) => ({ ...p, start_date: e.target.value }))} />
                </div>
                <div>
                  <label className={labelCls}>To</label>
                  <input type="date" className={inputCls} value={genForm.end_date}
                    onChange={(e) => setGenForm((p) => ({ ...p, end_date: e.target.value }))} />
                </div>
                <div>
                  <label className={labelCls}>Fill rate ({Math.round(genForm.fill_rate * 100)}%)</label>
                  <input type="range" min="0" max="1" step="0.05" className="w-full mt-1.5"
                    value={genForm.fill_rate}
                    onChange={(e) => setGenForm((p) => ({ ...p, fill_rate: parseFloat(e.target.value) }))} />
                </div>
              </div>
              <button type="button" onClick={generate} disabled={generating}
                className="w-full border border-[#00A1E0] text-[#00A1E0] text-sm py-1.5 rounded hover:bg-blue-50 disabled:opacity-50">
                {generating ? "Generating…" : "Generate"}
              </button>
              {genResult && <p className="text-xs text-green-700">✓ {genResult.created} bookings created</p>}
            </div>

            {/* Clean */}
            <div className="bg-gray-50 border rounded p-3 space-y-2">
              <p className="text-xs font-semibold text-gray-600">Clean Bookings</p>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className={labelCls}>From</label>
                  <input type="date" className={inputCls} value={cleanForm.start_date}
                    onChange={(e) => setCleanForm((p) => ({ ...p, start_date: e.target.value }))} />
                </div>
                <div>
                  <label className={labelCls}>To</label>
                  <input type="date" className={inputCls} value={cleanForm.end_date}
                    onChange={(e) => setCleanForm((p) => ({ ...p, end_date: e.target.value }))} />
                </div>
              </div>
              <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer">
                <input type="checkbox" className="accent-[#00A1E0]"
                  checked={cleanForm.keep_linked_orders}
                  onChange={(e) => setCleanForm((p) => ({ ...p, keep_linked_orders: e.target.checked }))} />
                Keep bookings linked to an Order Summary
              </label>
              <button type="button" onClick={clean} disabled={cleaning}
                className="w-full border border-red-300 text-red-600 text-sm py-1.5 rounded hover:bg-red-50 disabled:opacity-50">
                {cleaning ? "Cleaning…" : "Delete bookings in range"}
              </button>
              {cleanResult && (
                <p className="text-xs text-gray-600">
                  {cleanResult.deleted} deleted{cleanResult.kept_linked ? " (linked orders kept)" : ""}
                </p>
              )}
            </div>
          </div>
        )}

        <div>
          <label className={labelCls}>Active Config</label>
          <select className={inputCls}
            value={selectedConfig?.Id || ""}
            onChange={(e) => {
              const cfg = configs.find((c) => c.Id === e.target.value) || null;
              setSelectedConfig(cfg);
              setShowTools(false);
            }}>
            <option value="">— select a store config —</option>
            {configs.map((c) => (
              <option key={c.Id} value={c.Id}>
                {c.Location__r?.Name || c.Id} — {c.SlotDurationMinutes__c}min × {c.MaxConcurrentSlots__c}
              </option>
            ))}
          </select>
        </div>
      </div>

      {selectedConfig && (
        <>
          {/* Date + slot grid */}
          <div className={sectionCls}>
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-gray-700">Availability</p>
              <input type="date" className="border rounded px-2 py-1 text-sm"
                value={bookingDate} onChange={(e) => setBookingDate(e.target.value)} />
            </div>

            {loadingSlots && <p className="text-xs text-gray-400">Loading slots…</p>}

            {slots && slots.length === 0 && (
              <p className="text-xs text-gray-400">Store closed on this day or no slots configured.</p>
            )}

            {slots && slots.length > 0 && (
              <div className="grid grid-cols-4 gap-1.5">
                {slots.map((s) => (
                  <button
                    key={s.time}
                    type="button"
                    disabled={s.available === 0}
                    onClick={() => { setBookingForm({ slotTime: s.time }); setSelectedOrder(null); setOrderSearch(""); setOrderResults([]); }}
                    className={`rounded px-2 py-2 text-xs font-medium border transition-colors ${
                      s.available === 0
                        ? "bg-red-50 text-red-400 border-red-200 cursor-not-allowed"
                        : "bg-green-50 text-green-700 border-green-200 hover:bg-green-100 cursor-pointer"
                    }`}
                  >
                    <div>{s.time}</div>
                    <div className="text-[10px] opacity-70">{s.available}/{s.capacity}</div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Booking form (appears when slot clicked) */}
          {bookingForm && (
            <div className={sectionCls + " bg-blue-50 border-blue-200"}>
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-blue-800">New booking — {bookingDate} {bookingForm.slotTime}</p>
                <button type="button" onClick={() => setBookingForm(null)} className="text-gray-400 hover:text-gray-600">×</button>
              </div>

              {/* Order search */}
              <div>
                <label className={labelCls}>Order Summary (optional)</label>
                <div className="flex gap-2">
                  <input className={`${inputCls} flex-1`} placeholder="Order number…"
                    value={orderSearch} onChange={(e) => setOrderSearch(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && searchOrders()} />
                  <button type="button" onClick={searchOrders}
                    className="text-sm bg-gray-100 border rounded px-3 hover:bg-gray-200">Search</button>
                </div>
                {orderResults.length > 0 && (
                  <div className="border rounded mt-1 bg-white max-h-32 overflow-y-auto shadow-sm">
                    {orderResults.map((o) => (
                      <button key={o.Id} type="button"
                        onClick={() => { setSelectedOrder(o); setOrderResults([]); }}
                        className={`w-full text-left px-3 py-1.5 text-xs hover:bg-blue-50 border-b last:border-0 ${selectedOrder?.Id === o.Id ? "bg-blue-50 text-blue-700" : ""}`}>
                        <span className="font-mono font-medium">{o.OrderNumber}</span>
                        {o.BillingName && <span className="text-gray-500 ml-2">{o.BillingName}</span>}
                      </button>
                    ))}
                  </div>
                )}
                {selectedOrder && (
                  <div className="mt-1 flex items-center gap-2 text-xs text-blue-700 bg-blue-100 px-2 py-1 rounded">
                    <span>✓ {selectedOrder.OrderNumber}{selectedOrder.BillingName ? ` — ${selectedOrder.BillingName}` : ""}</span>
                    <button type="button" onClick={() => setSelectedOrder(null)} className="ml-auto text-gray-400 hover:text-red-500">×</button>
                  </div>
                )}
              </div>

              <button type="button" onClick={submitBooking} disabled={submittingBooking}
                className="w-full bg-[#00A1E0] text-white text-sm py-2 rounded hover:bg-[#0086b3] disabled:opacity-50">
                {submittingBooking ? "Booking…" : "Confirm Booking"}
              </button>
            </div>
          )}

          {/* Bookings list */}
          {bookings.length > 0 && (
            <div className={sectionCls}>
              <p className="text-sm font-semibold text-gray-700">Bookings — {bookingDate}</p>
              <div className="divide-y">
                {bookings.map((b) => (
                  <div key={b.Id} className="py-2 flex items-center gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-mono font-medium text-gray-800">
                          {b.SlotDateTime__c ? new Date(b.SlotDateTime__c).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : "—"}
                        </span>
                        <span className={`text-xs border rounded-full px-1.5 py-0.5 ${STATUS_COLORS[b.Status__c] || ""}`}>
                          {b.Status__c}
                        </span>
                      </div>
                      {b.OrderSummary__r && (
                        <p className="text-xs text-gray-500 mt-0.5">
                          {b.OrderSummary__r.OrderNumber}
                          {b.OrderSummary__r.BillingName ? ` — ${b.OrderSummary__r.BillingName}` : ""}
                        </p>
                      )}
                    </div>
                    {b.Status__c !== "Cancelled" && (
                      <button type="button" onClick={() => cancelBooking(b.Id)}
                        className="text-xs text-gray-400 hover:text-red-500 px-1">✕</button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

        </>
      )}
    </div>
  );
}
