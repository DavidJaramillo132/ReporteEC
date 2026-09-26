"""GET /api/cantons/indicators and .../summary: quartile classes, zero handling,
population-year correctness, and the 422 contract for an unknown indicator.

See `app.modules.canton_indicators.service` for the rate/percentile math
under test here.
"""

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.modules.admin_units.models import AdminUnit, AdminUnitLevel
from app.modules.canton_indicators.service import Breakpoints, classify, compute_breakpoints
from app.modules.territory.models import Canton, CantonIndicator, CantonPopulation
from tests.factories import make_source

_CANTON_GEOM = (
    "MULTIPOLYGON(((-79.90 -3.30, -79.90 -3.26, -79.86 -3.26, -79.86 -3.30, -79.90 -3.30)))"
)


def _seed_canton(session: Session, code: str, name: str, province_code: str = "09") -> None:
    if session.get(AdminUnit, province_code) is None:
        session.add(
            AdminUnit(
                code=province_code,
                level=AdminUnitLevel.PROVINCE,
                name="Test Province",
                province_code=None,
            )
        )
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


def _seed_indicator(
    session: Session, source_id: int, code: str, year: int, value: int, *, month: int = 1
) -> None:
    session.add(
        CantonIndicator(
            indicator="siniestros",
            canton_code=code,
            year=year,
            month=month,
            value=value,
            source_id=source_id,
        )
    )


def _seed_population(session: Session, code: str, year: int, population: int) -> None:
    session.add(CantonPopulation(canton_code=code, year=year, population=population))


# ---------------------------------------------------------------------------
# Pure percentile/classification math (see service.compute_breakpoints/classify).
# ---------------------------------------------------------------------------


def test_nearest_rank_breakpoints_on_four_points():
    breakpoints = compute_breakpoints([10.0, 20.0, 30.0, 40.0])
    assert breakpoints == Breakpoints(p25=10.0, p50=20.0, p75=30.0)


def test_classification_is_inclusive_below_each_breakpoint_exact_ties_included():
    breakpoints = Breakpoints(p25=10.0, p50=20.0, p75=30.0)
    assert classify(10.0, breakpoints) == "bajo"  # == p25
    assert classify(15.0, breakpoints) == "moderado"
    assert classify(20.0, breakpoints) == "moderado"  # == p50, not "alto"
    assert classify(25.0, breakpoints) == "alto"
    assert classify(30.0, breakpoints) == "alto"  # == p75, not "critico"
    assert classify(30.01, breakpoints) == "critico"


def test_compute_breakpoints_of_an_empty_distribution_is_none():
    assert compute_breakpoints([]) is None


# ---------------------------------------------------------------------------
# GET /api/cantons/indicators
# ---------------------------------------------------------------------------


def test_quartile_classes_end_to_end_through_the_api(client: TestClient, db_session: Session):
    source = make_source(db_session, slug="inec-estra")
    # Four cantons whose rate_per_100k works out to exactly 10, 20, 30, 40 --
    # the same fixture as the pure breakpoints test above, driven through
    # real CantonIndicator/CantonPopulation rows this time.
    for code, value, population in (
        ("0901", 10, 100_000),
        ("0902", 10, 50_000),
        ("0903", 15, 50_000),
        ("0904", 20, 50_000),
    ):
        _seed_canton(db_session, code, f"Canton {code}")
        _seed_indicator(db_session, source.id, code, 2025, value)
        _seed_population(db_session, code, 2025, population)
    db_session.commit()

    response = client.get(
        "/api/cantons/indicators", params={"indicator": "siniestros", "year": 2025}
    )

    assert response.status_code == 200
    body = response.json()
    # 15 / 50_000 * 100_000 == 30.0 mathematically, but not always exactly in
    # IEEE 754 float -- pytest.approx tolerates that without weakening what
    # this test actually checks (the exact-tie classification below).
    assert body["breakpoints"] == pytest.approx({"p25": 10.0, "p50": 20.0, "p75": 30.0})
    rows = {row["code"]: row for row in body["rows"]}
    assert rows["0901"]["rate_per_100k"] == 10.0
    assert rows["0901"]["class"] == "bajo"
    assert rows["0902"]["class"] == "moderado"  # rate 20, exact tie at p50
    assert rows["0903"]["class"] == "alto"  # rate 30, exact tie at p75
    assert rows["0904"]["class"] == "critico"  # rate 40


