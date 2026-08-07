"""
Loaders for the historical tornado archive.

- SPC tornado database (1950-2024): one-time bulk load of the ~8 MB CSV
  (~72k rows — every recorded US tornado); skipped once populated.
- NWS Damage Assessment Toolkit (2025-present): refreshed on every run so
  newly surveyed tornadoes appear; provides full multi-vertex tracks,
  surveyed max wind, damage figures, and surveyor remarks.
"""
import csv
import io
import json
import logging
from datetime import datetime, timezone

import httpx
from sqlalchemy import delete, func, insert, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.tornado_history import TornadoHistory

logger = logging.getLogger(__name__)

SPC_HISTORY_URL = "https://www.spc.noaa.gov/wcm/data/1950-2024_actual_tornadoes.csv"
#: First year NOT covered by the SPC bulk archive — DAT fills from here on.
DAT_FROM_YEAR = 2025
DAT_QUERY_URL = (
    "https://services.dat.noaa.gov/arcgis/rest/services/"
    "nws_damageassessmenttoolkit/DamageViewer/FeatureServer/1/query"
)
BATCH_SIZE = 1000


def _f(value: str, default: float = 0.0) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _i(value: str, default: int = 0) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


async def load_tornado_history(db: AsyncSession, force: bool = False) -> dict:
    """Populate tornado_history from the SPC CSV. Idempotent: skips when the
    table already has data unless force=True."""
    existing = (await db.execute(
        select(func.count()).select_from(TornadoHistory)
    )).scalar() or 0
    if existing > 0 and not force:
        return {"loaded": 0, "skipped": True, "existing_rows": existing}

    logger.info("Downloading SPC historical tornado database...")
    async with httpx.AsyncClient(timeout=120) as client:
        response = await client.get(
            SPC_HISTORY_URL, headers={"User-Agent": settings.nws_user_agent}
        )
        response.raise_for_status()

    reader = csv.DictReader(io.StringIO(response.text))
    rows: list[dict] = []
    loaded = 0
    for row in reader:
        slat, slon = _f(row.get("slat")), _f(row.get("slon"))
        if slat == 0.0 and slon == 0.0:
            continue  # no usable location
        rows.append({
            "om": _i(row.get("om")),
            "year": _i(row.get("yr")),
            "date": (row.get("date") or "").strip(),
            "time": (row.get("time") or "").strip(),
            "state": (row.get("st") or "").strip().upper(),
            "ef": _i(row.get("mag"), default=-9),
            "injuries": _i(row.get("inj")),
            "fatalities": _i(row.get("fat")),
            "loss": _f(row.get("loss")),
            "start_lat": slat,
            "start_lon": slon,
            "end_lat": _f(row.get("elat")),
            "end_lon": _f(row.get("elon")),
            "length_mi": _f(row.get("len")),
            "width_yd": _f(row.get("wid")),
            "source": "SPC",
        })
        if len(rows) >= BATCH_SIZE:
            await db.execute(insert(TornadoHistory), rows)
            loaded += len(rows)
            rows = []
    if rows:
        await db.execute(insert(TornadoHistory), rows)
        loaded += len(rows)
    await db.commit()

    logger.info(f"Tornado history loaded: {loaded} rows")
    return {"loaded": loaded, "skipped": False, "existing_rows": existing}


# ── NWS DAT: recent (2025-present) surveyed tornado tracks ───────────────────

#: NWS forecast office -> states its county warning area covers. Used to make
#: the state filter work for DAT rows (the DAT schema carries only the WFO).
WFO_STATES: dict[str, str] = {
    # Eastern
    "CAR": "ME", "GYX": "ME,NH", "BOX": "MA,RI,CT", "BTV": "VT,NY",
    "ALY": "NY,MA,VT", "BGM": "NY,PA", "BUF": "NY", "OKX": "NY,NJ,CT",
    "PHI": "PA,NJ,DE,MD", "PBZ": "PA,OH,WV", "CTP": "PA",
    "LWX": "DC,MD,VA,WV", "RNK": "VA,NC,WV", "AKQ": "VA,NC", "MHX": "NC",
    "RAH": "NC", "ILM": "NC,SC", "CAE": "SC", "CHS": "SC,GA",
    "GSP": "SC,NC,GA", "FFC": "GA", "JAX": "FL,GA", "KEY": "FL",
    "MLB": "FL", "MFL": "FL", "TBW": "FL", "TAE": "FL,GA,AL",
    "BMX": "AL", "HUN": "AL,TN", "MOB": "AL,MS,FL", "JAN": "MS,LA,AR",
    "MEG": "TN,MS,AR,MO", "OHX": "TN", "MRX": "TN,VA,NC", "JKL": "KY",
    "LMK": "KY,IN", "PAH": "KY,IL,MO,IN,TN", "ILN": "OH,KY,IN",
    "CLE": "OH,PA", "RLX": "WV,OH,KY,VA",
    # Central
    "DTX": "MI", "APX": "MI", "GRR": "MI", "MQT": "MI",
    "IWX": "IN,MI,OH", "IND": "IN", "LOT": "IL,IN", "ILX": "IL",
    "DVN": "IA,IL,MO", "DMX": "IA", "ARX": "WI,MN,IA", "MKX": "WI",
    "GRB": "WI", "DLH": "MN,WI", "MPX": "MN,WI", "FGF": "ND,MN",
    "BIS": "ND", "ABR": "SD,MN", "FSD": "SD,IA,MN,NE", "UNR": "SD,WY,NE",
    "LSX": "MO,IL", "SGF": "MO", "EAX": "MO,KS", "TOP": "KS",
    "ICT": "KS", "DDC": "KS", "GLD": "KS,CO,NE", "LBF": "NE",
    "OAX": "NE,IA", "GID": "NE,KS", "CYS": "WY,NE", "RIW": "WY",
    "BYZ": "MT,WY", "TFX": "MT", "GGW": "MT", "MSO": "MT,ID",
    # Southern
    "LZK": "AR", "TSA": "OK,AR", "OUN": "OK,TX", "AMA": "TX,OK",
    "LUB": "TX", "MAF": "TX,NM", "SJT": "TX", "FWD": "TX", "HGX": "TX",
    "CRP": "TX", "BRO": "TX", "EWX": "TX", "EPZ": "TX,NM", "ABQ": "NM",
    "SHV": "LA,AR,TX,OK", "LCH": "LA,TX", "LIX": "LA,MS",
    # Western
    "SEW": "WA", "OTX": "WA,ID", "PDT": "OR,WA", "PQR": "OR,WA",
    "MFR": "OR,CA", "EKA": "CA", "STO": "CA", "MTR": "CA", "HNX": "CA",
    "LOX": "CA", "SGX": "CA", "PSR": "AZ", "TWC": "AZ", "FGZ": "AZ",
    "VEF": "NV,AZ,CA", "LKN": "NV", "REV": "NV,CA", "SLC": "UT",
    "GJT": "CO,UT", "BOU": "CO", "PUB": "CO", "BOI": "ID,OR", "PIH": "ID",
    # Alaska / Pacific / Caribbean
    "AFC": "AK", "AFG": "AK", "AJK": "AK", "HFO": "HI", "SJU": "PR",
    "GUM": "GU",
}


