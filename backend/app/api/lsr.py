from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from datetime import datetime, timezone, timedelta
from typing import Optional
import json
import math

from app.database import get_db
from app.models.lsr import LSR

router = APIRouter()


def _age_minutes(event_time: datetime | None) -> float:
    if not event_time:
        return 0.0
    # SQLite returns naive datetimes; treat them as UTC
    if event_time.tzinfo is None:
        event_time = event_time.replace(tzinfo=timezone.utc)
    delta = datetime.now(timezone.utc) - event_time
    return max(0.0, delta.total_seconds() / 60)


@router.get("/lsr")
async def get_lsrs(
    hours: int = Query(48, ge=1, le=168),
    type_codes: Optional[str] = Query(None, description="Comma-separated type codes: T,W,H"),
    state: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db)
):
    """Get Local Storm Reports as GeoJSON FeatureCollection."""
    cutoff = datetime.now(timezone.utc) - timedelta(hours=hours)

    query = select(LSR).where(LSR.event_time >= cutoff)

    if type_codes:
        codes = [c.strip().upper() for c in type_codes.split(",")]
        query = query.where(LSR.type_code.in_(codes))

    if state:
        query = query.where(LSR.state.ilike(f"%{state}%"))

    query = query.order_by(LSR.event_time.desc())

    result = await db.execute(query)
    lsrs = result.scalars().all()

    features = []
    for lsr in lsrs:
        feature = {
            "type": "Feature",
            "geometry": {
                "type": "Point",
                "coordinates": [lsr.longitude, lsr.latitude]
            },
            "properties": {
                "id": lsr.id,
                "type_code": lsr.type_code,
                "type_description": lsr.type_description,
                "magnitude": lsr.magnitude,
                "magnitude_units": lsr.magnitude_units,
                "city": lsr.city,
                "county": lsr.county,
                "state": lsr.state,
                "remark": lsr.remark,
                "event_time": lsr.event_time.isoformat() if lsr.event_time else None,
                "source_type": lsr.source_type,
                "wfo": lsr.wfo,
                "confidence_tier": lsr.confidence_tier,
                "ingested_at": lsr.ingested_at.isoformat() if lsr.ingested_at else None,
                "age_minutes": round(_age_minutes(lsr.event_time), 1),
                "_layer": "lsr",
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
