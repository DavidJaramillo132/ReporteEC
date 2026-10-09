"""Cutting an OSRM route into buffered 1 km pieces, walking along it, simplifying it."""

import random
import struct

import pytest

from app.modules.routing.geometry import (
    HIGHWAY_BUFFER_M,
    URBAN_BUFFER_M,
    buffer_for_speed,
    build_pieces,
    point_at_distance,
    simplify_line,
)

# Along the equator, 0.001 degrees of longitude is ~111.2 m.
_M_PER_MILLIDEGREE = 111.19


@pytest.mark.parametrize(
    ("speed_kmh", "buffer_m"),
    [
        (60.0, HIGHWAY_BUFFER_M),
        (90.0, HIGHWAY_BUFFER_M),
        (59.9, URBAN_BUFFER_M),
        (0, URBAN_BUFFER_M),
    ],
)
def test_buffer_is_one_km_on_highways_and_200_m_elsewhere(speed_kmh: float, buffer_m: float):
    assert buffer_for_speed(speed_kmh / 3.6) == buffer_m


def test_buffers_are_the_documented_widths():
    assert (HIGHWAY_BUFFER_M, URBAN_BUFFER_M) == (1000.0, 200.0)


def test_pieces_are_consecutive_kilometres_split_inside_segments():
    coords = [(0.0, 0.0), (0.004, 0.0), (0.008, 0.0), (0.015, 0.0)]
    distances = [400.0, 400.0, 700.0]  # 1,500 m: km 0-1 and km 1-1.5
    speeds = [25.0, 25.0, 25.0]

    pieces = build_pieces(coords, distances, speeds)

    assert [(p.index, p.start_m, p.length_m) for p in pieces] == [
        (0, 0.0, pytest.approx(1000.0)),
        (1, pytest.approx(1000.0), pytest.approx(500.0)),
    ]
    # The cut falls 200 m into the third segment (700 m long): 2/7 of the way.
    cut = (0.008 + 0.007 * 2 / 7, 0.0)
    assert pieces[0].coords[0] == (0.0, 0.0)
    assert pieces[0].coords[-1] == pytest.approx(cut)
    assert pieces[1].coords[0] == pytest.approx(cut)
    assert pieces[1].coords[-1] == (0.015, 0.0)


def test_a_long_segment_spans_several_pieces():
    pieces = build_pieces([(0.0, 0.0), (0.025, 0.0)], [2500.0], [25.0])

    assert [round(p.length_m, 6) for p in pieces] == [1000.0, 1000.0, 500.0]
    (start, end) = pieces[1].coords
    assert start == pytest.approx((0.01, 0.0))
    assert end == pytest.approx((0.02, 0.0))


def test_a_short_slow_stretch_inside_a_fast_piece_keeps_the_highway_buffer():
    # 900 m at 90 km/h and a 100 m toll booth at 18 km/h: distance-weighted
    # average (900*25 + 100*5) / 1000 = 23 m/s = 82.8 km/h.
    coords = [(0.0, 0.0), (0.009, 0.0), (0.010, 0.0)]
    pieces = build_pieces(coords, [900.0, 100.0], [25.0, 5.0])

    (piece,) = pieces
    assert piece.average_speed_mps == pytest.approx(23.0)
    assert piece.buffer_m == HIGHWAY_BUFFER_M


def test_a_mostly_slow_piece_gets_the_urban_buffer():
    # (600*8 + 400*20) / 1000 = 12.8 m/s = 46 km/h.
    coords = [(0.0, 0.0), (0.006, 0.0), (0.010, 0.0)]
    (piece,) = build_pieces(coords, [600.0, 400.0], [8.0, 20.0])

    assert piece.average_speed_mps == pytest.approx(12.8)
    assert piece.buffer_m == URBAN_BUFFER_M


def test_each_piece_has_its_own_class():
    coords = [(0.0, 0.0), (0.01, 0.0), (0.02, 0.0)]
    pieces = build_pieces(coords, [1000.0, 1000.0], [8.0, 25.0])

    assert [p.buffer_m for p in pieces] == [URBAN_BUFFER_M, HIGHWAY_BUFFER_M]


def test_zero_length_route_has_no_pieces():
    assert build_pieces([(1.0, 1.0), (1.0, 1.0)], [0.0], [0.0]) == []


def test_pieces_reject_mismatched_annotations():
    with pytest.raises(ValueError):
        build_pieces([(0.0, 0.0), (1.0, 0.0)], [1.0, 2.0], [1.0, 2.0])


