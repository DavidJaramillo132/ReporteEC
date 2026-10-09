"""Cutting an OSRM route into buffered 1 km pieces, walking along it, simplifying it."""

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


def test_wkt_lists_the_piece_vertices():
    (piece,) = build_pieces([(-79.5, -2.0), (-79.49, -2.0)], [500.0], [25.0])

    assert piece.wkt() == "LINESTRING(-79.5 -2.0,-79.49 -2.0)"


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
