"""Build a minimal real-shaped .xlsx for ingestion tests without a spreadsheet library.

Shares the single-sheet, inline-string approach used by
test_xlsx_reader.py's make_xlsx, generalized to an arbitrary header/rows
table so loader tests can generate a homicide-shaped file on the fly.
"""

import zipfile
from pathlib import Path

NS = 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"'

_COLUMN_LETTERS = [chr(ord("A") + i) for i in range(26)]


def _column(index: int) -> str:
    return _COLUMN_LETTERS[index]


def _escape(value: str) -> str:
    return value.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def _row_xml(row_number: int, values: list[str]) -> str:
    cells = "".join(
        f'<c r="{_column(i)}{row_number}" t="inlineStr"><is><t>{_escape(value)}</t></is></c>'
        for i, value in enumerate(values)
    )
    return f'<row r="{row_number}">{cells}</row>'


def write_xlsx(path: Path, header: list[str], rows: list[list[str]]) -> Path:
    """A single-sheet workbook: `header` on row 1, one data row per entry in `rows`."""
    sheet_rows = [_row_xml(1, header)]
    sheet_rows += [_row_xml(number, values) for number, values in enumerate(rows, start=2)]
    sheet_xml = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
        f"<worksheet {NS}><sheetData>{''.join(sheet_rows)}</sheetData></worksheet>"
    )
    with zipfile.ZipFile(path, "w") as archive:
        archive.writestr("xl/worksheets/sheet1.xml", sheet_xml)
    return path
