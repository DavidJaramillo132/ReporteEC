"""Response shapes for GET /api/incidents and GET /api/incidents/{id}."""

from datetime import date, datetime

from pydantic import BaseModel

from app.modules.sources.schemas import SourceInfo


class IncidentListItem(BaseModel):
    id: int
    type: str
    confidence: str
    occurred_at: datetime
    date: date
    time: str
    province_code: str | None
    province_name: str | None
    canton_code: str | None
    canton_name: str | None
    lat: float
    lon: float
    source_slug: str


class IncidentListResponse(BaseModel):
    total: int
    counts_by_type: dict[str, int]
    items: list[IncidentListItem]


class IncidentDetail(IncidentListItem):
    source: SourceInfo
    source_record_id: str
