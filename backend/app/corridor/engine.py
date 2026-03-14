"""
Corridor Engine v2 — Motion & Time Aware Storm Track Reconstruction

v1 approach: spatial clustering (stuff near stuff)
v2 approach: temporal chain-building → robust motion estimation → RANSAC outlier
             rejection → oriented corridor polygon → three-band confidence geometry

A meteorologist should look at the output and think
"this is reconstructing storm motion" not "this is drawing circles around pins."
"""
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
    from shapely.affinity import rotate, scale
    SHAPELY_AVAILABLE = True
except ImportError:
    SHAPELY_AVAILABLE = False
    logger.warning("Shapely not available — corridor engine disabled")


ENGINE_VERSION = "v2"

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

# LSR type weights for motion reconstruction
LSR_TYPE_WEIGHT = {
    "T":  1.00,   # Confirmed tornado
    "TF": 1.00,   # Tornado (funnel)
    "TW": 0.80,   # Tornado (waterspout / weak)
    "W":  0.35,   # Wind damage
    "DS": 0.25,   # Dust storm
    "WF": 0.30,   # Wildfire (wind-driven)
    "H":  0.15,   # Hail (positional evidence only)
}

TORNADO_CODES = {"T", "TF", "TW"}


# ── Geo utilities ─────────────────────────────────────────────────────────────

def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    R = 6371.0
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2) ** 2
    return 2 * R * math.asin(math.sqrt(max(0.0, min(1.0, a))))


def _bearing_deg(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """True bearing from point 1 to point 2, in degrees (0=N, 90=E)."""
    lat1r, lat2r = math.radians(lat1), math.radians(lat2)
    dlon = math.radians(lon2 - lon1)
    x = math.sin(dlon) * math.cos(lat2r)
    y = math.cos(lat1r) * math.sin(lat2r) - math.sin(lat1r) * math.cos(lat2r) * math.cos(dlon)
    return (math.degrees(math.atan2(x, y)) + 360) % 360


def _project_position(lat: float, lon: float, bearing_deg: float, dist_km: float) -> Tuple[float, float]:
    """Project a lat/lon by dist_km along bearing_deg. Returns (lat, lon)."""
    R = 6371.0
    d = dist_km / R
    br = math.radians(bearing_deg)
    lat1r = math.radians(lat)
    lon1r = math.radians(lon)
    lat2r = math.asin(math.sin(lat1r) * math.cos(d) + math.cos(lat1r) * math.sin(d) * math.cos(br))
    lon2r = lon1r + math.atan2(
        math.sin(br) * math.sin(d) * math.cos(lat1r),
        math.cos(d) - math.sin(lat1r) * math.sin(lat2r)
    )
    return math.degrees(lat2r), math.degrees(lon2r)


def degrees_to_cardinal(deg: float) -> str:
    dirs = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE",
            "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"]
    return dirs[round(deg / (360 / len(dirs))) % len(dirs)]


# ── Phase 1: Temporal chain building ─────────────────────────────────────────

class _Chain:
    """A sequential chain of LSRs representing a single storm cell's progression."""
    __slots__ = ("lsrs", "last_time", "last_lat", "last_lon")

    def __init__(self, lsr: LSR):
        self.lsrs: List[LSR] = [lsr]
        self.last_time: datetime = lsr.event_time or datetime.min.replace(tzinfo=timezone.utc)
        self.last_lat: float = lsr.latitude
        self.last_lon: float = lsr.longitude

    def add(self, lsr: LSR) -> None:
        self.lsrs.append(lsr)
        if lsr.event_time:
            self.last_time = lsr.event_time
        self.last_lat = lsr.latitude
        self.last_lon = lsr.longitude


