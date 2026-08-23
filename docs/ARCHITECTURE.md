# StormPulse — Architecture & Component Communication

How every piece talks to every other piece, and where to look when something
breaks. Kept current as of August 2026 (V2 + Historian + prediction + outage
platform + safety guide). A Visio diagram of the original V2 data flow exists
in the capstone package; this document is the maintained source of truth.

## The big picture

```
 UPSTREAM (public, unauthenticated)          BACKEND (FastAPI, Render)                FRONTEND (Next.js, Render)
 ─────────────────────────────────          ─────────────────────────────            ──────────────────────────
 api.weather.gov  (NWS alerts) ──┐
 spc.noaa.gov     (storm reports)├─▶ APScheduler jobs ─▶ PostgreSQL ─▶ /api/v1/* ─▶ fetch() in lib/api.ts ─▶ React state ─▶ MapLibre layers
 services.dat.noaa.gov (surveys) │    (scheduler.py)     (Supabase)     (auth +        (bearer demo key)      (page.tsx)     (Map.tsx)
 spc.noaa.gov/wcm (1950-2024 db) ┘                                      rate limit)
 nipsco.com/nisource-api ────────┐
 kubra.io (ComEd StormCenter) ───┴─▶ outage poll ─▶ in-memory snapshot ─▶ /api/v1/outages/live ─▶ OutagePanel + outage layers
 gibs.earthdata.nasa.gov (night tiles) ─────────────────────────────────────────────────────────▶ Map.tsx raster layer (browser-direct)
```

Three transport rules to remember:
1. **The browser talks only to the backend API and public tile servers** —
   never to NWS/NIPSCO/Kubra directly (except map tiles: OSM, ESRI, NASA).
2. **The backend talks to upstreams only inside scheduled jobs** — never
   during a user request (single exception: the outage cold-boot warmup).
3. **The database is the buffer between them.** Ingestion writes; API reads.
   If every upstream dies, the API keeps serving the last good data with
   `stale: true` — that is the cache-fallback contingency, not an accident.

## Backend components and who calls them

### 1. The scheduler is the heartbeat — `app/ingestion/scheduler.py`
Everything periodic starts here. `main.py` registers three jobs at boot:

| Job | Cadence | What it does |
|---|---|---|
| `run_ingestion_cycle` | 5 min | NWS alerts → `alerts` table; SPC reports → `lsrs` table; then Corridor Engine v2 rebuilds `corridors`; then persists per-source status to `ingestion_state` |
| `run_outage_poll` | 5 min | NIPSCO + ComEd live outages → **in-memory snapshot** (no DB) |
| `run_history_load` | 24 h | One-time SPC 1950–2024 bulk load (skips when populated) + refresh of 2025-present NWS DAT survey tracks |

Every job wraps each step in try/except and records the outcome in the
module-level `ingestion_status` dict. **That dict is the nervous system**:
`/api/v1/health` reads it, the SCADA chips in the top bar render it, and
`data_freshness()` derives the `stale` flag on every data payload from it.

### 2. Ingestion writes, the engine derives — `app/ingestion/`, `app/corridor/`
- `nws_alerts.py`, `nws_lsr.py` — parse upstream feeds defensively (per-row
  try/except, coordinate checks, timeouts, page caps) and upsert rows.
  Tier assignment is delegated to `app/scoring/confidence.py` — **no tier
  string is hardcoded anywhere else**.
- `corridor/engine.py` — pure derivation: reads `lsrs` + `alerts`, chains
  reports by storm-physics constraints, fits motion, writes `corridors`.
- `corridor/prediction.py` — pure math, no I/O: the corridors API calls it at
  serialization time to build the forward cone from stored motion data.
- `tornado_history.py` — SPC bulk CSV + DAT ArcGIS pagination → `tornado_history`.
- `outages_nipsco.py` / `outages_comed.py` / `outages_live.py` — the two
  fetchers return plain dicts; the orchestrator merges them into the
  singleton snapshot under a lock. NIPSCO failing fails the poll (visible in
  health); ComEd failing only logs. The snapshot is **replaced wholesale**
  each poll — that is why restored areas vanish without delete logic.

