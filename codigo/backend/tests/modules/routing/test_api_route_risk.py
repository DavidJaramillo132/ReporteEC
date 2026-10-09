"""GET /api/routes/risk end to end, with OSRM faked and incidents in the test PostGIS.

The synthetic route is a straight east-west road along lat -2.0 from lon
-79.60 to -79.50 (~11.11 km). Incidents are placed due north of its midpoint
at a chosen distance, so the buffer edges (1,000 m highway / 200 m urban)
are tested in meters.
"""

import gc
import threading
from datetime import UTC, datetime, timedelta
from types import FunctionType, ModuleType

import httpx
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import event
from sqlalchemy.orm import Session

from app.core.time import GUAYAQUIL
from app.main import app
from app.modules.incidents.models import IncidentStatus, IncidentType, LocationPrecision
from app.modules.routing.geometry import RoutePiece
from app.modules.routing.osrm import OsrmRoute, parse_route
from app.modules.routing.router import get_osrm_client
from app.modules.routing.scoring import SHRINKAGE_K
from app.modules.routing.service import (
    NOTES,
    RouteAnalysis,
    RouteCase,
    RouteDensity,
    WeightedCase,
    _national_cache,
    _route_cache,
    compute_route_density,
    load_national_context,
)
from tests.factories import make_incident, make_source
from tests.modules.routing.fakes import (
    HIGHWAY_SPEED_MPS,
    URBAN_SPEED_MPS,
    fake_client,
    load_fixture,
    meters_to_lat_degrees,
    straight_route_payload,
)

ROAD_LAT = -2.0
ROAD = [(-79.60, ROAD_LAT), (-79.55, ROAD_LAT), (-79.50, ROAD_LAT)]
FROM, TO = "-79.6,-2.0", "-79.5,-2.0"
WHEN = datetime(2025, 6, 1, 12, 0, tzinfo=GUAYAQUIL)


def _use_osrm(answer) -> list[httpx.Request]:
    """Answer every OSRM request with `answer`; return the list of requests seen."""
    seen: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        if callable(answer):
            return answer(request)
        return httpx.Response(200, json=answer)

    client = fake_client(handler)
    app.dependency_overrides[get_osrm_client] = lambda: client
    return seen


def clear_national_context() -> None:
    _national_cache.clear()


def _road(speed_mps: float) -> dict:
    return straight_route_payload(ROAD, [speed_mps, speed_mps])


def _north_of_road(meters: float, lon: float = -79.55) -> dict:
    return {"lon": lon, "lat": ROAD_LAT + meters_to_lat_degrees(meters)}


def _risk(client: TestClient, hour: int = 12, **params) -> httpx.Response:
    return client.get("/api/routes/risk", params={"from": FROM, "to": TO, "hour": hour, **params})


def _ok(response: httpx.Response) -> dict:
    assert response.status_code == 200, response.text
    return response.json()


# --- the buffer ---------------------------------------------------------------


def test_highway_buffer_includes_800_m_and_excludes_1500_m(client: TestClient, db_session: Session):
    source = make_source(db_session)
    make_incident(db_session, source, occurred_at=WHEN, **_north_of_road(800))
    make_incident(db_session, source, occurred_at=WHEN, **_north_of_road(1500))
    db_session.commit()
    _use_osrm(_road(HIGHWAY_SPEED_MPS))

    assert _ok(_risk(client))["cases"]["total"] == 1


def test_urban_buffer_includes_150_m_and_excludes_300_m(client: TestClient, db_session: Session):
    source = make_source(db_session)
    make_incident(db_session, source, occurred_at=WHEN, **_north_of_road(150))
    make_incident(db_session, source, occurred_at=WHEN, **_north_of_road(300))
    db_session.commit()
    _use_osrm(_road(URBAN_SPEED_MPS))

    assert _ok(_risk(client))["cases"]["total"] == 1


def test_each_stretch_keeps_its_own_buffer(client: TestClient, db_session: Session):
    # West half urban, east half highway: 600 m north counts only on the east half.
    source = make_source(db_session)
    make_incident(db_session, source, occurred_at=WHEN, **_north_of_road(600, lon=-79.58))
    make_incident(db_session, source, occurred_at=WHEN, **_north_of_road(600, lon=-79.52))
    db_session.commit()
    _use_osrm(straight_route_payload(ROAD, [URBAN_SPEED_MPS, HIGHWAY_SPEED_MPS]))

    assert _ok(_risk(client))["cases"]["total"] == 1


