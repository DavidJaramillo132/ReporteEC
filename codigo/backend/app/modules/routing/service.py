"""Route risk: which registered violent deaths lie near an OSRM route, and when.

Pipeline for one origin/destination pair (`analyze_route`):

1. `load_national_context` -- the data cut (latest `occurred_at` among the
   incidents routes use) and the national 24-hour curve. Cached in-process
   for `NATIONAL_CONTEXT_TTL_S`.
2. `fetch_route_cases` -- ONE SQL statement intersects the incidents with the
   route's buffered chunks (`app.modules.routing.geometry`). The `&&` against
   `ST_Expand` lets the GiST index on `incidents.geom` pick candidates; the
   exact `ST_DWithin` on geography (meters) then applies the 1,000 m highway
   / 200 m urban buffer.
3. `compute_route_exposure` -- recency weights, the hourly curve, shrinkage
   and exposure for every departure hour (pure math in
   `app.modules.routing.scoring`). Callable without HTTP: it takes an
   `OsrmRoute` and a session, so the reference-distribution job can call it
   for every canton pair.
4. `find_blackspots` -- 1 km pieces with the most weighted cases.

The 0-100 score is a percentile of exposure against a stored reference
distribution that does not exist yet: every response is built with a
`ScoreFn`, and `no_reference_score` (always None) is the only one today.

Incidents used (V2 global constraints): types homicidio/sicariato/femicidio,
`location_precision` exacta or aproximada (canton-level points are a
canton's ST_PointOnSurface, not a place on a road), and drawn on the map
(`map_incidents`: active, not located, 2019 onwards). Hours are local time.
"""

from __future__ import annotations

import math
import threading
import time
from collections import OrderedDict
from collections.abc import Callable, Hashable, Sequence
from dataclasses import dataclass
from datetime import datetime

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.time import GUAYAQUIL
from app.modules.incidents.models import IncidentType, LocationPrecision
from app.modules.routing.geometry import LonLat, RouteChunk, build_chunks, point_at_distance
from app.modules.routing.osrm import OsrmClient, OsrmRoute
from app.modules.routing.schemas import (
    Blackspot,
    Coordinates,
    HourRisk,
    RouteCases,
    RouteGeometry,
    RouteRiskResponse,
)
from app.modules.routing.scoring import (
    HOURS_PER_DAY,
    SHRINKAGE_K,
    band_for,
    best_departure_hour,
    exposures_by_departure_hour,
    normalize,
    peak_hours,
    recency_weight,
    select_blackspot_pieces,
    shrink_toward,
    smooth_circular,
)

ROUTE_INCIDENT_TYPES = (IncidentType.HOMICIDIO, IncidentType.SICARIATO, IncidentType.FEMICIDIO)
ROUTE_LOCATION_PRECISIONS = (LocationPrecision.EXACTA, LocationPrecision.APROXIMADA)
PIECE_LENGTH_M = 1000.0
COORDINATE_DECIMALS = 4  # ~11 m: map clicks a few meters apart share a cache entry
NATIONAL_CONTEXT_TTL_S = 600.0
# A cached analysis keeps the whole parsed OSRM route: measured ~0.07 MB for
# Guayaquil-Babahoyo (73 km) and ~1.1 MB for Loja-Quito (642 km, 12,800
# vertices). 64 entries cap the cache near 70 MB even for the longest
# routes, inside the backend container's 512 MB limit.
ROUTE_CACHE_SIZE = 64

# Conservative meters per degree for the index pre-filter box: a degree of
# latitude is >= 110,570 m and a degree of longitude is >= 110,000 m for
# |lat| <= 8.8 degrees (all of Ecuador, Galápagos included), so dividing by
# 110,000 never makes the box narrower than the buffer.
_METERS_PER_DEGREE_LOWER_BOUND = 110_000.0

NOTES = (
    "El puntaje mide las muertes violentas registradas cerca de la ruta (homicidios, "
    "sicariatos y femicidios). No mide todos los delitos ni el riesgo de cada persona "
    "que viaja.",
    "De noche viaja menos gente, y estas cifras no se ajustan según la cantidad de tráfico.",
    "No incluye robos, secuestros ni siniestros de tránsito, porque no existen datos "
    "con su ubicación.",
)

ScoreFn = Callable[[float], int | None]


def no_reference_score(exposure: float) -> int | None:
    """No reference distribution of exposures is stored yet: no score."""
    return None


# ---------------------------------------------------------------------------
# National context: data cut and the national hourly curve.
# ---------------------------------------------------------------------------


@dataclass(frozen=True, slots=True)
class NationalContext:
    data_cut: datetime | None
    national_share: tuple[float, ...]


