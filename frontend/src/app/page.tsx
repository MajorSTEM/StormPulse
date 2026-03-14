"use client";

import { useEffect, useState, useCallback, useRef, Suspense } from "react";
import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import type {
  GeoJSONFeatureCollection,
  LayerVisibility,
  SelectedFeature,
} from "@/lib/types";
import { fetchAlerts, fetchLSRs, fetchCorridors, buildShareableUrl } from "@/lib/api";
import type { MapHandle } from "@/components/Map";
import LayerControls from "@/components/LayerControls";
import ProvenancePanel from "@/components/ProvenancePanel";
import IncidentSidebar from "@/components/IncidentSidebar";
import SourceHealthBar from "@/components/SourceHealthBar";
import LastUpdatedTicker from "@/components/LastUpdatedTicker";

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
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [activeAlertId, setActiveAlertId] = useState<string | null>(null);
  const [layers, setLayers] = useState<LayerVisibility>(() => {
    const layerParam = searchParams.get("layers");
    const active = layerParam ? layerParam.split(",") : ["alerts", "lsr", "corridors", "counties"];
    return {
      alerts: active.includes("alerts"),
      lsr: active.includes("lsr"),
      corridors: active.includes("corridors"),
      counties: active.includes("counties"),
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

  const handleSelectAlert = useCallback((alertId: string) => {
    setActiveAlertId(alertId);
    setSidebarOpen(true);
    if (!alerts) return;
    const feature = alerts.features.find(
      (f) => (f.properties as { id: string }).id === alertId
    );
    flyToGeometry(feature?.geometry as { coordinates: unknown } | null);
  }, [alerts, flyToGeometry]);

  return (
    <main className="relative w-full h-screen overflow-hidden bg-gray-950">
      <SourceHealthBar />

      <Map
        alerts={alerts}
        lsrs={lsrs}
        corridors={corridors}
        layers={layers}
        onFeatureClick={(feature) => {
          if (!feature) return;
          const props = feature.properties as Record<string, unknown>;
          // Alert clicks → switch sidebar to alerts tab + highlight card
          if (props._layer === "alerts") {
            setActiveAlertId(props.id as string);
            setSidebarOpen(true);
            return;
          }
          setSelectedFeature(feature);
        }}
        initialCenter={[mapStateRef.current.lon, mapStateRef.current.lat]}
        initialZoom={mapStateRef.current.zoom}
        onMoveEnd={handleMoveEnd}
        onMapReady={handleMapReady}
      />

      {/* Mobile sidebar toggle */}
      <button
        onClick={() => setSidebarOpen(o => !o)}
        className="md:hidden absolute top-16 left-3 z-20 bg-gray-900 border border-gray-700 rounded-lg px-3 py-1.5 text-xs text-gray-300 flex items-center gap-1"
      >
        <span>{sidebarOpen ? "✕" : "☰"}</span>
        <span>{sidebarOpen ? "Hide" : "Situational Awareness"}</span>
      </button>

      {sidebarOpen && (
        <IncidentSidebar
          alerts={alerts}
          corridors={corridors}
          lsrs={lsrs}
          onSelectIncident={handleSelectIncident}
          onSelectAlert={handleSelectAlert}
          activeAlertId={activeAlertId}
        />
      )}

      <LayerControls
        layers={layers}
        onToggle={handleToggleLayer}
        hours={hours}
        onHoursChange={setHours}
        onRefresh={loadData}
        onShare={handleShare}
      />

      <ProvenancePanel
        feature={selectedFeature}
        onClose={() => setSelectedFeature(null)}
      />

      {/* Last updated ticker */}
      <LastUpdatedTicker lastUpdated={lastUpdated} />

      {/* Legend */}
      <div className="absolute bottom-16 right-3 z-10 bg-gray-900/90 backdrop-blur rounded-lg border border-gray-700 p-3 text-xs max-h-[50vh] overflow-y-auto hidden md:block">
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

      {/* Disclaimer */}
      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-10 text-center">
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
