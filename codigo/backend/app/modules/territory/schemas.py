"""Response shapes for GET /api/admin-units and GET /api/cantons/indicators[/summary]."""

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
    years: list[int]
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


class AdminUnitOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    code: str
    name: str
    province_code: str | None


class AdminUnitsResponse(BaseModel):
    provinces: list[AdminUnitOut]
    cantons: list[AdminUnitOut]


class PlaceOut(BaseModel):
    """A canton to pick as a route origin or destination."""

    code: str = Field(description="DPA canton code, e.g. 0901.")
    name: str = Field(description="Canton name, e.g. «Durán».")
    province_code: str | None
    province_name: str | None
    lon: float = Field(description="A point inside the canton (ST_PointOnSurface), WGS84.")
    lat: float


class PlacesSearchResponse(BaseModel):
    query: str
    places: list[PlaceOut] = Field(
        description="At most 10; names starting with the query first, then names containing it."
    )
