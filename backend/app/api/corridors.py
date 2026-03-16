from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from sqlalchemy.orm import defer
from datetime import datetime, timezone, timedelta
import json
import math

from app.database import get_db
from app.models.corridor import Corridor

router = APIRouter()

# Average structures per km² (conservative rural estimate)
STRUCTURES_PER_KM2 = 60


def _polygon_area_km2(polygon_geojson: dict | None) -> float:
    """Estimate polygon area in km² from a GeoJSON polygon dict."""
    if not polygon_geojson:
        return 0.0
    try:
        geom_type = polygon_geojson.get("type", "")
        if geom_type == "Polygon":
            rings = polygon_geojson.get("coordinates", [[]])
            ring = rings[0]
        elif geom_type == "MultiPolygon":
            ring = polygon_geojson.get("coordinates", [[[]]])[0][0]
        else:
            return 0.0

        if len(ring) < 3:
            return 0.0

        # Shoelace formula in degrees, then convert to km²
        n = len(ring)
        area_deg2 = 0.0
        for i in range(n):
            j = (i + 1) % n
            area_deg2 += ring[i][0] * ring[j][1]
            area_deg2 -= ring[j][0] * ring[i][1]
        area_deg2 = abs(area_deg2) / 2.0

        # Approximate conversion at centroid latitude
        avg_lat = sum(p[1] for p in ring) / n
        lat_km = 111.0
        lon_km = 111.0 * math.cos(math.radians(avg_lat))
        return area_deg2 * lat_km * lon_km
    except Exception:
        return 0.0


def _build_centerline(lsr_ids_json: str | None, db_lsrs: dict) -> dict | None:
    """Build a GeoJSON LineString from stored LSR IDs if we have coords."""
    # We don't have LSR coords here without DB query; return None
    # Centerline is generated and stored by the corridor engine instead
    return None


@router.get("/corridors")
async def get_corridors(
    hours: int = Query(48, ge=1, le=168),
    db: AsyncSession = Depends(get_db)
):
    """Get probable damage corridors as GeoJSON FeatureCollection."""
    cutoff = datetime.now(timezone.utc) - timedelta(hours=hours)

    result = await db.execute(
        select(Corridor)
        .options(defer(Corridor.alert_ids))  # never used in response
        .where(Corridor.generated_at >= cutoff)
        .order_by(Corridor.generated_at.desc())
    )
    corridors = result.scalars().all()

    features = []
    for corridor in corridors:
        polygon = json.loads(corridor.polygon_geojson) if corridor.polygon_geojson else None
        area_km2 = _polygon_area_km2(polygon)
        affected_structures_est = int(area_km2 * STRUCTURES_PER_KM2)

        feature = {
            "type": "Feature",
            "geometry": polygon,
            "properties": {
                "id": corridor.id,
                "incident_id": corridor.incident_id,
                "confidence_score": corridor.confidence_score,
                "confidence_label": corridor.confidence_label,
                "explanation": corridor.explanation,
                "severity_estimate": corridor.severity_estimate,
                "event_start": corridor.event_start.isoformat() if corridor.event_start else None,
                "event_end": corridor.event_end.isoformat() if corridor.event_end else None,
                "state": corridor.state,
                "county_list": json.loads(corridor.county_list) if corridor.county_list else [],
                "motion_direction_deg": corridor.motion_direction_deg,
                "motion_speed_kts": corridor.motion_speed_kts,
                "generated_at": corridor.generated_at.isoformat() if corridor.generated_at else None,
                "confidence_tier": corridor.confidence_tier,
                "lsr_count": len(json.loads(corridor.lsr_ids)) if corridor.lsr_ids else 0,
                "area_km2": round(area_km2, 1),
                "affected_structures_est": affected_structures_est,
                "centerline_geojson": corridor.centerline_geojson or None,
                "event_category": corridor.event_category or "TORNADO",
                "engine_version": getattr(corridor, "engine_version", None),
                "motion_consistency_score": getattr(corridor, "motion_consistency_score", None),
                "inlier_count": getattr(corridor, "inlier_count", None),
                "outlier_count": getattr(corridor, "outlier_count", None),
                "confidence_band_geojson": getattr(corridor, "confidence_band_geojson", None),
                "_layer": "corridors",
                "_inferred": True,
                "_disclaimer": "INFERRED LAYER - Not an official NWS damage survey",
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
            "disclaimer": "Corridors are system-generated probable damage estimates. They are NOT official NWS surveys.",
        }
    }
