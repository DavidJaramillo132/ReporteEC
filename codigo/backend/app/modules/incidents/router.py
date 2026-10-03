"""GET /api/incidents and GET /api/incidents/{id}.

Query parsing and HTTP errors live here; the SQL is in
`app.modules.incidents.service`.
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.core.years import check_year
from app.database.session import get_session
from app.modules.incidents import service
from app.modules.incidents.schemas import IncidentDetail, IncidentListResponse

router = APIRouter(prefix="/incidents", tags=["incidents"])

DEFAULT_LIMIT = 40
MAX_LIMIT = 200


def _split_ints(raw: str | None) -> list[int] | None:
    return [int(part) for part in raw.split(",") if part.strip()] if raw else None


def _split_strs(raw: str | None) -> list[str] | None:
    return [part.strip() for part in raw.split(",") if part.strip()] if raw else None


def _parse_bbox(raw: str | None) -> tuple[float, float, float, float] | None:
    if not raw:
        return None
    parts = [part.strip() for part in raw.split(",")]
    if len(parts) != 4:
        raise HTTPException(status_code=422, detail="bbox must be minLon,minLat,maxLon,maxLat")
    try:
        min_lon, min_lat, max_lon, max_lat = (float(part) for part in parts)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail="bbox values must be numbers") from exc
    return min_lon, min_lat, max_lon, max_lat


@router.get("", response_model=IncidentListResponse)
def list_incidents(
    session: Session = Depends(get_session),
    year: int | None = Query(default=None),
    months: str | None = Query(default=None, description="Comma-separated, 1-12"),
    types: str | None = Query(default=None, description="Comma-separated incident types"),
    province: str | None = Query(default=None, description="Province DPA code"),
    canton: str | None = Query(default=None, description="Canton DPA code"),
    bbox: str | None = Query(default=None, description="minLon,minLat,maxLon,maxLat"),
    limit: int = Query(default=DEFAULT_LIMIT, ge=1, le=MAX_LIMIT),
    offset: int = Query(default=0, ge=0),
) -> IncidentListResponse:
    return service.list_incidents(
        session,
        year=check_year(year) if year is not None else None,
        months=_split_ints(months),
        types=_split_strs(types),
        province=province,
        canton=canton,
        bbox=_parse_bbox(bbox),
        limit=limit,
        offset=offset,
    )


@router.get("/{incident_id}", response_model=IncidentDetail)
def get_incident(incident_id: int, session: Session = Depends(get_session)) -> IncidentDetail:
    incident = service.get_incident(session, incident_id)
    if incident is None:
        raise HTTPException(status_code=404, detail="incident not found")
    return incident
