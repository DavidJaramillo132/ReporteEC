"""Route geometry helpers: buffered chunks for the spatial query, walking along a route.

OSRM annotates every pair of consecutive route coordinates (a "segment")
with its length in meters and its average speed in m/s. A segment whose
speed is >= 60 km/h is a highway stretch (1,000 m buffer); anything slower
is urban (200 m buffer).

Consecutive segments of the same class are merged into chunks of about
1 km, so the database probes its GiST index once per chunk rather than once
per OSRM vertex (a 400 km route has ~7,000 vertices but ~420 chunks).
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass

HIGHWAY_BUFFER_M = 1000.0
URBAN_BUFFER_M = 200.0
HIGHWAY_MIN_SPEED_KMH = 60.0
CHUNK_MAX_M = 1000.0

LonLat = tuple[float, float]


def buffer_for_speed(speed_mps: float) -> float:
    """1,000 m on stretches averaging >= 60 km/h, else 200 m."""
    return HIGHWAY_BUFFER_M if speed_mps * 3.6 >= HIGHWAY_MIN_SPEED_KMH else URBAN_BUFFER_M


@dataclass(frozen=True, slots=True)
class RouteChunk:
    """A run of same-class segments: its vertices, where it starts along the route, its buffer."""

    coords: tuple[LonLat, ...]
    start_m: float
    length_m: float
    buffer_m: float

    def wkt(self) -> str:
        return "LINESTRING(" + ",".join(f"{lon} {lat}" for lon, lat in self.coords) + ")"


def _check_annotations(coords: Sequence[LonLat], *per_segment: Sequence[float]) -> None:
    for values in per_segment:
        if len(values) != len(coords) - 1:
            raise ValueError(
                f"expected {len(coords) - 1} segment annotations for {len(coords)} "
                f"coordinates, got {len(values)}"
            )


def build_chunks(
    coords: Sequence[LonLat],
    distances_m: Sequence[float],
    speeds_mps: Sequence[float],
    max_chunk_m: float = CHUNK_MAX_M,
) -> list[RouteChunk]:
    """Merge consecutive segments into chunks: cut where the buffer class changes
    or once a chunk reaches `max_chunk_m`. Zero-length chunks are dropped (they
    cannot be near anything the next chunk is not).
    """
    _check_annotations(coords, distances_m, speeds_mps)
    chunks: list[RouteChunk] = []
    position = 0.0
    start_index = 0
    chunk_start = 0.0
    chunk_length = 0.0
    chunk_buffer: float | None = None

    def close(end_index: int) -> None:
        if chunk_length > 0:
            chunks.append(
                RouteChunk(
                    coords=tuple(coords[start_index : end_index + 1]),
                    start_m=chunk_start,
                    length_m=chunk_length,
                    buffer_m=chunk_buffer if chunk_buffer is not None else URBAN_BUFFER_M,
                )
            )

    for index, (distance, speed) in enumerate(zip(distances_m, speeds_mps, strict=True)):
        buffer = buffer_for_speed(speed)
        if chunk_buffer is not None and buffer != chunk_buffer:
            close(index)
            start_index, chunk_start, chunk_length = index, position, 0.0
        chunk_buffer = buffer
        chunk_length += distance
        position += distance
        if chunk_length >= max_chunk_m:
            close(index + 1)
            start_index, chunk_start, chunk_length, chunk_buffer = index + 1, position, 0.0, None
    close(len(coords) - 1)
    return chunks


def point_at_distance(
    coords: Sequence[LonLat], distances_m: Sequence[float], target_m: float
) -> LonLat:
    """The point `target_m` meters along the route, linear within a segment, clamped to its ends."""
    _check_annotations(coords, distances_m)
    if target_m <= 0:
        return coords[0]
    travelled = 0.0
    for index, distance in enumerate(distances_m):
        if distance > 0 and travelled + distance >= target_m:
            fraction = (target_m - travelled) / distance
            (lon1, lat1), (lon2, lat2) = coords[index], coords[index + 1]
            return (lon1 + (lon2 - lon1) * fraction, lat1 + (lat2 - lat1) * fraction)
        travelled += distance
    return coords[-1]
