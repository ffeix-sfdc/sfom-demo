import React, { useState, useEffect, useCallback } from "react";
import api from "../api/client";

function fmt(ts) {
  if (!ts) return "—";
  return new Date(ts * 1000).toLocaleTimeString("fr-FR", {
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    day: "2-digit", month: "2-digit",
  });
}

function fmtTtl(seconds) {
  if (seconds === null || seconds === undefined) return "∞";
  if (seconds <= 0) return "expired";
  if (seconds < 60) return `${Math.round(seconds)}s`;
  return `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`;
}

export default function CacheConfig({ open }) {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState({});
  const [clearing, setClearing] = useState(false);

  const fetchEntries = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.get("/cache");
      setEntries(r.data.entries || []);
    } catch {
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    fetchEntries();
    const interval = setInterval(fetchEntries, 10000);
    return () => clearInterval(interval);
  }, [open, fetchEntries]);

  const refreshEntry = async (key) => {
    setRefreshing((p) => ({ ...p, [key]: true }));
    try {
      const r = await api.post(`/cache/refresh/${encodeURIComponent(key)}`);
      setEntries(r.data.entries || []);
    } finally {
      setRefreshing((p) => ({ ...p, [key]: false }));
    }
  };

  const clearAll = async () => {
    setClearing(true);
    try {
      await api.delete("/cache");
      setEntries([]);
    } finally {
      setClearing(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="border rounded-lg p-4 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-gray-700">Backend SF Cache</p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={fetchEntries}
              disabled={loading}
              className="text-xs text-gray-500 border rounded px-2 py-1 hover:bg-gray-50 disabled:opacity-50"
            >
              {loading ? "Loading…" : "↻ Refresh list"}
            </button>
            <button
              type="button"
              onClick={clearAll}
              disabled={clearing || entries.length === 0}
              className="text-xs text-red-500 border border-red-200 rounded px-2 py-1 hover:bg-red-50 disabled:opacity-50"
            >
              {clearing ? "Clearing…" : "Clear all"}
            </button>
          </div>
        </div>

        {entries.length === 0 && !loading && (
          <p className="text-xs text-gray-400">No cache entries for this org.</p>
        )}

        {entries.length > 0 && (
          <div className="divide-y text-xs">
            <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-3 pb-1 text-gray-400 font-medium">
              <span>Key</span>
              <span>Cached at</span>
              <span>TTL</span>
              <span></span>
            </div>
            {entries.map((e) => (
              <div
                key={e.key}
                className={`grid grid-cols-[1fr_auto_auto_auto] gap-x-3 items-center py-1.5 ${e.expired ? "opacity-60" : ""}`}
              >
                <span className="font-mono text-gray-800 truncate">
                  {e.source === "oci" && <span className="mr-1 text-[10px] font-semibold text-purple-500 bg-purple-50 px-1 rounded">OCI</span>}
                  {e.key}
                </span>
                <span className="text-gray-500 tabular-nums whitespace-nowrap">{e.cached_at ? fmt(e.cached_at) : "—"}</span>
                <span className={`tabular-nums whitespace-nowrap ${e.expired ? "text-red-500" : e.persistent ? "text-purple-600" : "text-green-700"}`}>
                  {fmtTtl(e.expires_in)}
                </span>
                {e.source !== "oci" ? (
                  <button
                    type="button"
                    onClick={() => refreshEntry(e.key)}
                    disabled={!!refreshing[e.key]}
                    className="text-[#00A1E0] hover:underline disabled:opacity-50 whitespace-nowrap"
                  >
                    {refreshing[e.key] ? "…" : "↻"}
                  </button>
                ) : <span />}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
