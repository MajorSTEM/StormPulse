"""
Integration-test harness: real FastAPI app over a throwaway SQLite database,
background ingestion disabled, small rate-limit window for fast 429 tests.
Environment must be set before the app (and its Settings) is imported.
"""
import asyncio
import os
import pathlib

TEST_DB = "test_stormpulse.db"
os.environ["DATABASE_URL"] = f"sqlite+aiosqlite:///./{TEST_DB}"
os.environ["API_KEYS"] = "test-key-alpha:alpha,test-key-beta:beta"
os.environ["RATE_LIMIT"] = "10/minute"
os.environ["ENABLE_SCHEDULER"] = "false"

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.security import limiter


@pytest.fixture(scope="session")
def client():
    with TestClient(app) as test_client:
        yield test_client

    # Release DB file handles, then remove the throwaway database.
    from app.database import engine

    asyncio.run(engine.dispose())
    try:
        pathlib.Path(TEST_DB).unlink(missing_ok=True)
    except OSError:
        pass


@pytest.fixture(autouse=True)
def reset_rate_limiter():
    """Isolate rate-limit buckets between tests."""
    limiter.reset()
    yield


def seed_corridor(**overrides) -> None:
    """Insert a corridor row through a dedicated engine (no cross-event-loop
    connection pooling with the app's engine)."""
    import json

    from sqlalchemy.ext.asyncio import create_async_engine
    from sqlalchemy.ext.asyncio import AsyncSession as SeedSession
    from app.models.corridor import Corridor

    polygon = {
        "type": "Polygon",
        "coordinates": [[[-97.1, 35.0], [-96.9, 35.0], [-96.9, 35.2], [-97.1, 35.2], [-97.1, 35.0]]],
    }
    defaults = dict(
        id=overrides.get("id", "seed-corridor-1"),
        incident_id="SEED_TEST",
        polygon_geojson=json.dumps(polygon),
        confidence_score=0.8,
        confidence_label="HIGH",
        explanation="Seeded corridor for integration tests.",
        lsr_ids=json.dumps([]),
        alert_ids=json.dumps([]),
        severity_estimate="POSSIBLE",
        state="OK",
        county_list=json.dumps(["Cleveland"]),
        confidence_tier="T3",
        event_category="TORNADO",
        engine_version="v2",
    )
    defaults.update(overrides)

    async def _seed():
        engine = create_async_engine(f"sqlite+aiosqlite:///./{TEST_DB}")
        async with SeedSession(engine) as session:
            existing = await session.get(Corridor, defaults["id"])
            if existing is None:
                session.add(Corridor(**defaults))
                await session.commit()
        await engine.dispose()

    asyncio.run(_seed())
