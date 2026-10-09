"""Route risk: which registered violent deaths lie near an OSRM route, and when.

Pipeline for one origin/destination pair (`analyze_route`):

1. `load_national_context` -- the data cut (latest `occurred_at` among the
   incidents routes use), a data version, and the national 24-hour curve.
   Cached in-process for `NATIONAL_CONTEXT_TTL_S`.
2. `fetch_route_cases` -- ONE SQL statement intersects the incidents with the
   route's 1 km pieces (`app.modules.routing.geometry`). The `&&` against
   `ST_Expand` lets the GiST index on `incidents.geom` pick candidates; the
   exact `ST_DWithin` on geography (meters) then applies each piece's
   1,000 m highway / 200 m urban buffer.
3. `compute_route_density` -- recency weights, the hourly curve, shrinkage,
   weighted cases per km and the density for every departure hour (pure
   math in `app.modules.routing.scoring`). Callable without HTTP: it takes an
   `OsrmRoute` and a session, so the reference-distribution job can call it
   for every canton pair.
4. `find_blackspots` -- the same 1 km pieces, ranked by weighted cases.

Everything is computed on the full OSRM geometry; only the line returned
for drawing is simplified (Douglas-Peucker, 20 m). The in-process route
cache keeps a compact `RouteAnalysis` (no full geometry, pieces or case
rows), and at most `MAX_CONCURRENT_COMPUTATIONS` uncached routes are
computed at once per worker; past that, `RoutingBusy` (503).

The 0-100 score is a percentile of density (danger per km, see
`app.modules.routing.scoring`) against a stored reference distribution
(`route_risk_reference`, built by `app.modules.routing.reference`). Only rows
whose `metric` is `DENSITY_METRIC` count; the older exposure rows are never
used. The newest density row is tracked by id (`get_reference`): one cheap
query per request, breakpoints reloaded only when a newer row appears. Every
response is built with a `ScoreFn`:
`score_fn_for(session)` maps density through the reference, and
`no_reference_score` (always None, so `score_available: false`) is used when
no row exists. Scores are applied per request, after the route cache, so a
new reference never leaves a cached response with an old score.

Incidents used (V2 global constraints): types homicidio/sicariato/femicidio,
`location_precision` exacta or aproximada (canton-level points are a
canton's ST_PointOnSurface, not a place on a road), and drawn on the map
(`map_incidents`: active, not located, 2019 onwards). Hours are local time.
A case at exactly 00:00:00 local has no recorded hour (the sources store a
missing hour as midnight): it counts everywhere except in hourly curves.
"""

from __future__ import annotations

import logging
import threading
import time
from array import array
from collections import OrderedDict
from collections.abc import Callable, Hashable, Sequence
from dataclasses import dataclass
from datetime import date, datetime
from typing import Literal

from sqlalchemy import select, text
from sqlalchemy.orm import Session

from app.core.time import GUAYAQUIL
from app.modules.incidents.models import IncidentType, LocationPrecision
from app.modules.routing.geometry import (
    LonLat,
    RoutePiece,
    build_pieces,
    point_at_distance,
    simplify_line,
)
from app.modules.routing.models import DENSITY_METRIC, RouteRiskReference
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
    BREAKPOINT_COUNT,
    HOURS_PER_DAY,
    SHRINKAGE_K,
    band_for,
    best_departure_hour,
    densities_by_departure_hour,
    has_recorded_hour,
    normalize,
    peak_hours,
    recency_weight,
    score_from_breakpoints,
    select_blackspot_pieces,
    shrink_toward,
    smooth_circular,
)

logger = logging.getLogger(__name__)

