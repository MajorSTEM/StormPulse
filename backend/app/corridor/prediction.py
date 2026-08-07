"""
Predictive heading cone for active tornado corridors.

Pure, deterministic geometry: given the last confirmed track position and the
Corridor Engine v2 motion solution (bearing, speed, track-consistency), build
a forward projection cone showing where the storm is likely headed, plus
veer likelihoods derived from how linear the observed track has been.

This is a T3 (system-inferred) product by definition — every payload carries
the standard inferred-output disclaimer. It is NOT an NWS forecast.
"""
import math
from typing import Optional, Tuple

#: How far ahead to project, in minutes.
PROJECTION_MINUTES = 45.0
#: Cone half-angle for a perfectly linear track (consistency = 1.0).
MIN_HALF_ANGLE_DEG = 12.0
#: Additional half-angle as track consistency degrades toward 0.
MAX_EXTRA_HALF_ANGLE_DEG = 33.0
#: Fallback speed when the motion solution lacks one.
DEFAULT_SPEED_KTS = 30.0
#: Straight-ahead likelihood spans 40%..90% as consistency goes 0 -> 1.
STRAIGHT_BASE_PCT = 40.0
STRAIGHT_CONSISTENCY_PCT = 50.0

PREDICTION_DISCLAIMER = (
    "PREDICTED PATH - System-inferred projection from observed storm motion. "
    "Not an NWS forecast. Follow official warnings."
)


def _project(lat: float, lon: float, bearing_deg: float, dist_km: float) -> Tuple[float, float]:
    """Great-circle projection of a point along a bearing. Returns (lat, lon)."""
    R = 6371.0
    d = dist_km / R
    br = math.radians(bearing_deg)
    lat1 = math.radians(lat)
    lon1 = math.radians(lon)
    lat2 = math.asin(math.sin(lat1) * math.cos(d) + math.cos(lat1) * math.sin(d) * math.cos(br))
    lon2 = lon1 + math.atan2(
        math.sin(br) * math.sin(d) * math.cos(lat1),
        math.cos(d) - math.sin(lat1) * math.sin(lat2),
    )
    return math.degrees(lat2), math.degrees(lon2)


def build_prediction(
    last_lat: float,
    last_lon: float,
    bearing_deg: Optional[float],
    speed_kts: Optional[float],
    consistency: Optional[float],
) -> Optional[dict]:
    """
    Build the predictive cone + veer likelihoods for a tornado corridor.

    Returns None when there is no motion solution (no bearing). Deterministic:
    same inputs always produce the same cone and percentages.
    """
    if bearing_deg is None:
        return None

    speed = speed_kts if speed_kts and speed_kts > 0 else DEFAULT_SPEED_KTS
    cons = max(0.0, min(1.0, consistency or 0.0))

    # Cone geometry: apex at the last confirmed position, arc at the
    # projected distance, wider when the observed track has wobbled.
    dist_km = (speed / 0.539957) * (PROJECTION_MINUTES / 60.0)
    half_angle = MIN_HALF_ANGLE_DEG + MAX_EXTRA_HALF_ANGLE_DEG * (1.0 - cons)

    arc_points = []
    steps = 8
    for i in range(steps + 1):
        angle = bearing_deg - half_angle + (2.0 * half_angle) * (i / steps)
        p_lat, p_lon = _project(last_lat, last_lon, angle, dist_km)
        arc_points.append([round(p_lon, 4), round(p_lat, 4)])

    ring = [[round(last_lon, 4), round(last_lat, 4)]] + arc_points + \
           [[round(last_lon, 4), round(last_lat, 4)]]

    straight_pct = round(STRAIGHT_BASE_PCT + STRAIGHT_CONSISTENCY_PCT * cons)
    veer_pct = round((100 - straight_pct) / 2)

    return {
        "cone_geojson": {"type": "Polygon", "coordinates": [ring]},
        "bearing_deg": round(bearing_deg, 1),
        "speed_kts": round(speed, 1),
        "projection_minutes": PROJECTION_MINUTES,
        "cone_half_angle_deg": round(half_angle, 1),
        "straight_pct": straight_pct,
        "veer_left_pct": veer_pct,
        "veer_right_pct": veer_pct,
        "confidence_tier": "T3",
        "disclaimer": PREDICTION_DISCLAIMER,
    }