# --- which incidents count ----------------------------------------------------


def test_only_located_violent_deaths_drawn_on_the_map_count(
    client: TestClient, db_session: Session
):
    source = make_source(db_session)
    near = _north_of_road(100)
    make_incident(db_session, source, occurred_at=WHEN, type=IncidentType.HOMICIDIO, **near)
    make_incident(db_session, source, occurred_at=WHEN, type=IncidentType.SICARIATO, **near)
    make_incident(db_session, source, occurred_at=WHEN, type=IncidentType.FEMICIDIO, **near)
    make_incident(
        db_session,
        source,
        occurred_at=WHEN,
        location_precision=LocationPrecision.APROXIMADA,
        **near,
    )
    excluded = [
        {"location_precision": LocationPrecision.CANTON},
        {"type": IncidentType.DESAPARECIDA},
        {"type": IncidentType.SINIESTRO_TRANSITO},
        {"status": IncidentStatus.RETIRADO},
        {"occurred_at": datetime(2018, 12, 31, 12, tzinfo=GUAYAQUIL)},
    ]
    for overrides in excluded:
        make_incident(db_session, source, **{"occurred_at": WHEN, **near, **overrides})
    db_session.commit()
    _use_osrm(_road(HIGHWAY_SPEED_MPS))

    cases = _ok(_risk(client))["cases"]

    assert cases["total"] == 4
    assert cases["by_type"] == {"homicidio": 2, "sicariato": 1, "femicidio": 1}


def test_the_hour_is_local_time(client: TestClient, db_session: Session):
    # 04:30 UTC on June 2nd is 23:30 on June 1st in Guayaquil.
    source = make_source(db_session)
    make_incident(
        db_session,
        source,
        occurred_at=datetime(2025, 6, 2, 4, 30, tzinfo=UTC),
        **_north_of_road(50),
    )
    db_session.commit()
    _use_osrm(_road(HIGHWAY_SPEED_MPS))

    hourly = _ok(_risk(client))["hourly"]

    assert hourly[23]["weighted_cases"] == 1.0
    assert hourly[4]["weighted_cases"] == 0.0


def test_recency_weight_halves_at_one_year_before_the_data_cut(
    client: TestClient, db_session: Session
):
    source = make_source(db_session)
    cut = datetime(2025, 9, 30, 20, 0, tzinfo=GUAYAQUIL)
    make_incident(db_session, source, occurred_at=cut, **_north_of_road(50))
    make_incident(
        db_session, source, occurred_at=cut - timedelta(days=365.25), **_north_of_road(60)
    )
    # Two years old, and far from the road: still sets nothing (the cut is the latest case).
    make_incident(db_session, source, occurred_at=cut - timedelta(days=730.5), lat=-1.0)
    db_session.commit()
    _use_osrm(_road(HIGHWAY_SPEED_MPS))

    body = _ok(_risk(client))

    assert body["data_cut"] == "2025-09-30"
    assert body["cases"]["weighted_total"] == pytest.approx(1.5)


# --- the response -------------------------------------------------------------


