import math

import pytest

from app.modules.routing.exposure import Sample, integrate, kernel, samples_for
from app.modules.routing.exposure_reference import balanced_breakpoints, calibrate
from app.modules.routing.osrm import OsrmUnavailable, parse_route
from tests.modules.routing.fakes import straight_route_payload


def test_exposure_accumulates_time_without_distance_normalization():
    short = integrate([Sample(0, 0, 0, 2)], [[3.0] * 24])
    long = integrate([Sample(0, 0, 0, 20)], [[3.0] * 24])
    assert long == pytest.approx([v * 10 for v in short])


def test_subdivision_preserves_integral_and_crosses_midnight():
    hours = [1.0] * 24
    hours[0] = 4
    whole = integrate([Sample(0, 0, 59, 2)], [hours])
    split = integrate([Sample(0, 0, 59, 1), Sample(0, 0, 60, 1)], [hours, hours])
    assert whole == pytest.approx(split)
    assert whole[23] == 5


def test_kernel_is_continuous_and_decreases_with_distance():
    assert kernel(0) > kernel(50) > kernel(150) > kernel(199) > kernel(200)
    assert kernel(200) == kernel(201) == 0
    assert kernel(199.999) == pytest.approx(0, abs=1e-6)


def test_native_times_create_bounded_samples_including_stops():
    payload = straight_route_payload([(-80, -1), (-80, -0.999)], [1])
    route = parse_route(payload)
    samples = samples_for(route)
    assert all(s.duration_min <= 1 for s in samples)
    assert sum(s.duration_min for s in samples) == pytest.approx(route.duration_s / 60)
    payload["routes"][0]["legs"][0]["annotation"]["duration"][0] = math.nan
    with pytest.raises(OsrmUnavailable):
        parse_route(payload)


def test_balanced_reference_has_fixed_group_mass():
    groups = {
        "urban_short": [1],
        "urban_medium": [2] * 50,
        "urban_long": [3],
        "interurban": [10] * 100,
    }
    values = balanced_breakpoints(groups)
    assert values[33] == 2
    assert values[67] == 10
    with pytest.raises(ValueError):
        balanced_breakpoints({"interurban": [1]})


def test_calibration_requires_temporal_separation():
    rows = [
        dict(
            fold=i,
            training_end="2025-01-01",
            observed_at="2026-01-01",
            training_neighbors=[[25, 1]],
            training_weight_total=10,
        )
        for i in range(2)
    ]
    assert calibrate(rows)["bandwidth_m"] in (100, 200, 400, 800)
    rows[0]["training_end"] = "2026-02-01"
    with pytest.raises(ValueError):
        calibrate(rows)


def test_sql_aggregates_feed_spatial_intensity_and_unknown_hour_pattern():
    from datetime import UTC, datetime
    from types import SimpleNamespace

    from app.modules.routing.exposure import compute_exposure

    route = parse_route(straight_route_payload([(-80, -1), (-80, -0.999)], [1]))

    class Session:
        def execute(self, sql, params):
            assert params["radius"] == 200
            return SimpleNamespace(
                all=lambda: [(i + 1, -1, 1.0) for i in range(len(params["lons"]))]
            )

    context = SimpleNamespace(
        data_cut=datetime(2026, 1, 1, tzinfo=UTC), national_share=[1 / 24] * 24
    )
    values = compute_exposure(Session(), route, context)
    assert values == pytest.approx([kernel(0) * route.duration_s / 60] * 24)
    context.data_cut = None
    assert compute_exposure(Session(), route, context) == (0.0,) * 24


def test_national_manifest_is_deterministic_and_contains_all_strata():
    from app.modules.routing.exposure_reference import generate_manifest
    from app.modules.routing.reference import CantonPoint
    from tests.modules.routing.fakes import URBAN_SPEED_MPS

    class Client:
        def route(self, origin, destination):
            return parse_route(straight_route_payload([origin, destination], [URBAN_SPEED_MPS]))

    cantons = [
        CantonPoint("0901", "09", -79.9, -2.2),
        CantonPoint("1301", "13", -80.7, -1),
        CantonPoint("2001", "20", -90.3, -0.7),
    ]
    a = generate_manifest(cantons, Client())
    b = generate_manifest(list(reversed(cantons)), Client())
    assert a == b
    assert set(p["stratum"] for p in a["pairs"]) == {
        "urban_short",
        "urban_medium",
        "urban_long",
        "interurban",
    }
    assert all("2001" not in p["canton_codes"] for p in a["pairs"])
    for pair in a["pairs"]:
        if pair["stratum"] == "urban_short":
            assert 0.5 <= pair["sampled_distance_km"] <= 2


def test_manifest_fails_without_all_strata_or_when_osrm_stays_unavailable():
    from app.modules.routing.exposure_reference import generate_manifest
    from app.modules.routing.reference import CantonPoint

    with pytest.raises(ValueError, match="complete national sample"):
        generate_manifest([], None)

    class Client:
        def route(self, origin, destination):
            raise OsrmUnavailable("offline")

    with pytest.raises(ValueError, match="OSRM unavailable"):
        generate_manifest([CantonPoint("0901", "09", -79.9, -2.2)], Client())
