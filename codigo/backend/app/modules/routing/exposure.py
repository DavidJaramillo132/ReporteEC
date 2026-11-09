"""Historical spatial intensity integrated over native OSRM travel minutes.

Units are recency-weighted incidents / km² × minutes, not victimization odds.
The provisional 200 m bandwidth is deliberately versioned and uncalibrated;
levels require a compatible, independently calibrated national reference.
"""

from __future__ import annotations

import math
import os
from collections.abc import Sequence
from dataclasses import dataclass

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.modules.routing.osrm import OsrmRoute, OsrmUnavailable
from app.modules.routing.scoring import shrink_toward, smooth_circular

BANDWIDTH_M = float(os.environ.get("ROUTE_EXPOSURE_BANDWIDTH_M", "200"))
if BANDWIDTH_M not in (100, 200, 400, 800):
    raise ValueError("ROUTE_EXPOSURE_BANDWIDTH_M must be 100, 200, 400 or 800")
MODEL_VERSION = f"spatial_time_v1_b{BANDWIDTH_M:g}"
REFERENCE_METRIC = f"{MODEL_VERSION}_national_balanced"


@dataclass(frozen=True)
class Sample:
    lon: float
    lat: float
    start_min: float
    duration_min: float


def samples_for(route: OsrmRoute) -> list[Sample]:
    times = route.segment_durations_s
    if len(times) != len(route.segment_distances_m):
        raise OsrmUnavailable("OSRM native segment durations are required for exposure")
    samples: list[Sample] = []
    elapsed = 0.0
    for i, (distance, seconds) in enumerate(zip(route.segment_distances_m, times, strict=True)):
        if not math.isfinite(seconds) or seconds < 0:
            raise OsrmUnavailable("Invalid native segment duration")
        count = max(1, math.ceil(distance / 50), math.ceil(seconds / 60))
        a, b = route.coordinates[i : i + 2]
        for j in range(count):
            fraction = (j + 0.5) / count
            if seconds:
                samples.append(
                    Sample(
                        a[0] + (b[0] - a[0]) * fraction,
                        a[1] + (b[1] - a[1]) * fraction,
                        elapsed + j * seconds / count / 60,
                        seconds / count / 60,
                    )
                )
        elapsed += seconds / 60
    return samples


def kernel(distance_m: float, bandwidth_m: float = BANDWIDTH_M) -> float:
    if distance_m >= bandwidth_m:
        return 0.0
    return 3 / (math.pi * (bandwidth_m / 1000) ** 2) * (1 - (distance_m / bandwidth_m) ** 2) ** 2


def integrate(
    samples: Sequence[Sample], hourly_intensities: Sequence[Sequence[float]]
) -> tuple[float, ...]:
    """Split contributions exactly at clock-hour boundaries, including midnight."""
    totals = [0.0] * 24
    for sample, intensities in zip(samples, hourly_intensities, strict=True):
        for departure in range(24):
            cursor = departure * 60 + sample.start_min
            end = cursor + sample.duration_min
            while cursor < end:
                boundary = (math.floor(cursor / 60) + 1) * 60
                stop = min(end, boundary)
                totals[departure] += intensities[int(cursor // 60) % 24] * (stop - cursor)
                cursor = stop
    return tuple(totals)


# Indexed bounding box and geography distance; aggregate in SQL rather than
# transferring the potentially large sample × incident join to Python.
_SQL = text("""
WITH points AS MATERIALIZED (
 SELECT p.n, ST_SetSRID(ST_MakePoint(p.lon,p.lat),4326) AS geom
 FROM unnest(CAST(:lons AS float8[]), CAST(:lats AS float8[]))
 WITH ORDINALITY AS p(lon,lat,n)
), contributions AS (
 SELECT p.n, CASE WHEN (i.occurred_at AT TIME ZONE 'America/Guayaquil')::time = TIME '00:00:00'
 THEN -1 ELSE extract(hour FROM i.occurred_at AT TIME ZONE 'America/Guayaquil')::int END AS hour,
 power(0.5::float8, extract(epoch FROM (:cut - i.occurred_at))::float8/(86400*365.25)) *
 power(1-power(ST_Distance(m.geom::geography,p.geom::geography)/:radius,2),2) AS weight
 FROM points p JOIN map_incidents m
 ON m.geom && ST_Expand(p.geom,:radius/(110000.0*cos(radians(ST_Y(p.geom)))))
 AND ST_DWithin(m.geom::geography,p.geom::geography,:radius)
 JOIN incidents i ON i.id=m.id
 WHERE m.type = ANY(CAST(:types AS text[]))
 AND i.location_precision = ANY(CAST(:precisions AS text[]))
)
SELECT n, hour, sum(weight) AS weight FROM contributions GROUP BY n,hour
""")


def compute_exposure(
    session: Session, route: OsrmRoute, context, *, bandwidth_m: float = BANDWIDTH_M
) -> tuple[float, ...]:
    samples = samples_for(route)
    if context.data_cut is None:
        return (0.0,) * 24
    intensities: list[list[float]] = []
    for start in range(0, len(samples), 512):
        batch = samples[start : start + 512]
        rows = session.execute(
            _SQL,
            dict(
                lons=[s.lon for s in batch],
                lats=[s.lat for s in batch],
                cut=context.data_cut,
                radius=bandwidth_m,
                types=["homicidio", "sicariato", "femicidio"],
                precisions=["exacta", "aproximada"],
            ),
        ).all()
        weights = [[0.0] * 24 for _ in batch]
        totals = [0.0] * len(batch)
        for n, hour, weight in rows:
            totals[n - 1] += float(weight)
            if hour >= 0:
                weights[n - 1][hour] += float(weight)
        normalizer = 3 / (math.pi * (bandwidth_m / 1000) ** 2)
        for total, hourly in zip(totals, weights, strict=True):
            share = shrink_toward(smooth_circular(hourly), context.national_share)
            intensities.append([total * normalizer * 24 * h for h in share])
    return integrate(samples, intensities)
