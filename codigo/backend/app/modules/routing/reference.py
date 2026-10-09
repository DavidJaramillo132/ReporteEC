"""Reference distribution of route exposure: the scale behind the 0-100 score.

`python -m app.ingestion route-reference` routes a deterministic sample of
canton pairs through OSRM, computes the exposure of each route for all 24
departure hours with the same service code the API uses
(`compute_route_exposure`), pools every route x hour exposure and stores its
101 percentile breakpoints in `route_risk_reference` (history is kept; the
service reads the newest row).

Sample (mainland only; Galápagos, province "20", is excluded):

- every canton to its `NEAREST_PER_CANTON` nearest cantons by distance
  between canton points (ST_PointOnSurface), unordered pairs deduplicated;
- plus `LONG_PAIRS` random pairs at least `LONG_PAIR_MIN_KM` apart, drawn
  with a fixed seed so a rerun on the same cantons picks the same pairs.

Pairs OSRM cannot route, or that fail `validate_route` (an end snapped
> 2 km, same place), are skipped and counted.
"""

from __future__ import annotations

import logging
import math
import random
from collections.abc import Callable, Sequence
from dataclasses import dataclass
from datetime import datetime
from itertools import combinations

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.modules.routing.geometry import LonLat
from app.modules.routing.models import RouteRiskReference
from app.modules.routing.osrm import OsrmClient, OsrmUnavailable, RouteNotFound
from app.modules.routing.scoring import percentile_breakpoints
from app.modules.routing.service import (
    InvalidRoute,
    NationalContext,
    compute_route_exposure,
    load_national_context,
    validate_route,
)
from app.modules.territory.models import Canton

logger = logging.getLogger(__name__)

GALAPAGOS_PROVINCE_CODE = "20"
NEAREST_PER_CANTON = 5
LONG_PAIRS = 200
LONG_PAIR_MIN_KM = 100.0
SAMPLE_SEED = 20261009
PROGRESS_EVERY = 100
# Consecutive "OSRM unreachable" answers after which the job gives up: with
# the service down every pair would be skipped and an empty reference stored.
MAX_CONSECUTIVE_UNAVAILABLE = 5
EARTH_RADIUS_KM = 6371.0088


class ReferenceBuildError(Exception):
    """The reference cannot be built; the message is Spanish, for the operator."""


@dataclass(frozen=True, slots=True)
class CantonPoint:
    code: str
    province_code: str | None
    lon: float
    lat: float

    @property
    def point(self) -> LonLat:
        return (self.lon, self.lat)


Pair = tuple[CantonPoint, CantonPoint]


def distance_km(a: CantonPoint, b: CantonPoint) -> float:
    lon1, lat1, lon2, lat2 = map(math.radians, (a.lon, a.lat, b.lon, b.lat))
    h = (
        math.sin((lat2 - lat1) / 2) ** 2
        + math.cos(lat1) * math.cos(lat2) * math.sin((lon2 - lon1) / 2) ** 2
    )
    return 2 * EARTH_RADIUS_KM * math.asin(math.sqrt(h))


def load_canton_points(session: Session) -> list[CantonPoint]:
    """Every canton's ST_PointOnSurface (same expression as the places search)."""
    point = func.ST_PointOnSurface(Canton.geom)
    rows = session.execute(
        select(Canton.code, Canton.province_code, func.ST_X(point), func.ST_Y(point)).order_by(
            Canton.code
        )
    ).all()
    return [CantonPoint(code, province, lon, lat) for code, province, lon, lat in rows]


def build_sample(
    cantons: Sequence[CantonPoint],
    *,
    nearest: int = NEAREST_PER_CANTON,
    long_pairs: int = LONG_PAIRS,
    min_long_km: float = LONG_PAIR_MIN_KM,
    seed: int = SAMPLE_SEED,
) -> list[Pair]:
    """The deterministic pair sample (see the module docstring), sorted by canton codes."""
    mainland = sorted(
        (c for c in cantons if c.province_code != GALAPAGOS_PROVINCE_CODE), key=lambda c: c.code
    )
    chosen: dict[tuple[str, str], Pair] = {}

    def add(a: CantonPoint, b: CantonPoint) -> bool:
        key = (a.code, b.code) if a.code < b.code else (b.code, a.code)
        if key in chosen or a.code == b.code:
            return False
        chosen[key] = (a, b) if a.code < b.code else (b, a)
        return True

    for canton in mainland:
        others = sorted(
            (c for c in mainland if c.code != canton.code),
            key=lambda c: (distance_km(canton, c), c.code),
        )
        for other in others[:nearest]:
            add(canton, other)

    long_candidates = [
        (a, b)
        for a, b in combinations(mainland, 2)
        if distance_km(a, b) >= min_long_km and (a.code, b.code) not in chosen
    ]
    rng = random.Random(seed)
    for a, b in rng.sample(long_candidates, min(long_pairs, len(long_candidates))):
        add(a, b)
    return [chosen[key] for key in sorted(chosen)]


