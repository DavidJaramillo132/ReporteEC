"""Canton-precision homicide rows: geom filled from the canton's centroid,
or the row rejected when its canton_code has no `cantons` row at all.

See `app.modules.ingestion.adapters.mdi_homicidios.normalize_row` for the
adapter side (accepts a coordinate-less row as long as it carries a canton
code) and `app.modules.ingestion.loader._incident_geom`/
`_drop_unknown_cantons` for the loader side tested here.
"""

import json
from pathlib import Path

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.modules.incidents.models import Incident, LocationPrecision
from app.modules.ingestion.adapters.mdi_homicidios import normalize_row
from app.modules.ingestion.loader import load_file
from app.modules.ingestion.models import RunStatus
from app.modules.territory.models import Canton
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

# A small square around the centroid used below, well within continental Ecuador.
_CANTON_POLYGON = (
    "MULTIPOLYGON(((-79.90 -3.30, -79.90 -3.26, -79.86 -3.26, -79.86 -3.30, -79.90 -3.30)))"
)
_CANTON_CENTROID = "-79.88 -3.28"  # lon lat


def _row(**overrides: str) -> list[str]:
    values = {
        "tipo_muerte": "ASESINATO",
        "codigo_provincia": "07",
        "codigo_canton": "0701",
        "coordenada_y": "SIN DATO",
        "coordenada_x": "SIN DATO",
        "fecha_infraccion": "46023",
        "hora_infraccion": "01:25:00",
    }
    values.update(overrides)
    return [values[column] for column in HEADER]


def _make_canton(session: Session, code: str = "0701", province_code: str = "07") -> Canton:
    canton = Canton(
        code=code,
        province_code=province_code,
        name="Test Canton",
        geom=f"SRID=4326;{_CANTON_POLYGON}",
        centroid=f"SRID=4326;POINT({_CANTON_CENTROID})",
    )
    session.add(canton)
    session.flush()
    return canton


def test_coordinate_less_row_gets_geom_from_canton_centroid(db_session: Session, tmp_path: Path):
    _make_canton(db_session)
    path = write_xlsx(tmp_path / "homicidios.xlsx", HEADER, [_row()])

    run = load_file(db_session, SOURCE_SLUG, path, normalize_row)
    db_session.commit()

    assert run.status == RunStatus.SUCCEEDED
    assert run.inserted == 1
    assert run.errors == 0

    incident = db_session.scalar(select(Incident))
    assert incident.location_precision == LocationPrecision.CANTON
    lon, lat = db_session.execute(select(func.ST_X(incident.geom), func.ST_Y(incident.geom))).one()
    assert (round(lon, 2), round(lat, 2)) == (-79.88, -3.28)


def test_coordinate_less_row_with_unknown_canton_is_rejected(db_session: Session, tmp_path: Path):
    # No Canton row created for "0701": geom has nothing to fall back to.
    path = write_xlsx(tmp_path / "homicidios.xlsx", HEADER, [_row()])

    run = load_file(db_session, SOURCE_SLUG, path, normalize_row)
    db_session.commit()

    assert run.status == RunStatus.SUCCEEDED
    assert run.inserted == 0
    assert run.errors == 1
    detail = json.loads(run.error_detail)
    assert detail["errors"] == {"unknown_canton": 1}
    assert db_session.scalar(select(func.count()).select_from(Incident)) == 0


def test_exact_coordinate_row_is_unaffected_by_canton_lookup(db_session: Session, tmp_path: Path):
    # No Canton row exists at all; a row with real coordinates must still
    # load normally (its geom never depends on the cantons table).
    path = write_xlsx(
        tmp_path / "homicidios.xlsx",
        HEADER,
        [_row(coordenada_y="-3,28012", coordenada_x="-79,96541")],
    )

    run = load_file(db_session, SOURCE_SLUG, path, normalize_row)
    db_session.commit()

    assert run.status == RunStatus.SUCCEEDED
    assert run.inserted == 1
    incident = db_session.scalar(select(Incident))
    assert incident.location_precision == LocationPrecision.EXACTA
