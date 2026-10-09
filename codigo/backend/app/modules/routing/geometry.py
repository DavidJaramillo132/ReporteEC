"""Route geometry helpers: 1 km buffered pieces, walking along a route, display simplification.

OSRM annotates every pair of consecutive route coordinates (a "segment")
with its length in meters and its average speed in m/s.

The route is cut into consecutive 1 km pieces (km 0-1, 1-2, ...; the last
one shorter), splitting segments where a kilometre ends. The same pieces
serve two purposes:

- the buffer: a piece whose distance-weighted average speed is >= 60 km/h
  is a highway piece (1,000 m buffer), otherwise urban (200 m). Averaging
  over the piece keeps a toll booth or a sharp curve inside a highway from
  flipping that stretch to the urban buffer;
- the blackspots, which are reported per piece.

The database probes its GiST index once per piece (a 400 km route has
~7,000 OSRM vertices but ~410 pieces).
"""

from __future__ import annotations

import math
from collections.abc import Sequence
from dataclasses import dataclass

HIGHWAY_BUFFER_M = 1000.0
URBAN_BUFFER_M = 200.0
HIGHWAY_MIN_SPEED_KMH = 60.0
PIECE_LENGTH_M = 1000.0
DISPLAY_TOLERANCE_M = 20.0

# Below this, a length is float noise from summing segment distances.
_EPSILON_M = 1e-6
_EARTH_RADIUS_M = 6_371_008.8

LonLat = tuple[float, float]


def buffer_for_speed(speed_mps: float) -> float:
    """1,000 m on pieces averaging >= 60 km/h, else 200 m."""
    return HIGHWAY_BUFFER_M if speed_mps * 3.6 >= HIGHWAY_MIN_SPEED_KMH else URBAN_BUFFER_M


@dataclass(frozen=True, slots=True)
class RoutePiece:
    """One kilometre of the route (the last may be shorter) and its buffer."""

    index: int
    coords: tuple[LonLat, ...]
    start_m: float
    length_m: float
    average_speed_mps: float
    """Distance-weighted average of the OSRM segment speeds inside the piece."""

    @property
    def buffer_m(self) -> float:
        return buffer_for_speed(self.average_speed_mps)

    def wkt(self) -> str:
        return "LINESTRING(" + ",".join(f"{lon} {lat}" for lon, lat in self.coords) + ")"


def _check_annotations(coords: Sequence[LonLat], *per_segment: Sequence[float]) -> None:
    for values in per_segment:
        if len(values) != len(coords) - 1:
            raise ValueError(
                f"expected {len(coords) - 1} segment annotations for {len(coords)} "
                f"coordinates, got {len(values)}"
            )


def _interpolate(a: LonLat, b: LonLat, fraction: float) -> LonLat:
    return (a[0] + (b[0] - a[0]) * fraction, a[1] + (b[1] - a[1]) * fraction)


def build_pieces(
    coords: Sequence[LonLat],
    distances_m: Sequence[float],
    speeds_mps: Sequence[float],
    piece_length_m: float = PIECE_LENGTH_M,
) -> list[RoutePiece]:
    """Cut the route into consecutive `piece_length_m` pieces.

    A segment that crosses a kilometre mark is split at a point interpolated
    linearly in lon/lat (segments are short, so this is exact to well under a
    meter). Pieces of zero length (a route whose points coincide) are dropped.
    """
    _check_annotations(coords, distances_m, speeds_mps)
    pieces: list[RoutePiece] = []
    piece_coords: list[LonLat] = [coords[0]]
    piece_length = 0.0
    speed_times_length = 0.0
    piece_start = 0.0

    def close() -> None:
        nonlocal piece_coords, piece_length, speed_times_length, piece_start
        if piece_length > _EPSILON_M:
            pieces.append(
                RoutePiece(
                    index=len(pieces),
                    coords=tuple(piece_coords),
                    start_m=piece_start,
                    length_m=piece_length,
                    average_speed_mps=speed_times_length / piece_length,
                )
            )
        piece_start += piece_length
        piece_coords = [piece_coords[-1]]
        piece_length = 0.0
        speed_times_length = 0.0

    for index, (distance, speed) in enumerate(zip(distances_m, speeds_mps, strict=True)):
        start, end = coords[index], coords[index + 1]
        used = 0.0  # meters of this segment already assigned to a piece
        while distance - used > piece_length_m - piece_length + _EPSILON_M:
            take = piece_length_m - piece_length
            used += take
            piece_coords.append(_interpolate(start, end, used / distance))
            piece_length += take
            speed_times_length += take * speed
            close()
        rest = distance - used
        piece_coords.append(end)
        piece_length += rest
        speed_times_length += rest * speed
        if piece_length >= piece_length_m - _EPSILON_M:
            close()
    close()
    return pieces


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
            return _interpolate(coords[index], coords[index + 1], (target_m - travelled) / distance)
        travelled += distance
    return coords[-1]


def simplify_line(
    coords: Sequence[LonLat], tolerance_m: float = DISPLAY_TOLERANCE_M
) -> list[LonLat]:
    """Douglas-Peucker in meters, for drawing the route; the first and last points always stay.

    Coordinates are projected to a local equirectangular plane around the
    line's mean latitude: across Ecuador's latitudes (|lat| <= 5.1) the scale
    error is under 0.4%, i.e. under 0.1 m on a 20 m tolerance -- and, unlike a
    single UTM zone, it is as accurate in Galápagos as on the mainland.
    Distances are to the segment (not the infinite line), so a route that
    returns to its start keeps its far point.
    """
    count = len(coords)
    if count <= 2:
        return list(coords)
    meters_per_degree = _EARTH_RADIUS_M * math.pi / 180
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
