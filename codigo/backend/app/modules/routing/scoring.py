"""Pure route-risk math: recency weights, the 24-hour curve, exposure, bands.

No database and no HTTP here, so every rule is unit-tested by hand (see
`tests/modules/routing/test_scoring.py`). The definitions are the V2 global
constraints, verbatim:

- recency weight `w = 0.5 ** (age_days / 365.25)` -- a one-year-old case
  weighs half;
- `raw[h]` = sum of w over the route's cases at local hour h, smoothed
  circularly with the kernel [0.25, 0.5, 0.25] over h-1, h, h+1;
- shrinkage toward the national curve:
  `share[h] = (smoothed[h] + K * national_share[h]) / (sum(raw) + K)`, K = 20;
- exposure for departure hour H = W_total * the sum of `share` over the
  hours the trip spans, starting at H and pro-rated by minutes. W_total is
  the route's summed recency weights, so this equals the documented
  "weighted cases per km x km x sum of share";
- bands 0-25 Seguro, 26-50 Precaución, 51-75 Riesgo alto, >75 Crítico.
"""

from __future__ import annotations

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


def exposure_for_departure(
    share: Sequence[float], weighted_total: float, departure_hour: int, duration_min: float
) -> float:
    """W_total x sum of `share` over the hours a trip leaving at `departure_hour` spans.

    The trip leaves at the start of the hour; every full hour counts fully
    and the last partial hour by its minutes (90 min leaving at 22h ->
    share[22] + 0.5 * share[23]). A trip longer than a day wraps around.
    """
    _check_day_curve(share)
    total_share = 0.0
    remaining = max(duration_min, 0.0)
    hour = departure_hour
    while remaining > 0:
        fraction = min(remaining, 60.0) / 60.0
        total_share += fraction * share[hour % HOURS_PER_DAY]
        remaining -= 60.0
        hour += 1
    return weighted_total * total_share


def exposures_by_departure_hour(
    share: Sequence[float], weighted_total: float, duration_min: float
) -> list[float]:
    """Exposure for each departure hour 0..23."""
    return [
        exposure_for_departure(share, weighted_total, hour, duration_min)
        for hour in range(HOURS_PER_DAY)
    ]


def best_departure_hour(exposures: Sequence[float]) -> int:
    """The departure hour with the minimum exposure.

    Hours within 5% of the minimum count as tied; the earliest (from 00h)
    is reported.
    """
    _check_day_curve(exposures)
    limit = min(exposures) * (1 + BEST_WINDOW_TOLERANCE)
    return next(hour for hour, value in enumerate(exposures) if value <= limit)


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
