"""The reference job and the API with a stored reference, OSRM faked, in the test PostGIS."""

import re
from datetime import datetime

import httpx
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.time import GUAYAQUIL
from app.ingestion import __main__ as cli
from app.main import app
from app.modules.routing.models import DENSITY_METRIC, EXPOSURE_METRIC, RouteRiskReference
from app.modules.routing.osrm import OsrmClient
from app.modules.routing.reference import (
    CantonPoint,
    ReferenceBuildError,
    compute_reference,
    load_canton_points,
    run_route_reference,
)
from app.modules.routing.router import get_osrm_client
from app.modules.routing.scoring import band_for, score_from_breakpoints
from app.modules.routing.service import get_reference, load_national_context
from app.modules.territory.models import Canton
from tests.factories import make_incident, make_source
from tests.modules.routing.fakes import (
    HIGHWAY_SPEED_MPS,
    fake_client,
    straight_route_payload,
)

WHEN = datetime(2025, 6, 1, 21, 0, tzinfo=GUAYAQUIL)
# (code, province, west edge lon, south edge lat)
CANTONS = [
    ("0101", "01", -79.60, -2.0),
    ("0102", "01", -79.50, -2.0),
    ("0103", "01", -79.40, -2.0),
    ("0104", "01", -79.30, -2.0),  # OSRM finds no route to it
    ("0105", "01", -79.20, -2.0),  # OSRM snaps it 3 km away
    ("2001", "20", -90.50, -0.7),  # Galapagos: never sampled
]
SIZE = 0.04
_COORDS = re.compile(r"/driving/(-?[\d.]+),(-?[\d.]+);(-?[\d.]+),(-?[\d.]+)")


def _square(lon: float, lat: float) -> str:
    return (
        f"SRID=4326;MULTIPOLYGON((({lon} {lat}, {lon} {lat + SIZE}, {lon + SIZE} {lat + SIZE}, "
        f"{lon + SIZE} {lat}, {lon} {lat})))"
    )


def _seed_cantons(session: Session) -> None:
    for code, province, lon, lat in CANTONS:
        session.add(
            Canton(
                code=code,
                province_code=province,
                name=f"Canton {code}",
                geom=_square(lon, lat),
                centroid=f"SRID=4326;POINT({lon + SIZE / 2} {lat + SIZE / 2})",
            )
        )
    session.commit()


def _seed_incidents(session: Session, count: int = 3, lat: float = -1.996) -> None:
    source = make_source(session)
    for _ in range(count):
        make_incident(session, source, occurred_at=WHEN, lon=-79.58, lat=lat)
    session.commit()


def _canton_at(lon: float) -> str | None:
    for code, _, west, _ in CANTONS:
        if west <= lon <= west + SIZE:
            return code
    return None


def _osrm_for_cantons(calls: list[str] | None = None) -> OsrmClient:
    """Straight roads between canton points; 0104 has no route, 0105 snaps 3 km away."""

    def handler(request: httpx.Request) -> httpx.Response:
        match = _COORDS.search(request.url.path)
        assert match, request.url
        lon1, lat1, lon2, lat2 = map(float, match.groups())
        ends = {_canton_at(lon1), _canton_at(lon2)}
        if calls is not None:
            calls.append(request.url.path)
        if "0104" in ends:
            return httpx.Response(200, json={"code": "NoRoute", "message": "no route"})
        snap = (3000.0, 0.0) if "0105" in ends else (0.0, 0.0)
        payload = straight_route_payload(
            [(lon1, lat1), (lon2, lat2)], [HIGHWAY_SPEED_MPS], snap_distances_m=snap
        )
        return httpx.Response(200, json=payload)

    return fake_client(handler)


# --- the job ------------------------------------------------------------------


def test_job_counts_skipped_pairs_and_stores_the_distribution(
    db_session: Session, capsys: pytest.CaptureFixture[str]
):
    _seed_cantons(db_session)
    _seed_incidents(db_session, lat=-1.985)

    result = run_route_reference(db_session, _osrm_for_cantons())

    # 5 mainland cantons -> 10 pairs. 0104 or 0105 is in 7 of them; 3 route.
    assert (result.routes_ok, result.routes_skipped) == (3, 7)
    assert result.values_count == 3 * 24
    assert len(result.breakpoints) == 101
    assert result.breakpoints == sorted(result.breakpoints)
    assert result.breakpoints[-1] > 0  # the incidents sit next to the routes
    row = db_session.scalars(select(RouteRiskReference)).one()
    assert row.metric == DENSITY_METRIC
    assert list(row.breakpoints) == result.breakpoints
    assert (row.routes_ok, row.routes_skipped, row.values_count) == (3, 7, 72)
    assert row.data_cut == WHEN
    assert row.data_version and row.created_at is not None
    out = capsys.readouterr().out
    assert "3 rutas calculadas, 7 omitidas" in out
    assert "Referencia guardada" in out


