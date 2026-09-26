"""scope=map counts only what the map draws; the default counts every case."""

from datetime import UTC, datetime

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.modules.incidents.models import IncidentType, LocationPrecision
from tests.factories import make_incident, make_source


def _counts(body: dict) -> dict[str, int]:
    return {row["key"]: row["count"] for row in body["rows"]}


def test_scope_map_excludes_located_and_canton_precision(client: TestClient, db_session: Session):
    source = make_source(db_session)
    when = datetime(2025, 3, 10, 15, tzinfo=UTC)
    make_incident(db_session, source, type=IncidentType.DESAPARECIDA, occurred_at=when)
    make_incident(
        db_session, source, type=IncidentType.DESAPARECIDA, occurred_at=when, located_at=when
    )
    make_incident(
        db_session,
        source,
        type=IncidentType.HOMICIDIO,
        occurred_at=when,
        location_precision=LocationPrecision.CANTON,
    )
    db_session.commit()

    everything = client.get("/api/stats", params={"dimension": "type", "year": 2025}).json()
    on_map = client.get(
        "/api/stats", params={"dimension": "type", "year": 2025, "scope": "map"}
    ).json()

    assert _counts(everything) == {"desaparecida": 2, "homicidio": 1}
    assert _counts(on_map) == {"desaparecida": 1}
