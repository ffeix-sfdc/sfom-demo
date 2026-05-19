import React, { useState, useEffect, useRef, useCallback } from "react";
import { getLogs, subscribe, clearLogs } from "../log/store";

const STORAGE_KEY = "console_height";
const DEFAULT_HEIGHT = 280;
const MIN_HEIGHT = 120;
const MAX_HEIGHT = 800;

function timestamp(ms) {
  return new Date(ms).toLocaleTimeString("fr-FR", {
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
}

function badge(type, method, status) {
  if (type === "error")    return { label: `${method} ${status ?? "ERR"}`, cls: "bg-red-600" };
  if (type === "response") return { label: `${method} ${status}`, cls: status < 300 ? "bg-green-600" : "bg-yellow-500" };
  return { label: `→ ${method}`, cls: "bg-[#0070d2]" };
}

function JsonView({ data, depth = 0, forceExpand = false }) {
  const [collapsed, setCollapsed] = useState(!forceExpand && depth > 0);
  if (data === null) return <span className="text-gray-400">null</span>;
  if (typeof data !== "object") {
    if (typeof data === "string") return <span className="text-green-300">"{data}"</span>;
    if (typeof data === "number") return <span className="text-yellow-300">{data}</span>;
    if (typeof data === "boolean") return <span className="text-blue-300">{String(data)}</span>;
    return <span className="text-gray-300">{String(data)}</span>;
  }
  const isArr = Array.isArray(data);
  const keys = Object.keys(data);
  if (keys.length === 0) return <span className="text-gray-400">{isArr ? "[]" : "{}"}</span>;
  return (
    <span>
      <button onClick={() => setCollapsed(!collapsed)} className="text-gray-400 hover:text-white text-xs mr-0.5">
        {collapsed ? "▶" : "▼"}
      </button>
      <span className="text-gray-400">{isArr ? "[" : "{"}</span>
      {collapsed ? (
        <button onClick={() => setCollapsed(false)} className="text-gray-400 hover:text-gray-200 text-xs mx-1">
          {isArr ? `${keys.length} items` : `${keys.length} keys`}
        </button>
      ) : (
        <span className="ml-3 block">
          {keys.map((k) => (
            <span key={k} className="block">
              <span className="text-[#79c0ff]">{isArr ? "" : `"${k}": `}</span>
              <JsonView data={data[k]} depth={depth + 1} forceExpand={forceExpand} />
              <span className="text-gray-500">,</span>
            </span>
          ))}
        </span>
      )}
      <span className="text-gray-400">{isArr ? "]" : "}"}</span>
    </span>
  );
}

function CopyButton({ log }) {
  const [copied, setCopied] = useState(false);
  const copy = (e) => {
    e.stopPropagation();
    const payload = {
      ts: new Date(log.ts).toISOString(),
      type: log.type,
      method: log.method,
      url: log.url,
      ...(log.status !== undefined && { status: log.status }),
      ...(log.duration !== undefined && { duration_ms: log.duration }),
      ...(log.params && { params: log.params }),
      ...(log.headers && { headers: log.headers }),
      ...(log.body !== undefined && { body: log.body }),
    };
    navigator.clipboard.writeText(JSON.stringify(payload, null, 2)).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };
  return (
    <span
      role="button"
      onClick={copy}
      className={`text-[10px] border rounded px-1.5 py-0.5 shrink-0 transition-colors ${copied ? "border-green-500 text-green-400" : "border-gray-600 text-gray-500 hover:text-gray-200"}`}
    >
      {copied ? "✓ copied" : "copy"}
    </span>
  );
}

function LogEntry({ log }) {
  const [open, setOpen] = useState(log.type === "error");
  const [expandKey, setExpandKey] = useState(0);
  const b = badge(log.type, log.method, log.status);
  const urlShort = log.url ? log.url.replace("http://localhost:8000", "") : "";
  const hasBody = log.body !== undefined;
  const hasContent = hasBody || !!log.params || !!log.headers;
  return (
    <div className={`border-b border-gray-700 ${log.type === "error" ? "bg-red-950/20" : ""}`}>
      <button
        onClick={() => setOpen(!open)}
        className="w-full text-left px-3 py-1.5 flex items-center gap-2 hover:bg-white/5 transition-colors"
      >
        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${b.cls} text-white shrink-0`}>
          {b.label}
        </span>
        <span className="text-xs text-gray-300 truncate flex-1">{urlShort}</span>
        {log.duration !== undefined && (
          <span className="text-[10px] text-gray-500 shrink-0">{log.duration}ms</span>
        )}
        <span className="text-[10px] text-gray-600 shrink-0">{timestamp(log.ts)}</span>
        {hasContent && open && (
          <>
            <span
              role="button"
              onClick={(e) => { e.stopPropagation(); setExpandKey((k) => k + 1); setOpen(true); }}
              className="text-[10px] text-gray-500 hover:text-gray-200 border border-gray-600 rounded px-1.5 py-0.5 shrink-0"
            >
              expand all
            </span>
            <CopyButton log={log} />
          </>
        )}
        <span className="text-gray-500 text-xs shrink-0">{open ? "▲" : "▼"}</span>
      </button>
      {open && (log.params || log.headers || hasBody) && (
        <div className="px-3 pb-2 text-xs font-mono overflow-x-auto space-y-1">
          {log.params && (
            <div>
              <span className="text-gray-500 text-[10px] uppercase tracking-wide">params </span>
              <JsonView data={log.params} depth={0} forceExpand />
            </div>
          )}
          {log.headers && (
            <div>
              <span className="text-gray-500 text-[10px] uppercase tracking-wide">headers </span>
              <JsonView data={log.headers} depth={0} forceExpand />
            </div>
          )}
          {hasBody && (
            <JsonView key={expandKey} data={log.body} depth={0} forceExpand={expandKey > 0} />
          )}
        </div>
      )}
    </div>
  );
}

export function useConsoleHeight() {
  const saved = parseInt(localStorage.getItem(STORAGE_KEY), 10);
  return isNaN(saved) ? DEFAULT_HEIGHT : Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, saved));
}

export default function ConsolePanel({ onOpenChange, onHeightChange }) {
  const [logs, setLogs] = useState(() => getLogs().filter((l) => l.type !== "preview"));
  const [visible, setVisible] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [panelH, setPanelH] = useState(useConsoleHeight);
  const hideTimer = useRef(null);
  const scrollRef = useRef(null);
  const userScrolledUp = useRef(false);
  const dragStartY = useRef(null);
  const dragStartH = useRef(null);

  useEffect(() =>
    subscribe((all) => setLogs(all.filter((l) => l.type !== "preview"))),
  []);

  const isOpen = visible || pinned;

  useEffect(() => { onOpenChange?.(isOpen); }, [isOpen]);
  useEffect(() => { onHeightChange?.(panelH); }, [panelH]);

  // Auto-scroll to bottom (newest entry) unless user scrolled up
  useEffect(() => {
    if (!isOpen) return;
    if (!userScrolledUp.current && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs, isOpen]);

  const handleScroll = () => {
    if (!scrollRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
    // User scrolled up if not at bottom
    userScrolledUp.current = scrollHeight - scrollTop - clientHeight > 40;
  };

  const showPanel = () => { clearTimeout(hideTimer.current); setVisible(true); };
  const scheduleHide = () => {
    if (pinned) return;
    hideTimer.current = setTimeout(() => setVisible(false), 300);
  };

  // Drag-to-resize handle
  const onDragMouseDown = useCallback((e) => {
    e.preventDefault();
    dragStartY.current = e.clientY;
    dragStartH.current = panelH;

    const onMove = (ev) => {
      const delta = dragStartY.current - ev.clientY;
      const newH = Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, dragStartH.current + delta));
      setPanelH(newH);
      localStorage.setItem(STORAGE_KEY, String(newH));
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, [panelH]);

  return (
    <>
      {/* Trigger strip — bottom center */}
      <div
        className="fixed bottom-0 left-1/2 -translate-x-1/2 z-40"
        onMouseEnter={showPanel}
        onMouseLeave={scheduleHide}
      >
        <div
          className={`bg-gray-800 text-gray-300 flex items-center justify-center cursor-pointer transition-all duration-200 rounded-t-lg shadow-lg ${isOpen ? "h-2" : "h-6"}`}
          style={{ width: "180px" }}
        >
          {!isOpen && (
            <span className="text-[10px] font-semibold tracking-widest select-none">
              CONSOLE ({logs.length})
            </span>
          )}
        </div>
      </div>

      {/* Panel — slides up from bottom */}
      <div
        className={`fixed bottom-0 left-0 right-0 bg-gray-900 border-t border-gray-700 z-30 flex flex-col transition-transform duration-200 ${isOpen ? "translate-y-0" : "translate-y-full"}`}
        style={{ height: `${panelH}px` }}
        onMouseEnter={showPanel}
        onMouseLeave={scheduleHide}
      >
        {/* Resize handle */}
        <div
          onMouseDown={onDragMouseDown}
          className="w-full h-1.5 cursor-ns-resize bg-gray-700 hover:bg-[#00A1E0] transition-colors shrink-0 flex items-center justify-center group"
          title="Redimensionner"
        >
          <div className="w-8 h-0.5 bg-gray-500 group-hover:bg-white rounded-full" />
        </div>

        {/* Header */}
        <div className="bg-gray-800 border-b border-gray-700 px-4 py-2 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-gray-200 font-semibold text-sm">Console</span>
            <span className="text-gray-500 text-xs">{logs.length} entries</span>
            <span className="text-gray-600 text-xs">{panelH}px</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => { userScrolledUp.current = false; scrollRef.current && (scrollRef.current.scrollTop = scrollRef.current.scrollHeight); }}
              className="text-xs text-gray-500 hover:text-gray-300 border border-gray-600 rounded px-2 py-0.5"
              title="Revenir au dernier appel"
            >
              ↓ Latest
            </button>
            <button
              onClick={() => setPinned(!pinned)}
              className={`text-xs px-2 py-0.5 rounded border transition-colors ${pinned ? "bg-yellow-500 border-yellow-500 text-gray-900 font-bold" : "border-gray-600 text-gray-400 hover:text-white"}`}
            >
              📌 {pinned ? "Pinned" : "Pin"}
            </button>
            <button
              onClick={clearLogs}
              className="text-xs text-gray-500 hover:text-gray-300 border border-gray-600 rounded px-2 py-0.5"
            >
              Clear
            </button>
            <button
              onClick={() => { setPinned(false); setVisible(false); }}
              className="text-gray-500 hover:text-gray-200 text-lg leading-none ml-1"
            >
              ×
            </button>
          </div>
        </div>

        {/* Logs — newest first, auto-scroll to top */}
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto text-gray-300"
        >
          {logs.length === 0 ? (
            <p className="text-gray-600 text-xs text-center mt-8">Aucun log.</p>
          ) : (
            logs.map((log) => <LogEntry key={log.id} log={log} />)
          )}
        </div>
      </div>
    </>
  );
}