def build_temporal_chains(
    lsrs: List[LSR],
    max_gap_minutes: float = 40.0,
    max_storm_speed_kts: float = 80.0,
) -> List[List[LSR]]:
    """
    Phase 1: Replace circular spatial clustering with motion-aware chaining.

    Each LSR is assigned to the closest open chain whose storm could
    physically have reached this report's location within the time gap.
    Storms can't teleport — max_storm_speed_kts caps how far they can travel.

    This produces elongated, directional chains instead of circular blobs,
    and naturally separates nearby storms that are time-staggered.
    """
    if not lsrs:
        return []

    tz = timezone.utc
    sentinel = datetime.min.replace(tzinfo=tz)
    sorted_lsrs = sorted(lsrs, key=lambda l: l.event_time or sentinel)

    # 80 kts ≈ 148 km/hr; convert to km/min
    max_km_per_min = (max_storm_speed_kts / 0.539957) / 60.0
    # Add a base radius (20 km) to handle simultaneous reports
    base_radius_km = 20.0

    chains: List[_Chain] = []

    for lsr in sorted_lsrs:
        t = lsr.event_time or sentinel
        best_chain: Optional[_Chain] = None
        best_dist = float("inf")

        for chain in chains:
            gap_min = max(0.0, (t - chain.last_time).total_seconds() / 60.0)
            if gap_min > max_gap_minutes:
                continue
            reach_km = base_radius_km + max_km_per_min * gap_min
            dist = haversine_km(chain.last_lat, chain.last_lon, lsr.latitude, lsr.longitude)
            if dist <= reach_km and dist < best_dist:
                best_dist = dist
                best_chain = chain

        if best_chain is not None:
            best_chain.add(lsr)
        else:
            chains.append(_Chain(lsr))

    # Merge chains whose tails are within 30 km / 30 min of another chain's head.
    # (Handles gaps in reporting between two chains from the same storm.)
    merged = True
    while merged:
        merged = False
        for i in range(len(chains)):
            for j in range(i + 1, len(chains)):
                a, b = chains[i], chains[j]
                gap_min = abs((a.last_time - b.last_time).total_seconds()) / 60.0
                if gap_min > 30:
                    continue
                dist = haversine_km(a.last_lat, a.last_lon, b.last_lat, b.last_lon)
                if dist <= 30.0:
                    # Merge b into a
                    a.lsrs.extend(b.lsrs)
                    if b.last_time > a.last_time:
                        a.last_time = b.last_time
                        a.last_lat = b.last_lat
                        a.last_lon = b.last_lon
                    chains.pop(j)
                    merged = True
                    break
            if merged:
                break

    return [c.lsrs for c in chains]


# ── Phase 2: Motion-aware weighting ──────────────────────────────────────────

def compute_robust_motion_vector(
    lsrs: List[LSR],
) -> Tuple[Optional[float], Optional[float], float]:
    """
    Phase 2: Compute motion vector from ALL consecutive tornado LSR pairs
    using circular statistics — not just first/last points (v1 weakness).

    Returns: (bearing_deg, speed_kts, consistency_score)
      - bearing_deg: circular mean bearing across all consecutive pairs
      - speed_kts: mean translation speed
      - consistency_score: circular R ∈ [0, 1]; 1.0 = perfectly linear track
    """
    tornado_lsrs = sorted(
        [l for l in lsrs if l.type_code in TORNADO_CODES and l.event_time],
        key=lambda l: l.event_time
    )
    if len(tornado_lsrs) < 2:
        return None, None, 0.0

    pair_bearings: List[float] = []
    pair_speeds: List[float] = []

    for i in range(len(tornado_lsrs) - 1):
        a, b = tornado_lsrs[i], tornado_lsrs[i + 1]
        dt_hrs = (b.event_time - a.event_time).total_seconds() / 3600.0
        if dt_hrs < 1e-3:
            continue
        bearing = _bearing_deg(a.latitude, a.longitude, b.latitude, b.longitude)
        dist_km = haversine_km(a.latitude, a.longitude, b.latitude, b.longitude)
        speed_kts = (dist_km / dt_hrs) * 0.539957
        if speed_kts > 90.0:       # physically impossible for storm motion
            continue
        pair_bearings.append(bearing)
        pair_speeds.append(speed_kts)

    if not pair_bearings:
        return None, None, 0.0

    # Circular mean bearing
    sin_sum = sum(math.sin(math.radians(b)) for b in pair_bearings)
    cos_sum = sum(math.cos(math.radians(b)) for b in pair_bearings)
    mean_bearing = (math.degrees(math.atan2(sin_sum, cos_sum)) + 360) % 360

    # Circular R (resultant vector length): 1.0 = all pairs point same direction
    n = len(pair_bearings)
    consistency = math.sqrt(sin_sum ** 2 + cos_sum ** 2) / n

    mean_speed = sum(pair_speeds) / len(pair_speeds)

    return round(mean_bearing, 1), round(min(mean_speed, 80.0), 1), round(consistency, 3)