@dataclass(frozen=True, slots=True)
class ReferenceResult:
    breakpoints: list[float]
    routes_ok: int
    routes_skipped: int
    exposures_count: int
    data_cut: datetime | None
    data_version: str


def serialize_data_version(context: NationalContext) -> str:
    return "|".join("" if part is None else str(part) for part in context.data_version)


def compute_reference(
    session: Session,
    client: OsrmClient,
    pairs: Sequence[Pair],
    context: NationalContext,
    *,
    progress: Callable[[int, int, int], None] | None = None,
) -> ReferenceResult:
    """Route every pair, pool the 24 hourly exposures of each, return the breakpoints.

    Sequential on purpose: offline work, one OSRM call per pair. `progress`
    gets (pairs done, routes ok, routes skipped) every `PROGRESS_EVERY` pairs.
    Raises `ReferenceBuildError` when OSRM keeps being unreachable or no pair routes.
    """
    exposures: list[float] = []
    ok = skipped = consecutive_unavailable = 0
    for done, (origin, destination) in enumerate(pairs, start=1):
        try:
            route = client.route(origin.point, destination.point)
            validate_route(route)
        except (RouteNotFound, InvalidRoute) as exc:
            skipped += 1
            consecutive_unavailable = 0
            logger.info("skipped %s -> %s: %r", origin.code, destination.code, exc)
        except OsrmUnavailable as exc:
            skipped += 1
            consecutive_unavailable += 1
            logger.warning("OSRM unavailable for %s -> %s: %s", origin.code, destination.code, exc)
            if consecutive_unavailable >= MAX_CONSECUTIVE_UNAVAILABLE:
                raise ReferenceBuildError(
                    "OSRM no responde (varios intentos seguidos fallaron). "
                    "Revisa que el servicio `osrm` esté arriba y que sus datos estén subidos "
                    "(sección «Rutas (OSRM)» del README de despliegue)."
                ) from exc
        else:
            consecutive_unavailable = 0
            exposures.extend(compute_route_exposure(session, route, context).exposures)
            ok += 1
        if progress and done % PROGRESS_EVERY == 0:
            progress(done, ok, skipped)
    if not exposures:
        raise ReferenceBuildError("Ninguna ruta de la muestra se pudo calcular; no se guardó nada.")
    return ReferenceResult(
        breakpoints=percentile_breakpoints(exposures),
        routes_ok=ok,
        routes_skipped=skipped,
        exposures_count=len(exposures),
        data_cut=context.data_cut,
        data_version=serialize_data_version(context),
    )


def store_reference(session: Session, result: ReferenceResult) -> RouteRiskReference:
    row = RouteRiskReference(
        breakpoints=result.breakpoints,
        routes_ok=result.routes_ok,
        routes_skipped=result.routes_skipped,
        exposures_count=result.exposures_count,
        data_cut=result.data_cut,
        data_version=result.data_version,
    )
    session.add(row)
    session.commit()
    return row


def run_route_reference(session: Session, client: OsrmClient) -> ReferenceResult:
    """The whole job: sample, route, pool, store. Prints a Spanish summary."""
    cantons = load_canton_points(session)
    if not cantons:
        raise ReferenceBuildError("No hay cantones cargados; carga los cantones primero.")
    context = load_national_context(session)
    if context.data_cut is None:
        raise ReferenceBuildError("No hay incidentes para rutas; carga los datos primero.")
    pairs = build_sample(cantons)
    print(f"Muestra: {len(pairs)} pares de cantones (solo continente).")

    def report(done: int, ok: int, skipped: int) -> None:
        print(f"  {done}/{len(pairs)} pares — {ok} rutas calculadas, {skipped} omitidas")

    result = compute_reference(session, client, pairs, context, progress=report)
    store_reference(session, result)
    print(
        f"Referencia guardada: {result.routes_ok} rutas calculadas, "
        f"{result.routes_skipped} omitidas, {result.exposures_count} exposiciones "
        f"(24 horas por ruta). Corte de datos: {result.data_cut:%Y-%m-%d}."
    )
    logger.info(
        "route reference: ok=%d skipped=%d exposures=%d",
        result.routes_ok,
        result.routes_skipped,
        result.exposures_count,
    )
    return result
