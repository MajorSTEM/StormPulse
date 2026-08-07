# StormPulse V2 — NIST SP 800-53 Rev. 5 Control Mapping

Mapping of implemented StormPulse V2 features to NIST SP 800-53 controls, as
committed in the capstone security documentation deliverable. StormPulse is a
low-impact, read-only public-safety information system (all served data is
derived from public NOAA/NWS feeds); controls are scoped accordingly. See
`docs/ARCHITECTURE.md` for the system diagram and `docs/OWASP_API_CHECKLIST.md`
for the API-layer security review.

| Control | Name | Implementation | Evidence |
|---------|------|----------------|----------|
| **AC-3** | Access Enforcement | Every data route under `/api/v1` enforces client API-key authentication before any query executes; the only public routes are the service banner and the health probe, which expose no weather data. | `backend/app/main.py` (router dependencies), `backend/app/security.py:require_api_key`; test `test_protected_route_without_token_is_401` |
| **AC-4** | Information Flow Enforcement | CORS restricted to configured origins, GET-only methods, enumerated request headers; outbound flows fixed to two hardcoded NOAA origins. | `backend/app/main.py` (CORSMiddleware), `backend/app/ingestion/*` |
| **AC-6** | Least Privilege | Single read-only privilege level over HTTP; ingestion/corridor generation run only in-process and are unreachable via the API. DB credentials live in environment variables scoped to the service. | `docs/OWASP_API_CHECKLIST.md` (API5) |
| **IA-2** | Identification & Authentication (organizational users) | Each API consumer is identified by a named client key (`key:client_name` pairs in `API_KEYS`); the authenticated client identity is attached to the request and drives per-client rate buckets. | `backend/app/security.py`, `backend/app/config.py:api_key_map` |
| **IA-5** | Authenticator Management | Keys are provisioned via environment configuration, never committed to source; rotation = update `API_KEYS` and restart (documented in `docs/DEPLOYMENT.md`). Invalid/missing authenticators receive 401 without echoing the presented value. | `backend/.env.example`, test `test_auth_error_does_not_echo_presented_key` |
| **SC-5** | Denial-of-Service Protection | Per-client rate limiting on every route (slowapi, `RATE_LIMIT`); bounded query windows (`hours` ≤ 168); upstream pagination caps and request timeouts. Sustained abuse ⇒ 429 + Retry-After. | `backend/app/security.py:limiter`; tests `test_sustained_abuse_returns_429`, `test_rate_limit_buckets_are_per_client` |
| **SC-8** | Transmission Confidentiality & Integrity | All public traffic is TLS-terminated by the hosting platform (Render); HSTS is set on every response; upstream NOAA fetches use HTTPS. | `backend/app/security.py:security_headers_middleware` |
| **SC-13** | Cryptographic Protection | TLS 1.2+ provided by platform edge for client and upstream connections; Postgres connections require SSL (`ssl: require`). | `backend/app/database.py` |
| **AU-2 / AU-3** | Event Logging / Content of Audit Records | Structured application logging (timestamp, level, component, message) for every ingestion cycle, corridor generation run, migration, and unhandled error; hosting platform captures and retains the stream. | `backend/app/main.py` (logging config), `backend/app/ingestion/scheduler.py` |
| **AU-5 (adjunct)** | Response to Logging Failures | Ingestion state (including last error per source) is additionally persisted to the `ingestion_state` table and surfaced via `/api/v1/health`, so monitoring survives log-stream loss and restarts. | `backend/app/models/ingestion_state.py` |
| **SI-10** | Information Input Validation | FastAPI/pydantic validation on all query parameters (typed, range-clamped); upstream feed rows parsed defensively with per-row guards and coordinate sanity checks. | `backend/app/api/*.py`, `backend/app/ingestion/nws_lsr.py`; test `test_validation_error_is_bounded_not_verbose` |
| **SI-11** | Error Handling | Generic sanitized 500 responses; stack traces and driver errors logged server-side only. | `backend/app/main.py:unhandled_exception_handler` |
| **CP-2** | Contingency Plan | Documented degraded-mode behavior: on upstream NWS/SPC outage the platform serves locally cached data flagged `stale: true` with a UI staleness banner; on platform outage, the containerized deployment restores service off-Render within one business day. | `docs/DEPLOYMENT.md`, `docs/ARCHITECTURE.md` |
| **CP-10** | System Recovery & Reconstitution | The database is the durable cache of last-known-good data; ingestion state persists across restarts so a rebooted instance immediately reports honest freshness; Docker Compose recreates the full stack from source. | `backend/app/ingestion/scheduler.py:load_persisted_status`; test `test_upstream_outage_serves_cache_with_stale_flag`; `docker-compose.yml` |
| **CM-2 (adjunct)** | Baseline Configuration | Pinned dependency versions (`requirements.txt`, `package-lock.json`), pinned Python runtime, configuration exclusively via documented environment variables. | `backend/requirements.txt`, `backend/.env.example` |
| **RA-5 (adjunct)** | Vulnerability Monitoring | OWASP API Security Top 10 review completed and recorded, with regression tests wired to each finding. | `docs/OWASP_API_CHECKLIST.md`, `backend/tests/test_api_security.py` |

## Notes and inherited controls

- **Physical/environmental (PE), media (MP), personnel (PS) families** are
  inherited from the hosting provider (Render) and are out of scope for this
  application-layer package.
- **Transparency controls:** every system-inferred (T3) product carries a
  disclaimer in both the API payload and the UI, supporting accurate
  information presentation to emergency-response consumers (SI-19-adjacent
  data-quality labeling; see `docs/CONFIDENCE_SCORING.md`).
- Verification: `cd backend && python -m pytest tests/` runs the cited
  regression tests (58 total).
