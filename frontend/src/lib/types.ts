export interface GeoJSONFeature {
  type: "Feature";
  geometry: GeoJSONGeometry | null;
  properties: Record<string, unknown>;
}

export interface GeoJSONGeometry {
  type: string;
  coordinates: unknown;
}

export interface GeoJSONFeatureCollection {
  type: "FeatureCollection";
  features: GeoJSONFeature[];
  meta?: {
    count: number;
    hours: number;
    generated_at: string;
    disclaimer?: string;
  };
}

export interface AlertProperties {
  id: string;
  event_type: string;
  headline: string;
  severity: string;
  urgency: string;
  status: string;
  onset: string | null;
  expires: string | null;
  area_description: string;
  nws_headline: string;
  is_active: boolean;
  confidence_tier: string;
  ingested_at: string | null;
  source_url: string;
  severity_tier: "RED" | "ORANGE" | "YELLOW" | "BLUE" | "GRAY";
  _layer: "alerts";
}

export interface LSRProperties {
  id: string;
  type_code: string;
  type_description: string;
  magnitude: number | null;
  magnitude_units: string | null;
  city: string;
  county: string;
  state: string;
  remark: string;
  event_time: string | null;
  source_type: string;
  wfo: string;
  confidence_tier: string;
  ingested_at: string | null;
  age_minutes: number;
  _layer: "lsr";
}

export interface CorridorProperties {
  id: string;
  incident_id: string;
  confidence_score: number;
  confidence_label: string;
  explanation: string;
  severity_estimate: string;
  event_start: string | null;
  event_end: string | null;
  state: string;
  county_list: string[];
  motion_direction_deg: number | null;
  motion_speed_kts: number | null;
  generated_at: string | null;
  confidence_tier: string;
  lsr_count: number;
  area_km2: number;
  affected_structures_est: number;
  centerline_geojson: string | null;
  event_category: "TORNADO" | "WIND_DAMAGE" | "SEVERE_WEATHER" | "FLOOD_ZONE";
  _layer: "corridors";
  _inferred: boolean;
  _disclaimer: string;
}

export interface HealthSource {
  name: string;
  status: string;
  health: string;
  last_success: string | null;
  last_error: string | null;
  lag_seconds: number | null;
}

export interface HealthStatus {
  status: string;
  sources: HealthSource[];
  server_time: string;
  app: string;
  version: string;
}

export interface LayerVisibility {
  alerts: boolean;
  lsr: boolean;
  corridors: boolean;
  counties: boolean;
}

export type SelectedFeature = (GeoJSONFeature & {
  properties: AlertProperties | LSRProperties | CorridorProperties;
}) | null;
