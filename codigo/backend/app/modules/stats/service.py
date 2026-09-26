"""GET /api/stats and GET /api/stats/timeseries: rates per 100.000 inhabitants.

Every statistic here counts ALL rows matching `status='activo'` for the
incidents layer -- including located missing persons and canton-precision
homicides, neither of which the map itself ever draws (see
`app.database.views.map_incidents`). They are statistics, not map points.
The detentions layer has no `status` column at all (see
`app.modules.detentions.models.Detention`): police activity is never
retired or merged, so every row counts.

Population comes from `canton_population` (INEC cantonal projections).
There is no province- or national-level population table, so a province's
-- or the whole country's -- population for a year is the sum of its
cantons' population for that year (`_population`, joined through
`cantons.province_code` for a province scope).

Rate math, documented once (applies to every dimension; `dimension=year`
degenerates it trivially since each row already is one year):

    rate_per_100k = count / (population summed over every year in scope) * 100_000

"Every year in scope" (`_years_in_scope`) is the single requested `year`
when one is given, or every year known to the incidents/detentions table
when it is not -- the SAME set of years for every row in one response, not
narrowed per row to only the years that row happened to have a count in
(a year with zero incidents still contributes its population to the
denominator). This makes the denominator a person-years figure: two years
of a canton's data divide by two years of its population, so the resulting
rate is comparable whether the caller asked for one year or the whole span.

`dimension=type` (and `dimension=month`/`dimension=year`) share one
population figure across every row -- the filtered area (canton, or
province, or nationwide), never a per-type population, since population
has no notion of "type." `dimension=province`/`dimension=canton` instead
give each row its own place's population.
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass
from enum import StrEnum

from sqlalchemy import ColumnElement, func, select
from sqlalchemy.orm import Session

from app.modules.admin_units.models import AdminUnit, AdminUnitLevel
from app.modules.detentions.models import Detention
from app.modules.incidents.models import Incident, IncidentStatus
from app.modules.territory.models import Canton, CantonPopulation

LOW_POPULATION_THRESHOLD = 10_000

_LOCAL_TZ = "America/Guayaquil"


class Dimension(StrEnum):
    TYPE = "type"
    PROVINCE = "province"
    CANTON = "canton"
    MONTH = "month"
    YEAR = "year"


class Layer(StrEnum):
    INCIDENTS = "incidents"
    DETENTIONS = "detentions"


@dataclass(frozen=True, slots=True)
class StatsFilters:
    year: int | None = None
    months: Sequence[int] | None = None
    types: Sequence[str] | None = None
    province: str | None = None
    canton: str | None = None
    layer: Layer = Layer.INCIDENTS


@dataclass(frozen=True, slots=True)
class StatsRow:
    key: str
    label: str
    count: int
    population: int
    rate_per_100k: float | None
    low_population_warning: bool


@dataclass(frozen=True, slots=True)
class TimeseriesPoint:
    year: int
    month: int
    count: int


def _local_year(column: ColumnElement) -> ColumnElement:
    return func.extract("year", func.timezone(_LOCAL_TZ, column))


def _local_month(column: ColumnElement) -> ColumnElement:
    return func.extract("month", func.timezone(_LOCAL_TZ, column))


def _model(layer: Layer) -> type[Incident] | type[Detention]:
    return Incident if layer == Layer.INCIDENTS else Detention


def _type_column(layer: Layer) -> ColumnElement:
    return Incident.type if layer == Layer.INCIDENTS else Detention.detention_type


def _key_column(dimension: Dimension, filters: StatsFilters) -> ColumnElement:
    model = _model(filters.layer)
    if dimension == Dimension.TYPE:
        return _type_column(filters.layer)
    if dimension == Dimension.PROVINCE:
        return model.province_code
    if dimension == Dimension.CANTON:
        return model.canton_code
    if dimension == Dimension.MONTH:
        return _local_month(model.occurred_at)
    return _local_year(model.occurred_at)


def _base_conditions(filters: StatsFilters) -> list:
    model = _model(filters.layer)
    conditions: list = []
    if filters.layer == Layer.INCIDENTS:
        conditions.append(Incident.status == IncidentStatus.ACTIVO)
    if filters.year is not None:
        conditions.append(_local_year(model.occurred_at) == filters.year)
    if filters.months:
        conditions.append(_local_month(model.occurred_at).in_(filters.months))
    if filters.types and filters.layer == Layer.INCIDENTS:
        conditions.append(Incident.type.in_(filters.types))
    if filters.province:
        conditions.append(model.province_code == filters.province)
    if filters.canton:
        conditions.append(model.canton_code == filters.canton)
    return conditions


def _years_in_scope(session: Session, filters: StatsFilters) -> list[int]:
    """The set of years every row's population denominator sums over.

    A single requested `year` narrows this to just that year; otherwise it
    is every local year the layer's own table has ever recorded a row in,
    matching or not -- the full historical span, not just the current
    filter's hits (see the module docstring).
    """
    if filters.year is not None:
        return [filters.year]
    model = _model(filters.layer)
    min_year, max_year = session.execute(
        select(func.min(_local_year(model.occurred_at)), func.max(_local_year(model.occurred_at)))
    ).one()
    if min_year is None or max_year is None:
        return []
    return list(range(int(min_year), int(max_year) + 1))


def _population(
    session: Session, years: Sequence[int], *, province: str | None, canton: str | None
) -> int:
    if not years:
        return 0
    conditions: list = [CantonPopulation.year.in_(years)]
    if canton:
        conditions.append(CantonPopulation.canton_code == canton)
    elif province:
        cantons_in_province = select(Canton.code).where(Canton.province_code == province)
        conditions.append(CantonPopulation.canton_code.in_(cantons_in_province))
    total = session.scalar(
        select(func.coalesce(func.sum(CantonPopulation.population), 0)).where(*conditions)
    )
    return int(total or 0)


def _row_scope(
    filters: StatsFilters, dimension: Dimension, key: str
) -> tuple[str | None, str | None]:
    """(province, canton) population scope for one row of the given dimension."""
    if dimension == Dimension.CANTON:
        return None, key
    if dimension == Dimension.PROVINCE:
        return key, filters.canton
    return filters.province, filters.canton


_ADMIN_LEVEL_BY_DIMENSION = {
    Dimension.PROVINCE: AdminUnitLevel.PROVINCE,
    Dimension.CANTON: AdminUnitLevel.CANTON,
}


def _labels(session: Session, dimension: Dimension, keys: Sequence[str]) -> dict[str, str]:
    """Human names for a geographic dimension's keys; every other dimension
    is left for the frontend to label (it already owns TYPE_LABEL/MONTHS)."""
    level = _ADMIN_LEVEL_BY_DIMENSION.get(dimension)
    if level is None or not keys:
        return {}
    rows = session.execute(
        select(AdminUnit.code, AdminUnit.name).where(
            AdminUnit.level == level, AdminUnit.code.in_(keys)
        )
    ).all()
    return dict(rows)


def get_stats(session: Session, dimension: Dimension, filters: StatsFilters) -> list[StatsRow]:
    key_column = _key_column(dimension, filters)
    conditions = _base_conditions(filters)

    counts = session.execute(
        select(key_column.label("key"), func.count().label("count"))
        .where(*conditions)
        .group_by(key_column)
    ).all()

    years_in_scope = _years_in_scope(session, filters)
    is_numeric_dimension = dimension in (Dimension.MONTH, Dimension.YEAR)

    def _key(raw: object) -> str:
        return str(int(raw)) if is_numeric_dimension else str(raw)

    keys = [_key(row.key) for row in counts if row.key is not None]
    labels = _labels(session, dimension, keys)

    rows: list[StatsRow] = []
    for row in counts:
        if row.key is None:
            continue
        key = _key(row.key)
        years = [int(key)] if dimension == Dimension.YEAR else years_in_scope
        province, canton = _row_scope(filters, dimension, key)
        population = _population(session, years, province=province, canton=canton)
        rate = (row.count / population * 100_000) if population > 0 else None
        rows.append(
            StatsRow(
                key=key,
                label=labels.get(key, key),
                count=row.count,
                population=population,
                rate_per_100k=rate,
                low_population_warning=0 < population < LOW_POPULATION_THRESHOLD,
            )
        )
    return rows


def get_timeseries(session: Session, filters: StatsFilters) -> list[TimeseriesPoint]:
    model = _model(filters.layer)
    conditions = _base_conditions(filters)
    year_column = _local_year(model.occurred_at)
    month_column = _local_month(model.occurred_at)

    rows = session.execute(
        select(year_column.label("year"), month_column.label("month"), func.count().label("count"))
        .where(*conditions)
        .group_by(year_column, month_column)
        .order_by(year_column, month_column)
    ).all()

    return [
        TimeseriesPoint(year=int(row.year), month=int(row.month), count=row.count) for row in rows
    ]
