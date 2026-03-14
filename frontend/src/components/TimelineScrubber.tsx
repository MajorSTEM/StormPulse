"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { GeoJSONFeatureCollection } from "@/lib/types";

interface Props {
  lsrs: GeoJSONFeatureCollection | null;
  onScrubTime: (ts: number | null) => void; // null = live view
}

const TORNADO_CODES = new Set(["T", "TF", "TW"]);
const PLAY_STEPS = 300;     // traverse full range in 30 s at 100 ms/step
const PLAY_INTERVAL_MS = 100;

function fmtTime(ts: number): string {
  return new Date(ts).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  });
}

export default function TimelineScrubber({ lsrs, onScrubTime }: Props) {
  const [fraction, setFraction] = useState(1.0); // 0–1 position on slider
  const [isPlaying, setIsPlaying] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Derive timeline bounds and event marks from LSR data
  const { minTs, maxTs, span, marks, total } = useMemo(() => {
    if (!lsrs || !lsrs.features.length) return { minTs: 0, maxTs: 0, span: 1, marks: [], total: 0 };

    const entries: { ts: number; isTornado: boolean }[] = [];
    for (const f of lsrs.features) {
      const raw = (f.properties as Record<string, unknown>).event_time;
      if (!raw) continue;
      const ts = new Date(raw as string).getTime();
      if (isNaN(ts)) continue;
      entries.push({ ts, isTornado: TORNADO_CODES.has((f.properties as Record<string, unknown>).type_code as string) });
    }
    entries.sort((a, b) => a.ts - b.ts);
    if (!entries.length) return { minTs: 0, maxTs: 0, span: 1, marks: [], total: 0 };

    const minTs = entries[0].ts;
    const maxTs = entries[entries.length - 1].ts;
    const span = Math.max(maxTs - minTs, 1);
    const marks = entries.map(e => ({ pct: ((e.ts - minTs) / span) * 100, isTornado: e.isTornado }));
    return { minTs, maxTs, span, marks, total: entries.length };
  }, [lsrs]);

  const currentTs = minTs + span * fraction;
  const isLive = fraction >= 0.9999;

  // Notify parent whenever scrub position changes
  useEffect(() => {
    onScrubTime(isLive ? null : currentTs);
  }, [isLive, currentTs, onScrubTime]);

  // Count how many reports are visible at current scrub position
  const visibleCount = useMemo(() => {
    if (!lsrs || isLive) return total;
    return lsrs.features.filter(f => {
      const raw = (f.properties as Record<string, unknown>).event_time;
      if (!raw) return false;
      const ts = new Date(raw as string).getTime();
      return !isNaN(ts) && ts <= currentTs;
    }).length;
  }, [lsrs, isLive, currentTs, total]);

  // Play: advance from current position to end over PLAY_STEPS ticks
  const startPlay = useCallback(() => {
    if (fraction >= 1.0) setFraction(0); // reset to start if already at end
    setIsPlaying(true);
  }, [fraction]);

  useEffect(() => {
    if (!isPlaying) {
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }
    const step = 1.0 / PLAY_STEPS;
    timerRef.current = setInterval(() => {
      setFraction(f => {
        if (f >= 1.0) { setIsPlaying(false); return 1.0; }
        return Math.min(f + step, 1.0);
      });
    }, PLAY_INTERVAL_MS);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [isPlaying]);

  const handleSlider = (e: React.ChangeEvent<HTMLInputElement>) => {
    setIsPlaying(false);
    setFraction(Number(e.target.value) / 1000);
  };

  if (!lsrs || maxTs === 0) return null;

  return (
    <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-10 w-[min(640px,calc(100vw-20px))] pointer-events-auto">
      <div className="bg-gray-950/95 backdrop-blur border border-gray-700 rounded-xl px-4 py-3 shadow-2xl">

        {/* Header row */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Storm Replay</span>
            <span className="text-[10px] text-gray-500 tabular-nums">
              {visibleCount} / {total} reports
            </span>
            {marks.filter(m => m.isTornado).length > 0 && (
              <span className="text-[9px] text-red-400 flex items-center gap-0.5">
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-red-500" />
                tornado
              </span>
            )}
          </div>
          <div className={`text-[10px] font-bold px-2 py-0.5 rounded border transition ${
            isLive
              ? "bg-red-950/60 text-red-400 border-red-800 animate-pulse"
              : "text-gray-300 border-gray-700 bg-gray-800/60"
          }`}>
            {isLive ? "● LIVE" : fmtTime(currentTs)}
          </div>
        </div>

        {/* Controls row */}
        <div className="flex items-center gap-3">

          {/* Play / Pause */}
          <button
            onClick={isPlaying ? () => setIsPlaying(false) : startPlay}
            className="w-8 h-8 flex-shrink-0 flex items-center justify-center bg-orange-600 hover:bg-orange-500 rounded-full text-white text-sm transition shadow-md"
            aria-label={isPlaying ? "Pause replay" : "Play replay"}
          >
            {isPlaying ? "⏸" : "▶"}
          </button>

          {/* Slider with event marks overlaid */}
          <div className="relative flex-1 h-6 flex items-center">
            {/* Track background for marks */}
            <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-1.5 rounded-full bg-gray-700 pointer-events-none overflow-hidden">
              {/* Filled portion */}
              <div
                className="h-full bg-orange-600/50 rounded-full"
                style={{ width: `${fraction * 100}%` }}
              />
            </div>
            {/* Event marks */}
            <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 pointer-events-none">
              {marks.map((m, i) => (
                <div
                  key={i}
                  className={`absolute top-1/2 -translate-y-1/2 w-0.5 rounded-full ${
                    m.isTornado ? "h-3 bg-red-500 opacity-80" : "h-1.5 bg-gray-400 opacity-30"
                  }`}
                  style={{ left: `${m.pct}%` }}
                />
              ))}
              {/* Playhead */}
              <div
                className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3.5 h-3.5 rounded-full bg-orange-500 border-2 border-white shadow-md pointer-events-none"
                style={{ left: `${fraction * 100}%` }}
              />
            </div>
            <input
              type="range"
              min={0}
              max={1000}
              value={Math.round(fraction * 1000)}
              onChange={handleSlider}
              className="w-full h-6 opacity-0 cursor-pointer absolute inset-0"
              aria-label="Storm timeline scrubber"
            />
          </div>

          {/* LIVE jump button */}
          <button
            onClick={() => { setFraction(1.0); setIsPlaying(false); }}
            className={`text-[10px] font-bold px-2 py-1 rounded border transition flex-shrink-0 ${
              isLive
                ? "border-red-800 text-red-400 bg-red-950/40 cursor-default"
                : "border-gray-600 text-gray-400 hover:text-white hover:border-gray-400 bg-transparent"
            }`}
          >
            LIVE
          </button>
        </div>

        {/* Time range labels */}
        <div className="flex justify-between mt-1">
          <span className="text-[9px] text-gray-600">{fmtTime(minTs)}</span>
          <span className="text-[9px] text-gray-600">{fmtTime(maxTs)}</span>
        </div>
      </div>
    </div>
  );
}
