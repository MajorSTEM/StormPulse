"use client";

import { useEffect, useState } from "react";

interface Props {
  lastUpdated: Date | null;
}

function formatAgo(date: Date): string {
  const secs = Math.floor((Date.now() - date.getTime()) / 1000);
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  return `${hrs}h ${mins % 60}m ago`;
}

export default function LastUpdatedTicker({ lastUpdated }: Props) {
  const [label, setLabel] = useState<string>("—");

  useEffect(() => {
    if (!lastUpdated) return;
    setLabel(formatAgo(lastUpdated));
    const interval = setInterval(() => setLabel(formatAgo(lastUpdated)), 10_000);
    return () => clearInterval(interval);
  }, [lastUpdated]);

  const isStale = lastUpdated && Date.now() - lastUpdated.getTime() > 5 * 60 * 1000;

  return (
    <div className="absolute top-16 left-1/2 -translate-x-1/2 z-10 pointer-events-none">
      <div className={`text-[10px] px-2 py-0.5 rounded-full border ${
        isStale
          ? "bg-red-950/80 border-red-700 text-red-400"
          : "bg-gray-900/80 border-gray-700 text-gray-500"
      }`}>
        {isStale ? "⚠ Data stale · " : ""}Data updated {label}
      </div>
    </div>
  );
}
