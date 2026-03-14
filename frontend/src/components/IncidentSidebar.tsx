"use client";

import { useState, useMemo, useRef } from "react";
import type { GeoJSONFeatureCollection, CorridorProperties, LSRProperties, AlertProperties } from "@/lib/types";
import { formatDistanceToNowStrict } from "date-fns";

interface Props {
  alerts: GeoJSONFeatureCollection | null;
  corridors: GeoJSONFeatureCollection | null;
  lsrs: GeoJSONFeatureCollection | null;
  onSelectIncident: (incidentId: string) => void;
  onSelectAlert: (alertId: string) => void;
  activeAlertId: string | null;
}

function timeAgo(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return formatDistanceToNowStrict(new Date(iso), { addSuffix: true });
  } catch { return "—"; }
}

function formatTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) + " " + d.toLocaleDateString([], { month: "short", day: "numeric" });
  } catch { return iso || "—"; }
}

const CONFIDENCE_COLOR: Record<string, string> = {
  HIGH: "text-red-400 border-red-600",
  MEDIUM: "text-orange-400 border-orange-600",
  LOW: "text-yellow-400 border-yellow-600",
};

const ALERT_COLORS: Record<string, string> = {
  "Tornado Emergency":           "bg-purple-600",
  "Tornado Warning":             "bg-red-600",
  "Tornado Watch":               "bg-amber-500",
  "Severe Thunderstorm Warning": "bg-orange-500",
  "Extreme Wind Warning":        "bg-red-700",
  "High Wind Warning":           "bg-orange-500",
  "High Wind Watch":             "bg-yellow-500",
  "Wind Advisory":               "bg-lime-500",
  "Flash Flood Warning":         "bg-green-600",
  "Flash Flood Watch":           "bg-green-400",
  "Winter Storm Warning":        "bg-blue-500",
  "Blizzard Warning":            "bg-blue-400",
  "Ice Storm Warning":           "bg-blue-300",
  "Special Weather Statement":   "bg-slate-500",
};

const LSR_TYPE_LABEL: Record<string, string> = {
  T: "Tornado", TF: "Tornado (F)", TW: "Tornado (W)",
  W: "Wind Damage", H: "Hail", DS: "Dust Storm", WF: "Wildfire",
  R: "Heavy Rain", S: "Snow", Z: "Freezing Rain",
};

// Severity tier config for alert cards
const TIER_ORDER = ["RED", "ORANGE", "YELLOW", "BLUE", "GRAY"] as const;
type SeverityTier = (typeof TIER_ORDER)[number];

const TIER_CONFIG: Record<SeverityTier, { label: string; dotCls: string; cardCls: string; badgeCls: string }> = {
  RED:    { label: "Life Threat", dotCls: "bg-red-500",    cardCls: "border-red-800 bg-red-950/30",      badgeCls: "text-red-300 bg-red-900/50 border-red-700" },
  ORANGE: { label: "Severe",      dotCls: "bg-orange-500", cardCls: "border-orange-800 bg-orange-950/20", badgeCls: "text-orange-300 bg-orange-900/50 border-orange-700" },
  YELLOW: { label: "Watch",       dotCls: "bg-yellow-500", cardCls: "border-gray-700 bg-gray-800/10",    badgeCls: "text-yellow-300 bg-yellow-900/40 border-yellow-700" },
  BLUE:   { label: "Marine",      dotCls: "bg-blue-500",   cardCls: "border-gray-700 bg-gray-800/10",    badgeCls: "text-blue-300 bg-blue-900/40 border-blue-700" },
  GRAY:   { label: "Info",        dotCls: "bg-gray-500",   cardCls: "border-gray-700 bg-gray-800/10",    badgeCls: "text-gray-400 bg-gray-800 border-gray-600" },
};

// Show individual cards for RED + ORANGE; summary counts for YELLOW/BLUE/GRAY
const TIERS_AS_CARDS: SeverityTier[] = ["RED", "ORANGE"];
const TIERS_AS_SUMMARY: SeverityTier[] = ["YELLOW", "BLUE", "GRAY"];

const CATEGORY_BADGE: Record<string, { label: string; cls: string }> = {
  TORNADO:        { label: "Tornado",       cls: "bg-red-900 text-red-300 border-red-700" },
  WIND_DAMAGE:    { label: "Wind Damage",   cls: "bg-orange-900 text-orange-300 border-orange-700" },
  SEVERE_WEATHER: { label: "Severe Wx",    cls: "bg-purple-900 text-purple-300 border-purple-700" },
  FLOOD_ZONE:     { label: "Flood Zone",   cls: "bg-cyan-900 text-cyan-300 border-cyan-700" },
};