# FROM/WHERE of "an incident routes use"; each query selects its own columns.
_ELIGIBLE_FROM = """
    FROM map_incidents AS m
    JOIN incidents AS i ON i.id = m.id
    WHERE m.type = ANY(CAST(:types AS text[]))
      AND i.location_precision = ANY(CAST(:precisions AS text[]))
"""

_NATIONAL_SQL = text(
    f"""
    WITH eligible AS (SELECT i.occurred_at {_ELIGIBLE_FROM}),
    cut AS (SELECT max(occurred_at) AS data_cut FROM eligible)
    -- double precision throughout: EXTRACT returns numeric, and a numeric
    -- power() over every incident in the country is ~10x slower.
    SELECT
        EXTRACT(HOUR FROM e.occurred_at AT TIME ZONE 'America/Guayaquil')::integer AS hour,
        sum(power(
            CAST(0.5 AS double precision),
            CAST(EXTRACT(EPOCH FROM (cut.data_cut - e.occurred_at)) AS double precision)
                / (86400.0 * 365.25)
        )) AS weight,
        cut.data_cut
    FROM eligible AS e CROSS JOIN cut
    GROUP BY 1, cut.data_cut
    """
)


def _filter_params() -> dict[str, list[str]]:
    return {
        "types": [t.value for t in ROUTE_INCIDENT_TYPES],
        "precisions": [p.value for p in ROUTE_LOCATION_PRECISIONS],
    }


def load_national_context(session: Session) -> NationalContext:
    """Data cut and national share, over every incident routes use, nationwide.

    The national curve gets the same treatment as a route's curve (recency
    weights from the same cut, circular smoothing) and is normalized to sum 1;
    with no incidents at all it is uniform.
    """
    rows = session.execute(_NATIONAL_SQL, _filter_params()).all()
    weights = [0.0] * HOURS_PER_DAY
    data_cut = None
    for hour, weight, cut in rows:
        weights[hour] = float(weight)
        data_cut = cut
    return NationalContext(
        data_cut=data_cut, national_share=tuple(normalize(smooth_circular(weights)))
    )


class _NationalContextCache:
    def __init__(self, ttl_s: float) -> None:
        self._ttl_s = ttl_s
        self._lock = threading.Lock()
        self._value: tuple[float, NationalContext] | None = None

    def get(self, session: Session) -> NationalContext:
        with self._lock:
            if self._value and time.monotonic() - self._value[0] < self._ttl_s:
                return self._value[1]
        context = load_national_context(session)
        with self._lock:
            self._value = (time.monotonic(), context)
        return context

    def clear(self) -> None:
        with self._lock:
            self._value = None


_national_cache = _NationalContextCache(NATIONAL_CONTEXT_TTL_S)


def get_national_context(session: Session) -> NationalContext:
    """`load_national_context`, cached in-process for `NATIONAL_CONTEXT_TTL_S`."""
    return _national_cache.get(session)


# ---------------------------------------------------------------------------
# The spatial intersection.
# ---------------------------------------------------------------------------

_ROUTE_CASES_SQL = text(
    f"""
    WITH chunks AS (
        SELECT ST_GeomFromText(c.wkt, 4326) AS geom, c.start_m, c.length_m, c.buffer_m
        FROM unnest(
            CAST(:wkts AS text[]),
            CAST(:starts AS double precision[]),
            CAST(:lengths AS double precision[]),
            CAST(:buffers AS double precision[])
        ) AS c(wkt, start_m, length_m, buffer_m)
    ),
    eligible AS (SELECT i.id, i.type, i.occurred_at, m.geom {_ELIGIBLE_FROM})
    SELECT DISTINCT ON (e.id)
        e.type,
        e.occurred_at,
        c.start_m + ST_LineLocatePoint(c.geom, e.geom) * c.length_m AS position_m
    FROM chunks AS c
    JOIN eligible AS e
      ON e.geom && ST_Expand(c.geom, c.buffer_m / {_METERS_PER_DEGREE_LOWER_BOUND})
     AND ST_DWithin(e.geom::geography, c.geom::geography, c.buffer_m)
    ORDER BY e.id, ST_Distance(e.geom::geography, c.geom::geography)
    """
)


@dataclass(frozen=True, slots=True)
class RouteCase:
    type: str
    occurred_at: datetime
    position_m: float
    """Meters from the origin along the route (projection on the nearest chunk)."""


