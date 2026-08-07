from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_, or_
from datetime import datetime, timezone
from typing import Optional
import json

from app.database import get_db
from app.models.tornado_history import TornadoHistory

router = APIRouter()


@router.get("/history/tornadoes")
async def get_tornado_history(
    year_from: int = Query(1950, ge=1950, le=2030),
    year_to: int = Query(2030, ge=1950, le=2030),
    state: Optional[str] = Query(None, min_length=2, max_length=2,
                                 description="Two-letter state code"),
    ef_min: int = Query(0, ge=0, le=5, description="Minimum EF/F rating"),
    ef_max: int = Query(5, ge=0, le=5),
    limit: int = Query(500, ge=1, le=2000),
    db: AsyncSession = Depends(get_db),
):
    """
    Historical US tornadoes (SPC database, 1950-present) as GeoJSON.

    Each feature is the surveyed path: a LineString from touchdown to lift-off
    when an end point was recorded, otherwise a Point at touchdown. Results are
    ordered strongest-first, then newest-first, and capped by `limit` — narrow
    the filters to drill in.
    """
    conditions = [
        TornadoHistory.year >= year_from,
        TornadoHistory.year <= year_to,
    ]
    # EF filter: unrated tornadoes (ef = -9, mostly fresh DAT surveys) are
    # included only when the caller accepts EF0 and up.
    if ef_min > 0:
        conditions.append(TornadoHistory.ef >= ef_min)
        conditions.append(TornadoHistory.ef <= ef_max)
    else:
        conditions.append(or_(
            and_(TornadoHistory.ef >= 0, TornadoHistory.ef <= ef_max),
            TornadoHistory.ef == -9,
        ))
    if state:
        # Substring match: DAT rows carry the WFO's multi-state coverage
        # (e.g. "IL,IN"), SPC rows an exact two-letter code.
        conditions.append(TornadoHistory.state.ilike(f"%{state.upper()}%"))

    total = (await db.execute(
        select(func.count()).select_from(TornadoHistory).where(and_(*conditions))
    )).scalar() or 0

    result = await db.execute(
        select(TornadoHistory)
        .where(and_(*conditions))
        .order_by(TornadoHistory.ef.desc(), TornadoHistory.year.desc(),
                  TornadoHistory.date.desc())
        .limit(limit)
    )
    tornadoes = result.scalars().all()

    features = []
    for t in tornadoes:
        has_end = not (t.end_lat == 0.0 and t.end_lon == 0.0) and (
            t.end_lat is not None and t.end_lon is not None
        )
        # Prefer the full surveyed multi-vertex track (DAT) when available
        geometry = None
        if t.path_geojson:
            try:
                geometry = json.loads(t.path_geojson)
            except (ValueError, TypeError):
                geometry = None
        if geometry is None:
            if has_end and (t.end_lat != t.start_lat or t.end_lon != t.start_lon):
                geometry = {
                    "type": "LineString",
                    "coordinates": [[t.start_lon, t.start_lat], [t.end_lon, t.end_lat]],
                }
            else:
                geometry = {"type": "Point", "coordinates": [t.start_lon, t.start_lat]}

        features.append({
            "type": "Feature",
            "geometry": geometry,
            "properties": {
                "id": t.id,
                "om": t.om,
                "year": t.year,
                "date": t.date,
                "time": t.time,
                "state": t.state,
                "ef": t.ef,
                "injuries": t.injuries,
                "fatalities": t.fatalities,
                "loss": t.loss,
                "length_mi": t.length_mi,
                "width_yd": t.width_yd,
                "start_lat": t.start_lat,
                "start_lon": t.start_lon,
                "end_lat": t.end_lat,
                "end_lon": t.end_lon,
                "has_path": has_end or geometry.get("type") != "Point",
                "source": t.source or "SPC",
                "end_time": t.end_time,
                "max_wind_mph": t.max_wind_mph,
                "prop_damage": t.prop_damage,
                "remarks": t.remarks,
                "_layer": "history",
            },
        })

    return {
        "type": "FeatureCollection",
        "features": features,
        "meta": {
            "count": len(features),
            "total_matching": total,
            "truncated": total > len(features),
            "source": "SPC tornado database 1950-2024 + NWS DAT surveys 2025-present",
            "generated_at": datetime.now(timezone.utc).isoformat(),
        },
    }
