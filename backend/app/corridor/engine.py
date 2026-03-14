import json
import uuid
import logging
import math
from datetime import datetime, timezone, timedelta
from typing import List, Optional, Tuple
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete
from app.models.lsr import LSR
from app.models.alert import Alert
from app.models.corridor import Corridor

logger = logging.getLogger(__name__)

try:
    from shapely.geometry import Point, MultiPoint, mapping
    from shapely.ops import unary_union
    SHAPELY_AVAILABLE = True
except ImportError:
    SHAPELY_AVAILABLE = False
    logger.warning("Shapely not available - corridor engine disabled")


# ── Event categories ──────────────────────────────────────────────────────────
CATEGORY_TORNADO = "TORNADO"
CATEGORY_WIND = "WIND_DAMAGE"
CATEGORY_SEVERE = "SEVERE_WEATHER"
CATEGORY_FLOOD = "FLOOD_ZONE"

FLOOD_ALERT_TYPES = [
    "Flash Flood Warning", "Flash Flood Watch",
    "Flood Warning", "Flood Advisory",
]

SEVERE_ALERT_TYPES = [
    "Tornado Warning", "Tornado Emergency",
    "Severe Thunderstorm Warning", "Extreme Wind Warning",
    "High Wind Warning",
]


def haversine_km(lat1, lon1, lat2, lon2) -> float:
    R = 6371
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2) ** 2
    return 2 * R * math.asin(math.sqrt(a))


def cluster_lsrs_spatiotemporal(lsrs: List[LSR], max_km: float = 200, max_hours: float = 4) -> List[List[LSR]]:
    if not lsrs:
        return []
    assigned = [False] * len(lsrs)
    clusters = []
    sorted_lsrs = sorted(lsrs, key=lambda x: x.event_time or datetime.min.replace(tzinfo=timezone.utc))
    for i, lsr in enumerate(sorted_lsrs):
        if assigned[i]:
            continue
        cluster = [lsr]
        assigned[i] = True
        for j, other in enumerate(sorted_lsrs):
            if assigned[j] or i == j:
                continue
            dist = haversine_km(lsr.latitude, lsr.longitude, other.latitude, other.longitude)
            if dist > max_km:
                continue
            t1 = lsr.event_time or datetime.min.replace(tzinfo=timezone.utc)
            t2 = other.event_time or datetime.min.replace(tzinfo=timezone.utc)
            if abs((t1 - t2).total_seconds()) / 3600 <= max_hours:
                cluster.append(other)
                assigned[j] = True
        clusters.append(cluster)
    return clusters


def estimate_motion_vector(lsrs: List[LSR]) -> Tuple[Optional[float], Optional[float]]:
    tornado_lsrs = [l for l in lsrs if l.type_code in ("T", "TF", "TW") and l.event_time]
    if len(tornado_lsrs) < 2:
        return None, None
    sorted_lsrs = sorted(tornado_lsrs, key=lambda x: x.event_time)
    first, last = sorted_lsrs[0], sorted_lsrs[-1]
    time_diff_hrs = (last.event_time - first.event_time).total_seconds() / 3600
    if time_diff_hrs < 0.01:
        return None, None
    lat1, lon1 = math.radians(first.latitude), math.radians(first.longitude)
    lat2, lon2 = math.radians(last.latitude), math.radians(last.longitude)
    dlon_rad = lon2 - lon1
    x = math.sin(dlon_rad) * math.cos(lat2)
    y = math.cos(lat1) * math.sin(lat2) - math.sin(lat1) * math.cos(lat2) * math.cos(dlon_rad)
    bearing = (math.degrees(math.atan2(x, y)) + 360) % 360
    dist_km = haversine_km(first.latitude, first.longitude, last.latitude, last.longitude)
    speed_kts = (dist_km / time_diff_hrs) * 0.539957
    return bearing, min(speed_kts, 80)


