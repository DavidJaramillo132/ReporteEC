"""Client for the self-hosted OSRM routing service (car profile, Ecuador extract).

One call: `GET /route/v1/driving/{lon},{lat};{lon},{lat}?overview=full&
geometries=geojson&annotations=distance,speed`, with a 2 s total
deadline: connecting, sending, waiting and reading the body together, not
2 s per phase (see `OsrmClient.route`).

Failures become two exceptions the API maps to HTTP statuses:
`RouteNotFound` (OSRM `NoRoute`/`NoSegment`, e.g. Galápagos to the
mainland) -> 404, and `OsrmUnavailable` (unreachable, timeout, any other
error or an unexpected payload) -> 503.
"""

from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from concurrent.futures import TimeoutError as FutureTimeout
from dataclasses import dataclass
from typing import Any

import httpx

from app.modules.routing.geometry import LonLat

OSRM_TIMEOUT_S = 2.0
_NOT_FOUND_CODES = frozenset({"NoRoute", "NoSegment"})
# Requests whose caller already gave up keep a worker until httpx's own
# per-phase timeouts end them; a full pool makes new calls wait in the queue,
# which counts against their deadline -- OSRM trouble degrades to 503s.
_MAX_CONCURRENT_REQUESTS = 8


class OsrmError(Exception):
    """Base class for routing failures."""


class RouteNotFound(OsrmError):
    """OSRM found no drivable route between the two points."""


class OsrmUnavailable(OsrmError):
    """OSRM did not answer, timed out, or answered something unusable."""


@dataclass(frozen=True, slots=True)
class Waypoint:
    """Where OSRM snapped an input point onto the road network, and how far it moved it."""

    location: LonLat
    distance_m: float


@dataclass(frozen=True, slots=True)
class OsrmRoute:
    """The fastest route: its vertices plus per-segment length and speed.

    `segment_distances_m[i]` and `segment_speeds_mps[i]` describe the stretch
    between `coordinates[i]` and `coordinates[i + 1]`.
    """

    coordinates: tuple[LonLat, ...]
    distance_m: float
    duration_s: float
    segment_distances_m: tuple[float, ...]
    segment_speeds_mps: tuple[float, ...]
    waypoints: tuple[Waypoint, ...]
    """Snapped origin and destination, in request order."""


def parse_route(payload: Any) -> OsrmRoute:
    """Turn an OSRM `/route` JSON body into an `OsrmRoute`, or raise an `OsrmError`."""
    if not isinstance(payload, dict):
        raise OsrmUnavailable("OSRM answered something that is not a JSON object")
    code = payload.get("code")
    if code in _NOT_FOUND_CODES:
        raise RouteNotFound(str(payload.get("message") or code))
    if code != "Ok":
        raise OsrmUnavailable(f"OSRM error {code!r}: {payload.get('message')}")
    try:
        route = payload["routes"][0]
        coordinates = tuple(
            (float(lon), float(lat)) for lon, lat in route["geometry"]["coordinates"]
        )
        distances: list[float] = []
        speeds: list[float] = []
        for leg in route["legs"]:
            distances.extend(float(value) for value in leg["annotation"]["distance"])
            speeds.extend(float(value) for value in leg["annotation"]["speed"])
        parsed = OsrmRoute(
            coordinates=coordinates,
            distance_m=float(route["distance"]),
            duration_s=float(route["duration"]),
            segment_distances_m=tuple(distances),
            segment_speeds_mps=tuple(speeds),
            waypoints=tuple(
                Waypoint(
                    location=(float(point["location"][0]), float(point["location"][1])),
                    distance_m=float(point["distance"]),
                )
                for point in payload["waypoints"]
            ),
        )
    except (KeyError, IndexError, TypeError, ValueError) as exc:
        raise OsrmUnavailable(f"unexpected OSRM route payload: {exc!r}") from exc
    # A two-waypoint route has one leg: one annotation per pair of vertices.
    if (
        len(coordinates) < 2
        or len(distances) != len(coordinates) - 1
        or len(speeds) != len(distances)
    ):
        raise OsrmUnavailable("OSRM annotations do not match the route geometry")
    if len(parsed.waypoints) != 2:
        raise OsrmUnavailable("OSRM did not return one waypoint per input point")
    return parsed


class OsrmClient:
    """Thin synchronous OSRM client; `transport` lets tests answer without a server."""

    def __init__(
        self,
        base_url: str,
        *,
        timeout_s: float = OSRM_TIMEOUT_S,
        transport: httpx.BaseTransport | None = None,
    ) -> None:
        self._timeout_s = timeout_s
        # Each phase also gets the whole budget, so an abandoned request
        # still ends on its own shortly after its caller's deadline.
        self._http = httpx.Client(
            base_url=base_url.rstrip("/"), timeout=timeout_s, transport=transport
        )
        self._pool = ThreadPoolExecutor(
            max_workers=_MAX_CONCURRENT_REQUESTS, thread_name_prefix="osrm"
        )

    def route(self, origin: LonLat, destination: LonLat) -> OsrmRoute:
        """Route two points, or raise `RouteNotFound` / `OsrmUnavailable`.

        httpx timeouts apply per phase (connect, write, each read), so a slow
        connect followed by a trickling body could take several times the
        limit. The request therefore runs on a worker thread and the caller
        waits at most `timeout_s` in total.
        """
        path = f"/route/v1/driving/{origin[0]},{origin[1]};{destination[0]},{destination[1]}"
        future = self._pool.submit(self._fetch_json, path)
        try:
            payload = future.result(timeout=self._timeout_s)
        except FutureTimeout as exc:
            future.cancel()
            raise OsrmUnavailable(f"OSRM took more than {self._timeout_s} s") from exc
        return parse_route(payload)

    def _fetch_json(self, path: str) -> Any:
        try:
            response = self._http.get(
                path,
                params={
                    "overview": "full",
                    "geometries": "geojson",
                    # Only what `parse_route` reads: per-segment durations would
                    # add ~10% to the payload of a long route for nothing.
                    "annotations": "distance,speed",
                },
            )
        except httpx.HTTPError as exc:  # connect errors, timeouts, protocol errors
            raise OsrmUnavailable(f"OSRM request failed: {exc!r}") from exc
        try:
            return response.json()
        except ValueError as exc:
            raise OsrmUnavailable(
                f"OSRM answered HTTP {response.status_code} without JSON"
            ) from exc
