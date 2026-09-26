"""Minimal ORM factories for API tests: build rows directly, no XLSX involved."""

from datetime import datetime

from sqlalchemy.orm import Session

from app.core.time import GUAYAQUIL
from app.modules.incidents.models import (
    Confidence,
    Incident,
    IncidentStatus,
    IncidentType,
    LocationPrecision,
)
from app.modules.sources.models import Source

_counter = 0


def make_source(session: Session, slug: str = "mdi-homicidios") -> Source:
    source = Source(
        slug=slug,
        name="Homicidios intencionales",
        publisher="Ministerio del Interior",
        url="https://www.datosabiertos.gob.ec/dataset/homicidios-intencionales",
        license="Datos abiertos del Gobierno del Ecuador (datosabiertos.gob.ec)",
    )
    session.add(source)
    session.flush()
    return source


def make_incident(
    session: Session,
    source: Source,
    *,
    occurred_at: datetime | None = None,
    lat: float = -2.19,
    lon: float = -79.89,
    **overrides,
) -> Incident:
    global _counter
    _counter += 1

    values = {
        "source_id": source.id,
        "source_record_id": f"test-record-{_counter}",
        "type": IncidentType.HOMICIDIO,
        "confidence": Confidence.OFICIAL,
        "status": IncidentStatus.ACTIVO,
        "occurred_at": occurred_at or datetime(2025, 6, 1, 12, 0, tzinfo=GUAYAQUIL),
        "location_precision": LocationPrecision.EXACTA,
        "province_code": "09",
        "canton_code": "0901",
        "located_at": None,
    }
    values.update(overrides)

    incident = Incident(**values, geom=f"SRID=4326;POINT({lon} {lat})")
    session.add(incident)
    session.flush()
    return incident