def test_job_does_not_route_galapagos(db_session: Session):
    _seed_cantons(db_session)
    _seed_incidents(db_session, lat=-1.985)
    calls: list[str] = []

    run_route_reference(db_session, _osrm_for_cantons(calls))

    assert len(calls) == 10
    assert all("-90.4" not in path for path in calls)


def test_job_aborts_when_osrm_keeps_failing_and_stores_nothing(db_session: Session):
    _seed_cantons(db_session)
    _seed_incidents(db_session)
    down = fake_client(lambda request: httpx.Response(500, text="boom"))

    with pytest.raises(ReferenceBuildError, match="OSRM no responde"):
        run_route_reference(db_session, down)

    assert db_session.scalars(select(RouteRiskReference)).all() == []


def test_job_with_no_routable_pair_stores_nothing(db_session: Session):
    _seed_cantons(db_session)
    _seed_incidents(db_session)
    nowhere = fake_client({"code": "NoRoute", "message": "x"})

    with pytest.raises(ReferenceBuildError, match="Ninguna ruta"):
        run_route_reference(db_session, nowhere)

    assert db_session.scalars(select(RouteRiskReference)).all() == []


def test_job_needs_cantons_and_incidents(db_session: Session):
    with pytest.raises(ReferenceBuildError, match="cantones"):
        run_route_reference(db_session, _osrm_for_cantons())
    _seed_cantons(db_session)
    with pytest.raises(ReferenceBuildError, match="incidentes"):
        run_route_reference(db_session, _osrm_for_cantons())


def test_progress_is_reported_every_100_pairs(db_session: Session):
    _seed_incidents(db_session)
    a, b = CantonPoint("0101", "01", -79.58, -1.98), CantonPoint("0102", "01", -79.48, -1.98)
    seen: list[tuple[int, int, int]] = []

    compute_reference(
        db_session,
        _osrm_for_cantons(),
        [(a, b)] * 250,
        load_national_context(db_session),
        progress=lambda *args: seen.append(args),
    )

    assert seen == [(100, 100, 0), (200, 200, 0)]


def test_cli_wires_route_reference(monkeypatch: pytest.MonkeyPatch):
    called = []
    monkeypatch.setattr(cli, "run_route_reference", lambda: called.append(True))

    cli.main(["route-reference"])

    assert called == [True]


def test_the_sample_routes_from_canton_seats_when_they_are_loaded(db_session: Session):
    _seed_cantons(db_session)
    _seed_incidents(db_session, lat=-1.985)
    seat = (-79.5987, -1.9993)  # a corner of canton 0101, far from its PointOnSurface
    canton = db_session.get(Canton, "0101")
    canton.seat_name = "Cabecera 0101"
    canton.seat_geom = f"SRID=4326;POINT({seat[0]} {seat[1]})"
    db_session.commit()

    points = {point.code: point.point for point in load_canton_points(db_session)}
    calls: list[str] = []
    run_route_reference(db_session, _osrm_for_cantons(calls))

    assert points["0101"] == pytest.approx(seat)
    # No seat: still a point inside the canton's square.
    lon, lat = points["0102"]
    assert -79.50 < lon < -79.50 + SIZE and -2.0 < lat < -2.0 + SIZE
    from_0101 = [call for call in calls if f"{seat[0]},{seat[1]}" in call]
    assert len(from_0101) == 4  # 0101 pairs with each of the other 4 mainland cantons


# --- the API with and without a reference --------------------------------------

ROAD = [(-79.60, -2.0), (-79.55, -2.0), (-79.50, -2.0)]
PARAMS = {"from": "-79.6,-2.0", "to": "-79.5,-2.0"}


def _use_road() -> list[httpx.Request]:
    seen: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        return httpx.Response(200, json=straight_route_payload(ROAD, [HIGHWAY_SPEED_MPS] * 2))

    client = fake_client(handler)
    app.dependency_overrides[get_osrm_client] = lambda: client
    return seen


def _add_reference(
    session: Session, breakpoints: list[float], metric: str = DENSITY_METRIC
) -> RouteRiskReference:
    row = RouteRiskReference(
        metric=metric,
        breakpoints=breakpoints,
        routes_ok=1,
        routes_skipped=0,
        values_count=24,
        data_cut=WHEN,
        data_version="test",
    )
    session.add(row)
    session.commit()
    return row


