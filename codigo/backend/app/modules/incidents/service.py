"""Queries behind GET /api/incidents and GET /api/incidents/{id}.

Both query `map_incidents` -- the same visibility rule Martin's tiles use
(status, located_at, location_precision, minimum year, all in local time) --
joined back to `incidents`, `sources` and `admin_units` for the fields the
JSON API needs that the tile view intentionally leaves out.
"""

from sqlalchemy import Row, func, select
from sqlalchemy.orm import Session, aliased

from app.core.time import GUAYAQUIL
from app.database.views import map_incidents
from app.modules.incidents.models import Incident
from app.modules.incidents.schemas import IncidentDetail, IncidentListItem, IncidentListResponse
from app.modules.sources.models import Source
from app.modules.sources.schemas import SourceInfo
from app.modules.territory.models import AdminUnit

ProvinceUnit = aliased(AdminUnit)
CantonUnit = aliased(AdminUnit)


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


def list_incidents(
    session: Session,
    *,
    year: int | None,
    months: list[int] | None,
    types: list[str] | None,
    province: str | None,
    canton: str | None,
    bbox: tuple[float, float, float, float] | None,
    limit: int,
    offset: int,
) -> IncidentListResponse:
    conditions = _filter_conditions(
        year=year, months=months, types=types, province=province, canton=canton, bbox=bbox
    )

    total = session.scalar(select(func.count()).select_from(map_incidents).where(*conditions)) or 0

    # Ignores `types` on purpose: it must keep reporting every type's count
    # in the current area/period even while that type's own toggle is off,
    # so the filter strip's per-type counts do not vanish when pressed.
    count_conditions = _filter_conditions(
        year=year, months=months, types=None, province=province, canton=canton, bbox=bbox
    )
    counts_by_type = dict(
        session.execute(
            select(map_incidents.c.type, func.count())
            .where(*count_conditions)
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


def get_incident(session: Session, incident_id: int) -> IncidentDetail | None:
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
        return None

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
