"""Tests for the outage archive and live outage endpoints."""
from app.ingestion import outages_live

AUTH = {"Authorization": "Bearer test-key-alpha"}


def test_outage_endpoints_require_auth(client):
    assert client.get("/api/v1/history/outages").status_code == 401
    assert client.get("/api/v1/outages/live").status_code == 401


def test_outage_event_archive_serves_storm_lucy(client):
    body = client.get("/api/v1/history/outages", headers=AUTH).json()
    assert body["meta"]["event_count"] == 1

    swaths = [f for f in body["features"]
              if f["properties"].get("feature_type") == "outage_event"]
    assert len(swaths) == 1
    props = swaths[0]["properties"]
    assert "Storm Lucy" in props["name"]
    assert props["utility"].startswith("NIPSCO")
    assert props["customers_affected"] == 301000
    assert props["largest_in_utility_history"] is True
    assert props["peak_gust_measured_mph"] == 99
    assert props["communities_affected"] == 118
    assert swaths[0]["geometry"]["type"] == "Polygon"
    assert props["sources"], "event must cite its sources"

    gusts = [f for f in body["features"]
             if f["properties"].get("feature_type") == "gust_report"]
    assert len(gusts) > 100
    measured = [g["properties"]["speed_mph"] for g in gusts
                if g["properties"]["speed_mph"] is not None]
    assert max(measured) == 99


def test_live_outages_serves_snapshot_without_upstream_call(client):
    outages_live._snapshot = {
        "as_of": "2026-08-17T12:00:00+00:00",
        "utility": "NIPSCO (NiSource)",
        "outage_count": 2,
        "customers_out": 150,
        "top_cities": [{"city": "GARY", "affected": 100},
                       {"city": "HOBART", "affected": 50}],
        "features": [
            {"type": "Feature",
             "geometry": {"type": "Point", "coordinates": [-87.3, 41.5]},
             "properties": {"affected": 100, "city": "GARY",
                            "cause": "Storm damage", "reported": "2026-08-17T10:00:00",
                            "restore_est": None, "storm_mode": True,
                            "utility": "NIPSCO", "_layer": "outages_live"}},
            {"type": "Feature",
             "geometry": {"type": "Point", "coordinates": [-87.2, 41.5]},
             "properties": {"affected": 50, "city": "HOBART",
                            "cause": "Equipment", "reported": "2026-08-17T11:00:00",
                            "restore_est": "2026-08-17T15:00:00", "storm_mode": False,
                            "utility": "NIPSCO", "_layer": "outages_live"}},
        ],
    }
    try:
        body = client.get("/api/v1/outages/live", headers=AUTH).json()
        assert body["meta"]["available"] is True
        assert body["meta"]["customers_out"] == 150
        assert body["meta"]["top_cities"][0]["city"] == "GARY"
        assert len(body["features"]) == 2
        assert "public outage map" in body["meta"]["disclaimer"]
    finally:
        outages_live._snapshot = None