ROUTE_INCIDENT_TYPES = (IncidentType.HOMICIDIO, IncidentType.SICARIATO, IncidentType.FEMICIDIO)
ROUTE_LOCATION_PRECISIONS = (LocationPrecision.EXACTA, LocationPrecision.APROXIMADA)
COORDINATE_DECIMALS = 4  # ~11 m: map clicks a few meters apart share a cache entry
MAX_SNAP_DISTANCE_M = 2000.0
NATIONAL_CONTEXT_TTL_S = 600.0
# The cache is per worker process (the Dockerfile runs 2 uvicorn workers),
# and it keeps only what a response needs (`RouteAnalysis`): no OSRM
# geometry, pieces or case rows. Deep size of one entry, measured with real
# OSRM routes and the full incident data: Loja-Quito (643 km, 397 cases)
# 0.048 MB, Huaquillas-Tulcán (800 km, 1,609 cases) 0.042 MB; it was 2.7 and
# 3.0 MB when the cache kept the whole analysis. The size follows the display
# line, not the case count. Budget: under 40 MB of cache per worker, so 512
# entries of ~0.05 MB (~26 MB per worker, ~52 MB for both, worst case).
ROUTE_CACHE_SIZE = 512
# Uncached computations running at once in one worker process. Each holds a
# database connection, an OSRM request and ~50 ms of pure Python (the GIL);
# beyond this a request gets a 503 at once instead of queueing behind them.
MAX_CONCURRENT_COMPUTATIONS = 2

# Conservative meters per degree for the index pre-filter box: a degree of
# latitude is >= 110,570 m and a degree of longitude is >= 110,000 m for
# |lat| <= 8.8 degrees (all of Ecuador, Galápagos included), so dividing by
# 110,000 never makes the box narrower than the buffer.
_METERS_PER_DEGREE_LOWER_BOUND = 110_000.0

NOTES = (
    "El puntaje mide las muertes violentas registradas por kilómetro de la ruta (homicidios, "
    "sicariatos y femicidios). No mide todos los delitos ni el riesgo de cada persona "
    "que viaja.",
    "De noche viaja menos gente, y estas cifras no se ajustan según la cantidad de tráfico.",
    "No incluye robos, secuestros ni siniestros de tránsito, porque no existen datos "
    "con su ubicación.",
)

ScoreFn = Callable[[float], int | None]


def no_reference_score(density: float) -> int | None:
    """No reference distribution of densities is stored: no score, never a made-up one."""
    return None


def reference_score_fn(breakpoints: Sequence[float]) -> ScoreFn:
    """Density -> whole 0-100 score against 101 percentile breakpoints."""
    frozen = tuple(breakpoints)
    return lambda density: score_from_breakpoints(frozen, density)


InvalidRouteReason = Literal["origin_far_from_road", "destination_far_from_road", "same_place"]


class InvalidRoute(Exception):
    """The request routes, but not usefully: the API answers 422 with `reason`'s message."""

    def __init__(self, reason: InvalidRouteReason) -> None:
        super().__init__(reason)
        self.reason: InvalidRouteReason = reason


def validate_route(route: OsrmRoute) -> None:
    """Reject a route whose ends OSRM had to snap > 2 km, or that goes nowhere.

    OSRM snaps any point to the nearest road without a limit (a click in the
    ocean still routes, from the coast). Origin and destination that snap to
    the same place, or a 0 m route, are the same place.
    """
    origin, destination = route.waypoints
    if origin.distance_m > MAX_SNAP_DISTANCE_M:
        raise InvalidRoute("origin_far_from_road")
    if destination.distance_m > MAX_SNAP_DISTANCE_M:
        raise InvalidRoute("destination_far_from_road")
    if origin.location == destination.location or route.distance_m <= 0:
        raise InvalidRoute("same_place")


# ---------------------------------------------------------------------------
# National context: data cut, data version and the national hourly curve.
# ---------------------------------------------------------------------------


@dataclass(frozen=True, slots=True)
class ReferenceInfo:
    """The newest stored density reference (one `route_risk_reference` row)."""

    id: int
    breakpoints: tuple[float, ...]


@dataclass(frozen=True, slots=True)
class NationalContext:
    data_cut: datetime | None
    data_version: tuple[object, ...]
    """Changes whenever the eligible incidents do (count, id sum, last update, cut)."""
    national_share: tuple[float, ...]


# FROM/WHERE of "an incident routes use"; each query selects its own columns.
_ELIGIBLE_FROM = """
    FROM map_incidents AS m
    JOIN incidents AS i ON i.id = m.id
    WHERE m.type = ANY(CAST(:types AS text[]))
      AND i.location_precision = ANY(CAST(:precisions AS text[]))
"""