def build_centerline(lsrs: List[LSR]) -> Optional[dict]:
    tornado_lsrs = sorted(
        [l for l in lsrs if l.type_code in ("T", "TF", "TW") and l.event_time],
        key=lambda l: l.event_time
    )
    if len(tornado_lsrs) < 2:
        return None
    return {"type": "LineString", "coordinates": [[l.longitude, l.latitude] for l in tornado_lsrs]}


def build_tornado_polygon(lsrs: List[LSR], direction_deg: Optional[float], speed_kts: Optional[float]) -> Optional[dict]:
    """Narrow directional corridor for tornado damage paths."""
    if not SHAPELY_AVAILABLE or not lsrs:
        return None
    points = [Point(l.longitude, l.latitude) for l in lsrs]
    if len(points) == 1:
        return json.loads(json.dumps(mapping(points[0].buffer(0.15))))
    multi = MultiPoint(points)
    hull = multi.convex_hull
    buffered = hull.buffer(0.1)
    if direction_deg is not None:
        centroid = multi.centroid
        dir_rad = math.radians(direction_deg)
        ext_lat = centroid.y + 0.3 * math.cos(dir_rad)
        ext_lon = centroid.x + 0.3 * math.sin(dir_rad)
        buffered = unary_union([buffered, Point(ext_lon, ext_lat).buffer(0.1)])
    return json.loads(json.dumps(mapping(buffered)))


def build_broad_polygon(lsrs: List[LSR], buffer_deg: float = 0.2) -> Optional[dict]:
    """Broader area polygon for wind/severe weather — no directional bias."""
    if not SHAPELY_AVAILABLE or not lsrs:
        return None
    points = [Point(l.longitude, l.latitude) for l in lsrs]
    if len(points) == 1:
        return json.loads(json.dumps(mapping(points[0].buffer(buffer_deg))))
    multi = MultiPoint(points)
    hull = multi.convex_hull
    return json.loads(json.dumps(mapping(hull.buffer(buffer_deg))))


def _label(score: float) -> Tuple[float, str]:
    if score >= 0.7:
        return score, "HIGH"
    elif score >= 0.4:
        return score, "MEDIUM"
    return score, "LOW"


def compute_tornado_confidence(tornado_count, wind_count, has_warning, has_motion):
    score = min(tornado_count * 0.25, 0.5) + min(wind_count * 0.05, 0.2)
    if has_warning:
        score += 0.2
    if has_motion:
        score += 0.1
    return _label(min(score, 1.0))


def compute_wind_confidence(wind_count, has_warning):
    score = min(wind_count * 0.15, 0.6)
    if has_warning:
        score += 0.25
    return _label(min(score, 1.0))


def compute_severe_confidence(total_count, has_warning):
    score = min(total_count * 0.1, 0.5)
    if has_warning:
        score += 0.3
    return _label(min(score, 1.0))


def degrees_to_cardinal(deg: float) -> str:
    dirs = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE",
            "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"]
    return dirs[round(deg / (360 / len(dirs))) % len(dirs)]


def build_explanation(cluster: List[LSR], direction_deg, speed_kts, confidence_score, category: str) -> str:
    t = sum(1 for l in cluster if l.type_code in ("T", "TF", "TW"))
    w = sum(1 for l in cluster if l.type_code in ("W", "DS", "WF"))
    h = sum(1 for l in cluster if l.type_code == "H")
    parts = []
    if t:
        parts.append(f"{t} tornado report{'s' if t != 1 else ''}")
    if w:
        parts.append(f"{w} wind damage report{'s' if w != 1 else ''}")
    if h:
        parts.append(f"{h} hail report{'s' if h != 1 else ''}")
    label = {"TORNADO": "Tornado damage path", "WIND_DAMAGE": "Wind damage swath",
             "SEVERE_WEATHER": "Severe weather swath"}.get(category, category)
    explanation = f"{label} inferred from {', '.join(parts)}."
    if direction_deg is not None and speed_kts is not None:
        explanation += f" Storm motion {degrees_to_cardinal(direction_deg)} at ~{speed_kts:.0f} kts."
    explanation += f" Confidence: {confidence_score:.0%}. NOT AN OFFICIAL NWS SURVEY."
    return explanation


