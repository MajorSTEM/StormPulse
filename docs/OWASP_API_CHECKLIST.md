# StormPulse V2 — OWASP API Security Top 10 (2023) Review

Walkthrough of the OWASP API Security Top 10 against the hardened `/api/v1`
layer. Each item records the finding, the control implemented, and where the
evidence lives. Acceptance target from the implementation plan: **no
unauthenticated access to protected routes** — enforced and regression-tested.

**Route inventory (complete):**

| Route | Method | Auth | Notes |
|-------|--------|------|-------|
| `/` | GET | Public | Service banner only (name, version, docs pointer) |
| `/api/v1/health` | GET | Public (intentional) | Liveness/freshness probe; exposes no weather data, no secrets |
| `/api/v1/alerts` | GET | **Bearer token** | NWS alerts GeoJSON |
| `/api/v1/lsr` | GET | **Bearer token** | Local Storm Reports GeoJSON |
| `/api/v1/corridors` | GET | **Bearer token** | Corridor GeoJSON incl. T3 disclaimers |
| `/docs`, `/redoc`, `/openapi.json` | GET | Public | API documentation (evidence artifact) |

---

## API1:2023 — Broken Object Level Authorization

**Status: Not applicable by design / PASS.** The API is read-only (GET only)
and serves the same public-safety dataset to every authenticated client; there
are no per-object owners, no object IDs accepted for mutation, and no
`/resource/{id}` routes. CORS is restricted to configured origins and methods
are restricted to GET (`app/main.py`).

## API2:2023 — Broken Authentication

**Status: PASS.** All data routes require a client API key via
`Authorization: Bearer <key>` (or `X-API-Key`), validated server-side against
the configured key set (`app/security.py:require_api_key`). Missing/invalid
keys ⇒ `401` with `WWW-Authenticate: Bearer` and no echo of the presented
credential. Keys are supplied via environment (`API_KEYS`), never committed.
The published demo key is a deliberate, documented read-only credential for
the public map with its own rate-limit bucket; per-client keys are issued for
real consumers (docs/DEPLOYMENT.md).
Tests: `test_protected_route_without_token_is_401`,
`test_protected_route_with_invalid_token_is_401`,
`test_auth_error_does_not_echo_presented_key`.

## API3:2023 — Broken Object Property Level Authorization

**Status: PASS.** Responses are explicitly serialized property-by-property in
the routers — no ORM-model dumps. Heavy/internal columns (`raw_payload`,
`description`, `alert_ids`) are deliberately deferred and never serialized.
No mass assignment surface exists (no write endpoints).

## API4:2023 — Unrestricted Resource Consumption

**Status: PASS.** Per-client rate limiting via slowapi on every route
(`RATE_LIMIT`, default 120/minute), keyed by client name for authenticated
requests and source IP otherwise; sustained abuse ⇒ `429` + `Retry-After`.
Query cost is bounded: `hours` is clamped to `1..168` by FastAPI validation
(`422` beyond), and upstream fetch pagination is capped (20 pages).
Tests: `test_sustained_abuse_returns_429`,
`test_rate_limit_buckets_are_per_client`,
`test_validation_error_is_bounded_not_verbose`.

## API5:2023 — Broken Function Level Authorization

**Status: PASS.** There is exactly one privilege level (read-only client);
no admin or write functions are exposed over HTTP. Ingestion and corridor
generation run only in the in-process scheduler, unreachable from the API.

## API6:2023 — Unrestricted Access to Sensitive Business Flows

**Status: PASS.** All served data is derived from public NOAA/NWS feeds;
no sensitive business flow (signup, payment, messaging) exists. Rate limiting
still throttles bulk scraping per client.

## API7:2023 — Server Side Request Forgery

**Status: PASS.** The server performs outbound requests only to constant,
hardcoded origins (`api.weather.gov`, `www.spc.noaa.gov`); no client-supplied
value is ever used to build an outbound URL.

## API8:2023 — Security Misconfiguration

**Status: PASS (hardened this release).**
- Security headers on every response: `X-Content-Type-Options: nosniff`,
  `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, HSTS, and a
  deny-all `Content-Security-Policy` on API routes (`app/security.py`).
- CORS locked to configured origins, GET-only, enumerated headers.
- Unhandled exceptions return a generic `{"detail": "Internal server error"}`
  and are logged server-side — no stack traces or driver errors leak
  (`app/main.py:unhandled_exception_handler`).
- TLS is terminated by the hosting platform (Render) for all public traffic.
Tests: `test_security_headers_present`.

## API9:2023 — Improper Inventory Management

**Status: PASS.** All API routes are versioned under `/api/v1`; the previous
unversioned `/api/*` routes were **removed**, not left running (404 —
`test_unversioned_legacy_routes_are_gone`). `/openapi.json` is the complete,
current inventory and shows the auth padlock on every protected route
(`test_openapi_shows_only_versioned_api_routes`,
`test_protected_routes_carry_security_scheme_in_docs`). The full route table
at the top of this document is the human-readable inventory.

## API10:2023 — Unsafe Consumption of APIs

**Status: PASS.** Upstream NWS/SPC responses are treated as untrusted input:
parsed defensively (per-row try/except, coordinate sanity checks, timestamp
parsing guards), size-bounded (pagination cap, request timeouts of 20–30 s),
and never echoed raw to clients. Upstream failure degrades to the local cache
with an explicit `stale: true` flag rather than crashing
(`test_upstream_outage_serves_cache_with_stale_flag`).

---

## Verification

```
cd backend && python -m pytest tests/          # 58 tests, incl. all cited above
```

Re-run this checklist whenever a route is added or auth/rate-limit
configuration changes.
