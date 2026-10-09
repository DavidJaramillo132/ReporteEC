"""Generate canton_seats.csv: each canton's cabecera cantonal, from OpenStreetMap.

Offline, run once by hand (never in production). It reads the Geofabrik
Ecuador extract already downloaded for OSRM and the canton polygons from a
database where `admin_units` and `cantons` are loaded (any local database
after the MDI files and `python -m app.ingestion cantons`), and picks for every canton one OSM
`place=city|town|village` node:

1. alias -- the canton's code is in `SEAT_ALIASES` (cantons whose cabecera
   has another name, e.g. Pastaza -> Puyo): the place with that name, or the
   exact OSM object the entry names when OSM has no usable place node for
   that town (its municipal building, `amenity=townhall`). The explicit
   table is checked first, so it can also correct a wrong name match;
2. name -- a place whose name equals the canton name (accent- and
   case-insensitive; a parenthetical alternate name counts too);
3. rank -- the highest-ranked place inside the polygon (city > town >
   village, then the `population` tag);
4. fallback -- no place: the row keeps no point and the backend uses
   ST_PointOnSurface of the polygon.

Alias and name matches accept places up to `NEAR_POLYGON_M` outside the
polygon, because the shipped boundaries are simplified and coastal or river
cities (Guayaquil, Manta) sit on their edge. Rank only looks inside.

With --osrm, every seat is checked against a local OSRM, within the API's
own 2 km limit: `/nearest` must snap it to a road, and, on the mainland, a
`/route` to Quito must start within 2 km too. The second check catches a
seat whose nearest road is a small piece of network with no connection to
the rest (an island, a river ferry): OSRM then starts real routes elsewhere.
Cantons in `NO_ROAD_ACCESS` are reported but do not fail the run.

Usage, from the repository root:

    uv run --no-project --python 3.12 \\
        --with osmium==4.3.1 --with 'psycopg[binary]==3.3.6' \\
        codigo/scripts/generar_cabeceras.py \\
        --pbf codigo/data/osrm/ecuador-latest.osm.pbf \\
        --database-url postgresql://postgres:test@localhost:55432/postgres \\
        --osrm http://localhost:5000 \\
        --out codigo/backend/app/ingestion/data/canton_seats.csv

Data: © colaboradores de OpenStreetMap, ODbL.
"""

from __future__ import annotations

import argparse
import csv
import json
import re
import sys
import unicodedata
import urllib.error
import urllib.request
from collections import Counter
from dataclasses import dataclass
from pathlib import Path

import osmium
import psycopg

PLACE_RANK = {"city": 3, "town": 2, "village": 1}
NAME_TAGS = ("name", "official_name", "alt_name", "short_name", "old_name", "name:es")
NEAR_POLYGON_M = 3000.0
MAX_SNAP_M = 2000.0
ATTRIBUTION = (
    "# © colaboradores de OpenStreetMap, ODbL (https://www.openstreetmap.org/copyright). "
    "Generado con codigo/scripts/generar_cabeceras.py"
)


@dataclass(frozen=True, slots=True)
class Alias:
    """The cabecera of one canton: its name, and the OSM object when it is not a place node."""

    seat_name: str
    osm: str | None = None
    """`node/<id>` or `way/<id>`; None to match `seat_name` among the place nodes."""


