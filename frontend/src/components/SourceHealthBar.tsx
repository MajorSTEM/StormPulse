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

export default function SourceHealthBar() {
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

  return (
    <div className="absolute top-0 left-0 right-0 z-10">
      {isDegraded && (
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

        {/* Desktop: full labels */}
        <div className="hidden md:flex items-center gap-3">
          <span className="text-gray-600">|</span>
          {health.sources.map((source) => (
            <div key={source.name} className="flex items-center gap-1.5">
              <div className={`w-2 h-2 rounded-full ${statusColor(source.health)}`} />
              <span>{SOURCE_LABELS[source.name] || source.name}</span>
              <span className="text-gray-500">{formatLag(source.lag_seconds)}</span>
            </div>
          ))}
        </div>

        <span className="ml-auto text-gray-600 text-[10px] hidden md:block">
          INFERRED CORRIDORS ARE NOT OFFICIAL NWS SURVEYS
        </span>
      </div>
    </div>
  );
}
