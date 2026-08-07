# StormPulse V2 — Architecture

Current architecture of the deployed StormPulse V2 platform. A Visio diagram
of this data flow exists in the capstone submission package; this document is
the maintained textual equivalent and matches the implemented code.

## Data flow

```
  NWS Alerts API                SPC Storm Reports (ArcGIS/CSV feeds)
  api.weather.gov               www.spc.noaa.gov/climo/reports
        │                                   │
        └────────────┬──────────────────────┘
                     ▼
        APScheduler ingestion cycle  (every INGEST_INTERVAL_SECONDS, default 5 min)
        backend/app/ingestion/{nws_alerts,nws_lsr}.py
                     │  tier assignment via app/scoring/confidence.py
                     ▼
        Corridor Engine v2  (backend/app/corridor/engine.py)
        temporal chaining → motion estimation → outlier rejection
        → oriented polygons + confidence bands → weighted confidence scoring
                     │
                     ▼
        Database (SQLAlchemy async)
        PostgreSQL in production · SQLite for local/dev/tests
        tables: alerts · lsrs · corridors · ingestion_state
        = durable cache of last-known-good data (CP-10)
                     │
                     ▼
        Hardened REST API  (FastAPI, backend/app/main.py)
        /api/v1/{alerts,lsr,corridors}  → bearer-token auth (401 without key)
        /api/v1/health                  → public liveness/freshness probe
        per-client rate limiting (429) · security headers · sanitized errors
        stale:true meta + T3 disclaimers in every relevant payload
                     │
                     ▼
        Next.js 14 frontend  (MapLibre GL + Tailwind)
        map layers: alerts · LSRs · corridors (+tier labels) · confidence bands
        staleness banner · provenance panel with T1/T2/T3 badges
                     │
                     ▼
        NexAlert Response users (and public demo consumers)
```

## Components

| Component | Technology | Location |
|-----------|-----------|----------|
| Ingestion | Python, APScheduler, httpx | `backend/app/ingestion/` |
| Scoring (T1/T2/T3 + confidence strength) | Pure Python module | `backend/app/scoring/confidence.py` |
| Corridor Engine v2 | Shapely geometry, circular statistics | `backend/app/corridor/engine.py` |
| Persistence | SQLAlchemy 2 async; PostgreSQL (prod, `asyncpg`) / SQLite (dev/test, `aiosqlite`) | `backend/app/database.py`, `backend/app/models/` |
| API layer | FastAPI, slowapi rate limiting | `backend/app/main.py`, `backend/app/api/`, `backend/app/security.py` |
| Frontend | Next.js 14, TypeScript, MapLibre GL, Tailwind | `frontend/` |
| Hosting | Render free tier (backend web service + frontend web service + Postgres) | `docs/DEPLOYMENT.md` |

## Key architectural decisions

**The database is the contingency cache.** Ingestion writes last-known-good
data; the API always serves from the DB, so an upstream NWS/SPC outage
degrades to "cached data + `stale: true` + UI banner" instead of an error
(NIST CP-2/CP-10). Ingestion outcomes persist in `ingestion_state` so a
restarted instance reports honest freshness immediately.

**Tier assignment is centralized.** No tier string is hardcoded anywhere in
ingestion or the engine; every object's T1/T2/T3 tier comes from the weighted
model in `app/scoring/confidence.py` (methodology and validation:
`docs/CONFIDENCE_SCORING.md`).

**The API surface is versioned and closed.** All routes live under `/api/v1`;
adding `/api/v2` later cannot break existing consumers. The API is
GET-only — ingestion and corridor generation are unreachable over HTTP.

**Trust boundaries.** (1) Upstream NOAA feeds are untrusted input: parsed
defensively, size- and time-bounded. (2) API clients are authenticated and
rate-limited per client. (3) The browser frontend holds only the published
read-only demo credential; real client keys are provisioned server-side via
environment configuration.

## Security architecture summary

- AuthN: bearer API keys, validated server-side (`IA-2`); 401 + `WWW-Authenticate` otherwise.
- Rate limiting: per-client buckets, 429 + `Retry-After` (`SC-5`).
- Transport: TLS at the platform edge, HSTS, SSL-required Postgres (`SC-8/SC-13`).
- Headers: nosniff, X-Frame-Options DENY, deny-all CSP on API routes.
- Errors: sanitized 500s; details only in server logs (`SI-11`).
- Full mapping: `docs/NIST-800-53-MAPPING.md`; API review: `docs/OWASP_API_CHECKLIST.md`.
