from dataclasses import fields
from datetime import datetime

import pytest

from app.modules.incidents.models import IncidentType
from app.modules.ingestion.adapters.mdi_homicidios import normalize_row
from app.modules.ingestion.records import RowRejected, assign_record_ids


def make_row(**overrides: str) -> dict[str, str]:
    """A row as read_rows() returns it, from the 2026 official file.

    Each test changes only the columns it cares about:
    make_row(coordenada_y="SIN DATO")
    """
    row = {
        "tipo_muerte": "ASESINATO",
        "codigo_provincia": "07",
        "codigo_canton": "0701",
        "coordenada_y": "-3,28012",
        "coordenada_x": "-79,96541",
        "fecha_infraccion": "46023",
        "hora_infraccion": "01:25:00",
        "etnia": "MESTIZO/A",
    }
    return {**row, **overrides}


def test_converts_comma_decimal_coordinates():
    result = normalize_row(make_row())

    assert result.latitude == -3.28012
    assert result.longitude == -79.96541


def test_maps_coordenada_y_to_latitude_and_coordenada_x_to_longitude():
    result = normalize_row(make_row(coordenada_y="-1,0", coordenada_x="-78,5"))

    assert result.latitude == -1.0
    assert result.longitude == -78.5


def test_parses_excel_serial_date_and_hour_in_america_guayaquil():
    result = normalize_row(make_row(fecha_infraccion="46023", hora_infraccion="01:25:00"))

    assert result.occurred_at == datetime(2026, 1, 1, 1, 25, tzinfo=result.occurred_at.tzinfo)
    # -05:00 all year round: Ecuador never observes daylight saving time.
    assert result.occurred_at.isoformat() == "2026-01-01T01:25:00-05:00"


def test_missing_hour_defaults_to_midnight_local_time():
    result = normalize_row(make_row(hora_infraccion=""))

    assert result.occurred_at.isoformat() == "2026-01-01T00:00:00-05:00"


@pytest.mark.parametrize(
    "tipo_muerte,expected",
    [
        ("ASESINATO", IncidentType.HOMICIDIO),
        ("HOMICIDIO", IncidentType.HOMICIDIO),
        ("SICARIATO", IncidentType.SICARIATO),
        ("FEMICIDIO", IncidentType.FEMICIDIO),
    ],
)
def test_maps_tipo_muerte_to_incident_type(tipo_muerte, expected):
    result = normalize_row(make_row(tipo_muerte=tipo_muerte))

    assert result.type == expected


def test_unknown_tipo_muerte_is_rejected():
    with pytest.raises(RowRejected) as exc_info:
        normalize_row(make_row(tipo_muerte="ROBO"))

    assert exc_info.value.reason == "unknown_type"


@pytest.mark.parametrize("sentinel", ["SIN DATO", "SIN_DATO", "NO_APLICA", ""])
def test_sentinel_coordinate_is_rejected(sentinel):
    with pytest.raises(RowRejected) as exc_info:
        normalize_row(make_row(coordenada_y=sentinel))

    assert exc_info.value.reason == "missing_coordinates"


def test_null_island_is_rejected():
    with pytest.raises(RowRejected) as exc_info:
        normalize_row(make_row(coordenada_y="0", coordenada_x="0"))

    assert exc_info.value.reason == "null_island"


def test_coordinates_outside_ecuador_are_rejected():
    with pytest.raises(RowRejected) as exc_info:
        normalize_row(make_row(coordenada_y="40,4", coordenada_x="-3,7"))  # Madrid

    assert exc_info.value.reason == "outside_ecuador"


def test_swapped_coordinates_are_rejected_not_silently_fixed():
    # Valid Ecuador point is (-3.28012, -79.96541); swapped puts lat where
    # lon should be and vice-versa, which only lands inside Ecuador by luck
    # of the swap -- so it must be rejected, not corrected.
    with pytest.raises(RowRejected) as exc_info:
        normalize_row(make_row(coordenada_y="-79,96541", coordenada_x="-3,28012"))

    assert exc_info.value.reason == "swapped_coordinates"


def test_galapagos_coordinates_are_accepted():
    result = normalize_row(make_row(coordenada_y="-0,74", coordenada_x="-90,3"))

    assert result.latitude == -0.74
    assert result.longitude == -90.3


def test_invalid_date_is_rejected():
    with pytest.raises(RowRejected) as exc_info:
        normalize_row(make_row(fecha_infraccion="SIN DATO"))

    assert exc_info.value.reason == "invalid_date"


def test_rows_before_min_year_are_rejected_as_before_min_year():
    # Excel serial 40179 is 2010-01-01, well before MIN_YEAR = 2019.
    with pytest.raises(RowRejected) as exc_info:
        normalize_row(make_row(fecha_infraccion="40179"))

    assert exc_info.value.reason == "before_min_year"


def test_zero_pads_province_and_canton_codes():
    result = normalize_row(make_row(codigo_provincia="7", codigo_canton="701"))

    assert result.province_code == "07"
    assert result.canton_code == "0701"


def test_output_has_no_personal_data_attributes():
    result = normalize_row(make_row(etnia="MESTIZO/A"))

    field_names = {field.name for field in fields(result)}
    assert field_names.isdisjoint(
        {"etnia", "sexo", "genero", "edad", "nacionalidad", "estado_civil"}
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
    assert with_ids[0].source_record_id != with_ids[1].source_record_id
    # Same content hash prefix, only the ordinal suffix differs.
    assert (
        with_ids[0].source_record_id.rsplit("-", 1)[0]
        == with_ids[1].source_record_id.rsplit("-", 1)[0]
    )


def test_assign_record_ids_is_deterministic_across_reruns():
    row = make_row()
    first_run = assign_record_ids([normalize_row(row), normalize_row(row)])
    second_run = assign_record_ids([normalize_row(row), normalize_row(row)])

    assert [r.source_record_id for r in first_run] == [r.source_record_id for r in second_run]


def test_different_victims_get_different_ids():
    # Two rows differing only in a personal field (age) must not collapse
    # into the same record: the field is part of the hashed content even
    # though it never appears on the output.
    younger = normalize_row(make_row(edad="19"))
    older = normalize_row(make_row(edad="45"))

    assert younger.source_record_id != older.source_record_id
