"use client";

import { useEffect, useState, useCallback, useRef, Suspense } from "react";
import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import type {
  GeoJSONFeature,
  GeoJSONFeatureCollection,
  LayerVisibility,
  SelectedFeature,
} from "@/lib/types";
import {
  fetchAlerts, fetchLSRs, fetchCorridors, fetchTornadoHistory,
  fetchLiveOutages, fetchOutageEvents,
  buildShareableUrl, type HistoryQuery,
} from "@/lib/api";
import type { MapHandle } from "@/components/Map";
import LayerControls from "@/components/LayerControls";
import ProvenancePanel from "@/components/ProvenancePanel";
import IncidentSidebar from "@/components/IncidentSidebar";
import SourceHealthBar from "@/components/SourceHealthBar";
import LastUpdatedTicker from "@/components/LastUpdatedTicker";
import TimelineScrubber from "@/components/TimelineScrubber";
import HistoryPanel from "@/components/HistoryPanel";
import OutagePanel from "@/components/OutagePanel";

const Map = dynamic(() => import("@/components/Map"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-screen bg-gray-900 flex items-center justify-center">
      <div className="text-center">
        <div className="text-orange-500 text-4xl mb-4">&#9889;</div>
        <div className="text-white text-lg font-medium">StormPulse</div>
        <div className="text-gray-400 text-sm mt-1">Loading map...</div>
      </div>
    </div>
  ),
});