def _get(client: TestClient, hour: int = 21) -> dict:
    response = client.get("/api/routes/risk", params={**PARAMS, "hour": hour})
    assert response.status_code == 200, response.text
    return response.json()


def test_without_a_reference_scores_are_null_and_unavailable(
    client: TestClient, db_session: Session
):
    _seed_incidents(db_session)
    _use_road()

    body = _get(client)

    assert any(row["density"] > 0 for row in body["hourly"])
    assert all(row["score"] is None and row["score_available"] is False for row in body["hourly"])
    assert all(row["band"] is None for row in body["hourly"])


def test_with_a_reference_scores_are_integers_and_bands_follow_band_for(
    client: TestClient, db_session: Session
):
    _seed_incidents(db_session, count=6)
    _use_road()
    # 6 cases on ~11.1 km: densities up to ~6.5 per km at the busiest hour.
    # Linear reference over 0..10: density d scores about 10 * d.
    breakpoints = [p * 0.1 for p in range(101)]
    _add_reference(db_session, breakpoints)

    body = _get(client)

    scores = []
    for row in body["hourly"]:
        assert row["score_available"] is True
        assert isinstance(row["score"], int) and 0 <= row["score"] <= 100
        assert row["score"] == score_from_breakpoints(breakpoints, row["density"])
        assert row["band"] == band_for(row["score"]).value
        assert row["band_label"] == band_for(row["score"]).label
        scores.append((row["density"], row["score"]))
    scores.sort()
    assert [s for _, s in scores] == sorted(s for _, s in scores)  # monotone in density
    assert body["selected"] == body["hourly"][21]
    assert len({s for _, s in scores}) > 1


def test_a_new_reference_changes_scores_without_rerouting(client: TestClient, db_session: Session):
    _seed_incidents(db_session, count=6)
    seen = _use_road()
    assert _get(client)["selected"]["score"] is None
    assert len(seen) == 1

    # The newest row wins; the context refreshes (TTL or restart) but the
    # cached route analysis holds densities only, so no OSRM call is repeated.
    _add_reference(db_session, [1000.0] * 101)  # old: everything scores 0
    _add_reference(db_session, [0.0] * 101)  # new: any positive density scores 100
    body = _get(client)

    assert len(seen) == 1
    assert body["selected"]["density"] > 0
    assert body["selected"]["score"] == 100
    assert body["selected"]["band"] == "critico"


def test_a_row_written_after_a_request_is_used_by_the_next_one(
    client: TestClient, db_session: Session
):
    _seed_incidents(db_session)
    _use_road()
    assert _get(client)["selected"]["score"] is None  # context and "no reference" cached

    _add_reference(db_session, [0.0] * 101)
    assert _get(client)["selected"]["score"] == 100  # no clear_caches(), no TTL wait

    _add_reference(db_session, [1000.0] * 101)
    assert _get(client)["selected"]["score"] == 0


def test_breakpoints_are_reloaded_only_when_the_newest_id_changes(db_session: Session):
    row = _add_reference(db_session, [0.0] * 101)
    assert get_reference(db_session).id == row.id
    # Same id, edited in place: the cached copy is kept (rows are immutable by design).
    row.breakpoints = [5.0] * 101
    db_session.commit()
    assert get_reference(db_session).breakpoints[0] == 0.0
    newer = _add_reference(db_session, [7.0] * 101)
    assert get_reference(db_session).id == newer.id
    assert get_reference(db_session).breakpoints[0] == 7.0


def test_a_malformed_reference_is_ignored(client: TestClient, db_session: Session):
    _seed_incidents(db_session)
    _use_road()
    _add_reference(db_session, [0.0, 1.0])

    assert _get(client)["selected"]["score_available"] is False


# --- the metric of the reference ------------------------------------------------


def test_an_exposure_reference_is_never_used_to_score(client: TestClient, db_session: Session):
    _seed_incidents(db_session)
    _use_road()
    _add_reference(db_session, [0.0] * 101, metric=EXPOSURE_METRIC)

    body = _get(client)

    assert body["selected"]["density"] > 0
    assert body["selected"]["score"] is None
    assert body["selected"]["score_available"] is False


def test_the_newest_density_reference_wins_over_a_newer_exposure_one(
    client: TestClient, db_session: Session
):
    _seed_incidents(db_session)
    _use_road()
    density = _add_reference(db_session, [1000.0] * 101)  # density: everything scores 0
    _add_reference(db_session, [0.0] * 101, metric=EXPOSURE_METRIC)  # would score 100

    assert get_reference(db_session).id == density.id
    assert _get(client)["selected"]["score"] == 0