def reject_motion_outliers(
    lsrs: List[LSR],
    mean_bearing: float,
    threshold_deg: float = 55.0,
) -> Tuple[List[LSR], List[LSR]]:
    """
    Phase 2: RANSAC-lite outlier rejection.

    Walk tornado LSRs in time order. If the bearing from the previous inlier
    to this report deviates > threshold_deg from the established mean_bearing,
    the report is flagged as an outlier (e.g., a nearby separate storm).

    Non-tornado LSRs (wind, hail) are never rejected — they contribute to the
    spread zone but not the track reconstruction.

    Returns: (inliers, outliers)
    """
    tornado_lsrs = sorted(
        [l for l in lsrs if l.type_code in TORNADO_CODES and l.event_time],
        key=lambda l: l.event_time
    )
    non_tornado = [l for l in lsrs if l.type_code not in TORNADO_CODES]

    if len(tornado_lsrs) < 3:
        return lsrs, []   # Not enough data for meaningful rejection

    inliers = [tornado_lsrs[0]]
    outliers: List[LSR] = []

    for i in range(1, len(tornado_lsrs)):
        candidate = tornado_lsrs[i]
        bearing = _bearing_deg(
            inliers[-1].latitude, inliers[-1].longitude,
            candidate.latitude, candidate.longitude,
        )
        # Angular difference, accounting for bearing wraparound
        diff = abs((bearing - mean_bearing + 180) % 360 - 180)
        if diff <= threshold_deg:
            inliers.append(candidate)
        else:
            outliers.append(candidate)

    return inliers + non_tornado, outliers


# ── Phase 3: Polygon builders ─────────────────────────────────────────────────

def build_oriented_corridor(
    lsrs: List[LSR],
    bearing_deg: float,
    cross_track_buf: float = 0.09,
) -> Optional[dict]:
    """
    Phase 3: Build a corridor polygon oriented along bearing_deg.

    Uses Shapely affine transforms to produce an elongated shape aligned with
    storm motion rather than a circular convex hull.

    cross_track_buf: half-width in degrees perpendicular to track (~10 km)
    """
    if not SHAPELY_AVAILABLE or not lsrs:
        return None

    points = [(l.longitude, l.latitude) for l in lsrs]
    if len(points) == 1:
        geom = Point(points[0]).buffer(cross_track_buf)
        return json.loads(json.dumps(mapping(geom.simplify(0.004))))

    multi = MultiPoint(points)

    # Rotate coordinate frame so bearing aligns with +x axis
    # Shapely rotate: CCW from +x. Meteorological bearing: CW from +y.
    # => rotation_angle = -(bearing_deg - 90)
    rot_angle = -(bearing_deg - 90.0)
    rotated = rotate(multi, rot_angle, origin="centroid")

    hull = rotated.convex_hull

    # Buffer cross-track (symmetric at this point — along-track already spans LSR extent)
    buffered = hull.buffer(cross_track_buf)

    # Slightly stretch along-track (x in rotated frame) to smooth the ends
    stretched = scale(buffered, xfact=1.15, yfact=1.0, origin="centroid")

    # Rotate back to geographic frame
    corridor = rotate(stretched, -rot_angle, origin="centroid")

    return json.loads(json.dumps(mapping(corridor.simplify(0.005))))


def build_broad_polygon(lsrs: List[LSR], buffer_deg: float = 0.2) -> Optional[dict]:
    """Broad area polygon for wind/severe weather — no directional bias."""
    if not SHAPELY_AVAILABLE or not lsrs:
        return None
    points = [Point(l.longitude, l.latitude) for l in lsrs]
    if len(points) == 1:
        return json.loads(json.dumps(mapping(points[0].buffer(buffer_deg))))
    multi = MultiPoint([(l.longitude, l.latitude) for l in lsrs])
    hull = multi.convex_hull
    return json.loads(json.dumps(mapping(hull.buffer(buffer_deg).simplify(0.005))))


