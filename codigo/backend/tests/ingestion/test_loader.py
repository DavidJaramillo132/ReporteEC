import json
from pathlib import Path

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.modules.admin_units.models import AdminUnit
from app.modules.incidents.models import Incident
from app.modules.ingestion.adapters.mdi_homicidios import normalize_row
from app.modules.ingestion.loader import load_file
from app.modules.ingestion.models import PipelineRun, RunStatus
from tests.ingestion.xlsx_builder import write_xlsx

SOURCE_SLUG = "mdi-homicidios"

HEADER = [
    "tipo_muerte",
    "codigo_provincia",
    "codigo_canton",
    "coordenada_y",
    "coordenada_x",
    "fecha_infraccion",
    "hora_infraccion",
]


def _row(**overrides: str) -> list[str]:
    values = {
        "tipo_muerte": "ASESINATO",
        "codigo_provincia": "07",
        "codigo_canton": "0701",
        "coordenada_y": "-3,28012",
        "coordenada_x": "-79,96541",
        "fecha_infraccion": "46023",
        "hora_infraccion": "01:25:00",
    }
    values.update(overrides)
    return [values[column] for column in HEADER]


# Three rows, each with a distinct location, so their content hashes differ.
VALID_ROWS = [
    _row(coordenada_y="-3,28012", coordenada_x="-79,96541"),
    _row(coordenada_y="-2,17", coordenada_x="-79,88", tipo_muerte="SICARIATO"),
    _row(coordenada_y="-0,22", coordenada_x="-78,52", tipo_muerte="FEMICIDIO"),
]

EXTRA_ROW = _row(coordenada_y="-1,05", coordenada_x="-80,45", tipo_muerte="HOMICIDIO")


def _incident_count(session: Session) -> int:
    return session.scalar(select(func.count()).select_from(Incident))


def test_loads_and_inserts_every_valid_row(db_session: Session, tmp_path: Path):
    path = write_xlsx(tmp_path / "homicidios.xlsx", HEADER, VALID_ROWS)

    run = load_file(db_session, SOURCE_SLUG, path, normalize_row)

    assert run.status == RunStatus.SUCCEEDED
    assert run.processed == 3
    assert run.inserted == 3
    assert run.duplicates == 0
    assert run.errors == 0
    assert _incident_count(db_session) == 3


def test_rerunning_the_same_file_is_skipped(db_session: Session, tmp_path: Path):
    path = write_xlsx(tmp_path / "homicidios.xlsx", HEADER, VALID_ROWS)

    first = load_file(db_session, SOURCE_SLUG, path, normalize_row)
    second = load_file(db_session, SOURCE_SLUG, path, normalize_row)

    assert second.id == first.id
    assert db_session.scalar(select(func.count()).select_from(PipelineRun)) == 1
    assert _incident_count(db_session) == 3


def test_modified_file_with_one_extra_row_inserts_only_that_row(
    db_session: Session, tmp_path: Path
):
    first_path = write_xlsx(tmp_path / "homicidios.xlsx", HEADER, VALID_ROWS)
    load_file(db_session, SOURCE_SLUG, first_path, normalize_row)

    second_path = write_xlsx(tmp_path / "homicidios_v2.xlsx", HEADER, [*VALID_ROWS, EXTRA_ROW])
    run = load_file(db_session, SOURCE_SLUG, second_path, normalize_row)

    assert run.processed == 4
    assert run.inserted == 1
    assert run.duplicates == 3
    assert _incident_count(db_session) == 4


def test_rejected_rows_are_counted_as_errors_not_inserted(db_session: Session, tmp_path: Path):
    # No canton code either: a coordinate-less row with a canton code is no
    # longer an adapter-level rejection (see test_loader_canton_precision.py).
    rows = [*VALID_ROWS, _row(coordenada_y="SIN DATO", codigo_canton="")]
    path = write_xlsx(tmp_path / "homicidios.xlsx", HEADER, rows)

    run = load_file(db_session, SOURCE_SLUG, path, normalize_row)

    assert run.processed == 4
    assert run.errors == 1
    assert run.inserted == 3
    assert _incident_count(db_session) == 3
    detail = json.loads(run.error_detail)
    assert detail["errors"] == {"missing_coordinates": 1}


def test_rows_before_min_year_are_skipped_not_counted_as_errors(
    db_session: Session, tmp_path: Path
):
    rows = [VALID_ROWS[0], _row(fecha_infraccion="40179")]  # 40179 = 2010-01-01
    path = write_xlsx(tmp_path / "homicidios.xlsx", HEADER, rows)

    run = load_file(db_session, SOURCE_SLUG, path, normalize_row)

    assert run.processed == 2
    assert run.errors == 0
    assert run.inserted == 1
    assert _incident_count(db_session) == 1
    detail = json.loads(run.error_detail)
    assert detail["skipped"] == {"before_min_year": 1}


# HEADER extended with the raw province/canton name columns real MDI files
# carry (VALID_ROWS/_row above never set them, so those tests are unaffected).
NAMED_HEADER = [*HEADER, "provincia", "canton"]


def _named_row(**overrides: str) -> list[str]:
    values = {
        "tipo_muerte": "ASESINATO",
        "codigo_provincia": "07",
        "codigo_canton": "0701",
        "coordenada_y": "-3,28012",
        "coordenada_x": "-79,96541",
        "fecha_infraccion": "46023",
        "hora_infraccion": "01:25:00",
        "provincia": "EL ORO",
        "canton": "MACHALA",
    }
    values.update(overrides)
    return [values[column] for column in NAMED_HEADER]


def test_loading_a_file_backfills_admin_unit_names(db_session: Session, tmp_path: Path):
    path = write_xlsx(tmp_path / "homicidios.xlsx", NAMED_HEADER, [_named_row()])

    load_file(db_session, SOURCE_SLUG, path, normalize_row)

    province = db_session.get(AdminUnit, "07")
    canton = db_session.get(AdminUnit, "0701")
    assert province.name == "El Oro"
    assert canton.name == "Machala"
    assert canton.province_code == "07"


def test_rerunning_an_already_loaded_file_still_backfills_names(
    db_session: Session, tmp_path: Path
):
    path = write_xlsx(tmp_path / "homicidios.xlsx", NAMED_HEADER, [_named_row()])
    load_file(db_session, SOURCE_SLUG, path, normalize_row)
    # Wipe the name (simulating a name that changed upstream) to prove the
    # second, "already loaded" run still refreshes it.
    db_session.get(AdminUnit, "07").name = "Placeholder"
    db_session.commit()

    run = load_file(db_session, SOURCE_SLUG, path, normalize_row)

    assert run.status == RunStatus.SUCCEEDED
    db_session.expire_all()
    assert db_session.get(AdminUnit, "07").name == "El Oro"
