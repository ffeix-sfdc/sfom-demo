import React, { useState, useEffect, useRef } from "react";
import { getLogs, subscribe } from "../log/store";
import { useLang } from "../i18n/LangContext";

// JsonView with externally managed collapse state (persists across re-renders)
function JsonView({ data, path, collapsed, onToggle, depth = 0, forceExpand = false }) {
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

  const isCollapsed = forceExpand ? false : (collapsed[path] !== undefined ? collapsed[path] : depth > 1);

  return (
    <span>
      <button
        onClick={() => onToggle(path, !isCollapsed)}
        className="text-gray-400 hover:text-white text-xs mr-0.5"
      >
        {isCollapsed ? "▶" : "▼"}
      </button>
      <span className="text-gray-400">{isArr ? "[" : "{"}</span>
      {isCollapsed ? (
        <button
          onClick={() => onToggle(path, false)}
          className="text-gray-400 hover:text-gray-200 text-xs mx-1"
        >
          {isArr ? `${keys.length} items` : `${keys.length} keys`}
        </button>
      ) : (
        <span className="ml-3 block">
          {keys.map((k) => (
            <span key={k} className="block">
              <span className="text-[#79c0ff]">{isArr ? "" : `"${k}": `}</span>
              <JsonView
                data={data[k]}
                path={`${path}.${k}`}
                collapsed={collapsed}
                onToggle={onToggle}
                depth={depth + 1}
                forceExpand={forceExpand}
              />
              <span className="text-gray-500">,</span>
            </span>
          ))}
        </span>
      )}
      <span className="text-gray-400">{isArr ? "]" : "}"}</span>
    </span>
  );
}

function getLatestPreview(logs) {
  const entry = logs.find((l) => l.type === "preview") || null;
  return entry?.body ? entry : null;
}

export default function PreviewPanel({ bottomOffset = 0 }) {
  const { t } = useLang();
  const [preview, setPreview] = useState(() => getLatestPreview(getLogs()));
  const [visible, setVisible] = useState(false);
  const [pinned, setPinned] = useState(false);
  // Persistent collapse state: path → boolean
  const [collapsed, setCollapsed] = useState({});
  const [forceExpand, setForceExpand] = useState(false);
  const hideTimer = useRef(null);

  useEffect(() =>
    subscribe((all) => setPreview(getLatestPreview(all))),
  []);

  const handleToggle = (path, value) => {
    setForceExpand(false);
    setCollapsed((prev) => ({ ...prev, [path]: value }));
  };

  const showPanel = () => { clearTimeout(hideTimer.current); setVisible(true); };
  const scheduleHide = () => {
    if (pinned) return;
    hideTimer.current = setTimeout(() => setVisible(false), 300);
  };

  const isOpen = visible || pinned;

  return (
    <>
      {/* Trigger strip — right side, vertically centered above console */}
      <div
        className="fixed right-0 z-40"
        style={{ top: `calc(50% - ${bottomOffset / 2}px)`, transform: "translateY(-50%)" }}
        onMouseEnter={showPanel}
        onMouseLeave={scheduleHide}
      >
        <div
          className={`bg-purple-900 text-purple-200 flex items-center justify-center cursor-pointer transition-all duration-200 rounded-l-lg shadow-lg ${isOpen ? "w-2" : "w-6"}`}
          style={{ height: "120px" }}
        >
          {!isOpen && (
            <span
              className="text-[10px] font-semibold tracking-widest select-none px-1"
              style={{ writingMode: "vertical-rl", transform: "rotate(180deg)" }}
            >
              PREVIEW
            </span>
          )}
        </div>
      </div>

      {/* Panel — slides from right, stops above console */}
      <div
        className={`fixed top-0 right-0 bg-gray-900 shadow-2xl border-l border-gray-700 z-30 flex flex-col transition-all duration-200 ${isOpen ? "translate-x-0" : "translate-x-full"}`}
        style={{ width: "480px", bottom: `${bottomOffset}px` }}
        onMouseEnter={showPanel}
        onMouseLeave={scheduleHide}
      >
        {/* Header */}
        <div className="bg-purple-950 border-b border-purple-800 px-4 py-2.5 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-purple-200 font-semibold text-sm">Payload Preview</span>
            {preview && (
              <span className="text-purple-400 text-xs">
                {new Date(preview.ts).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPinned(!pinned)}
              className={`text-xs px-2 py-0.5 rounded border transition-colors ${pinned ? "bg-yellow-500 border-yellow-500 text-gray-900 font-bold" : "border-purple-700 text-purple-400 hover:text-white"}`}
            >
              📌 {pinned ? "Pinned" : "Pin"}
            </button>
            <button
              onClick={() => { setCollapsed({}); setForceExpand(true); }}
              className="text-xs text-purple-500 hover:text-purple-300 border border-purple-700 rounded px-2 py-0.5"
            >
              Expand all
            </button>
            <button
              onClick={() => { setPinned(false); setVisible(false); }}
              className="text-purple-500 hover:text-purple-200 text-lg leading-none ml-1"
            >
              ×
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto text-gray-300 p-3 text-xs font-mono">
          {!preview ? (
            <p className="text-gray-600 text-center mt-12">
              {t.previewEmpty}
            </p>
          ) : (
            <JsonView
              data={preview.body}
              path="root"
              collapsed={collapsed}
              onToggle={handleToggle}
              depth={0}
              forceExpand={forceExpand}
            />
          )}
        </div>
      </div>
    </>
  );
}
