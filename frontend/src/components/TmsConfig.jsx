import React, { useState, useEffect } from "react";
import api from "../api/client";
import { getTmsSlots, invalidateTmsSlots, clearTmsSlotsForMethod } from "../api/tmsBookingCache";

const TODAY = new Date().toISOString().slice(0, 10);

const STATUS_COLORS = {
  Confirmed: "bg-green-100 text-green-800 border-green-200",
  Pending: "bg-yellow-100 text-yellow-800 border-yellow-200",
  Cancelled: "bg-red-100 text-red-600 border-red-200",
};

export default function TmsConfig({ open }) {
  const [configs, setConfigs] = useState([]);
  const [shippingMethods, setShippingMethods] = useState([]);
  const [selectedConfig, setSelectedConfig] = useState(null);
  const [showNewConfig, setShowNewConfig] = useState(false);
  const [newCfg, setNewCfg] = useState({ shipping_method_ref: "", windows: [] });
  const [newWindow, setNewWindow] = useState({ window_start: "08:00", window_end: "12:00", max_capacity: 10 });
  const [savingCfg, setSavingCfg] = useState(false);
  const [showTools, setShowTools] = useState(false);

  // Time window management for selected config
  const [editingWindow, setEditingWindow] = useState(null); // { id, window_start, window_end, max_capacity }
  const [addingWindow, setAddingWindow] = useState(false);
  const [addWindowForm, setAddWindowForm] = useState({ window_start: "08:00", window_end: "12:00", max_capacity: 10 });
  const [savingWindow, setSavingWindow] = useState(false);
  const [deletingWindow, setDeletingWindow] = useState(null);

  // Booking view
  const [bookingDate, setBookingDate] = useState(TODAY);
  const [slots, setSlots] = useState(null);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [bookings, setBookings] = useState([]);
  const [bookingForm, setBookingForm] = useState(null);
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
    api.get("/tms/configs").then((r) => setConfigs(r.data)).catch(() => {});
    api.get("/delivery-estimate/shipping-methods").then((r) => setShippingMethods(r.data)).catch(() => {});
  }, [open]);

  useEffect(() => {
    if (!selectedConfig) { setSlots(null); setBookings([]); return; }
    fetchSlots();
    fetchBookings();
  }, [selectedConfig, bookingDate]);

  const invalidateConfigSlots = () => {
    if (!selectedConfig) return;
    clearTmsSlotsForMethod(selectedConfig.ShippingMethodRef__c);
  };

  const fetchSlots = async ({ invalidate = false } = {}) => {
    if (!selectedConfig) return;
    if (invalidate) invalidateTmsSlots(selectedConfig.ShippingMethodRef__c, bookingDate);
    setLoadingSlots(true);
    try {
      const data = await getTmsSlots(selectedConfig.ShippingMethodRef__c, bookingDate);
      setSlots(data);
    } catch { setSlots(null); }
    finally { setLoadingSlots(false); }
  };

  const fetchBookings = async () => {
    if (!selectedConfig) return;
    try {
      const r = await api.get("/tms/bookings", { params: { config_id: selectedConfig.Id, date: bookingDate } });
      setBookings(r.data);
    } catch { setBookings([]); }
  };

  const addWindow = () => {
    setNewCfg((p) => ({ ...p, windows: [...p.windows, { ...newWindow }] }));
    setNewWindow({ window_start: "08:00", window_end: "12:00", max_capacity: 10 });
  };

  const removeWindow = (i) => {
    setNewCfg((p) => ({ ...p, windows: p.windows.filter((_, idx) => idx !== i) }));
  };

  const saveConfig = async () => {
    setSavingCfg(true);
    try {
      await api.post("/tms/configs", newCfg);
      const r = await api.get("/tms/configs");
      setConfigs(r.data);
      setShowNewConfig(false);
      setNewCfg({ shipping_method_ref: "", windows: [] });
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
      const body = {
        tms_config_id: selectedConfig.Id,
        delivery_date: bookingDate,
        window_start: bookingForm.windowStart,
        window_end: bookingForm.windowEnd,
        status: "Confirmed",
      };
      if (selectedOrder) body.order_summary_id = selectedOrder.Id;
      await api.post("/tms/bookings", body);
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
    await api.delete(`/tms/bookings/${id}`);
    invalidateConfigSlots();
    await fetchSlots({ invalidate: true });
    await fetchBookings();
  };

  const generate = async () => {
    if (!selectedConfig) return;
    setGenerating(true);
    setGenResult(null);
    try {
      const r = await api.post("/tms/bookings/generate", { config_id: selectedConfig.Id, ...genForm });
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
      const r = await api.post("/tms/bookings/clean", { config_id: selectedConfig.Id, ...cleanForm });
      setCleanResult(r.data);
      invalidateConfigSlots();
      await fetchSlots({ invalidate: true });
      await fetchBookings();
    } finally { setCleaning(false); }
  };

  const reloadConfig = async () => {
    const r = await api.get("/tms/configs");
    const fresh = r.data;
    setConfigs(fresh);
    if (selectedConfig) {
      const updated = fresh.find((c) => c.Id === selectedConfig.Id);
      if (updated) setSelectedConfig(updated);
    }
  };

  const saveEditWindow = async () => {
    if (!editingWindow || !selectedConfig) return;
    setSavingWindow(true);
    try {
      await api.patch(`/tms/configs/${selectedConfig.Id}/windows/${editingWindow.id}`, {
        window_start: editingWindow.window_start,
        window_end: editingWindow.window_end,
        max_capacity: editingWindow.max_capacity,
      });
      setEditingWindow(null);
      await reloadConfig();
      await fetchSlots();
    } finally { setSavingWindow(false); }
  };

  const saveAddWindow = async () => {
    if (!selectedConfig) return;
    setSavingWindow(true);
    try {
      await api.post(`/tms/configs/${selectedConfig.Id}/windows`, addWindowForm);
      setAddingWindow(false);
      setAddWindowForm({ window_start: "08:00", window_end: "12:00", max_capacity: 10 });
      await reloadConfig();
      await fetchSlots();
    } finally { setSavingWindow(false); }
  };

  const deleteWindow = async (windowId) => {
    if (!selectedConfig) return;
    setDeletingWindow(windowId);
    try {
      await api.delete(`/tms/configs/${selectedConfig.Id}/windows/${windowId}`);
      await reloadConfig();
      await fetchSlots();
    } finally { setDeletingWindow(null); }
  };

  return (
    <div className="space-y-4">
      {/* Config selector */}
      <div className={sectionCls}>
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-gray-700">Carrier Configuration</p>
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
          <div className="bg-gray-50 border rounded p-3 space-y-3">
            <div>
              <label className={labelCls}>Shipping Method *</label>
              <select className={inputCls} value={newCfg.shipping_method_ref}
                onChange={(e) => setNewCfg((p) => ({ ...p, shipping_method_ref: e.target.value }))}>
                <option value="">— select method —</option>
                {shippingMethods.map((sm) => (
                  <option key={sm.Id} value={sm.ExternalReference || sm.Name}>{sm.Name}</option>
                ))}
              </select>
            </div>

            {/* Time windows */}
            <div>
              <label className={labelCls}>Time Windows</label>
              {newCfg.windows.map((w, i) => (
                <div key={i} className="flex items-center gap-2 text-xs bg-white border rounded px-2 py-1 mb-1">
                  <span className="font-mono">{w.window_start} – {w.window_end}</span>
                  <span className="text-gray-400">cap: {w.max_capacity}</span>
                  <button type="button" onClick={() => removeWindow(i)} className="ml-auto text-red-400 hover:text-red-600">✕</button>
                </div>
              ))}
              <div className="grid grid-cols-4 gap-1 mt-1">
                <input className={inputCls} placeholder="08:00" value={newWindow.window_start}
                  onChange={(e) => setNewWindow((p) => ({ ...p, window_start: e.target.value }))} />
                <input className={inputCls} placeholder="12:00" value={newWindow.window_end}
                  onChange={(e) => setNewWindow((p) => ({ ...p, window_end: e.target.value }))} />
                <input type="number" min="1" className={inputCls} placeholder="Cap" value={newWindow.max_capacity}
                  onChange={(e) => setNewWindow((p) => ({ ...p, max_capacity: Number(e.target.value) }))} />
                <button type="button" onClick={addWindow}
                  className="bg-gray-100 border rounded text-xs hover:bg-gray-200">+ Add</button>
              </div>
            </div>

            <button type="button" onClick={saveConfig} disabled={savingCfg || !newCfg.shipping_method_ref}
              className="w-full bg-[#00A1E0] text-white text-sm py-1.5 rounded hover:bg-[#0086b3] disabled:opacity-50">
              {savingCfg ? "Saving…" : "Save Config"}
            </button>
          </div>
        )}

        {/* Generate / Clean tools (collapsible) */}
        {selectedConfig && showTools && (
          <div className="space-y-3 pt-1">
            {/* Time Windows */}
            <div className="bg-gray-50 border rounded p-3 space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-gray-600">Time Windows</p>
                <button type="button" onClick={() => { setAddingWindow((v) => !v); setEditingWindow(null); }}
                  className="text-xs text-[#00A1E0] hover:underline">
                  {addingWindow ? "Cancel" : "+ Add window"}
                </button>
              </div>
              {((selectedConfig.TmsTimeWindows__r?.records) || []).length === 0 && !addingWindow && (
                <p className="text-xs text-gray-400">No time windows configured.</p>
              )}
              <div className="space-y-1">
                {(selectedConfig.TmsTimeWindows__r?.records || []).map((w) => (
                  <div key={w.Id}>
                    {editingWindow?.id === w.Id ? (
                      <div className="bg-blue-50 border border-blue-200 rounded p-2 space-y-2">
                        <div className="grid grid-cols-4 gap-1">
                          <div>
                            <label className={labelCls}>Start</label>
                            <input className={inputCls} value={editingWindow.window_start}
                              onChange={(e) => setEditingWindow((p) => ({ ...p, window_start: e.target.value }))} />
                          </div>
                          <div>
                            <label className={labelCls}>End</label>
                            <input className={inputCls} value={editingWindow.window_end}
                              onChange={(e) => setEditingWindow((p) => ({ ...p, window_end: e.target.value }))} />
                          </div>
                          <div>
                            <label className={labelCls}>Capacity</label>
                            <input type="number" min="1" className={inputCls} value={editingWindow.max_capacity}
                              onChange={(e) => setEditingWindow((p) => ({ ...p, max_capacity: Number(e.target.value) }))} />
                          </div>
                          <div className="flex flex-col justify-end gap-1">
                            <button type="button" onClick={saveEditWindow} disabled={savingWindow}
                              className="bg-[#00A1E0] text-white text-xs py-1.5 rounded hover:bg-[#0086b3] disabled:opacity-50">
                              {savingWindow ? "…" : "Save"}
                            </button>
                            <button type="button" onClick={() => setEditingWindow(null)}
                              className="bg-white border text-xs py-1.5 rounded hover:bg-gray-100">
                              Cancel
                            </button>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 text-xs bg-white border rounded px-2 py-1.5">
                        <span className="font-mono text-gray-800">{w.WindowStart__c} – {w.WindowEnd__c}</span>
                        <span className="text-gray-400">cap: {w.MaxCapacity__c}</span>
                        <div className="ml-auto flex items-center gap-1">
                          <button type="button"
                            onClick={() => { setEditingWindow({ id: w.Id, window_start: w.WindowStart__c, window_end: w.WindowEnd__c, max_capacity: w.MaxCapacity__c }); setAddingWindow(false); }}
                            className="text-[#00A1E0] hover:underline px-1">Edit</button>
                          <button type="button" onClick={() => deleteWindow(w.Id)} disabled={deletingWindow === w.Id}
                            className="text-red-400 hover:text-red-600 px-1 disabled:opacity-50">
                            {deletingWindow === w.Id ? "…" : "✕"}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
              {addingWindow && (
                <div className="bg-white border rounded p-2 space-y-2">
                  <div className="grid grid-cols-4 gap-1">
                    <div>
                      <label className={labelCls}>Start</label>
                      <input className={inputCls} value={addWindowForm.window_start}
                        onChange={(e) => setAddWindowForm((p) => ({ ...p, window_start: e.target.value }))} />
                    </div>
                    <div>
                      <label className={labelCls}>End</label>
                      <input className={inputCls} value={addWindowForm.window_end}
                        onChange={(e) => setAddWindowForm((p) => ({ ...p, window_end: e.target.value }))} />
                    </div>
                    <div>
                      <label className={labelCls}>Capacity</label>
                      <input type="number" min="1" className={inputCls} value={addWindowForm.max_capacity}
                        onChange={(e) => setAddWindowForm((p) => ({ ...p, max_capacity: Number(e.target.value) }))} />
                    </div>
                    <div className="flex flex-col justify-end">
                      <button type="button" onClick={saveAddWindow} disabled={savingWindow}
                        className="bg-[#00A1E0] text-white text-xs py-1.5 rounded hover:bg-[#0086b3] disabled:opacity-50">
                        {savingWindow ? "…" : "Add"}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>

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
            <option value="">— select a TMS config —</option>
            {configs.map((c) => (
              <option key={c.Id} value={c.Id}>{c.ShippingMethodRef__c}</option>
            ))}
          </select>
        </div>
      </div>

      {selectedConfig && (
        <>
          {/* Date + booking windows */}
          <div className={sectionCls}>
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-gray-700">Delivery Windows</p>
              <input type="date" className="border rounded px-2 py-1 text-sm"
                value={bookingDate} onChange={(e) => setBookingDate(e.target.value)} />
            </div>

            {loadingSlots && <p className="text-xs text-gray-400">Loading…</p>}

            {slots && !slots.operating && (
              <p className="text-xs text-gray-400">Not an operating day for this carrier.</p>
            )}

            {slots && slots.operating && slots.windows?.length === 0 && (
              <p className="text-xs text-gray-400">No time windows configured.</p>
            )}

            {slots && slots.operating && slots.windows?.length > 0 && (
              <div className="grid grid-cols-2 gap-1.5">
                {slots.windows.map((w) => (
                  <button key={w.id} type="button"
                    disabled={w.available === 0}
                    onClick={() => { setBookingForm({ windowStart: w.start, windowEnd: w.end }); setSelectedOrder(null); setOrderSearch(""); setOrderResults([]); }}
                    className={`rounded px-2 py-2 text-xs font-medium border transition-colors ${
                      w.available === 0
                        ? "bg-red-50 text-red-400 border-red-200 cursor-not-allowed"
                        : "bg-green-50 text-green-700 border-green-200 hover:bg-green-100 cursor-pointer"
                    }`}>
                    <div className="font-mono">{w.start} – {w.end}</div>
                    <div className="text-[10px] opacity-70 mt-0.5">{w.available}/{w.capacity} available</div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Booking form */}
          {bookingForm && (
            <div className={sectionCls + " bg-blue-50 border-blue-200"}>
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-blue-800">New booking — {bookingDate} {bookingForm.windowStart}–{bookingForm.windowEnd}</p>
                <button type="button" onClick={() => setBookingForm(null)} className="text-gray-400 hover:text-gray-600">×</button>
              </div>

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
                          {b.WindowStart__c} – {b.WindowEnd__c}
                        </span>
                        <span className={`text-xs border rounded-full px-1.5 py-0.5 ${STATUS_COLORS[b.Status__c] || ""}`}>
                          {b.Status__c}
                        </span>
                      </div>
                      {b.OrderSummary__r && (
                        <p className="text-xs text-gray-500 mt-0.5">
                          {b.OrderSummary__r.OrderNumber}{b.OrderSummary__r.BillingName ? ` — ${b.OrderSummary__r.BillingName}` : ""}
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
