"""load_file against DETENTION_TARGET: mirrors test_loader.py's incidents coverage."""

import json
from pathlib import Path

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.modules.detentions.models import Detention
from app.modules.ingestion.adapters.mdi_detenidos import normalize_row
from app.modules.ingestion.loader import DETENTION_TARGET, load_file
from app.modules.ingestion.models import PipelineRun, RunStatus
from tests.ingestion.xlsx_builder import write_xlsx

SOURCE_SLUG = "mdi-detenidos"

HEADER = [
    "codigo_iccs",
    "tipo",
    "codigo_provincia",
    "codigo_canton",
    "latitud",
    "longitud",
    "fecha_detencion_aprehension",
    "hora_detencion_aprehension",
]


def _row(**overrides: str) -> list[str]:
    values = {
        "codigo_iccs": "060124.01",
        "tipo": "DETENIDO",
        "codigo_provincia": "14",
        "codigo_canton": "1401",
        "latitud": "-2,29386",
        "longitud": "-78,09840",
        "fecha_detencion_aprehension": "46051",
        "hora_detencion_aprehension": "17:00:00",
    }
    values.update(overrides)
    return [values[column] for column in HEADER]


# Three rows, each with a distinct location, so their content hashes differ.
VALID_ROWS = [
    _row(latitud="-2,29386", longitud="-78,09840"),
    _row(latitud="-2,17", longitud="-79,88", tipo="APREHENDIDO"),
    _row(latitud="-0,22", longitud="-78,52"),
]

EXTRA_ROW = _row(latitud="-1,05", longitud="-80,45")


def _detention_count(session: Session) -> int:
    return session.scalar(select(func.count()).select_from(Detention))


def test_loads_and_inserts_every_valid_row(db_session: Session, tmp_path: Path):
    path = write_xlsx(tmp_path / "detenidos.xlsx", HEADER, VALID_ROWS)

    run = load_file(db_session, SOURCE_SLUG, path, normalize_row, DETENTION_TARGET)

    assert run.status == RunStatus.SUCCEEDED
    assert run.processed == 3
    assert run.inserted == 3
    assert run.duplicates == 0
    assert run.errors == 0
    assert _detention_count(db_session) == 3


def test_rerunning_the_same_file_is_skipped(db_session: Session, tmp_path: Path):
    path = write_xlsx(tmp_path / "detenidos.xlsx", HEADER, VALID_ROWS)

    first = load_file(db_session, SOURCE_SLUG, path, normalize_row, DETENTION_TARGET)
    second = load_file(db_session, SOURCE_SLUG, path, normalize_row, DETENTION_TARGET)

    assert second.id == first.id
    assert db_session.scalar(select(func.count()).select_from(PipelineRun)) == 1
    assert _detention_count(db_session) == 3


def test_modified_file_with_one_extra_row_inserts_only_that_row(
    db_session: Session, tmp_path: Path
):
    first_path = write_xlsx(tmp_path / "detenidos.xlsx", HEADER, VALID_ROWS)
    load_file(db_session, SOURCE_SLUG, first_path, normalize_row, DETENTION_TARGET)

    second_path = write_xlsx(tmp_path / "detenidos_v2.xlsx", HEADER, [*VALID_ROWS, EXTRA_ROW])
    run = load_file(db_session, SOURCE_SLUG, second_path, normalize_row, DETENTION_TARGET)

    assert run.processed == 4
    assert run.inserted == 1
    assert run.duplicates == 3
    assert _detention_count(db_session) == 4


def test_rejected_rows_are_counted_as_errors_not_inserted(db_session: Session, tmp_path: Path):
    rows = [*VALID_ROWS, _row(latitud="SIN DATO")]
    path = write_xlsx(tmp_path / "detenidos.xlsx", HEADER, rows)

    run = load_file(db_session, SOURCE_SLUG, path, normalize_row, DETENTION_TARGET)

    assert run.processed == 4
    assert run.errors == 1
    assert run.inserted == 3
    assert _detention_count(db_session) == 3
    detail = json.loads(run.error_detail)
    assert detail["errors"] == {"missing_coordinates": 1}


def test_rows_before_min_year_are_skipped_not_counted_as_errors(
    db_session: Session, tmp_path: Path
):
    rows = [VALID_ROWS[0], _row(fecha_detencion_aprehension="40179")]  # 40179 = 2010-01-01
    path = write_xlsx(tmp_path / "detenidos.xlsx", HEADER, rows)

    run = load_file(db_session, SOURCE_SLUG, path, normalize_row, DETENTION_TARGET)

    assert run.processed == 2
    assert run.errors == 0
    assert run.inserted == 1
    assert _detention_count(db_session) == 1
    detail = json.loads(run.error_detail)
    assert detail["skipped"] == {"before_min_year": 1}