# One row per hour with a recorded hour, or a single row with a NULL hour
# when there is none: the stats row always comes back.
_NATIONAL_SQL = text(
    f"""
    WITH eligible AS (SELECT i.id, i.occurred_at, i.updated_at {_ELIGIBLE_FROM}),
    stats AS (
        SELECT
            max(occurred_at) AS data_cut,
            count(*) AS incident_count,
            coalesce(sum(id), 0) AS id_sum,
            max(updated_at) AS last_update
        FROM eligible
    ),
    hourly AS (
        -- double precision throughout: EXTRACT returns numeric, and a numeric
        -- power() over every incident in the country is ~5x slower.
        SELECT
            EXTRACT(HOUR FROM e.occurred_at AT TIME ZONE 'America/Guayaquil')::integer AS hour,
            sum(power(
                CAST(0.5 AS double precision),
                CAST(EXTRACT(EPOCH FROM (s.data_cut - e.occurred_at)) AS double precision)
                    / (86400.0 * 365.25)
            )) AS weight
        FROM eligible AS e CROSS JOIN stats AS s
        -- 00:00:00 local is a missing hour, not midnight.
        WHERE CAST(e.occurred_at AT TIME ZONE 'America/Guayaquil' AS time) <> TIME '00:00:00'
        GROUP BY 1
    )
    SELECT s.data_cut, s.incident_count, s.id_sum, s.last_update, h.hour, h.weight
    FROM stats AS s LEFT JOIN hourly AS h ON true
    """
)


def _filter_params() -> dict[str, list[str]]:
    return {
        "types": [t.value for t in ROUTE_INCIDENT_TYPES],
        "precisions": [p.value for p in ROUTE_LOCATION_PRECISIONS],
    }


def _load_reference(session: Session, reference_id: int) -> ReferenceInfo | None:
    breakpoints = session.execute(
        select(RouteRiskReference.breakpoints).where(RouteRiskReference.id == reference_id)
    ).scalar_one_or_none()
    if breakpoints is None:
        return None
    if len(breakpoints) != BREAKPOINT_COUNT:
        logger.warning("route_risk_reference %s is malformed; scores unavailable", reference_id)
        return None
    return ReferenceInfo(id=reference_id, breakpoints=tuple(float(v) for v in breakpoints))


class _ReferenceCache:
    """The newest density reference row, re-read only when a newer id appears.

    Each call costs one `SELECT id ... WHERE metric = 'density_per_km' ORDER BY
    id DESC LIMIT 1` (a handful of rows, one per job run); the 101
    breakpoints are loaded only when that id differs from the cached one.
    The job runs in another process, so this is how a new row takes effect on
    the very next request, without waiting for the national context's TTL.
    """

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._value: tuple[int | None, ReferenceInfo | None] | None = None

    def get(self, session: Session) -> ReferenceInfo | None:
        newest = session.execute(
            select(RouteRiskReference.id)
            .where(RouteRiskReference.metric == DENSITY_METRIC)
            .order_by(RouteRiskReference.id.desc())
            .limit(1)
        ).scalar_one_or_none()
        with self._lock:
            if self._value is not None and self._value[0] == newest:
                return self._value[1]
        loaded = None if newest is None else _load_reference(session, newest)
        with self._lock:
            self._value = (newest, loaded)
        return loaded

    def clear(self) -> None:
        with self._lock:
            self._value = None


_reference_cache = _ReferenceCache()


def get_reference(session: Session) -> ReferenceInfo | None:
    """The newest stored density reference (None if there is none or it is malformed).

    Rows of any other metric (the retired exposure scale) are ignored.
    """
    return _reference_cache.get(session)


def score_fn_for(session: Session) -> ScoreFn:
    """The score function of the newest reference, or `no_reference_score`."""
    reference = get_reference(session)
    if reference is None:
        return no_reference_score
    return reference_score_fn(reference.breakpoints)


