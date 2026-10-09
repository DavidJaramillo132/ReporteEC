"""Client for the self-hosted OSRM routing service (car profile, Ecuador extract).

One call: `GET /route/v1/driving/{lon},{lat};{lon},{lat}?overview=full&
geometries=geojson&annotations=distance,duration,speed`, 2 s timeout.

Failures become two exceptions the API maps to HTTP statuses:
`RouteNotFound` (OSRM `NoRoute`/`NoSegment`, e.g. Galápagos to the
mainland) -> 404, and `OsrmUnavailable` (unreachable, timeout, any other
error or an unexpected payload) -> 503.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import httpx

from app.modules.routing.geometry import LonLat

OSRM_TIMEOUT_S = 2.0
_NOT_FOUND_CODES = frozenset({"NoRoute", "NoSegment"})


class OsrmError(Exception):
    """Base class for routing failures."""


class RouteNotFound(OsrmError):
    """OSRM found no drivable route between the two points."""


class OsrmUnavailable(OsrmError):
    """OSRM did not answer, timed out, or answered something unusable."""


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
        self._http = httpx.Client(
            base_url=base_url.rstrip("/"), timeout=timeout_s, transport=transport
        )

    def route(self, origin: LonLat, destination: LonLat) -> OsrmRoute:
        path = f"/route/v1/driving/{origin[0]},{origin[1]};{destination[0]},{destination[1]}"
        try:
            response = self._http.get(
                path,
                params={
                    "overview": "full",
                    "geometries": "geojson",
                    "annotations": "distance,duration,speed",
                },
            )
        except httpx.HTTPError as exc:  # connect errors, timeouts, protocol errors
            raise OsrmUnavailable(f"OSRM request failed: {exc!r}") from exc
        try:
            payload = response.json()
        except ValueError as exc:
            raise OsrmUnavailable(
                f"OSRM answered HTTP {response.status_code} without JSON"
            ) from exc
        return parse_route(payload)
