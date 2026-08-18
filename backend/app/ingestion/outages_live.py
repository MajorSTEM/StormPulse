"""
Live power-outage feed — NIPSCO (NiSource) public outage map backend.

Polls the same JSON endpoint NIPSCO's own public outage map uses
(nisource-api/ldc/GetPowerOutages) and normalizes it into a GeoJSON snapshot:
one point per active outage with customers affected, cause, reported time,
and estimated restoration. Each poll replaces the snapshot, so restorations
drop off automatically as the utility clears them.
"""
import logging
import uuid
from datetime import datetime, timezone
from typing import Optional

import httpx

from app.config import settings

logger = logging.getLogger(__name__)

BROWSER_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/126.0 Safari/537.36"
)

# ── ComEd (Exelon) — Kubra StormCenter public backend ────────────────────────
# Same public-data treatment as NIPSCO: these are the exact unauthenticated
# endpoints ComEd's own outage map serves to every visitor.
COMED_STATE_URL = (
    "https://kubra.io/stormcenter/api/v1/stormcenters/"
    "0f46457f-e3ee-473c-8040-d7da9e776ccb/views/"
    "2e108172-d24f-4c2b-ad49-23a3b1589688/currentState?preview=false"
)
KUBRA_BASE = "https://kubra.io"
# z8 web-mercator tiles covering ComEd's northern-Illinois territory
COMED_TILE_BBOX = (40.6, 42.75, -91.3, -87.2)  # lat_min, lat_max, lon_min, lon_max
COMED_TILE_ZOOM = 8


def _mercator_tile(lat: float, lon: float, zoom: int) -> tuple[int, int]:
    import math
    n = 1 << zoom
    x = int((lon + 180.0) / 360.0 * n)
    lat_r = math.radians(lat)
    y = int((1.0 - math.log(math.tan(lat_r) + 1.0 / math.cos(lat_r)) / math.pi) / 2.0 * n)
    return x, y


def _quadkey(x: int, y: int, zoom: int) -> str:
    key = ""
    for i in range(zoom, 0, -1):
        key += str(((x >> (i - 1)) & 1) + 2 * ((y >> (i - 1)) & 1))
    return key


def _comed_quadkeys() -> list[str]:
    lat_min, lat_max, lon_min, lon_max = COMED_TILE_BBOX
    x0, y1 = _mercator_tile(lat_min, lon_min, COMED_TILE_ZOOM)
    x1, y0 = _mercator_tile(lat_max, lon_max, COMED_TILE_ZOOM)
    keys = []
    for x in range(min(x0, x1), max(x0, x1) + 1):
        for y in range(min(y0, y1), max(y0, y1) + 1):
            keys.append(_quadkey(x, y, COMED_TILE_ZOOM))
    return keys


def _decode_polyline_point(encoded: str) -> Optional[tuple[float, float]]:
    """Decode the first point of a Google encoded polyline. Returns (lat, lon)."""
    index = lat = lon = 0
    coords = []
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


