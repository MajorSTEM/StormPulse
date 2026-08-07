"""Tests for the historical tornado archive endpoint and predictive cone."""
import asyncio

import pytest

from app.corridor.prediction import build_prediction, PREDICTION_DISCLAIMER
from tests.conftest import TEST_DB

AUTH = {"Authorization": "Bearer test-key-alpha"}


def seed_history():
    from sqlalchemy.ext.asyncio import create_async_engine
    from sqlalchemy.ext.asyncio import AsyncSession as SeedSession
    from sqlalchemy import select, func
    from app.models.tornado_history import TornadoHistory

    rows = [
        dict(om=1, year=2011, date="2011-05-22", time="17:34:00", state="MO",
             ef=5, injuries=1150, fatalities=158, loss=2800.0,
             start_lat=37.05, start_lon=-94.59, end_lat=37.07, end_lon=-94.37,
             length_mi=21.62, width_yd=1600),
        dict(om=2, year=2013, date="2013-05-20", time="14:56:00", state="OK",
             ef=5, injuries=212, fatalities=24, loss=2000.0,
             start_lat=35.28, start_lon=-97.63, end_lat=35.33, end_lon=-97.32,
             length_mi=13.85, width_yd=1900),
        dict(om=3, year=1999, date="1999-05-03", time="18:23:00", state="OK",
             ef=5, injuries=583, fatalities=36, loss=1000.0,
             start_lat=35.02, start_lon=-97.83, end_lat=35.35, end_lon=-97.44,
             length_mi=37.0, width_yd=1760),
        dict(om=4, year=2020, date="2020-03-03", time="00:32:00", state="TN",
             ef=3, injuries=220, fatalities=5, loss=1500.0,
             start_lat=36.16, start_lon=-86.92, end_lat=36.22, end_lon=-86.50,
             length_mi=26.0, width_yd=1600),
        # Touchdown-only report (no surveyed end point)
        dict(om=5, year=1950, date="1950-10-09", time="02:15:00", state="NC",
             ef=1, injuries=3, fatalities=0, loss=5.0,
             start_lat=34.17, start_lon=-78.60, end_lat=0.0, end_lon=0.0,
             length_mi=2.0, width_yd=880),
    ]

    async def _seed():
        engine = create_async_engine(f"sqlite+aiosqlite:///./{TEST_DB}")
        async with SeedSession(engine) as session:
            count = (await session.execute(
                select(func.count()).select_from(TornadoHistory)
            )).scalar() or 0
            if count == 0:
                for row in rows:
                    session.add(TornadoHistory(**row))
                await session.commit()
        await engine.dispose()

    asyncio.run(_seed())


# ── History endpoint ─────────────────────────────────────────────────────────

def test_history_requires_auth(client):
    assert client.get("/api/v1/history/tornadoes").status_code == 401


def test_history_returns_paths_and_points(client):
    seed_history()
    body = client.get("/api/v1/history/tornadoes", headers=AUTH).json()
    assert body["meta"]["count"] == 5
    geom_types = {f["geometry"]["type"] for f in body["features"]}
    assert geom_types == {"LineString", "Point"}
    # Touchdown-only tornado must be a Point with has_path False
    nc = [f for f in body["features"] if f["properties"]["state"] == "NC"][0]
    assert nc["geometry"]["type"] == "Point"
    assert nc["properties"]["has_path"] is False


def test_history_orders_strongest_first(client):
    seed_history()
    body = client.get("/api/v1/history/tornadoes", headers=AUTH).json()
    efs = [f["properties"]["ef"] for f in body["features"]]
    assert efs == sorted(efs, reverse=True)


def test_history_filters(client):
    seed_history()
    ok = client.get("/api/v1/history/tornadoes?state=OK", headers=AUTH).json()
    assert {f["properties"]["state"] for f in ok["features"]} == {"OK"}

    modern = client.get(
        "/api/v1/history/tornadoes?year_from=2010&year_to=2020", headers=AUTH
    ).json()
    assert all(2010 <= f["properties"]["year"] <= 2020 for f in modern["features"])

    violent = client.get("/api/v1/history/tornadoes?ef_min=5", headers=AUTH).json()
    assert all(f["properties"]["ef"] == 5 for f in violent["features"])
    assert violent["meta"]["count"] == 3


def test_history_limit_and_truncation_meta(client):
    seed_history()
    body = client.get("/api/v1/history/tornadoes?limit=2", headers=AUTH).json()
    assert body["meta"]["count"] == 2
    assert body["meta"]["total_matching"] == 5
    assert body["meta"]["truncated"] is True


def test_history_limit_is_capped(client):
    assert client.get(
        "/api/v1/history/tornadoes?limit=99999", headers=AUTH
    ).status_code == 422


# ── Predictive cone ──────────────────────────────────────────────────────────

def test_prediction_none_without_bearing():
    assert build_prediction(35.0, -97.0, None, 30.0, 0.9) is None


def test_prediction_cone_shape_and_fields():
    p = build_prediction(35.0, -97.0, 45.0, 40.0, 0.9)
    assert p["confidence_tier"] == "T3"
    assert p["disclaimer"] == PREDICTION_DISCLAIMER
    ring = p["cone_geojson"]["coordinates"][0]
    assert ring[0] == ring[-1], "cone polygon must be closed"
    assert len(ring) >= 10
    assert p["straight_pct"] + p["veer_left_pct"] + p["veer_right_pct"] in (99, 100, 101)


def test_prediction_wobblier_track_gives_wider_cone_and_more_veer():
    linear = build_prediction(35.0, -97.0, 45.0, 40.0, 0.95)
    wobbly = build_prediction(35.0, -97.0, 45.0, 40.0, 0.20)
    assert wobbly["cone_half_angle_deg"] > linear["cone_half_angle_deg"]
    assert wobbly["straight_pct"] < linear["straight_pct"]
    assert wobbly["veer_left_pct"] > linear["veer_left_pct"]


def test_prediction_is_deterministic():
    args = (35.0, -97.0, 45.0, 40.0, 0.7)
    assert build_prediction(*args) == build_prediction(*args)


def test_corridor_payload_includes_prediction(client):
    import json as _json
    from tests.conftest import seed_corridor
    from datetime import datetime, timezone
    from app.ingestion import scheduler as sched

    now = datetime.now(timezone.utc).isoformat()
    for source in ("nws_alerts", "nws_lsr"):
        sched.ingestion_status[source]["last_success"] = now

    centerline = {"type": "LineString",
                  "coordinates": [[-97.1, 35.0], [-97.0, 35.1], [-96.9, 35.2]]}
    seed_corridor(
        id="seed-predict",
        incident_id="SEED_PREDICT",
        confidence_tier="T3",
        event_category="TORNADO",
        centerline_geojson=_json.dumps(centerline),
        motion_direction_deg=40.0,
        motion_speed_kts=35.0,
        motion_consistency_score=0.8,
    )
    body = client.get("/api/v1/corridors", headers=AUTH).json()
    target = [f for f in body["features"] if f["properties"]["id"] == "seed-predict"]
    assert target
    prediction = target[0]["properties"]["prediction"]
    assert prediction is not None
    assert prediction["bearing_deg"] == 40.0
    assert prediction["cone_geojson"]["type"] == "Polygon"
    assert "Not an NWS forecast" in prediction["disclaimer"]
