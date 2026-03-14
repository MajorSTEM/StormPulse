import httpx
import json
import logging
from datetime import datetime, timezone
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update
from app.models.alert import Alert
from app.config import settings

logger = logging.getLogger(__name__)

NWS_ALERTS_URL = "https://api.weather.gov/alerts/active"

# Confidence tier assignment by event type
TIER_MAP = {
    "Tornado Warning": "T1",
    "Tornado Emergency": "T1",
    "Tornado Watch": "T1",
    "Severe Thunderstorm Warning": "T1",
    "High Wind Warning": "T1",
    "High Wind Watch": "T1",
    "Wind Advisory": "T2",
    "Extreme Wind Warning": "T1",
    "Flash Flood Warning": "T1",
    "Flash Flood Watch": "T1",
    "Flood Warning": "T1",
    "Flood Watch": "T1",
    "Flood Advisory": "T2",
    "Winter Storm Warning": "T1",
    "Winter Storm Watch": "T1",
    "Blizzard Warning": "T1",
    "Ice Storm Warning": "T1",
    "Freeze Warning": "T1",
    "Special Weather Statement": "T2",
    "Dense Fog Advisory": "T2",
    "Heat Advisory": "T2",
    "Excessive Heat Warning": "T1",
    "Excessive Heat Watch": "T1",
}


def parse_dt(s):
    if not s:
        return None
    try:
        return datetime.fromisoformat(s.replace("Z", "+00:00"))
    except Exception:
        return None


async def ingest_nws_alerts(db: AsyncSession) -> dict:
    """Fetch ALL active NWS alerts in one request, store all relevant hazard types."""
    headers = {
        "User-Agent": settings.nws_user_agent,
        "Accept": "application/geo+json",
        **({"token": settings.noaa_api_key} if settings.noaa_api_key else {}),
    }

    ingested = 0
    updated = 0
    errors = []

    # Mark all currently-active alerts as inactive before refresh
    # (we'll flip back any still-active ones as we process them)
    await db.execute(update(Alert).where(Alert.is_active == True).values(is_active=False))

    try:
        async with httpx.AsyncClient(timeout=30) as client:
            # Fetch all active alerts — /alerts/active returns everything in one shot
            # Paginate via the pagination.next URL if present
            next_url: str | None = NWS_ALERTS_URL
            params: dict = {"status": "actual"}
            all_features = []
            page = 0

            while next_url and page < 20:
                response = await client.get(next_url, params=params, headers=headers)
                response.raise_for_status()
                data = response.json()
                all_features.extend(data.get("features", []))
                pagination = data.get("pagination", {})
                next_url = pagination.get("next")  # None if no more pages
                params = {}  # subsequent pages have full URL
                page += 1

            logger.info(f"Fetched {len(all_features)} alerts from NWS ({page} page(s))")

            for feature in all_features:
                props = feature.get("properties", {})
                alert_id = props.get("id", "")
                if not alert_id:
                    continue

                event_type = props.get("event", "")

                geometry = feature.get("geometry")
                polygon_geojson = json.dumps(geometry) if geometry else None

                result = await db.execute(select(Alert).where(Alert.id == alert_id))
                existing = result.scalar_one_or_none()

                if existing:
                    existing.is_active = True
                    existing.expires = parse_dt(props.get("expires"))
                    existing.ends = parse_dt(props.get("ends"))
                    updated += 1
                else:
                    tier = TIER_MAP.get(event_type, "T2")
                    nws_headline_list = props.get("parameters", {}).get("NWSheadline")
                    nws_headline = nws_headline_list[0] if nws_headline_list else ""

                    alert = Alert(
                        id=alert_id,
                        event_type=event_type,
                        headline=props.get("headline", ""),
                        description=props.get("description", ""),
                        severity=props.get("severity", ""),
                        urgency=props.get("urgency", ""),
                        status=props.get("status", ""),
                        onset=parse_dt(props.get("onset")),
                        expires=parse_dt(props.get("expires")),
                        effective=parse_dt(props.get("effective")),
                        ends=parse_dt(props.get("ends")),
                        sent=parse_dt(props.get("sent")),
                        area_description=props.get("areaDesc", ""),
                        nws_headline=nws_headline,
                        polygon_geojson=polygon_geojson,
                        source_url=f"https://api.weather.gov/alerts/{alert_id}",
                        raw_payload=json.dumps(feature),
                        is_active=True,
                        confidence_tier=tier,
                    )
                    db.add(alert)
                    ingested += 1

    except Exception as e:
        logger.error(f"Error ingesting NWS alerts: {e}")
        errors.append(str(e))

    await db.commit()
    logger.info(f"Alerts ingested: {ingested}, updated: {updated}")
    return {"ingested": ingested, "updated": updated, "errors": errors}
