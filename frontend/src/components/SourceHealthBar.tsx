"use client";

import { useEffect, useState } from "react";
import { fetchHealth } from "@/lib/api";
import type { HealthStatus } from "@/lib/types";

function statusColor(health: string): string {
  switch (health) {
    case "ok": return "bg-green-500";
    case "degraded": return "bg-yellow-500";
    case "stale": return "bg-red-500";
    default: return "bg-gray-500";
  }
}

function formatLag(lag: number | null): string {
  if (lag === null) return "never";
  if (lag < 60) return `${Math.round(lag)}s ago`;
  if (lag < 3600) return `${Math.round(lag / 60)}m ago`;
  return `${Math.round(lag / 3600)}h ago`;
}

const SOURCE_LABELS: Record<string, string> = {
  nws_alerts: "NWS Alerts",
  nws_lsr: "LSR Feed",
  corridor_engine: "Corridor Engine",
};

// OPC-style data-quality chip per source health (SCADA convention)
function qualityLabel(health: string): { text: string; cls: string } {
  switch (health) {
    case "ok": return { text: "GOOD", cls: "text-green-400 border-green-800" };
    case "degraded": return { text: "DEGRADED", cls: "text-yellow-400 border-yellow-800" };
    case "stale": return { text: "STALE", cls: "text-red-400 border-red-800" };
    default: return { text: "INIT", cls: "text-gray-400 border-gray-700" };
  }
}

interface Props {
  historianOpen?: boolean;
  onToggleHistorian?: () => void;
}

export default function SourceHealthBar({ historianOpen, onToggleHistorian }: Props) {
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [isDegraded, setIsDegraded] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetchHealth();
        const data: HealthStatus = await res.json();
        setHealth(data);
        setIsDegraded(data.status !== "ok" && data.status !== "initializing");
      } catch {
        setIsDegraded(true);
      }
    };
    load();
    const interval = setInterval(load, 60000);
    return () => clearInterval(interval);
  }, []);

  if (!health) return null;

  const isStale = health.freshness?.stale === true;
  const dataAsOf = health.freshness?.data_as_of
    ? new Date(health.freshness.data_as_of).toLocaleString()
    : "unknown";

  return (
    <div className="absolute top-0 left-0 right-0 z-10">
      {isStale && (
        <div className="bg-red-700 text-white text-xs text-center py-1 px-4 font-semibold">
          &#9888; STALE DATA &mdash; upstream NWS/SPC feeds unavailable; showing locally
          cached data as of {dataAsOf}
        </div>
      )}
      {!isStale && isDegraded && (
        <div className="bg-yellow-600 text-black text-xs text-center py-1 px-4 font-medium">
          &#9888; Data sources delayed &mdash; map may not reflect latest conditions
        </div>
      )}
      <div className="flex items-center bg-gray-900/90 backdrop-blur px-3 py-2 text-xs text-gray-300 border-b border-gray-700">
        <span className="font-bold text-white mr-2">StormPulse</span>

        {/* Mobile: status dots only */}
        <div className="flex items-center gap-1.5 md:hidden">
          {health.sources.map((source) => (
            <div
              key={source.name}
              className={`w-2 h-2 rounded-full ${statusColor(source.health)}`}
              title={`${SOURCE_LABELS[source.name]}: ${formatLag(source.lag_seconds)}`}
            />
          ))}
        </div>

        {/* Desktop: full labels with OPC-style quality chips */}
        <div className="hidden md:flex items-center gap-3">
          <span className="text-gray-600">|</span>
          {health.sources.map((source) => {
            const q = qualityLabel(source.health);
            return (
              <div key={source.name} className="flex items-center gap-1.5">
                <div className={`w-2 h-2 rounded-full ${statusColor(source.health)}`} />
                <span>{SOURCE_LABELS[source.name] || source.name}</span>
                <span className={`text-[9px] font-bold border px-1 rounded ${q.cls}`}>{q.text}</span>
                <span className="text-gray-500">{formatLag(source.lag_seconds)}</span>
              </div>
            );
          })}
        </div>

        <div className="ml-auto flex items-center gap-3">
          {onToggleHistorian && (
            <button
              onClick={onToggleHistorian}
              className={`flex items-center gap-1 border rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider transition ${
                historianOpen
                  ? "border-amber-500 text-amber-300 bg-amber-950/50"
                  : "border-amber-800 text-amber-400 hover:bg-amber-950/40"
              }`}
              title="Historical tornado archive (SPC 1950-2024)"
            >
              <span>🌪</span>
              <span>Historian</span>
            </button>
          )}
          <span className="text-gray-600 text-[10px] hidden md:block">
            INFERRED CORRIDORS ARE NOT OFFICIAL NWS SURVEYS
          </span>
        </div>
      </div>
    </div>
  );
}
