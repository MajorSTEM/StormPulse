import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from app.config import settings
from app.database import init_db, AsyncSessionLocal
from app.api import alerts, lsr, corridors, health
from app.ingestion.scheduler import scheduler, run_ingestion_cycle

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
logger = logging.getLogger(__name__)


async def _run_migrations() -> None:
    """Add Corridor Engine v2 columns if they don't exist (idempotent)."""
    stmts = [
        "ALTER TABLE corridors ADD COLUMN IF NOT EXISTS engine_version VARCHAR",
        "ALTER TABLE corridors ADD COLUMN IF NOT EXISTS motion_consistency_score FLOAT",
        "ALTER TABLE corridors ADD COLUMN IF NOT EXISTS inlier_count INTEGER",
        "ALTER TABLE corridors ADD COLUMN IF NOT EXISTS outlier_count INTEGER",
        "ALTER TABLE corridors ADD COLUMN IF NOT EXISTS confidence_band_geojson TEXT",
    ]
    try:
        async with AsyncSessionLocal() as session:
            for stmt in stmts:
                await session.execute(text(stmt))
            await session.commit()
        logger.info("DB migrations applied.")
    except Exception as exc:
        logger.warning(f"Migration skipped (likely SQLite or already applied): {exc}")


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    logger.info("StormPulse starting up...")
    await init_db()
    await _run_migrations()

    # Schedule ingestion
    scheduler.add_job(
        run_ingestion_cycle,
        "interval",
        seconds=settings.ingest_interval_seconds,
        id="ingestion_cycle",
        max_instances=1,
        coalesce=True,
    )
    scheduler.start()

    # Run initial ingestion
    logger.info("Running initial data ingestion...")
    await run_ingestion_cycle()

    yield

    # Shutdown
    scheduler.shutdown()
    logger.info("StormPulse shut down.")


app = FastAPI(
    title="StormPulse API",
    description="Tornado damage mapping platform - NOAA/NWS data fusion and corridor estimation",
    version="1.0.0-mvp",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(alerts.router, prefix="/api", tags=["alerts"])
app.include_router(lsr.router, prefix="/api", tags=["lsr"])
app.include_router(corridors.router, prefix="/api", tags=["corridors"])
app.include_router(health.router, prefix="/api", tags=["health"])


@app.get("/")
async def root():
    return {
        "app": "StormPulse",
        "status": "running",
        "docs": "/docs",
        "api": "/api",
    }