# DPA canton code -> its cabecera, for cantons whose cabecera is not named
# like the canton, or where a same-named village is not the cabecera. Codes,
# not names: some canton names repeat across provinces (Bolívar, Olmedo).
# Cabecera names per INEC's political-administrative division (DPA), each
# checked by hand against OSM on 2026-10-09 (the 2026-10 Geofabrik extract).
SEAT_ALIASES: dict[str, Alias] = {
    "0505": Alias("San Miguel de Salcedo", "node/431622378"),  # Salcedo: municipal palace
    "0603": Alias("Villa La Unión"),  # Colta (OSM: Cajabamba); «Colta» is another village
    # Eloy Alfaro: the cabecera, Limones (OSM: Valdez), is on an island with no
    # road; La Tola, on the mainland across the water, is where the road ends.
    "0802": Alias("La Tola"),
    "0807": Alias("Río Verde"),  # Rioverde
    "1002": Alias("Atuntaqui"),  # Antonio Ante
    "1006": Alias("Urcuquí"),  # San Miguel de Urcuquí
    "1106": Alias("Amaluza"),  # Espíndola; «Espíndola» is another village
    "1316": Alias("Sucre"),  # 24 de Mayo
    "1401": Alias("Macas"),  # Morona
    "1412": Alias("Santiago"),  # Tiwintza
    "1601": Alias("Puyo"),  # Pastaza
    "1907": Alias("Zumbi"),  # Centinela del Cóndor
    "2102": Alias("Lumbaquí"),  # Gonzalo Pizarro; «Gonzalo Pizarro» is a parish
    "2104": Alias("Shushufindi", "node/249599931"),  # OSM names it «PRQUE CENTRAL SHUSHUFINDI»
    "2105": Alias("La Bonita", "node/13137100255"),  # Sucumbíos: municipal building
    "2107": Alias("Tarapoa"),  # Cuyabeno; «Cuyabeno» is a parish
    "2201": Alias("Puerto Francisco de Orellana"),  # Francisco de Orellana (El Coca)
    "2202": Alias("Tiputini"),  # Aguarico; see NO_ROAD_ACCESS
    "2403": Alias("Salinas", "way/360927309"),  # Salinas: municipal building
}


# Cantons whose cabecera no road reaches (checked 2026-10-09): routes to or
# from them get the API's «más de 2 km de una vía» answer, which is true.
# Aguarico: Tiputini is on the Napo river, inside Yasuní; no town in the
# canton has a road to the rest of the network except an oil-field road.
NO_ROAD_ACCESS = {"2202"}
QUITO = (-78.5125, -0.2200)
GALAPAGOS_PROVINCE_CODE = "20"

_WHITESPACE_RE = re.compile(r"\s+")
_PAREN_RE = re.compile(r"\(([^)]*)\)")


def normalize(name: str) -> str:
    decomposed = unicodedata.normalize("NFKD", name)
    plain = "".join(char for char in decomposed if not unicodedata.combining(char))
    return _WHITESPACE_RE.sub(" ", plain.replace(".", " ")).strip().upper()


def name_keys(name: str) -> set[str]:
    """A canton name and, if any, its parenthetical alternate: «A (B)» -> {A, B}."""
    keys = {normalize(_PAREN_RE.sub("", name))}
    keys.update(normalize(inner) for inner in _PAREN_RE.findall(name))
    return {key for key in keys if key}


@dataclass(frozen=True, slots=True)
class OsmPlace:
    osm_id: int
    name: str
    keys: frozenset[str]
    rank: int
    population: int
    lon: float
    lat: float


def read_places(pbf: Path) -> list[OsmPlace]:
    places = []
    processor = osmium.FileProcessor(str(pbf), osmium.osm.NODE).with_filter(
        osmium.filter.KeyFilter("place")
    )
    for node in processor:
        rank = PLACE_RANK.get(node.tags.get("place", ""))
        name = node.tags.get("name")
        if rank is None or not name or not node.location.valid():
            continue
        keys = {normalize(node.tags[tag]) for tag in NAME_TAGS if tag in node.tags}
        try:
            population = int(re.sub(r"[^\d]", "", node.tags.get("population", "")) or 0)
        except ValueError:
            population = 0
        places.append(
            OsmPlace(
                osm_id=node.id,
                name=name,
                keys=frozenset(keys),
                rank=rank,
                population=population,
                lon=node.location.lon,
                lat=node.location.lat,
            )
        )
    return places


def read_objects(pbf: Path, refs: set[str]) -> dict[str, tuple[float, float]]:
    """(lon, lat) of each `node/<id>` or `way/<id>` in `refs` (a way: mean of its nodes)."""
    node_ids = {int(ref.split("/")[1]) for ref in refs if ref.startswith("node/")}
    way_ids = {int(ref.split("/")[1]) for ref in refs if ref.startswith("way/")}
    found: dict[str, tuple[float, float]] = {}
    processor = osmium.FileProcessor(str(pbf), osmium.osm.NODE | osmium.osm.WAY)
    if way_ids:
        processor = processor.with_locations()
    for obj in processor:
        if isinstance(obj, osmium.osm.Node) and obj.id in node_ids:
            found[f"node/{obj.id}"] = (obj.location.lon, obj.location.lat)
        elif isinstance(obj, osmium.osm.Way) and obj.id in way_ids:
            points = [node.location for node in obj.nodes if node.location.valid()]
            found[f"way/{obj.id}"] = (
                sum(point.lon for point in points) / len(points),
                sum(point.lat for point in points) / len(points),
            )
    missing = refs - found.keys()
    if missing:
        raise SystemExit(f"OSM objects not in the extract: {', '.join(sorted(missing))}")
    return found


