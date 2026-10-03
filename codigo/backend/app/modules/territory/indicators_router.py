"""GET /api/cantons/indicators and GET /api/cantons/indicators/summary.

See `app.modules.territory.service` for the rate/quartile math and
what a zero-valued canton's class means.
"""

from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.core.years import resolve_years
from app.database.session import get_session
from app.modules.territory.schemas import (
    BreakpointsOut,
    CantonIndicatorRowOut,
    CantonIndicatorsResponse,
    CantonIndicatorsSummaryResponse,
    IndicatorYearTotalOut,
)
from app.modules.territory.service import get_canton_indicators, get_indicator_summary

router = APIRouter(prefix="/cantons/indicators", tags=["canton-indicators"])

# secuestro_extorsivo is loaded (see app.ingestion.adapters.oeco_extorsion)
# but not exposed here yet; adding it later is a one-line change to this tuple.
IndicatorLiteral = Literal["extorsion", "siniestros", "siniestros_fallecidos"]


@router.get("", response_model=CantonIndicatorsResponse)
def canton_indicators(
    session: Session = Depends(get_session),
    indicator: IndicatorLiteral = Query(...),
    years: str | None = Query(default=None, description="Comma-separated years; wins over `year`"),
    year: int | None = Query(default=None, description="Single year (legacy)"),
) -> CantonIndicatorsResponse:
    selected = resolve_years(years, year)
    if not selected:
        raise HTTPException(status_code=422, detail="Provide `years` or `year`.")
    rows, breakpoints, available_years, used_years = get_canton_indicators(
        session, indicator, selected
    )
    return CantonIndicatorsResponse(
        indicator=indicator,
        year=max(selected),
        years=used_years,
        available_years=available_years,
        breakpoints=BreakpointsOut.model_validate(breakpoints) if breakpoints else None,
        rows=[
            CantonIndicatorRowOut(
                code=row.code,
                name=row.name,
                province_code=row.province_code,
                value=row.value,
                population=row.population,
                rate_per_100k=row.rate_per_100k,
                class_=row.indicator_class,
            )
            for row in rows
        ],
    )


@router.get("/summary", response_model=CantonIndicatorsSummaryResponse)
def canton_indicators_summary(
    session: Session = Depends(get_session),
    indicator: IndicatorLiteral = Query(...),
) -> CantonIndicatorsSummaryResponse:
    years = get_indicator_summary(session, indicator)
    return CantonIndicatorsSummaryResponse(
        indicator=indicator,
        years=[
            IndicatorYearTotalOut.model_validate(point, from_attributes=True) for point in years
        ],
    )
