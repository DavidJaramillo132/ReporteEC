"""Offline, explicit calibration and balanced reference builder.

Run with --help. Calibration inputs must be generated from temporally held-out
road observations: each observation contains training-only incident distances
and recency weights at the held-out incident's road location. No future incident
may appear among those neighbors. This tool does not fabricate observations.
"""

from __future__ import annotations

import argparse
import json
import math
import random
from pathlib import Path

from sqlalchemy.orm import Session

from app.modules.routing.exposure import (
    BANDWIDTH_M,
    MODEL_VERSION,
    REFERENCE_METRIC,
    compute_exposure,
    kernel,
)
from app.modules.routing.models import RouteRiskReference
from app.modules.routing.osrm import OsrmClient, OsrmUnavailable, RouteNotFound
from app.modules.routing.reference import (
    SAMPLE_SEED,
    CantonPoint,
    build_sample,
    load_canton_points,
    serialize_data_version,
)
from app.modules.routing.service import InvalidRoute, load_national_context, validate_route

RADII = (100, 200, 400, 800)
GROUPS = {"urban_short": 1 / 6, "urban_medium": 1 / 6, "urban_long": 1 / 6, "interurban": 1 / 2}


def calibrate(observations: list[dict]) -> dict:
    """Held-out spatial log likelihood; separate temporal folds are mandatory.

    Uniform background floor is common to all candidates and only prevents
    log(0); this ranks spatial forecasting, not victimization probabilities.
    """
    if len({row["fold"] for row in observations}) < 2:
        raise ValueError("At least two independent temporal folds are required")
    scores = {}
    for radius in RADII:
        values = []
        for row in observations:
            if row["training_end"] >= row["observed_at"]:
                raise ValueError("Temporal leakage: training must end before observation")
            neighbors = row["training_neighbors"]
            if any(
                not math.isfinite(d) or not math.isfinite(w) or d < 0 or w < 0 for d, w in neighbors
            ):
                raise ValueError("Distances and weights must be finite and nonnegative")
            mass = row["training_weight_total"]
            if not math.isfinite(mass) or mass <= 0:
                raise ValueError("A positive total training weight is required")
            intensity = sum(kernel(d, radius) * w for d, w in neighbors) / mass
            values.append(math.log(max(1e-12, intensity)))
        scores[radius] = sum(values) / len(values)
    best = max(RADII, key=lambda r: (scores[r], -r))
    return {
        "bandwidth_m": best,
        "scores": scores,
        "folds": sorted({r["fold"] for r in observations}),
        "method": "held_out_spatial_log_likelihood_v1",
    }


def balanced_breakpoints(groups: dict[str, list[float]]) -> list[float]:
    if set(groups) != set(GROUPS) or any(not v for v in groups.values()):
        raise ValueError("All three urban strata and the interurban stratum must be nonempty")
    weighted = sorted(
        (value, GROUPS[group] / len(values)) for group, values in groups.items() for value in values
    )
    if any(not math.isfinite(value) or value < 0 for value, _ in weighted):
        raise ValueError("Invalid exposure")
    result = []
    for percentile in range(101):
        cumulative = 0.0
        for value, weight in weighted:
            cumulative += weight
            if cumulative + 1e-12 >= percentile / 100:
                result.append(value)
                break
    return result


def build_reference(
    session: Session, client: OsrmClient, manifest: dict, calibration: dict
) -> RouteRiskReference:
    """Manifest contains fixed, road-snapped origin/destination pairs and strata.

    Fail closed on any missing stratum or routing error rather than silently
    changing the chosen national sampling composition. Calls are sequential.
    """
    if (
        calibration["bandwidth_m"] != BANDWIDTH_M
        or calibration.get("method") != "held_out_spatial_log_likelihood_v1"
    ):
        raise ValueError("Deploy the calibrated bandwidth before building its reference")
    context = load_national_context(session)
    if context.data_cut is None:
        raise ValueError("No eligible incident data")
    groups: dict[str, list[float]] = {k: [] for k in GROUPS}
    for pair in manifest["pairs"]:
        route = client.route(tuple(pair["origin"]), tuple(pair["destination"]))
        validate_route(route)
        group = pair["stratum"]
        distance = route.distance_m / 1000
        bounds = {"urban_short": (0.5, 2), "urban_medium": (2, 5), "urban_long": (5, 15)}
        if group in bounds and not bounds[group][0] <= distance <= bounds[group][1]:
            raise ValueError(f"Route is outside declared stratum {group}")
        groups[group].extend(compute_exposure(session, route, context))
    row = RouteRiskReference(
        metric=REFERENCE_METRIC,
        breakpoints=balanced_breakpoints(groups),
        routes_ok=len(manifest["pairs"]),
        routes_skipped=0,
        values_count=sum(map(len, groups.values())),
        data_cut=context.data_cut,
        data_version=serialize_data_version(context),
    )
    session.add(row)
    session.commit()
    return row


URBAN_BOUNDS = {"urban_short": (0.5, 2.0), "urban_medium": (2.0, 5.0), "urban_long": (5.0, 15.0)}