def load_national_context(session: Session) -> NationalContext:
    """Data cut, data version and national share, over every incident routes use.

    The national curve gets the same treatment as a route's curve (recency
    weights from the same cut, no-hour cases left out, circular smoothing)
    and is normalized to sum 1; with no hourly data at all it is uniform.
    """
    rows = session.execute(_NATIONAL_SQL, _filter_params()).all()
    weights = [0.0] * HOURS_PER_DAY
    for row in rows:
        if row.hour is not None:
            weights[row.hour] = float(row.weight)
    first = rows[0]
    return NationalContext(
        data_cut=first.data_cut,
        data_version=(first.data_cut, first.incident_count, int(first.id_sum), first.last_update),
        national_share=tuple(normalize(smooth_circular(weights))),
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
    WITH pieces AS (
        SELECT p.ordinal - 1 AS piece, ST_GeomFromText(p.wkt, 4326) AS geom, p.buffer_m
        FROM unnest(CAST(:wkts AS text[]), CAST(:buffers AS double precision[]))
            WITH ORDINALITY AS p(wkt, buffer_m, ordinal)
    ),
    eligible AS (SELECT i.id, i.type, i.occurred_at, m.geom {_ELIGIBLE_FROM})
    SELECT DISTINCT ON (e.id) e.type, e.occurred_at, p.piece
    FROM pieces AS p
    JOIN eligible AS e
      ON e.geom && ST_Expand(p.geom, p.buffer_m / {_METERS_PER_DEGREE_LOWER_BOUND})
     AND ST_DWithin(e.geom::geography, p.geom::geography, p.buffer_m)
    ORDER BY e.id, ST_Distance(e.geom::geography, p.geom::geography)
    """
)


@dataclass(frozen=True, slots=True)
class RouteCase:
    type: str
    occurred_at: datetime
    piece: int
    """Index of the nearest 1 km piece whose buffer contains the case."""


def fetch_route_cases(session: Session, pieces: Sequence[RoutePiece]) -> list[RouteCase]:
    """Every eligible incident within its nearest piece's buffer, in one round-trip."""
    if not pieces:
        return []
    rows = session.execute(
        _ROUTE_CASES_SQL,
        {
            "wkts": [piece.wkt() for piece in pieces],
            "buffers": [piece.buffer_m for piece in pieces],
            **_filter_params(),
        },
    ).all()
    return [
        RouteCase(type=str(kind), occurred_at=occurred_at, piece=int(piece))
        for kind, occurred_at, piece in rows
    ]


# ---------------------------------------------------------------------------
# Density and the analysis of one route.
# ---------------------------------------------------------------------------


@dataclass(frozen=True, slots=True)
class WeightedCase:
    type: str
    local_time: datetime
    weight: float
    piece: int

    @property
    def has_hour(self) -> bool:
        return has_recorded_hour(self.local_time)


@dataclass(frozen=True, slots=True)
class RouteDensity:
    route: OsrmRoute
    pieces: tuple[RoutePiece, ...]
    cases: tuple[WeightedCase, ...]
    weighted_by_hour: tuple[float, ...]
    """raw[h]: recency weights of the cases with a recorded hour, by local hour."""
    share: tuple[float, ...]
    weighted_total: float
    """W_total: recency weights of every case, with or without a recorded hour."""
    cases_per_km: float
    """W_total / distance_km."""
    densities: tuple[float, ...]
    """Density for each departure hour 0..23 (`scoring.density_for_departure`)."""
    data_cut: datetime | None

    @property
    def duration_min(self) -> float:
        return self.route.duration_s / 60.0

    @property
    def low_data(self) -> bool:
        """Σraw < K: the hourly curve leans mostly on the national one."""
        return sum(self.weighted_by_hour) < SHRINKAGE_K


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
                piece=case.piece,
            )
        )
    return weighted


def _weight_by_hour(cases: Sequence[WeightedCase]) -> list[float]:
    by_hour = [0.0] * HOURS_PER_DAY
    for case in cases:
        if case.has_hour:
            by_hour[case.local_time.hour] += case.weight
    return by_hour


def compute_route_density(
    session: Session, route: OsrmRoute, context: NationalContext | None = None
) -> RouteDensity:
    """Density for all 24 departure hours of an already-routed trip.

    No HTTP involved: the caller routes with OSRM; this runs the one spatial
    query and the pure math. `context` defaults to the cached national one.
    density(H) = (W_total / distance_km) x 24 x the trip's mean share from H.
    """
    context = context or get_national_context(session)
    pieces = build_pieces(route.coordinates, route.segment_distances_m, route.segment_speeds_mps)
    cases = weigh_cases(fetch_route_cases(session, pieces), context.data_cut)

    weighted_by_hour = _weight_by_hour(cases)
    weighted_total = sum(case.weight for case in cases)
    share = shrink_toward(smooth_circular(weighted_by_hour), context.national_share)
    # validate_route rejects 0 m routes; the guard only keeps this total.
    cases_per_km = weighted_total / (route.distance_m / 1000) if route.distance_m > 0 else 0.0
    densities = densities_by_departure_hour(share, cases_per_km, route.duration_s / 60.0)
    return RouteDensity(
        route=route,
        pieces=tuple(pieces),
        cases=tuple(cases),
        weighted_by_hour=tuple(weighted_by_hour),
        share=tuple(share),
        weighted_total=weighted_total,
        cases_per_km=cases_per_km,
        densities=tuple(densities),
        data_cut=context.data_cut,
    )


