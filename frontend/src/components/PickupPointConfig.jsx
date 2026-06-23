import React, { useState, useEffect } from "react";
import api from "../api/client";

const DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
const DAY_LABELS = { monday: "Mon", tuesday: "Tue", wednesday: "Wed", thursday: "Thu", friday: "Fri", saturday: "Sat", sunday: "Sun" };

const EMPTY_HOURS = { monday: { open: "09:00", close: "19:00" }, tuesday: { open: "09:00", close: "19:00" }, wednesday: { open: "09:00", close: "19:00" }, thursday: { open: "09:00", close: "19:00" }, friday: { open: "09:00", close: "19:00" }, saturday: null, sunday: null };

const EMPTY_POINT = {
  carrier: "mondial-relay",
  name: "",
  address: "",
  city: "",
  postal_code: "",
  country: "FR",
  distance_km: "",
  coordinates: { lat: "", lng: "" },
  hours: EMPTY_HOURS,
};

function HoursEditor({ hours, onChange }) {
  const inputCls = "border rounded px-1.5 py-0.5 text-xs w-20 focus:outline-none focus:ring-1 focus:ring-[#00A1E0]";
  return (
    <div className="space-y-1">
      {DAYS.map((day) => {
        const slot = hours?.[day];
        return (
          <div key={day} className="flex items-center gap-2">
            <span className="text-xs text-gray-500 w-8">{DAY_LABELS[day]}</span>
            <input type="checkbox" className="accent-[#00A1E0]"
              checked={!!slot}
              onChange={(e) => onChange({ ...hours, [day]: e.target.checked ? { open: "09:00", close: "19:00" } : null })}
            />
            {slot ? (
              <>
                <input type="time" className={inputCls} value={slot.open}
                  onChange={(e) => onChange({ ...hours, [day]: { ...slot, open: e.target.value } })} />
                <span className="text-xs text-gray-400">–</span>
                <input type="time" className={inputCls} value={slot.close}
                  onChange={(e) => onChange({ ...hours, [day]: { ...slot, close: e.target.value } })} />
              </>
            ) : (
              <span className="text-xs text-gray-300 italic">Closed</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function PickupPointConfig({ open }) {
  const [points, setPoints] = useState([]);
  const [filter, setFilter] = useState("");
  const [editing, setEditing] = useState(null); // null | "new" | point object
  const [form, setForm] = useState(EMPTY_POINT);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);

  const inputCls = "w-full border rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-[#00A1E0]";
  const labelCls = "block text-xs font-medium text-gray-600 mb-0.5";

  useEffect(() => {
    if (!open) return;
    api.get("/pickup-points/all").then((r) => setPoints(r.data)).catch(() => {});
  }, [open]);

  const filtered = filter.trim()
    ? points.filter((p) =>
        p.name.toLowerCase().includes(filter.toLowerCase()) ||
        p.postal_code.includes(filter) ||
        p.city.toLowerCase().includes(filter.toLowerCase())
      )
    : points;

  const startNew = () => {
    setForm(EMPTY_POINT);
    setEditing("new");
  };

  const startEdit = (p) => {
    setForm({
      ...p,
      distance_km: p.distance_km ?? "",
      coordinates: p.coordinates || { lat: "", lng: "" },
      hours: p.hours || EMPTY_HOURS,
    });
    setEditing(p);
  };

  const cancel = () => { setEditing(null); setForm(EMPTY_POINT); };

  const save = async () => {
    if (!form.name.trim() || !form.postal_code.trim()) return;
    setSaving(true);
    try {
      const body = {
        ...form,
        distance_km: parseFloat(form.distance_km) || null,
        coordinates: form.coordinates?.lat && form.coordinates?.lng
          ? { lat: parseFloat(form.coordinates.lat), lng: parseFloat(form.coordinates.lng) }
          : null,
      };
      if (editing === "new") {
        const r = await api.post("/pickup-points", body);
        setPoints((prev) => [...prev, r.data]);
      } else {
        const r = await api.put(`/pickup-points/${editing.id}`, body);
        setPoints((prev) => prev.map((p) => (p.id === editing.id ? r.data : p)));
      }
      cancel();
    } finally { setSaving(false); }
  };

  const deletePoint = async (id) => {
    await api.delete(`/pickup-points/${id}`);
    setPoints((prev) => prev.filter((p) => p.id !== id));
    setConfirmDelete(null);
  };

  const fmtHours = (hours) => {
    if (!hours) return "—";
    const open = DAYS.filter((d) => hours[d]);
    if (!open.length) return "Closed";
    return open.map((d) => DAY_LABELS[d]).join(", ");
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-gray-700">Pickup Points</p>
        <button type="button" onClick={startNew}
          className="text-xs text-[#00A1E0] hover:underline font-medium">
          + Add point
        </button>
      </div>

      {/* New / Edit form */}
      {editing && (
        <div className="border rounded-lg p-4 bg-gray-50 space-y-3">
          <p className="text-xs font-semibold text-gray-700">{editing === "new" ? "New pickup point" : `Edit — ${editing.name}`}</p>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={labelCls}>Carrier</label>
              <input className={inputCls} value={form.carrier}
                onChange={(e) => setForm((p) => ({ ...p, carrier: e.target.value }))} />
            </div>
            <div>
              <label className={labelCls}>Name *</label>
              <input className={inputCls} value={form.name}
                onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} />
            </div>
          </div>

          <div>
            <label className={labelCls}>Address *</label>
            <input className={inputCls} value={form.address}
              onChange={(e) => setForm((p) => ({ ...p, address: e.target.value }))} />
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className={labelCls}>Postal Code *</label>
              <input className={inputCls} value={form.postal_code}
                onChange={(e) => setForm((p) => ({ ...p, postal_code: e.target.value }))} />
            </div>
            <div>
              <label className={labelCls}>City</label>
              <input className={inputCls} value={form.city}
                onChange={(e) => setForm((p) => ({ ...p, city: e.target.value }))} />
            </div>
            <div>
              <label className={labelCls}>Country</label>
              <input className={inputCls} maxLength={2} value={form.country}
                onChange={(e) => setForm((p) => ({ ...p, country: e.target.value.toUpperCase() }))} />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className={labelCls}>Distance (km)</label>
              <input type="number" step="0.1" className={inputCls} value={form.distance_km}
                onChange={(e) => setForm((p) => ({ ...p, distance_km: e.target.value }))} />
            </div>
            <div>
              <label className={labelCls}>Latitude</label>
              <input type="number" step="any" className={inputCls} value={form.coordinates?.lat ?? ""}
                onChange={(e) => setForm((p) => ({ ...p, coordinates: { ...p.coordinates, lat: e.target.value } }))} />
            </div>
            <div>
              <label className={labelCls}>Longitude</label>
              <input type="number" step="any" className={inputCls} value={form.coordinates?.lng ?? ""}
                onChange={(e) => setForm((p) => ({ ...p, coordinates: { ...p.coordinates, lng: e.target.value } }))} />
            </div>
          </div>

          <div>
            <label className={labelCls}>Opening Hours</label>
            <HoursEditor hours={form.hours} onChange={(h) => setForm((p) => ({ ...p, hours: h }))} />
          </div>

          <div className="flex gap-2 pt-1">
            <button type="button" onClick={save} disabled={saving || !form.name.trim() || !form.postal_code.trim()}
              className="flex-1 bg-[#00A1E0] text-white text-sm py-1.5 rounded hover:bg-[#0086b3] disabled:opacity-50">
              {saving ? "Saving…" : "Save"}
            </button>
            <button type="button" onClick={cancel}
              className="px-4 border rounded text-sm text-gray-600 hover:bg-gray-100">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Search */}
      <input className={inputCls} placeholder="Filter by name, city or postal code…"
        value={filter} onChange={(e) => setFilter(e.target.value)} />

      {/* List */}
      {filtered.length === 0 ? (
        <p className="text-xs text-gray-400 text-center py-4">No pickup points{filter ? " matching filter" : ""}.</p>
      ) : (
        <div className="space-y-2">
          {filtered.map((p) => (
            <div key={p.id} className="border rounded-lg px-3 py-2.5 bg-white flex items-start gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-gray-800">{p.name}</span>
                  <span className="text-[10px] bg-purple-100 text-purple-700 rounded px-1.5 py-0.5 font-medium">{p.carrier}</span>
                  {p.distance_km != null && (
                    <span className="text-[10px] text-gray-400">{p.distance_km} km</span>
                  )}
                </div>
                <p className="text-xs text-gray-500 mt-0.5">{p.address}, {p.postal_code} {p.city} ({p.country})</p>
                <p className="text-[10px] text-gray-400 mt-0.5">Open: {fmtHours(p.hours)}</p>
              </div>
              <div className="flex gap-1 shrink-0">
                <button type="button" onClick={() => startEdit(p)}
                  className="text-xs text-gray-400 hover:text-[#00A1E0] px-1.5 py-1 border rounded hover:border-[#00A1E0]">
                  Edit
                </button>
                {confirmDelete === p.id ? (
                  <>
                    <button type="button" onClick={() => deletePoint(p.id)}
                      className="text-xs text-white bg-red-500 hover:bg-red-600 px-2 py-1 rounded">
                      Confirm
                    </button>
                    <button type="button" onClick={() => setConfirmDelete(null)}
                      className="text-xs text-gray-400 hover:text-gray-600 px-1.5 py-1 border rounded">
                      Cancel
                    </button>
                  </>
                ) : (
                  <button type="button" onClick={() => setConfirmDelete(p.id)}
                    className="text-xs text-gray-400 hover:text-red-500 px-1.5 py-1 border rounded hover:border-red-300">
                    ✕
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <p className="text-[10px] text-gray-400">{points.length} point{points.length !== 1 ? "s" : ""} total</p>
    </div>
  );
}