const EF_HEX: Record<number, string> = {
  0: "#86efac", 1: "#fde047", 2: "#fb923c",
  3: "#ef4444", 4: "#991b1b", 5: "#7c3aed",
};

function efColor(magnitude: number | null | undefined): string {
  if (magnitude === null || magnitude === undefined) return "#86efac";
  return EF_HEX[Math.min(5, Math.max(0, Math.round(magnitude)))] ?? "#86efac";
}

type Tab = "live" | "corridors" | "alerts";

export default function IncidentSidebar({ alerts, corridors, lsrs, onSelectIncident, onSelectAlert, activeAlertId }: Props) {
  const [tab, setTab] = useState<Tab>("live");
  const [search, setSearch] = useState("");

  // Switch to alerts tab when activeAlertId changes from map click
  const prevActiveAlertIdRef = useRef<string | null>(null);
  if (activeAlertId && activeAlertId !== prevActiveAlertIdRef.current) {
    prevActiveAlertIdRef.current = activeAlertId;
    if (tab !== "alerts") setTab("alerts");
  }

  const corridorFeatures = corridors?.features || [];
  const alertFeatures = alerts?.features || [];
  const lsrFeatures = lsrs?.features || [];

  const tornadoCount = lsrFeatures.filter(f => {
    const p = f.properties as unknown as LSRProperties;
    return ["T", "TF", "TW"].includes(p.type_code);
  }).length;

  const alertsByType: Record<string, number> = {};
  alertFeatures.forEach(f => {
    const p = f.properties as unknown as AlertProperties;
    if (p.is_active) alertsByType[p.event_type] = (alertsByType[p.event_type] || 0) + 1;
  });
  const activeAlertCount = Object.values(alertsByType).reduce((a, b) => a + b, 0);

  const liveFeed = useMemo(() => {
    const q = search.toLowerCase().trim();
    return lsrFeatures
      .map(f => ({ f, p: f.properties as unknown as LSRProperties }))
      .filter(({ p }) =>
        !q ||
        p.county?.toLowerCase().includes(q) ||
        p.state?.toLowerCase().includes(q) ||
        p.city?.toLowerCase().includes(q) ||
        p.type_description?.toLowerCase().includes(q)
      )
      .sort((a, b) => {
        const ta = a.p.event_time ? new Date(a.p.event_time).getTime() : 0;
        const tb = b.p.event_time ? new Date(b.p.event_time).getTime() : 0;
        return tb - ta;
      })
      .slice(0, 40);
  }, [lsrFeatures, search]);

  const filteredCorridors = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return corridorFeatures;
    return corridorFeatures.filter(f => {
      const p = f.properties as unknown as CorridorProperties;
      return p.state?.toLowerCase().includes(q) ||
        p.county_list?.some(c => c.toLowerCase().includes(q));
    });
  }, [corridorFeatures, search]);

  // Tier-grouped alert features for the alerts tab
  const alertsByTier = useMemo(() => {
    const q = search.toLowerCase().trim();
    const groups: Record<SeverityTier, AlertProperties[]> = { RED: [], ORANGE: [], YELLOW: [], BLUE: [], GRAY: [] };
    alertFeatures.forEach(f => {
      const p = f.properties as unknown as AlertProperties;
      if (!p.is_active) return;
      const tier = (p.severity_tier || "GRAY") as SeverityTier;
      if (!groups[tier]) return;
      if (q && !p.event_type?.toLowerCase().includes(q) && !p.area_description?.toLowerCase().includes(q) && !p.headline?.toLowerCase().includes(q)) return;
      groups[tier].push(p);
    });
    return groups;
  }, [alertFeatures, search]);

  const isNew = (iso: string | null | undefined) =>
    !!iso && Date.now() - new Date(iso).getTime() < 10 * 60 * 1000;

  return (
    <div className="absolute top-16 left-3 z-10 bg-gray-900/95 backdrop-blur rounded-lg border border-gray-700 shadow-xl max-h-[calc(100vh-90px)] flex flex-col"
      style={{ width: "min(288px, calc(100vw - 24px))" }}>

      {/* Header */}
      <div className="px-3 py-2 border-b border-gray-700 flex-shrink-0">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs font-bold text-gray-300 uppercase tracking-wider">Situational Awareness</span>
          <div className="flex gap-2 text-[10px]">
            <span className="text-orange-400 font-medium">{activeAlertCount} alerts</span>
            {tornadoCount > 0 && <span className="text-red-400 font-medium">{tornadoCount} tornadoes</span>}
          </div>
        </div>

        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search county, state, event type..."
          className="w-full bg-gray-800 border border-gray-600 rounded px-2 py-1 text-xs text-gray-200 placeholder-gray-500 focus:outline-none focus:border-orange-500 transition"
        />

        <div className="flex mt-2 gap-0.5">
          {(["live", "corridors", "alerts"] as Tab[]).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 text-[10px] font-medium py-1 rounded transition ${
                tab === t ? "bg-orange-600 text-white" : "text-gray-400 hover:text-gray-200 hover:bg-gray-800"
              }`}
            >
              {t === "live" ? "Live Feed" : t === "corridors" ? `Corridors (${filteredCorridors.length})` : "NWS Alerts"}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="overflow-y-auto flex-1 pb-1">

        {/* Live Feed */}
        {tab === "live" && (
          <div className="px-2 pt-2 space-y-1">
            {liveFeed.length === 0 && (
              <p className="text-center text-xs text-gray-500 py-6">
                {search ? "No reports match your search." : "No storm reports loaded."}
              </p>
            )}
            {liveFeed.map(({ p }) => {
              const isTornado = ["T", "TF", "TW"].includes(p.type_code);
              const fresh = isNew(p.event_time);
              return (
                <div
                  key={p.id}
                  className={`rounded border px-2 py-1.5 text-xs ${
                    isTornado ? "border-red-800 bg-red-950/30" : "border-gray-700 bg-gray-800/20"
                  }`}
                >
                  <div className="flex items-start justify-between gap-1">
                    <div className="flex items-center gap-1.5 min-w-0">
                      {isTornado && (
                        <span className="w-2.5 h-2.5 rounded-full flex-shrink-0 mt-0.5"
                          style={{ background: efColor(p.magnitude) }} />
                      )}
                      <span className={`font-medium truncate ${isTornado ? "text-red-300" : "text-gray-200"}`}>
                        {LSR_TYPE_LABEL[p.type_code] || p.type_description || p.type_code}
                        {isTornado && p.magnitude !== null && p.magnitude !== undefined
                          ? ` EF${Math.round(p.magnitude)}` : ""}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      {fresh && (
                        <span className="text-[9px] bg-orange-600 text-white px-1 rounded font-bold animate-pulse">NEW</span>
                      )}
                      <span className="text-[10px] text-gray-500 whitespace-nowrap">{timeAgo(p.event_time)}</span>
                    </div>
                  </div>
                  <div className="text-[10px] text-gray-400 mt-0.5 truncate">
                    {[p.city, p.county, p.state].filter(Boolean).join(", ")}
                  </div>
                  {p.remark && (
                    <div className="text-[10px] text-gray-500 mt-0.5 line-clamp-2">{p.remark}</div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Corridors */}
        {tab === "corridors" && (
          <div className="px-2 pt-2 space-y-1.5">
            {filteredCorridors.length === 0 && (
              <p className="text-center text-xs text-gray-500 py-6">
                {search ? "No corridors match search." : "No probable corridors yet."}
              </p>
            )}
            {filteredCorridors.map((feature) => {
              const props = feature.properties as unknown as CorridorProperties;
              const confClass = CONFIDENCE_COLOR[props.confidence_label] || "text-gray-400 border-gray-600";
              const catBadge = CATEGORY_BADGE[props.event_category] || CATEGORY_BADGE["TORNADO"];
              const isFlood = props.event_category === "FLOOD_ZONE";
              return (
                <button
                  key={props.id}
                  onClick={() => onSelectIncident(props.incident_id)}
                  className="w-full text-left px-2.5 py-2 rounded border border-gray-700 hover:border-orange-500 hover:bg-gray-800 transition group"
                >
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <span className={`text-[9px] font-bold border px-1.5 py-0.5 rounded ${catBadge.cls}`}>
                      {catBadge.label}
                    </span>
                    <span className={`text-[10px] font-bold border px-1.5 py-0.5 rounded flex-shrink-0 ${confClass}`}>
                      {props.confidence_label}
                    </span>
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-medium text-white truncate">
                      {isFlood
                        ? (props.county_list?.[0] || "Flash Flood Zone")
                        : `${props.state || "Unknown"} — ${props.county_list?.slice(0, 2).join(", ")}`}
                    </div>
                    <div className="text-[10px] text-gray-400 mt-0.5">{formatTime(props.event_start)}</div>
                    {!isFlood && (
                      <div className="text-[10px] text-orange-400 mt-0.5">
                        {props.lsr_count} storm report{props.lsr_count !== 1 ? "s" : ""} · INFERRED
                      </div>
                    )}
                    {isFlood && (
                      <div className="text-[10px] text-cyan-400 mt-0.5">Official NWS warning area</div>
                    )}
                    {(props.affected_structures_est ?? 0) > 0 && (
                      <div className="text-[10px] text-yellow-400 mt-0.5 font-medium">
                        ~{(props.affected_structures_est ?? 0).toLocaleString()} est. structures in path
                      </div>
                    )}
                    {props.motion_direction_deg !== null && props.motion_speed_kts !== null && (
                      <div className="text-[10px] text-gray-500 mt-0.5">
                        Motion {Math.round(props.motion_direction_deg ?? 0)}° @ {Math.round(props.motion_speed_kts ?? 0)} kts
                      </div>
                    )}
                    <div className="text-[10px] text-orange-600 mt-1 opacity-0 group-hover:opacity-100 transition">
                      ↗ Click to fly to this area
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {/* NWS Alerts — tier-grouped */}
        {tab === "alerts" && (() => {
          const totalActive = TIER_ORDER.reduce((n, t) => n + alertsByTier[t].length, 0);
          if (totalActive === 0) return (
            <p className="text-center text-xs text-gray-500 py-6">
              {search ? "No alerts match search." : "No active alerts."}
            </p>
          );
          return (
            <div className="px-2 pt-2 space-y-2">
              {/* RED + ORANGE: individual clickable cards */}
              {TIERS_AS_CARDS.map(tier => {
                const items = alertsByTier[tier];
                if (items.length === 0) return null;
                const cfg = TIER_CONFIG[tier];
                return (
                  <div key={tier}>
                    <div className="flex items-center gap-1.5 mb-1">
                      <div className={`w-2 h-2 rounded-full flex-shrink-0 ${cfg.dotCls}`} />
                      <span className={`text-[10px] font-bold uppercase tracking-wider border px-1 rounded ${cfg.badgeCls}`}>{cfg.label}</span>
                      <span className="text-[10px] text-gray-500">{items.length}</span>
                    </div>
                    <div className="space-y-1">
                      {items.slice(0, 30).map(p => {
                        const isActive = p.id === activeAlertId;
                        return (
                          <button
                            key={p.id}
                            onClick={() => onSelectAlert(p.id)}
                            className={`w-full text-left px-2 py-1.5 rounded border transition ${cfg.cardCls} ${
                              isActive ? "ring-1 ring-white/30" : "hover:border-orange-500"
                            }`}
                          >
                            <div className="flex items-start justify-between gap-1">
                              <span className="text-xs font-medium text-white truncate flex-1">{p.event_type}</span>
                              {p.expires && (
                                <span className="text-[10px] text-gray-500 flex-shrink-0 whitespace-nowrap">
                                  exp {formatTime(p.expires)}
                                </span>
                              )}
                            </div>
                            <div className="text-[10px] text-gray-400 mt-0.5 truncate">{p.area_description}</div>
                            {p.nws_headline && (
                              <div className="text-[10px] text-gray-500 mt-0.5 line-clamp-2">{p.nws_headline}</div>
                            )}
                            <div className="text-[10px] text-orange-600 mt-0.5 opacity-0 group-hover:opacity-100">
                              ↗ Click to fly to area
                            </div>
                          </button>
                        );
                      })}
                      {items.length > 30 && (
                        <div className="text-[10px] text-gray-500 text-center py-1">+{items.length - 30} more</div>
                      )}
                    </div>
                  </div>
                );
              })}

              {/* YELLOW / BLUE / GRAY: summary rows */}
              {(() => {
                const summaryItems = TIERS_AS_SUMMARY.filter(t => alertsByTier[t].length > 0);
                if (summaryItems.length === 0) return null;
                return (
                  <div className="border-t border-gray-700 pt-2 space-y-1">
                    <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">Other Active Alerts</div>
                    {summaryItems.map(tier => {
                      const items = alertsByTier[tier];
                      const cfg = TIER_CONFIG[tier];
                      // Count by type
                      const byType: Record<string, number> = {};
                      items.forEach(p => { byType[p.event_type] = (byType[p.event_type] || 0) + 1; });
                      return (
                        <div key={tier}>
                          <div className="flex items-center gap-1.5 mb-0.5">
                            <div className={`w-2 h-2 rounded-full flex-shrink-0 ${cfg.dotCls}`} />
                            <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">{cfg.label}</span>
                            <span className="text-[10px] text-gray-500">({items.length})</span>
                          </div>
                          {Object.entries(byType).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([type, count]) => (
                            <div key={type} className="flex items-center gap-2 pl-4 py-0.5">
                              <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${ALERT_COLORS[type] || "bg-gray-500"}`} />
                              <span className="text-[10px] text-gray-300 flex-1 truncate">{type}</span>
                              <span className="text-[10px] text-gray-500 tabular-nums">{count}</span>
                            </div>
                          ))}
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </div>
          );
        })()}
      </div>

      {/* Footer */}
      <div className="px-3 py-1.5 border-t border-gray-700 flex-shrink-0">
        <div className="text-[10px] text-gray-500">SPC/NWS · refreshes every 2 min</div>
      </div>
    </div>
  );
}
