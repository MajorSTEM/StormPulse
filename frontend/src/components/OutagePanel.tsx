"use client";

import { useState } from "react";
import type {
  GeoJSONFeature,
  GeoJSONFeatureCollection,
  OutageEventProperties,
} from "@/lib/types";

interface Props {
  live: GeoJSONFeatureCollection | null;
  liveLoading: boolean;
  events: GeoJSONFeatureCollection | null;
  showLiveOnMap: boolean;
  onToggleLiveOnMap: (show: boolean) => void;
  onSelectEvent: (feature: GeoJSONFeature) => void;
  onRefreshLive: () => void;
  onClose: () => void;
  selectedEventId: string | null;
}

type Tab = "live" | "events";

/**
 * Power-outage console (SCADA annunciator styling): live utility feed with
 * customers-out totals that auto-refresh as restorations land, plus the
 * curated archive of rare major outage events.
 */
export default function OutagePanel({
  live, liveLoading, events, showLiveOnMap, onToggleLiveOnMap,
  onSelectEvent, onRefreshLive, onClose, selectedEventId,
}: Props) {
  const [tab, setTab] = useState<Tab>("live");

  const meta = live?.meta as unknown as {
    available?: boolean;
    utility?: string;
    as_of?: string;
    outage_count?: number;
    customers_out?: number;
    top_cities?: { city: string; affected: number }[];
    disclaimer?: string;
  } | undefined;

  const eventFeatures = (events?.features ?? []).filter(
    f => (f.properties as { feature_type?: string }).feature_type === "outage_event"
  );

  const asOf = meta?.as_of ? new Date(meta.as_of).toLocaleTimeString() : "—";

  return (
    <div
      className="absolute top-16 right-3 z-20 bg-gray-950 rounded-lg border border-yellow-600/60 shadow-2xl flex flex-col max-h-[calc(100vh-130px)]"
      style={{ width: "min(300px, calc(100vw - 24px))" }}
    >
      {/* Header */}
      <div className="px-3 py-2 border-b border-yellow-800/50 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-yellow-400 animate-pulse" />
          <span className="text-xs font-bold text-yellow-300 uppercase tracking-wider">
            Power Outages
          </span>
        </div>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-white w-6 h-6 flex items-center justify-center rounded hover:bg-gray-700"
          aria-label="Close outage panel"
        >
          ✕
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-0.5 px-2 pt-1.5 flex-shrink-0">
        {(["live", "events"] as Tab[]).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 text-[10px] font-bold uppercase tracking-wider py-1 rounded transition ${
              tab === t ? "bg-yellow-600 text-black" : "text-gray-400 hover:text-gray-200 hover:bg-gray-800"
            }`}
          >
            {t === "live" ? "Live Map" : `Major Events (${eventFeatures.length})`}
          </button>
        ))}
      </div>

      {/* Live tab */}
      {tab === "live" && (
        <div className="overflow-y-auto flex-1 px-3 py-2 space-y-2">
          {/* SCADA-style stat tiles */}
          <div className="grid grid-cols-2 gap-1.5">
            <div className="bg-gray-800/60 border border-gray-700 rounded p-2">
              <div className="text-[9px] text-gray-500 uppercase tracking-wider">Customers Out</div>
              <div className={`text-lg font-bold tabular-nums ${
                (meta?.customers_out ?? 0) > 10000 ? "text-red-400"
                : (meta?.customers_out ?? 0) > 500 ? "text-yellow-300" : "text-green-400"
              }`}>
                {meta?.available ? (meta.customers_out ?? 0).toLocaleString() : "—"}
              </div>
            </div>
            <div className="bg-gray-800/60 border border-gray-700 rounded p-2">
              <div className="text-[9px] text-gray-500 uppercase tracking-wider">Active Outages</div>
              <div className="text-lg font-bold text-gray-200 tabular-nums">
                {meta?.available ? (meta.outage_count ?? 0).toLocaleString() : "—"}
              </div>
            </div>
          </div>
          <div className="flex items-center justify-between text-[10px] text-gray-400">
            <span>{meta?.utility ?? "NIPSCO"} · scan {asOf}</span>
            <button
              onClick={onRefreshLive}
              disabled={liveLoading}
              className="border border-gray-600 rounded px-1.5 py-0.5 hover:border-yellow-500 hover:text-yellow-300 disabled:opacity-50"
            >
              {liveLoading ? "…" : "↻ Refresh"}
            </button>
          </div>

          <label className="flex items-center gap-2 text-xs text-gray-200 border border-gray-700 rounded px-2 py-1.5 cursor-pointer hover:border-yellow-600">
            <input
              type="checkbox"
              checked={showLiveOnMap}
              onChange={e => onToggleLiveOnMap(e.target.checked)}
              className="w-3.5 h-3.5 accent-yellow-500"
            />
            Show outages on map
          </label>

          {/* Per-city rollup */}
          {meta?.available && (meta.top_cities?.length ?? 0) > 0 && (
            <div>
              <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">
                Hardest-hit communities
              </div>
              <div className="space-y-0.5">
                {meta.top_cities!.map(c => (
                  <div key={c.city} className="flex items-center justify-between text-[11px] py-0.5 border-b border-gray-800">
                    <span className="text-gray-300">{c.city}</span>
                    <span className="text-yellow-300 font-medium tabular-nums">{c.affected.toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {meta?.available === false && (
            <p className="text-xs text-gray-500 py-4 text-center">
              Utility outage feed unreachable right now — retrying automatically.
            </p>
          )}
          <p className="text-[9px] text-gray-400 leading-relaxed">
            Mirrors the utility&apos;s public outage map (~10 min updates). Dots mark
            reported outages — areas without dots are presumed energized.
            Restored areas drop off automatically on each scan.
          </p>
        </div>
      )}

      {/* Events tab */}
      {tab === "events" && (
        <div className="overflow-y-auto flex-1 px-2 py-2 space-y-1.5">
          <p className="text-[10px] text-gray-300 px-1 leading-relaxed">
            Major outage events are rare — this archive documents them with the
            full record: wind data, customers affected, restoration timeline, sources.
          </p>
          {eventFeatures.map(f => {
            const p = f.properties as unknown as OutageEventProperties;
            const active = p.id === selectedEventId;
            return (
              <button
                key={p.id}
                onClick={() => onSelectEvent(f)}
                className={`w-full text-left px-2.5 py-2 rounded border transition ${
                  active
                    ? "border-yellow-500 bg-yellow-950/40 ring-1 ring-yellow-500/40"
                    : "border-gray-600 bg-gray-800/80 hover:border-yellow-500"
                }`}
              >
                <div className="text-xs font-medium text-yellow-200">{p.name}</div>
                <div className="text-[10px] text-gray-300 mt-0.5">{p.utility}</div>
                <div className="text-[10px] text-gray-200 mt-1 flex flex-wrap gap-x-2">
                  <span className="text-red-400 font-medium">
                    {p.customers_affected.toLocaleString()} customers out
                  </span>
                  <span>gusts to {p.peak_gust_measured_mph} mph</span>
                  <span>{p.communities_affected} communities</span>
                </div>
                {p.largest_in_utility_history && (
                  <div className="text-[9px] text-yellow-400 mt-0.5 font-bold uppercase tracking-wider">
                    Largest outage event in utility history
                  </div>
                )}
                {active && (
                  <div className="text-[10px] text-yellow-400 mt-0.5">▶ Swath + gust reports on map</div>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* Footer */}
      <div className="px-3 py-1.5 border-t border-gray-700 flex-shrink-0">
        <div className="text-[10px] text-gray-500">
          Live: NIPSCO public feed · Events: curated + SPC wind reports
        </div>
      </div>
    </div>
  );
}