def build_centerline(lsrs: List[LSR]) -> Optional[dict]:
    """GeoJSON LineString through inlier tornado LSRs, sorted by time."""
    tornado_lsrs = sorted(
        [l for l in lsrs if l.type_code in TORNADO_CODES and l.event_time],
        key=lambda l: l.event_time
    )
    if len(tornado_lsrs) < 2:
        return None
    return {
        "type": "LineString",
        "coordinates": [[l.longitude, l.latitude] for l in tornado_lsrs],
    }


def build_confidence_bands(
    inlier_tornado_lsrs: List[LSR],
    all_lsrs: List[LSR],
    bearing_deg: Optional[float],
    speed_kts: Optional[float],
) -> dict:
    """
    Phase 3: Build three confidence band geometries:

      core      — tight corridor through confirmed inlier tornado reports only
                  (high certainty; where the track definitely passed)
      spread    — broader zone including all cluster members
                  (probable damage area)
      extension — forward-projected circle showing where the storm was heading
                  (situational awareness; NOT confirmed damage)

    Returns a dict suitable for JSON storage in confidence_band_geojson.
    """
    bands: dict = {}
    if not SHAPELY_AVAILABLE:
        return bands

    # Core: tight around inlier tornado LSRs only
    if inlier_tornado_lsrs:
        tornado_pts = MultiPoint([(l.longitude, l.latitude) for l in inlier_tornado_lsrs])
        if len(inlier_tornado_lsrs) == 1:
            core_geom = tornado_pts.geoms[0].buffer(0.05)
        else:
            core_geom = tornado_pts.convex_hull.buffer(0.05)
            if bearing_deg is not None:
                # Elongate along bearing
                rot = -(bearing_deg - 90.0)
                core_geom = rotate(
                    scale(rotate(core_geom, rot, origin="centroid"), xfact=1.2, yfact=1.0, origin="centroid"),
                    -rot, origin="centroid"
                )
        bands["core"] = json.loads(json.dumps(mapping(core_geom.simplify(0.003))))

    # Spread: includes all cluster members (wind, hail, etc.)
    if all_lsrs:
        all_pts = MultiPoint([(l.longitude, l.latitude) for l in all_lsrs])
        if len(all_lsrs) == 1:
            spread_geom = all_pts.geoms[0].buffer(0.15)
        else:
            spread_geom = all_pts.convex_hull.buffer(0.15)
            if bearing_deg is not None:
                rot = -(bearing_deg - 90.0)
                spread_geom = rotate(
                    scale(rotate(spread_geom, rot, origin="centroid"), xfact=1.1, yfact=1.0, origin="centroid"),
                    -rot, origin="centroid"
                )
        bands["spread"] = json.loads(json.dumps(mapping(spread_geom.simplify(0.005))))

    # Extension: project 20–35 minutes forward at current speed
    if bearing_deg is not None and inlier_tornado_lsrs:
        last = sorted(inlier_tornado_lsrs, key=lambda l: l.event_time)[-1]
        spd = speed_kts or 30.0
        # Distance covered in 30 min at current speed (kts → km)
        dist_km = (spd / 0.539957) * 0.5   # 0.5 hours
        proj_lat, proj_lon = _project_position(last.latitude, last.longitude, bearing_deg, dist_km)
        ext_geom = Point(proj_lon, proj_lat).buffer(0.1)
        bands["extension"] = json.loads(json.dumps(mapping(ext_geom.simplify(0.003))))

    return bands


# ── Confidence scoring ────────────────────────────────────────────────────────

def _label(score: float) -> Tuple[float, str]:
    if score >= 0.70:
        return score, "HIGH"
    elif score >= 0.40:
        return score, "MEDIUM"
    return score, "LOW"


