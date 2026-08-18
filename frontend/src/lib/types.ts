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
    stale?: boolean;
    data_as_of?: string | null;
    data_age_seconds?: number | null;
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

export interface CorridorPrediction {
  cone_geojson: GeoJSONGeometry;
  bearing_deg: number;
  speed_kts: number;
  projection_minutes: number;
  cone_half_angle_deg: number;
  straight_pct: number;
  veer_left_pct: number;
  veer_right_pct: number;
  confidence_tier: string;
  disclaimer: string;
}

export interface TornadoHistoryProperties {
  id: number;
  om: number;
  year: number;
  date: string;
  time: string;
  state: string;
  ef: number;
  injuries: number;
  fatalities: number;
  loss: number;
  length_mi: number;
  width_yd: number;
  start_lat: number;
  start_lon: number;
  end_lat: number;
  end_lon: number;
  has_path: boolean;
  source: string;          // "SPC" | "NWS DAT"
  end_time: string | null;
  max_wind_mph: number | null;
  prop_damage: number | null;
  remarks: string | null;
  _layer: "history";
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
  engine_version: string | null;
  motion_consistency_score: number | null;
  inlier_count: number | null;
  outlier_count: number | null;
  confidence_band_geojson: string | null;
  tier_label: string;
  tier_description: string;
  prediction: CorridorPrediction | null;
  disclaimer: string | null;
  _layer: "corridors";
  _inferred: boolean;
  _disclaimer: string | null;
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
  freshness?: {
    stale: boolean;
    data_as_of: string | null;
    data_age_seconds: number | null;
  };
  server_time: string;
  app: string;
  version: string;
}

export interface OutageLiveProperties {
  affected: number;
  city: string;
  cause: string;
  reported: string | null;
  restore_est: string | null;
  storm_mode: boolean;
  utility: string;
  _layer: "outages_live";
}

export interface OutageEventProperties {
  id: string;
  utility: string;
  name: string;
  event_type: string;
  date: string;
  event_window_utc: string;
  area: string;
  customers_affected: number;
  customers_affected_note: string;
  largest_in_utility_history: boolean;
  peak_gust_measured_mph: number;
  peak_gust_measured_at: string;
  peak_gust_reported_mph: number;
  peak_gust_reported_note: string;
  wind_reports_in_corridor: number;
  deaths_reported: number;
  deaths_note: string;
  communities_affected: number;
  city_peak_outages: Record<string, number>;
  city_peak_note: string;
  still_out_aug13: number;
  restoration_90pct_target: string;
  restoration_full_target: string;
  followup: string;
  infrastructure_damage: string;
  sources: { label: string; url: string }[];
  illinois_impact?: {
    utility: string;
    customers_affected_aug11: number;
    customers_affected_event_total: number;
    peak_gust_mph: number;
    hard_hit_communities: string[];
    tornado_note: string;
    restoration_note: string;
  };
  feature_type: "outage_event";
  _layer: "outage_event";
}

export interface GustReportProperties {
  feature_type: "gust_report";
  speed_mph: number | null;
  measured: boolean;
  location: string;
  county: string;
  state: string;
  date: string;
  time_utc: string;
  comments: string;
  _layer: "outage_event";
}

export interface LayerVisibility {
  alertsRed: boolean;
  alertsOrange: boolean;
  alertsYellow: boolean;
  alertsBlue: boolean;
  alertsGray: boolean;
  lsr: boolean;
  corridors: boolean;
  counties: boolean;
  history: boolean;
  outages: boolean;
}

export type SelectedFeature = (GeoJSONFeature & {
  properties: AlertProperties | LSRProperties | CorridorProperties | TornadoHistoryProperties
    | OutageLiveProperties | OutageEventProperties | GustReportProperties;
}) | null;