def test_zero_value_canton_gets_the_no_data_class_and_no_rate(
    client: TestClient, db_session: Session
):
    source = make_source(db_session, slug="inec-estra")
    _seed_canton(db_session, "0901", "Has Crashes")
    _seed_indicator(db_session, source.id, "0901", 2025, 5)
    _seed_population(db_session, "0901", 2025, 100_000)
    # A canton with no canton_indicators row at all for this year: exactly
    # equivalent to one recorded with value=0 (see the service docstring).
    _seed_canton(db_session, "0902", "No Crashes")
    _seed_population(db_session, "0902", 2025, 100_000)
    db_session.commit()

    response = client.get(
        "/api/cantons/indicators", params={"indicator": "siniestros", "year": 2025}
    )

    rows = {row["code"]: row for row in response.json()["rows"]}
    assert rows["0902"]["value"] == 0
    assert rows["0902"]["class"] == "sin_registros"
    assert rows["0902"]["rate_per_100k"] is None
    # A zero-valued canton never enters the rate distribution: with 0901 as
    # the only non-zero canton, it is the whole distribution (p25=p50=p75=
    # its own rate) and so classifies as "bajo" (<= p25).
    assert rows["0901"]["class"] == "bajo"
    assert rows["0901"]["rate_per_100k"] == 5.0


def test_value_without_a_population_row_gets_no_rate_and_no_class(
    client: TestClient, db_session: Session
):
    source = make_source(db_session, slug="inec-estra")
    _seed_canton(db_session, "0901", "No Population Data")
    _seed_indicator(db_session, source.id, "0901", 2025, 5)
    # No CantonPopulation row seeded for 2025 at all.
    db_session.commit()

    response = client.get(
        "/api/cantons/indicators", params={"indicator": "siniestros", "year": 2025}
    )

    row = next(r for r in response.json()["rows"] if r["code"] == "0901")
    assert row["value"] == 5
    assert row["population"] is None
    assert row["rate_per_100k"] is None
    assert row["class"] is None


def test_population_is_pulled_from_the_same_year_as_the_indicator(
    client: TestClient, db_session: Session
):
    source = make_source(db_session, slug="inec-estra")
    _seed_canton(db_session, "0901", "Guayaquil")
    _seed_indicator(db_session, source.id, "0901", 2025, 10)
    _seed_population(db_session, "0901", 2024, 20_000)  # would give a very different rate
    _seed_population(db_session, "0901", 2025, 100_000)
    db_session.commit()

    response = client.get(
        "/api/cantons/indicators", params={"indicator": "siniestros", "year": 2025}
    )

    row = next(r for r in response.json()["rows"] if r["code"] == "0901")
    assert row["population"] == 100_000
    assert row["rate_per_100k"] == 10.0


def test_available_years_lists_every_year_the_indicator_has_data_for(
    client: TestClient, db_session: Session
):
    source = make_source(db_session, slug="inec-estra")
    _seed_canton(db_session, "0901", "Guayaquil")
    _seed_indicator(db_session, source.id, "0901", 2023, 1)
    _seed_indicator(db_session, source.id, "0901", 2025, 2)
    db_session.commit()

    response = client.get(
        "/api/cantons/indicators", params={"indicator": "siniestros", "year": 2025}
    )

    assert response.json()["available_years"] == [2023, 2025]


def test_unknown_indicator_is_a_422(client: TestClient):
    response = client.get("/api/cantons/indicators", params={"indicator": "bogus", "year": 2025})
    assert response.status_code == 422


# ---------------------------------------------------------------------------
# GET /api/cantons/indicators/summary
# ---------------------------------------------------------------------------


def test_summary_gives_national_yearly_totals_and_a_population_weighted_rate(
    client: TestClient, db_session: Session
):
    source = make_source(db_session, slug="inec-estra")
    _seed_canton(db_session, "0901", "A")
    _seed_canton(db_session, "0902", "B")
    _seed_indicator(db_session, source.id, "0901", 2024, 4)
    _seed_indicator(db_session, source.id, "0902", 2024, 6)
    _seed_population(db_session, "0901", 2024, 50_000)
    _seed_population(db_session, "0902", 2024, 50_000)
    db_session.commit()

    response = client.get("/api/cantons/indicators/summary", params={"indicator": "siniestros"})

    assert response.status_code == 200
    assert response.json()["years"] == [
        {"year": 2024, "value": 10, "population": 100_000, "rate_per_100k": 10.0}
    ]
