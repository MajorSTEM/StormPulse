import json
import logging
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter

from app.ingestion import outages_live

logger = logging.getLogger(__name__)
router = APIRouter()

EVENTS_FILE = Path(__file__).resolve().parent.parent / "data" / "outage_events.json"
_events_cache: dict | None = None

LIVE_DISCLAIMER = (
    "Live outage data mirrored from the utility's public outage map "
    "(updated by NIPSCO ~every 10 minutes). Areas without markers are "
    "presumed energized. Not an official NIPSCO service."
)


def _load_events() -> dict:
    global _events_cache
    if _events_cache is None:
        _events_cache = json.loads(EVENTS_FILE.read_text(encoding="utf-8"))
    return _events_cache


@router.get("/outages/live")
async def get_live_outages():
    """
    Current power outages (NIPSCO), as GeoJSON points with per-outage
    customers affected, cause, and estimated restoration. The snapshot
    refreshes on the polling interval; restored areas drop off automatically.
    """
    snapshot = outages_live.get_snapshot()
    if snapshot is None:
        # First request after a cold boot: warm the cache on demand.
        try:
            await outages_live.poll_live_outages()
        except Exception as exc:
            logger.error(f"On-demand outage poll failed: {exc}")
        snapshot = outages_live.get_snapshot()

    if snapshot is None:
        return {
            "type": "FeatureCollection",
            "features": [],
            "meta": {
                "available": False,
                "detail": "Upstream utility outage feed unavailable.",
                "generated_at": datetime.now(timezone.utc).isoformat(),
            },
        }

    return {
        "type": "FeatureCollection",
        "features": snapshot["features"],
        "meta": {
            "available": True,
            "utility": snapshot["utility"],
            "as_of": snapshot["as_of"],
            "outage_count": snapshot["outage_count"],
            "customers_out": snapshot["customers_out"],
            "top_cities": snapshot["top_cities"],
            "disclaimer": LIVE_DISCLAIMER,
            "generated_at": datetime.now(timezone.utc).isoformat(),
        },
    }


@router.get("/history/outages")
async def get_outage_events():
    """
    Historical major outage events (curated archive — these are rare).
    Each event ships a wind-swath polygon derived from official SPC storm
    reports, the individual gust reports, and the full researched record
    (customers affected, restoration timeline, sources).
    """
    data = _load_events()
    features = []
    for event in data.get("events", []):
        props = {k: v for k, v in event.items() if k not in ("swath_geojson", "gust_reports")}
        props["feature_type"] = "outage_event"
        props["_layer"] = "outage_event"
        features.append({
            "type": "Feature",
            "geometry": event["swath_geojson"],
            "properties": props,
        })
        features.extend(event.get("gust_reports", []))

    return {
        "type": "FeatureCollection",
        "features": features,
        "meta": {
            "event_count": len(data.get("events", [])),
            "note": "Curated archive of major outage events; wind swath and gusts from official SPC storm reports.",
            "generated_at": datetime.now(timezone.utc).isoformat(),
        },
    }