def urban_candidates(canton: CantonPoint, *, seed: int = SAMPLE_SEED):
    """Fixed candidate bearings/distances around a mainland cabecera.

    Candidate points are only proposals: the generator retains native OSRM
    road snaps, observed route length and a predominantly urban-speed profile.
    Stable per-canton RNG makes input order irrelevant.
    """
    rng = random.Random(f"{seed}:{canton.code}")
    for group, (minimum, maximum) in URBAN_BOUNDS.items():
        for _ in range(8):
            bearing = rng.random() * 2 * math.pi
            distance = rng.uniform(minimum, maximum * 0.7)
            lat = canton.lat + math.degrees(distance / 6371.0088 * math.cos(bearing))
            lon = canton.lon + math.degrees(
                distance / 6371.0088 * math.sin(bearing) / math.cos(math.radians(canton.lat))
            )
            yield group, canton.point, (lon, lat)


def generate_manifest(cantons, client: OsrmClient, *, seed: int = SAMPLE_SEED) -> dict:
    """Sequential deterministic national network sampling, without incident data.

    One retained pair per urban distance stratum/canton; up to eight bounded
    proposals each. Interurban pairs reuse the existing nearest/long sample.
    Missing local strata are recorded, never backfilled from another city.
    """
    mainland = sorted((c for c in cantons if c.province_code != "20"), key=lambda c: c.code)
    pairs = []
    skipped = []
    unavailable = 0

    def routed(origin, destination):
        nonlocal unavailable
        try:
            route = client.route(origin, destination)
            validate_route(route)
            unavailable = 0
            return route
        except (RouteNotFound, InvalidRoute):
            unavailable = 0
            return None
        except OsrmUnavailable:
            unavailable += 1
            if unavailable >= 5:
                raise ValueError("OSRM unavailable: manifest generation aborted") from None
            return None

    def record(route, group, codes):
        pairs.append(
            dict(
                origin=list(route.waypoints[0].location),
                destination=list(route.waypoints[1].location),
                stratum=group,
                canton_codes=codes,
                sampled_distance_km=route.distance_m / 1000,
            )
        )

    for canton in mainland:
        retained = set()
        for group, origin, destination in urban_candidates(canton, seed=seed):
            if group in retained:
                continue
            route = routed(origin, destination)
            if route is None or max(w.distance_m for w in route.waypoints) > 100:
                continue
            distance = route.distance_m / 1000
            low_speed_distance = sum(
                d
                for d, v in zip(route.segment_distances_m, route.segment_speeds_mps, strict=True)
                if v < 60 / 3.6
            )
            if (
                URBAN_BOUNDS[group][0] <= distance <= URBAN_BOUNDS[group][1]
                and low_speed_distance >= route.distance_m * 0.8
            ):
                record(route, group, [canton.code])
                retained.add(group)
        skipped.extend(
            dict(canton=canton.code, stratum=g) for g in URBAN_BOUNDS if g not in retained
        )
    for origin, destination in build_sample(mainland, seed=seed):
        route = routed(origin.point, destination.point)
        if route is None:
            skipped.append(dict(cantons=[origin.code, destination.code], stratum="interurban"))
        else:
            record(route, "interurban", [origin.code, destination.code])
    if set(p["stratum"] for p in pairs) != set(GROUPS):
        raise ValueError("No complete national sample: one or more strata have no routable pairs")
    return dict(
        sampling_version="national_road_sample_v1",
        seed=seed,
        urban_rule="cabecera offsets; <=100m snap; >=80% distance below 60km/h",
        canton_points=[dict(code=c.code, lon=c.lon, lat=c.lat) for c in mainland],
        pairs=pairs,
        skipped=skipped,
    )


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)
    cal = sub.add_parser("calibrate")
    cal.add_argument("observations", type=Path)
    cal.add_argument("output", type=Path)
    ref = sub.add_parser("build")
    ref.add_argument("manifest", type=Path)
    ref.add_argument("calibration", type=Path)
    sample = sub.add_parser("sample")
    sample.add_argument("output", type=Path)
    args = parser.parse_args()
    if args.command == "calibrate":
        result = calibrate(json.loads(args.observations.read_text()))
        args.output.write_text(json.dumps(result, indent=2) + "\n")
        print(f"Selected bandwidth: {result['bandwidth_m']} m")
    else:
        from app.core.config import osrm_url
        from app.database.session import get_session

        sessions = get_session()
        session = next(sessions)
        try:
            if args.command == "sample":
                manifest = generate_manifest(load_canton_points(session), OsrmClient(osrm_url()))
                args.output.write_text(json.dumps(manifest, indent=2) + "\n")
                print(
                    f"Manifest: {len(manifest['pairs'])} routes, "
                    f"{len(manifest['skipped'])} omissions"
                )
                return
            row = build_reference(
                session,
                OsrmClient(osrm_url()),
                json.loads(args.manifest.read_text()),
                json.loads(args.calibration.read_text()),
            )
            print(f"Reference {row.id}: {MODEL_VERSION}")
        finally:
            sessions.close()


if __name__ == "__main__":
    main()
