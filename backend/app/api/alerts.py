from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import defer
from datetime import datetime, timezone, timedelta
from typing import Optional
import json

from app.database import get_db
from app.models.alert import Alert

router = APIRouter()

# Maps NWS event_type strings to a 5-tier severity classification.
# Used for map color/opacity and sidebar grouping.
SEVERITY_TIERS: dict[str, str] = {
    # ── RED: immediate life threat ───────────────────────────────────────────
    "Tornado Emergency":                    "RED",
    "Tornado Warning":                      "RED",
    "Flash Flood Warning":                  "RED",
    "Flash Flood Emergency":                "RED",
    "Blizzard Warning":                     "RED",
    "Extreme Wind Warning":                 "RED",
    "Ice Storm Warning":                    "RED",
    "Excessive Heat Warning":               "RED",
    "Dust Storm Warning":                   "RED",
    "Hurricane Warning":                    "RED",
    "Typhoon Warning":                      "RED",
    "Tsunami Warning":                      "RED",
    "Evacuation Immediate":                 "RED",
    "Shelter In Place Warning":             "RED",
    # ── ORANGE: severe / high impact ────────────────────────────────────────
    "Severe Thunderstorm Warning":          "ORANGE",
    "High Wind Warning":                    "ORANGE",
    "Winter Storm Warning":                 "ORANGE",
    "Flood Warning":                        "ORANGE",
    "River Flood Warning":                  "ORANGE",
    "Areal Flood Warning":                  "ORANGE",
    "Coastal Flood Warning":                "ORANGE",
    "Lakeshore Flood Warning":              "ORANGE",
    "Freeze Warning":                       "ORANGE",
    "Heat Advisory":                        "ORANGE",
    "Red Flag Warning":                     "ORANGE",
    "Tropical Storm Warning":               "ORANGE",
    "Tsunami Watch":                        "ORANGE",
    "Hurricane Watch":                      "ORANGE",
    # ── YELLOW: watch / advisory ────────────────────────────────────────────
    "Tornado Watch":                        "YELLOW",
    "Severe Thunderstorm Watch":            "YELLOW",
    "Flash Flood Watch":                    "YELLOW",
    "Flood Watch":                          "YELLOW",
    "Areal Flood Watch":                    "YELLOW",
    "Coastal Flood Watch":                  "YELLOW",
    "High Wind Watch":                      "YELLOW",
    "Winter Storm Watch":                   "YELLOW",
    "Blizzard Watch":                       "YELLOW",
    "Excessive Heat Watch":                 "YELLOW",
    "Freeze Watch":                         "YELLOW",
    "Fire Weather Watch":                   "YELLOW",
    "Wind Advisory":                        "YELLOW",
    "Dense Fog Advisory":                   "YELLOW",
    "Dense Smoke Advisory":                 "YELLOW",
    "Winter Weather Advisory":              "YELLOW",
    "Frost Advisory":                       "YELLOW",
    "Air Quality Alert":                    "YELLOW",
    "Lake Wind Advisory":                   "YELLOW",
    "Hydrologic Outlook":                   "YELLOW",
    "Flood Advisory":                       "YELLOW",
    # ── BLUE: marine / water ────────────────────────────────────────────────
    "Coastal Flood Advisory":               "BLUE",
    "Lakeshore Flood Advisory":             "BLUE",
    "Rip Current Statement":                "BLUE",
    "Beach Hazards Statement":              "BLUE",
    "Small Craft Advisory":                 "BLUE",
    "Gale Warning":                         "BLUE",
    "Storm Warning":                        "BLUE",
    "Marine Dense Fog Advisory":            "BLUE",
    "High Surf Advisory":                   "BLUE",
    "High Surf Warning":                    "BLUE",
    "Tsunami Advisory":                     "BLUE",
    # ── GRAY: informational ─────────────────────────────────────────────────
    "Special Weather Statement":            "GRAY",
    "Hazardous Weather Outlook":            "GRAY",
    "Short Term Forecast":                  "GRAY",
    "Local Area Emergency":                 "GRAY",
    "Administrative Message":               "GRAY",
    "Test":                                 "GRAY",
}

# NWS severity field fallback when event_type is not in the dict above.
_SEVERITY_FIELD_FALLBACK: dict[str, str] = {
    "Extreme":   "RED",
    "Severe":    "ORANGE",
    "Moderate":  "YELLOW",
    "Minor":     "GRAY",
    "Unknown":   "GRAY",
}


def _severity_tier(event_type: str, nws_severity: str | None) -> str:
    if event_type in SEVERITY_TIERS:
        return SEVERITY_TIERS[event_type]
    return _SEVERITY_FIELD_FALLBACK.get(nws_severity or "", "GRAY")


@router.get("/alerts")
async def get_alerts(
    hours: int = Query(48, ge=1, le=168),
    active_only: bool = Query(False),
    db: AsyncSession = Depends(get_db)
):
    """Get NWS alerts as GeoJSON FeatureCollection."""
    cutoff = datetime.now(timezone.utc) - timedelta(hours=hours)

    # defer heavy blob columns never used in the GeoJSON response — eliminates
    # ~15-20 KB/alert of unnecessary DB egress on every poll
    query = (
        select(Alert)
        .options(defer(Alert.raw_payload), defer(Alert.description))
        .where(Alert.ingested_at >= cutoff)
    )
    if active_only:
        query = query.where(Alert.is_active == True)
    query = query.order_by(Alert.sent.desc())

    result = await db.execute(query)
    alerts = result.scalars().all()

    features = []
    for alert in alerts:
        geometry = json.loads(alert.polygon_geojson) if alert.polygon_geojson else None
        tier = _severity_tier(alert.event_type or "", alert.severity)
        feature = {
            "type": "Feature",
            "geometry": geometry,
            "properties": {
                "id": alert.id,
                "event_type": alert.event_type,
                "headline": alert.headline,
                "severity": alert.severity,
                "urgency": alert.urgency,
                "status": alert.status,
                "onset": alert.onset.isoformat() if alert.onset else None,
                "expires": alert.expires.isoformat() if alert.expires else None,
                "area_description": alert.area_description,
                "nws_headline": alert.nws_headline,
                "is_active": alert.is_active,
                "confidence_tier": alert.confidence_tier,
                "ingested_at": alert.ingested_at.isoformat() if alert.ingested_at else None,
                "source_url": alert.source_url,
                "severity_tier": tier,
                "_layer": "alerts",
            }
        }
        features.append(feature)

    return {
        "type": "FeatureCollection",
        "features": features,
        "meta": {
            "count": len(features),
            "hours": hours,
            "generated_at": datetime.now(timezone.utc).isoformat(),
        }
    }
