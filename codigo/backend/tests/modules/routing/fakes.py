"""Test doubles for OSRM: the recorded real response and synthetic straight routes.

Tests never call a real OSRM. `load_fixture()` is one real response recorded
from the project's OSRM (v6.0.0, MLD, car profile, Geofabrik Ecuador extract,
2026-10-09): Guayaquil (-79.8862,-2.1894) -> Babahoyo (-79.5340,-1.8022).
`straight_route_payload` builds an OSRM-shaped payload for a straight road
whose speed the test chooses, so a test can place incidents at exact
distances from a highway or an urban street.
"""

import json
import math
from collections.abc import Callable, Sequence
from pathlib import Path

import httpx

from app.modules.routing.osrm import OsrmClient

_FIXTURE = Path(__file__).parent / "fixtures" / "osrm_guayaquil_babahoyo.json"

EARTH_RADIUS_M = 6_371_008.8
HIGHWAY_SPEED_MPS = 25.0  # 90 km/h
URBAN_SPEED_MPS = 8.0  # ~29 km/h


def load_fixture() -> dict:
    return json.loads(_FIXTURE.read_text())


def haversine_m(a: Sequence[float], b: Sequence[float]) -> float:
    lon1, lat1, lon2, lat2 = map(math.radians, (a[0], a[1], b[0], b[1]))
    h = (
        math.sin((lat2 - lat1) / 2) ** 2
        + math.cos(lat1) * math.cos(lat2) * math.sin((lon2 - lon1) / 2) ** 2
    )
    return 2 * EARTH_RADIUS_M * math.asin(math.sqrt(h))


def meters_to_lat_degrees(meters: float) -> float:
    """North-south offset in degrees for `meters` (spherical earth, good to <0.5%)."""
    return math.degrees(meters / EARTH_RADIUS_M)


def straight_route_payload(
    coords: Sequence[tuple[float, float]], speeds_mps: Sequence[float]
) -> dict:
    """An OSRM-shaped `Ok` payload for the polyline `coords`, one speed per segment."""
    distances = [haversine_m(a, b) for a, b in zip(coords, coords[1:], strict=False)]
    durations = [d / s if s else 0.0 for d, s in zip(distances, speeds_mps, strict=True)]
    return {
        "code": "Ok",
        "routes": [
            {
                "geometry": {"type": "LineString", "coordinates": [list(c) for c in coords]},
                "distance": sum(distances),
                "duration": sum(durations),
                "legs": [
                    {
                        "annotation": {
                            "distance": distances,
                            "duration": durations,
                            "speed": list(speeds_mps),
                        }
                    }
                ],
            }
        ],
    }


def fake_client(answer: dict | Callable[[httpx.Request], httpx.Response]) -> OsrmClient:
    """An OsrmClient whose every request gets `answer` (a JSON payload or a handler)."""
    if callable(answer):
        handler = answer
    else:

        def handler(request: httpx.Request) -> httpx.Response:
            return httpx.Response(200, json=answer)

    return OsrmClient("http://osrm.test", transport=httpx.MockTransport(handler))
