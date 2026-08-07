# StormPulse V2 — Deployment Guide

Two supported deployment paths, both free-tier compatible:

1. **Render** (current production hosting) — backend web service, frontend
   web service, managed Postgres.
2. **Local containerized (Docker)** — the documented contingency path: the
   full platform can be brought up off-Render **within one business day**
   (in practice: minutes) on any machine with Docker.

---

## 1. Local containerized deployment (Docker)

Prerequisites: Docker (with Compose v2). From the repo root:

```bash
docker compose up --build
```

That's the whole procedure. It builds both images and starts:

| Service | URL | Notes |
|---------|-----|-------|
| Map frontend | http://localhost:3000 | Tier labels, T3 disclaimers, staleness banner |
| API | http://localhost:8000/api/v1 | Bearer auth (demo key: `stormpulse-demo-key`) |
| API docs | http://localhost:8000/docs | Versioned routes with auth padlocks |

The backend uses SQLite on a named volume (`stormpulse-data`) — no external
database needed. Ingestion starts immediately; live NWS data appears within
~1 minute.

Smoke test:

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8000/api/v1/alerts          # 401
curl -s -H "Authorization: Bearer stormpulse-demo-key" \
     http://localhost:8000/api/v1/alerts | head -c 300                                 # 200 + GeoJSON
```

To issue real client keys or change limits, edit the `environment:` block in
`docker-compose.yml` (see "Configuration" below) and `docker compose up -d`.

## 2. Render deployment (production)

Two Render services build from this repository:

**Backend — Web Service**
- Root directory: `backend`
- Build: `pip install -r requirements.txt`
- Start: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
- Environment variables:

| Variable | Value |
|----------|-------|
| `DATABASE_URL` | Render Postgres connection string (any `postgres://` scheme works; the app normalizes to `asyncpg` and requires SSL) |
| `CORS_ORIGINS` | `["https://stormpulse-frontend.onrender.com"]` |
| `API_KEYS` | `<long-random-key>:nexalert,stormpulse-demo-key:public-demo` |
| `RATE_LIMIT` | `120/minute` (per client) |
| `STALE_THRESHOLD_SECONDS` | `900` |
| `NWS_USER_AGENT` | `StormPulse/2.0 <contact email>` |

**Frontend — Web Service (Node)**
- Root directory: `frontend`
- Build: `npm install && npm run build` · Start: `npm start`
- Environment variables (build-time):

| Variable | Value |
|----------|-------|
| `NEXT_PUBLIC_API_URL` | backend service URL, e.g. `https://stormpulse-backend.onrender.com` |
| `NEXT_PUBLIC_API_KEY` | the public demo key (default `stormpulse-demo-key`) |

Pushes to `main` auto-deploy both services. **Backward-compatibility note:**
V2 removed the unversioned `/api/*` routes, so backend and frontend must both
be on a V2 deploy — deploying from the same commit (the default) guarantees
this. If `API_KEYS`/`NEXT_PUBLIC_API_KEY` are not set, both sides fall back
to the same published demo key, so the public map keeps working out of the box.

## Configuration reference

All backend configuration is environment-driven (`backend/app/config.py`;
template: `backend/.env.example`):

| Variable | Default | Purpose |
|----------|---------|---------|
| `DATABASE_URL` | `sqlite+aiosqlite:///./stormpulse.db` | SQLAlchemy async URL; Postgres in prod |
| `API_KEYS` | `stormpulse-demo-key:public-demo` | Comma-separated `key:client_name` pairs |
| `RATE_LIMIT` | `120/minute` | Per-client limit (slowapi syntax) |
| `STALE_THRESHOLD_SECONDS` | `900` | Data age that triggers `stale: true` + UI banner |
| `INGEST_INTERVAL_SECONDS` | `300` | Upstream polling cadence |
| `CORS_ORIGINS` | localhost dev ports | JSON list of allowed origins |
| `ENABLE_SCHEDULER` | `true` | Disable for tests/one-off tasks |

### Key management (IA-5)

- Issue: generate a long random string (`openssl rand -hex 32`), append
  `:<client_name>` to `API_KEYS`, restart the service.
- Rotate/revoke: remove the pair from `API_KEYS`, restart. 401 takes effect
  immediately; the client's rate bucket disappears with it.
- The demo key is intentionally public (it ships in the browser bundle) and
  should be treated as an anonymous-tier credential: read-only routes, its own
  rate bucket, revocable at any time without affecting named clients.

## Verification after any deploy

1. `GET /api/v1/alerts` without a token → **401**.
2. Same with a valid key → **200**, `meta.stale` present.
3. `GET /docs` → only `/api/v1/*` routes, padlocks on alerts/lsr/corridors.
4. Frontend map shows tier labels on corridors and the T3 disclaimer in the
   provenance panel; staleness banner appears only during upstream outages.
5. `cd backend && python -m pytest tests/` → 58 passing.