def test_response_shape_with_no_score_until_a_reference_exists(
    client: TestClient, db_session: Session
):
    source = make_source(db_session)
    for hour in (21, 22, 22):
        make_incident(
            db_session, source, occurred_at=WHEN.replace(hour=hour), **_north_of_road(100)
        )
    db_session.commit()
    road = _road(HIGHWAY_SPEED_MPS)
    _use_osrm(road)

    body = _ok(_risk(client, hour=22))

    assert body["origin"] == {"lon": -79.6, "lat": -2.0}
    assert body["destination"] == {"lon": -79.5, "lat": -2.0}
    assert body["geometry"]["type"] == "LineString"
    # Display line: the collinear middle vertex is simplified away.
    assert body["geometry"]["coordinates"] == [list(ROAD[0]), list(ROAD[-1])]
    assert body["distance_km"] == pytest.approx(road["routes"][0]["distance"] / 1000, abs=0.01)
    assert body["duration_min"] == pytest.approx(road["routes"][0]["duration"] / 60, abs=0.1)
    assert [row["hour"] for row in body["hourly"]] == list(range(24))
    assert sum(row["share"] for row in body["hourly"]) == pytest.approx(1.0, abs=1e-5)
    assert body["selected"] == body["hourly"][22]
    for row in body["hourly"]:
        assert row["score"] is None
        assert row["score_available"] is False
        assert row["band"] is None
        assert row["band_label"] is None
    # By hand. The cut is 22:00, so w(22h) = 1 and w(21h) = 0.5 ** (1 h / 1 year).
    # These three are also the whole national curve, so share == national share
    # == smoothed / W_total. The trip is under an hour, so m(H) = share[H] and
    # density(H) = W_total / km * 24 * share[H] = 24 * smoothed[H] / km.
    w21 = 0.5 ** ((1 / 24) / 365.25)
    km = road["routes"][0]["distance"] / 1000
    smoothed = {20: 0.25 * w21, 21: 0.5 * w21 + 0.25 * 2, 22: 0.25 * w21 + 0.5 * 2, 23: 0.5}
    for hour, row in enumerate(body["hourly"]):
        expected = 24 * smoothed.get(hour, 0.0) / km
        assert row["density"] == pytest.approx(expected, abs=1e-6), hour
        assert row["share"] == pytest.approx(smoothed.get(hour, 0.0) / (2 + w21), abs=1e-6)
        assert "exposure" not in row
    assert body["cases"]["weighted_total"] == pytest.approx(2 + w21, abs=1e-4)
    assert body["cases_per_km"] == pytest.approx((2 + w21) / km, abs=1e-4)
    # Every hour outside 20-23h has zero density: the earliest, 00h, wins.
    assert body["best_hour"] == 0
    assert body["low_data"] is True
    assert body["notes"] == list(NOTES)
    assert len(body["notes"]) == 3


def test_low_data_is_false_from_k_weighted_cases(client: TestClient, db_session: Session):
    source = make_source(db_session)
    for _ in range(int(SHRINKAGE_K)):
        make_incident(db_session, source, occurred_at=WHEN, **_north_of_road(100))
    db_session.commit()
    _use_osrm(_road(HIGHWAY_SPEED_MPS))

    assert _ok(_risk(client))["low_data"] is False


def test_a_route_with_no_cases_follows_the_national_curve(client: TestClient, db_session: Session):
    source = make_source(db_session)
    make_incident(db_session, source, occurred_at=WHEN.replace(hour=3), lat=-1.0)  # far away
    db_session.commit()
    _use_osrm(_road(HIGHWAY_SPEED_MPS))

    body = _ok(_risk(client))

    assert body["cases"]["total"] == 0
    assert body["cases_per_km"] == 0.0
    assert [row["density"] for row in body["hourly"]] == [0.0] * 24
    # All 24 hours tie at zero: no best hour to suggest, but the route is there.
    assert body["best_hour"] is None
    assert len(body["geometry"]["coordinates"]) == 2
    assert body["distance_km"] > 11
    shares = [row["share"] for row in body["hourly"]]
    # National curve: one case at 03h, smoothed -> 0.25 / 0.5 / 0.25.
    assert shares[2:5] == pytest.approx([0.25, 0.5, 0.25])


def test_blackspot_reports_its_km_types_peak_hours_and_dates(
    client: TestClient, db_session: Session
):
    source = make_source(db_session)
    # ~5.5 km from the origin (0.0494 degrees of longitude at ~111.1 km each).
    near_km_5 = _north_of_road(100, lon=-79.5506)
    cases = [
        (IncidentType.HOMICIDIO, datetime(2024, 3, 1, 22, 15, tzinfo=GUAYAQUIL)),
        (IncidentType.HOMICIDIO, datetime(2025, 5, 1, 22, 40, tzinfo=GUAYAQUIL)),
        (IncidentType.SICARIATO, datetime(2025, 5, 2, 19, 0, tzinfo=GUAYAQUIL)),
        (IncidentType.FEMICIDIO, datetime(2025, 6, 1, 8, 0, tzinfo=GUAYAQUIL)),
        (IncidentType.HOMICIDIO, datetime(2025, 6, 1, 3, 0, tzinfo=GUAYAQUIL)),
    ]
    for kind, when in cases:
        make_incident(db_session, source, occurred_at=when, type=kind, **near_km_5)
    # One case elsewhere on the route: its piece stays below 3 weighted cases.
    make_incident(db_session, source, occurred_at=WHEN, **_north_of_road(100, lon=-79.59))
    db_session.commit()
    _use_osrm(_road(HIGHWAY_SPEED_MPS))

    (spot,) = _ok(_risk(client))["blackspots"]

    assert (spot["km_from"], spot["km_to"]) == (5.0, 6.0)
    assert spot["cases"] == 5
    assert spot["by_type"] == {"homicidio": 3, "sicariato": 1, "femicidio": 1}
    # The cut is WHEN (2025-06-01 12:00), the latest case.
    weight = {when: 0.5 ** ((WHEN - when).total_seconds() / 86400 / 365.25) for _, when in cases}
    assert spot["weighted_cases"] == pytest.approx(sum(weight.values()), abs=1e-4)
    # 22h holds two cases (~0.29 + ~0.92 = ~1.21); then 08h (~0.99995) and
    # 03h (~0.9996) beat 19h (~0.92).
    by_hour = {22: weight[cases[0][1]] + weight[cases[1][1]], 19: weight[cases[2][1]]}
    by_hour |= {8: weight[cases[3][1]], 3: weight[cases[4][1]]}
    assert spot["peak_hours"] == sorted(by_hour, key=lambda h: -by_hour[h])[:3] == [22, 8, 3]
    assert (spot["first_date"], spot["last_date"]) == ("2024-03-01", "2025-06-01")
    assert spot["lat"] == pytest.approx(ROAD_LAT)
    assert -79.56 < spot["lon"] < -79.54