function PageContent() {
  const searchParams = useSearchParams();

  const [alerts, setAlerts] = useState<GeoJSONFeatureCollection | null>(null);
  const [lsrs, setLsrs] = useState<GeoJSONFeatureCollection | null>(null);
  const [corridors, setCorridors] = useState<GeoJSONFeatureCollection | null>(null);
  const [selectedFeature, setSelectedFeature] = useState<SelectedFeature>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [hours, setHours] = useState(() => Number(searchParams.get("hours") || 48));
  // Start sidebar closed on mobile, open on desktop
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [layersOpen, setLayersOpen] = useState(false);
  const [activeAlertId, setActiveAlertId] = useState<string | null>(null);
  const [scrubTime, setScrubTime] = useState<number | null>(null);
  const [basemap, setBasemap] = useState<"dark" | "satellite" | "street">("dark");
  // Historian (SPC tornado archive) + storm replay
  const [historyOpen, setHistoryOpen] = useState(false);
  const [history, setHistory] = useState<GeoJSONFeatureCollection | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [replayTarget, setReplayTarget] = useState<GeoJSONFeature | null>(null);
  // Alarm-annunciator semantics: acknowledged alerts drop off feed + map
  const [ackedAlertIds, setAckedAlertIds] = useState<Set<string>>(new Set());
  // Clearable corridors + live feed (repopulate as new ids arrive)
  const [clearedCorridorIds, setClearedCorridorIds] = useState<Set<string>>(new Set());
  const [clearedLsrIds, setClearedLsrIds] = useState<Set<string>>(new Set());
  // Power outages: live feed + curated major-event archive
  const [outagesOpen, setOutagesOpen] = useState(false);
  const [outagesLive, setOutagesLive] = useState<GeoJSONFeatureCollection | null>(null);
  const [outagesLoading, setOutagesLoading] = useState(false);
  const [outageEvents, setOutageEvents] = useState<GeoJSONFeatureCollection | null>(null);
  const [selectedOutageEvent, setSelectedOutageEvent] = useState<GeoJSONFeatureCollection | null>(null);
  const [selectedOutageEventId, setSelectedOutageEventId] = useState<string | null>(null);
  // Map legend starts collapsed so it never covers the layer controls
  const [legendOpen, setLegendOpen] = useState(false);
  useEffect(() => {
    if (window.innerWidth < 768) setSidebarOpen(false);
  }, []);

  // Mutual exclusion: opening sidebar closes layer panel on mobile, and vice versa
  const openSidebar = useCallback(() => {
    setSidebarOpen(true);
    if (window.innerWidth < 768) setLayersOpen(false);
  }, []);
  const openLayers = useCallback((val: boolean) => {
    setLayersOpen(val);
    if (val && window.innerWidth < 768) setSidebarOpen(false);
  }, []);
  const [layers, setLayers] = useState<LayerVisibility>(() => {
    const layerParam = searchParams.get("layers");
    const active = layerParam
      ? layerParam.split(",")
      : ["alertsRed", "alertsOrange", "alertsYellow", "lsr", "corridors", "counties"];
    return {
      alertsRed:    active.includes("alertsRed"),
      alertsOrange: active.includes("alertsOrange"),
      alertsYellow: active.includes("alertsYellow"),
      alertsBlue:   active.includes("alertsBlue"),
      alertsGray:   active.includes("alertsGray"),
      lsr:          active.includes("lsr"),
      corridors:    active.includes("corridors"),
      counties:     active.includes("counties"),
      history:      active.includes("history"),
      outages:      active.includes("outages"),
    };
  });

  const mapStateRef = useRef({
    lat: Number(searchParams.get("lat") || 38),
    lon: Number(searchParams.get("lon") || -96),
    zoom: Number(searchParams.get("z") || 4.5),
  });

  // Store the map handle from onMapReady callback (avoids forwardRef + dynamic() issues)
  const mapHandleRef = useRef<MapHandle | null>(null);
  const handleMapReady = useCallback((handle: MapHandle) => {
    mapHandleRef.current = handle;
  }, []);

  // Track previous LSR count for audio alerts
  const prevLsrCountRef = useRef(0);
  const prevTornadoCountRef = useRef(0);

  const loadData = useCallback(async () => {
    try {
      const [alertRes, lsrRes, corridorRes] = await Promise.all([
        fetchAlerts(hours),
        fetchLSRs(hours),
        fetchCorridors(hours),
      ]);
      if (alertRes.ok) setAlerts(await alertRes.json());
      if (lsrRes.ok) {
        const lsrData: GeoJSONFeatureCollection = await lsrRes.json();
        // Audio alert: beep if new tornado reports since last poll
        const tornadoCount = lsrData.features.filter(f => {
          const tc = (f.properties as Record<string, unknown>).type_code as string;
          return ["T", "TF", "TW"].includes(tc);
        }).length;
        if (tornadoCount > prevTornadoCountRef.current && prevTornadoCountRef.current > 0) {
          playAlertBeep();
        }
        prevTornadoCountRef.current = tornadoCount;
        prevLsrCountRef.current = lsrData.features.length;
        setLsrs(lsrData);
      }
      if (corridorRes.ok) setCorridors(await corridorRes.json());
      setLastUpdated(new Date());
    } catch (err) {
      console.error("Failed to load data:", err);
    }
  }, [hours]);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 120000);
    return () => clearInterval(interval);
  }, [loadData]);

  // Alerts visible on map + feed: drop acknowledged, expired (10 min grace),
  // and cancelled alerts automatically.
  const visibleAlerts = (() => {
    if (!alerts) return null;
    const now = Date.now();
    const GRACE_MS = 10 * 60 * 1000;
    const features = alerts.features.filter(f => {
      const p = f.properties as Record<string, unknown>;
      if (ackedAlertIds.has(p.id as string)) return false;
      if (p.is_active === false) return false;
      const expires = p.expires ? new Date(p.expires as string).getTime() : null;
      if (expires !== null && expires + GRACE_MS < now) return false;
      return true;
    });
    return { ...alerts, features };
  })();

  const handleAckAlert = useCallback((id: string) => {
    setAckedAlertIds(prev => new Set(prev).add(id));
  }, []);

  const handleAckAllAlerts = useCallback(() => {
    if (!alerts) return;
    setAckedAlertIds(prev => {
      const next = new Set(prev);
      alerts.features.forEach(f => next.add((f.properties as { id: string }).id));
      return next;
    });
  }, [alerts]);

  const handleHistoryQuery = useCallback(async (q: HistoryQuery) => {
    setHistoryLoading(true);
    try {
      const res = await fetchTornadoHistory(q);
      if (res.ok) {
        setHistory(await res.json());
        setLayers(prev => ({ ...prev, history: true }));
      }
    } catch (err) {
      console.error("History query failed:", err);
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  const visibleCorridors = (() => {
    if (!corridors) return null;
    return {
      ...corridors,
      features: corridors.features.filter(
        f => !clearedCorridorIds.has((f.properties as { id: string }).id)
      ),
    };
  })();

  const visibleLsrs = (() => {
    if (!lsrs) return null;
    return {
      ...lsrs,
      features: lsrs.features.filter(
        f => !clearedLsrIds.has((f.properties as { id: string }).id)
      ),
    };
  })();

  const handleClearCorridors = useCallback(() => {
    if (!corridors) return;
    setClearedCorridorIds(prev => {
      const next = new Set(prev);
      corridors.features.forEach(f => next.add((f.properties as { id: string }).id));
      return next;
    });
  }, [corridors]);

  const handleClearLsrs = useCallback(() => {
    if (!lsrs) return;
    setClearedLsrIds(prev => {
      const next = new Set(prev);
      lsrs.features.forEach(f => next.add((f.properties as { id: string }).id));
      return next;
    });
  }, [lsrs]);

  const loadLiveOutages = useCallback(async () => {
    setOutagesLoading(true);
    try {
      const res = await fetchLiveOutages();
      if (res.ok) setOutagesLive(await res.json());
    } catch (err) {
      console.error("Live outage fetch failed:", err);
    } finally {
      setOutagesLoading(false);
    }
  }, []);

  // Poll the live outage feed while the panel is open or the layer is on,
  // so restorations auto-populate.
  useEffect(() => {
    if (!outagesOpen && !layers.outages) return;
    loadLiveOutages();
    const interval = setInterval(loadLiveOutages, 120000);
    return () => clearInterval(interval);
  }, [outagesOpen, layers.outages, loadLiveOutages]);

  // Load the curated outage-event archive once, on first open
  useEffect(() => {
    if (!outagesOpen || outageEvents) return;
    fetchOutageEvents()
      .then(res => (res.ok ? res.json() : null))
      .then(data => { if (data) setOutageEvents(data); })
      .catch(err => console.error("Outage events fetch failed:", err));
  }, [outagesOpen, outageEvents]);

  const handleToggleLayer = useCallback((layer: keyof LayerVisibility) => {
    setLayers(prev => ({ ...prev, [layer]: !prev[layer] }));
  }, []);

  const handleShare = useCallback(() => {
    const url = buildShareableUrl(
      mapStateRef.current.lat,
      mapStateRef.current.lon,
      mapStateRef.current.zoom,
      layers as unknown as Record<string, boolean>,
      hours
    );
    navigator.clipboard.writeText(url).then(() => {
      alert("Map link copied to clipboard!");
    }).catch(() => {
      prompt("Copy this link:", url);
    });
  }, [layers, hours]);

  const handleMoveEnd = useCallback(({ lat, lon, zoom }: { lat: number; lon: number; zoom: number }) => {
    mapStateRef.current = { lat, lon, zoom };
  }, []);

  // Compute bbox from any GeoJSON coordinate array and fly to it
  const flyToGeometry = useCallback((geometry: { coordinates: unknown } | null) => {
    if (!geometry || !mapHandleRef.current) return;
    let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity;
    function extractCoords(arr: unknown): void {
      if (!Array.isArray(arr)) return;
      if (typeof arr[0] === "number") {
        const [lng, lat] = arr as number[];
        if (lng < minLng) minLng = lng;
        if (lat < minLat) minLat = lat;
        if (lng > maxLng) maxLng = lng;
        if (lat > maxLat) maxLat = lat;
        return;
      }
      arr.forEach(extractCoords);
    }
    extractCoords(geometry.coordinates);
    if (minLng !== Infinity) mapHandleRef.current.flyToBounds([minLng, minLat, maxLng, maxLat]);
  }, []);

  const handleSelectIncident = useCallback((incidentId: string) => {
    if (!corridors) return;
    const feature = corridors.features.find(
      (f) => (f.properties as { incident_id: string }).incident_id === incidentId
    );
    flyToGeometry(feature?.geometry as { coordinates: unknown } | null);
  }, [corridors, flyToGeometry]);

  const handleSelectOutageEvent = useCallback((feature: GeoJSONFeature) => {
    const id = (feature.properties as { id?: string }).id ?? null;
    setSelectedOutageEventId(id);
    if (outageEvents) {
      // Show the event swath plus its gust reports on the map
      setSelectedOutageEvent({
        ...outageEvents,
        features: outageEvents.features.filter(f => {
          const p = f.properties as { feature_type?: string; id?: string };
          return p.feature_type === "gust_report" || p.id === id;
        }),
      });
    }
    setSelectedFeature(feature as SelectedFeature);
    flyToGeometry(feature.geometry as { coordinates: unknown } | null);
  }, [outageEvents, flyToGeometry]);

  const handleHistorySelect = useCallback((feature: GeoJSONFeature) => {
    const geomType = feature.geometry?.type;
    setReplayTarget(geomType === "LineString" || geomType === "MultiLineString" ? feature : null);
    setSelectedFeature(feature as SelectedFeature);
    flyToGeometry(feature.geometry as { coordinates: unknown } | null);
  }, [flyToGeometry]);

  const handleSelectAlert = useCallback((alertId: string) => {
    setActiveAlertId(alertId);
    openSidebar();
    if (!alerts) return;
    const feature = alerts.features.find(
      (f) => (f.properties as { id: string }).id === alertId
    );
    flyToGeometry(feature?.geometry as { coordinates: unknown } | null);
  }, [alerts, flyToGeometry]);

  return (
    <main className="relative w-full h-screen overflow-hidden bg-gray-950">
      <SourceHealthBar
        historianOpen={historyOpen}
        onToggleHistorian={() => {
          setHistoryOpen(prev => {
            if (prev) setReplayTarget(null);
            else setOutagesOpen(false);
            return !prev;
          });
        }}
        outagesOpen={outagesOpen}
        onToggleOutages={() => {
          setOutagesOpen(prev => {
            if (!prev) {
              setHistoryOpen(false);
              setReplayTarget(null);
            } else {
              setSelectedOutageEvent(null);
              setSelectedOutageEventId(null);
            }
            return !prev;
          });
        }}
      />

      <Map
        alerts={visibleAlerts}
        lsrs={visibleLsrs}
        corridors={visibleCorridors}
        history={history}
        outagesLive={layers.outages ? outagesLive : null}
        outageEvent={selectedOutageEvent}
        replayTarget={replayTarget}
        layers={layers}
        onFeatureClick={(feature) => {
          if (!feature) return;
          const props = feature.properties as Record<string, unknown>;
          // Alert clicks → switch sidebar to alerts tab + highlight card
          if (props._layer === "alerts") {
            setActiveAlertId(props.id as string);
            openSidebar();
            return;
          }
          // Historical path clicks → replay + detail panel
          if (props._layer === "history") {
            setReplayTarget(feature.geometry?.type === "LineString" ? feature : null);
          }
          setSelectedFeature(feature);
        }}
        initialCenter={[mapStateRef.current.lon, mapStateRef.current.lat]}
        initialZoom={mapStateRef.current.zoom}
        onMoveEnd={handleMoveEnd}
        onMapReady={handleMapReady}
        scrubTime={scrubTime}
        basemap={basemap}
      />

      {/* Open-sidebar button — shown whenever the sidebar is collapsed */}
      {!sidebarOpen && (
        <button
          onClick={openSidebar}
          className="absolute top-16 left-3 z-20 bg-gray-900/85 border border-gray-700 rounded-lg px-3 py-1.5 text-xs text-gray-300 flex items-center gap-1 shadow-lg hover:border-orange-500"
        >
          <span>☰</span>
          <span>Situational Awareness</span>
        </button>
      )}

      {/* Historian panel (SPC tornado archive) */}
      {historyOpen && (
        <HistoryPanel
          data={history}
          loading={historyLoading}
          onQuery={handleHistoryQuery}
          onSelect={handleHistorySelect}
          onClose={() => {
            setHistoryOpen(false);
            setReplayTarget(null);
          }}
          selectedId={replayTarget ? ((replayTarget.properties as { id?: number }).id ?? null) : null}
        />
      )}
      {outagesOpen && (
        <OutagePanel
          live={outagesLive}
          liveLoading={outagesLoading}
          events={outageEvents}
          showLiveOnMap={layers.outages}
          onToggleLiveOnMap={show => setLayers(prev => ({ ...prev, outages: show }))}
          onSelectEvent={handleSelectOutageEvent}
          onRefreshLive={loadLiveOutages}
          onClose={() => {
            setOutagesOpen(false);
            setSelectedOutageEvent(null);
            setSelectedOutageEventId(null);
          }}
          selectedEventId={selectedOutageEventId}
        />
      )}

      {sidebarOpen && (
        <IncidentSidebar
          alerts={visibleAlerts}
          corridors={visibleCorridors}
          lsrs={visibleLsrs}
          onSelectIncident={handleSelectIncident}
          onSelectAlert={handleSelectAlert}
          onClose={() => setSidebarOpen(false)}
          activeAlertId={activeAlertId}
          onAckAlert={handleAckAlert}
          onAckAll={handleAckAllAlerts}
          onClearCorridors={handleClearCorridors}
          onClearLsrs={handleClearLsrs}
        />
      )}

      <LayerControls
        layers={layers}
        onToggle={handleToggleLayer}
        hours={hours}
        onHoursChange={setHours}
        onRefresh={loadData}
        onShare={handleShare}
        mobileOpen={layersOpen}
        onMobileOpenChange={openLayers}
        basemap={basemap}
        onBasemapChange={setBasemap}
      />

      <ProvenancePanel
        feature={selectedFeature}
        onClose={() => setSelectedFeature(null)}
      />

      {/* Last updated ticker */}
      <LastUpdatedTicker lastUpdated={lastUpdated} />

      {/* Legend — collapsed chip by default so it never covers the layer panel */}
      {!legendOpen && (
        <button
          onClick={() => setLegendOpen(true)}
          className="absolute bottom-44 right-3 z-10 bg-gray-900/90 border border-gray-700 rounded-lg px-2.5 py-1 text-[10px] text-gray-300 hidden md:flex items-center gap-1 hover:border-orange-500"
        >
          <span>🗺</span><span className="uppercase tracking-wider font-bold">Legend</span>
        </button>
      )}
      {legendOpen && (
      <div className="absolute bottom-44 right-3 z-10 bg-gray-900/90 backdrop-blur rounded-lg border border-gray-700 p-3 text-xs max-h-[40vh] overflow-y-auto hidden md:block">
        <button
          onClick={() => setLegendOpen(false)}
          className="float-right text-gray-500 hover:text-white text-xs leading-none -mt-1 -mr-1"
          aria-label="Collapse legend"
        >✕</button>
        <div className="font-bold text-gray-300 mb-2 uppercase tracking-wider text-[10px]">NWS Alert Colors</div>
        <div className="space-y-1">
          {[
            { color: "bg-purple-600",  label: "Tornado Emergency" },
            { color: "bg-red-600",     label: "Tornado Warning" },
            { color: "bg-amber-500",   label: "Tornado Watch" },
            { color: "bg-orange-500",  label: "Svr Tstorm / High Wind Warn" },
            { color: "bg-yellow-500",  label: "High Wind Watch" },
            { color: "bg-lime-500",    label: "Wind Advisory" },
            { color: "bg-green-600",   label: "Flash Flood Warning" },
            { color: "bg-blue-500",    label: "Winter Storm Warning" },
            { color: "bg-slate-500",   label: "Special Weather Statement" },
          ].map(({ color, label }) => (
            <div key={label} className="flex items-center gap-2">
              <div className={`w-3 h-3 rounded flex-shrink-0 ${color} opacity-80`} />
              <span className="text-gray-300 text-[10px]">{label}</span>
            </div>
          ))}
        </div>
        <div className="mt-2 pt-2 border-t border-gray-700 space-y-1">
          <div className="font-bold text-gray-300 mb-1 uppercase tracking-wider text-[10px]">Tornado LSRs (EF Scale)</div>
          {[
            { color: "#86efac", label: "EF0" },
            { color: "#fde047", label: "EF1" },
            { color: "#fb923c", label: "EF2" },
            { color: "#ef4444", label: "EF3" },
            { color: "#991b1b", label: "EF4" },
            { color: "#7c3aed", label: "EF5" },
          ].map(({ color, label }) => (
            <div key={label} className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: color }} />
              <span className="text-gray-300 text-[10px]">{label}</span>
            </div>
          ))}
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-blue-500 flex-shrink-0" />
            <span className="text-gray-300 text-[10px]">Wind LSR</span>
          </div>
          <div className="mt-1 pt-1 border-t border-gray-700 space-y-1">
            <div className="font-bold text-gray-300 mb-1 uppercase tracking-wider text-[10px]">Impact Zones</div>
            {[
              { color: "#ef4444", label: "Tornado path (INFERRED)" },
              { color: "#f97316", label: "Wind damage swath (INFERRED)" },
              { color: "#a855f7", label: "Severe weather swath (INFERRED)" },
              { color: "#0891b2", label: "Flood zone (Official NWS)" },
            ].map(({ color, label }) => (
              <div key={label} className="flex items-center gap-2">
                <div className="w-3 h-3 rounded flex-shrink-0 opacity-70" style={{ background: color, border: `1.5px dashed ${color}` }} />
                <span className="text-gray-300 text-[10px]">{label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      )}

      {/* Timeline scrubber */}
      <TimelineScrubber lsrs={visibleLsrs} onScrubTime={setScrubTime} />

      {/* Disclaimer — hidden on mobile when scrubber is present to avoid overlap */}
      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-10 text-center hidden md:block">
        <div className="text-[10px] text-gray-600 bg-gray-900/80 px-3 py-1 rounded">
          StormPulse is not affiliated with NOAA, NWS, or FEMA. Inferred corridors are NOT official damage surveys.
        </div>
      </div>
    </main>
  );
}

/** Play a short alert beep using Web Audio API */
function playAlertBeep() {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.4);
  } catch { /* audio not supported */ }
}

export default function Home() {
  return (
    <Suspense fallback={
      <div className="w-full h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-white">Loading...</div>
      </div>
    }>
      <PageContent />
    </Suspense>
  );
}
