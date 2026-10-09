"""OSRM client: request shape, the recorded real response, and error mapping."""

import time

import httpx
import pytest

from app.modules.routing.osrm import (
    OSRM_TIMEOUT_S,
    OsrmClient,
    OsrmUnavailable,
    RouteNotFound,
    parse_route,
)
from tests.modules.routing.fakes import load_fixture


def _client(handler) -> OsrmClient:
    return OsrmClient("http://osrm.test:5000/", transport=httpx.MockTransport(handler))


def test_requests_the_full_annotated_geojson_route():
    seen: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        return httpx.Response(200, json=load_fixture())

    route = _client(handler).route((-79.8862, -2.1894), (-79.534, -1.8022))

    (request,) = seen
    assert request.url.host == "osrm.test"
    assert request.url.path == "/route/v1/driving/-79.8862,-2.1894;-79.534,-1.8022"
    assert dict(request.url.params) == {
        "overview": "full",
        "geometries": "geojson",
        "annotations": "distance,duration,speed",
    }
    assert route.distance_m == pytest.approx(72864.9)


def test_the_default_deadline_is_two_seconds():
    assert OSRM_TIMEOUT_S == 2.0


def test_the_deadline_covers_the_whole_request_not_each_phase():
    # httpx alone would allow 0.2 s per phase; this answer takes 0.6 s in
    # total, so the caller must give up after ~0.2 s.
    def slow(request: httpx.Request) -> httpx.Response:
        time.sleep(0.6)
        return httpx.Response(200, json=load_fixture())

    client = OsrmClient("http://osrm.test", timeout_s=0.2, transport=httpx.MockTransport(slow))
    started = time.monotonic()
    with pytest.raises(OsrmUnavailable):
        client.route((-79.88, -2.19), (-79.53, -1.80))

    assert time.monotonic() - started < 0.5


def test_parses_the_recorded_guayaquil_babahoyo_route():
    route = parse_route(load_fixture())

    assert route.duration_s == pytest.approx(4767.9)
    assert len(route.coordinates) == 853
    assert len(route.segment_distances_m) == len(route.segment_speeds_mps) == 852
    assert sum(route.segment_distances_m) == pytest.approx(route.distance_m, rel=1e-3)
    origin, destination = route.waypoints
    assert origin.location == (-79.886167, -2.189231)
    assert origin.distance_m == pytest.approx(19.04, abs=0.01)
    assert destination.location == (-79.533765, -1.802113)
    assert destination.distance_m == pytest.approx(27.86, abs=0.01)


@pytest.mark.parametrize("code", ["NoRoute", "NoSegment"])
def test_no_route_and_no_segment_are_route_not_found(code: str):
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(400, json={"code": code, "message": "Impossible route"})

    with pytest.raises(RouteNotFound):
        _client(handler).route((-90.3, -0.7), (-79.88, -2.19))


@pytest.mark.parametrize(
    "error",
    [httpx.ConnectError("refused"), httpx.ReadTimeout("slow"), httpx.ConnectTimeout("slow")],
)
def test_unreachable_or_slow_osrm_is_unavailable(error: Exception):
    def handler(request: httpx.Request) -> httpx.Response:
        raise error

    with pytest.raises(OsrmUnavailable):
        _client(handler).route((-79.88, -2.19), (-79.53, -1.80))


@pytest.mark.parametrize(
    "response",
    [
        httpx.Response(502, text="Bad Gateway"),
        httpx.Response(400, json={"code": "InvalidQuery", "message": "bad"}),
        httpx.Response(200, json={"code": "Ok", "routes": []}),
        httpx.Response(200, json=["not", "an", "object"]),
        httpx.Response(200, json={**load_fixture(), "waypoints": []}),
        httpx.Response(200, json={k: v for k, v in load_fixture().items() if k != "waypoints"}),
    ],
)
def test_unusable_answers_are_unavailable(response: httpx.Response):
    with pytest.raises(OsrmUnavailable):
        _client(lambda request: response).route((-79.88, -2.19), (-79.53, -1.80))


def test_annotations_that_do_not_match_the_geometry_are_unavailable():
    payload = load_fixture()
    payload["routes"][0]["legs"][0]["annotation"]["speed"].pop()

    with pytest.raises(OsrmUnavailable):
        parse_route(payload)