def has_warning_for_cluster(cluster: List[LSR], active_alerts) -> bool:
    states = {l.state for l in cluster if l.state}
    for alert in active_alerts:
        if alert.event_type not in SEVERE_ALERT_TYPES:
            continue
        area = (alert.area_description or "").upper()
        if any(s.upper() in area for s in states):
            return True
    return False


async def _upsert_corridor(db: AsyncSession, incident_id: str, **kwargs):
    existing = (await db.execute(
        select(Corridor).where(Corridor.incident_id == incident_id)
    )).scalar_one_or_none()
    if existing:
        for k, v in kwargs.items():
            setattr(existing, k, v)
        return False
    db.add(Corridor(id=str(uuid.uuid4()), incident_id=incident_id, **kwargs))
    return True


async def generate_corridors(db: AsyncSession, hours_back: int = 48) -> dict:
    if not SHAPELY_AVAILABLE:
        return {"corridors_generated": 0, "error": "Shapely not installed"}

    cutoff = datetime.now(timezone.utc) - timedelta(hours=hours_back)

    # Purge corridors outside the time window
    await db.execute(delete(Corridor).where(Corridor.generated_at < cutoff))

    # Fetch all convective-hazard LSRs
    lsr_result = await db.execute(
        select(LSR).where(
            LSR.type_code.in_(["T", "TF", "TW", "W", "DS", "WF", "H"]),
            LSR.event_time >= cutoff
        )
    )
    all_lsrs = lsr_result.scalars().all()

    # Fetch active NWS alerts
    alert_result = await db.execute(select(Alert).where(Alert.is_active == True))
    active_alerts = alert_result.scalars().all()

    clusters = cluster_lsrs_spatiotemporal(all_lsrs, max_km=200, max_hours=4)
    new_count = 0

    for cluster in clusters:
        tornado_count = sum(1 for l in cluster if l.type_code in ("T", "TF", "TW"))
        wind_count = sum(1 for l in cluster if l.type_code in ("W", "DS", "WF"))
        hail_count = sum(1 for l in cluster if l.type_code == "H")

        avg_lat = sum(l.latitude for l in cluster) / len(cluster)
        avg_lon = sum(l.longitude for l in cluster) / len(cluster)
        event_times = [l.event_time for l in cluster if l.event_time]
        min_time = min(event_times) if event_times else datetime.now(timezone.utc)
        event_start = min(event_times) if event_times else None
        event_end = max(event_times) if event_times else None
        states = list({l.state for l in cluster if l.state})
        counties = list({l.county for l in cluster if l.county})
        has_warn = has_warning_for_cluster(cluster, active_alerts)

        # ── TORNADO ───────────────────────────────────────────────────────────
        if tornado_count > 0:
            direction_deg, speed_kts = estimate_motion_vector(cluster)
            cs, cl = compute_tornado_confidence(tornado_count, wind_count, has_warn, direction_deg is not None)
            polygon = build_tornado_polygon(cluster, direction_deg, speed_kts)
            centerline = build_centerline(cluster)
            if polygon:
                iid = f"TORNADO_{min_time.strftime('%Y%m%d%H')}_{avg_lat:.2f}p{avg_lon:.2f}".replace("-", "m")
                if await _upsert_corridor(db, iid,
                    polygon_geojson=json.dumps(polygon),
                    centerline_geojson=json.dumps(centerline) if centerline else None,
                    confidence_score=cs, confidence_label=cl,
                    explanation=build_explanation(cluster, direction_deg, speed_kts, cs, CATEGORY_TORNADO),
                    lsr_ids=json.dumps([l.id for l in cluster]), alert_ids=json.dumps([]),
                    severity_estimate="LIKELY" if tornado_count >= 3 else "POSSIBLE",
                    event_start=event_start, event_end=event_end,
                    state=",".join(states), county_list=json.dumps(counties),
                    motion_direction_deg=direction_deg, motion_speed_kts=speed_kts,
                    confidence_tier="T3", event_category=CATEGORY_TORNADO,
                ):
                    new_count += 1

        # ── WIND_DAMAGE ───────────────────────────────────────────────────────
        elif wind_count >= 3:
            cs, cl = compute_wind_confidence(wind_count, has_warn)
            wind_lsrs = [l for l in cluster if l.type_code in ("W", "DS", "WF")]
            polygon = build_broad_polygon(wind_lsrs, buffer_deg=0.2)
            if polygon:
                iid = f"WIND_{min_time.strftime('%Y%m%d%H')}_{avg_lat:.2f}p{avg_lon:.2f}".replace("-", "m")
                if await _upsert_corridor(db, iid,
                    polygon_geojson=json.dumps(polygon),
                    centerline_geojson=None,
                    confidence_score=cs, confidence_label=cl,
                    explanation=build_explanation(cluster, None, None, cs, CATEGORY_WIND),
                    lsr_ids=json.dumps([l.id for l in wind_lsrs]), alert_ids=json.dumps([]),
                    severity_estimate="POSSIBLE",
                    event_start=event_start, event_end=event_end,
                    state=",".join(states), county_list=json.dumps(counties),
                    motion_direction_deg=None, motion_speed_kts=None,
                    confidence_tier="T3", event_category=CATEGORY_WIND,
                ):
                    new_count += 1

        # ── SEVERE_WEATHER (hail+wind swath) ──────────────────────────────────
        elif (hail_count + wind_count) >= 3:
            cs, cl = compute_severe_confidence(hail_count + wind_count, has_warn)
            polygon = build_broad_polygon(cluster, buffer_deg=0.15)
            if polygon:
                iid = f"SEVERE_{min_time.strftime('%Y%m%d%H')}_{avg_lat:.2f}p{avg_lon:.2f}".replace("-", "m")
                if await _upsert_corridor(db, iid,
                    polygon_geojson=json.dumps(polygon),
                    centerline_geojson=None,
                    confidence_score=cs, confidence_label=cl,
                    explanation=build_explanation(cluster, None, None, cs, CATEGORY_SEVERE),
                    lsr_ids=json.dumps([l.id for l in cluster]), alert_ids=json.dumps([]),
                    severity_estimate="POSSIBLE",
                    event_start=event_start, event_end=event_end,
                    state=",".join(states), county_list=json.dumps(counties),
                    motion_direction_deg=None, motion_speed_kts=None,
                    confidence_tier="T3", event_category=CATEGORY_SEVERE,
                ):
                    new_count += 1

    # ── FLOOD_ZONE from Flash Flood Warning / Flood Warning polygons ──────────
    flood_alerts = [
        a for a in active_alerts
        if a.event_type in FLOOD_ALERT_TYPES and a.polygon_geojson
    ]
    flood_new = 0
    for alert in flood_alerts:
        iid = f"FLOOD_{alert.id[:30]}"
        cs = 0.9 if "Warning" in alert.event_type else 0.6
        cl = "HIGH" if "Warning" in alert.event_type else "MEDIUM"
        if await _upsert_corridor(db, iid,
            polygon_geojson=alert.polygon_geojson,
            centerline_geojson=None,
            confidence_score=cs, confidence_label=cl,
            explanation=(
                f"{alert.event_type} issued by NWS. "
                f"{alert.headline or ''} "
                f"({alert.area_description or 'Unknown area'}). "
                "OFFICIAL NWS WARNING AREA — not an inferred estimate."
            ),
            lsr_ids=json.dumps([]), alert_ids=json.dumps([alert.id]),
            severity_estimate="OFFICIAL",
            event_start=alert.onset, event_end=alert.expires,
            state="", county_list=json.dumps([alert.area_description or ""]),
            motion_direction_deg=None, motion_speed_kts=None,
            confidence_tier="T2", event_category=CATEGORY_FLOOD,
        ):
            flood_new += 1

    await db.commit()
    logger.info(
        f"Corridors: +{new_count} LSR-based, +{flood_new} flood zones, "
        f"{len(clusters)} clusters analyzed"
    )
    return {
        "corridors_generated": new_count + flood_new,
        "lsr_based": new_count,
        "flood_zones": flood_new,
        "clusters_analyzed": len(clusters),
    }
