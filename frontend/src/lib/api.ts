const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
// Versioned V2 API — all data routes live under /api/v1 and require a client
// API key. The demo key is a published read-only credential for the public
// map; real clients get their own key (rate limits are enforced per client).
const API_V1 = `${API_BASE}/api/v1`;
const API_KEY = process.env.NEXT_PUBLIC_API_KEY || "stormpulse-demo-key";

const AUTH_HEADERS = { Authorization: `Bearer ${API_KEY}` };

export async function fetchAlerts(hours = 48): Promise<Response> {
  return fetch(`${API_V1}/alerts?hours=${hours}`, {
    headers: AUTH_HEADERS,
    next: { revalidate: 60 },
  });
}

export async function fetchLSRs(hours = 48, typeCodes?: string): Promise<Response> {
  const params = new URLSearchParams({ hours: String(hours) });
  if (typeCodes) params.set("type_codes", typeCodes);
  return fetch(`${API_V1}/lsr?${params}`, {
    headers: AUTH_HEADERS,
    next: { revalidate: 60 },
  });
}

export async function fetchCorridors(hours = 48): Promise<Response> {
  return fetch(`${API_V1}/corridors?hours=${hours}`, {
    headers: AUTH_HEADERS,
    next: { revalidate: 60 },
  });
}

export interface HistoryQuery {
  yearFrom?: number;
  yearTo?: number;
  state?: string;
  efMin?: number;
  limit?: number;
}

export async function fetchTornadoHistory(q: HistoryQuery = {}): Promise<Response> {
  const params = new URLSearchParams();
  if (q.yearFrom !== undefined) params.set("year_from", String(q.yearFrom));
  if (q.yearTo !== undefined) params.set("year_to", String(q.yearTo));
  if (q.state) params.set("state", q.state);
  if (q.efMin !== undefined) params.set("ef_min", String(q.efMin));
  params.set("limit", String(q.limit ?? 750));
  return fetch(`${API_V1}/history/tornadoes?${params}`, {
    headers: AUTH_HEADERS,
    next: { revalidate: 3600 },
  });
}

export async function fetchLiveOutages(): Promise<Response> {
  return fetch(`${API_V1}/outages/live`, {
    headers: AUTH_HEADERS,
    cache: "no-store",
  });
}

export async function fetchOutageEvents(): Promise<Response> {
  return fetch(`${API_V1}/history/outages`, {
    headers: AUTH_HEADERS,
    next: { revalidate: 3600 },
  });
}

export async function fetchHealth(): Promise<Response> {
  // Health is an intentionally public read-only route (no key required).
  return fetch(`${API_V1}/health`, {
    cache: "no-store",
  });
}

export function buildShareableUrl(
  lat: number,
  lon: number,
  zoom: number,
  layers: Record<string, boolean>,
  hours: number
): string {
  const params = new URLSearchParams({
    lat: lat.toFixed(4),
    lon: lon.toFixed(4),
    z: zoom.toFixed(1),
    layers: Object.entries(layers)
      .filter(([, v]) => v)
      .map(([k]) => k)
      .join(","),
    hours: String(hours),
  });
  return `${window.location.origin}?${params}`;
}
