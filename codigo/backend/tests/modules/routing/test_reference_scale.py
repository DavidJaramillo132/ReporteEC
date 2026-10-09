"""The 0-100 scale: percentile breakpoints and the exposure -> score mapping (pure math)."""

import pytest

from app.modules.routing.scoring import (
    BREAKPOINT_COUNT,
    Band,
    band_for,
    percentile_breakpoints,
    score_from_breakpoints,
)
from app.modules.routing.service import no_reference_score, reference_score_fn

# Breakpoint p = p / 10, so exposure e sits at percentile 10 * e.
LINEAR = [p / 10 for p in range(BREAKPOINT_COUNT)]


def test_breakpoints_are_the_linearly_interpolated_percentiles():
    points = percentile_breakpoints([0.0, 10.0])
    assert len(points) == 101
    assert points[0] == 0.0
    assert points[50] == pytest.approx(5.0)
    assert points[100] == 10.0
    # Five values: percentile 25 is exactly the 2nd (position 1 of 0..4).
    assert percentile_breakpoints([5, 1, 4, 2, 3])[25] == pytest.approx(2.0)


def test_breakpoints_of_one_value_are_all_that_value_and_empty_is_an_error():
    assert percentile_breakpoints([3.0]) == [3.0] * 101
    with pytest.raises(ValueError):
        percentile_breakpoints([])


def test_breakpoints_never_decrease():
    points = percentile_breakpoints([9, 0, 0, 3, 0, 7.5, 1, 1, 2, 100])
    assert points == sorted(points)


@pytest.mark.parametrize(
    ("exposure", "score"),
    [
        (0.0, 0),
        (0.04, 0),  # 0.4 of the way to breakpoint 1: rounds down
        (0.06, 1),  # 0.6: rounds up
        (0.25, 3),  # p = 2, 0.5 of the way: .5 rounds half up
        (5.0, 50),  # exactly on a breakpoint
        (9.99, 100),  # 99.9 rounds to 100
        (10.0, 100),
        (500.0, 100),  # above the highest breakpoint: clamped
    ],
)
def test_score_interpolates_between_breakpoints_and_rounds(exposure: float, score: int):
    assert score_from_breakpoints(LINEAR, exposure) == score


def test_exposure_below_the_lowest_breakpoint_is_zero():
    shifted = [5.0 + p for p in range(101)]
    assert score_from_breakpoints(shifted, 1.0) == 0
    assert score_from_breakpoints(shifted, 5.0) == 0
    assert score_from_breakpoints(shifted, 6.0) == 1


def test_ties_take_the_top_of_the_tie_but_zero_exposure_stays_zero():
    # 40% of the reference sample has exactly zero exposure: breakpoints 0..40 are 0.
    tied = [0.0] * 41 + [float(p - 40) for p in range(41, 101)]
    # A positive exposure reaches the largest percentile it ties with or passes.
    assert score_from_breakpoints(tied, 0.0001) == 40
    # ...but no registered case near the route is the lowest score, never 40.
    assert score_from_breakpoints(tied, 0.0) == 0
    assert score_from_breakpoints(tied, 1.0) == 41


def test_all_zero_reference_scores_any_positive_exposure_100():
    flat = [0.0] * 101
    assert score_from_breakpoints(flat, 0.0) == 0
    assert score_from_breakpoints(flat, 0.001) == 100


def test_higher_exposure_never_scores_lower():
    breakpoints = percentile_breakpoints([0, 0, 0, 0.2, 0.2, 1, 1, 1, 3, 8, 8, 20, 55])
    exposures = [i * 0.37 for i in range(0, 200)]
    scores = [score_from_breakpoints(breakpoints, e) for e in exposures]
    assert scores == sorted(scores)
    assert all(0 <= s <= 100 and isinstance(s, int) for s in scores)


def test_nan_and_negative_exposure_score_zero():
    assert score_from_breakpoints(LINEAR, float("nan")) == 0
    assert score_from_breakpoints(LINEAR, -3.0) == 0


def test_wrong_number_of_breakpoints_is_rejected():
    with pytest.raises(ValueError):
        score_from_breakpoints([0.0, 1.0], 0.5)


def test_scores_map_to_the_documented_bands():
    fn = reference_score_fn(LINEAR)
    assert band_for(fn(2.5)) is Band.SEGURO  # 25
    assert band_for(fn(2.6)) is Band.PRECAUCION  # 26
    assert band_for(fn(7.6)) is Band.CRITICO  # 76


def test_no_reference_means_no_score():
    assert no_reference_score(12.3) is None
