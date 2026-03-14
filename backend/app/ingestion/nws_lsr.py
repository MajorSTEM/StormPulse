import httpx
import csv
import io
import hashlib
import logging
from datetime import datetime, timezone, timedelta, date
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.models.lsr import LSR
from app.config import settings

logger = logging.getLogger(__name__)

# SPC Storm Reports CSVs — updated continuously, no auth required
SPC_BASE = "https://www.spc.noaa.gov/climo/reports"

REPORT_TYPES = {
    "torn": {"type_code": "T", "type_description": "Tornado"},
    "wind": {"type_code": "W", "type_description": "Wind Damage"},
    "hail": {"type_code": "H", "type_description": "Hail"},
}


def spc_date_urls(hours_back: int) -> list[tuple[str, str, str]]:
    """
    Return list of (url, type_code, type_description) for SPC CSV files
    covering the past `hours_back` hours.
    SPC uses 'today' and 'yesterday' files plus YYMMDD-named archives.
    """
    urls = []
    now = datetime.now(timezone.utc)
    days_needed = set()
    days_needed.add("today")
    if hours_back > 12:
        days_needed.add("yesterday")
    # Add specific dates for longer windows
    for h in range(0, hours_back + 24, 24):
        d = (now - timedelta(hours=h)).date()
        days_needed.add(d.strftime("%y%m%d"))

    for day_key in days_needed:
        for report_type, meta in REPORT_TYPES.items():
            url = f"{SPC_BASE}/{day_key}_{report_type}.csv"
            urls.append((url, meta["type_code"], meta["type_description"]))

    return urls


async def fetch_spc_csv(client: httpx.AsyncClient, url: str) -> list[dict]:
    """Fetch and parse a SPC storm report CSV. Returns list of row dicts."""
    try:
        response = await client.get(url, timeout=20)
        if response.status_code == 404:
            return []  # Date file doesn't exist yet, normal
        response.raise_for_status()
        text = response.text
        if not text.strip():
            return []
        reader = csv.DictReader(io.StringIO(text))
        return list(reader)
    except Exception as e:
        logger.warning(f"Could not fetch {url}: {e}")
        return []


def parse_spc_time(row: dict, report_date: date | None = None) -> datetime | None:
    """Parse SPC time field (HHMM UTC) into a datetime."""
    time_str = row.get("Time", "").strip()
    if not time_str or not time_str.isdigit():
        return None
    try:
        hour = int(time_str[:2])
        minute = int(time_str[2:]) if len(time_str) >= 4 else 0
        base = report_date or date.today()
        return datetime(base.year, base.month, base.day, hour, minute, tzinfo=timezone.utc)
    except Exception:
        return None


async def ingest_lsrs(db: AsyncSession, hours_back: int = 48) -> dict:
    """Fetch Local Storm Reports from SPC Storm Reports CSVs."""
    headers = {
        "User-Agent": settings.nws_user_agent,
        **({"token": settings.noaa_api_key} if settings.noaa_api_key else {}),
    }

    ingested = 0
    skipped = 0
    errors = []
    cutoff = datetime.now(timezone.utc) - timedelta(hours=hours_back)

    urls = spc_date_urls(hours_back)

    async with httpx.AsyncClient(headers=headers, timeout=30) as client:
        for url, type_code, type_description in urls:
            rows = await fetch_spc_csv(client, url)
            if not rows:
                continue

            # Infer date from URL (today/yesterday/YYMMDD)
            day_key = url.split("/")[-1].split("_")[0]
            report_date = None
            if day_key not in ("today", "yesterday"):
                try:
                    report_date = datetime.strptime(day_key, "%y%m%d").date()
                except ValueError:
                    pass

            for row in rows:
                try:
                    lat_str = row.get("Lat", "").strip()
                    lon_str = row.get("Lon", "").strip()
                    if not lat_str or not lon_str:
                        continue
                    lat = float(lat_str)
                    lon = float(lon_str)
                    if lat == 0 and lon == 0:
                        continue

                    event_time = parse_spc_time(row, report_date)

                    # Filter by time window
                    if event_time and event_time < cutoff:
                        continue

                    # Stable ID
                    raw_id = f"{url}-{lat}-{lon}-{row.get('Time','')}"
                    lsr_id = hashlib.md5(raw_id.encode()).hexdigest()

                    result = await db.execute(select(LSR).where(LSR.id == lsr_id))
                    if result.scalar_one_or_none():
                        skipped += 1
                        continue

                    # Magnitude from F_Scale or Size
                    mag_raw = row.get("F_Scale", row.get("Size", "")).strip()
                    magnitude = None
                    mag_units = None
                    if mag_raw and mag_raw not in ("EF?", "UNK", "", "N/A"):
                        try:
                            magnitude = float(mag_raw.replace("EF", "").replace("F", ""))
                            mag_units = "EF Scale" if type_code == "T" else "MPH" if type_code == "W" else "IN"
                        except ValueError:
                            pass

                    lsr = LSR(
                        id=lsr_id,
                        type_code=type_code,
                        type_description=type_description,
                        magnitude=magnitude,
                        magnitude_units=mag_units,
                        latitude=lat,
                        longitude=lon,
                        city=row.get("Location", "").strip(),
                        county=row.get("County", "").strip(),
                        state=row.get("State", "").strip(),
                        remark=row.get("Comments", "").strip(),
                        event_time=event_time,
                        source_type="SPC Storm Reports",
                        wfo="",
                        raw_payload=str(row),
                        confidence_tier="T1" if type_code == "T" else "T2",
                    )
                    db.add(lsr)
                    ingested += 1

                except Exception as e:
                    logger.warning(f"Error processing SPC row: {e} — {row}")
                    errors.append(str(e))
                    continue

    await db.commit()
    logger.info(f"LSRs ingested: {ingested}, skipped (duplicate): {skipped}")
    return {"ingested": ingested, "skipped": skipped, "errors": errors[:5]}
