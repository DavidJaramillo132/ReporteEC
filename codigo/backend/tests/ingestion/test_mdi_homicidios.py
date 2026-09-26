import pytest

try:
    from app.modules.ingestion.adapters.mdi_homicidios import normalize_row
except ImportError:
    # Until the Phase 2 adapter lands.
    pytest.skip("mdi_homicidios adapter not implemented yet", allow_module_level=True)


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
