"""Splitting an OSRM route into buffered chunks, and walking along it."""

import pytest

from app.modules.routing.geometry import (
    HIGHWAY_BUFFER_M,
    URBAN_BUFFER_M,
    buffer_for_speed,
    build_chunks,
    point_at_distance,
)


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


def test_chunks_split_where_the_road_class_changes():
    coords = [(0.0, 0.0), (0.001, 0.0), (0.002, 0.0), (0.003, 0.0)]
    distances = [100.0, 100.0, 100.0]
    speeds = [25.0, 25.0, 5.0]  # highway, highway, urban

    chunks = build_chunks(coords, distances, speeds)

    assert [(c.start_m, c.length_m, c.buffer_m) for c in chunks] == [
        (0.0, 200.0, HIGHWAY_BUFFER_M),
        (200.0, 100.0, URBAN_BUFFER_M),
    ]
    assert chunks[0].coords == ((0.0, 0.0), (0.001, 0.0), (0.002, 0.0))
    # Consecutive chunks share their boundary vertex: no gap in the corridor.
    assert chunks[1].coords == ((0.002, 0.0), (0.003, 0.0))


def test_chunks_are_cut_once_they_reach_the_maximum_length():
    coords = [(i * 0.004, 0.0) for i in range(6)]
    distances = [400.0] * 5
    speeds = [25.0] * 5

    chunks = build_chunks(coords, distances, speeds, max_chunk_m=1000.0)

    assert [(c.start_m, c.length_m) for c in chunks] == [(0.0, 1200.0), (1200.0, 800.0)]


def test_zero_length_route_has_no_chunks():
    assert build_chunks([(1.0, 1.0), (1.0, 1.0)], [0.0], [0.0]) == []


def test_chunks_reject_mismatched_annotations():
    with pytest.raises(ValueError):
        build_chunks([(0.0, 0.0), (1.0, 0.0)], [1.0, 2.0], [1.0, 2.0])


def test_point_at_distance_interpolates_along_the_route():
    coords = [(0.0, 0.0), (1.0, 0.0), (1.0, 2.0)]
    distances = [100.0, 200.0]

    assert point_at_distance(coords, distances, 50.0) == pytest.approx((0.5, 0.0))
    assert point_at_distance(coords, distances, 200.0) == pytest.approx((1.0, 1.0))
    assert point_at_distance(coords, distances, 10_000.0) == pytest.approx((1.0, 2.0))
    assert point_at_distance(coords, distances, -5.0) == pytest.approx((0.0, 0.0))
