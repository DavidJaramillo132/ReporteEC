"""Pure route-risk math: recency weights, the 24-hour curve, density, bands.

No database and no HTTP here, so every rule is unit-tested by hand (see
`tests/modules/routing/test_scoring.py`). The definitions are the V2 global
constraints, verbatim:

- recency weight `w = 0.5 ** (age_days / 365.25)` -- a one-year-old case
  weighs half;
- `raw[h]` = sum of w over the route's cases at local hour h, smoothed
  circularly with the kernel [0.25, 0.5, 0.25] over h-1, h, h+1;
- shrinkage toward the national curve:
  `share[h] = (smoothed[h] + K * national_share[h]) / (sum(raw) + K)`, K = 20;
- density for departure hour H = (W_total / distance_km) x 24 x m(H), where
  W_total is the route's summed recency weights and m(H) the mean of
  `share` over the hours a trip leaving at H spans, weighted by the minutes
  spent in each (wrapping past midnight; a trip under 1 h gives
  m(H) = share[H]). It does not grow with the route's length: twice the
  cases on twice the kilometres is the same density. The `24 x` makes a
  flat curve (share = 1/24) give density = weighted cases per km;
- bands 0-25 Seguro, 26-50 Precaución, 51-75 Riesgo alto, >75 Crítico.
"""

from __future__ import annotations

import bisect
import math
from collections.abc import Sequence
from datetime import datetime, time
from enum import StrEnum

HOURS_PER_DAY = 24
HALF_LIFE_DAYS = 365.25
SMOOTHING_KERNEL = (0.25, 0.5, 0.25)
SHRINKAGE_K = 20.0
BEST_WINDOW_TOLERANCE = 0.05
BLACKSPOT_MIN_WEIGHTED_CASES = 3.0
BLACKSPOT_TOP_FRACTION = 0.10
MAX_BLACKSPOTS = 5
PEAK_HOURS = 3


def recency_weight(age_days: float) -> float:
    """Weight of a case `age_days` before the data cut (halves every 365.25 days).

    A negative age (a case after the cut, which the cut's definition rules
    out) is clamped to 0 so no case ever weighs more than 1.
    """
    return 0.5 ** (max(age_days, 0.0) / HALF_LIFE_DAYS)


def has_recorded_hour(local_time: datetime) -> bool:
    """False for exactly 00:00:00 local: the sources store a missing hour as midnight.

    Such a case still counts (in totals, W_total and blackspots) but tells
    nothing about the hour of day, so it never feeds an hourly curve.
    """
    return local_time.time() != time(0, 0)


def _check_day_curve(values: Sequence[float]) -> None:
    if len(values) != HOURS_PER_DAY:
        raise ValueError(f"expected {HOURS_PER_DAY} hourly values, got {len(values)}")


def smooth_circular(raw: Sequence[float]) -> list[float]:
    """Smooth a 24-hour curve with [0.25, 0.5, 0.25]; 23h and 00h are neighbours.

    The kernel sums to 1, so the total is preserved.
    """
    _check_day_curve(raw)
    before, center, after = SMOOTHING_KERNEL
    return [
        before * raw[(h - 1) % HOURS_PER_DAY]
        + center * raw[h]
        + after * raw[(h + 1) % HOURS_PER_DAY]
        for h in range(HOURS_PER_DAY)
    ]


def normalize(values: Sequence[float]) -> list[float]:
    """Scale a 24-hour curve to sum 1; an all-zero curve becomes uniform."""
    _check_day_curve(values)
    total = sum(values)
    if total <= 0:
        return [1.0 / HOURS_PER_DAY] * HOURS_PER_DAY
    return [value / total for value in values]


def shrink_toward(
    smoothed: Sequence[float], national_share: Sequence[float], k: float = SHRINKAGE_K
) -> list[float]:
    """`share[h] = (smoothed[h] + k * national_share[h]) / (sum(raw) + k)`.

    `sum(smoothed)` equals `sum(raw)` (the kernel preserves totals). With no
    route cases the share is the national curve; with many it follows the
    route.
    """
    _check_day_curve(smoothed)
    _check_day_curve(national_share)
    denominator = sum(smoothed) + k
    return [(s + k * n) / denominator for s, n in zip(smoothed, national_share, strict=True)]


def mean_share_for_departure(
    share: Sequence[float], departure_hour: int, duration_min: float
) -> float:
    """Mean of `share` over the hours a trip leaving at `departure_hour` spans.

    Each hour weighs the minutes the trip spends in it: the trip leaves at
    the start of the hour, every full hour counts fully and the last partial
    hour by its minutes (90 min leaving at 22h ->
    (share[22] + 0.5 * share[23]) / 1.5). A trip of 1 h or less is
    `share[departure_hour]`. A trip longer than a day wraps around.
    """
    _check_day_curve(share)
    if duration_min <= 60.0:
        return share[departure_hour % HOURS_PER_DAY]
    summed = 0.0
    remaining = duration_min
    hour = departure_hour
    while remaining > 0:
        summed += min(remaining, 60.0) / 60.0 * share[hour % HOURS_PER_DAY]
        remaining -= 60.0
        hour += 1
    return summed / (duration_min / 60.0)


def density_for_departure(
    share: Sequence[float], cases_per_km: float, departure_hour: int, duration_min: float
) -> float:
    """`cases_per_km x 24 x m(H)`: weighted cases per km, scaled by the trip's hours.

    `cases_per_km` is W_total / distance_km. With a flat curve the density
    equals `cases_per_km`; at an hour twice as busy as average, twice that.
    """
    return (
        cases_per_km * HOURS_PER_DAY * mean_share_for_departure(share, departure_hour, duration_min)
    )


