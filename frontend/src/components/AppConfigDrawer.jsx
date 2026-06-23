import React, { useState } from "react";
import DeployPanel from "./DeployPanel";
import SlotManagerConfig from "./SlotManagerConfig";
import TmsConfig from "./TmsConfig";
import CacheConfig from "./CacheConfig";
import GeoLocPanel from "./GeoLocPanel";
import PickupPointConfig from "./PickupPointConfig";

const SUB_TABS = ["Slot Manager", "TMS", "Pickup Points", "Cache", "Geo Loc"];

export default function AppConfigDrawer({ open, onClose, activeOrg, pinned, onTogglePin }) {
  const [activeTab, setActiveTab] = useState("Slot Manager");

  const orgKey = activeOrg?.alias || "none";
  const visible = open || pinned;

  return (
    <>
      {/* Backdrop — only when open and not pinned */}
      {open && !pinned && (
        <div className="fixed inset-0 z-40 bg-black/20" onClick={onClose} />
      )}

      {/* Drawer — always mounted, translated off-screen when not visible */}
      <div
        className={`fixed top-0 right-0 h-full w-[560px] bg-white shadow-2xl border-l z-50 flex flex-col transition-transform duration-200 ${
          visible ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {/* Header */}
        <div className="bg-gray-800 px-4 py-3 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-white text-base">⚙</span>
            <h2 className="text-white font-semibold text-sm">App Config</h2>
          </div>
          <div className="flex items-center gap-0.5">
            <button
              onClick={onTogglePin}
              title={pinned ? "Unpin" : "Pin"}
              className={`w-7 h-7 flex items-center justify-center rounded text-sm transition-colors ${
                pinned ? "text-yellow-400 hover:text-yellow-300" : "text-white/40 hover:text-white/80"
              }`}
            >
              📌
            </button>
            <button
              onClick={() => { if (pinned) onTogglePin(); onClose(); }}
              className="text-white/60 hover:text-white text-xl leading-none px-1"
            >×</button>
          </div>
        </div>

        {/* Sub-tab navigation */}
        <div className="border-b bg-gray-50 flex shrink-0">
          {SUB_TABS.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-5 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab
                  ? "border-[#00A1E0] text-[#00A1E0]"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Content — always rendered so components preserve state, fetch only when drawer is open */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <DeployPanel key={`deploy-${orgKey}`} open={open} />
          <div className={activeTab === "Slot Manager" ? "" : "hidden"}>
            <SlotManagerConfig key={`slots-${orgKey}`} open={open} />
          </div>
          <div className={activeTab === "TMS" ? "" : "hidden"}>
            <TmsConfig key={`tms-${orgKey}`} open={open} />
          </div>
          <div className={activeTab === "Pickup Points" ? "" : "hidden"}>
            <PickupPointConfig open={open && activeTab === "Pickup Points"} />
          </div>
          <div className={activeTab === "Cache" ? "" : "hidden"}>
            <CacheConfig key={`cache-${orgKey}`} open={open && activeTab === "Cache"} />
          </div>
          <div className={activeTab === "Geo Loc" ? "" : "hidden"}>
            <GeoLocPanel open={open && activeTab === "Geo Loc"} />
          </div>
        </div>
      </div>
    </>
  );
}
