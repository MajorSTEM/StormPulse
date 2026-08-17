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

#: Latest normalized snapshot; None until the first successful poll.
_snapshot: Optional[dict] = None


def get_snapshot() -> Optional[dict]:
    return _snapshot


async def poll_live_outages() -> dict:
    """Fetch and normalize the current NIPSCO outage list."""
    global _snapshot

    url = settings.outage_feed_url
    async with httpx.AsyncClient(timeout=90, headers={"User-Agent": BROWSER_UA}) as client:
        response = await client.get(url, params={"diagId": str(uuid.uuid4())})
        response.raise_for_status()
        payload = response.json()

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

    top_cities = sorted(by_city.items(), key=lambda kv: kv[1], reverse=True)[:25]

    _snapshot = {
        "as_of": datetime.now(timezone.utc).isoformat(),
        "utility": "NIPSCO (NiSource)",
        "outage_count": len(features),
        "customers_out": total_affected,
        "top_cities": [{"city": c, "affected": n} for c, n in top_cities],
        "features": features,
    }
    logger.info(
        f"Live outages: {len(features)} active, {total_affected} customers out (NIPSCO)"
    )
    return {"outages": len(features), "customers_out": total_affected}
