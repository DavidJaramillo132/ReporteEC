"""Load canton boundaries and cantonal population projections.

Two independent CLI subcommands feed off two independent official files, and
neither one is the raw XLSX/JSON adapter+loader pattern the incident/
detention adapters use (see `app.modules.ingestion.loader`) -- both files
have their own one-off shape, so each gets a small dedicated loader here
instead.

`cantons --file <geojson>` loads canton boundaries. The shipped file
(`codigo/data/raw/dpa/cantones_ecuador_simplificado.geojson`) turned out, on
inspection, to be a geoBoundaries.org ADM2 extract (properties are
`shapeName`/`shapeISO`/`shapeID`/`shapeGroup`/`shapeType`) -- not a
CONALI/INEC "Marco Geoestadistico" cartography file as its filename
suggests, and it carries no DPA code at all. Every shape is therefore
matched to its DPA code by *name*, against `admin_units` (itself populated
from the official MDI files' own `codigo_canton`/`canton` columns), never by
a code in the geojson. `_CANTON_NAME_ALIASES` covers the handful of known
spelling/abbreviation differences; a shape that still cannot be matched (a
new canton, a disputed/undelimited zone) is reported in `CantonLoadSummary`,
never silently dropped.

`population --file <xlsx>` loads the INEC cantonal population projection
(2010-2035): one worksheet per province, each a wide year-columns table.
Canton rows are matched to a DPA code the same way, against `admin_units`
filtered to that sheet's own province.

`validate_coverage` cross-checks both tables against every canton_code seen
in `incidents`/`detentions` and reports any gap, so a DPA change shows up as
a printed mismatch instead of a canton with no boundary or no population.
"""

from __future__ import annotations

import json
import re
import unicodedata
import zipfile
from collections.abc import Iterator
from dataclasses import dataclass, field
from pathlib import Path
from xml.etree import ElementTree as ET

from sqlalchemy import func as sa_func
from sqlalchemy import select, text
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.modules.admin_units.models import AdminUnit, AdminUnitLevel
from app.modules.detentions.models import Detention
from app.modules.incidents.models import Incident
from app.modules.territory.models import Canton, CantonPopulation

# ---------------------------------------------------------------------------
# Name normalization shared by both loaders.
# ---------------------------------------------------------------------------

_WHITESPACE_RE = re.compile(r"\s+")


def _normalize_name(name: str) -> str:
    """Accent/case/whitespace-insensitive key for matching a place name."""
    decomposed = unicodedata.normalize("NFKD", name)
    ascii_only = "".join(char for char in decomposed if not unicodedata.combining(char))
    return _WHITESPACE_RE.sub(" ", ascii_only).strip().upper()


# geoBoundaries `shapeName` -> admin_units canton name, both normalized, for
# the cantons whose name differs enough (abbreviation, parenthetical
# alternate name, or common-vs-official form) that normalization alone does
# not bridge them. Confirmed by hand against the admin_units table as of
# 2026-09-26; see "Datos/Fuentes.md" for how this was derived.
_CANTON_NAME_ALIASES = {
    "ALFREDO BAQUERIZO MORENO": "ALFREDO BAQUERIZO MORENO (JUJAN)",
    "CRNEL. MARCELINO MARIDUENA": "CORONEL MARCELINO MARIDUENA",
    "EMPALME": "EL EMPALME",
    "GNRAL. ANTONIO ELIZALDE": "GENERAL ANTONIO ELIZALDE",
    "ORELLANA": "FRANCISCO DE ORELLANA",
    # Only the INEC population file uses Quito's official long-form name.
    "DISTRITO METROPOLITANO DE QUITO": "QUITO",
}

# INEC population-file sheet name -> admin_units province name, both
# normalized, for the provinces whose sheet title is short/abbreviated
# rather than the official DPA name.
_PROVINCE_NAME_ALIASES = {
    "MORONA": "MORONA SANTIAGO",
    "ZAMORA": "ZAMORA CHINCHIPE",
    "SANTO DOMINGO": "STO DGO DE LOS TSACHILAS",
}

# geoBoundaries provincias shapeName -> admin_units province name, both
# normalized: the DPA-abbreviated admin_units name ("Sto Dgo de los
# Tsachilas") is the one place this differs from the geojson's full name.
_PROVINCE_SHAPE_ALIASES = {
    "SANTO DOMINGO DE LOS TSACHILAS": "STO DGO DE LOS TSACHILAS",
}

# Sibling file, shipped alongside the cantons geojson: used only to resolve
# which province each canton shape sits in (see `_resolve_province_codes`),
# since a canton name is not unique nationwide (e.g. "Bolivar" and "Olmedo"
# each name a canton in two different provinces) and the geoBoundaries
# cantons file itself carries no parent-province property.
_PROVINCIAS_FILENAME = "provincias_ecuador_simplificado.geojson"


