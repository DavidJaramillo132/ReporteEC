"""GET /api/stats: rate math, population scope, and what counts as a statistic.

See `app.modules.stats.service` for the exact rate formula under test here.
"""

from datetime import UTC, datetime

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.time import GUAYAQUIL
from app.modules.admin_units.models import AdminUnit, AdminUnitLevel
from app.modules.incidents.models import IncidentStatus, LocationPrecision
from app.modules.territory.models import Canton, CantonPopulation
from tests.factories import make_incident, make_source

_CANTON_GEOM = (
    "MULTIPOLYGON(((-79.90 -3.30, -79.90 -3.26, -79.86 -3.26, -79.86 -3.30, -79.90 -3.30)))"
)


def _seed_place(session: Session, code: str, province_code: str, name: str = "Test Canton") -> None:
    existing_province = session.get(AdminUnit, province_code)
    if existing_province is None:
        session.add(
            AdminUnit(
                code=province_code,
                level=AdminUnitLevel.PROVINCE,
                name="Test Province",
                province_code=None,
            )
        )
        session.flush()
    session.add(
        AdminUnit(code=code, level=AdminUnitLevel.CANTON, name=name, province_code=province_code)
    )
    session.add(
        Canton(
            code=code,
            province_code=province_code,
            name=name,
            geom=f"SRID=4326;{_CANTON_GEOM}",
            centroid="SRID=4326;POINT(-79.88 -3.28)",
        )
    )


def _seed_population(session: Session, code: str, year: int, population: int) -> None:
    session.add(CantonPopulation(canton_code=code, year=year, population=population))


def test_rate_math_by_hand_for_a_single_year(client: TestClient, db_session: Session):
    source = make_source(db_session)
    _seed_place(db_session, "0901", "09")
    _seed_population(db_session, "0901", 2025, 200_000)
    for _ in range(4):
        make_incident(
            db_session,
            source,
            occurred_at=datetime(2025, 3, 1, 8, 0, tzinfo=GUAYAQUIL),
            province_code="09",
            canton_code="0901",
        )
    db_session.commit()

    response = client.get(
        "/api/stats", params={"dimension": "canton", "year": 2025, "province": "09"}
    )

    assert response.status_code == 200
    assert response.json()["rows"] == [
        {
            "key": "0901",
            "label": "Test Canton",
            "count": 4,
            "population": 200_000,
            "rate_per_100k": 2.0,
            "low_population_warning": False,
        }
    ]


def test_rate_uses_the_same_years_population_not_a_different_years(
    client: TestClient, db_session: Session
):
    source = make_source(db_session)
    _seed_place(db_session, "0901", "09")
    _seed_population(db_session, "0901", 2024, 50_000)  # would give a very different rate
    _seed_population(db_session, "0901", 2025, 200_000)
    make_incident(
        db_session,
        source,
        occurred_at=datetime(2025, 3, 1, 8, 0, tzinfo=GUAYAQUIL),
        province_code="09",
        canton_code="0901",
    )
    db_session.commit()

    response = client.get(
        "/api/stats", params={"dimension": "canton", "year": 2025, "province": "09"}
    )

    row = response.json()["rows"][0]
    assert row["population"] == 200_000
    assert row["rate_per_100k"] == 0.5  # 1 / 200_000 * 100_000


def test_omitting_year_sums_counts_and_population_across_every_year(
    client: TestClient, db_session: Session
):
    source = make_source(db_session)
    _seed_place(db_session, "0901", "09")
    _seed_population(db_session, "0901", 2024, 100_000)
    _seed_population(db_session, "0901", 2025, 100_000)
    make_incident(
        db_session,
        source,
        occurred_at=datetime(2024, 3, 1, 8, 0, tzinfo=GUAYAQUIL),
        province_code="09",
        canton_code="0901",
    )
    make_incident(
        db_session,
        source,
        occurred_at=datetime(2025, 3, 1, 8, 0, tzinfo=GUAYAQUIL),
        province_code="09",
        canton_code="0901",
    )
    db_session.commit()

    response = client.get("/api/stats", params={"dimension": "canton", "province": "09"})

    row = response.json()["rows"][0]
    assert row["count"] == 2
    assert row["population"] == 200_000  # 100_000 summed over both years in scope
    assert row["rate_per_100k"] == 1.0  # 2 / 200_000 * 100_000


def test_month_grouping_uses_local_guayaquil_time_not_utc(client: TestClient, db_session: Session):
    source = make_source(db_session)
    # 2025-01-01 03:00 UTC is 2024-12-31 22:00 in America/Guayaquil (UTC-5):
    # a UTC-based grouping would misfile this into January of the wrong year.
    make_incident(
        db_session,
        source,
        occurred_at=datetime(2025, 1, 1, 3, 0, tzinfo=UTC),
    )
    db_session.commit()

    response = client.get("/api/stats", params={"dimension": "month", "year": 2024})

    rows = response.json()["rows"]
    assert [row["key"] for row in rows] == ["12"]
    assert rows[0]["count"] == 1


def test_located_missing_persons_are_still_counted(client: TestClient, db_session: Session):
    source = make_source(db_session)
    make_incident(
        db_session,
        source,
        type="desaparecida",
        located_at=datetime(2025, 4, 1, 8, 0, tzinfo=GUAYAQUIL),
        occurred_at=datetime(2025, 3, 1, 8, 0, tzinfo=GUAYAQUIL),
    )
    db_session.commit()

    response = client.get("/api/stats", params={"dimension": "type", "year": 2025})

    rows = {row["key"]: row["count"] for row in response.json()["rows"]}
    assert rows["desaparecida"] == 1


def test_canton_precision_homicides_are_still_counted(client: TestClient, db_session: Session):
    source = make_source(db_session)
    make_incident(
        db_session,
        source,
        type="homicidio",
        location_precision=LocationPrecision.CANTON,
        occurred_at=datetime(2025, 3, 1, 8, 0, tzinfo=GUAYAQUIL),
    )
    db_session.commit()

    response = client.get("/api/stats", params={"dimension": "type", "year": 2025})

    rows = {row["key"]: row["count"] for row in response.json()["rows"]}
    assert rows["homicidio"] == 1


def test_withdrawn_incidents_are_excluded(client: TestClient, db_session: Session):
    source = make_source(db_session)
    make_incident(
        db_session,
        source,
        status=IncidentStatus.RETIRADO,
        occurred_at=datetime(2025, 3, 1, 8, 0, tzinfo=GUAYAQUIL),
    )
    db_session.commit()

    response = client.get("/api/stats", params={"dimension": "type", "year": 2025})

    assert response.json()["rows"] == []
