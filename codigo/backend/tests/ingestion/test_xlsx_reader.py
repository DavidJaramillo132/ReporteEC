import zipfile
from pathlib import Path

from app.modules.ingestion.readers.xlsx import read_rows

NS = 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"'

# 5 header strings, plus 2 data strings ("Pichincha" for a shared-string data
# cell, "si" for another one after the gap column).
SHARED_STRINGS = f"""<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<sst {NS} count="7" uniqueCount="7">
<si><t>PROVINCIA</t></si>
<si><t> CANTON </t></si>
<si><t>Poblacion</t></si>
<si><t>Nota</t></si>
<si><t>Activo</t></si>
<si><t>Pichincha</t></si>
<si><t>si</t></si>
</sst>"""

# Sheet 1: the "Contenido" cover sheet, no "provincia" header anywhere.
COVER_SHEET = f"""<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet {NS}>
<sheetData>
<row r="1"><c r="A1" t="inlineStr"><is><t>Contenido del archivo</t></is></c></row>
</sheetData>
</worksheet>"""

# Sheet 2: the data sheet. Row 2 has a shared string (A2), an inline string
# (B2), a numeric cell (C2), a gap (no D2 cell at all) and another shared
# string (E2) -- E2 must still land under "activo", not shift into "nota".
DATA_SHEET = f"""<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet {NS}>
<sheetData>
<row r="1">
<c r="A1" t="s"><v>0</v></c>
<c r="B1" t="s"><v>1</v></c>
<c r="C1" t="s"><v>2</v></c>
<c r="D1" t="s"><v>3</v></c>
<c r="E1" t="s"><v>4</v></c>
</row>
<row r="2">
<c r="A2" t="s"><v>5</v></c>
<c r="B2" t="inlineStr"><is><t>Quito</t></is></c>
<c r="C2"><v>125</v></c>
<c r="E2" t="s"><v>6</v></c>
</row>
</sheetData>
</worksheet>"""


def make_xlsx(tmp_path: Path, sheets: dict[str, str], shared_strings: str | None = None) -> Path:
    path = tmp_path / "sample.xlsx"
    with zipfile.ZipFile(path, "w") as archive:
        for name, xml in sheets.items():
            archive.writestr(f"xl/worksheets/{name}", xml)
        if shared_strings is not None:
            archive.writestr("xl/sharedStrings.xml", shared_strings)
    return path


def test_reads_header_row_and_data_row_from_the_second_sheet(tmp_path: Path):
    path = make_xlsx(
        tmp_path,
        {"sheet1.xml": COVER_SHEET, "sheet2.xml": DATA_SHEET},
        shared_strings=SHARED_STRINGS,
    )

    rows = list(read_rows(path))

    # Header text is normalized (stripped, lowercased); data values are not.
    assert rows == [
        {
            "provincia": "Pichincha",
            "canton": "Quito",
            "poblacion": "125",
            "activo": "si",
        }
    ]


def test_falls_back_to_scanning_when_the_data_is_not_on_the_second_sheet(tmp_path: Path):
    # Only one sheet in the workbook: the default (index 1) doesn't exist, so
    # selection must fall back to sheet 1 itself.
    path = make_xlsx(tmp_path, {"sheet1.xml": DATA_SHEET}, shared_strings=SHARED_STRINGS)

    rows = list(read_rows(path))

    assert rows == [
        {
            "provincia": "Pichincha",
            "canton": "Quito",
            "poblacion": "125",
            "activo": "si",
        }
    ]


def _make_large_sheet(row_count: int) -> str:
    header = '<row r="1"><c r="A1" t="inlineStr"><is><t>provincia</t></is></c></row>'
    rows = [
        f'<row r="{n}"><c r="A{n}" t="inlineStr"><is><t>row-{n}</t></is></c></row>'
        for n in range(2, row_count + 2)
    ]
    return (
        f'<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
        f"<worksheet {NS}><sheetData>{header}{''.join(rows)}</sheetData></worksheet>"
    )


def test_reads_every_row_of_a_large_sheet_without_building_the_whole_tree(tmp_path: Path):
    # Regression test for the ET.fromstring(archive.read(...)) approach: it
    # parsed the entire worksheet into one in-memory tree before yielding
    # anything, which does not scale to a 600k-row historical file.
    # `read_rows` must still be a generator that streams rows one at a time
    # (and yields every one of them, in order) once iterparse replaced it.
    row_count = 5000
    path = make_xlsx(tmp_path, {"sheet1.xml": _make_large_sheet(row_count)})

    rows = read_rows(path)
    assert hasattr(rows, "__next__"), "read_rows must be a generator, not a list-builder"

    values = [row["provincia"] for row in rows]

    assert len(values) == row_count
    assert values[0] == "row-2"
    assert values[-1] == f"row-{row_count + 1}"