def test_recorded_osrm_route_end_to_end(client: TestClient, db_session: Session):
    payload = load_fixture()
    vertex = payload["routes"][0]["geometry"]["coordinates"][400]
    source = make_source(db_session)
    make_incident(db_session, source, occurred_at=WHEN, lon=vertex[0], lat=vertex[1])
    db_session.commit()
    _use_osrm(payload)

    body = _ok(
        client.get(
            "/api/routes/risk",
            params={"from": "-79.8862,-2.1894", "to": "-79.5340,-1.8022", "hour": 7},
        )
    )

    assert body["distance_km"] == pytest.approx(72.86, abs=0.01)
    assert body["duration_min"] == pytest.approx(79.5, abs=0.1)
    # Computed on all 853 OSRM vertices; drawn with the 20 m simplification.
    full = payload["routes"][0]["geometry"]["coordinates"]
    drawn = body["geometry"]["coordinates"]
    assert 2 < len(drawn) < len(full) / 5
    assert (drawn[0], drawn[-1]) == (full[0], full[-1])
    assert body["cases"]["total"] == 1
    assert body["selected"]["hour"] == 7


# --- caching ------------------------------------------------------------------


def test_identical_requests_route_once_and_coordinates_are_rounded(
    client: TestClient, db_session: Session
):
    seen = _use_osrm(_road(HIGHWAY_SPEED_MPS))

    _ok(_risk(client, hour=3))
    _ok(_risk(client, hour=20))  # same route, another hour: served from the cache
    _ok(client.get("/api/routes/risk", params={"from": "-79.60001,-2.0", "to": TO, "hour": 1}))

    assert len(seen) == 1
    assert seen[0].url.path == "/route/v1/driving/-79.6,-2.0;-79.5,-2.0"


def _instances_reachable_from(root: object) -> set[type]:
    """The type of every object reachable from `root` (classes and functions excluded)."""
    seen: set[int] = set()
    found: set[type] = set()
    objects = [root]
    while objects:
        fresh = []
        for obj in objects:
            if id(obj) in seen or isinstance(obj, (type, ModuleType, FunctionType)):
                continue
            seen.add(id(obj))
            found.add(type(obj))
            fresh.append(obj)
        objects = gc.get_referents(*fresh)
    return found


def test_the_cache_keeps_no_route_geometry_pieces_or_case_rows(
    client: TestClient, db_session: Session
):
    source = make_source(db_session)
    for days in range(4):  # enough weighted cases in one piece for a blackspot
        make_incident(
            db_session, source, occurred_at=WHEN - timedelta(days=days), **_north_of_road(100)
        )
    db_session.commit()
    _use_osrm(_road(HIGHWAY_SPEED_MPS))

    body = _ok(_risk(client))

    assert body["cases"]["total"] == 4
    assert len(body["blackspots"]) == 1
    (cached,) = _route_cache._items.values()
    assert isinstance(cached, RouteAnalysis)
    reachable = _instances_reachable_from(cached)
    for heavy in (OsrmRoute, RoutePiece, RouteDensity, RouteCase, WeightedCase, datetime):
        assert heavy not in reachable, heavy.__name__
    # The cached answer is the same answer.
    assert _ok(_risk(client)) == body


