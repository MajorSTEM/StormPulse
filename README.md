# StormPulse — Tornado Response Map

Open-source tornado damage mapping platform. Ingests NOAA/NWS public data and generates probable damage corridors for emergency responders.

If you find StormPulse useful or even interesting, consider supporting development on Ko-fi.

StormPulse is built independeltly using publicly available NOAA/NWS data with the goal of making severe weather information even more accessible and transparent. 

☕ Support the project on Ko-fi:
https://ko-fi.com/majorstem



## Quick Start

### Backend

```bash
cd backend
python -m venv venv
venv\Scripts\activate        # Windows
pip install -r requirements.txt
cp .env.example .env
python run.py
```

Backend runs at http://localhost:8000
API docs at http://localhost:8000/docs

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend runs at http://localhost:3000

## Data Sources

- **NWS Alerts API** — api.weather.gov (free, no key required)
- **NWS LSR ArcGIS** — services9.arcgis.com/RHVPKKiFTONKtxq3 (free, no key required)

No API keys needed for the MVP.

## Architecture

- **Backend**: Python FastAPI + SQLite + APScheduler + Shapely
- **Frontend**: Next.js 14 + TypeScript + MapLibre GL + Tailwind
- **Ingestion**: Polls NWS every 5 minutes (configurable)
- **Corridor Engine**: Rules-based clustering + confidence scoring

## Confidence Tiers

| Tier | Label | Source |
|------|-------|--------|
| T1 | Official Confirmed | NWS confirmed tornado LSR |
| T2 | Official Near-Real-Time | Active NWS alert or unconfirmed LSR |
| T3 | Inferred | System-generated corridor estimate |

## Disclaimer

Inferred corridors are system-generated probable damage estimates. They are NOT official NWS damage surveys. Always follow official emergency guidance.



## License

AGPLv3