@dataclass(frozen=True, slots=True)
class Candidate:
    place: OsmPlace
    inside: bool
    distance_m: float


@dataclass(frozen=True, slots=True)
class Canton:
    code: str
    name: str
    province: str
    surface_lon: float
    surface_lat: float


def load_candidates(
    database_url: str, places: list[OsmPlace]
) -> tuple[list[Canton], dict[str, list[Candidate]]]:
    """Each canton and the places inside it or within NEAR_POLYGON_M of it (PostGIS)."""
    by_id = {place.osm_id: place for place in places}
    url = database_url.replace("postgresql+psycopg://", "postgresql://")
    with psycopg.connect(url) as conn, conn.cursor() as cur:
        cur.execute(
            """
            SELECT c.code, c.name, coalesce(p.name, ''),
                   ST_X(ST_PointOnSurface(c.geom)), ST_Y(ST_PointOnSurface(c.geom))
            FROM cantons AS c
            LEFT JOIN admin_units AS p ON p.code = c.province_code
            ORDER BY c.code
            """
        )
        cantons = [Canton(*row) for row in cur.fetchall()]
        cur.execute("CREATE TEMP TABLE _osm_places (osm_id bigint, geom geometry(Point, 4326))")
        with cur.copy("COPY _osm_places (osm_id, geom) FROM STDIN") as copy:
            for place in places:
                copy.write_row((place.osm_id, f"SRID=4326;POINT({place.lon} {place.lat})"))
        cur.execute("CREATE INDEX ON _osm_places USING gist (geom)")
        cur.execute(
            """
            SELECT c.code, p.osm_id, ST_Intersects(c.geom, p.geom),
                   ST_Distance(c.geom::geography, p.geom::geography)
            FROM cantons AS c
            JOIN _osm_places AS p
              ON ST_DWithin(c.geom::geography, p.geom::geography, %s)
            """,
            (NEAR_POLYGON_M,),
        )
        candidates: dict[str, list[Candidate]] = {}
        for code, osm_id, inside, distance in cur.fetchall():
            candidates.setdefault(code, []).append(
                Candidate(by_id[osm_id], bool(inside), float(distance))
            )
    return cantons, candidates


def _best(candidates: list[Candidate]) -> Candidate | None:
    """Inside before outside, then city > town > village, then population, then nearer."""
    if not candidates:
        return None
    return min(
        candidates,
        key=lambda c: (not c.inside, -c.place.rank, -c.place.population, c.distance_m),
    )


def pick_seat(
    canton: Canton, candidates: list[Candidate], objects: dict[str, tuple[float, float]]
) -> tuple[Candidate | None, str]:
    alias = SEAT_ALIASES.get(canton.code)
    if alias is not None and alias.osm is not None:
        lon, lat = objects[alias.osm]
        place = OsmPlace(0, alias.seat_name, frozenset(), 0, 0, lon, lat)
        return Candidate(place, inside=True, distance_m=0.0), "alias"
    if alias is not None:
        found = _best([c for c in candidates if normalize(alias.seat_name) in c.place.keys])
        if found is None:
            return None, "fallback"
        named = OsmPlace(
            found.place.osm_id,
            alias.seat_name,
            found.place.keys,
            found.place.rank,
            found.place.population,
            found.place.lon,
            found.place.lat,
        )
        return Candidate(named, found.inside, found.distance_m), "alias"
    keys = name_keys(canton.name)
    found = _best([c for c in candidates if keys & c.place.keys])
    if found:
        return found, "name"
    found = _best([c for c in candidates if c.inside])
    if found:
        return found, "rank"
    return None, "fallback"


