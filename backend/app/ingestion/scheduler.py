import logging
from datetime import datetime, timezone
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import AsyncSessionLocal
from app.ingestion.nws_alerts import ingest_nws_alerts
from app.ingestion.nws_lsr import ingest_lsrs
from app.corridor.engine import generate_corridors
from app.models.ingestion_state import IngestionState
from app.config import settings

logger = logging.getLogger(__name__)

# Track last ingestion times for health dashboard
ingestion_status = {
    "nws_alerts": {"last_success": None, "last_error": None, "status": "pending"},
    "nws_lsr": {"last_success": None, "last_error": None, "status": "pending"},
    "corridor_engine": {"last_success": None, "last_error": None, "status": "pending"},
}

# Upstream data sources (the corridor engine is derived, not upstream) —
# these drive the stale flag for the cache-fallback contingency.
UPSTREAM_SOURCES = ("nws_alerts", "nws_lsr")


async def load_persisted_status() -> None:
    """Restore last-known ingestion state from the DB after a restart, so a
    boot during an upstream outage still reports honest data freshness."""
    try:
        async with AsyncSessionLocal() as db:
            rows = (await db.execute(select(IngestionState))).scalars().all()
            for row in rows:
                if row.source in ingestion_status:
                    ingestion_status[row.source]["last_success"] = (
                        row.last_success.isoformat() if row.last_success else None
                    )
                    ingestion_status[row.source]["last_error"] = row.last_error
                    ingestion_status[row.source]["status"] = row.status or "pending"
        logger.info("Restored ingestion state from DB.")
    except Exception as exc:
        logger.warning(f"Could not restore ingestion state: {exc}")


async def _persist_status(db: AsyncSession) -> None:
    for source, status in ingestion_status.items():
        row = (await db.execute(
            select(IngestionState).where(IngestionState.source == source)
        )).scalar_one_or_none()
        last_success = (
            datetime.fromisoformat(status["last_success"])
            if status.get("last_success") else None
        )
        if row:
            row.last_success = last_success
            row.last_error = status.get("last_error")
            row.status = status.get("status", "pending")
        else:
            db.add(IngestionState(
                source=source,
                last_success=last_success,
                last_error=status.get("last_error"),
                status=status.get("status", "pending"),
            ))
    await db.commit()


def data_freshness() -> dict:
    """
    Freshness of the locally cached data relative to upstream feeds.

    The database itself is the fallback cache: when upstream NWS/SPC feeds
    fail, the API keeps serving the last successfully ingested data and this
    flag turns stale so every payload (and the UI banner) says so.
    """
    now = datetime.now(timezone.utc)
    times = []
    for source in UPSTREAM_SOURCES:
        last = ingestion_status[source].get("last_success")
        if last:
            times.append(datetime.fromisoformat(last))

    if not times:
        return {"stale": True, "data_as_of": None, "data_age_seconds": None}

    data_as_of = min(times)  # honesty: freshness of the *worst* source
    age = (now - data_as_of).total_seconds()
    return {
        "stale": age > settings.stale_threshold_seconds,
        "data_as_of": data_as_of.isoformat(),
        "data_age_seconds": round(age),
    }


async def run_ingestion_cycle():
    """Run all ingestion tasks in sequence."""
    async with AsyncSessionLocal() as db:
        # Ingest alerts
        try:
            result = await ingest_nws_alerts(db)
            ingestion_status["nws_alerts"]["last_success"] = datetime.now(timezone.utc).isoformat()
            ingestion_status["nws_alerts"]["status"] = "ok"
            ingestion_status["nws_alerts"]["last_result"] = result
            logger.info(f"Alerts: {result}")
        except Exception as e:
            ingestion_status["nws_alerts"]["last_error"] = str(e)
            ingestion_status["nws_alerts"]["status"] = "error"
            logger.error(f"Alert ingestion failed: {e}")

        # Ingest LSRs
        try:
            result = await ingest_lsrs(db)
            ingestion_status["nws_lsr"]["last_success"] = datetime.now(timezone.utc).isoformat()
            ingestion_status["nws_lsr"]["status"] = "ok"
            ingestion_status["nws_lsr"]["last_result"] = result
            logger.info(f"LSRs: {result}")
        except Exception as e:
            ingestion_status["nws_lsr"]["last_error"] = str(e)
            ingestion_status["nws_lsr"]["status"] = "error"
            logger.error(f"LSR ingestion failed: {e}")

        # Generate corridors
        try:
            result = await generate_corridors(db)
            ingestion_status["corridor_engine"]["last_success"] = datetime.now(timezone.utc).isoformat()
            ingestion_status["corridor_engine"]["status"] = "ok"
            ingestion_status["corridor_engine"]["last_result"] = result
            logger.info(f"Corridors: {result}")
        except Exception as e:
            ingestion_status["corridor_engine"]["last_error"] = str(e)
            ingestion_status["corridor_engine"]["status"] = "error"
            logger.error(f"Corridor generation failed: {e}")

        # Persist outcome so staleness tracking survives restarts (CP-10)
        try:
            await _persist_status(db)
        except Exception as e:
            logger.warning(f"Could not persist ingestion state: {e}")


scheduler = AsyncIOScheduler()
