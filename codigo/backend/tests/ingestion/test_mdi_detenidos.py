from dataclasses import fields

import pytest

from app.modules.detentions.models import DetentionType
from app.modules.ingestion.adapters.mdi_detenidos import normalize_row
from app.modules.ingestion.records import RowRejected, assign_record_ids


def make_row(**overrides: str) -> dict[str, str]:
    """A row as read_rows() returns it, from the 2026 official file.

    Each test changes only the columns it cares about:
    make_row(latitud="SIN DATO")
    """
    row = {
        "codigo_iccs": "060124.01",
        "tipo": "DETENIDO",
        "fecha_detencion_aprehension": "46051",
        "hora_detencion_aprehension": "17:00:00",
        "codigo_provincia": "14",
        "codigo_canton": "1401",
        "latitud": "-2,293860393",
        "longitud": "-78,098404595",
        "estado_civil": "SOLTERO/A",
        "estatus_migratorio": "NO_APLICA",
        "edad": "66",
        "sexo": "HOMBRE",
        "genero": "MASCULINO",
        "nacionalidad": "ECUATORIANO",
        "autoidentificacion_etnica": "SHUAR",
    }
    return {**row, **overrides}


@pytest.mark.parametrize(
    "tipo,expected",
    [
        ("DETENIDO", DetentionType.DETENIDO),
        ("detenido", DetentionType.DETENIDO),
        ("APREHENDIDO", DetentionType.APREHENDIDO),
    ],
)
def test_maps_tipo_to_detention_type(tipo, expected):
    result = normalize_row(make_row(tipo=tipo))

    assert result.detention_type == expected


def test_unknown_tipo_is_rejected():
    with pytest.raises(RowRejected) as exc_info:
        normalize_row(make_row(tipo="ROBO"))

    assert exc_info.value.reason == "unknown_type"


def test_converts_comma_decimal_coordinates():
    result = normalize_row(make_row())

    assert result.latitude == -2.293860393
    assert result.longitude == -78.098404595


def test_parses_excel_serial_date_and_hour_in_america_guayaquil():
    result = normalize_row(
        make_row(fecha_detencion_aprehension="46051", hora_detencion_aprehension="17:00:00")
    )

    assert result.occurred_at.isoformat() == "2026-01-29T17:00:00-05:00"


def test_missing_hour_defaults_to_midnight_local_time():
    result = normalize_row(make_row(hora_detencion_aprehension=""))

    assert result.occurred_at.isoformat() == "2026-01-29T00:00:00-05:00"


def test_keeps_iccs_code_when_present():
    result = normalize_row(make_row(codigo_iccs="060124.01"))

    assert result.iccs_code == "060124.01"


@pytest.mark.parametrize("sentinel", ["SIN_DATO", "SIN DATO", "NO_APLICA", ""])
def test_iccs_code_sentinel_becomes_none(sentinel):
    result = normalize_row(make_row(codigo_iccs=sentinel))

    assert result.iccs_code is None


@pytest.mark.parametrize("sentinel", ["SIN DATO", "SIN_DATO", "NO_APLICA", ""])
def test_sentinel_coordinate_is_rejected(sentinel):
    with pytest.raises(RowRejected) as exc_info:
        normalize_row(make_row(latitud=sentinel))

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
        normalize_row(make_row(fecha_detencion_aprehension="SIN DATO"))

    assert exc_info.value.reason == "invalid_date"


def test_rows_before_min_year_are_rejected_as_before_min_year():
    # Excel serial 40179 is 2010-01-01, well before MIN_YEAR = 2019.
    with pytest.raises(RowRejected) as exc_info:
        normalize_row(make_row(fecha_detencion_aprehension="40179"))

    assert exc_info.value.reason == "before_min_year"


def test_zero_pads_province_and_canton_codes():
    result = normalize_row(make_row(codigo_provincia="7", codigo_canton="701"))

    assert result.province_code == "07"
    assert result.canton_code == "0701"


def test_output_has_no_personal_data_attributes():
    result = normalize_row(make_row())

    field_names = {field.name for field in fields(result)}
    assert field_names.isdisjoint(
        {
            "estado_civil",
            "estatus_migratorio",
            "edad",
            "sexo",
            "genero",
            "nacionalidad",
            "autoidentificacion_etnica",
        }
    )


def test_same_row_produces_the_same_source_record_id():
    row = make_row()

    assert normalize_row(row).source_record_id == normalize_row(row).source_record_id


def test_assign_record_ids_disambiguates_identical_rows():
    row = make_row()
    normalized = [normalize_row(row), normalize_row(row)]

    with_ids = assign_record_ids(normalized)

    assert with_ids[0].source_record_id.endswith("-1")
    assert with_ids[1].source_record_id.endswith("-2")


def test_different_detainees_get_different_ids():
    younger = normalize_row(make_row(edad="19"))
    older = normalize_row(make_row(edad="66"))

    assert younger.source_record_id != older.source_record_id
