"""
Integration tests for the V2 hardened API layer:
authentication (401/200), per-client rate limiting (429), versioned /v1
routes, T3 disclaimers in payloads, and cache fallback with stale flag.
"""
from datetime import datetime, timedelta, timezone

from app.ingestion import scheduler as sched
from tests.conftest import seed_corridor

AUTH = {"Authorization": "Bearer test-key-alpha"}
AUTH_BETA = {"Authorization": "Bearer test-key-beta"}


def _mark_sources_fresh():
    now = datetime.now(timezone.utc).isoformat()
    for source in ("nws_alerts", "nws_lsr"):
        sched.ingestion_status[source]["last_success"] = now


# ── Authentication ───────────────────────────────────────────────────────────

def test_protected_route_without_token_is_401(client):
    for path in ("/api/v1/alerts", "/api/v1/lsr", "/api/v1/corridors"):
        response = client.get(path)
        assert response.status_code == 401, path
        assert response.headers.get("www-authenticate") == "Bearer"


def test_protected_route_with_invalid_token_is_401(client):
    response = client.get("/api/v1/alerts", headers={"Authorization": "Bearer wrong-key"})
    assert response.status_code == 401


def test_protected_route_with_valid_token_is_200(client):
    for path in ("/api/v1/alerts", "/api/v1/lsr", "/api/v1/corridors"):
        response = client.get(path, headers=AUTH)
        assert response.status_code == 200, path


def test_x_api_key_header_also_accepted(client):
    response = client.get("/api/v1/alerts", headers={"X-API-Key": "test-key-alpha"})
    assert response.status_code == 200


def test_public_routes_do_not_require_token(client):
    assert client.get("/api/v1/health").status_code == 200
    assert client.get("/").status_code == 200


# ── Versioned routes ─────────────────────────────────────────────────────────

def test_openapi_shows_only_versioned_api_routes(client):
    paths = client.get("/openapi.json").json()["paths"]
    api_paths = [p for p in paths if p != "/"]
    assert api_paths, "expected versioned routes in the schema"
    for path in api_paths:
        assert path.startswith("/api/v1/"), f"unversioned route exposed: {path}"
    assert "/api/v1/alerts" in paths
    assert "/api/alerts" not in paths


def test_unversioned_legacy_routes_are_gone(client):
    assert client.get("/api/alerts", headers=AUTH).status_code == 404


def test_protected_routes_carry_security_scheme_in_docs(client):
    spec = client.get("/openapi.json").json()
    for path in ("/api/v1/alerts", "/api/v1/lsr", "/api/v1/corridors"):
        operation = spec["paths"][path]["get"]
        assert operation.get("security"), f"{path} missing auth padlock in /docs"
    health_op = spec["paths"]["/api/v1/health"]["get"]
    assert not health_op.get("security")


# ── Rate limiting ────────────────────────────────────────────────────────────

def test_sustained_abuse_returns_429(client):
    # RATE_LIMIT is 10/minute in tests; the 11th request in the window trips it.
    statuses = [
        client.get("/api/v1/health", headers=AUTH_BETA).status_code
        for _ in range(11)
    ]
    assert statuses[:10] == [200] * 10
    assert statuses[10] == 429


def test_rate_limit_buckets_are_per_client(client):
    # Exhaust beta's bucket; alpha must be unaffected.
    for _ in range(10):
        client.get("/api/v1/health", headers=AUTH_BETA)
    assert client.get("/api/v1/health", headers=AUTH_BETA).status_code == 429
    assert client.get("/api/v1/health", headers=AUTH).status_code == 200


# ── T3 disclaimers ───────────────────────────────────────────────────────────

def test_inferred_corridor_payload_carries_disclaimer(client):
    _mark_sources_fresh()
    seed_corridor(id="seed-t3", confidence_tier="T3")
    body = client.get("/api/v1/corridors", headers=AUTH).json()
    assert "NOT official NWS surveys" in body["meta"]["disclaimer"]

    t3_features = [
        f for f in body["features"] if f["properties"]["confidence_tier"] == "T3"
    ]
    assert t3_features, "seeded T3 corridor missing from response"
    for feature in t3_features:
        props = feature["properties"]
        assert props["disclaimer"], "T3 feature must carry a disclaimer field"
        assert "INFERRED" in props["disclaimer"].upper()
        assert props["tier_label"] == "T3 · INFERRED"
        assert props["_inferred"] is True


def test_official_flood_zone_corridor_has_no_disclaimer(client):
    _mark_sources_fresh()
    seed_corridor(
        id="seed-t2",
        incident_id="SEED_FLOOD",
        confidence_tier="T2",
        event_category="FLOOD_ZONE",
        engine_version="official",
    )
    body = client.get("/api/v1/corridors", headers=AUTH).json()
    t2 = [f for f in body["features"] if f["properties"]["id"] == "seed-t2"]
    assert t2
    props = t2[0]["properties"]
    assert props["disclaimer"] is None
    assert props["tier_label"] == "T2 · OFFICIAL NWS"
    assert props["_inferred"] is False


# ── Cache fallback / staleness ───────────────────────────────────────────────

def test_upstream_outage_serves_cache_with_stale_flag(client):
    # Simulate an upstream outage: last successful ingestion was 2 hours ago
    # (well past STALE_THRESHOLD_SECONDS). The API must keep serving data
    # from the local cache (the DB) and flag it stale.
    seed_corridor(id="seed-cache", confidence_tier="T3")
    outage_time = (datetime.now(timezone.utc) - timedelta(hours=2)).isoformat()
    for source in ("nws_alerts", "nws_lsr"):
        sched.ingestion_status[source]["last_success"] = outage_time

    response = client.get("/api/v1/corridors", headers=AUTH)
    assert response.status_code == 200
    body = response.json()
    assert body["meta"]["stale"] is True
    assert body["meta"]["data_as_of"] is not None
    assert any(f["properties"]["id"] == "seed-cache" for f in body["features"])

    health = client.get("/api/v1/health").json()
    assert health["freshness"]["stale"] is True


def test_fresh_ingestion_clears_stale_flag(client):
    _mark_sources_fresh()
    body = client.get("/api/v1/alerts", headers=AUTH).json()
    assert body["meta"]["stale"] is False
    assert client.get("/api/v1/health").json()["freshness"]["stale"] is False


# ── Security headers / error hygiene ─────────────────────────────────────────

def test_security_headers_present(client):
    response = client.get("/api/v1/health")
    assert response.headers["x-content-type-options"] == "nosniff"
    assert response.headers["x-frame-options"] == "DENY"
    assert "strict-transport-security" in response.headers
    assert response.headers["content-security-policy"].startswith("default-src 'none'")


def test_auth_error_does_not_echo_presented_key(client):
    secret = "super-secret-key-that-must-not-leak"
    response = client.get("/api/v1/alerts", headers={"Authorization": f"Bearer {secret}"})
    assert response.status_code == 401
    assert secret not in response.text


def test_validation_error_is_bounded_not_verbose(client):
    response = client.get("/api/v1/alerts?hours=99999", headers=AUTH)
    assert response.status_code == 422
    assert "Traceback" not in response.text
