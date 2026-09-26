from dataclasses import fields
from datetime import datetime

import pytest

from app.modules.incidents.models import IncidentType
from app.modules.ingestion.adapters.mdi_desaparecidas import normalize_row
from app.modules.ingestion.records import RowRejected, assign_record_ids


def make_row(**overrides: str) -> dict[str, str]:
    """A row as read_rows() returns it, from the 2026 official file.

    Each test changes only the columns it cares about:
    make_row(latitud="SIN DATO")
    """
    row = {
        "fecha_desaparicion": "46265",
        "fecha_denuncia": "46268",
        "fecha_conocimiento": "46269",
        "codigo_provincia": "21",
        "codigo_canton": "2101",
        "latitud": "0,0789636",
        "longitud": "-76,8879267",
        "fecha_localizacion": "NO_APLICA",
        "latitud_localizacion": "NO_APLICA",
        "longitud_localizacion": "NO_APLICA",
        "sexo": "MUJER",
        "nacionalidad": "COLOMBIA",
        "edad": "14",
        "rango_edad": "ADOLESCENTES",
        "etnia": "MESTIZO/A",
    }
    return {**row, **overrides}


def test_type_is_always_desaparecida():
    result = normalize_row(make_row())

    assert result.type == IncidentType.DESAPARECIDA


def test_converts_comma_decimal_coordinates():
    result = normalize_row(make_row())

    assert result.latitude == 0.0789636
    assert result.longitude == -76.8879267


def test_maps_latitud_and_longitud_directly_no_axis_swap():
    result = normalize_row(make_row(latitud="-1,0", longitud="-78,5"))

    assert result.latitude == -1.0
    assert result.longitude == -78.5


def test_parses_excel_serial_disappearance_date_in_america_guayaquil():
    result = normalize_row(make_row(fecha_desaparicion="46265"))

    assert result.occurred_at.isoformat() == "2026-08-31T00:00:00-05:00"


def test_falls_back_to_fecha_denuncia_when_fecha_desaparicion_missing():
    result = normalize_row(make_row(fecha_desaparicion="", fecha_denuncia="46268"))

    assert result.occurred_at.isoformat() == "2026-09-03T00:00:00-05:00"


@pytest.mark.parametrize("sentinel", ["SIN DATO", "SIN_DATO", "NO_APLICA", ""])
def test_sentinel_coordinate_is_rejected(sentinel):
    with pytest.raises(RowRejected) as exc_info:
        normalize_row(make_row(latitud=sentinel, longitud=sentinel))

    assert exc_info.value.reason == "missing_coordinates"


def test_null_island_is_rejected():
    with pytest.raises(RowRejected) as exc_info:
        normalize_row(make_row(latitud="0", longitud="0"))

    assert exc_info.value.reason == "null_island"


def test_coordinates_outside_ecuador_are_rejected():
    with pytest.raises(RowRejected) as exc_info:
        normalize_row(make_row(latitud="40,4", longitud="-3,7"))  # Madrid

    assert exc_info.value.reason == "outside_ecuador"


def test_swapped_coordinates_are_rejected_not_silently_fixed():
    with pytest.raises(RowRejected) as exc_info:
        normalize_row(make_row(latitud="-79,96541", longitud="-3,28012"))

    assert exc_info.value.reason == "swapped_coordinates"


def test_invalid_date_is_rejected():
    with pytest.raises(RowRejected) as exc_info:
        normalize_row(make_row(fecha_desaparicion="SIN DATO", fecha_denuncia="SIN DATO"))

    assert exc_info.value.reason == "invalid_date"


def test_rows_before_min_year_are_rejected_as_before_min_year():
    # Excel serial 40179 is 2010-01-01, well before MIN_YEAR = 2019.
    with pytest.raises(RowRejected) as exc_info:
        normalize_row(make_row(fecha_desaparicion="40179"))

    assert exc_info.value.reason == "before_min_year"


