"use client";

import { useState } from "react";
import type { LayerVisibility } from "@/lib/types";

type Basemap = "dark" | "satellite" | "street";

interface Props {
  layers: LayerVisibility;
  onToggle: (layer: keyof LayerVisibility) => void;
  hours: number;
  onHoursChange: (hours: number) => void;
  onRefresh: () => void;
  onShare: () => void;
  mobileOpen?: boolean;
  onMobileOpenChange?: (open: boolean) => void;
  basemap: Basemap;
  onBasemapChange: (b: Basemap) => void;
}

interface LayerDef {
  key: keyof LayerVisibility;
  label: string;
  color: string;
  subLabel?: string;
  subCls?: string;
}

const ALERT_TIERS: LayerDef[] = [
  { key: "alertsRed",    label: "Life Threats",          color: "bg-red-500",    subLabel: "Tornado Warn / Flash Flood / Blizzard" },
  { key: "alertsOrange", label: "Severe",                color: "bg-orange-500", subLabel: "Svr Tstorm / High Wind / Flood Warn" },
  { key: "alertsYellow", label: "Watches & Advisories",  color: "bg-yellow-400", subLabel: "Watches, Wind/Fog/Heat Advisories" },
  { key: "alertsBlue",   label: "Marine",                color: "bg-blue-500",   subLabel: "Small Craft, Gale, Surf" },
  { key: "alertsGray",   label: "Informational",         color: "bg-gray-500",   subLabel: "Statements, Outlooks" },
];

const OTHER_LAYERS: LayerDef[] = [
  { key: "lsr",      label: "Storm Reports (LSR)", color: "bg-blue-400",   subLabel: "T1/T2 Official", subCls: "text-blue-400" },
  { key: "corridors", label: "Prob. Corridors",   color: "bg-orange-500", subLabel: "T3 INFERRED",   subCls: "text-orange-400" },
  { key: "counties", label: "County Outlines",    color: "bg-gray-500" },
];

export default function LayerControls({ layers, onToggle, hours, onHoursChange, onRefresh, onShare, mobileOpen, onMobileOpenChange, basemap, onBasemapChange }: Props) {
  const [open, setOpen] = useState(false);
  const isOpen = mobileOpen !== undefined ? mobileOpen : open;
  const setIsOpen = (val: boolean) => {
    setOpen(val);
    onMobileOpenChange?.(val);
  };

  const renderLayer = (layer: LayerDef) => (
    <label
      key={layer.key}
      className="flex items-center gap-2 px-2 py-1 rounded hover:bg-gray-800 cursor-pointer"
    >
      <input
        type="checkbox"
        checked={layers[layer.key]}
        onChange={() => onToggle(layer.key)}
        className="w-3.5 h-3.5 rounded accent-orange-500 flex-shrink-0"
      />
      <div className={`w-2.5 h-2.5 rounded-sm ${layer.color} flex-shrink-0`} />
      <div className="flex-1 min-w-0">
        <div className="text-xs text-white leading-tight">{layer.label}</div>
        {layer.subLabel && (
          <div className={`text-[10px] truncate ${layer.subCls || "text-gray-500"}`}>{layer.subLabel}</div>
        )}
      </div>
    </label>
  );

  return (
    <div className="absolute top-16 right-3 z-10">
      {/* Mobile toggle button — hidden on md+ */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="md:hidden flex items-center gap-1.5 bg-gray-900/85 backdrop-blur border border-gray-700 rounded-lg px-3 py-1.5 text-xs text-gray-300 shadow-xl"
      >
        <span>{isOpen ? "✕" : "⚙"}</span>
        <span>{isOpen ? "Close" : "Layers"}</span>
      </button>

      {/* Panel: always visible on desktop, toggled on mobile */}
      <div className={`${isOpen ? "block" : "hidden"} md:block mt-1 md:mt-0 w-60 bg-gray-900/85 backdrop-blur rounded-lg border border-gray-700 shadow-xl overflow-y-auto max-h-[calc(100vh-200px)]`}>

          {/* Basemap switcher */}
        <div className="px-3 py-1.5 border-b border-gray-700">
          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Basemap</span>
        </div>
        <div className="px-3 py-2 border-b border-gray-700 flex gap-1">
          {(["dark", "satellite", "street"] as Basemap[]).map(b => (
            <button
              key={b}
              onClick={() => onBasemapChange(b)}
              className={`flex-1 text-[10px] py-1.5 rounded transition capitalize ${
                basemap === b
                  ? "bg-orange-600 text-white"
                  : "bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700"
              }`}
            >
              {b === "dark" ? "Dark" : b === "satellite" ? "Satellite" : "Street"}
            </button>
          ))}
        </div>

        {/* NWS Alerts section */}
        <div className="px-3 py-1.5 border-b border-gray-700">
          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">NWS Alerts</span>
        </div>
        <div className="py-1">
          {ALERT_TIERS.map(renderLayer)}
        </div>

        {/* Other layers */}
        <div className="px-3 py-1.5 border-t border-gray-700">
          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Other Layers</span>
        </div>
        <div className="py-1">
          {OTHER_LAYERS.map(renderLayer)}
        </div>

        {/* Time window */}
        <div className="px-3 py-2 border-t border-gray-700">
          <label className="text-xs text-gray-400 mb-1 block">Time window</label>
          <select
            value={hours}
            onChange={(e) => onHoursChange(Number(e.target.value))}
            className="w-full bg-gray-800 text-white text-xs rounded px-2 py-1.5 border border-gray-600"
          >
            <option value={6}>Last 6 hours</option>
            <option value={12}>Last 12 hours</option>
            <option value={24}>Last 24 hours</option>
            <option value={48}>Last 48 hours</option>
            <option value={72}>Last 72 hours</option>
          </select>
        </div>

        <div className="px-3 py-2 border-t border-gray-700 flex gap-2">
          <button
            onClick={onRefresh}
            className="flex-1 text-xs bg-blue-700 hover:bg-blue-600 text-white rounded px-2 py-1.5 transition"
          >
            Refresh
          </button>
          <button
            onClick={onShare}
            className="flex-1 text-xs bg-gray-700 hover:bg-gray-600 text-white rounded px-2 py-1.5 transition"
          >
            Share Link
          </button>
        </div>
      </div>
    </div>
  );
}