### 3. The API layer is read-only glue — `app/api/`, `app/security.py`
Routers never compute anything heavy: they query one table (or read the
outage snapshot), serialize explicitly field-by-field, attach freshness
meta, and return. Auth (`require_api_key`, constant-time), per-client/IP
rate limiting (slowapi), and security headers are applied in `main.py` /
`security.py` — routers stay clean of it.

### 4. The database — Supabase Postgres
Tables: `alerts`, `lsrs`, `corridors`, `tornado_history`, `ingestion_state`.
Startup runs idempotent `CREATE TABLE` / `ADD COLUMN IF NOT EXISTS`
migrations and **tolerates a dead DB**: it boots degraded, reports through
health, and each ingestion cycle retries `init_db()` until it heals.

## Frontend components and who owns what

- `lib/api.ts` — the only place that knows the API base URL and demo key.
  Every fetch goes through here.
- `app/page.tsx` — the state owner. Polls alerts/LSRs/corridors every 2 min,
  outages every 2 min while visible; owns all cross-cutting state
  (dismissed/acked feeds, layer toggles, basemap, selected features, zip
  results) and passes plain props down.
- `components/Map.tsx` — the render sink. Receives FeatureCollections as
  props, pushes them into MapLibre sources; layer styling/visibility
  reacts to `layers`, `basemap`, `realisticOutages`. Emits `onFeatureClick`
  back up. Never fetches.
- Panels (`IncidentSidebar`, `OutagePanel`, `HistoryPanel`,
  `ProvenancePanel`, `LayerControls`, `SourceHealthBar`) — presentational;
  they receive data + callbacks from page.tsx and never fetch on their own
  (exception: `SourceHealthBar` polls `/health` itself every 60 s).
- `/safety` — fully static; talks to nothing.

## When something breaks — where to look

| Symptom | First place to look | Likely story |
|---|---|---|
| Map loads, no data anywhere | Top-bar chips / `/api/v1/health` | Backend down or DB unreachable (boots degraded; `last_error` per source, full detail in Render logs) |
| Red STALE banner | `health.freshness` + Render logs for `run_ingestion_cycle` | Upstream NWS/SPC outage or ingestion exception; API is serving cache by design |
| One source chip DEGRADED/STALE, rest GOOD | That source's `last_error` in health | Single upstream feed changed/failed — check its module in `app/ingestion/` |
| Outage console empty / "feed unreachable" | Render logs for `Live outages:` lines | NIPSCO changed the `nisource-api` path (re-point `OUTAGE_FEED_URL` env) or blocked the UA |
| ComEd shows but no ComEd dots / vice-versa | Logs: `ComEd feed unavailable` warning | Kubra rotated its data-path scheme — `outages_comed.py` is the only file involved |
| 401s in browser console | `NEXT_PUBLIC_API_KEY` (frontend build) vs `API_KEYS` (backend env) | Key mismatch after env change — both must share the demo key |
| 429s for many users | `security.py` rate limiting | Either real abuse or the proxy stopped appending X-Forwarded-For |
| Corridors missing but LSRs present | Logs: `Corridor Engine v2:` line | Engine exception or genuinely no chains met thresholds (not a bug) |
| Historian empty for 2025+ | Logs: `Tornado history (DAT):` | DAT ArcGIS service change — `tornado_history.py:load_recent_tornadoes` |
| Night basemap grey | Browser console CORS/tile errors | NASA GIBS hiccup — purely cosmetic, data layers unaffected |
| House-icon page (`/safety`) broken | It's static — only a frontend build/deploy issue | Check Render frontend deploy logs |

**Golden debugging path:** top-bar chips → `/api/v1/health` (which source,
what sanitized error) → Render backend logs (full detail) → the one
ingestion module that owns that source. Data problems are almost always in
exactly one fetcher; rendering problems are almost always in `Map.tsx` prop
wiring; auth/rate problems live in `security.py` + env vars.
