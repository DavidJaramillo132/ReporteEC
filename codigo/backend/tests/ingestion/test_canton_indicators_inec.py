"""INEC ESTRA adapter: shape detection, zip-entry selection, year derivation.

Uses small synthetic zips shaped like the real files (see
`app.modules.ingestion.adapters.inec_siniestros`'s docstring for the two CSV
shapes and the real per-year zip layout), never the real ~MB downloads.
"""

import zipfile
from pathlib import Path

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.modules.admin_units.models import AdminUnit, AdminUnitLevel
from app.modules.ingestion.adapters import inec_siniestros
from app.modules.ingestion.canton_indicators import load_indicator_file
from app.modules.ingestion.models import PipelineRun, RunStatus
from app.modules.territory.models import Canton, CantonIndicator

SOURCE_SLUG = "inec-estra"

_CANTON_GEOM = (
    "MULTIPOLYGON(((-79.90 -3.30, -79.90 -3.26, -79.86 -3.26, -79.86 -3.30, -79.90 -3.30)))"
)


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


def _write_zip(path: Path, members: dict[str, str]) -> Path:
    with zipfile.ZipFile(path, "w") as archive:
        for name, content in members.items():
            archive.writestr(name, content.encode("utf-8-sig"))
    return path


# Mirrors the real 2014-2020/2021 header (see the adapter docstring): ANIO
# present, PROVINCIA/CANTON as text names.
LEGACY_WITH_ANIO = (
    "ANIO;MES;DIA;HORA;PROVINCIA;CANTÓN;ZONA;CLASE;CAUSA;NUM_FALLECIDO;NUM_LESIONADO;TOTAL_VICTIMAS\n"
    "2018;ENERO;LUNES;00:00 A 00:59;GUAYAS;GUAYAQUIL;URBANA;CHOQUES;EXCESO VELOCIDAD;0;1;1\n"
    "2019;ENERO;LUNES;00:00 A 00:59;GUAYAS;GUAYAQUIL;URBANA;CHOQUES;EXCESO VELOCIDAD;1;0;1\n"
    "2019;ENERO;LUNES;01:00 A 01:59;GUAYAS;GUAYAQUIL;URBANA;CHOQUES;EXCESO VELOCIDAD;0;2;2\n"
)

# Mirrors the real 2022 file: no ANIO column at all -- year must come from
# the member's own filename.
LEGACY_NO_ANIO = (
    "PROVINCIA;CANTÓN;MES;DIA;HORA;ZONA;CLASE;CAUSA;NUM_FALLECIDO;NUM_LESIONADO;TOTAL_VICTIMAS\n"
    "GUAYAS;GUAYAQUIL;FEBRERO;MARTES;02:00 A 02:59;URBANA;CHOQUES;EXCESO VELOCIDAD;2;0;2\n"
)

# Mirrors the real 2023+ shape: CANTON is already the DPA code.
MODERN_SHAPE = (
    "PROVINCIA;CANTON;MES;DIA;HORA;ZONA;NUM_FALLECIDO;NUM_LESIONADO;TOTAL_VICTIMAS;CLASE;CAUSA\n"
    "9;0901;3;1;5;1;1;0;1;3;3\n"
    "9;0901;3;2;6;1;0;1;1;3;3\n"
)

UNRELATED_MARITIME = "PLACA;TIPO\nABC-123;LANCHA\n"


