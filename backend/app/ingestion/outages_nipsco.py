"""
NIPSCO live outage fetcher.

Reads the two public JSON endpoints behind NIPSCO's own outage map
(nipsco.com/nisource-api/ldc/...):

  GetPowerOutages      -> one record per active outage, with lat/lng,
                          customers affected, cause, reported time, and the
                          estimated restoration time.
  GetCityPowerOutages  -> per-city/ZIP affected rollup, which powers the
                          ZIP lookup on /api/v1/outages/live.

Called by outages_live.poll_live_outages() on the polling interval. Returns
plain dicts; no module state lives here.
"""
import logging
import uuid

import httpx

from app.config import settings

logger = logging.getLogger(__name__)


async def fetch_nipsco(client: httpx.AsyncClient) -> dict:
    """
    Fetch and normalize NIPSCO's current outages.

    Returns:
      {
        "features":       list[GeoJSON Feature]  (one point per outage),
        "total_affected": int,
        "by_city":        {CITY: affected, ...},
        "zip_index":      {zip: {"affected": int, "cities": [..]}, ...},
      }

    Raises on upstream failure of the main outage list (the caller decides
    what a failed poll means); the ZIP rollup is best-effort and degrades to
    an empty index with a warning.
    """
    url = settings.outage_feed_url
    zip_url = url.replace("GetPowerOutages", "GetCityPowerOutages")

    # The diagId is a client-generated request marker their own page sends.
    response = await client.get(url, params={"diagId": str(uuid.uuid4())})
    response.raise_for_status()
    payload = response.json()

    # ZIP rollup (aggregate data only - the user's ZIP never reaches NIPSCO)
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
        logger.warning(f"NIPSCO ZIP rollup unavailable this scan: {exc}")

    features = []
    total_affected = 0
    by_city: dict[str, int] = {}

    for o in payload.get("outageList") or []:
        lat, lng = o.get("lat"), o.get("lng")
        if lat is None or lng is None:
            continue
        affected = int(o.get("affected") or 0)
        total_affected += affected
        city = (o.get("city") or "UNKNOWN").upper()
        by_city[city] = by_city.get(city, 0) + affected

        restore = o.get("restore") or ""
        # NIPSCO signals "no estimate yet" with a year-0001 timestamp
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

    return {
        "features": features,
        "total_affected": total_affected,
        "by_city": by_city,
        "zip_index": {
            z: {"affected": v["affected"], "cities": sorted(v["cities"])}
            for z, v in zip_index.items()
        },
    }