def fetch_route_cases(session: Session, chunks: Sequence[RouteChunk]) -> list[RouteCase]:
    """Every eligible incident within its nearest chunk's buffer, in one round-trip."""
    if not chunks:
        return []
    rows = session.execute(
        _ROUTE_CASES_SQL,
        {
            "wkts": [chunk.wkt() for chunk in chunks],
            "starts": [chunk.start_m for chunk in chunks],
            "lengths": [chunk.length_m for chunk in chunks],
            "buffers": [chunk.buffer_m for chunk in chunks],
            **_filter_params(),
        },
    ).all()
    return [
        RouteCase(type=str(kind), occurred_at=occurred_at, position_m=float(position))
        for kind, occurred_at, position in rows
    ]


# ---------------------------------------------------------------------------
# Exposure and the analysis of one route.
# ---------------------------------------------------------------------------


@dataclass(frozen=True, slots=True)
class WeightedCase:
    type: str
    local_time: datetime
    weight: float
    position_m: float


@dataclass(frozen=True, slots=True)
class RouteExposure:
    route: OsrmRoute
    cases: tuple[WeightedCase, ...]
    weighted_by_hour: tuple[float, ...]
    share: tuple[float, ...]
    weighted_total: float
    exposures: tuple[float, ...]
    data_cut: datetime | None

    @property
    def duration_min(self) -> float:
        return self.route.duration_s / 60.0

    @property
    def low_data(self) -> bool:
        return self.weighted_total < SHRINKAGE_K


def weigh_cases(cases: Sequence[RouteCase], data_cut: datetime | None) -> list[WeightedCase]:
    """Local time and recency weight (measured from `data_cut`) for each case."""
    weighted = []
    for case in cases:
        age_days = (data_cut - case.occurred_at).total_seconds() / 86400.0 if data_cut else 0.0
        weighted.append(
            WeightedCase(
                type=case.type,
                local_time=case.occurred_at.astimezone(GUAYAQUIL),
                weight=recency_weight(age_days),
                position_m=case.position_m,
            )
        )
    return weighted


def compute_route_exposure(
    session: Session, route: OsrmRoute, context: NationalContext | None = None
) -> RouteExposure:
    """Exposure for all 24 departure hours of an already-routed trip.

    No HTTP involved: the caller routes with OSRM; this runs the one spatial
    query and the pure math. `context` defaults to the cached national one.
    """
    context = context or get_national_context(session)
    chunks = build_chunks(route.coordinates, route.segment_distances_m, route.segment_speeds_mps)
    cases = weigh_cases(fetch_route_cases(session, chunks), context.data_cut)

    weighted_by_hour = [0.0] * HOURS_PER_DAY
    for case in cases:
        weighted_by_hour[case.local_time.hour] += case.weight
    weighted_total = sum(weighted_by_hour)
    share = shrink_toward(smooth_circular(weighted_by_hour), context.national_share)
    exposures = exposures_by_departure_hour(share, weighted_total, route.duration_s / 60.0)
    return RouteExposure(
        route=route,
        cases=tuple(cases),
        weighted_by_hour=tuple(weighted_by_hour),
        share=tuple(share),
        weighted_total=weighted_total,
        exposures=tuple(exposures),
        data_cut=context.data_cut,
    )


def _count_by_type(cases: Sequence[WeightedCase]) -> dict[str, int]:
    counts = {t.value: 0 for t in ROUTE_INCIDENT_TYPES}
    for case in cases:
        counts[case.type] += 1
    return counts


