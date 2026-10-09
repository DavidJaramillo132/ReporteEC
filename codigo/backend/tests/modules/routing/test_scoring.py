"""Pure route-risk math: no database, no OSRM.

The tiny fixture used throughout (`_RAW`): weighted cases 4.0 at 00h and
2.0 at 23h, nothing else. Hand-computed:

- smoothing [0.25, 0.5, 0.25] (circular):
  s[22] = 0.25*2 = 0.5; s[23] = 0.5*2 + 0.25*4 = 2.0;
  s[0] = 0.25*2 + 0.5*4 = 2.5; s[1] = 0.25*4 = 1.0; total stays 6.0.
- shrinkage toward a uniform national curve (1/24 each), K = 20:
  share[h] = (s[h] + 20/24) / (6 + 20) -> share[0] = 20/156,
  share[23] = 17/156, share[5] = 5/156.
- exposure leaving at 23h on a 90-minute trip:
  W_total * (share[23] + 0.5 * share[0]) = 6 * 27/156 = 162/156.
"""

import math
from datetime import datetime

import pytest

from app.core.time import GUAYAQUIL
from app.modules.routing.scoring import (
    Band,
    band_for,
    best_departure_hour,
    exposure_for_departure,
    exposures_by_departure_hour,
    has_recorded_hour,
    normalize,
    peak_hours,
    recency_weight,
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


def test_exposure_spans_the_trip_hours_pro_rated_by_minutes():
    share = shrink_toward(smooth_circular(_RAW), _UNIFORM)

    assert exposure_for_departure(share, 6.0, 23, 90) == pytest.approx(162 / 156)


def test_exposure_of_a_short_trip_is_a_fraction_of_one_hour():
    share = [0.0] * 24
    share[10] = 0.5
    share[11] = 0.5

    assert exposure_for_departure(share, 2.0, 10, 30) == pytest.approx(2.0 * 0.5 * 0.5)


def test_exposure_wraps_past_midnight_and_past_a_full_day():
    share = normalize([float(h) for h in range(24)])

    # 25 hours leaving at 22h: every hour once, plus 22h a second time.
    assert exposure_for_departure(share, 1.0, 22, 25 * 60) == pytest.approx(1.0 + share[22])


def test_exposure_of_a_zero_length_trip_is_zero():
    assert exposure_for_departure(_UNIFORM, 5.0, 8, 0) == 0


def test_exposures_by_departure_hour_has_one_value_per_hour():
    share = shrink_toward(smooth_circular(_RAW), _UNIFORM)
    exposures = exposures_by_departure_hour(share, 6.0, 90)

    assert len(exposures) == 24
    assert exposures[23] == pytest.approx(162 / 156)


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


def test_best_departure_is_the_minimum_exposure():
    exposures = [5.0] * 24
    exposures[14] = 1.0

    assert best_departure_hour(exposures) == 14


def test_best_departure_reports_the_earliest_hour_within_five_percent():
    exposures = [5.0] * 24
    exposures[14] = 1.0
    exposures[6] = 1.05  # within 5% of the minimum: earlier, so it wins
    exposures[3] = 1.06  # just outside

    assert best_departure_hour(exposures) == 6


def test_best_departure_with_no_exposure_at_all_is_midnight():
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
