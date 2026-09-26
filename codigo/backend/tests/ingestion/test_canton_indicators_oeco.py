"""OECO extortion adapter: canton-name matching, aggregation, and idempotent reload.

See `app.modules.ingestion.adapters.oeco_extorsion` for the alias dicts under
test here (verified against the live database separately; these tests only
prove the *matching mechanism* works on a small, self-contained fixture, not
that the real file's 223 (province, canton) pairs all resolve).
"""

import csv
from pathlib import Path

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.modules.admin_units.models import AdminUnit, AdminUnitLevel
from app.modules.ingestion.adapters import oeco_extorsion
from app.modules.ingestion.canton_indicators import load_indicator_file
from app.modules.ingestion.models import PipelineRun, RunStatus
from app.modules.territory.models import Canton, CantonIndicator

SOURCE_SLUG = "oeco-noticias-delito"

_CANTON_GEOM = (
    "MULTIPOLYGON(((-79.90 -3.30, -79.90 -3.26, -79.86 -3.26, -79.86 -3.30, -79.90 -3.30)))"
)

HEADER = [
    "d_ANIO_PS",
    "d_mes",
    "d_PROVINCIA_INCIDENTE",
    "d_CANTON_INCIDENTE",
    "d_DELITO",
    "d_TIPO_DELITO",
    "d_total",
]


def _seed_place(
    session: Session, code: str, province_code: str, province_name: str, name: str
) -> None:
    if session.get(AdminUnit, province_code) is None:
        session.add(
            AdminUnit(
                code=province_code,
                level=AdminUnitLevel.PROVINCE,
                name=province_name,
                province_code=None,
            )
        )
    session.add(
        AdminUnit(code=code, level=AdminUnitLevel.CANTON, name=name, province_code=province_code)
    )
    session.add(
        Canton(
            code=code,
            province_code=province_code,
            name=name,
            geom=f"SRID=4326;{_CANTON_GEOM}",
            centroid="SRID=4326;POINT(-79.88 -3.28)",
        )
    )


def _write_csv(path: Path, rows: list[dict[str, str]]) -> Path:
    with path.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=HEADER)
        writer.writeheader()
        writer.writerows(rows)
    return path


def _row(**overrides: str) -> dict[str, str]:
    values = {
        "d_ANIO_PS": "2025",
        "d_mes": "Enero",
        "d_PROVINCIA_INCIDENTE": "Guayas",
        "d_CANTON_INCIDENTE": "Guayaquil",
        "d_DELITO": "Extorsión",
        "d_TIPO_DELITO": "Consumado",
        "d_total": "1",
    }
    values.update(overrides)
    return values


def test_extorsion_rows_are_summed_across_consumado_and_tentativa(db_session, tmp_path):
    _seed_place(db_session, "0901", "09", "Guayas", "Guayaquil")
    db_session.commit()

    rows = [
        _row(d_total="5"),
        _row(d_TIPO_DELITO="Tentativa", d_total="3"),
        _row(d_DELITO="Homicidio", d_total="99"),  # a different crime: never counted here
    ]
    parsed = oeco_extorsion.parse(db_session, _write_csv(tmp_path / "oeco.csv", rows))

    assert parsed.unmatched == []
    assert parsed.processed == 3
    assert [r for r in parsed.rows if r.indicator == "extorsion"][0].value == 8


def test_canton_alias_resolves_a_spelling_variant_within_its_own_province(db_session, tmp_path):
    # "Echandía" (OECO's spelling) must resolve to the real canton "Echeandía",
    # and only when scoped to the right province -- not to a same-named
    # canton in a different one.
    _seed_place(db_session, "0902", "09", "Guayas", "Some Other Canton")
    _seed_place(db_session, "0210", "02", "Bolívar", "Echeandía")
    db_session.commit()

    rows = [
        _row(
            d_PROVINCIA_INCIDENTE="Bolívar",
            d_CANTON_INCIDENTE="Echandía",
            d_mes="Febrero",
            d_total="2",
        )
    ]
    parsed = oeco_extorsion.parse(db_session, _write_csv(tmp_path / "oeco.csv", rows))

    assert parsed.unmatched == []
    assert len(parsed.rows) == 1
    row = parsed.rows[0]
    assert (row.canton_code, row.year, row.month, row.value) == ("0210", 2025, 2, 2)


def test_secuestro_extorsivo_is_aggregated_as_its_own_indicator(db_session, tmp_path):
    _seed_place(db_session, "0901", "09", "Guayas", "Guayaquil")
    db_session.commit()

    rows = [_row(d_DELITO="Secuestro Extorsivo", d_total="4")]
    parsed = oeco_extorsion.parse(db_session, _write_csv(tmp_path / "oeco.csv", rows))

    assert [r.indicator for r in parsed.rows] == ["secuestro_extorsivo"]
    assert parsed.rows[0].value == 4


def test_unresolvable_place_name_is_reported_not_dropped(db_session, tmp_path):
    _seed_place(db_session, "0901", "09", "Guayas", "Guayaquil")
    db_session.commit()

    rows = [_row(d_PROVINCIA_INCIDENTE="Provincia Fantasma", d_CANTON_INCIDENTE="Ciudad Fantasma")]
    parsed = oeco_extorsion.parse(db_session, _write_csv(tmp_path / "oeco.csv", rows))

    assert parsed.rows == []
    assert len(parsed.unmatched) == 1
    assert "Fantasma" in parsed.unmatched[0]


def test_load_indicator_file_is_idempotent_and_force_reprocesses(db_session, tmp_path):
    _seed_place(db_session, "0901", "09", "Guayas", "Guayaquil")
    db_session.commit()

    path = _write_csv(tmp_path / "oeco.csv", [_row(d_total="5")])

    first = load_indicator_file(db_session, SOURCE_SLUG, path, oeco_extorsion.parse)
    assert first.status == RunStatus.SUCCEEDED
    assert first.inserted == 1
    assert db_session.scalar(select(CantonIndicator.value)) == 5

    # Same file, same hash: skipped outright, no second PipelineRun.
    second = load_indicator_file(db_session, SOURCE_SLUG, path, oeco_extorsion.parse)
    assert second.id == first.id
    assert db_session.scalar(select(func.count()).select_from(PipelineRun)) == 1

    # force=True: reprocesses despite the unchanged hash (creates a new run).
    third = load_indicator_file(db_session, SOURCE_SLUG, path, oeco_extorsion.parse, force=True)
    assert third.id != first.id
    assert db_session.scalar(select(func.count()).select_from(PipelineRun)) == 2
    assert db_session.scalar(select(CantonIndicator.value)) == 5


def test_reprocessing_the_same_period_replaces_the_value_not_adds_to_it(db_session, tmp_path):
    _seed_place(db_session, "0901", "09", "Guayas", "Guayaquil")
    db_session.commit()

    path = _write_csv(tmp_path / "oeco_v1.csv", [_row(d_total="5")])
    load_indicator_file(db_session, SOURCE_SLUG, path, oeco_extorsion.parse)
    assert db_session.scalar(select(CantonIndicator.value)) == 5

    # A different file (different hash) covering the exact same
    # (indicator, canton, year, month) with a corrected total.
    corrected_path = _write_csv(tmp_path / "oeco_v2.csv", [_row(d_total="9")])
    load_indicator_file(db_session, SOURCE_SLUG, corrected_path, oeco_extorsion.parse)

    assert db_session.scalar(select(func.count()).select_from(CantonIndicator)) == 1
    assert db_session.scalar(select(CantonIndicator.value)) == 9