def _count_by_type(cases: Sequence[WeightedCase]) -> dict[str, int]:
    counts = {t.value: 0 for t in ROUTE_INCIDENT_TYPES}
    for case in cases:
        counts[case.type] += 1
    return counts


def find_blackspots(density: RouteDensity) -> list[Blackspot]:
    """Report the blackspot pieces among the route's 1 km pieces."""
    route = density.route
    cases_by_piece: list[list[WeightedCase]] = [[] for _ in density.pieces]
    for case in density.cases:
        cases_by_piece[case.piece].append(case)

    blackspots = []
    for index in select_blackspot_pieces([sum(c.weight for c in cs) for cs in cases_by_piece]):
        piece, cases = density.pieces[index], cases_by_piece[index]
        end_m = piece.start_m + piece.length_m
        lon, lat = point_at_distance(
            route.coordinates, route.segment_distances_m, piece.start_m + piece.length_m / 2
        )
        dates = [case.local_time.date() for case in cases]
        blackspots.append(
            Blackspot(
                km_from=round(piece.start_m / 1000, 3),
                km_to=round(end_m / 1000, 3),
                lon=lon,
                lat=lat,
                weighted_cases=round(sum(c.weight for c in cases), 4),
                cases=len(cases),
                by_type=_count_by_type(cases),
                peak_hours=peak_hours(_weight_by_hour(cases)),
                first_date=min(dates),
                last_date=max(dates),
            )
        )
    return blackspots


@dataclass(frozen=True, slots=True)
class RouteAnalysis:
    """Everything a response needs about a route, whatever departure hour is asked for.

    This is what the route cache keeps, so it holds no OSRM geometry, 1 km
    pieces or case rows: only the display line (a flat array of doubles),
    the 24-hour arrays, the case counts, the blackspots and the metadata.
    """

    origin: LonLat
    destination: LonLat
    distance_m: float
    duration_s: float
    display_coordinates: array[float]
    """The simplified display line, flattened: lon0, lat0, lon1, lat1, ..."""
    weighted_by_hour: tuple[float, ...]
    share: tuple[float, ...]
    densities: tuple[float, ...]
    weighted_total: float
    cases_per_km: float
    case_count: int
    by_type: tuple[tuple[str, int], ...]
    without_hour: int
    low_data: bool
    blackspots: tuple[Blackspot, ...]
    best_hour: int | None
    """None when the route has no case at all: every hour ties at 0."""
    data_cut: date | None
    """The data cut as a local (America/Guayaquil) date."""

    def display_line(self) -> list[tuple[float, float]]:
        flat = self.display_coordinates
        return [(flat[i], flat[i + 1]) for i in range(0, len(flat), 2)]


def analyze_route(
    session: Session,
    route: OsrmRoute,
    origin: LonLat,
    destination: LonLat,
    context: NationalContext | None = None,
) -> RouteAnalysis:
    """Compute a route's density and keep only what a response needs.

    The full route, its pieces and its cases are dropped once the analysis
    is built, so a cached analysis stays small (see `ROUTE_CACHE_SIZE`).
    """
    density = compute_route_density(session, route, context)
    cases = density.cases
    return RouteAnalysis(
        origin=origin,
        destination=destination,
        distance_m=route.distance_m,
        duration_s=route.duration_s,
        display_coordinates=array(
            "d", (value for point in simplify_line(route.coordinates) for value in point)
        ),
        weighted_by_hour=density.weighted_by_hour,
        share=density.share,
        densities=density.densities,
        weighted_total=density.weighted_total,
        cases_per_km=density.cases_per_km,
        case_count=len(cases),
        by_type=tuple(_count_by_type(cases).items()),
        without_hour=sum(1 for case in cases if not case.has_hour),
        low_data=density.low_data,
        blackspots=tuple(find_blackspots(density)),
        best_hour=(best_departure_hour(density.densities) if density.weighted_total > 0 else None),
        data_cut=density.data_cut.astimezone(GUAYAQUIL).date() if density.data_cut else None,
    )


