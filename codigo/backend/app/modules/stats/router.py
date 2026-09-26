"""GET /api/stats and GET /api/stats/timeseries.

See `app.modules.stats.service` for the rate math and what each dimension
and layer mean.
"""

from typing import Literal

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.database.session import get_session
from app.modules.stats.schemas import (
    StatsResponse,
    StatsRowOut,
    TimeseriesPointOut,
    TimeseriesResponse,
)
from app.modules.stats.service import Dimension, Layer, StatsFilters, get_stats, get_timeseries

router = APIRouter(prefix="/stats", tags=["stats"])


def _split_ints(raw: str | None) -> list[int] | None:
    return [int(part) for part in raw.split(",") if part.strip()] if raw else None


def _split_strs(raw: str | None) -> list[str] | None:
    return [part.strip() for part in raw.split(",") if part.strip()] if raw else None


def _filters(
    year: int | None,
    months: str | None,
    types: str | None,
    province: str | None,
    canton: str | None,
    layer: Literal["incidents", "detentions"],
) -> StatsFilters:
    return StatsFilters(
        year=year,
        months=_split_ints(months),
        types=_split_strs(types),
        province=province,
        canton=canton,
        layer=Layer(layer),
    )


@router.get("", response_model=StatsResponse)
def stats(
    session: Session = Depends(get_session),
    dimension: Literal["type", "province", "canton", "month", "year"] = Query(...),
    year: int | None = Query(default=None),
    months: str | None = Query(default=None, description="Comma-separated, 1-12"),
    types: str | None = Query(default=None, description="Comma-separated incident types"),
    province: str | None = Query(default=None, description="Province DPA code"),
    canton: str | None = Query(default=None, description="Canton DPA code"),
    layer: Literal["incidents", "detentions"] = Query(default="incidents"),
) -> StatsResponse:
    filters = _filters(year, months, types, province, canton, layer)
    rows = get_stats(session, Dimension(dimension), filters)
    return StatsResponse(
        dimension=dimension,
        layer=layer,
        rows=[StatsRowOut.model_validate(row, from_attributes=True) for row in rows],
    )


@router.get("/timeseries", response_model=TimeseriesResponse)
def timeseries(
    session: Session = Depends(get_session),
    year: int | None = Query(default=None),
    months: str | None = Query(default=None, description="Comma-separated, 1-12"),
    types: str | None = Query(default=None, description="Comma-separated incident types"),
    province: str | None = Query(default=None, description="Province DPA code"),
    canton: str | None = Query(default=None, description="Canton DPA code"),
    layer: Literal["incidents", "detentions"] = Query(default="incidents"),
) -> TimeseriesResponse:
    filters = _filters(year, months, types, province, canton, layer)
    points = get_timeseries(session, filters)
    return TimeseriesResponse(
        layer=layer,
        points=[TimeseriesPointOut.model_validate(point, from_attributes=True) for point in points],
    )