def test_same_cases_per_km_on_routes_of_different_length_score_the_same(
    client: TestClient, db_session: Session
):
    # Short road -79.60 -> -79.50 (~11.1 km) with 2 cases; long road -79.60 ->
    # -79.40 (~22.2 km) with those 2 plus 2 more. All at 21h on the same day,
    # so both routes and the national curve share one hourly shape, and both
    # trips are under an hour: equal cases per km means equal density.
    source = make_source(db_session)
    for lon in (-79.58, -79.57, -79.45, -79.44):
        make_incident(db_session, source, occurred_at=WHEN, lon=lon, lat=-1.996)
    db_session.commit()

    def handler(request: httpx.Request) -> httpx.Response:
        lon2 = float(_COORDS.search(request.url.path).group(3))
        road = [(-79.60, -2.0), (lon2, -2.0)]
        return httpx.Response(200, json=straight_route_payload(road, [HIGHWAY_SPEED_MPS]))

    client_ = fake_client(handler)
    app.dependency_overrides[get_osrm_client] = lambda: client_
    _add_reference(db_session, [p * 0.05 for p in range(101)])

    def risk(to: str) -> dict:
        response = client.get(
            "/api/routes/risk", params={"from": "-79.6,-2.0", "to": to, "hour": 21}
        )
        assert response.status_code == 200, response.text
        return response.json()

    short, long = risk("-79.5,-2.0"), risk("-79.4,-2.0")

    assert (short["cases"]["total"], long["cases"]["total"]) == (2, 4)
    assert long["distance_km"] == pytest.approx(2 * short["distance_km"], rel=1e-3)
    assert long["cases_per_km"] == pytest.approx(short["cases_per_km"], rel=1e-3)
    for a, b in zip(short["hourly"], long["hourly"], strict=True):
        assert b["density"] == pytest.approx(a["density"], rel=1e-3)
        assert b["score"] == a["score"]
    assert short["selected"]["score"] > 0


# --- the 10 km floor on short routes ---------------------------------------------


def _one_case_route_risk(client: TestClient, db_session: Session, to_lons: list[float]) -> dict:
    """One fresh case at 21h near lon -79.598, and the risk of roads from -79.60 to each lon."""
    source = make_source(db_session)
    make_incident(db_session, source, occurred_at=WHEN, lon=-79.598, lat=-1.996)
    db_session.commit()

    def handler(request: httpx.Request) -> httpx.Response:
        lon2 = float(_COORDS.search(request.url.path).group(3))
        road = [(-79.60, -2.0), (lon2, -2.0)]
        return httpx.Response(200, json=straight_route_payload(road, [HIGHWAY_SPEED_MPS]))

    client_ = fake_client(handler)
    app.dependency_overrides[get_osrm_client] = lambda: client_
    _add_reference(db_session, [p * 0.05 for p in range(101)])
    bodies = {}
    for lon in to_lons:
        response = client.get(
            "/api/routes/risk", params={"from": "-79.6,-2.0", "to": f"{lon},-2.0", "hour": 21}
        )
        assert response.status_code == 200, response.text
        bodies[lon] = response.json()
    return bodies


def test_a_3_km_route_with_one_case_scores_like_a_10_km_route_with_one_case(
    client: TestClient, db_session: Session
):
    # ~3.0 km and ~10.0 km roads (0.027 and 0.09 degrees of longitude at lat -2).
    bodies = _one_case_route_risk(client, db_session, [-79.573, -79.51])
    short, ten = bodies[-79.573], bodies[-79.51]

    assert short["distance_km"] == pytest.approx(3.0, abs=0.05)
    assert ten["distance_km"] == pytest.approx(10.0, abs=0.05)
    assert short["cases"]["total"] == ten["cases"]["total"] == 1
    for a, b in zip(short["hourly"], ten["hourly"], strict=True):
        assert a["density"] == pytest.approx(b["density"], rel=1e-3)
        assert a["score"] == b["score"]
    # 1 case / 10 km x 24 x share[21] (0.5: the only case is at 21h, smoothed).
    assert short["selected"]["density"] == pytest.approx(0.1 * 24 * 0.5, rel=1e-3)
    # The figure shown is still the real cases per km.
    assert short["cases_per_km"] == pytest.approx(1 / short["distance_km"], rel=1e-3)


def test_a_25_km_route_keeps_its_real_distance(client: TestClient, db_session: Session):
    bodies = _one_case_route_risk(client, db_session, [-79.375])
    body = bodies[-79.375]
    km = body["distance_km"]

    assert km == pytest.approx(25.0, abs=0.05)
    assert body["cases_per_km"] == pytest.approx(1 / km, rel=1e-3)
    assert body["selected"]["density"] == pytest.approx(1 / km * 24 * 0.5, rel=1e-3)
