"""GET /api/incidents and GET /api/incidents/{id}.

Both query `map_incidents` -- the same visibility rule Martin's tiles use
(status, located_at, location_precision, minimum year, all in local time) --
joined back to `incidents`, `sources` and `admin_units` for the fields the
JSON API needs that the tile view intentionally leaves out.
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import Row, func, select
from sqlalchemy.orm import Session, aliased

from app.core.time import GUAYAQUIL
from app.database.session import get_session
from app.database.views import map_incidents
from app.modules.admin_units.models import AdminUnit
from app.modules.incidents.models import Incident
from app.modules.incidents.schemas import IncidentDetail, IncidentListItem, IncidentListResponse
from app.modules.sources.models import Source
from app.modules.sources.schemas import SourceInfo

router = APIRouter(prefix="/incidents", tags=["incidents"])

DEFAULT_LIMIT = 40
MAX_LIMIT = 200

ProvinceUnit = aliased(AdminUnit)
CantonUnit = aliased(AdminUnit)


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


def _filter_conditions(
    *,
    year: int | None,
    months: list[int] | None,
    types: list[str] | None,
    province: str | None,
    canton: str | None,
    bbox: tuple[float, float, float, float] | None,
) -> list:
    conditions = []
    if year is not None:
        conditions.append(map_incidents.c.year == year)
    if months:
        conditions.append(map_incidents.c.month.in_(months))
    if types:
        conditions.append(map_incidents.c.type.in_(types))
    if province:
        conditions.append(map_incidents.c.province_code == province)
    if canton:
        conditions.append(map_incidents.c.canton_code == canton)
    if bbox:
        min_lon, min_lat, max_lon, max_lat = bbox
        envelope = func.ST_MakeEnvelope(min_lon, min_lat, max_lon, max_lat, 4326)
        conditions.append(func.ST_Intersects(map_incidents.c.geom, envelope))
    return conditions


def _to_item(row: Row) -> IncidentListItem:
    local = row.occurred_at.astimezone(GUAYAQUIL)
    return IncidentListItem(
        id=row.id,
        type=row.type,
        confidence=row.confidence,
        occurred_at=local,
        date=local.date(),
        time=local.strftime("%H:%M"),
        province_code=row.province_code,
        province_name=row.province_name,
        canton_code=row.canton_code,
        canton_name=row.canton_name,
        lat=row.lat,
        lon=row.lon,
        source_slug=row.source_slug,
    )


def _visible_incidents_query():
    return (
        select(
            map_incidents.c.id,
            map_incidents.c.type,
            map_incidents.c.confidence,
            map_incidents.c.province_code,
            map_incidents.c.canton_code,
            Incident.occurred_at,
            func.ST_Y(map_incidents.c.geom).label("lat"),
            func.ST_X(map_incidents.c.geom).label("lon"),
            Source.slug.label("source_slug"),
            ProvinceUnit.name.label("province_name"),
            CantonUnit.name.label("canton_name"),
        )
        .select_from(map_incidents)
        .join(Incident, Incident.id == map_incidents.c.id)
        .join(Source, Source.id == Incident.source_id)
        .outerjoin(ProvinceUnit, ProvinceUnit.code == map_incidents.c.province_code)
        .outerjoin(CantonUnit, CantonUnit.code == map_incidents.c.canton_code)
    )


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
    conditions = _filter_conditions(
        year=year,
        months=_split_ints(months),
        types=_split_strs(types),
        province=province,
        canton=canton,
        bbox=_parse_bbox(bbox),
    )

    total = session.scalar(select(func.count()).select_from(map_incidents).where(*conditions)) or 0
    counts_by_type = dict(
        session.execute(
            select(map_incidents.c.type, func.count())
            .where(*conditions)
            .group_by(map_incidents.c.type)
        ).all()
    )
    rows = session.execute(
        _visible_incidents_query()
        .where(*conditions)
        .order_by(Incident.occurred_at.desc())
        .limit(limit)
        .offset(offset)
    ).all()

    return IncidentListResponse(
        total=total, counts_by_type=counts_by_type, items=[_to_item(row) for row in rows]
    )


@router.get("/{incident_id}", response_model=IncidentDetail)
def get_incident(incident_id: int, session: Session = Depends(get_session)) -> IncidentDetail:
    row = session.execute(
        _visible_incidents_query()
        .add_columns(
            Incident.source_record_id,
            Source.name.label("source_name"),
            Source.publisher.label("source_publisher"),
            Source.url.label("source_url"),
            Source.license.label("source_license"),
        )
        .where(map_incidents.c.id == incident_id)
    ).one_or_none()

    if row is None:
        raise HTTPException(status_code=404, detail="incident not found")

    return IncidentDetail(
        **_to_item(row).model_dump(),
        source_record_id=row.source_record_id,
        source=SourceInfo(
            slug=row.source_slug,
            name=row.source_name,
            publisher=row.source_publisher,
            url=row.source_url,
            license=row.source_license,
        ),
    )
