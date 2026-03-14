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
  scrubTime?: number | null; // unix ms timestamp; null = live (show all)
}

const EMPTY_FC = { type: "FeatureCollection", features: [] } as GeoJSON.FeatureCollection;

function buildBasemapStyle(isDark: boolean) {
  return {
    version: 8 as const,
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
        paint: { "background-color": isDark ? "#0f172a" : "#dde8f0" },
      },
      {
        id: "osm-tiles",
        type: "raster" as const,
        source: "osm-tiles",
        paint: isDark
          ? {
              "raster-opacity": 0.35,
              "raster-saturation": -1,
              "raster-brightness-min": 0,
              "raster-brightness-max": 0.3,
            }
          : {
              "raster-opacity": 0.9,
              "raster-saturation": -0.15,
              "raster-brightness-min": 0.05,
              "raster-brightness-max": 1.0,
            },
      },
    ],
    glyphs: "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf",
  };
}

function setSourceData(map: maplibregl.Map, sourceId: string, data: GeoJSONFeatureCollection | null) {
  const src = map.getSource(sourceId) as maplibregl.GeoJSONSource | undefined;
  if (src) src.setData((data || EMPTY_FC) as GeoJSON.FeatureCollection);
}

/** Extract a specific confidence band geometry from corridor feature properties */
function buildBandFC(
  corridors: GeoJSONFeatureCollection | null,
  bandKey: "core" | "spread" | "extension",
): GeoJSON.FeatureCollection {
  if (!corridors) return EMPTY_FC;
  const features: GeoJSON.Feature[] = [];
  for (const f of corridors.features) {
    const bandJson = (f.properties as Record<string, unknown>).confidence_band_geojson;
    if (!bandJson || typeof bandJson !== "string") continue;
    try {
      const bands = JSON.parse(bandJson) as Record<string, unknown>;
      const geom = bands[bandKey];
      if (geom) features.push({ type: "Feature", geometry: geom as GeoJSON.Geometry, properties: f.properties });
    } catch { /* skip */ }
  }
  return { type: "FeatureCollection", features };
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
  scrubTime = null,
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

    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: buildBasemapStyle(mq.matches),
      center: initialCenter,
      zoom: initialZoom,
      attributionControl: false,
    });

    mapRef.current = map;

    // Update basemap paint on system theme change (without rebuilding data layers)
    const onThemeChange = (e: MediaQueryListEvent) => {
      const isDark = e.matches;
      if (!map.isStyleLoaded()) return;
      map.setPaintProperty("background", "background-color", isDark ? "#0f172a" : "#dde8f0");
      map.setPaintProperty("osm-tiles", "raster-opacity", isDark ? 0.35 : 0.9);
      map.setPaintProperty("osm-tiles", "raster-saturation", isDark ? -1 : -0.15);
      map.setPaintProperty("osm-tiles", "raster-brightness-max", isDark ? 0.3 : 1.0);
    };
    mq.addEventListener("change", onThemeChange);

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

      // ── Confidence band layers (v2 engine: core track + forward extension) ───
      map.addSource("corridors-core", { type: "geojson", data: EMPTY_FC });
      map.addLayer({
        id: "corridors-core-fill",
        type: "fill",
        source: "corridors-core",
        paint: {
          "fill-color": corridorColor,
          "fill-opacity": 0.45,
        },
      });
      map.addLayer({
        id: "corridors-core-outline",
        type: "line",
        source: "corridors-core",
        paint: {
          "line-color": corridorColor,
          "line-width": 2,
        },
      });

      // Extension: forward-projected position (where storm is headed)
      map.addSource("corridors-extension", { type: "geojson", data: EMPTY_FC });
      map.addLayer({
        id: "corridors-extension-fill",
        type: "fill",
        source: "corridors-extension",
        paint: {
          "fill-color": "#fbbf24",
          "fill-opacity": 0.06,
        },
      });
      map.addLayer({
        id: "corridors-extension-outline",
        type: "line",
        source: "corridors-extension",
        paint: {
          "line-color": "#fbbf24",
          "line-width": 1.5,
          "line-dasharray": [4, 3],
          "line-opacity": 0.6,
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
      (map.getSource("corridors-core") as maplibregl.GeoJSONSource)
        ?.setData(buildBandFC(corridorsRef.current, "core") as GeoJSON.FeatureCollection);
      (map.getSource("corridors-extension") as maplibregl.GeoJSONSource)
        ?.setData(buildBandFC(corridorsRef.current, "extension") as GeoJSON.FeatureCollection);

      // Apply initial layer visibility and alert tier filter
      const vis = (v: boolean) => (v ? "visible" : "none") as "visible" | "none";
      const l = layersRef.current;
      const TIER_KEYS_INIT: Array<[keyof typeof l, string]> = [
        ["alertsRed", "RED"], ["alertsOrange", "ORANGE"], ["alertsYellow", "YELLOW"],
        ["alertsBlue", "BLUE"], ["alertsGray", "GRAY"],
      ];
      const initTiers = TIER_KEYS_INIT.filter(([k]) => l[k]).map(([, t]) => t);
      const alertsVis = initTiers.length > 0;
      ["alerts-fill", "alerts-outline"].forEach(id => {
        map.setLayoutProperty(id, "visibility", vis(alertsVis));
        if (alertsVis) map.setFilter(id, ["in", ["get", "severity_tier"], ["literal", initTiers]]);
      });
      ["lsr-circles"].forEach(id => map.setLayoutProperty(id, "visibility", vis(l.lsr)));
      [
        "corridors-fill", "corridors-outline",
        "corridors-core-fill", "corridors-core-outline",
        "corridors-extension-fill", "corridors-extension-outline",
        "centerlines-line",
      ].forEach(id => map.setLayoutProperty(id, "visibility", vis(l.corridors)));

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
      mq.removeEventListener("change", onThemeChange);
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
    // When not scrubbing, show all LSRs; scrub filtering handled by separate effect
    if (scrubTime === null) {
      setSourceData(mapRef.current, "lsr", lsrs);
    }
  }, [lsrs, scrubTime]);

  // Timeline scrubber: filter LSR source to reports up to scrubTime
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loadedRef.current) return;

    const src = map.getSource("lsr") as maplibregl.GeoJSONSource | undefined;
    if (!src) return;

    if (scrubTime === null) {
      // Live mode — restore full dataset
      src.setData((lsrs || { type: "FeatureCollection", features: [] }) as GeoJSON.FeatureCollection);
      // Restore corridor opacity
      if (map.getLayer("corridors-fill")) map.setPaintProperty("corridors-fill", "fill-opacity", ["match", ["get", "event_category"], "FLOOD_ZONE", 0.2, 0.25]);
      if (map.getLayer("corridors-outline")) map.setPaintProperty("corridors-outline", "line-opacity", 1.0);
      if (map.getLayer("corridors-core-fill")) map.setPaintProperty("corridors-core-fill", "fill-opacity", 0.45);
    } else {
      // Scrub mode — filter to reports at or before scrubTime
      const filtered = {
        type: "FeatureCollection" as const,
        features: (lsrs?.features || []).filter(f => {
          const raw = (f.properties as Record<string, unknown>).event_time;
          if (!raw) return false;
          const ts = new Date(raw as string).getTime();
          return !isNaN(ts) && ts <= scrubTime;
        }),
      };
      src.setData(filtered as GeoJSON.FeatureCollection);
      // Dim corridors to indicate they're the full reconstruction, not scrubbed
      if (map.getLayer("corridors-fill")) map.setPaintProperty("corridors-fill", "fill-opacity", ["match", ["get", "event_category"], "FLOOD_ZONE", 0.08, 0.10]);
      if (map.getLayer("corridors-outline")) map.setPaintProperty("corridors-outline", "line-opacity", 0.35);
      if (map.getLayer("corridors-core-fill")) map.setPaintProperty("corridors-core-fill", "fill-opacity", 0.18);
    }
  }, [scrubTime, lsrs]);

  useEffect(() => {
    if (!mapRef.current || !loadedRef.current) return;
    setSourceData(mapRef.current, "corridors", corridors);
    const centerlinesFC = buildCenterlinesFC(corridors);
    (mapRef.current.getSource("centerlines") as maplibregl.GeoJSONSource)?.setData(centerlinesFC);
    // Update v2 confidence band layers
    (mapRef.current.getSource("corridors-core") as maplibregl.GeoJSONSource)
      ?.setData(buildBandFC(corridors, "core") as GeoJSON.FeatureCollection);
    (mapRef.current.getSource("corridors-extension") as maplibregl.GeoJSONSource)
      ?.setData(buildBandFC(corridors, "extension") as GeoJSON.FeatureCollection);
  }, [corridors]);

  // Update layer visibility and alert tier filter
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loadedRef.current) return;
    const vis = (v: boolean) => (v ? "visible" : "none") as "visible" | "none";

    // Build list of active severity tiers from layer flags
    const TIER_KEYS: Array<[keyof LayerVisibility, string]> = [
      ["alertsRed", "RED"],
      ["alertsOrange", "ORANGE"],
      ["alertsYellow", "YELLOW"],
      ["alertsBlue", "BLUE"],
      ["alertsGray", "GRAY"],
    ];
    const activeTiers = TIER_KEYS.filter(([k]) => layers[k]).map(([, t]) => t);
    const alertsVisible = activeTiers.length > 0;

    ["alerts-fill", "alerts-outline"].forEach(l => {
      map.setLayoutProperty(l, "visibility", vis(alertsVisible));
      if (alertsVisible) {
        map.setFilter(l, ["in", ["get", "severity_tier"], ["literal", activeTiers]]);
      }
    });

    ["lsr-circles"].forEach(l => map.setLayoutProperty(l, "visibility", vis(layers.lsr)));
    [
      "corridors-fill", "corridors-outline",
      "corridors-core-fill", "corridors-core-outline",
      "corridors-extension-fill", "corridors-extension-outline",
      "centerlines-line",
    ].forEach(l => map.setLayoutProperty(l, "visibility", vis(layers.corridors)));
  }, [layers]);

  return (
    <div
      ref={mapContainerRef}
      style={{ width: "100%", height: "100vh", position: "absolute", top: 0, left: 0 }}
    />
  );
}
