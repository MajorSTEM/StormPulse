"use client";

import { useState } from "react";
import type { LayerVisibility } from "@/lib/types";

interface Props {
  layers: LayerVisibility;
  onToggle: (layer: keyof LayerVisibility) => void;
  hours: number;
  onHoursChange: (hours: number) => void;
  onRefresh: () => void;
  onShare: () => void;
}

interface LayerDef {
  key: keyof LayerVisibility;
  label: string;
  color: string;
  tier?: string;
}

const LAYERS: LayerDef[] = [
  { key: "alerts", label: "NWS Warnings", color: "bg-red-500", tier: "T1" },
  { key: "lsr", label: "Storm Reports (LSR)", color: "bg-blue-500", tier: "T1/T2" },
  { key: "corridors", label: "Probable Corridors", color: "bg-orange-500", tier: "T3 INFERRED" },
  { key: "counties", label: "Counties", color: "bg-gray-500" },
];

const TIER_COLORS: Record<string, string> = {
  "T1": "text-green-400",
  "T1/T2": "text-blue-400",
  "T3 INFERRED": "text-orange-400",
};

export default function LayerControls({ layers, onToggle, hours, onHoursChange, onRefresh, onShare }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <div className="absolute top-16 right-3 z-10">
      {/* Mobile toggle button — hidden on md+ */}
      <button
        onClick={() => setOpen(o => !o)}
        className="md:hidden flex items-center gap-1.5 bg-gray-900/95 backdrop-blur border border-gray-700 rounded-lg px-3 py-1.5 text-xs text-gray-300 shadow-xl"
      >
        <span>{open ? "✕" : "⚙"}</span>
        <span>{open ? "Close" : "Layers"}</span>
      </button>

      {/* Panel: always visible on desktop, toggled on mobile */}
      <div className={`${open ? "block" : "hidden"} md:block mt-1 md:mt-0 w-56 bg-gray-900/95 backdrop-blur rounded-lg border border-gray-700 shadow-xl`}>
      <div className="px-3 py-2 border-b border-gray-700">
        <span className="text-xs font-bold text-gray-300 uppercase tracking-wider">Layers</span>
      </div>

      <div className="p-2 space-y-1">
        {LAYERS.map((layer) => (
          <label
            key={layer.key}
            className="flex items-center gap-2.5 px-2 py-1.5 rounded hover:bg-gray-800 cursor-pointer"
          >
            <input
              type="checkbox"
              checked={layers[layer.key]}
              onChange={() => onToggle(layer.key)}
              className="w-4 h-4 rounded accent-orange-500"
            />
            <div className={`w-3 h-3 rounded-sm ${layer.color} flex-shrink-0`} />
            <div className="flex-1 min-w-0">
              <div className="text-xs text-white">{layer.label}</div>
              {layer.tier && (
                <div className={`text-[10px] ${TIER_COLORS[layer.tier] || "text-gray-400"}`}>
                  {layer.tier}
                </div>
              )}
            </div>
          </label>
        ))}
      </div>

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