# --- load guard -----------------------------------------------------------------


def test_a_third_concurrent_uncached_route_is_a_503_and_cached_ones_still_answer(
    client: TestClient, db_session: Session
):
    payload = _road(HIGHWAY_SPEED_MPS)
    arrived = threading.Semaphore(0)
    release = {origin: threading.Event() for origin in ("-79.61,-2.0", "-79.62,-2.0")}

    def handler(request: httpx.Request) -> httpx.Response:
        origin = request.url.path.split("/")[-1].split(";")[0]
        if origin in release:
            arrived.release()
            assert release[origin].wait(timeout=10)
        return httpx.Response(200, json=payload)

    _use_osrm(handler)
    _ok(_risk(client))  # cached from here on; also warms the national context
    results: dict[str, int] = {}

    def request(origin: str) -> None:
        results[origin] = _risk(client, **{"from": origin}).status_code

    threads = {origin: threading.Thread(target=request, args=(origin,)) for origin in release}
    for thread in threads.values():
        # One at a time: the test shares one database session between threads.
        thread.start()
        assert arrived.acquire(timeout=10)

    busy = _risk(client, **{"from": "-79.63,-2.0"})
    cached = _risk(client)

    for origin, gate in release.items():  # again one at a time, for the shared session
        gate.set()
        threads[origin].join(timeout=10)
    assert busy.status_code == 503
    assert busy.json()["detail"] == (
        "Hay muchas consultas de rutas en este momento. Intenta de nuevo en unos segundos."
    )
    assert cached.status_code == 200
    assert results == {origin: 200 for origin in release}
    # Both slots are free again.
    _ok(_risk(client, **{"from": "-79.63,-2.0"}))


# --- cases with no recorded hour (00:00:00 local) -------------------------------


def test_a_case_without_hour_counts_but_feeds_no_hourly_curve(
    client: TestClient, db_session: Session
):
    source = make_source(db_session)
    midnight = datetime(2025, 6, 1, 0, 0, tzinfo=GUAYAQUIL)
    make_incident(db_session, source, occurred_at=midnight, **_north_of_road(50))
    make_incident(db_session, source, occurred_at=WHEN.replace(hour=3), **_north_of_road(60))
    db_session.commit()
    road = _road(HIGHWAY_SPEED_MPS)
    _use_osrm(road)

    body = _ok(_risk(client))

    w_midnight = 0.5 ** ((3 / 24) / 365.25)  # 3 h before the 03:00 cut
    assert body["cases"]["total"] == 2
    assert body["cases"]["without_hour"] == 1
    assert body["cases"]["weighted_total"] == pytest.approx(1 + w_midnight, abs=1e-4)
    weighted = [row["weighted_cases"] for row in body["hourly"]]
    assert weighted[0] == 0.0
    assert weighted[3] == 1.0
    assert sum(weighted) == 1.0
    # The national curve also only has the 03h case: share 0.25 / 0.5 / 0.25.
    # Density still uses W_total, which includes the no-hour case.
    km = road["routes"][0]["distance"] / 1000
    assert body["hourly"][3]["density"] == pytest.approx((1 + w_midnight) / km * 24 * 0.5, abs=1e-6)
    assert body["hourly"][0]["density"] == 0.0


def test_the_national_curve_leaves_out_cases_without_hour(db_session: Session):
    source = make_source(db_session)
    latest = datetime(2025, 6, 2, 0, 0, tzinfo=GUAYAQUIL)  # no hour, still the data cut
    make_incident(db_session, source, occurred_at=latest, lat=-1.0)
    make_incident(db_session, source, occurred_at=WHEN.replace(hour=3), lat=-1.0)
    db_session.commit()

    context = load_national_context(db_session)

    assert context.data_cut == latest
    assert context.national_share[0] == 0.0
    assert context.national_share[2:5] == pytest.approx((0.25, 0.5, 0.25))


def test_blackspot_peak_hours_leave_out_cases_without_hour(client: TestClient, db_session: Session):
    source = make_source(db_session)
    near = _north_of_road(100, lon=-79.5506)
    for day in (1, 2, 3):
        make_incident(
            db_session, source, occurred_at=datetime(2025, 6, day, tzinfo=GUAYAQUIL), **near
        )
    make_incident(
        db_session, source, occurred_at=datetime(2025, 6, 3, 22, tzinfo=GUAYAQUIL), **near
    )
    db_session.commit()
    _use_osrm(_road(HIGHWAY_SPEED_MPS))

    (spot,) = _ok(_risk(client))["blackspots"]

    assert spot["cases"] == 4
    assert spot["peak_hours"] == [22]
    assert spot["first_date"] == "2025-06-01"


