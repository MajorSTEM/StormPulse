from fastapi import APIRouter
from datetime import datetime, timezone
from app.ingestion.scheduler import ingestion_status

router = APIRouter()


@router.get("/health")
async def get_health():
    """Get ingestion source health status."""
    now = datetime.now(timezone.utc)

    sources = []
    for source_name, status in ingestion_status.items():
        last_success = status.get("last_success")
        lag_seconds = None
        health = "unknown"

        if last_success:
            last_dt = datetime.fromisoformat(last_success)
            lag_seconds = (now - last_dt).total_seconds()
            if lag_seconds < 600:  # < 10 min
                health = "ok"
            elif lag_seconds < 1800:  # < 30 min
                health = "degraded"
            else:
                health = "stale"

        sources.append({
            "name": source_name,
            "status": status.get("status", "pending"),
            "health": health,
            "last_success": last_success,
            "last_error": status.get("last_error"),
            "lag_seconds": lag_seconds,
        })

    overall = "ok"
    if any(s["health"] == "stale" for s in sources):
        overall = "degraded"
    if all(s["health"] == "unknown" for s in sources):
        overall = "initializing"

    return {
        "status": overall,
        "sources": sources,
        "server_time": now.isoformat(),
        "app": "StormPulse",
        "version": "1.0.0-mvp",
    }