async def _poll_comed(client: httpx.AsyncClient) -> Optional[dict]:
    """Fetch ComEd totals + outage clusters from the Kubra StormCenter feed."""
    headers = {"Accept-Encoding": "gzip"}  # avoid brotli (httpx decodes gzip natively)
    state = (await client.get(COMED_STATE_URL, headers=headers)).json()
    interval_path = state["data"]["interval_generation_data"]
    cluster_tmpl = state["data"].get("cluster_interval_generation_data") or ""

    summary = (await client.get(
        f"{KUBRA_BASE}/{interval_path}/public/summary-1/data.json", headers=headers
    )).json()
    totals = (summary.get("summaryFileData", {}).get("totals") or [{}])[0]
    customers_out = int((totals.get("total_cust_a") or {}).get("val") or 0)
    outage_count = int(totals.get("total_outages") or 0)
    customers_served = int(totals.get("total_cust_s") or 0)

    features = []
    if cluster_tmpl:
        for qk in _comed_quadkeys():
            qkh = qk[-3:][::-1]
            url = (f"{KUBRA_BASE}/{cluster_tmpl.replace('{qkh}', qkh)}"
                   f"/public/cluster-3/{qk}.json")
            try:
                response = await client.get(url, headers=headers)
                if response.status_code != 200:
                    continue  # empty tile
                for item in response.json().get("file_data", []):
                    geom = (item.get("geom") or {}).get("p") or []
                    point = _decode_polyline_point(geom[0]) if geom else None
                    if not point:
                        continue
                    desc = item.get("desc") or {}
                    features.append({
                        "type": "Feature",
                        "geometry": {"type": "Point",
                                     "coordinates": [point[1], point[0]]},
                        "properties": {
                            "affected": int((desc.get("cust_a") or {}).get("val") or 0),
                            "city": "COMED AREA",
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
        "customers_out": customers_out,
        "outage_count": outage_count,
        "customers_served": customers_served,
        "features": features,
    }

#: Latest normalized snapshot; None until the first successful poll.
_snapshot: Optional[dict] = None


def get_snapshot() -> Optional[dict]:
    return _snapshot


async def poll_live_outages() -> dict:
    """Fetch and normalize the current NIPSCO outage list (plus the per-ZIP
    rollup used by the ZIP lookup — aggregate data only, nothing user-specific)."""
    global _snapshot

    url = settings.outage_feed_url
    zip_url = url.replace("GetPowerOutages", "GetCityPowerOutages")
    async with httpx.AsyncClient(timeout=90, headers={"User-Agent": BROWSER_UA}) as client:
        response = await client.get(url, params={"diagId": str(uuid.uuid4())})
        response.raise_for_status()
        payload = response.json()
        zip_index: dict[str, dict] = {}
        try:
            zip_response = await client.get(zip_url, params={"diagId": str(uuid.uuid4())})
            zip_response.raise_for_status()
            for row in zip_response.json().get("outageCityList") or []:
                z = str(row.get("zip") or "").strip()
                if len(z) != 5 or not z.isdigit():
                    continue
                entry = zip_index.setdefault(z, {"affected": 0, "cities": set()})
                entry["affected"] += int(row.get("affected") or 0)
                if row.get("city"):
                    entry["cities"].add(str(row["city"]).upper())
        except Exception as exc:
            logger.warning(f"ZIP rollup unavailable this scan: {exc}")

    outages = payload.get("outageList") or []
    features = []
    total_affected = 0
    by_city: dict[str, int] = {}

    for o in outages:
        lat, lng = o.get("lat"), o.get("lng")
        if lat is None or lng is None:
            continue
        affected = int(o.get("affected") or 0)
        total_affected += affected
        city = (o.get("city") or "UNKNOWN").upper()
        by_city[city] = by_city.get(city, 0) + affected

        restore = o.get("restore") or ""
        # NIPSCO uses year-0001 timestamps for "not yet estimated"
        restore_est = None if restore.startswith("0001") else restore

        features.append({
            "type": "Feature",
            "geometry": {"type": "Point", "coordinates": [lng, lat]},
            "properties": {
                "affected": affected,
                "city": city,
                "cause": o.get("cause") or "Not Yet Determined",
                "reported": o.get("reported"),
                "restore_est": restore_est,
                "storm_mode": bool(o.get("stormMode")),
                "utility": "NIPSCO",
                "_layer": "outages_live",
            },
        })

    # ComEd rides along; a ComEd failure never takes down the NIPSCO feed.
    comed = None
    try:
        async with httpx.AsyncClient(timeout=90, headers={"User-Agent": BROWSER_UA}) as client:
            comed = await _poll_comed(client)
    except Exception as exc:
        logger.warning(f"ComEd feed unavailable this scan: {exc}")

    utilities = [{
        "name": "NIPSCO (NiSource)",
        "customers_out": total_affected,
        "outage_count": len(features),
        # NIPSCO's feed carries no served total; ~500k electric customers is
        # the utility's published figure, so the share reads as approximate.
        "customers_served": 500000,
        "served_approximate": True,
    }]
    if comed:
        utilities.append({
            "name": comed["name"],
            "customers_out": comed["customers_out"],
            "outage_count": comed["outage_count"],
            "customers_served": comed["customers_served"],
        })
        features = features + comed["features"]
        total_affected += comed["customers_out"]

    top_cities = sorted(by_city.items(), key=lambda kv: kv[1], reverse=True)[:25]

    _snapshot = {
        "utilities": utilities,
        "zip_index": {
            z: {"affected": v["affected"], "cities": sorted(v["cities"])}
            for z, v in zip_index.items()
        },
        "as_of": datetime.now(timezone.utc).isoformat(),
        "utility": "NIPSCO (NiSource)",
        "outage_count": len(features),
        "customers_out": total_affected,
        "top_cities": [{"city": c, "affected": n} for c, n in top_cities],
        "features": features,
    }
    logger.info(
        f"Live outages: {len(features)} points, {total_affected} customers out "
        f"({'NIPSCO+ComEd' if comed else 'NIPSCO only'})"
    )
    return {"outages": len(features), "customers_out": total_affected}