# --- buffer class per 1 km piece -------------------------------------------------


def test_a_slow_stretch_inside_a_fast_kilometre_keeps_the_highway_buffer(
    client: TestClient, db_session: Session
):
    # Km 0-1: 250 m at 108 km/h, 500 m at 18 km/h, 250 m at 108 km/h. The
    # distance-weighted average is 17.5 m/s (63 km/h): a highway piece. The
    # first case is 994 m (geodesic, PostGIS) from the slow stretch and 1,025 m
    # from both fast stretches, so only the piece-level highway buffer reaches
    # it; with a per-segment buffer it was lost. The second is 1,054 m away.
    deg_per_m = 1 / 111_127  # degrees of longitude per meter at lat -2 (sphere)
    x0 = -79.60
    x1, x2, x3 = x0 + 250 * deg_per_m, x0 + 750 * deg_per_m, x0 + 1000 * deg_per_m
    road = [(x0, ROAD_LAT), (x1, ROAD_LAT), (x2, ROAD_LAT), (x3, ROAD_LAT), (-79.50, ROAD_LAT)]
    middle = (x1 + x2) / 2
    source = make_source(db_session)
    make_incident(db_session, source, occurred_at=WHEN, **_north_of_road(1000, lon=middle))
    make_incident(db_session, source, occurred_at=WHEN, **_north_of_road(1060, lon=middle))
    db_session.commit()
    _use_osrm(straight_route_payload(road, [30.0, 5.0, 30.0, 30.0]))

    assert _ok(_risk(client))["cases"]["total"] == 1


# --- snapping and degenerate routes ------------------------------------------------


@pytest.mark.parametrize(
    ("snaps", "message"),
    [
        ((2500.0, 10.0), "El origen está a más de 2 km de una vía."),
        ((10.0, 2001.0), "El destino está a más de 2 km de una vía."),
    ],
)
def test_an_end_more_than_2_km_from_a_road_is_a_422(
    client: TestClient, db_session: Session, snaps: tuple[float, float], message: str
):
    _use_osrm(straight_route_payload(ROAD, [25.0, 25.0], snap_distances_m=snaps))

    response = _risk(client)

    assert response.status_code == 422
    assert response.json()["detail"] == (
        f"{message} Elige un punto más cerca de una carretera o calle."
    )


def test_an_end_within_2_km_of_a_road_is_fine(client: TestClient, db_session: Session):
    _use_osrm(straight_route_payload(ROAD, [25.0, 25.0], snap_distances_m=(2000.0, 1999.0)))

    assert _risk(client).status_code == 200


SAME_PLACE = "El origen y el destino son el mismo lugar."


def test_the_same_point_twice_is_a_422_without_calling_osrm(
    client: TestClient, db_session: Session
):
    seen = _use_osrm(_road(HIGHWAY_SPEED_MPS))

    response = client.get(
        "/api/routes/risk", params={"from": "-79.6,-2.0", "to": "-79.60002,-2.0", "hour": 8}
    )

    assert response.status_code == 422
    assert response.json()["detail"] == SAME_PLACE
    assert seen == []


def test_points_snapping_to_the_same_place_are_a_422(client: TestClient, db_session: Session):
    # OSRM's real answer for two points on the same spot: Ok, 0 m, one location.
    spot = (-79.886167, -2.189231)
    _use_osrm(straight_route_payload([spot, spot], [0.0], snap_distances_m=(19.0, 25.0)))

    response = _risk(client)

    assert response.status_code == 422
    assert response.json()["detail"] == SAME_PLACE


def test_a_zero_length_route_is_a_422(client: TestClient, db_session: Session):
    payload = _road(HIGHWAY_SPEED_MPS)
    payload["routes"][0]["distance"] = 0
    _use_osrm(payload)

    response = _risk(client)

    assert response.status_code == 422
    assert response.json()["detail"] == SAME_PLACE


# --- stale cache ----------------------------------------------------------------------


