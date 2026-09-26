"""Response shapes for GET /api/stats and GET /api/stats/timeseries."""

from pydantic import BaseModel, ConfigDict


class StatsRowOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    key: str
    label: str
    count: int
    population: int
    rate_per_100k: float | None
    low_population_warning: bool


class StatsResponse(BaseModel):
    dimension: str
    layer: str
    rows: list[StatsRowOut]


class TimeseriesPointOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    year: int
    month: int
    count: int


class TimeseriesResponse(BaseModel):
    layer: str
    points: list[TimeseriesPointOut]
