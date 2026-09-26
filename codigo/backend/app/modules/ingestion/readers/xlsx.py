"""Stream rows out of an Office Open XML spreadsheet (.xlsx), no pandas/openpyxl.

Ported from codigo/scripts/exportar_muestra_v1.py: the ingestion adapters need
the same tolerant parser (shared strings, inline strings, sparse rows) already
proven against the real Ministerio del Interior files.
"""

import re
import zipfile
from collections.abc import Iterator
from pathlib import Path
from xml.etree import ElementTree as ET

NS = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"
ROW_TAG = NS + "row"

_SHEET_PATH_RE = re.compile(r"xl/worksheets/sheet(\d+)\.xml$")
_CELL_COLUMN_RE = re.compile(r"([A-Z]+)")


def _sheet_paths(archive: zipfile.ZipFile) -> list[str]:
    """Worksheet XML paths in sheet order (sheet1, sheet2, ...)."""
    return sorted(
        (name for name in archive.namelist() if _SHEET_PATH_RE.search(name)),
        key=lambda name: int(_SHEET_PATH_RE.search(name).group(1)),
    )


def _shared_strings(archive: zipfile.ZipFile) -> list[str]:
    if "xl/sharedStrings.xml" not in archive.namelist():
        return []
    root = ET.fromstring(archive.read("xl/sharedStrings.xml"))
    return ["".join(t.text or "" for t in si.iter(NS + "t")) for si in root.findall(NS + "si")]


def _cell_value(cell: ET.Element, shared: list[str]) -> str | None:
    """Text of one <c> element, or None when the cell carries no value at all."""
    cell_type = cell.get("t")
    if cell_type == "inlineStr":
        inline = cell.find(NS + "is")
        return "".join(t.text or "" for t in inline.iter(NS + "t")) if inline is not None else ""
    value = cell.find(NS + "v")
    if value is None:
        return None
    return shared[int(value.text)] if cell_type == "s" else (value.text or "")


def _row_cells(row: ET.Element, shared: list[str]) -> dict[str, str]:
    """Map spreadsheet column letter ('A', 'B', ...) to text, skipping empty cells.

    Keying by column letter -- not by a cell's position within the row's <c>
    list -- keeps an empty cell from shifting every later column into the
    wrong header.
    """
    cells: dict[str, str] = {}
    for cell in row.findall(NS + "c"):
        match = _CELL_COLUMN_RE.match(cell.get("r", ""))
        if match is None:
            continue
        value = _cell_value(cell, shared)
        if value is not None:
            cells[match.group(1)] = value
    return cells


def _is_header_row(cells: dict[str, str]) -> bool:
    """Header names vary by dataset ("provincia", "nombre_provincia"), so match a substring."""
    return any("provincia" in value.strip().lower() for value in cells.values())


def _iter_sheet_rows(
    archive: zipfile.ZipFile, sheet_path: str, shared: list[str]
) -> Iterator[dict[str, str]]:
    """Stream one worksheet's <row> elements as {column_letter: text}.

    A historical file's data sheet can be well over a gigabyte once
    decompressed; `ET.fromstring(archive.read(sheet_path))` would parse that
    whole tree -- every row, cell and value as its own Element -- into memory
    at once. `iterparse` instead builds the tree incrementally and
    `element.clear()` drops each row's cells (text, attributes) the moment
    they have been read into a plain dict, so memory stays bounded by one row
    at a time, not by the sheet's total size.
    """
    with archive.open(sheet_path) as handle:
        for _event, element in ET.iterparse(handle, events=("end",)):
            if element.tag == ROW_TAG:
                yield _row_cells(element, shared)
                element.clear()


def _select_sheet(archive: zipfile.ZipFile, sheet_paths: list[str], shared: list[str]) -> int:
    """Index of the sheet that holds the data, scanning for a "provincia" header.

    Every official file has a "Contenido" cover sheet first and the data on
    the 2nd sheet, so try that one first; fall back to scanning every sheet in
    case a file ever reorders them.
    """
    default = 1 if len(sheet_paths) > 1 else 0
    order = [default, *(i for i in range(len(sheet_paths)) if i != default)]
    for index in order:
        for cells in _iter_sheet_rows(archive, sheet_paths[index], shared):
            if cells and _is_header_row(cells):
                return index
    return default


def read_rows(path: str | Path) -> Iterator[dict[str, str]]:
    """Yield each data row of an .xlsx file as {normalized_header: raw_text}.

    Header names are lowercased and stripped so adapters can rely on stable
    keys ("provincia", not " Provincia "). Rows before the header, and blank
    rows, are skipped.
    """
    with zipfile.ZipFile(path) as archive:
        sheet_paths = _sheet_paths(archive)
        if not sheet_paths:
            return
        shared = _shared_strings(archive)
        sheet = sheet_paths[_select_sheet(archive, sheet_paths, shared)]

        header: dict[str, str] | None = None
        for cells in _iter_sheet_rows(archive, sheet, shared):
            if not cells:
                continue
            if header is None:
                if _is_header_row(cells):
                    header = {column: value.strip().lower() for column, value in cells.items()}
                continue
            if any(value.strip() for value in cells.values()):
                yield {header[column]: value for column, value in cells.items() if column in header}
