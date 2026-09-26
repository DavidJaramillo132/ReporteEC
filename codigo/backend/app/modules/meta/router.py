"""GET /api/meta: period, counts, sources and available years, in one call."""

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.time import GUAYAQUIL
from app.database.session import get_session
from app.database.views import map_incidents
from app.modules.incidents.models import Incident
from app.modules.ingestion.models import PipelineRun, RunStatus
from app.modules.meta.schemas import MetaResponse, Period, SourceLastRun
from app.modules.sources.models import Source
from app.modules.sources.schemas import SourceInfo

router = APIRouter(tags=["meta"])


@router.get("/meta", response_model=MetaResponse)
def get_meta(session: Session = Depends(get_session)) -> MetaResponse:
    visible = map_incidents.join(Incident, Incident.id == map_incidents.c.id)

    min_occurred, max_occurred = session.execute(
        select(func.min(Incident.occurred_at), func.max(Incident.occurred_at)).select_from(visible)
    ).one()
    period = Period(
        from_=min_occurred.astimezone(GUAYAQUIL).date() if min_occurred else None,
        to=max_occurred.astimezone(GUAYAQUIL).date() if max_occurred else None,
    )

    counts = dict(
        session.execute(
            select(map_incidents.c.type, func.count()).group_by(map_incidents.c.type)
        ).all()
    )

    sources = [
        SourceInfo.model_validate(row, from_attributes=True)
        for row in session.execute(
            select(Source.slug, Source.name, Source.publisher, Source.url, Source.license).order_by(
                Source.slug
            )
        ).all()
    ]

    last_run_per_source = (
        select(PipelineRun.source_id, func.max(PipelineRun.finished_at).label("finished_at"))
        .where(PipelineRun.status == RunStatus.SUCCEEDED)
        .group_by(PipelineRun.source_id)
        .subquery()
    )
    last_runs = [
        SourceLastRun(slug=slug, finished_at=finished_at)
        for slug, finished_at in session.execute(
            select(Source.slug, last_run_per_source.c.finished_at).join(
                last_run_per_source, last_run_per_source.c.source_id == Source.id
            )
        ).all()
    ]

    years = [
        year
        for (year,) in session.execute(
            select(map_incidents.c.year).distinct().order_by(map_incidents.c.year)
        ).all()
    ]

    return MetaResponse(
        period=period, counts=counts, sources=sources, last_runs=last_runs, years=years
    )