def compute_v2_tornado_confidence(
    tornado_count: int,
    wind_count: int,
    has_warning: bool,
    motion_consistency: float,
    inlier_fraction: float,
) -> Tuple[float, str]:
    """
    Phase 2: Motion-aware confidence scoring.
    Replaces simple count-based v1 scoring with track quality metrics.
    """
    score = 0.0

    # Report counts (capped to avoid one mega-outbreak inflating a single corridor)
    score += min(tornado_count * 0.18, 0.45)
    score += min(wind_count * 0.04, 0.12)

    # Official backing
    if has_warning:
        score += 0.15

    # Motion quality bonuses (v2-only)
    if motion_consistency >= 0.85:
        score += 0.18   # nearly perfectly linear track
    elif motion_consistency >= 0.65:
        score += 0.10
    elif motion_consistency >= 0.40:
        score += 0.04

    # Inlier fraction: how many reports fit the motion model
    if inlier_fraction >= 0.90:
        score += 0.08
    elif inlier_fraction >= 0.70:
        score += 0.04

    return _label(min(score, 1.0))


def compute_wind_confidence(wind_count: int, has_warning: bool) -> Tuple[float, str]:
    score = min(wind_count * 0.15, 0.60)
    if has_warning:
        score += 0.25
    return _label(min(score, 1.0))


def compute_severe_confidence(total_count: int, has_warning: bool) -> Tuple[float, str]:
    score = min(total_count * 0.10, 0.50)
    if has_warning:
        score += 0.30
    return _label(min(score, 1.0))


# ── Explanation builder ───────────────────────────────────────────────────────

def build_explanation_v2(
    cluster: List[LSR],
    inlier_count: int,
    outlier_count: int,
    direction_deg: Optional[float],
    speed_kts: Optional[float],
    consistency: float,
    confidence_score: float,
    category: str,
) -> str:
    t = sum(1 for l in cluster if l.type_code in TORNADO_CODES)
    w = sum(1 for l in cluster if l.type_code in ("W", "DS", "WF"))
    h = sum(1 for l in cluster if l.type_code == "H")

    parts = []
    if t:
        parts.append(f"{t} tornado report{'s' if t != 1 else ''}")
    if w:
        parts.append(f"{w} wind damage report{'s' if w != 1 else ''}")
    if h:
        parts.append(f"{h} hail report{'s' if h != 1 else ''}")

    label = {
        "TORNADO": "Tornado damage path",
        "WIND_DAMAGE": "Wind damage swath",
        "SEVERE_WEATHER": "Severe weather swath",
    }.get(category, category)

    explanation = f"{label} inferred from {', '.join(parts)}."

    if direction_deg is not None and speed_kts is not None:
        card = degrees_to_cardinal(direction_deg)
        explanation += f" Storm moving {card} at ~{speed_kts:.0f} kts"
        if consistency > 0:
            pct = int(consistency * 100)
            explanation += f" (track linearity {pct}%)"
        explanation += "."

    if outlier_count > 0:
        explanation += f" {outlier_count} report{'s' if outlier_count != 1 else ''} rejected as off-track outliers."

    explanation += f" Confidence: {confidence_score:.0%}. NOT AN OFFICIAL NWS SURVEY."
    return explanation


# ── Alert correlation ─────────────────────────────────────────────────────────

def has_warning_for_cluster(cluster: List[LSR], active_alerts: list) -> bool:
    states = {l.state for l in cluster if l.state}
    for alert in active_alerts:
        if alert.event_type not in SEVERE_ALERT_TYPES:
            continue
        area = (alert.area_description or "").upper()
        if any(s.upper() in area for s in states):
            return True
    return False


# ── Database helpers ──────────────────────────────────────────────────────────

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


# ── Main entry point ──────────────────────────────────────────────────────────

