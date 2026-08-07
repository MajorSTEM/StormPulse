YOU CAN VISIT THE REAL-TIME TRACKER HERE: https://stormpulse-frontend.onrender.com
![NWS Alert with Inferred Layer](https://github.com/MajorSTEM/StormPulse/blob/main/StormPulse_Addon2.png)
![NWS_Alert_Tab](https://github.com/MajorSTEM/StormPulse/blob/main/StormPulse_NWS_Alerts.png)

# StormPulse — Tornado Response Map

Open-source tornado damage mapping platform. Ingests NOAA/NWS public data and generates probable damage corridors for emergency responders.

If you find StormPulse useful or even interesting, consider supporting development on Ko-fi.

StormPulse is built independeltly using publicly available NOAA/NWS data with the goal of making severe weather information even more accessible and transparent. 

☕ Support the project on Ko-fi:
https://ko-fi.com/majorstem



## Quick Start

### Docker (entire platform, one command)

```bash
docker compose up --build
```

Map at http://localhost:3000 · API docs at http://localhost:8000/docs
(see docs/DEPLOYMENT.md).

### Backend (manual)

```bash
cd backend
python -m venv venv
venv\Scripts\activate        # Windows
pip install -r requirements.txt
cp .env.example .env
python run.py
```

Backend runs at http://localhost:8000 — API docs at http://localhost:8000/docs

### Frontend (manual)

```bash
cd frontend
npm install
npm run dev
```

Frontend runs at http://localhost:3000

## V2 API (versioned + authenticated)

All data routes live under `/api/v1` and require a client API key:

```bash
curl -H "Authorization: Bearer stormpulse-demo-key" \
     "http://localhost:8000/api/v1/corridors?hours=48"
```

- Protected routes return **401** without a valid key; `/api/v1/health` is
  intentionally public.
- Per-client rate limiting returns **429** on abuse.
- Every payload carries `stale`/`data_as_of` freshness meta; inferred (T3)
  corridors carry an explicit `disclaimer` field.
- Issue real client keys via the `API_KEYS` environment variable
  (docs/DEPLOYMENT.md).

## Data Sources

- **NWS Alerts API** — api.weather.gov (free, no key required)
- **NWS LSR ArcGIS** — services9.arcgis.com/RHVPKKiFTONKtxq3 (free, no key required)

No API keys needed for the MVP.

## Architecture

- **Backend**: Python FastAPI + PostgreSQL (SQLite for dev) + APScheduler + Shapely
- **Frontend**: Next.js 14 + TypeScript + MapLibre GL + Tailwind
- **Ingestion**: Polls NWS every 5 minutes (configurable)
- **Corridor Engine v2**: Motion-aware track reconstruction + weighted confidence scoring

Full documentation:

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — system architecture and data flow
- [docs/CONFIDENCE_SCORING.md](docs/CONFIDENCE_SCORING.md) — weighted T1/T2/T3 methodology (validated 20/20 on historical events)
- [docs/OWASP_API_CHECKLIST.md](docs/OWASP_API_CHECKLIST.md) — API security review
- [docs/NIST-800-53-MAPPING.md](docs/NIST-800-53-MAPPING.md) — security control mapping
- [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) — Docker + Render deployment
- [docs/ACCEPTANCE_CHECKLIST.md](docs/ACCEPTANCE_CHECKLIST.md) — requirements → evidence

## Confidence Tiers

| Tier | Label | Source |
|------|-------|--------|
| T1 | Official Confirmed | NWS damage survey or confirmed tornado LSR |
| T2 | Official Near-Real-Time | Active NWS alert or unconfirmed LSR |
| T3 | Inferred | System-generated corridor estimate (always carries a disclaimer) |

Tier assignment is a deterministic weighted model — see docs/CONFIDENCE_SCORING.md.

## Disclaimer

Inferred corridors are system-generated probable damage estimates. They are NOT official NWS damage surveys. Always follow official emergency guidance.



## License

AGPLv3