def _hour_risk(analysis: RouteAnalysis, hour: int, score_fn: ScoreFn) -> HourRisk:
    value = analysis.densities[hour]
    score = score_fn(value)
    band = band_for(score) if score is not None else None
    return HourRisk(
        hour=hour,
        share=round(analysis.share[hour], 6),
        weighted_cases=round(analysis.weighted_by_hour[hour], 4),
        density=round(value, 6),
        score=score,
        score_available=score is not None,
        band=band,
        band_label=band.label if band else None,
    )


def build_response(analysis: RouteAnalysis, hour: int, score_fn: ScoreFn) -> RouteRiskResponse:
    hourly = [_hour_risk(analysis, h, score_fn) for h in range(HOURS_PER_DAY)]
    return RouteRiskResponse(
        origin=Coordinates(lon=analysis.origin[0], lat=analysis.origin[1]),
        destination=Coordinates(lon=analysis.destination[0], lat=analysis.destination[1]),
        geometry=RouteGeometry(coordinates=analysis.display_line()),
        distance_km=round(analysis.distance_m / 1000, 2),
        duration_min=round(analysis.duration_s / 60, 1),
        cases_per_km=round(analysis.cases_per_km, 4),
        cases=RouteCases(
            total=analysis.case_count,
            by_type=dict(analysis.by_type),
            weighted_total=round(analysis.weighted_total, 4),
            without_hour=analysis.without_hour,
        ),
        selected=hourly[hour],
        best_hour=analysis.best_hour,
        hourly=hourly,
        blackspots=list(analysis.blackspots),
        low_data=analysis.low_data,
        data_cut=analysis.data_cut,
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
    _reference_cache.clear()
    _route_cache.clear()


def round_coordinates(point: LonLat) -> LonLat:
    return (round(point[0], COORDINATE_DECIMALS), round(point[1], COORDINATE_DECIMALS))


class RoutingBusy(Exception):
    """`MAX_CONCURRENT_COMPUTATIONS` uncached routes are already being computed here."""


# Per worker process. Acquired without waiting: a busy worker answers 503 at
# once rather than piling requests on its threads and database pool.
_computations = threading.BoundedSemaphore(MAX_CONCURRENT_COMPUTATIONS)


def route_risk(
    session: Session,
    client: OsrmClient,
    origin: LonLat,
    destination: LonLat,
    hour: int,
    score_fn: ScoreFn | None = None,
) -> RouteRiskResponse:
    """Route `origin` -> `destination` and score it for departure `hour`.

    Coordinates are rounded to `COORDINATE_DECIMALS` before routing, so a
    cached and a fresh answer are identical. The cache key includes the data
    version, so any change to the eligible incidents misses the old entries
    once the national context refreshes (at most `NATIONAL_CONTEXT_TTL_S`).
    The cached analysis holds densities only; `score_fn` (default: the
    newest stored density reference) is applied on every call, so a new reference row
    takes effect on the next request without touching this cache.
    A cached route answers right away; an uncached one needs one of the
    `MAX_CONCURRENT_COMPUTATIONS` slots, else `RoutingBusy`.
    Raises `InvalidRoute`, `RoutingBusy`, and `RouteNotFound` /
    `OsrmUnavailable` from the OSRM client.
    """
    origin, destination = round_coordinates(origin), round_coordinates(destination)
    if origin == destination:
        raise InvalidRoute("same_place")
    context = get_national_context(session)
    key = (origin, destination, context.data_version)
    analysis = _route_cache.get(key)
    if analysis is None:
        if not _computations.acquire(blocking=False):
            raise RoutingBusy
        try:
            route = client.route(origin, destination)
            validate_route(route)
            analysis = analyze_route(session, route, origin, destination, context)
        finally:
            _computations.release()
        _route_cache.put(key, analysis)
    return build_response(analysis, hour, score_fn or score_fn_for(session))