# ---------------------------------------------------------------------------
# cantons --file <geojson>
# ---------------------------------------------------------------------------


@dataclass(slots=True)
class CantonLoadSummary:
    matched: int
    unmatched_shapes: list[str] = field(default_factory=list)


def _load_province_shapes(session: Session, provincias_path: Path) -> dict[str, str]:
    """DPA province code -> raw geojson geometry text, for the sibling provincias file.

    Matched by name against `admin_units` provinces, which -- unlike canton
    names -- are unique nationwide, so this direction needs no spatial join.
    Returns {} (never raises) when the sibling file is missing: callers fall
    back to unscoped name matching, which is still correct for every canton
    whose name happens to be unique.
    """
    if not provincias_path.exists():
        return {}
    data = json.loads(provincias_path.read_text(encoding="utf-8"))
    admin_by_name = {
        _normalize_name(unit.name): unit
        for unit in session.scalars(
            select(AdminUnit).where(AdminUnit.level == AdminUnitLevel.PROVINCE)
        )
    }
    shapes: dict[str, str] = {}
    for feature in data["features"]:
        raw_name = feature.get("properties", {}).get("shapeName", "")
        key = _normalize_name(raw_name)
        key = _PROVINCE_SHAPE_ALIASES.get(key, key)
        unit = admin_by_name.get(key)
        if unit is not None:
            shapes[unit.code] = json.dumps(feature["geometry"])
    return shapes


def _resolve_province_codes(
    session: Session, provincias_path: Path, canton_features: list[dict]
) -> dict[int, str]:
    """Feature index -> DPA province code, by spatial containment.

    Some canton names are not unique nationwide (e.g. "Bolivar" and "Olmedo"
    each name a canton in two different provinces) and the geoBoundaries
    cantons file carries no parent-province property, so the province a
    shape belongs to is resolved with PostGIS itself: a representative point
    of the canton shape (`ST_PointOnSurface`, safe for a concave shape)
    tested against every province polygon with `ST_Contains`.
    """
    province_shapes = _load_province_shapes(session, provincias_path)
    if not province_shapes:
        return {}

    session.execute(
        text(
            "CREATE TEMP TABLE _territory_provinces "
            "(code varchar(2), geom geometry(MultiPolygon, 4326)) ON COMMIT DROP"
        )
    )
    session.execute(
        text(
            "INSERT INTO _territory_provinces (code, geom) "
            "VALUES (:code, ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON(:geom), 4326)))"
        ),
        [{"code": code, "geom": geom} for code, geom in province_shapes.items()],
    )

    resolved: dict[int, str] = {}
    lookup = text(
        "SELECT code FROM _territory_provinces "
        "WHERE ST_Contains(geom, ST_PointOnSurface(ST_SetSRID(ST_GeomFromGeoJSON(:geom), 4326))) "
        "LIMIT 1"
    )
    for index, feature in enumerate(canton_features):
        code = session.execute(lookup, {"geom": json.dumps(feature["geometry"])}).scalar()
        if code is not None:
            resolved[index] = code
    return resolved