def test_zero_pads_province_and_canton_codes():
    result = normalize_row(make_row(codigo_provincia="7", codigo_canton="701"))

    assert result.province_code == "07"
    assert result.canton_code == "0701"


def test_not_located_when_localizacion_coordinates_are_no_aplica():
    result = normalize_row(
        make_row(
            latitud_localizacion="NO_APLICA",
            longitud_localizacion="NO_APLICA",
            fecha_localizacion="NO_APLICA",
        )
    )

    assert result.located_at is None


def test_located_when_localizacion_coordinates_are_real():
    # fecha_localizacion is the one column in this dataset that is NOT an
    # Excel serial: both the 2026 and the 2017-2025 historical file record
    # it as a plain "YYYY/MM/DD" string.
    result = normalize_row(
        make_row(
            latitud_localizacion="-2,17",
            longitud_localizacion="-79,88",
            fecha_localizacion="2026/09/05",
        )
    )

    assert result.located_at is not None
    assert result.located_at.isoformat() == "2026-09-05T00:00:00-05:00"


def test_located_without_a_recorded_date_falls_back_to_disappearance_date():
    result = normalize_row(
        make_row(
            fecha_desaparicion="46265",
            latitud_localizacion="-2,17",
            longitud_localizacion="-79,88",
            fecha_localizacion="SIN DATO",
        )
    )

    assert result.located_at == result.occurred_at


@pytest.mark.parametrize("situacion", ["ENCONTRADO", "FALLECIDO", "encontrado"])
def test_situacion_actual_alone_marks_a_row_as_located(situacion):
    # The 2017-2025 historical file never backfilled latitud_localizacion/
    # longitud_localizacion for years before 2025, even though most of those
    # rows are already resolved per situacion_actual -- so that field alone
    # must be enough to set located_at.
    result = normalize_row(
        make_row(
            fecha_desaparicion="46265",
            latitud_localizacion="NO_APLICA",
            longitud_localizacion="NO_APLICA",
            fecha_localizacion="NO_APLICA",
            situacion_actual=situacion,
        )
    )

    assert result.located_at == result.occurred_at


def test_situacion_actual_desaparecido_alone_is_not_located():
    result = normalize_row(
        make_row(
            latitud_localizacion="NO_APLICA",
            longitud_localizacion="NO_APLICA",
            fecha_localizacion="NO_APLICA",
            situacion_actual="DESAPARECIDO",
        )
    )

    assert result.located_at is None


def test_falls_back_to_latitud_desaparicion_column_name():
    # The 2017-2025 historical file names the disappearance-location columns
    # "latitud_desaparicion"/"longitud_desaparicion" instead of "latitud"/
    # "longitud"; the two never coexist in one file.
    row = make_row()
    del row["latitud"]
    del row["longitud"]
    row["latitud_desaparicion"] = "-1,05"
    row["longitud_desaparicion"] = "-80,45"

    result = normalize_row(row)

    assert result.latitude == -1.05
    assert result.longitude == -80.45


def test_output_has_no_personal_data_attributes():
    result = normalize_row(make_row())

    field_names = {field.name for field in fields(result)}
    assert field_names.isdisjoint({"sexo", "genero", "edad", "rango_edad", "nacionalidad", "etnia"})


def test_same_row_produces_the_same_source_record_id():
    row = make_row()

    assert normalize_row(row).source_record_id == normalize_row(row).source_record_id


def test_assign_record_ids_disambiguates_identical_rows():
    row = make_row()
    normalized = [normalize_row(row), normalize_row(row)]

    with_ids = assign_record_ids(normalized)

    assert with_ids[0].source_record_id.endswith("-1")
    assert with_ids[1].source_record_id.endswith("-2")


def test_different_cases_get_different_ids():
    younger = normalize_row(make_row(edad="14"))
    older = normalize_row(make_row(edad="45"))

    assert younger.source_record_id != older.source_record_id


def test_occurred_at_is_a_datetime():
    result = normalize_row(make_row())

    assert isinstance(result.occurred_at, datetime)
