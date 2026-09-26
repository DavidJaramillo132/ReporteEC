"""Adapter for the Ministerio del Interior "personas desaparecidas" files.

Turns one raw XLSX row into a NormalizedIncident (type=DESAPARECIDA), or
raises RowRejected -- copies the pattern set by mdi_homicidios.py. A missing
person who has since been located keeps their row (for statistics) but gets
a `located_at` date; the map_incidents view (Phase 3 migration) is what
actually hides a located row from the map, by checking `located_at IS NULL`.
"""

from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

from app.modules.incidents.models import IncidentType
from app.modules.ingestion.records import NormalizedIncident, RowRejected, hash_row

# Ecuador has never observed daylight saving time, so a fixed UTC-5 offset
# is exact for every row, not an approximation.
GUAYAQUIL = ZoneInfo("America/Guayaquil")

# Excel's day-1900 date system, as used by every official MDI file.
EXCEL_EPOCH = date(1899, 12, 30)

# Bounding boxes (min_lon, max_lon, min_lat, max_lat), ported from
# scripts/exportar_muestra_v1.py: continental territory plus Galápagos.
CONTINENTAL = (-81.1, -75.2, -5.02, 1.45)
GALAPAGOS = (-92.1, -89.2, -1.6, 1.8)

# Only rows from this year on are loaded for V1, same cutoff as homicides.
MIN_YEAR = 2019

_SENTINELS = {"", "SIN DATO", "SIN_DATO", "NO_APLICA", "NO APLICA"}


def _clean(value: str | None) -> str:
    return (value or "").strip()


def _is_sentinel(value: str) -> bool:
    return value.strip().upper() in _SENTINELS


def _to_float(value: str | None) -> float | None:
    value = _clean(value)
    if _is_sentinel(value):
        return None
    try:
        return float(value.replace(",", "."))
    except ValueError:
        return None


def _within(lon: float, lat: float, box: tuple[float, float, float, float]) -> bool:
    min_lon, max_lon, min_lat, max_lat = box
    return min_lon <= lon <= max_lon and min_lat <= lat <= max_lat


def _inside_ecuador(lon: float, lat: float) -> bool:
    return _within(lon, lat, CONTINENTAL) or _within(lon, lat, GALAPAGOS)


def _parse_coordinates(raw_lat: str | None, raw_lon: str | None) -> tuple[float, float]:
    lat, lon = _to_float(raw_lat), _to_float(raw_lon)
    if lat is None or lon is None:
        raise RowRejected("missing_coordinates")
    if lat == 0 and lon == 0:
        raise RowRejected("null_island")
    if _inside_ecuador(lon, lat):
        return lat, lon
    if _inside_ecuador(lat, lon):
        # Valid only with the axes swapped: a data-entry mistake, not a
        # location worth keeping under a silent guess.
        raise RowRejected("swapped_coordinates")
    raise RowRejected("outside_ecuador")


def _excel_date(raw: str | None) -> date | None:
    serial = _to_float(raw)
    if serial is None:
        return None
    return EXCEL_EPOCH + timedelta(days=int(serial))


def _slash_date(raw: str | None) -> date | None:
    """Parse a "YYYY/MM/DD" date, the format `fecha_localizacion` actually uses.

    Every other date column in this dataset (fecha_desaparicion,
    fecha_denuncia, fecha_conocimiento) is an Excel serial like every other
    MDI file; fecha_localizacion is the one exception, confirmed against
    both the 2026 and the 2017-2025 historical file (100% "YYYY/MM/DD",
    never a serial) -- so it gets its own parser instead of `_excel_date`.
    """
    value = _clean(raw)
    if _is_sentinel(value):
        return None
    try:
        return datetime.strptime(value, "%Y/%m/%d").date()
    except ValueError:
        return None


