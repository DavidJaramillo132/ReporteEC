"""Pure route-risk math: no database, no OSRM.

The tiny fixture used throughout (`_RAW`): weighted cases 4.0 at 00h and
2.0 at 23h, nothing else. Hand-computed:

- smoothing [0.25, 0.5, 0.25] (circular):
  s[22] = 0.25*2 = 0.5; s[23] = 0.5*2 + 0.25*4 = 2.0;
  s[0] = 0.25*2 + 0.5*4 = 2.5; s[1] = 0.25*4 = 1.0; total stays 6.0.
- shrinkage toward a uniform national curve (1/24 each), K = 20:
  share[h] = (s[h] + 20/24) / (6 + 20) -> share[0] = 20/156,
  share[23] = 17/156, share[5] = 5/156.
- mean share m(23) of a 90-minute trip leaving at 23h:
  (share[23] + 0.5 * share[0]) / 1.5 = (27/156) / 1.5 = 18/156.
- density for 6 weighted cases on a 60 km route, leaving at 23h on that trip:
  (6 / 60) * 24 * 18/156 = 43.2/156.
"""

import math
from datetime import datetime

import pytest

from app.core.time import GUAYAQUIL
from app.modules.routing.scoring import (
    MIN_DENSITY_KM,
    Band,
    band_for,
    best_departure_hour,
    densities_by_departure_hour,
    density_for_departure,
    has_recorded_hour,
    mean_share_for_departure,
    normalize,
    peak_hours,
    recency_weight,
    scored_cases_per_km,
    select_blackspot_pieces,
    shrink_toward,
    smooth_circular,
)

_RAW = [4.0] + [0.0] * 22 + [2.0]
_UNIFORM = [1 / 24] * 24


def test_smoothing_is_circular_and_preserves_the_total():
    smoothed = smooth_circular(_RAW)

    assert smoothed[22] == pytest.approx(0.5)
    assert smoothed[23] == pytest.approx(2.0)
    assert smoothed[0] == pytest.approx(2.5)
    assert smoothed[1] == pytest.approx(1.0)
    assert sum(smoothed[2:22]) == 0
    assert sum(smoothed) == pytest.approx(6.0)


def test_smoothing_rejects_a_curve_that_is_not_24_hours():
    with pytest.raises(ValueError):
        smooth_circular([1.0] * 23)


def test_shrinkage_toward_the_national_curve_by_hand():
    share = shrink_toward(smooth_circular(_RAW), _UNIFORM)

    assert share[0] == pytest.approx(20 / 156)
    assert share[23] == pytest.approx(17 / 156)
    assert share[1] == pytest.approx((1.0 + 20 / 24) / 26)
    assert share[5] == pytest.approx(5 / 156)
    assert sum(share) == pytest.approx(1.0)


def test_shrinkage_with_no_route_cases_is_the_national_curve():
    national = normalize([float(h + 1) for h in range(24)])

    assert shrink_toward([0.0] * 24, national) == pytest.approx(national)


def test_shrinkage_with_many_cases_follows_the_route():
    route = [0.0] * 24
    route[3] = 10_000.0
    share = shrink_toward(route, _UNIFORM)

    assert share[3] > 0.99


def test_normalize_of_an_empty_curve_is_uniform():
    assert normalize([0.0] * 24) == pytest.approx(_UNIFORM)


def test_mean_share_of_a_90_minute_trip_at_22h_by_hand():
    share = [0.0] * 24
    share[22] = 0.09
    share[23] = 0.06

    # (1 * share[22] + 0.5 * share[23]) / 1.5 = 0.12 / 1.5
    assert mean_share_for_departure(share, 22, 90) == pytest.approx(0.08)


def test_mean_share_spans_the_trip_hours_pro_rated_by_minutes():
    share = shrink_toward(smooth_circular(_RAW), _UNIFORM)

    assert mean_share_for_departure(share, 23, 90) == pytest.approx(18 / 156)


def test_mean_share_of_a_trip_under_one_hour_is_the_departure_hour_share():
    share = normalize([float(h) for h in range(24)])

    assert mean_share_for_departure(share, 10, 30) == share[10]
    assert mean_share_for_departure(share, 10, 60) == share[10]
    assert mean_share_for_departure(share, 10, 0) == share[10]


def test_mean_share_wraps_past_midnight():
    share = normalize([float(h) for h in range(24)])  # share[h] = h / 276

    # 150 min leaving at 23h: 23h fully, 00h fully, half of 01h, over 2.5 h.
    expected = (23 / 276 + 0 / 276 + 0.5 * 1 / 276) / 2.5
    assert mean_share_for_departure(share, 23, 150) == pytest.approx(expected)


def test_mean_share_of_a_trip_longer_than_a_day_wraps_again():
    share = normalize([float(h) for h in range(24)])

    # 25 hours leaving at 22h: every hour once (sum 1), plus 22h a second time.
    assert mean_share_for_departure(share, 22, 25 * 60) == pytest.approx((1.0 + share[22]) / 25)


def test_density_by_hand():
    share = shrink_toward(smooth_circular(_RAW), _UNIFORM)

    # 6 weighted cases over 60 km -> 0.1 per km; x 24 x m(23h) of a 90-min trip.
    assert density_for_departure(share, 6 / 60, 23, 90) == pytest.approx(43.2 / 156)


def test_a_flat_curve_gives_a_density_equal_to_the_cases_per_km():
    for hour, minutes in [(0, 20), (13, 90), (22, 600), (5, 3000)]:
        assert density_for_departure(_UNIFORM, 0.35, hour, minutes) == pytest.approx(0.35)


