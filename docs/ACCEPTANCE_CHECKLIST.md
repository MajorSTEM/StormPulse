# StormPulse V2 — Acceptance Checklist

Every requirement from the V2 implementation brief mapped to its evidence.
Test names refer to `backend/tests/`; run `cd backend && python -m pytest tests/`
(58 tests) and `python scripts/validate_scoring.py` to reproduce.

## Deliverable 1 — Weighted T1/T2/T3 confidence scoring

| Requirement | Status | Evidence |
|-------------|--------|----------|
| Tier logic extracted into a dedicated, documented scoring module | ✅ | `backend/app/scoring/confidence.py`; ingestion + engine import it (no hardcoded tiers — grep `confidence_tier=` shows only scoring-module calls) |
| Explicit weighted model: enumerated signals, named weights, thresholds | ✅ | `SIGNAL_WEIGHTS`, `T1_THRESHOLD`/`T2_THRESHOLD`, dominant-signal rule in `confidence.py`; documented in `docs/CONFIDENCE_SCORING.md` §2–3 |
| Deterministic and reproducible — same inputs, same tier | ✅ | Pure functions, no I/O/clock/randomness; tests `test_deterministic_same_inputs_same_output`, `test_confidence_is_deterministic` |
| `docs/CONFIDENCE_SCORING.md` with rules, weights, thresholds, one worked example per tier | ✅ | `docs/CONFIDENCE_SCORING.md` (worked examples §4: Greenfield T1, Selma T2, Bremen T3) |
| `scripts/validate_scoring.py` + 20-event historical fixture set, reports alignment % | ✅ | `scripts/validate_scoring.py`, `scripts/fixtures/historical_events.json` (20 events, 2011–2024) |
| **Acceptance: ≥ 85% tier alignment** | ✅ **100%** (20/20) | Script output; exits non-zero below 85% |
| Unit tests for the scoring module | ✅ | `backend/tests/test_confidence.py` (41 tests) |

## Deliverable 2 — Hardened API layer

| Requirement | Status | Evidence |
|-------------|--------|----------|
| Token-based auth on all protected endpoints | ✅ | `backend/app/security.py:require_api_key`; router wiring in `backend/app/main.py` |
| Public read-only routes explicitly enumerated | ✅ | `/` and `/api/v1/health` only — documented in `main.py` comment + `docs/OWASP_API_CHECKLIST.md` route inventory |
| **Acceptance: protected routes return 401 without a valid token** | ✅ | `test_protected_route_without_token_is_401`, `..._invalid_token_is_401`; live check: `curl /api/v1/alerts` → 401 |
| Per-client rate limiting (slowapi) | ✅ | `backend/app/security.py:limiter` (keyed by client name / IP) |
| **Acceptance: sustained abuse returns 429** | ✅ | `test_sustained_abuse_returns_429`, `test_rate_limit_buckets_are_per_client` |
| All routes versioned under `/v1`; frontend calls updated | ✅ | `main.py` mounts `/api/v1`; `frontend/src/lib/api.ts` uses `/api/v1` + bearer header; legacy routes 404 (`test_unversioned_legacy_routes_are_gone`) |
| **Acceptance: `/docs` shows only versioned routes with auth padlocks** | ✅ | `test_openapi_shows_only_versioned_api_routes`, `test_protected_routes_carry_security_scheme_in_docs`; screenshot of `/docs` |
| Disclaimer field on every inferred-corridor API payload | ✅ | `disclaimer` + `tier_label` properties in `backend/app/api/corridors.py`; `test_inferred_corridor_payload_carries_disclaimer` |
| Tier labels + disclaimer visible in map UI | ✅ | MapLibre symbol layer `corridors-tier-label` (`frontend/src/components/Map.tsx`), ProvenancePanel tier badges + disclaimer box, LayerControls "T3 INFERRED" sublabel |
| **Acceptance: disclaimer visible in raw API response and live frontend** | ✅ | Raw: `curl /api/v1/corridors` → `properties.disclaimer`; UI: corridor label on map + provenance panel |
| Cache fallback: serve last successful data flagged `stale: true` on upstream failure | ✅ | DB-as-cache + `data_freshness()` (`backend/app/ingestion/scheduler.py`); meta on all data endpoints; persisted `ingestion_state` table |
| Staleness warning in UI | ✅ | Red "STALE DATA" banner in `frontend/src/components/SourceHealthBar.tsx` driven by `/api/v1/health` freshness |
| **Acceptance: simulated outage test — API serves cache + flag, UI shows banner** | ✅ | `test_upstream_outage_serves_cache_with_stale_flag`, `test_fresh_ingestion_clears_stale_flag` |
| OWASP API Security Top 10 pass, results recorded | ✅ | `docs/OWASP_API_CHECKLIST.md` — all 10 categories walked, each tied to a control + test |
| Integration tests: auth 401/200, rate limit 429, versioned routes, cache fallback | ✅ | `backend/tests/test_api_security.py` (17 tests) |

## Deliverable 3 — Documentation package

| Requirement | Status | Evidence |
|-------------|--------|----------|
| NIST SP 800-53 mapping (≥ AC, IA, SC, AU, CP) | ✅ | `docs/NIST-800-53-MAPPING.md` — AC-3/4/6, IA-2/5, SC-5/8/13, AU-2/3/5, CP-2/10 + SI/CM/RA adjuncts |
| Architecture document matching the documented data flow (Visio referenced) | ✅ | `docs/ARCHITECTURE.md` |
| Dockerfile (+ compose) and deployment docs (local container + Render) | ✅ | `backend/Dockerfile`, `frontend/Dockerfile`, `docker-compose.yml`, `docs/DEPLOYMENT.md` |
| Off-Render deployment within one business day | ✅ | `docker compose up --build` — single documented command |
| Acceptance checklist mapping requirements to evidence | ✅ | This document |

## Constraints

| Constraint | Status | Evidence |
|-------------|--------|----------|
| Scope locked — no features beyond the three deliverables | ✅ | Diff touches scoring, API hardening, docs, deployment only |
| Free-tier compatible — no paid services | ✅ | slowapi (in-memory), SQLite/Render-free Postgres, no new external services |
| AGPLv3 preserved | ✅ | License unchanged |

## Phase 4 evidence artifacts

1. **GitHub commit history** — feature-named commits (scoring model, validation
   harness, token auth, cache fallback, tier labels, tests, docs, Docker).
2. **Live frontend** — tier labels on corridors, T3 disclaimer in provenance
   panel, staleness banner during outages: https://stormpulse-frontend.onrender.com
3. **FastAPI `/docs`** — only `/api/v1/*` routes, padlock on alerts/lsr/corridors.
