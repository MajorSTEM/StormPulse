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
  onZipLookup: (zip: string) => void;
  zipResult: ZipLookupResult | null;
  utilityFilter: UtilityFilter;
  onUtilityFilterChange: (f: UtilityFilter) => void;
  realistic: boolean;
  onToggleRealistic: (on: boolean) => void;
  onClose: () => void;
  selectedEventId: string | null;
}

export type UtilityFilter = "all" | "NIPSCO" | "ComEd";

export interface ZipLookupResult {
  zip: string;
  found: boolean;
  affected?: number;
  cities?: string[];
  note?: string;
}

type Tab = "live" | "events";

/**
 * Power-outage console (SCADA annunciator styling): live utility feed with
 * customers-out totals that auto-refresh as restorations land, plus the
 * curated archive of rare major outage events.
 */
export default function OutagePanel({
  live, liveLoading, events, showLiveOnMap, onToggleLiveOnMap,
  onSelectEvent, onRefreshLive, onZipLookup, zipResult,
  utilityFilter, onUtilityFilterChange, realistic, onToggleRealistic,
  onClose, selectedEventId,
}: Props) {
  const [tab, setTab] = useState<Tab>("live");
  const [zipInput, setZipInput] = useState("");

  const meta = live?.meta as unknown as {
    available?: boolean;
    utility?: string;
    as_of?: string;
    outage_count?: number;
    customers_out?: number;
    top_cities?: { city: string; affected: number }[];
    utilities?: { name: string; customers_out: number; outage_count: number;
                  customers_served?: number; served_approximate?: boolean }[];
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

          {(meta?.utilities?.length ?? 0) > 1 && (
            <div className="space-y-1">
              {meta!.utilities!.map(u => {
                const served = u.customers_served;
                const pct = served ? (u.customers_out / served) * 100 : null;
                return (
                  <div key={u.name} className="py-1 border-b border-gray-800">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-gray-200 font-medium">{u.name}</span>
                      {pct !== null && (
                        <span className={`tabular-nums font-bold ${
                          pct >= 5 ? "text-red-400" : pct >= 0.5 ? "text-yellow-300" : "text-green-400"
                        }`}>
                          {pct < 0.1 && pct > 0 ? "<0.1" : pct.toFixed(1)}% out
                        </span>
                      )}
                    </div>
                    <div className="text-[10px] text-gray-400 tabular-nums">
                      {u.customers_out.toLocaleString()} of {u.served_approximate ? "~" : ""}
                      {served ? served.toLocaleString() : "?"} customers without power
                      · {u.outage_count.toLocaleString()} active outages
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* ZIP lookup — aggregate data only; the ZIP is never stored */}
          <div className="border border-gray-700 rounded px-2 py-1.5 space-y-1">
            <div className="flex gap-1.5">
              <input
                type="text"
                inputMode="numeric"
                maxLength={5}
                value={zipInput}
                onChange={e => setZipInput(e.target.value.replace(/\D/g, ""))}
                onKeyDown={e => { if (e.key === "Enter" && zipInput.length === 5) onZipLookup(zipInput); }}
                placeholder="ZIP code…"
                className="flex-1 bg-gray-800 border border-gray-600 rounded px-2 py-1 text-xs text-gray-200 focus:outline-none focus:border-yellow-500"
              />
              <button
                onClick={() => zipInput.length === 5 && onZipLookup(zipInput)}
                disabled={zipInput.length !== 5 || liveLoading}
                className="text-[10px] font-bold uppercase tracking-wider bg-yellow-600 hover:bg-yellow-500 disabled:bg-gray-700 disabled:text-gray-500 text-black rounded px-2.5 transition"
              >
                Check
              </button>
            </div>
            {zipResult && (
              zipResult.found ? (
                <div className="text-[11px] text-yellow-200">
                  <span className="font-bold tabular-nums">{(zipResult.affected ?? 0).toLocaleString()}</span> customers
                  out in {zipResult.zip} ({(zipResult.cities ?? []).join(", ")})
                </div>
              ) : (
                <div className="text-[11px] text-green-300">
                  {zipResult.zip}: no reported outages — area appears energized. (NIPSCO territory)
                </div>
              )
            )}
            <div className="text-[9px] text-gray-500">
              ZIP is used only for this lookup — never stored. NIPSCO territory only.
            </div>
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

          {/* Utility filter */}
          <div className="flex gap-1">
            {(["all", "NIPSCO", "ComEd"] as UtilityFilter[]).map(f => (
              <button
                key={f}
                onClick={() => onUtilityFilterChange(f)}
                className={`flex-1 text-[10px] font-bold uppercase tracking-wider py-1 rounded border transition ${
                  utilityFilter === f
                    ? "border-yellow-500 bg-yellow-600 text-black"
                    : "border-gray-700 text-gray-400 hover:text-gray-200 hover:border-yellow-700"
                }`}
              >
                {f === "all" ? "Both" : f}
              </button>
            ))}
          </div>

          {/* Realistic (lights-out) view — dark basemap only */}
          <label className="flex items-center gap-2 text-xs text-gray-200 border border-gray-700 rounded px-2 py-1.5 cursor-pointer hover:border-yellow-600">
            <input
              type="checkbox"
              checked={realistic}
              onChange={e => onToggleRealistic(e.target.checked)}
              className="w-3.5 h-3.5 accent-yellow-500"
            />
            <span>
              Realistic view
              <span className="block text-[9px] text-gray-500">
                Dark basemap: outages appear as lights-out zones instead of colored bubbles
              </span>
            </span>
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
          Live: NIPSCO + ComEd public feeds · Events: curated + SPC wind reports
        </div>
      </div>
    </div>
  );
}
