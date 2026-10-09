"""GET /api/cantons/indicators and .../summary: rates, quartile classes, national totals.

Reads only -- see `app.ingestion.loaders.indicators` for how
`canton_indicators` rows get written (OECO extortion, INEC ESTRA traffic
crashes as of writing).

Every canton in `cantons` (221 as of writing) is represented in
`get_canton_indicators`'s result, whether or not `canton_indicators` has a
row for it at that (indicator, year): a canton with no row is exactly
equivalent to one with `value=0` (see `_ZERO_CLASS_BY_INDICATOR` below) --
"never recorded" and "recorded as zero" both mean nothing happened.
"""

from __future__ import annotations

import re
import unicodedata
from collections.abc import Sequence
from dataclasses import dataclass
from math import ceil

from sqlalchemy import case, func, select
from sqlalchemy.orm import Session, aliased

from app.modules.territory.models import (
    AdminUnit,
    AdminUnitLevel,
    Canton,
    CantonIndicator,
    CantonPopulation,
    canton_route_point,
)

# A zero-valued canton/year never enters the rate distribution (see
# `get_canton_indicators`) and gets this label instead of a quartile class --
# worded per indicator family since "no complaints filed" (extortion) and "no
# crashes recorded" (traffic) read very differently on the map's legend.
_ZERO_CLASS_BY_INDICATOR: dict[str, str] = {
    "extorsion": "sin_denuncias",
    "secuestro_extorsivo": "sin_denuncias",
    "siniestros": "sin_registros",
    "siniestros_fallecidos": "sin_registros",
}


@dataclass(frozen=True, slots=True)
class Breakpoints:
    p25: float
    p50: float
    p75: float


@dataclass(frozen=True, slots=True)
class CantonIndicatorRow:
    code: str
    name: str
    province_code: str | None
    value: int
    population: int | None
    rate_per_100k: float | None
    indicator_class: str | None


@dataclass(frozen=True, slots=True)
class IndicatorYearTotal:
    year: int
    value: int
    population: int
    rate_per_100k: float | None


def _percentile(sorted_values: Sequence[float], fraction: float) -> float:
    """Nearest-rank percentile (1-based rank = ceil(fraction * n)).

    Chosen over linear interpolation: with at most 221 data points (one per
    canton), nearest-rank keeps every breakpoint an actual observed rate --
    easier to reason about at an exact tie (see the classification tests)
    than an interpolated value no canton actually has.
    """
    n = len(sorted_values)
    rank = max(1, ceil(fraction * n))
    return sorted_values[min(rank, n) - 1]


def compute_breakpoints(rates: Sequence[float]) -> Breakpoints | None:
    if not rates:
        return None
    ordered = sorted(rates)
    return Breakpoints(
        p25=_percentile(ordered, 0.25),
        p50=_percentile(ordered, 0.50),
        p75=_percentile(ordered, 0.75),
    )


def classify(rate: float, breakpoints: Breakpoints) -> str:
    """bajo <= p25 < moderado <= p50 < alto <= p75 < critico (each boundary inclusive below)."""
    if rate <= breakpoints.p25:
        return "bajo"
    if rate <= breakpoints.p50:
        return "moderado"
    if rate <= breakpoints.p75:
        return "alto"
    return "critico"


def get_canton_indicators(
    session: Session, indicator: str, years: Sequence[int]
) -> tuple[list[CantonIndicatorRow], Breakpoints | None, list[int], list[int]]:
    """Per-canton value, population and quartile class over the selected years.

    Only selected years present in `available_years` count. Each canton's value
    is its sum over those years and its population the sum of its population
    over the SAME years; quartiles are computed over those combined rates.
    Returns (rows, breakpoints, available_years, years actually used).
    """
    available_years = sorted(
        session.scalars(
            select(CantonIndicator.year).where(CantonIndicator.indicator == indicator).distinct()
        )
    )

    used_years = sorted(set(years) & set(available_years))

    value_by_canton: dict[str, int] = {
        code: int(total)
        for code, total in session.execute(
            select(CantonIndicator.canton_code, func.sum(CantonIndicator.value))
            .where(CantonIndicator.indicator == indicator, CantonIndicator.year.in_(used_years))
            .group_by(CantonIndicator.canton_code)
        ).all()
    }
    population_by_canton: dict[str, int] = {
        code: int(total)
        for code, total, year_count in session.execute(
            select(
                CantonPopulation.canton_code,
                func.sum(CantonPopulation.population),
                func.count(func.distinct(CantonPopulation.year)),
            )
            .where(CantonPopulation.year.in_(used_years))
            .group_by(CantonPopulation.canton_code)
        ).all()
        # A canton missing a population row for any used year has a partial
        # denominator: treat it as having no population at all.
        if year_count == len(used_years)
    }
    cantons = session.scalars(select(Canton).order_by(Canton.code)).all()

    # First pass: the rate distribution itself -- only a canton with value>0
    # AND a known, non-zero population for EVERY selected year contributes (see
    # the module docstring on why value==0 is excluded, and the class
    # docstring above on why a missing/zero population is too).
    rates: list[float] = []
    rate_by_canton: dict[str, float | None] = {}
    for canton in cantons:
        value = value_by_canton.get(canton.code, 0)
        population = population_by_canton.get(canton.code)
        if value > 0 and population:
            rate = value / population * 100_000
            rate_by_canton[canton.code] = rate
            rates.append(rate)
        else:
            rate_by_canton[canton.code] = None
    breakpoints = compute_breakpoints(rates)

    zero_class = _ZERO_CLASS_BY_INDICATOR.get(indicator)
    rows: list[CantonIndicatorRow] = []
    for canton in cantons:
        value = value_by_canton.get(canton.code, 0)
        population = population_by_canton.get(canton.code)
        rate = rate_by_canton[canton.code]
        if value == 0:
            indicator_class = zero_class
        elif rate is None or breakpoints is None:
            # value > 0 but no usable population figure for this year: no
            # rate can be computed, so no class either (never crash, never
            # guess).
            indicator_class = None
        else:
            indicator_class = classify(rate, breakpoints)
        rows.append(
            CantonIndicatorRow(
                code=canton.code,
                name=canton.name,
                province_code=canton.province_code,
                value=value,
                population=population,
                rate_per_100k=rate,
                indicator_class=indicator_class,
            )
        )
    return rows, breakpoints, available_years, used_years