async def generate_corridors(db: AsyncSession, hours_back: int = 48) -> dict:
    """
    Run Corridor Engine v2:
      Phase 1 — Temporal chain building (storm-speed-constrained)
      Phase 2 — Robust motion estimation (circular stats) + outlier rejection
      Phase 3 — Oriented corridor polygon + three-band confidence geometry
      Phase 4 — Confidence scoring with motion-quality metrics
    """
    if not SHAPELY_AVAILABLE:
        return {"corridors_generated": 0, "error": "Shapely not installed"}

    cutoff = datetime.now(timezone.utc) - timedelta(hours=hours_back)

    # Purge stale corridors
    await db.execute(delete(Corridor).where(Corridor.generated_at < cutoff))

    # Fetch convective LSRs
    lsr_result = await db.execute(
        select(LSR).where(
            LSR.type_code.in_(["T", "TF", "TW", "W", "DS", "WF", "H"]),
            LSR.event_time >= cutoff,
        )
    )
    all_lsrs = lsr_result.scalars().all()

    # Fetch active alerts
    alert_result = await db.execute(select(Alert).where(Alert.is_active == True))
    active_alerts = alert_result.scalars().all()

    # ── Phase 1: Temporal chain clustering ───────────────────────────────────
    chains = build_temporal_chains(all_lsrs, max_gap_minutes=40, max_storm_speed_kts=80)
    new_count = 0

    for chain in chains:
        tornado_count = sum(1 for l in chain if l.type_code in TORNADO_CODES)
        wind_count    = sum(1 for l in chain if l.type_code in ("W", "DS", "WF"))
        hail_count    = sum(1 for l in chain if l.type_code == "H")

        # Collect timestamps for this chain
        event_times = [l.event_time for l in chain if l.event_time]
        if not event_times:
            continue
        event_start = min(event_times)
        event_end   = max(event_times)
        # Use midpoint for incident ID stability
        mid_lat = sum(l.latitude for l in chain) / len(chain)
        mid_lon = sum(l.longitude for l in chain) / len(chain)
        states   = list({l.state for l in chain if l.state})
        counties = list({l.county for l in chain if l.county})
        has_warn = has_warning_for_cluster(chain, active_alerts)

        # ── TORNADO corridor ─────────────────────────────────────────────────
        if tornado_count > 0:
            # Phase 2: Robust motion estimation
            bearing_deg, speed_kts, consistency = compute_robust_motion_vector(chain)

            # Phase 2: RANSAC outlier rejection
            if bearing_deg is not None:
                inliers, outliers = reject_motion_outliers(chain, bearing_deg)
            else:
                inliers, outliers = chain, []

            inlier_tornado = [l for l in inliers if l.type_code in TORNADO_CODES]
            total_tornado = [l for l in chain if l.type_code in TORNADO_CODES]
            inlier_frac = len(inlier_tornado) / max(len(total_tornado), 1)

            # Phase 3: Oriented corridor polygon
            if bearing_deg is not None and len(inliers) > 0:
                polygon = build_oriented_corridor(inliers, bearing_deg, cross_track_buf=0.09)
            else:
                polygon = build_broad_polygon(chain, buffer_deg=0.12)

            if not polygon:
                continue

            centerline = build_centerline(inlier_tornado)

            # Phase 3: Confidence bands
            bands = build_confidence_bands(inlier_tornado, inliers, bearing_deg, speed_kts)

            # Phase 2: Motion-aware confidence
            cs, cl = compute_v2_tornado_confidence(
                tornado_count=len(total_tornado),
                wind_count=wind_count,
                has_warning=has_warn,
                motion_consistency=consistency,
                inlier_fraction=inlier_frac,
            )

            iid = (
                f"TORNv2_{event_start.strftime('%Y%m%d%H')}_{mid_lat:.2f}p{mid_lon:.2f}"
                .replace("-", "m")
            )

            if await _upsert_corridor(db, iid,
                polygon_geojson=json.dumps(polygon),
                centerline_geojson=json.dumps(centerline) if centerline else None,
                confidence_score=cs,
                confidence_label=cl,
                explanation=build_explanation_v2(
                    chain, len(inlier_tornado), len(outliers),
                    bearing_deg, speed_kts, consistency, cs, CATEGORY_TORNADO,
                ),
                lsr_ids=json.dumps([l.id for l in chain]),
                alert_ids=json.dumps([]),
                severity_estimate="LIKELY" if len(total_tornado) >= 3 else "POSSIBLE",
                event_start=event_start,
                event_end=event_end,
                state=",".join(states),
                county_list=json.dumps(counties),
                motion_direction_deg=bearing_deg,
                motion_speed_kts=speed_kts,
                confidence_tier="T3",
                event_category=CATEGORY_TORNADO,
                engine_version=ENGINE_VERSION,
                motion_consistency_score=consistency,
                inlier_count=len(inlier_tornado),
                outlier_count=len(outliers),
                confidence_band_geojson=json.dumps(bands) if bands else None,
            ):
                new_count += 1

        # ── WIND_DAMAGE corridor ─────────────────────────────────────────────
        elif wind_count >= 3:
            cs, cl = compute_wind_confidence(wind_count, has_warn)
            wind_lsrs = [l for l in chain if l.type_code in ("W", "DS", "WF")]
            polygon = build_broad_polygon(wind_lsrs, buffer_deg=0.2)
            if not polygon:
                continue

            iid = (
                f"WINDv2_{event_start.strftime('%Y%m%d%H')}_{mid_lat:.2f}p{mid_lon:.2f}"
                .replace("-", "m")
            )

            if await _upsert_corridor(db, iid,
                polygon_geojson=json.dumps(polygon),
                centerline_geojson=None,
                confidence_score=cs,
                confidence_label=cl,
                explanation=build_explanation_v2(
                    chain, 0, 0, None, None, 0.0, cs, CATEGORY_WIND,
                ),
                lsr_ids=json.dumps([l.id for l in wind_lsrs]),
                alert_ids=json.dumps([]),
                severity_estimate="POSSIBLE",
                event_start=event_start,
                event_end=event_end,
                state=",".join(states),
                county_list=json.dumps(counties),
                motion_direction_deg=None,
                motion_speed_kts=None,
                confidence_tier="T3",
                event_category=CATEGORY_WIND,
                engine_version=ENGINE_VERSION,
                motion_consistency_score=0.0,
                inlier_count=wind_count,
                outlier_count=0,
                confidence_band_geojson=None,
            ):
                new_count += 1

        # ── SEVERE_WEATHER (hail+wind swath) ─────────────────────────────────
        elif (hail_count + wind_count) >= 3:
            cs, cl = compute_severe_confidence(hail_count + wind_count, has_warn)
            polygon = build_broad_polygon(chain, buffer_deg=0.15)
            if not polygon:
                continue

            iid = (
                f"SEVEREv2_{event_start.strftime('%Y%m%d%H')}_{mid_lat:.2f}p{mid_lon:.2f}"
                .replace("-", "m")
            )

            if await _upsert_corridor(db, iid,
                polygon_geojson=json.dumps(polygon),
                centerline_geojson=None,
                confidence_score=cs,
                confidence_label=cl,
                explanation=build_explanation_v2(
                    chain, 0, 0, None, None, 0.0, cs, CATEGORY_SEVERE,
                ),
                lsr_ids=json.dumps([l.id for l in chain]),
                alert_ids=json.dumps([]),
                severity_estimate="POSSIBLE",
                event_start=event_start,
                event_end=event_end,
                state=",".join(states),
                county_list=json.dumps(counties),
                motion_direction_deg=None,
                motion_speed_kts=None,
                confidence_tier="T3",
                event_category=CATEGORY_SEVERE,
                engine_version=ENGINE_VERSION,
                motion_consistency_score=0.0,
                inlier_count=hail_count + wind_count,
                outlier_count=0,
                confidence_band_geojson=None,
            ):
                new_count += 1

    # ── FLOOD_ZONE from official Flash Flood Warning polygons ─────────────────
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
            confidence_score=cs,
            confidence_label=cl,
            explanation=(
                f"{alert.event_type} issued by NWS. "
                f"{alert.headline or ''} "
                f"({alert.area_description or 'Unknown area'}). "
                "OFFICIAL NWS WARNING AREA — not an inferred estimate."
            ),
            lsr_ids=json.dumps([]),
            alert_ids=json.dumps([alert.id]),
            severity_estimate="OFFICIAL",
            event_start=alert.onset,
            event_end=alert.expires,
            state="",
            county_list=json.dumps([alert.area_description or ""]),
            motion_direction_deg=None,
            motion_speed_kts=None,
            confidence_tier="T2",
            event_category=CATEGORY_FLOOD,
            engine_version="official",
            motion_consistency_score=None,
            inlier_count=0,
            outlier_count=0,
            confidence_band_geojson=None,
        ):
            flood_new += 1

    await db.commit()
    logger.info(
        f"Corridor Engine v2: +{new_count} LSR-based, +{flood_new} flood zones, "
        f"{len(chains)} chains analyzed"
    )
    return {
        "corridors_generated": new_count + flood_new,
        "lsr_based": new_count,
        "flood_zones": flood_new,
        "chains_analyzed": len(chains),
        "engine_version": ENGINE_VERSION,
    }
