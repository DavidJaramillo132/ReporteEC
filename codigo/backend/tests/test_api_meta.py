from datetime import datetime

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.time import GUAYAQUIL
from app.modules.ingestion.models import PipelineRun, RunStatus
from tests.factories import make_incident, make_source


def test_meta_reports_period_counts_sources_and_years(client: TestClient, db_session: Session):
    source = make_source(db_session)
    make_incident(db_session, source, occurred_at=datetime(2020, 3, 1, 10, 0, tzinfo=GUAYAQUIL))
    make_incident(
        db_session,
        source,
        occurred_at=datetime(2025, 12, 31, 23, 30, tzinfo=GUAYAQUIL),
        type="femicidio",
    )
    db_session.add(
        PipelineRun(
            source_id=source.id,
            file_name="homicidios.xlsx",
            file_hash="abc123",
            status=RunStatus.SUCCEEDED,
            finished_at=datetime(2026, 1, 1, 8, 0, tzinfo=GUAYAQUIL),
        )
    )
    db_session.commit()

    response = client.get("/api/meta")

    assert response.status_code == 200
    body = response.json()
    assert body["period"] == {"from": "2020-03-01", "to": "2025-12-31"}
    assert body["counts"] == {"homicidio": 1, "femicidio": 1}
    assert body["sources"][0]["slug"] == "mdi-homicidios"
    assert body["last_runs"] == [{"slug": "mdi-homicidios", "finished_at": "2026-01-01T13:00:00Z"}]
    assert body["years"] == [2020, 2025]


def test_meta_with_no_incidents_returns_empty_period(client: TestClient, db_session: Session):
    response = client.get("/api/meta")

    assert response.status_code == 200
    body = response.json()
    assert body["period"] == {"from": None, "to": None}
    assert body["counts"] == {}
    assert body["years"] == []