def get_indicator_summary(session: Session, indicator: str) -> list[IndicatorYearTotal]:
    years = sorted(
        session.scalars(
            select(CantonIndicator.year).where(CantonIndicator.indicator == indicator).distinct()
        )
    )
    result: list[IndicatorYearTotal] = []
    for year in years:
        total_value = int(
            session.scalar(
                select(func.coalesce(func.sum(CantonIndicator.value), 0)).where(
                    CantonIndicator.indicator == indicator, CantonIndicator.year == year
                )
            )
            or 0
        )
        total_population = int(
            session.scalar(
                select(func.coalesce(func.sum(CantonPopulation.population), 0)).where(
                    CantonPopulation.year == year
                )
            )
            or 0
        )
        rate = (total_value / total_population * 100_000) if total_population > 0 else None
        result.append(
            IndicatorYearTotal(
                year=year, value=total_value, population=total_population, rate_per_100k=rate
            )
        )
    return result


# ---------------------------------------------------------------------------
# Place search (GET /api/places/search): cantons by accent-insensitive name.
# ---------------------------------------------------------------------------

PLACES_LIMIT = 10
# Lowercase accented letters Spanish names use, and their plain forms. The
# database lowercases first, so this covers uppercase too; no `unaccent`
# extension needed.
_ACCENTED = "áàäâãéèëêíìïîóòöôõúùüûñç"
_PLAIN = "aaaaaeeeeiiiiooooouuuunc"
_WHITESPACE_RE = re.compile(r"\s+")


def normalize_place_query(raw: str) -> str:
    """Lowercase, accents stripped (ñ -> n, as in the database), whitespace collapsed."""
    decomposed = unicodedata.normalize("NFKD", raw)
    plain = "".join(char for char in decomposed if not unicodedata.combining(char))
    return _WHITESPACE_RE.sub(" ", plain).strip().lower()


@dataclass(frozen=True, slots=True)
class Place:
    code: str
    name: str
    province_code: str | None
    province_name: str | None
    lon: float
    lat: float
    seat_name: str | None = None


def search_places(session: Session, query: str, limit: int = PLACES_LIMIT) -> list[Place]:
    """Cantons whose name, or whose cabecera's name, contains `query`.

    Accent- and case-insensitive. Names that start with the query rank before
    names that only contain it; alphabetical within each group. `strpos`
    instead of LIKE: no wildcard to escape in user input. The point is the
    canton's cabecera (OpenStreetMap) when loaded, else ST_PointOnSurface;
    see `canton_route_point`.
    """
    needle = normalize_place_query(query)
    plain_name = func.translate(func.lower(Canton.name), _ACCENTED, _PLAIN)
    plain_seat = func.translate(func.lower(func.coalesce(Canton.seat_name, "")), _ACCENTED, _PLAIN)
    name_position = func.strpos(plain_name, needle)
    seat_position = func.strpos(plain_seat, needle)
    starts_with = (name_position == 1) | (seat_position == 1)
    point = canton_route_point()
    province = aliased(AdminUnit)
    rows = session.execute(
        select(
            Canton.code,
            Canton.name,
            Canton.seat_name,
            Canton.province_code,
            province.name.label("province_name"),
            func.ST_X(point).label("lon"),
            func.ST_Y(point).label("lat"),
        )
        .outerjoin(
            province,
            (province.code == Canton.province_code) & (province.level == AdminUnitLevel.PROVINCE),
        )
        .where((name_position > 0) | (seat_position > 0))
        .order_by(case((starts_with, 0), else_=1), plain_name, Canton.code)
        .limit(limit)
    ).all()
    return [
        Place(
            code=row.code,
            name=row.name,
            province_code=row.province_code,
            province_name=row.province_name,
            lon=row.lon,
            lat=row.lat,
            seat_name=row.seat_name,
        )
        for row in rows
    ]