def densities_by_departure_hour(
    share: Sequence[float], cases_per_km: float, duration_min: float
) -> list[float]:
    """Density for each departure hour 0..23."""
    return [
        density_for_departure(share, cases_per_km, hour, duration_min)
        for hour in range(HOURS_PER_DAY)
    ]


def best_departure_hour(densities: Sequence[float]) -> int:
    """The departure hour with the minimum density.

    Hours within 5% of the minimum count as tied; the earliest (from 00h)
    is reported. Cases per km are the same at every hour, so this is also
    the hour with the lowest mean share over the trip.
    """
    _check_day_curve(densities)
    limit = min(densities) * (1 + BEST_WINDOW_TOLERANCE)
    return next(hour for hour, value in enumerate(densities) if value <= limit)


class Band(StrEnum):
    """Semáforo bands; `value` is the stable API key, `label` the Spanish text."""

    SEGURO = "seguro"
    PRECAUCION = "precaucion"
    RIESGO_ALTO = "riesgo_alto"
    CRITICO = "critico"

    @property
    def label(self) -> str:
        return _BAND_LABELS[self]


_BAND_LABELS = {
    Band.SEGURO: "Seguro",
    Band.PRECAUCION: "Precaución",
    Band.RIESGO_ALTO: "Riesgo alto",
    Band.CRITICO: "Crítico",
}


def band_for(score: float) -> Band:
    """0-25 Seguro, 26-50 Precaución, 51-75 Riesgo alto, >75 Crítico.

    Scores are whole numbers 0-100; each upper boundary is inclusive.
    """
    if not 0 <= score <= 100:  # also rejects NaN
        raise ValueError(f"score must be within 0-100, got {score}")
    if score <= 25:
        return Band.SEGURO
    if score <= 50:
        return Band.PRECAUCION
    if score <= 75:
        return Band.RIESGO_ALTO
    return Band.CRITICO


def select_blackspot_pieces(piece_weights: Sequence[float]) -> list[int]:
    """Indices of the 1 km pieces that are blackspots, heaviest first (max 5).

    A piece qualifies with weighted cases >= 3 AND in the route's top 10%:
    at least as heavy as the k-th heaviest piece, k = ceil(10% of the
    pieces) (min 1), so ties at the cut are kept. Equal weights list the
    earlier km first.
    """
    if not piece_weights:
        return []
    top_count = max(1, math.ceil(BLACKSPOT_TOP_FRACTION * len(piece_weights)))
    cut = sorted(piece_weights, reverse=True)[top_count - 1]
    threshold = max(cut, BLACKSPOT_MIN_WEIGHTED_CASES)
    qualifying = [index for index, weight in enumerate(piece_weights) if weight >= threshold]
    qualifying.sort(key=lambda index: (-piece_weights[index], index))
    return qualifying[:MAX_BLACKSPOTS]


def peak_hours(weight_by_hour: Sequence[float], count: int = PEAK_HOURS) -> list[int]:
    """The `count` heaviest hours that have any case, heaviest first (ties: earlier hour)."""
    _check_day_curve(weight_by_hour)
    ranked = sorted(
        (hour for hour in range(HOURS_PER_DAY) if weight_by_hour[hour] > 0),
        key=lambda hour: (-weight_by_hour[hour], hour),
    )
    return ranked[:count]


# ---------------------------------------------------------------------------
# The 0-100 scale: percentile of density against a reference distribution.
# ---------------------------------------------------------------------------

BREAKPOINT_COUNT = 101  # percentiles 0..100


def percentile_breakpoints(values: Sequence[float]) -> list[float]:
    """The 101 percentiles (0..100) of `values`, linearly interpolated.

    Same convention as numpy's default: percentile p sits at sorted position
    `p / 100 * (n - 1)`. The result is non-decreasing. With heavy ties (for
    example many routes with density exactly 0) many breakpoints are equal.
    """
    if not values:
        raise ValueError("cannot build breakpoints from an empty sample")
    ordered = sorted(values)
    last = len(ordered) - 1
    points = []
    for p in range(BREAKPOINT_COUNT):
        position = p / 100 * last
        low = int(math.floor(position))
        high = min(low + 1, last)
        points.append(ordered[low] + (ordered[high] - ordered[low]) * (position - low))
    return points


def score_from_breakpoints(breakpoints: Sequence[float], value: float) -> int:
    """Whole 0-100 score of `value` (a density) against 101 percentile breakpoints.

    Method: p = the largest integer with `breakpoints[p] <= value` (the
    percentile the value reaches; with ties it is the top of the tie).
    Between breakpoints p and p + 1 the score is interpolated linearly and
    rounded half up to a whole number. Clamped to 0-100: below the lowest
    reference value is 0, at or above the highest is 100.

    A value <= 0 is always 0: a route with no registered case nearby is the
    lowest band even when more than a quarter of the reference routes also
    have none (then breakpoints 0..k are all 0 and the tie rule alone would
    give such a route a score of k). Monotone: a higher value never scores
    lower.
    """
    if len(breakpoints) != BREAKPOINT_COUNT:
        raise ValueError(f"expected {BREAKPOINT_COUNT} breakpoints, got {len(breakpoints)}")
    if not value > 0:  # also NaN
        return 0
    p = bisect.bisect_right(breakpoints, value) - 1
    if p < 0:
        return 0
    if p >= BREAKPOINT_COUNT - 1:
        return 100
    low, high = breakpoints[p], breakpoints[p + 1]
    # bisect_right guarantees high > value >= low, so high > low.
    fractional = p + (value - low) / (high - low)
    return max(0, min(100, math.floor(fractional + 0.5)))
