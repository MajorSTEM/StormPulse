const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export async function fetchAlerts(hours = 48): Promise<Response> {
  return fetch(`${API_BASE}/api/alerts?hours=${hours}`, {
    next: { revalidate: 60 },
  });
}

export async function fetchLSRs(hours = 48, typeCodes?: string): Promise<Response> {
  const params = new URLSearchParams({ hours: String(hours) });
  if (typeCodes) params.set("type_codes", typeCodes);
  return fetch(`${API_BASE}/api/lsr?${params}`, {
    next: { revalidate: 60 },
  });
}

export async function fetchCorridors(hours = 48): Promise<Response> {
  return fetch(`${API_BASE}/api/corridors?hours=${hours}`, {
    next: { revalidate: 60 },
  });
}

export async function fetchHealth(): Promise<Response> {
  return fetch(`${API_BASE}/api/health`, {
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
