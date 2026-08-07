import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI, Security
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
from sqlalchemy import text

from app.config import settings
from app.database import init_db, AsyncSessionLocal
from app.api import alerts, lsr, corridors, health
from app.ingestion.scheduler import (
    scheduler,
    run_ingestion_cycle,
    load_persisted_status,
)
from app.security import limiter, require_api_key, security_headers_middleware

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
logger = logging.getLogger(__name__)

API_VERSION = "2.0.0"


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
    logger.info("StormPulse V2 starting up...")
    await init_db()
    await _run_migrations()
    await load_persisted_status()

    if settings.enable_scheduler:
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
    if settings.enable_scheduler:
        scheduler.shutdown()
    logger.info("StormPulse shut down.")


app = FastAPI(
    title="StormPulse API",
    description=(
        "Tornado damage mapping platform — NOAA/NWS data fusion and corridor "
        "estimation. V2 hardened API: bearer-token authentication, per-client "
        "rate limiting, versioned /api/v1 routes."
    ),
    version=API_VERSION,
    lifespan=lifespan,
)

# Per-client rate limiting (429 on abuse) — see app/security.py
app.state.limiter = limiter
app.add_middleware(SlowAPIMiddleware)

app.middleware("http")(security_headers_middleware)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["GET"],
    allow_headers=["Authorization", "X-API-Key", "Content-Type"],
)


@app.exception_handler(RateLimitExceeded)
async def rate_limit_handler(request, exc: RateLimitExceeded):
    return JSONResponse(
        status_code=429,
        content={"detail": "Rate limit exceeded. Slow down and retry later."},
        headers={"Retry-After": "60"},
    )


@app.exception_handler(Exception)
async def unhandled_exception_handler(request, exc: Exception):
    """Never leak stack traces or internals to clients (OWASP API8)."""
    logger.exception(f"Unhandled error on {request.url.path}: {exc}")
    return JSONResponse(status_code=500, content={"detail": "Internal server error"})


# ── Versioned API (V2 deliverable: all routes under /api/v1) ─────────────────
# Protected routes require a client API key (bearer token) — 401 otherwise.
# Intentionally public read-only routes: "/" (service banner) and
# "/api/v1/health" (uptime/liveness probe; exposes no weather data).
protected = [Security(require_api_key)]

app.include_router(alerts.router, prefix="/api/v1", tags=["alerts"], dependencies=protected)
app.include_router(lsr.router, prefix="/api/v1", tags=["lsr"], dependencies=protected)
app.include_router(corridors.router, prefix="/api/v1", tags=["corridors"], dependencies=protected)
app.include_router(health.router, prefix="/api/v1", tags=["health"])


@app.get("/")
async def root():
    return {
        "app": "StormPulse",
        "status": "running",
        "version": API_VERSION,
        "docs": "/docs",
        "api": "/api/v1",
    }