def _epoch_ms_to_dt(ms) -> datetime | None:
    try:
        return datetime.fromtimestamp(ms / 1000, tz=timezone.utc)
    except (TypeError, ValueError, OSError):
        return None


async def load_recent_tornadoes(db: AsyncSession) -> dict:
    """
    Refresh 2025-present tornado tracks from the NWS Damage Assessment
    Toolkit. Replaces all previous DAT rows each run so late-arriving surveys
    and rating updates flow through.
    """
    features: list[dict] = []
    offset = 0
    async with httpx.AsyncClient(timeout=90) as client:
        while True:
            response = await client.get(DAT_QUERY_URL, params={
                "where": f"stormdate >= TIMESTAMP '{DAT_FROM_YEAR}-01-01 00:00:00'",
                "outFields": ("event_id,stormdate,starttime,endtime,startlat,"
                              "startlon,endlat,endlon,length,width,injuries,"
                              "fatalities,efnum,maxwind,propdamage,comments,wfo"),
                "returnGeometry": "true",
                "geometryPrecision": "4",
                "outSR": "4326",
                "orderByFields": "objectid",
                "resultOffset": str(offset),
                "resultRecordCount": "1000",
                "f": "geojson",
            })
            response.raise_for_status()
            page = response.json().get("features", [])
            features.extend(page)
            if len(page) < 1000:
                break
            offset += len(page)

    rows: list[dict] = []
    for feature in features:
        attrs = feature.get("properties", {})
        slat, slon = attrs.get("startlat"), attrs.get("startlon")
        if not slat or not slon:
            continue
        storm_dt = _epoch_ms_to_dt(attrs.get("stormdate"))
        start_dt = _epoch_ms_to_dt(attrs.get("starttime")) or storm_dt
        end_dt = _epoch_ms_to_dt(attrs.get("endtime"))
        if storm_dt is None:
            continue
        ef = attrs.get("efnum")
        max_wind = attrs.get("maxwind")
        geometry = feature.get("geometry")
        rows.append({
            "om": 0,
            "year": storm_dt.year,
            "date": storm_dt.strftime("%Y-%m-%d"),
            "time": start_dt.strftime("%H:%M") if start_dt else "",
            "state": WFO_STATES.get((attrs.get("wfo") or "").upper(), ""),
            "ef": ef if isinstance(ef, int) and 0 <= ef <= 5 else -9,
            "injuries": attrs.get("injuries") or 0,
            "fatalities": attrs.get("fatalities") or 0,
            "loss": 0.0,
            "start_lat": slat,
            "start_lon": slon,
            "end_lat": attrs.get("endlat") or 0.0,
            "end_lon": attrs.get("endlon") or 0.0,
            "length_mi": round(attrs.get("length") or 0.0, 2),
            "width_yd": attrs.get("width") or 0.0,
            "source": "NWS DAT",
            "end_time": end_dt.strftime("%H:%M") if end_dt else None,
            "max_wind_mph": max_wind if isinstance(max_wind, (int, float)) and max_wind > 0 else None,
            "prop_damage": attrs.get("propdamage") or None,
            "remarks": ((attrs.get("event_id") or "").strip() + " — " if attrs.get("event_id") else "")
                       + (attrs.get("comments") or "").strip() or None,
            "path_geojson": json.dumps(geometry) if geometry else None,
        })

    await db.execute(delete(TornadoHistory).where(TornadoHistory.source == "NWS DAT"))
    for i in range(0, len(rows), BATCH_SIZE):
        await db.execute(insert(TornadoHistory), rows[i:i + BATCH_SIZE])
    await db.commit()

    logger.info(f"DAT recent tornadoes refreshed: {len(rows)} tracks since {DAT_FROM_YEAR}")
    return {"loaded": len(rows), "from_year": DAT_FROM_YEAR}