def test_two_siniestros_members_in_one_zip_are_both_aggregated(db_session, tmp_path):
    """Mirrors the real 2021 zip: a 2014-2020 bundle plus a 2021-only file, side by side."""
    _seed_place(db_session, "0901", "09", "Guayas", "Guayaquil")
    db_session.commit()

    legacy_2021_only = (
        "ANIO;MES;DIA;HORA;PROVINCIA;CANTÓN;ZONA;CLASE;CAUSA;"
        "NUM_FALLECIDO;NUM_LESIONADO;TOTAL_VICTIMAS\n"
        "2021;MARZO;LUNES;03:00 A 03:59;GUAYAS;GUAYAQUIL;URBANA;"
        "CHOQUES;EXCESO VELOCIDAD;0;0;0\n"
    )
    path = _write_zip(
        tmp_path / "inec_estra_2021_anual_datos_abiertos.zip",
        {
            "SINIESTROS/BDD_2014_2020.csv": LEGACY_WITH_ANIO,
            "SINIESTROS/BDD__2021.csv": legacy_2021_only,
            "TRANSPORTE MARITIMO/BDD_2021.csv": UNRELATED_MARITIME,
            "SINIESTROS/DD_2021.ods": "excluded by extension, not content",
        },
    )

    parsed = inec_siniestros.parse(db_session, path)

    assert parsed.unmatched == []
    assert parsed.skipped == {"before_min_year": 1}  # the lone 2018 row
    totals = {(r.indicator, r.year, r.month): r.value for r in parsed.rows}
    assert totals[("siniestros", 2019, 1)] == 2
    assert totals[("siniestros_fallecidos", 2019, 1)] == 1
    assert totals[("siniestros", 2021, 3)] == 1
    assert totals[("siniestros_fallecidos", 2021, 3)] == 0
    # The unrelated maritime CSV must never be counted (it doesn't match "SINIESTROS").
    assert parsed.processed == 3 + 1  # 3 legacy 2014-2020 rows + 1 2021 row


def test_legacy_shape_without_anio_uses_the_member_filename_for_the_year(db_session, tmp_path):
    _seed_place(db_session, "0901", "09", "Guayas", "Guayaquil")
    db_session.commit()

    path = _write_zip(
        tmp_path / "inec_estra_2022_anual_datos_abiertos.zip",
        {"2022_SINIESTROS_TRÁNSITO_BDD.csv": LEGACY_NO_ANIO},
    )

    parsed = inec_siniestros.parse(db_session, path)

    assert parsed.unmatched == []
    totals = {(r.indicator, r.year, r.month): r.value for r in parsed.rows}
    assert totals[("siniestros", 2022, 2)] == 1
    assert totals[("siniestros_fallecidos", 2022, 2)] == 2


def test_modern_shape_uses_the_canton_code_directly(db_session, tmp_path):
    _seed_place(db_session, "0901", "09", "Guayas", "Guayaquil")
    db_session.commit()

    path = _write_zip(
        tmp_path / "inec_estra_2023_anual_datos_abiertos.zip",
        {"2023_BDD_SINIESTROS_TRANSITO.CSV": MODERN_SHAPE},
    )

    parsed = inec_siniestros.parse(db_session, path)

    assert parsed.unmatched == []
    totals = {(r.indicator, r.year, r.month): r.value for r in parsed.rows}
    assert totals[("siniestros", 2023, 3)] == 2
    assert totals[("siniestros_fallecidos", 2023, 3)] == 1


def test_modern_shape_unknown_canton_code_is_reported_not_dropped(db_session, tmp_path):
    # No canton seeded at all: "0901" is unknown to this test's database.
    path = _write_zip(
        tmp_path / "inec_estra_2023_anual_datos_abiertos.zip",
        {"2023_BDD_SINIESTROS_TRANSITO.CSV": MODERN_SHAPE},
    )

    parsed = inec_siniestros.parse(db_session, path)

    assert parsed.rows == []
    assert len(parsed.unmatched) == 2  # one per MODERN_SHAPE data row
    assert all("0901" in line for line in parsed.unmatched)


def test_load_indicator_file_is_idempotent_and_force_reprocesses(db_session, tmp_path):
    _seed_place(db_session, "0901", "09", "Guayas", "Guayaquil")
    db_session.commit()

    path = _write_zip(
        tmp_path / "inec_estra_2023_anual_datos_abiertos.zip",
        {"2023_BDD_SINIESTROS_TRANSITO.CSV": MODERN_SHAPE},
    )

    first = load_indicator_file(db_session, SOURCE_SLUG, path, inec_siniestros.parse)
    assert first.status == RunStatus.SUCCEEDED
    assert first.inserted == 2  # siniestros + siniestros_fallecidos, one bucket each

    second = load_indicator_file(db_session, SOURCE_SLUG, path, inec_siniestros.parse)
    assert second.id == first.id
    assert db_session.scalar(select(func.count()).select_from(PipelineRun)) == 1

    third = load_indicator_file(db_session, SOURCE_SLUG, path, inec_siniestros.parse, force=True)
    assert third.id != first.id
    assert db_session.scalar(select(func.count()).select_from(PipelineRun)) == 2
    assert db_session.scalar(select(func.count()).select_from(CantonIndicator)) == 2
