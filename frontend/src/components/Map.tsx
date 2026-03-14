"use client";

import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type {
  GeoJSONFeatureCollection,
  LayerVisibility,
  SelectedFeature,
} from "@/lib/types";

export interface MapHandle {
  flyToBounds: (bbox: [number, number, number, number], padding?: number) => void;
}

interface Props {
  alerts: GeoJSONFeatureCollection | null;
  lsrs: GeoJSONFeatureCollection | null;
  corridors: GeoJSONFeatureCollection | null;
  layers: LayerVisibility;
  onFeatureClick: (feature: SelectedFeature) => void;
  initialCenter?: [number, number];
  initialZoom?: number;
  onMoveEnd?: (center: { lat: number; lon: number; zoom: number }) => void;
  onMapReady?: (handle: MapHandle) => void;
}

const EMPTY_FC = { type: "FeatureCollection", features: [] } as GeoJSON.FeatureCollection;

const BASEMAP_STYLE = {
  version: 8 as const,
  name: "StormPulse Dark",
  sources: {
    "osm-tiles": {
      type: "raster" as const,
      tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
      tileSize: 256,
      attribution: "© OpenStreetMap contributors",
      maxzoom: 19,
    },
  },
  layers: [
    {
      id: "background",
      type: "background" as const,
      paint: { "background-color": "#0f172a" },
    },
    {
      id: "osm-tiles",
      type: "raster" as const,
      source: "osm-tiles",
      paint: {
        "raster-opacity": 0.35,
        "raster-saturation": -1,
        "raster-brightness-min": 0,
        "raster-brightness-max": 0.3,
      },
    },
  ],
  glyphs: "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf",
};

function setSourceData(map: maplibregl.Map, sourceId: string, data: GeoJSONFeatureCollection | null) {
  const src = map.getSource(sourceId) as maplibregl.GeoJSONSource | undefined;
  if (src) src.setData((data || EMPTY_FC) as GeoJSON.FeatureCollection);
}

/** Build a separate FeatureCollection of centerline geometries from corridor properties */
function buildCenterlinesFC(corridors: GeoJSONFeatureCollection | null): GeoJSON.FeatureCollection {
  if (!corridors) return EMPTY_FC;
  const features: GeoJSON.Feature[] = [];
  for (const f of corridors.features) {
    const cl = (f.properties as Record<string, unknown>).centerline_geojson;
    if (cl && typeof cl === "string") {
      try {
        const geom = JSON.parse(cl);
        features.push({ type: "Feature", geometry: geom, properties: f.properties });
      } catch { /* skip */ }
    }
  }
  return { type: "FeatureCollection", features };
}

