"""Response shape for GET /api/meta: everything the frontend needs once, up front."""

from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field

from app.modules.sources.schemas import SourceInfo


class Period(BaseModel):
    # populate_by_name: lets the API build this with the keyword `from_=`
    # (the actual field, since `from` is a Python keyword) while it still
    # serializes as `"from"` in the JSON response (FastAPI's default
    # response_model_by_alias=True).
    model_config = ConfigDict(populate_by_name=True)

    from_: date | None = Field(default=None, alias="from")
    to: date | None = None


class SourceLastRun(BaseModel):
    slug: str
    finished_at: datetime | None


class MetaResponse(BaseModel):
    period: Period
    counts: dict[str, int]
    sources: list[SourceInfo]
    last_runs: list[SourceLastRun]
    years: list[int]
