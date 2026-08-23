"""
ComEd live outage fetcher (Kubra StormCenter public backend).

ComEd's outage map is hosted by Kubra. The public data flow, exactly as the
map itself uses it:

  1. currentState  -> names the current report's data paths (they rotate
                      every publish cycle).
  2. summary JSON  -> territory-wide totals: customers out, customers
                      served, active outage count.
  3. cluster tiles -> per-area outage clusters, fetched per web-mercator
                      quadkey. The URL template embeds a "{qkh}" shard,
                      which is the LAST THREE quadkey characters REVERSED.
                      Points are Google-encoded polylines. 404 = empty tile.

Called by outages_live.poll_live_outages(). Returns a plain dict; no module
state lives here. All requests force gzip because httpx can't decode the
brotli Kubra prefers without an extra dependency.
"""
import logging
import math
from typing import Optional

import httpx

logger = logging.getLogger(__name__)

COMED_STATE_URL = (
    "https://kubra.io/stormcenter/api/v1/stormcenters/"
    "0f46457f-e3ee-473c-8040-d7da9e776ccb/views/"
    "2e108172-d24f-4c2b-ad49-23a3b1589688/currentState?preview=false"
)
KUBRA_BASE = "https://kubra.io"

# z8 web-mercator tiles covering ComEd's northern-Illinois territory
COMED_TILE_BBOX = (40.6, 42.75, -91.3, -87.2)  # lat_min, lat_max, lon_min, lon_max
COMED_TILE_ZOOM = 8

_GZIP_ONLY = {"Accept-Encoding": "gzip"}


def _mercator_tile(lat: float, lon: float, zoom: int) -> tuple[int, int]:
    n = 1 << zoom
    x = int((lon + 180.0) / 360.0 * n)
    lat_r = math.radians(lat)
    y = int((1.0 - math.log(math.tan(lat_r) + 1.0 / math.cos(lat_r)) / math.pi) / 2.0 * n)
    return x, y


def _quadkey(x: int, y: int, zoom: int) -> str:
    """Bing-style quadkey for a tile (digit per zoom level, MSB first)."""
    key = ""
    for i in range(zoom, 0, -1):
        key += str(((x >> (i - 1)) & 1) + 2 * ((y >> (i - 1)) & 1))
    return key


def comed_quadkeys() -> list[str]:
    """All z8 quadkeys covering the ComEd territory bounding box (~9 tiles)."""
    lat_min, lat_max, lon_min, lon_max = COMED_TILE_BBOX
    x0, y1 = _mercator_tile(lat_min, lon_min, COMED_TILE_ZOOM)
    x1, y0 = _mercator_tile(lat_max, lon_max, COMED_TILE_ZOOM)
    return [
        _quadkey(x, y, COMED_TILE_ZOOM)
        for x in range(min(x0, x1), max(x0, x1) + 1)
        for y in range(min(y0, y1), max(y0, y1) + 1)
    ]


def decode_polyline_point(encoded: str) -> Optional[tuple[float, float]]:
    """Decode the first point of a Google encoded polyline as (lat, lon)."""
    index = lat = lon = 0
    coords: list[tuple[float, float]] = []
    try:
        while index < len(encoded) and len(coords) < 1:
            for target in ("lat", "lon"):
                result = shift = 0
                while True:
                    b = ord(encoded[index]) - 63
                    index += 1
                    result |= (b & 0x1F) << shift
                    shift += 5
                    if b < 0x20:
                        break
                delta = ~(result >> 1) if result & 1 else result >> 1
                if target == "lat":
                    lat += delta
                else:
                    lon += delta
            coords.append((lat / 1e5, lon / 1e5))
    except (IndexError, ValueError):
        return None
    return coords[0] if coords else None


async def fetch_comed(client: httpx.AsyncClient) -> dict:
    """
    Fetch and normalize ComEd's current outages.

    Returns:
      {
        "name": "ComEd (Exelon)",
        "customers_out": int,
        "outage_count": int,
        "customers_served": int,
        "features": list[GeoJSON Feature],   # cluster points
      }

    Raises on failure of the state/summary calls; individual cluster tiles
    are best-effort (a 404 tile just means no outages in that area).
    """
    state = (await client.get(COMED_STATE_URL, headers=_GZIP_ONLY)).json()
    interval_path = state["data"]["interval_generation_data"]
    cluster_tmpl = state["data"].get("cluster_interval_generation_data") or ""

    summary = (await client.get(
        f"{KUBRA_BASE}/{interval_path}/public/summary-1/data.json", headers=_GZIP_ONLY
    )).json()
    totals = (summary.get("summaryFileData", {}).get("totals") or [{}])[0]

    features = []
    if cluster_tmpl:
        for qk in comed_quadkeys():
            qkh = qk[-3:][::-1]  # Kubra's shard key: last 3 chars, reversed
            url = (f"{KUBRA_BASE}/{cluster_tmpl.replace('{qkh}', qkh)}"
                   f"/public/cluster-3/{qk}.json")
            try:
                response = await client.get(url, headers=_GZIP_ONLY)
                if response.status_code != 200:
                    continue
                for item in response.json().get("file_data", []):
                    geom = (item.get("geom") or {}).get("p") or []
                    point = decode_polyline_point(geom[0]) if geom else None
                    if not point:
                        continue
                    desc = item.get("desc") or {}
                    features.append({
                        "type": "Feature",
                        "geometry": {"type": "Point",
                                     "coordinates": [point[1], point[0]]},
                        "properties": {
                            "affected": int((desc.get("cust_a") or {}).get("val") or 0),
                            "city": "COMED AREA",  # Kubra clusters carry no city name
                            "cause": desc.get("cause") or "Not reported",
                            "reported": desc.get("start_time"),
                            "restore_est": desc.get("etr"),
                            "storm_mode": False,
                            "n_outages": int(desc.get("n_out") or 1),
                            "utility": "ComEd",
                            "_layer": "outages_live",
                        },
                    })
            except Exception as exc:
                logger.debug(f"ComEd tile {qk} skipped: {exc}")

    return {
        "name": "ComEd (Exelon)",
        "customers_out": int((totals.get("total_cust_a") or {}).get("val") or 0),
        "outage_count": int(totals.get("total_outages") or 0),
        "customers_served": int(totals.get("total_cust_s") or 0),
        "features": features,
    }