export default function Map({
  alerts,
  lsrs,
  corridors,
  layers,
  onFeatureClick,
  initialCenter = [-96, 38],
  initialZoom = 4.5,
  onMoveEnd,
  onMapReady,
}: Props) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const loadedRef = useRef(false);

  // Keep latest props in refs so the load callback can access current values
  const alertsRef = useRef(alerts);
  const lsrsRef = useRef(lsrs);
  const corridorsRef = useRef(corridors);
  const layersRef = useRef(layers);
  const onMapReadyRef = useRef(onMapReady);
  alertsRef.current = alerts;
  lsrsRef.current = lsrs;
  corridorsRef.current = corridors;
  layersRef.current = layers;
  onMapReadyRef.current = onMapReady;

  // Initialize map once
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: BASEMAP_STYLE,
      center: initialCenter,
      zoom: initialZoom,
      attributionControl: false,
    });

    mapRef.current = map;

    map.addControl(new maplibregl.NavigationControl(), "bottom-right");
    map.addControl(new maplibregl.AttributionControl({ compact: true }), "bottom-left");
    map.addControl(new maplibregl.ScaleControl({ unit: "imperial" }), "bottom-left");

    map.on("load", () => {
      loadedRef.current = true;

      // ── Corridors (fill + outline) colored by event_category ────────────────
      map.addSource("corridors", { type: "geojson", data: EMPTY_FC });
      // Base hue per category, modulated by confidence
      const corridorColor: maplibregl.ExpressionSpecification = [
        "match", ["get", "event_category"],
        // Tornado: red scale
        "TORNADO", ["match", ["get", "confidence_label"],
          "HIGH", "#ef4444", "MEDIUM", "#f97316", "#eab308"],
        // Wind damage: orange scale
        "WIND_DAMAGE", ["match", ["get", "confidence_label"],
          "HIGH", "#f97316", "MEDIUM", "#fb923c", "#fbbf24"],
        // Severe weather: purple/amber scale
        "SEVERE_WEATHER", ["match", ["get", "confidence_label"],
          "HIGH", "#a855f7", "MEDIUM", "#c084fc", "#e879f9"],
        // Flood zone: cyan/blue scale
        "FLOOD_ZONE", ["match", ["get", "confidence_label"],
          "HIGH", "#0891b2", "MEDIUM", "#06b6d4", "#67e8f9"],
        // default fallback
        "#475569",
      ];
      map.addLayer({
        id: "corridors-fill",
        type: "fill",
        source: "corridors",
        paint: {
          "fill-color": corridorColor,
          "fill-opacity": ["match", ["get", "event_category"], "FLOOD_ZONE", 0.2, 0.25],
        },
      });
      map.addLayer({
        id: "corridors-outline",
        type: "line",
        source: "corridors",
        paint: {
          "line-color": corridorColor,
          "line-width": ["match", ["get", "event_category"], "TORNADO", 3, 2],
          "line-dasharray": ["match", ["get", "event_category"], "FLOOD_ZONE", ["literal", [3, 3]], ["literal", [4, 2]]],
        },
      });

      // ── Tornado damage path centerlines ─────────────────────────────────────
      map.addSource("centerlines", { type: "geojson", data: EMPTY_FC });
      map.addLayer({
        id: "centerlines-line",
        type: "line",
        source: "centerlines",
        paint: {
          "line-color": "#fbbf24",
          "line-width": 3.5,
          "line-dasharray": [2, 1],
        },
      });
      map.addLayer({
        id: "centerlines-casing",
        type: "line",
        source: "centerlines",
        paint: {
          "line-color": "#000000",
          "line-width": 5,
          "line-opacity": 0.3,
        },
      });

      // ── NWS Alerts — colored and weighted by severity tier ──────────────────
      map.addSource("alerts", { type: "geojson", data: EMPTY_FC });

      // Color by severity tier (5-tier system)
      const alertColor: maplibregl.ExpressionSpecification = [
        "match", ["get", "severity_tier"],
        "RED",    "#ef4444",
        "ORANGE", "#f97316",
        "YELLOW", "#eab308",
        "BLUE",   "#3b82f6",
        "GRAY",   "#94a3b8",
        "#94a3b8",
      ];

      // Opacity proportional to severity — critical alerts punch through, info fades back
      const alertFillOpacity: maplibregl.ExpressionSpecification = [
        "match", ["get", "severity_tier"],
        "RED",    0.40,
        "ORANGE", 0.28,
        "YELLOW", 0.16,
        "BLUE",   0.18,
        "GRAY",   0.06,
        0.10,
      ];

      // Outline width by tier
      const alertLineWidth: maplibregl.ExpressionSpecification = [
        "match", ["get", "severity_tier"],
        "RED",    2.5,
        "ORANGE", 2.0,
        "YELLOW", 1.5,
        "BLUE",   1.5,
        "GRAY",   1.0,
        1.0,
      ];

      map.addLayer({
        id: "alerts-fill",
        type: "fill",
        source: "alerts",
        paint: { "fill-color": alertColor, "fill-opacity": alertFillOpacity },
      });
      map.addLayer({
        id: "alerts-outline",
        type: "line",
        source: "alerts",
        paint: { "line-color": alertColor, "line-width": alertLineWidth },
      });

      // ── LSR points — EF-rated color coding ──────────────────────────────────
      map.addSource("lsr", { type: "geojson", data: EMPTY_FC });

      // Tornado circles: color by EF rating (magnitude field), size by rating
      const tornadoColor: maplibregl.ExpressionSpecification = [
        "step", ["coalesce", ["get", "magnitude"], 0],
        "#86efac",   // EF0 (0)
        1, "#fde047", // EF1
        2, "#fb923c", // EF2
        3, "#ef4444", // EF3
        4, "#991b1b", // EF4
        5, "#7c3aed", // EF5
      ];

      // Color: tornado = EF-based, wind = blue, hail = teal, other = gray
      const lsrColor: maplibregl.ExpressionSpecification = [
        "case",
        ["in", ["get", "type_code"], ["literal", ["T", "TF", "TW"]]], tornadoColor,
        ["==", ["get", "type_code"], "W"], "#3b82f6",
        ["==", ["get", "type_code"], "H"], "#06b6d4",
        "#9ca3af",
      ];

      // Radius: larger for stronger tornadoes
      const lsrRadius: maplibregl.ExpressionSpecification = [
        "case",
        ["in", ["get", "type_code"], ["literal", ["T", "TF", "TW"]]],
        ["step", ["coalesce", ["get", "magnitude"], 0], 8, 2, 10, 3, 12, 4, 14, 5, 16],
        6,
      ];

      // Opacity: fade older reports
      const lsrOpacity: maplibregl.ExpressionSpecification = [
        "interpolate", ["linear"], ["coalesce", ["get", "age_minutes"], 0],
        0, 1.0,
        60, 0.9,
        360, 0.7,
        1440, 0.45,
      ];

      map.addLayer({
        id: "lsr-circles",
        type: "circle",
        source: "lsr",
        paint: {
          "circle-radius": lsrRadius,
          "circle-color": lsrColor,
          "circle-stroke-color": "#ffffff",
          "circle-stroke-width": 1.5,
          "circle-opacity": lsrOpacity,
        },
      });

      // Inject current data immediately after load
      setSourceData(map, "alerts", alertsRef.current);
      setSourceData(map, "lsr", lsrsRef.current);
      setSourceData(map, "corridors", corridorsRef.current);
      const centerlinesFC = buildCenterlinesFC(corridorsRef.current);
      (map.getSource("centerlines") as maplibregl.GeoJSONSource)?.setData(centerlinesFC);

      // Apply initial layer visibility
      const vis = (v: boolean) => (v ? "visible" : "none") as "visible" | "none";
      const l = layersRef.current;
      ["alerts-fill", "alerts-outline"].forEach(id => map.setLayoutProperty(id, "visibility", vis(l.alerts)));
      ["lsr-circles"].forEach(id => map.setLayoutProperty(id, "visibility", vis(l.lsr)));
      ["corridors-fill", "corridors-outline", "centerlines-line"].forEach(id => map.setLayoutProperty(id, "visibility", vis(l.corridors)));

      // Click handlers
      ["corridors-fill", "alerts-fill", "lsr-circles"].forEach((layerId) => {
        map.on("click", layerId, (e) => {
          const feature = e.features?.[0];
          if (feature) onFeatureClick(feature as unknown as SelectedFeature);
        });
        map.on("mouseenter", layerId, () => { map.getCanvas().style.cursor = "pointer"; });
        map.on("mouseleave", layerId, () => { map.getCanvas().style.cursor = ""; });
      });

      if (onMoveEnd) {
        map.on("moveend", () => {
          const c = map.getCenter();
          onMoveEnd({ lat: c.lat, lon: c.lng, zoom: map.getZoom() });
        });
      }

      // Expose handle via callback (avoids forwardRef + dynamic() issues)
      onMapReadyRef.current?.({
        flyToBounds(bbox, padding = 60) {
          map.fitBounds([[bbox[0], bbox[1]], [bbox[2], bbox[3]]], { padding, duration: 800 });
        },
      });
    });

    return () => {
      loadedRef.current = false;
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update data when props change
  useEffect(() => {
    if (!mapRef.current || !loadedRef.current) return;
    setSourceData(mapRef.current, "alerts", alerts);
  }, [alerts]);

  useEffect(() => {
    if (!mapRef.current || !loadedRef.current) return;
    setSourceData(mapRef.current, "lsr", lsrs);
  }, [lsrs]);

  useEffect(() => {
    if (!mapRef.current || !loadedRef.current) return;
    setSourceData(mapRef.current, "corridors", corridors);
    const centerlinesFC = buildCenterlinesFC(corridors);
    (mapRef.current.getSource("centerlines") as maplibregl.GeoJSONSource)?.setData(centerlinesFC);
  }, [corridors]);

  // Update layer visibility
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loadedRef.current) return;
    const vis = (v: boolean) => (v ? "visible" : "none") as "visible" | "none";
    ["alerts-fill", "alerts-outline"].forEach(l => map.setLayoutProperty(l, "visibility", vis(layers.alerts)));
    ["lsr-circles"].forEach(l => map.setLayoutProperty(l, "visibility", vis(layers.lsr)));
    ["corridors-fill", "corridors-outline", "centerlines-line"].forEach(l => map.setLayoutProperty(l, "visibility", vis(layers.corridors)));
  }, [layers]);

  return (
    <div
      ref={mapContainerRef}
      style={{ width: "100%", height: "100vh", position: "absolute", top: 0, left: 0 }}
    />
  );
}
