"""Response shapes for GET /api/cantons/indicators and .../summary."""

from pydantic import BaseModel, ConfigDict, Field


class BreakpointsOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    p25: float
    p50: float
    p75: float


class CantonIndicatorRowOut(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    code: str
    name: str
    province_code: str | None
    value: int
    population: int | None
    rate_per_100k: float | None
    # "class" is a Python keyword; the wire field (and what the frontend
    # reads) is exactly "class", per the API contract.
    class_: str | None = Field(alias="class")


class CantonIndicatorsResponse(BaseModel):
    indicator: str
    year: int
    available_years: list[int]
    breakpoints: BreakpointsOut | None
    rows: list[CantonIndicatorRowOut]


class IndicatorYearTotalOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    year: int
    value: int
    population: int
    rate_per_100k: float | None


class CantonIndicatorsSummaryResponse(BaseModel):
    indicator: str
    years: list[IndicatorYearTotalOut]