def test_wkb_is_the_little_endian_linestring_of_the_piece_vertices():
    (piece,) = build_pieces([(-79.5, -2.0), (-79.49, -2.0)], [500.0], [25.0])

    # byte order 1 (little endian), type 2 (LineString), 2 points, then x y pairs.
    assert piece.wkb() == struct.pack("<BII4d", 1, 2, 2, -79.5, -2.0, -79.49, -2.0)
    assert struct.unpack("<4d", piece.wkb()[9:]) == (-79.5, -2.0, -79.49, -2.0)


def test_point_at_distance_interpolates_along_the_route():
    coords = [(0.0, 0.0), (1.0, 0.0), (1.0, 2.0)]
    distances = [100.0, 200.0]

    assert point_at_distance(coords, distances, 50.0) == pytest.approx((0.5, 0.0))
    assert point_at_distance(coords, distances, 200.0) == pytest.approx((1.0, 1.0))
    assert point_at_distance(coords, distances, 10_000.0) == pytest.approx((1.0, 2.0))
    assert point_at_distance(coords, distances, -5.0) == pytest.approx((0.0, 0.0))


def test_simplify_drops_collinear_vertices_and_keeps_both_ends():
    line = [(i * 0.001, 0.0) for i in range(11)]

    assert simplify_line(line) == [(0.0, 0.0), (0.01, 0.0)]


def test_simplify_keeps_a_bend_beyond_20_m_and_drops_one_within():
    bend_30_m = 30 / _M_PER_MILLIDEGREE * 0.001
    bend_10_m = 10 / _M_PER_MILLIDEGREE * 0.001

    kept = [(0.0, 0.0), (0.005, bend_30_m), (0.010, 0.0)]
    assert simplify_line(kept, tolerance_m=20.0) == kept
    dropped = [(0.0, 0.0), (0.005, bend_10_m), (0.010, 0.0)]
    assert simplify_line(dropped, tolerance_m=20.0) == [(0.0, 0.0), (0.010, 0.0)]


def test_simplify_keeps_a_route_that_comes_back_to_its_start():
    # A loop: the first and last points coincide, the far point must survive.
    line = [(0.0, 0.0), (0.005, 0.0), (0.005, 0.005), (0.0, 0.0)]

    assert simplify_line(line) == [(0.0, 0.0), (0.005, 0.0), (0.005, 0.005), (0.0, 0.0)]


def test_simplify_leaves_two_points_alone():
    assert simplify_line([(0.0, 0.0), (0.0, 0.0)]) == [(0.0, 0.0), (0.0, 0.0)]


def _reference_simplify(coords, tolerance_m=20.0):
    """The first `simplify_line`, kept verbatim as the oracle for the faster one."""
    import math

    count = len(coords)
    if count <= 2:
        return list(coords)
    meters_per_degree = 6_371_008.8 * math.pi / 180
    mean_lat = math.radians(sum(lat for _, lat in coords) / count)
    xs = [lon * meters_per_degree * math.cos(mean_lat) for lon, _ in coords]
    ys = [lat * meters_per_degree for _, lat in coords]
    keep = bytearray(count)
    keep[0] = keep[-1] = 1
    tolerance_sq = tolerance_m * tolerance_m
    stack = [(0, count - 1)]
    while stack:
        first, last = stack.pop()
        if last - first < 2:
            continue
        ax, ay = xs[first], ys[first]
        dx, dy = xs[last] - ax, ys[last] - ay
        length_sq = dx * dx + dy * dy
        farthest, farthest_sq = -1, tolerance_sq
        for index in range(first + 1, last):
            px, py = xs[index] - ax, ys[index] - ay
            if length_sq > 0:
                t = min(1.0, max(0.0, (px * dx + py * dy) / length_sq))
                px, py = px - t * dx, py - t * dy
            distance_sq = px * px + py * py
            if distance_sq > farthest_sq:
                farthest, farthest_sq = index, distance_sq
        if farthest >= 0:
            keep[farthest] = 1
            stack.append((first, farthest))
            stack.append((farthest, last))
    return [coords[index] for index in range(count) if keep[index]]


@pytest.mark.parametrize("seed", range(6))
def test_simplify_matches_the_first_implementation_exactly(seed: int):
    rng = random.Random(seed)
    # A wandering line with long straight runs, loops back to its start and
    # repeated points: every branch of the algorithm.
    lon, lat = -79.9, -2.2
    coords = []
    for _ in range(3000):
        lon += rng.choice((0.0, 0.0001, -0.0001, rng.uniform(-0.002, 0.002)))
        lat += rng.choice((0.0, 0.0001, rng.uniform(-0.002, 0.002)))
        coords.append((lon, lat))
    coords.append(coords[0])
    tolerance = rng.choice((5.0, 20.0, 80.0))

    assert simplify_line(coords, tolerance) == _reference_simplify(coords, tolerance)
