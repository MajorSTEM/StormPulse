"use client";

import { useState } from "react";
import type { GeoJSONFeature, GeoJSONFeatureCollection, TornadoHistoryProperties } from "@/lib/types";
import type { HistoryQuery } from "@/lib/api";

interface Props {
  data: GeoJSONFeatureCollection | null;
  loading: boolean;
  onQuery: (q: HistoryQuery) => void;
  onSelect: (feature: GeoJSONFeature) => void;
  onClose: () => void;
  selectedId: number | null;
}

const EF_HEX: Record<number, string> = {
  0: "#86efac", 1: "#fde047", 2: "#fb923c",
  3: "#ef4444", 4: "#991b1b", 5: "#7c3aed",
};

const STATES = [
  "", "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA", "HI", "ID",
  "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD", "MA", "MI", "MN", "MS",
  "MO", "MT", "NE", "NV", "NH", "NJ", "NM", "NY", "NC", "ND", "OH", "OK",
  "OR", "PA", "RI", "SC", "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV",
  "WI", "WY", "DC", "PR", "VI",
];

/**
 * Historian-style archive query panel (AVEVA PI trend-query inspired):
 * time range + attribute filters up top, capped result set below,
 * click a record to replay its surveyed path on the map.
 */
export default function HistoryPanel({ data, loading, onQuery, onSelect, onClose, selectedId }: Props) {
  const [yearFrom, setYearFrom] = useState(2000);
  const [yearTo, setYearTo] = useState(2024);
  const [state, setState] = useState("");
  const [efMin, setEfMin] = useState(2);

  const run = () =>
    onQuery({ yearFrom, yearTo, state: state || undefined, efMin, limit: 750 });

  const features = data?.features ?? [];
  const meta = data?.meta as
    | { count: number; total_matching?: number; truncated?: boolean }
    | undefined;

  const inputCls =
    "bg-gray-800 border border-gray-600 rounded px-1.5 py-1 text-xs text-gray-200 focus:outline-none focus:border-amber-500 w-full";

  return (
    <div
      className="absolute top-16 right-3 z-20 bg-gray-900/95 backdrop-blur rounded-lg border border-amber-700/60 shadow-xl flex flex-col max-h-[calc(100vh-130px)]"
      style={{ width: "min(300px, calc(100vw - 24px))" }}
    >
      {/* Header */}
      <div className="px-3 py-2 border-b border-amber-800/50 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
          <span className="text-xs font-bold text-amber-300 uppercase tracking-wider">
            Historian · Tornado Archive
          </span>
        </div>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-white w-6 h-6 flex items-center justify-center rounded hover:bg-gray-700"
          aria-label="Close historian"
        >
          ✕
        </button>
      </div>

      {/* Query builder */}
      <div className="px-3 py-2 border-b border-gray-700 flex-shrink-0 space-y-1.5">
        <div className="text-[10px] text-gray-500 uppercase tracking-wider">Archive Query</div>
        <div className="grid grid-cols-2 gap-1.5">
          <label className="text-[10px] text-gray-400">
            From (year)
            <input type="number" min={1950} max={2024} value={yearFrom}
              onChange={e => setYearFrom(Number(e.target.value))} className={inputCls} />
          </label>
          <label className="text-[10px] text-gray-400">
            To (year)
            <input type="number" min={1950} max={2024} value={yearTo}
              onChange={e => setYearTo(Number(e.target.value))} className={inputCls} />
          </label>
          <label className="text-[10px] text-gray-400">
            State
            <select value={state} onChange={e => setState(e.target.value)} className={inputCls}>
              {STATES.map(s => <option key={s || "all"} value={s}>{s || "All states"}</option>)}
            </select>
          </label>
          <label className="text-[10px] text-gray-400">
            Min EF rating
            <select value={efMin} onChange={e => setEfMin(Number(e.target.value))} className={inputCls}>
              {[0, 1, 2, 3, 4, 5].map(v => <option key={v} value={v}>EF{v}+</option>)}
            </select>
          </label>
        </div>
        <button
          onClick={run}
          disabled={loading}
          className="w-full bg-amber-600 hover:bg-amber-500 disabled:bg-gray-700 disabled:text-gray-500 text-black font-bold text-xs py-1.5 rounded transition uppercase tracking-wider"
        >
          {loading ? "Querying…" : "Run Query"}
        </button>
        {meta && (
          <div className="text-[10px] text-gray-500 tabular-nums">
            {meta.count.toLocaleString()} of {(meta.total_matching ?? meta.count).toLocaleString()} records
            {meta.truncated ? " · strongest shown first — narrow the query for more" : ""}
          </div>
        )}
      </div>

      {/* Records */}
      <div className="overflow-y-auto flex-1">
        {features.length === 0 && (
          <p className="text-center text-xs text-gray-500 py-8 px-4">
            {loading ? "Reading archive…" : "Run a query to load historical tornadoes (SPC database, 1950–2024)."}
          </p>
        )}
        <div className="px-2 py-1.5 space-y-1">
          {features.map(f => {
            const p = f.properties as unknown as TornadoHistoryProperties;
            const active = p.id === selectedId;
            return (
              <button
                key={p.id}
                onClick={() => onSelect(f)}
                className={`w-full text-left px-2 py-1.5 rounded border transition text-xs ${
                  active
                    ? "border-amber-500 bg-amber-950/40 ring-1 ring-amber-500/40"
                    : "border-gray-700 bg-gray-800/20 hover:border-amber-600"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span
                      className="text-[9px] font-bold px-1 rounded flex-shrink-0 text-black"
                      style={{ background: EF_HEX[Math.max(0, p.ef)] ?? "#64748b" }}
                    >
                      {p.ef >= 0 ? `EF${p.ef}` : "EF?"}
                    </span>
                    <span className="text-gray-200 font-medium truncate">{p.date} · {p.state}</span>
                  </div>
                  <span className="text-[10px] text-gray-500 flex-shrink-0 tabular-nums">
                    {p.length_mi > 0 ? `${p.length_mi.toFixed(1)} mi` : "—"}
                  </span>
                </div>
                <div className="text-[10px] text-gray-500 mt-0.5 flex gap-2">
                  {p.fatalities > 0 && <span className="text-red-400">{p.fatalities} fatalities</span>}
                  {p.injuries > 0 && <span>{p.injuries} injured</span>}
                  {!p.has_path && <span className="italic">touchdown point only</span>}
                </div>
                {active && (
                  <div className="text-[10px] text-amber-400 mt-0.5">▶ Replaying path on map</div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Footer */}
      <div className="px-3 py-1.5 border-t border-gray-700 flex-shrink-0">
        <div className="text-[10px] text-gray-500">
          SPC tornado database 1950–2024 · paths are surveyed start→end segments
        </div>
      </div>
    </div>
  );
}