def load_cantons(session: Session, path: str | Path) -> CantonLoadSummary:
    """Upsert `cantons` from a geoBoundaries-shaped ADM2 geojson.

    `ST_PointOnSurface`, not `ST_Centroid`, computes the stored centroid: a
    concave canton's center of mass can fall outside its own boundary (a
    C-shaped canton, for instance), which would place a coordinate-less
    incident inside a neighboring canton instead of its own.
    """
    path = Path(path)
    data = json.loads(path.read_text(encoding="utf-8"))
    features = data["features"]

    cantons_by_name: dict[str, AdminUnit] = {}
    cantons_by_province: dict[str, dict[str, AdminUnit]] = {}
    for unit in session.scalars(select(AdminUnit).where(AdminUnit.level == AdminUnitLevel.CANTON)):
        key = _normalize_name(unit.name)
        cantons_by_name[key] = unit
        cantons_by_province.setdefault(unit.province_code or "", {})[key] = unit

    province_by_index = _resolve_province_codes(
        session, path.parent / _PROVINCIAS_FILENAME, features
    )

    values: list[dict[str, object]] = []
    unmatched: list[str] = []
    seen_codes: set[str] = set()
    for index, feature in enumerate(features):
        raw_name = feature.get("properties", {}).get("shapeName", "")
        key = _normalize_name(raw_name)
        key = _CANTON_NAME_ALIASES.get(key, key)

        province_code = province_by_index.get(index)
        unit = cantons_by_province.get(province_code, {}).get(key) if province_code else None
        if unit is None:
            # No province resolved (sibling file missing) or nothing in that
            # province matched: an unscoped name match is still correct for
            # every canton whose name is unique nationwide (all but two).
            unit = cantons_by_name.get(key)
        if unit is None:
            unmatched.append(raw_name)
            continue
        if unit.code in seen_codes:
            # Two shapes resolved to the same DPA code -- a genuinely
            # ambiguous name the province lookup could not separate (e.g.
            # the sibling provincias file was missing). Reported rather than
            # silently overwriting the first shape's geometry.
            unmatched.append(raw_name)
            continue
        seen_codes.add(unit.code)

        # GeoJSON is always WGS84 (RFC 7946); ST_GeomFromGeoJSON ignores any
        # "crs" member and returns SRID 0, so the SRID is set explicitly.
        geom = sa_func.ST_SetSRID(sa_func.ST_GeomFromGeoJSON(json.dumps(feature["geometry"])), 4326)
        values.append(
            {
                "code": unit.code,
                "province_code": unit.province_code,
                "name": unit.name,
                "geom": sa_func.ST_Multi(geom),
                "centroid": sa_func.ST_PointOnSurface(geom),
            }
        )

    if values:
        statement = insert(Canton).values(values)
        statement = statement.on_conflict_do_update(
            index_elements=[Canton.code],
            set_={
                "province_code": statement.excluded.province_code,
                "name": statement.excluded.name,
                "geom": statement.excluded.geom,
                "centroid": statement.excluded.centroid,
            },
        )
        session.execute(statement)

    return CantonLoadSummary(matched=len(values), unmatched_shapes=unmatched)


# ---------------------------------------------------------------------------
# population --file <xlsx>
# ---------------------------------------------------------------------------

_NS = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"
_REL_NS = "{http://schemas.openxmlformats.org/package/2006/relationships}"
_R_ID = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id"
_COLUMN_RE = re.compile(r"([A-Z]+)")
_YEAR_RE = re.compile(r"^(19|20)\d{2}$")


def _shared_strings(archive: zipfile.ZipFile) -> list[str]:
    if "xl/sharedStrings.xml" not in archive.namelist():
        return []
    root = ET.fromstring(archive.read("xl/sharedStrings.xml"))
    return ["".join(t.text or "" for t in si.iter(_NS + "t")) for si in root.findall(_NS + "si")]


def _cell_value(cell: ET.Element, shared: list[str]) -> str | None:
    cell_type = cell.get("t")
    if cell_type == "inlineStr":
        inline = cell.find(_NS + "is")
        return "".join(t.text or "" for t in inline.iter(_NS + "t")) if inline is not None else ""
    value = cell.find(_NS + "v")
    if value is None:
        return None
    return shared[int(value.text)] if cell_type == "s" else (value.text or "")


def _row_cells(row: ET.Element, shared: list[str]) -> dict[str, str]:
    cells: dict[str, str] = {}
    for cell in row.findall(_NS + "c"):
        match = _COLUMN_RE.match(cell.get("r", ""))
        if match is None:
            continue
        value = _cell_value(cell, shared)
        if value is not None:
            cells[match.group(1)] = value
    return cells


def _sheet_rows(
    archive: zipfile.ZipFile, sheet_path: str, shared: list[str]
) -> Iterator[dict[str, str]]:
    with archive.open(sheet_path) as handle:
        for _event, element in ET.iterparse(handle, events=("end",)):
            if element.tag == _NS + "row":
                yield _row_cells(element, shared)
                element.clear()


def _province_sheets(archive: zipfile.ZipFile) -> Iterator[tuple[str, str]]:
    """Yield (sheet display name, worksheet path), skipping the cover sheet."""
    workbook = ET.fromstring(archive.read("xl/workbook.xml"))
    rels = ET.fromstring(archive.read("xl/_rels/workbook.xml.rels"))
    rid_to_target = {
        rel.get("Id"): rel.get("Target") for rel in rels.iter(_REL_NS + "Relationship")
    }

    for sheet in workbook.iter(_NS + "sheet"):
        name = sheet.get("name") or ""
        if _normalize_name(name) == "INDICE":
            continue
        target = rid_to_target.get(sheet.get(_R_ID))
        if target:
            yield name, f"xl/{target}"


@dataclass(slots=True)
class PopulationLoadSummary:
    rows: int
    unmatched_provinces: list[str] = field(default_factory=list)
    unmatched_cantons: list[str] = field(default_factory=list)


