import logging
from datetime import datetime, timezone
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import AsyncSessionLocal
from app.ingestion.nws_alerts import ingest_nws_alerts
from app.ingestion.nws_lsr import ingest_lsrs
from app.corridor.engine import generate_corridors
from app.config import settings

logger = logging.getLogger(__name__)

# Track last ingestion times for health dashboard
ingestion_status = {
    "nws_alerts": {"last_success": None, "last_error": None, "status": "pending"},
    "nws_lsr": {"last_success": None, "last_error": None, "status": "pending"},
    "corridor_engine": {"last_success": None, "last_error": None, "status": "pending"},
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


scheduler = AsyncIOScheduler()