def _parse_disappearance_at(row: dict[str, str]) -> datetime:
    """`fecha_desaparicion`, falling back to `fecha_denuncia` when missing.

    The disappearance date is not always recorded; the filing date is the
    closest documented substitute -- not a guess at the true date, and still
    far more accurate than dropping the row outright. No file inspected so
    far actually needed the fallback, but the source's own data dictionary
    does not guarantee that holds for every future file.
    """
    raw_date = row.get("fecha_desaparicion")
    if _is_sentinel(_clean(raw_date)):
        raw_date = row.get("fecha_denuncia")
    day = _excel_date(raw_date)
    if day is None:
        raise RowRejected("invalid_date")
    # No time-of-day column exists for this dataset; midnight local time is
    # the documented default, not a guess at the true time.
    return datetime(day.year, day.month, day.day, tzinfo=GUAYAQUIL)


# `situacion_actual`'s own case closure, independent of whether the
# coordinate columns were ever backfilled for that row.
_RESOLVED_SITUACIONES = {"ENCONTRADO", "FALLECIDO"}


def _is_located(row: dict[str, str]) -> bool:
    """True once a person is no longer missing.

    Two independent signals exist, and the 2017-2025 historical file shows
    they are NOT interchangeable: `latitud_localizacion`/`longitud_localizacion`
    hold NO_APLICA until located, but that file only ever backfilled them for
    2025 -- every 2019-2024 row is NO_APLICA there even though most are
    already `situacion_actual=ENCONTRADO` (found) or `FALLECIDO` (found
    deceased). Treating either signal as sufficient ("OR", not "AND") is what
    the source data actually requires; on the current file, where both are
    always populated together, they agree in every row and this changes
    nothing.
    """
    raw_lat = _clean(row.get("latitud_localizacion"))
    raw_lon = _clean(row.get("longitud_localizacion"))
    has_coordinates = not (_is_sentinel(raw_lat) or _is_sentinel(raw_lon))
    resolved_by_status = _clean(row.get("situacion_actual")).upper() in _RESOLVED_SITUACIONES
    return has_coordinates or resolved_by_status


def _parse_located_at(row: dict[str, str], disappearance_at: datetime) -> datetime | None:
    """None while still missing; the located date otherwise.

    `fecha_localizacion` is the recorded date once real coordinates exist;
    when it is absent (including every pre-2025 historical row resolved only
    through `situacion_actual`), the disappearance date is the best
    available lower bound, not a guess at the true date.
    """
    if not _is_located(row):
        return None
    day = _slash_date(row.get("fecha_localizacion"))
    if day is None:
        return disappearance_at
    return datetime(day.year, day.month, day.day, tzinfo=GUAYAQUIL)


def normalize_row(row: dict[str, str]) -> NormalizedIncident:
    """Turn one raw row into a NormalizedIncident, or raise RowRejected.

    Never reads personal columns (sexo, nacionalidad, edad, rango_edad,
    etnia, ...) into the result -- only their presence in `row` affects the
    content hash used for `source_record_id`.
    """
    disappearance_at = _parse_disappearance_at(row)
    if disappearance_at.year < MIN_YEAR:
        raise RowRejected("before_min_year")
    # The 2026 file names these "latitud"/"longitud"; the 2017-2025
    # historical file names the same "place of disappearance" columns
    # "latitud_desaparicion"/"longitud_desaparicion" instead. The two never
    # coexist in one file, so this fallback is safe either way.
    raw_lat = row.get("latitud") or row.get("latitud_desaparicion")
    raw_lon = row.get("longitud") or row.get("longitud_desaparicion")
    latitude, longitude = _parse_coordinates(raw_lat, raw_lon)
    located_at = _parse_located_at(row, disappearance_at)

    return NormalizedIncident(
        source_record_id=hash_row(row),
        type=IncidentType.DESAPARECIDA,
        occurred_at=disappearance_at,
        latitude=latitude,
        longitude=longitude,
        # The file carries these directly; no name-based lookup needed.
        province_code=_clean(row.get("codigo_provincia")).zfill(2),
        canton_code=_clean(row.get("codigo_canton")).zfill(4),
        located_at=located_at,
    )