def load_population(session: Session, path: str | Path) -> PopulationLoadSummary:
    """Upsert `canton_population` from the INEC cantonal projection file.

    Each province worksheet reads: a year-header row (e.g. columns C..AB ->
    2010..2035), immediately followed by that province's own total (skipped
    -- population is stored per canton only), then one row per canton.
    """
    archive = zipfile.ZipFile(path)
    shared = _shared_strings(archive)

    admin_provinces = {
        _normalize_name(unit.name): unit
        for unit in session.scalars(
            select(AdminUnit).where(AdminUnit.level == AdminUnitLevel.PROVINCE)
        )
    }
    cantons_by_province: dict[str, dict[str, AdminUnit]] = {}
    for unit in session.scalars(select(AdminUnit).where(AdminUnit.level == AdminUnitLevel.CANTON)):
        by_name = cantons_by_province.setdefault(unit.province_code or "", {})
        by_name[_normalize_name(unit.name)] = unit

    population: dict[tuple[str, int], int] = {}
    unmatched_provinces: list[str] = []
    unmatched_cantons: list[str] = []

    for sheet_name, sheet_path in _province_sheets(archive):
        key = _normalize_name(sheet_name)
        key = _PROVINCE_NAME_ALIASES.get(key, key)
        province = admin_provinces.get(key)
        if province is None:
            unmatched_provinces.append(sheet_name)
            continue
        cantons_by_name = cantons_by_province.get(province.code, {})

        year_columns: dict[str, int] | None = None
        skip_total_row = False
        for cells in _sheet_rows(archive, sheet_path, shared):
            if not cells:
                continue

            if year_columns is None:
                candidate = {
                    column: int(value.strip())
                    for column, value in cells.items()
                    if value and _YEAR_RE.match(value.strip())
                }
                if len(candidate) >= 2:
                    year_columns = candidate
                    skip_total_row = True  # the very next data row is the province total
                continue

            name_cell = cells.get("B")
            if not name_cell or not name_cell.strip():
                continue
            if skip_total_row:
                skip_total_row = False
                continue

            canton_key = _normalize_name(name_cell)
            canton_key = _CANTON_NAME_ALIASES.get(canton_key, canton_key)
            unit = cantons_by_name.get(canton_key)
            if unit is None:
                unmatched_cantons.append(f"{sheet_name}: {name_cell}")
                continue

            for column, year in year_columns.items():
                raw = cells.get(column)
                if raw is None or not raw.strip():
                    continue
                try:
                    population[(unit.code, year)] = int(round(float(raw)))
                except ValueError:
                    continue

    if population:
        rows = [
            {"canton_code": code, "year": year, "population": value}
            for (code, year), value in population.items()
        ]
        statement = insert(CantonPopulation).values(rows)
        statement = statement.on_conflict_do_update(
            index_elements=[CantonPopulation.canton_code, CantonPopulation.year],
            set_={"population": statement.excluded.population},
        )
        session.execute(statement)

    return PopulationLoadSummary(
        rows=len(population),
        unmatched_provinces=unmatched_provinces,
        unmatched_cantons=unmatched_cantons,
    )


# ---------------------------------------------------------------------------
# Coverage validation
# ---------------------------------------------------------------------------

#: The dev/prod dataset's incident years (see "Datos/Calidad de Datos.md");
#: every canton actually referenced by incidents/detentions is expected to
#: have a population figure for each of these.
REQUIRED_POPULATION_YEARS: range = range(2019, 2027)


@dataclass(slots=True)
class CoverageReport:
    missing_canton: list[str] = field(default_factory=list)
    missing_population_years: dict[str, list[int]] = field(default_factory=dict)

    @property
    def clean(self) -> bool:
        return not self.missing_canton and not self.missing_population_years


def validate_coverage(session: Session) -> CoverageReport:
    """Cross-check every canton_code seen in incidents/detentions.

    A DPA change (a new canton, a code retired into a disputed zone) shows
    up here as a code with no `cantons` row, or a gap in
    `canton_population` -- printed by the CLI, never silently dropped.
    """
    codes: set[str] = set(
        session.scalars(
            select(Incident.canton_code).where(Incident.canton_code.is_not(None)).distinct()
        )
    )
    codes |= set(
        session.scalars(
            select(Detention.canton_code).where(Detention.canton_code.is_not(None)).distinct()
        )
    )

    known_cantons = set(session.scalars(select(Canton.code)))
    report = CoverageReport(missing_canton=sorted(codes - known_cantons))

    years_by_code: dict[str, set[int]] = {}
    if codes:
        for code, year in session.execute(
            select(CantonPopulation.canton_code, CantonPopulation.year).where(
                CantonPopulation.canton_code.in_(codes)
            )
        ).all():
            years_by_code.setdefault(code, set()).add(year)

    for code in sorted(codes):
        have = years_by_code.get(code, set())
        missing_years = [year for year in REQUIRED_POPULATION_YEARS if year not in have]
        if missing_years:
            report.missing_population_years[code] = missing_years

    return report
