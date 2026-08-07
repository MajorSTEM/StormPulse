import logging
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
from fastapi import FastAPI, Security
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
from sqlalchemy import text

from app.config import settings
from app.database import init_db, AsyncSessionLocal
from app.api import alerts, lsr, corridors, health, history
from app.ingestion.scheduler import (
    scheduler,
    run_ingestion_cycle,
    run_history_load,
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
    # Startup — a temporarily unreachable database must not crash-loop the
    # service: boot in degraded mode, surface it via /health, and let the
    # ingestion cycle retry initialization until the DB returns (CP-10).
    logger.info("StormPulse V2 starting up...")
    try:
        await init_db()
        await _run_migrations()
        await load_persisted_status()
    except Exception as exc:
        logger.error(
            f"Database unavailable at startup — continuing in degraded mode: {exc}"
        )

    if settings.enable_scheduler:
        # next_run_time=now fires the first ingestion immediately AFTER startup
        # completes instead of blocking it — the API must answer requests within
        # seconds of boot (serving cached DB data) even when a full ingestion
        # cycle takes minutes on constrained free-tier CPU.
        scheduler.add_job(
            run_ingestion_cycle,
            "interval",
            seconds=settings.ingest_interval_seconds,
            id="ingestion_cycle",
            max_instances=1,
            coalesce=True,
            next_run_time=datetime.now(timezone.utc),
        )
        # One-shot: populate the SPC historical tornado table if empty,
        # delayed so live ingestion gets the first crack at the DB.
        scheduler.add_job(
            run_history_load,
            "date",
            run_date=datetime.now(timezone.utc) + timedelta(seconds=45),
            id="history_load",
        )
        scheduler.start()

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
app.include_router(history.router, prefix="/api/v1", tags=["history"], dependencies=protected)
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
