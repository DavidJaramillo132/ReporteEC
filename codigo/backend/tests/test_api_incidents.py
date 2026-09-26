from datetime import datetime

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.time import GUAYAQUIL
from app.modules.admin_units.models import AdminUnit, AdminUnitLevel
from tests.factories import make_incident, make_source


def _seed_admin_units(session: Session) -> None:
    session.add_all(
        [
            AdminUnit(code="09", level=AdminUnitLevel.PROVINCE, name="Guayas", province_code=None),
            AdminUnit(
                code="0901", level=AdminUnitLevel.CANTON, name="Guayaquil", province_code="09"
            ),
        ]
    )


def test_lists_incidents_newest_first_with_counts_and_names(
    client: TestClient, db_session: Session
):
    source = make_source(db_session)
    _seed_admin_units(db_session)
    older = make_incident(
        db_session, source, occurred_at=datetime(2025, 1, 1, 8, 0, tzinfo=GUAYAQUIL)
    )
    newer = make_incident(
        db_session, source, occurred_at=datetime(2025, 6, 1, 8, 0, tzinfo=GUAYAQUIL)
    )
    db_session.commit()

    response = client.get("/api/incidents", params={"year": 2025})

    assert response.status_code == 200
    body = response.json()
    assert body["total"] == 2
    assert body["counts_by_type"] == {"homicidio": 2}
    assert [item["id"] for item in body["items"]] == [newer.id, older.id]
    assert body["items"][0]["province_name"] == "Guayas"
    assert body["items"][0]["canton_name"] == "Guayaquil"
    assert body["items"][0]["source_slug"] == "mdi-homicidios"


def test_new_years_eve_local_time_counts_in_its_own_local_year(
    client: TestClient, db_session: Session
):
    source = make_source(db_session)
    # 2025-12-31 23:00 America/Guayaquil == 2026-01-01 04:00 UTC: must count
    # as 2025, not 2026, since year/month are computed in local time.
    make_incident(db_session, source, occurred_at=datetime(2025, 12, 31, 23, 0, tzinfo=GUAYAQUIL))
    db_session.commit()

    response_2025 = client.get("/api/incidents", params={"year": 2025})
    response_2026 = client.get("/api/incidents", params={"year": 2026})

    assert response_2025.json()["total"] == 1
    assert response_2026.json()["total"] == 0


def test_filters_by_type_and_months(client: TestClient, db_session: Session):
    source = make_source(db_session)
    make_incident(
        db_session,
        source,
        occurred_at=datetime(2025, 3, 1, 8, 0, tzinfo=GUAYAQUIL),
        type="femicidio",
    )
    make_incident(db_session, source, occurred_at=datetime(2025, 7, 1, 8, 0, tzinfo=GUAYAQUIL))
    db_session.commit()

    response = client.get("/api/incidents", params={"types": "femicidio", "months": "1,2,3"})

    assert response.json()["total"] == 1


def test_filters_by_province_and_canton(client: TestClient, db_session: Session):
    source = make_source(db_session)
    make_incident(db_session, source, province_code="09", canton_code="0901")
    make_incident(db_session, source, province_code="17", canton_code="1701")
    db_session.commit()

    response = client.get("/api/incidents", params={"province": "17"})
    assert response.json()["total"] == 1

    response = client.get("/api/incidents", params={"canton": "0901"})
    assert response.json()["total"] == 1


def test_filters_by_bbox(client: TestClient, db_session: Session):
    source = make_source(db_session)
    inside = make_incident(db_session, source, lat=-2.19, lon=-79.89)  # Guayaquil
    make_incident(db_session, source, lat=-0.18, lon=-78.47)  # Quito
    db_session.commit()

    response = client.get("/api/incidents", params={"bbox": "-80.5,-2.5,-79.5,-1.9"})

    body = response.json()
    assert body["total"] == 1
    assert body["items"][0]["id"] == inside.id


def test_pagination_limit_and_offset(client: TestClient, db_session: Session):
    source = make_source(db_session)
    for day in range(1, 6):
        occurred_at = datetime(2025, 1, day, 8, 0, tzinfo=GUAYAQUIL)
        make_incident(db_session, source, occurred_at=occurred_at)
    db_session.commit()

    first_page = client.get("/api/incidents", params={"limit": 2, "offset": 0}).json()
    second_page = client.get("/api/incidents", params={"limit": 2, "offset": 2}).json()

    assert first_page["total"] == 5
    assert len(first_page["items"]) == 2
    assert len(second_page["items"]) == 2
    assert {item["id"] for item in first_page["items"]}.isdisjoint(
        {item["id"] for item in second_page["items"]}
    )


def test_excludes_incidents_not_visible_on_the_map(client: TestClient, db_session: Session):
    source = make_source(db_session)
    make_incident(db_session, source, status="retirado")
    make_incident(db_session, source, location_precision="canton")
    make_incident(db_session, source, located_at=datetime(2025, 1, 1, tzinfo=GUAYAQUIL))
    visible = make_incident(db_session, source)
    db_session.commit()

    response = client.get("/api/incidents")

    body = response.json()
    assert body["total"] == 1
    assert body["items"][0]["id"] == visible.id


def test_get_incident_detail_includes_source(client: TestClient, db_session: Session):
    source = make_source(db_session)
    incident = make_incident(db_session, source)
    db_session.commit()

    response = client.get(f"/api/incidents/{incident.id}")

    assert response.status_code == 200
    body = response.json()
    assert body["id"] == incident.id
    assert body["source"]["slug"] == "mdi-homicidios"
    assert body["source_record_id"] == incident.source_record_id


def test_get_incident_detail_404_for_unknown_id(client: TestClient):
    response = client.get("/api/incidents/999999999")

    assert response.status_code == 404


def test_get_incident_detail_404_for_hidden_incident(client: TestClient, db_session: Session):
    source = make_source(db_session)
    hidden = make_incident(db_session, source, status="retirado")
    db_session.commit()

    response = client.get(f"/api/incidents/{hidden.id}")

    assert response.status_code == 404