def find_blackspots(exposure: RouteExposure) -> list[Blackspot]:
    """Cut the route into consecutive 1 km pieces and report the blackspot ones."""
    route = exposure.route
    length_m = sum(route.segment_distances_m)
    piece_count = max(1, math.ceil(length_m / PIECE_LENGTH_M))
    pieces: list[list[WeightedCase]] = [[] for _ in range(piece_count)]
    for case in exposure.cases:
        index = int(max(case.position_m, 0.0) // PIECE_LENGTH_M)
        pieces[min(index, piece_count - 1)].append(case)

    blackspots = []
    for index in select_blackspot_pieces([sum(c.weight for c in piece) for piece in pieces]):
        piece = pieces[index]
        start_m = index * PIECE_LENGTH_M
        end_m = min(start_m + PIECE_LENGTH_M, length_m)
        lon, lat = point_at_distance(
            route.coordinates, route.segment_distances_m, (start_m + end_m) / 2
        )
        by_hour = [0.0] * HOURS_PER_DAY
        for case in piece:
            by_hour[case.local_time.hour] += case.weight
        dates = [case.local_time.date() for case in piece]
        blackspots.append(
            Blackspot(
                km_from=round(start_m / 1000, 3),
                km_to=round(end_m / 1000, 3),
                lon=lon,
                lat=lat,
                weighted_cases=round(sum(c.weight for c in piece), 4),
                cases=len(piece),
                by_type=_count_by_type(piece),
                peak_hours=peak_hours(by_hour),
                first_date=min(dates),
                last_date=max(dates),
            )
        )
    return blackspots


@dataclass(frozen=True, slots=True)
class RouteAnalysis:
    """Everything about a route that does not depend on the departure hour asked for."""

    origin: LonLat
    destination: LonLat
    exposure: RouteExposure
    blackspots: tuple[Blackspot, ...]
    best_hour: int


def analyze_route(
    session: Session,
    route: OsrmRoute,
    origin: LonLat,
    destination: LonLat,
    context: NationalContext | None = None,
) -> RouteAnalysis:
    exposure = compute_route_exposure(session, route, context)
    return RouteAnalysis(
        origin=origin,
        destination=destination,
        exposure=exposure,
        blackspots=tuple(find_blackspots(exposure)),
        best_hour=best_departure_hour(exposure.exposures),
    )


def _hour_risk(exposure: RouteExposure, hour: int, score_fn: ScoreFn) -> HourRisk:
    value = exposure.exposures[hour]
    score = score_fn(value)
    band = band_for(score) if score is not None else None
    return HourRisk(
        hour=hour,
        share=round(exposure.share[hour], 6),
        weighted_cases=round(exposure.weighted_by_hour[hour], 4),
        exposure=round(value, 4),
        score=score,
        score_available=score is not None,
        band=band,
        band_label=band.label if band else None,
    )


def build_response(analysis: RouteAnalysis, hour: int, score_fn: ScoreFn) -> RouteRiskResponse:
    exposure = analysis.exposure
    route = exposure.route
    hourly = [_hour_risk(exposure, h, score_fn) for h in range(HOURS_PER_DAY)]
    return RouteRiskResponse(
        origin=Coordinates(lon=analysis.origin[0], lat=analysis.origin[1]),
        destination=Coordinates(lon=analysis.destination[0], lat=analysis.destination[1]),
        geometry=RouteGeometry(coordinates=list(route.coordinates)),
        distance_km=round(route.distance_m / 1000, 2),
        duration_min=round(route.duration_s / 60, 1),
        cases=RouteCases(
            total=len(exposure.cases),
            by_type=_count_by_type(exposure.cases),
            weighted_total=round(exposure.weighted_total, 4),
        ),
        selected=hourly[hour],
        best_hour=analysis.best_hour,
        hourly=hourly,
        blackspots=list(analysis.blackspots),
        low_data=exposure.low_data,
        data_cut=exposure.data_cut.astimezone(GUAYAQUIL).date() if exposure.data_cut else None,
        notes=list(NOTES),
    )


# ---------------------------------------------------------------------------
# The request-level entry point, with its in-process LRU cache.
# ---------------------------------------------------------------------------


class _LruCache:
    def __init__(self, maxsize: int) -> None:
        self._maxsize = maxsize
        self._lock = threading.Lock()
        self._items: OrderedDict[Hashable, RouteAnalysis] = OrderedDict()

    def get(self, key: Hashable) -> RouteAnalysis | None:
        with self._lock:
            value = self._items.get(key)
            if value is not None:
                self._items.move_to_end(key)
            return value

    def put(self, key: Hashable, value: RouteAnalysis) -> None:
        with self._lock:
            self._items[key] = value
            self._items.move_to_end(key)
            while len(self._items) > self._maxsize:
                self._items.popitem(last=False)

    def clear(self) -> None:
        with self._lock:
            self._items.clear()


_route_cache = _LruCache(ROUTE_CACHE_SIZE)


def clear_caches() -> None:
    """Forget the national context and every cached route (tests, data reloads)."""
    _national_cache.clear()
    _route_cache.clear()


def round_coordinates(point: LonLat) -> LonLat:
    return (round(point[0], COORDINATE_DECIMALS), round(point[1], COORDINATE_DECIMALS))


def route_risk(
    session: Session,
    client: OsrmClient,
    origin: LonLat,
    destination: LonLat,
    hour: int,
    score_fn: ScoreFn = no_reference_score,
) -> RouteRiskResponse:
    """Route `origin` -> `destination` and score it for departure `hour`.

    Coordinates are rounded to `COORDINATE_DECIMALS` before routing, so a
    cached and a fresh answer are identical. The cache key includes the data
    cut: new data invalidates old entries once the national context refreshes.
    Raises `RouteNotFound` / `OsrmUnavailable` from the OSRM client.
    """
    origin, destination = round_coordinates(origin), round_coordinates(destination)
    context = get_national_context(session)
    key = (origin, destination, context.data_cut)
    analysis = _route_cache.get(key)
    if analysis is None:
        route = client.route(origin, destination)
        analysis = analyze_route(session, route, origin, destination, context)
        _route_cache.put(key, analysis)
    return build_response(analysis, hour, score_fn)