def _osrm_get(url: str) -> dict | None:
    try:
        with urllib.request.urlopen(url, timeout=10) as response:
            return json.load(response)
    except urllib.error.HTTPError as error:
        return json.load(error)
    except OSError:
        return None


def osrm_snap_m(osrm: str, lon: float, lat: float) -> float | None:
    """Meters from the point to the nearest road OSRM knows."""
    body = _osrm_get(f"{osrm.rstrip('/')}/nearest/v1/driving/{lon:.6f},{lat:.6f}?number=1")
    if not body or body.get("code") != "Ok" or not body.get("waypoints"):
        return None
    return float(body["waypoints"][0]["distance"])


def osrm_route_snap_m(osrm: str, lon: float, lat: float) -> float | None:
    """Meters OSRM moves the point to start a route to Quito (None: no route)."""
    hub = f"{QUITO[0]},{QUITO[1]}"
    body = _osrm_get(
        f"{osrm.rstrip('/')}/route/v1/driving/{lon:.6f},{lat:.6f};{hub}?overview=false"
    )
    if not body or body.get("code") != "Ok":
        return None
    return float(body["waypoints"][0]["distance"])


def _meters(value: float | None) -> str:
    return "none" if value is None else f"{value:.0f} m"


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--pbf", type=Path, required=True)
    parser.add_argument("--database-url", required=True)
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--osrm", help="Check each seat's snap distance against this OSRM")
    args = parser.parse_args(argv)

    places = read_places(args.pbf)
    print(f"OSM places (city/town/village): {len(places)}", file=sys.stderr)
    cantons, candidates = load_candidates(args.database_url, places)
    objects = read_objects(args.pbf, {a.osm for a in SEAT_ALIASES.values() if a.osm})

    rows = []
    methods: Counter[str] = Counter()
    failing: list[str] = []
    no_road: list[str] = []
    for canton in cantons:
        seat, method = pick_seat(canton, candidates.get(canton.code, []), objects)
        methods[method] += 1
        if seat is None:
            lon, lat = canton.surface_lon, canton.surface_lat
            rows.append([canton.code, "", "", "", "", method])
        else:
            lon, lat = seat.place.lon, seat.place.lat
            alias = SEAT_ALIASES.get(canton.code)
            osm_id = alias.osm if alias and alias.osm else f"node/{seat.place.osm_id}"
            rows.append([canton.code, seat.place.name, f"{lon:.6f}", f"{lat:.6f}", osm_id, method])
        label = seat.place.name if seat else "(ST_PointOnSurface)"
        where = "" if seat is None or seat.inside else f" [outside by {seat.distance_m:.0f} m]"
        heading = f"{canton.code} {canton.name} ({canton.province})"
        snap_text = ""
        if args.osrm:
            snap = osrm_snap_m(args.osrm, lon, lat)
            mainland = not canton.code.startswith(GALAPAGOS_PROVINCE_CODE)
            route_snap = osrm_route_snap_m(args.osrm, lon, lat) if mainland else snap
            snap_text = f" snap={_meters(snap)} route_snap={_meters(route_snap)}"
            if any(value is None or value > MAX_SNAP_M for value in (snap, route_snap)):
                line = f"{heading}: {label}{snap_text}"
                (no_road if canton.code in NO_ROAD_ACCESS else failing).append(line)
        print(f"{heading} -> {label} [{method}]{where}{snap_text}", file=sys.stderr)

    args.out.parent.mkdir(parents=True, exist_ok=True)
    with args.out.open("w", encoding="utf-8", newline="") as handle:
        handle.write(ATTRIBUTION + "\n")
        writer = csv.writer(handle, lineterminator="\n")
        writer.writerow(["canton_code", "seat_name", "lon", "lat", "osm_id", "method"])
        writer.writerows(rows)

    print(f"methods: {dict(sorted(methods.items()))}", file=sys.stderr)
    if args.osrm:
        print(f"failing (> {MAX_SNAP_M:.0f} m or no route): {len(failing)}", file=sys.stderr)
        for line in failing:
            print(f"  {line}", file=sys.stderr)
        print(f"known, no road access (NO_ROAD_ACCESS): {len(no_road)}", file=sys.stderr)
        for line in no_road:
            print(f"  {line}", file=sys.stderr)
    return 1 if failing else 0


if __name__ == "__main__":
    raise SystemExit(main())
