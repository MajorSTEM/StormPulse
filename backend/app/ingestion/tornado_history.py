"""
One-time loader for the SPC historical tornado database (1950-present).

Downloads the SPC "actual tornadoes" CSV (~8 MB, ~72k rows — every recorded
US tornado) and bulk-inserts it into the tornado_history table. Runs as a
background job at startup only when the table is empty, so it costs nothing
on subsequent boots.
"""
import csv
import io
import logging

import httpx
from sqlalchemy import func, insert, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.tornado_history import TornadoHistory

logger = logging.getLogger(__name__)

SPC_HISTORY_URL = "https://www.spc.noaa.gov/wcm/data/1950-2024_actual_tornadoes.csv"
BATCH_SIZE = 1000


def _f(value: str, default: float = 0.0) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _i(value: str, default: int = 0) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


async def load_tornado_history(db: AsyncSession, force: bool = False) -> dict:
    """Populate tornado_history from the SPC CSV. Idempotent: skips when the
    table already has data unless force=True."""
    existing = (await db.execute(
        select(func.count()).select_from(TornadoHistory)
    )).scalar() or 0
    if existing > 0 and not force:
        return {"loaded": 0, "skipped": True, "existing_rows": existing}

    logger.info("Downloading SPC historical tornado database...")
    async with httpx.AsyncClient(timeout=120) as client:
        response = await client.get(
            SPC_HISTORY_URL, headers={"User-Agent": settings.nws_user_agent}
        )
        response.raise_for_status()

    reader = csv.DictReader(io.StringIO(response.text))
    rows: list[dict] = []
    loaded = 0
    for row in reader:
        slat, slon = _f(row.get("slat")), _f(row.get("slon"))
        if slat == 0.0 and slon == 0.0:
            continue  # no usable location
        rows.append({
            "om": _i(row.get("om")),
            "year": _i(row.get("yr")),
            "date": (row.get("date") or "").strip(),
            "time": (row.get("time") or "").strip(),
            "state": (row.get("st") or "").strip().upper(),
            "ef": _i(row.get("mag"), default=-9),
            "injuries": _i(row.get("inj")),
            "fatalities": _i(row.get("fat")),
            "loss": _f(row.get("loss")),
            "start_lat": slat,
            "start_lon": slon,
            "end_lat": _f(row.get("elat")),
            "end_lon": _f(row.get("elon")),
            "length_mi": _f(row.get("len")),
            "width_yd": _f(row.get("wid")),
        })
        if len(rows) >= BATCH_SIZE:
            await db.execute(insert(TornadoHistory), rows)
            loaded += len(rows)
            rows = []
    if rows:
        await db.execute(insert(TornadoHistory), rows)
        loaded += len(rows)
    await db.commit()

    logger.info(f"Tornado history loaded: {loaded} rows")
    return {"loaded": loaded, "skipped": False, "existing_rows": existing}
