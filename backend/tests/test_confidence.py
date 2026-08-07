"""Unit tests for the weighted T1/T2/T3 confidence scoring module."""
import pytest

from app.scoring.confidence import (
    Signal,
    SIGNAL_WEIGHTS,
    T1_THRESHOLD,
    T2_THRESHOLD,
    LABEL_HIGH_THRESHOLD,
    LABEL_MEDIUM_THRESHOLD,
    assign_tier,
    tier_for_alert,
    tier_for_lsr,
    tier_for_corridor,
    compute_v2_tornado_confidence,
    compute_wind_confidence,
    compute_severe_confidence,
)


# ── Tier assignment: core model ──────────────────────────────────────────────

def test_empty_signal_set_is_t3():
    result = assign_tier([])
    assert result.tier == "T3"
    assert result.score == 0.0
    assert result.dominant_signal is None


def test_damage_survey_is_t1():
    result = assign_tier({Signal.NWS_DAMAGE_SURVEY})
    assert result.tier == "T1"
    assert result.score == 1.00


def test_confirmed_tornado_lsr_is_t1():
    result = assign_tier({Signal.CONFIRMED_TORNADO_LSR})
    assert result.tier == "T1"
    assert result.score == pytest.approx(0.90)


def test_active_warning_is_t2():
    result = assign_tier({Signal.OFFICIAL_WARNING_PRODUCT})
    assert result.tier == "T2"


def test_watch_or_advisory_is_t2():
    assert assign_tier({Signal.OFFICIAL_WATCH_OR_ADVISORY}).tier == "T2"


def test_unconfirmed_lsr_is_t2():
    assert assign_tier({Signal.UNCONFIRMED_LSR}).tier == "T2"


def test_inferred_geometry_is_t3():
    result = assign_tier({Signal.INFERRED_GEOMETRY})
    assert result.tier == "T3"
    assert result.score == pytest.approx(0.20)


def test_dominant_signal_wins():
    """The strongest signal present sets the tier."""
    result = assign_tier({Signal.INFERRED_GEOMETRY, Signal.NWS_DAMAGE_SURVEY})
    assert result.tier == "T1"
    assert result.dominant_signal == Signal.NWS_DAMAGE_SURVEY


def test_weak_signals_never_accumulate_to_t1():
    """Every non-confirmation signal combined still lands below T1."""
    weak = {
        Signal.OFFICIAL_WARNING_PRODUCT,
        Signal.OFFICIAL_WATCH_OR_ADVISORY,
        Signal.UNCONFIRMED_LSR,
        Signal.INFERRED_GEOMETRY,
    }
    result = assign_tier(weak)
    assert result.tier == "T2"
    assert result.score < T1_THRESHOLD


def test_deterministic_same_inputs_same_output():
    signals = {Signal.OFFICIAL_WARNING_PRODUCT, Signal.UNCONFIRMED_LSR}
    first = assign_tier(signals)
    for _ in range(100):
        assert assign_tier(signals) == first


def test_thresholds_partition_the_weight_scale():
    """Every signal weight falls unambiguously into exactly one tier band."""
    assert 0.0 < T2_THRESHOLD < T1_THRESHOLD <= 1.0
    for signal, weight in SIGNAL_WEIGHTS.items():
        bands = [
            weight >= T1_THRESHOLD,
            T2_THRESHOLD <= weight < T1_THRESHOLD,
            weight < T2_THRESHOLD,
        ]
        assert sum(bands) == 1, f"{signal} weight {weight} is ambiguous"


# ── Domain adapters ──────────────────────────────────────────────────────────

@pytest.mark.parametrize("event_type", [
    "Tornado Warning", "Tornado Emergency", "Severe Thunderstorm Warning",
    "Flash Flood Warning", "Extreme Wind Warning",
])
def test_warning_products_are_t2(event_type):
    result = tier_for_alert(event_type)
    assert result.tier == "T2"
    assert result.dominant_signal == Signal.OFFICIAL_WARNING_PRODUCT


@pytest.mark.parametrize("event_type", [
    "Tornado Watch", "Severe Thunderstorm Watch", "Wind Advisory",
    "Special Weather Statement", "Flood Advisory",
])
def test_watch_advisory_products_are_t2(event_type):
    result = tier_for_alert(event_type)
    assert result.tier == "T2"
    assert result.dominant_signal == Signal.OFFICIAL_WATCH_OR_ADVISORY


@pytest.mark.parametrize("type_code", ["T", "TF", "TW", "t"])
def test_tornado_lsrs_are_t1(type_code):
    assert tier_for_lsr(type_code).tier == "T1"


@pytest.mark.parametrize("type_code", ["W", "H", "DS", "WF", "", None])
def test_non_tornado_lsrs_are_t2(type_code):
    assert tier_for_lsr(type_code).tier == "T2"


def test_inferred_corridor_is_t3():
    assert tier_for_corridor(is_official_geometry=False).tier == "T3"


def test_official_flood_zone_corridor_is_t2():
    assert tier_for_corridor(is_official_geometry=True).tier == "T2"


# ── Corridor confidence strength ─────────────────────────────────────────────

def test_tornado_confidence_dense_linear_warned_track_is_high():
    score, label = compute_v2_tornado_confidence(
        tornado_count=3, wind_count=2, has_warning=True,
        motion_consistency=0.90, inlier_fraction=1.0,
    )
    # 0.45 (capped) + 0.08 + 0.15 + 0.18 + 0.08 = 0.94
    assert score == pytest.approx(0.94)
    assert label == "HIGH"


def test_tornado_confidence_single_report_is_low():
    score, label = compute_v2_tornado_confidence(
        tornado_count=1, wind_count=0, has_warning=False,
        motion_consistency=0.0, inlier_fraction=0.0,
    )
    assert score == pytest.approx(0.18)
    assert label == "LOW"


def test_tornado_report_contribution_is_capped():
    few, _ = compute_v2_tornado_confidence(3, 0, False, 0.0, 0.0)
    many, _ = compute_v2_tornado_confidence(50, 0, False, 0.0, 0.0)
    assert few == many == pytest.approx(0.45)


def test_confidence_never_exceeds_one():
    score, _ = compute_v2_tornado_confidence(100, 100, True, 1.0, 1.0)
    assert score <= 1.0


def test_confidence_label_thresholds():
    assert LABEL_MEDIUM_THRESHOLD < LABEL_HIGH_THRESHOLD
    _, high = compute_v2_tornado_confidence(3, 2, True, 0.9, 1.0)   # 0.94
    _, med = compute_v2_tornado_confidence(2, 0, True, 0.0, 0.0)    # 0.51
    _, low = compute_v2_tornado_confidence(1, 0, False, 0.0, 0.0)   # 0.18
    assert (high, med, low) == ("HIGH", "MEDIUM", "LOW")


def test_wind_confidence():
    score, label = compute_wind_confidence(wind_count=4, has_warning=True)
    assert score == pytest.approx(0.85)
    assert label == "HIGH"
    score, label = compute_wind_confidence(wind_count=1, has_warning=False)
    assert label == "LOW"


def test_severe_confidence():
    score, label = compute_severe_confidence(total_count=5, has_warning=True)
    assert score == pytest.approx(0.80)
    assert label == "HIGH"
    score, label = compute_severe_confidence(total_count=2, has_warning=False)
    assert label == "LOW"


def test_confidence_is_deterministic():
    args = (3, 2, True, 0.85, 0.95)
    assert all(
        compute_v2_tornado_confidence(*args) == compute_v2_tornado_confidence(*args)
        for _ in range(50)
    )