def test_new_incidents_invalidate_the_route_cache_even_with_the_same_data_cut(
    client: TestClient, db_session: Session
):
    source = make_source(db_session)
    make_incident(db_session, source, occurred_at=WHEN, **_north_of_road(100))
    db_session.commit()
    seen = _use_osrm(_road(HIGHWAY_SPEED_MPS))
    assert _ok(_risk(client))["cases"]["total"] == 1

    # An older case: the latest occurred_at (the data cut) does not move.
    make_incident(db_session, source, occurred_at=WHEN - timedelta(days=30), **_north_of_road(90))
    db_session.commit()
    clear_national_context()  # what the 10-minute TTL does in production

    body = _ok(_risk(client))

    assert body["cases"]["total"] == 2
    assert body["data_cut"] == "2025-06-01"
    assert len(seen) == 2


# --- errors -------------------------------------------------------------------


def test_no_route_is_a_404_in_spanish(client: TestClient, db_session: Session):
    _use_osrm(lambda request: httpx.Response(400, json={"code": "NoRoute", "message": "x"}))

    response = client.get(
        "/api/routes/risk", params={"from": "-90.3,-0.7", "to": "-79.88,-2.19", "hour": 8}
    )

    assert response.status_code == 404
    assert response.json()["detail"].startswith("No encontramos una ruta")


@pytest.mark.parametrize(
    "error", [httpx.ConnectError("refused"), httpx.ReadTimeout("took more than 2 s")]
)
def test_osrm_down_or_slow_is_a_503(client: TestClient, db_session: Session, error: Exception):
    def handler(request: httpx.Request) -> httpx.Response:
        raise error

    _use_osrm(handler)

    response = _risk(client)

    assert response.status_code == 503
    assert "no está disponible" in response.json()["detail"]


@pytest.mark.parametrize(
    "params",
    [
        {"from": "-79.6", "to": TO, "hour": 8},
        {"from": "abc,def", "to": TO, "hour": 8},
        {"from": "-79.6,-2.0,1", "to": TO, "hour": 8},
        {"from": "nan,nan", "to": TO, "hour": 8},
        {"from": FROM, "to": "-74.0,-2.0", "hour": 8},  # east of Ecuador
        {"from": FROM, "to": "-79.5,2.0", "hour": 8},  # north of Ecuador
        {"from": "-2.0,-79.6", "to": TO, "hour": 8},  # lat,lon swapped
        {"from": FROM, "to": TO, "hour": 24},
        {"from": FROM, "to": TO, "hour": -1},
        {"from": FROM, "to": TO, "hour": "noon"},
        {"from": FROM, "to": TO},
        {"to": TO, "hour": 8},
    ],
)
def test_invalid_coordinates_or_hour_are_a_422(client: TestClient, params: dict):
    seen = _use_osrm(_road(HIGHWAY_SPEED_MPS))

    assert client.get("/api/routes/risk", params=params).status_code == 422
    assert seen == []


def test_galapagos_is_inside_the_accepted_box(client: TestClient, db_session: Session):
    _use_osrm(_road(HIGHWAY_SPEED_MPS))

    response = client.get(
        "/api/routes/risk", params={"from": "-90.31,-0.74", "to": "-90.35,-0.69", "hour": 8}
    )

    assert response.status_code == 200


# --- the service without HTTP ---------------------------------------------------


def test_density_is_computable_without_http_in_one_spatial_query(db_session: Session):
    source = make_source(db_session)
    make_incident(db_session, source, occurred_at=WHEN, **_north_of_road(100))
    db_session.commit()
    context = load_national_context(db_session)
    route = parse_route(_road(HIGHWAY_SPEED_MPS))

    statements: list[str] = []
    engine = db_session.get_bind()

    def count(conn, cursor, statement, *args):
        statements.append(statement)

    event.listen(engine, "before_cursor_execute", count)
    try:
        density = compute_route_density(db_session, route, context)
    finally:
        event.remove(engine, "before_cursor_execute", count)

    assert len(statements) == 1
    assert density.weighted_total == pytest.approx(1.0)
    km = route.distance_m / 1000
    assert density.cases_per_km == pytest.approx(1.0 / km)
    assert len(density.densities) == 24
    # Departing at 12h, a trip under an hour stays in 12h: m(12) = share[12].
    assert density.densities[12] == pytest.approx(24 * density.share[12] / km)


def test_national_context_with_no_incidents_is_uniform(db_session: Session):
    context = load_national_context(db_session)

    assert context.data_cut is None
    assert context.national_share == pytest.approx([1 / 24] * 24)