def test_density_does_not_depend_on_route_length():
    share = shrink_toward(smooth_circular(_RAW), _UNIFORM)
    # Twice the cases on a twice-as-long route with the same trip length in hours.
    short = densities_by_departure_hour(share, 6 / 60, 90)
    long = densities_by_departure_hour(share, 12 / 120, 90)

    assert long == pytest.approx(short)


def test_scored_cases_per_km_divides_by_at_least_10_km():
    assert MIN_DENSITY_KM == 10.0
    # Under 10 km: divided by 10, so one case on 3 km counts like one on 10 km.
    assert scored_cases_per_km(1.0, 3.0) == scored_cases_per_km(1.0, 10.0) == 0.1
    assert scored_cases_per_km(1.0, 0.0) == 0.1
    # From 10 km on: the real distance.
    assert scored_cases_per_km(1.0, 25.0) == 1.0 / 25.0
    assert scored_cases_per_km(0.0, 3.0) == 0.0


def test_density_with_no_cases_is_zero():
    assert densities_by_departure_hour(_UNIFORM, 0.0, 45) == [0.0] * 24


def test_densities_by_departure_hour_has_one_value_per_hour():
    share = shrink_toward(smooth_circular(_RAW), _UNIFORM)
    densities = densities_by_departure_hour(share, 6 / 60, 90)

    assert len(densities) == 24
    assert densities[23] == pytest.approx(43.2 / 156)
    assert densities[5] == pytest.approx(0.1 * 24 * (5 / 156 + 0.5 * 5 / 156) / 1.5)


def test_recency_weight_halves_at_one_year():
    assert recency_weight(0) == 1.0
    assert recency_weight(365.25) == pytest.approx(0.5)
    assert recency_weight(2 * 365.25) == pytest.approx(0.25)
    # A case dated after the data cut never weighs more than a fresh one.
    assert recency_weight(-10) == 1.0


@pytest.mark.parametrize(
    ("score", "band"),
    [
        (0, Band.SEGURO),
        (25, Band.SEGURO),
        (26, Band.PRECAUCION),
        (50, Band.PRECAUCION),
        (51, Band.RIESGO_ALTO),
        (75, Band.RIESGO_ALTO),
        (76, Band.CRITICO),
        (100, Band.CRITICO),
    ],
)
def test_band_thresholds(score: int, band: Band):
    assert band_for(score) is band


def test_band_labels_are_the_documented_spanish_words():
    assert [b.label for b in Band] == ["Seguro", "Precaución", "Riesgo alto", "Crítico"]


@pytest.mark.parametrize("score", [-1, 101, math.nan])
def test_band_rejects_a_score_outside_0_100(score: float):
    with pytest.raises(ValueError):
        band_for(score)


def test_best_departure_is_the_minimum_density():
    densities = [5.0] * 24
    densities[14] = 1.0

    assert best_departure_hour(densities) == 14


def test_best_departure_reports_the_earliest_hour_within_five_percent():
    densities = [5.0] * 24
    densities[14] = 1.0
    densities[6] = 1.05  # within 5% of the minimum: earlier, so it wins
    densities[3] = 1.06  # just outside

    assert best_departure_hour(densities) == 6


def test_best_departure_with_no_density_at_all_is_midnight():
    assert best_departure_hour([0.0] * 24) == 0


def test_blackspots_need_three_weighted_cases_and_the_top_ten_percent():
    # 20 pieces: the top 10% are the two heaviest.
    pieces = [0.0] * 20
    pieces[4] = 6.0
    pieces[9] = 4.0
    pieces[15] = 3.5  # >= 3 but third heaviest: not in the top 10%

    assert select_blackspot_pieces(pieces) == [4, 9]


def test_blackspots_below_three_weighted_cases_never_qualify():
    assert select_blackspot_pieces([2.9, 0.0, 0.0]) == []


def test_blackspots_keep_ties_and_cap_at_five_ordered_by_weight():
    pieces = [3.0] * 8 + [9.0]

    # One piece is the top-10% cut (n=9): only the 9.0 piece, ties at 3.0 are below it.
    assert select_blackspot_pieces(pieces) == [8]

    flat = [4.0] * 30
    # All pieces tie at the 90th percentile: capped at five, earliest km first.
    assert select_blackspot_pieces(flat) == [0, 1, 2, 3, 4]


def test_peak_hours_are_the_three_heaviest_hours_with_cases():
    by_hour = [0.0] * 24
    by_hour[22] = 3.0
    by_hour[2] = 1.0
    by_hour[19] = 3.0
    by_hour[7] = 0.5

    assert peak_hours(by_hour) == [19, 22, 2]
    assert peak_hours([0.0] * 23 + [1.0]) == [23]


@pytest.mark.parametrize(
    ("local", "recorded"),
    [
        (datetime(2025, 6, 1, 0, 0, 0, tzinfo=GUAYAQUIL), False),
        (datetime(2025, 6, 1, 0, 0, 1, tzinfo=GUAYAQUIL), True),
        (datetime(2025, 6, 1, 0, 30, tzinfo=GUAYAQUIL), True),
        (datetime(2025, 6, 1, 23, 59, tzinfo=GUAYAQUIL), True),
        (datetime(2025, 6, 1, 12, 0, tzinfo=GUAYAQUIL), True),
    ],
)
def test_exactly_midnight_local_means_no_recorded_hour(local: datetime, recorded: bool):
    assert has_recorded_hour(local) is recorded
