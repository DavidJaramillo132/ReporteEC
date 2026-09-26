"""Adapter for the Ministerio del Interior "detenidos y aprehendidos" files.

Turns one raw XLSX row into a NormalizedDetention, or raises RowRejected --
copies the pattern set by mdi_homicidios.py. Detentions are police activity,
not insecurity: normalizing into NormalizedDetention (never
NormalizedIncident) keeps them out of the incidents table and the crime map
by construction.
"""

from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

from app.modules.detentions.models import DetentionType
from app.modules.ingestion.records import NormalizedDetention, RowRejected, hash_row

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

TIPO_TO_DETENTION_TYPE = {
    "detenido": DetentionType.DETENIDO,
    "aprehendido": DetentionType.APREHENDIDO,
}


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


def _parse_detention_type(raw: str | None) -> DetentionType:
    detention_type = TIPO_TO_DETENTION_TYPE.get(_clean(raw).lower())
    if detention_type is None:
        raise RowRejected("unknown_type")
    return detention_type


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


def _parse_occurred_at(raw_date: str | None, raw_time: str | None) -> datetime:
    serial = _to_float(raw_date)
    if serial is None:
        raise RowRejected("invalid_date")
    day = EXCEL_EPOCH + timedelta(days=int(serial))

    raw_time = _clean(raw_time)
    hour = minute = 0
    if raw_time and not _is_sentinel(raw_time):
        time_serial = _to_float(raw_time)
        if time_serial is not None and 0 <= time_serial < 1:
            # A handful of files store the time as an Excel fractional day.
            total_minutes = round(time_serial * 24 * 60)
            hour, minute = divmod(total_minutes, 60)
        else:
            parts = raw_time.split(":")
            try:
                hour, minute = int(parts[0]), int(parts[1])
            except (IndexError, ValueError) as exc:
                raise RowRejected("invalid_date") from exc
    # A missing hour is not recorded anywhere else in the source file;
    # midnight local time is the documented default, not a guess at the
    # true time, and keeps an otherwise-valid row instead of discarding it.
    return datetime(day.year, day.month, day.day, hour, minute, tzinfo=GUAYAQUIL)


def _parse_iccs_code(raw: str | None) -> str | None:
    value = _clean(raw)
    return None if _is_sentinel(value) else value


def normalize_row(row: dict[str, str]) -> NormalizedDetention:
    """Turn one raw row into a NormalizedDetention, or raise RowRejected.

    Never reads personal columns (estado_civil, estatus_migratorio, edad,
    sexo, genero, nacionalidad, autoidentificacion_etnica, ...) into the
    result -- only their presence in `row` affects the content hash used for
    `source_record_id`.
    """
    detention_type = _parse_detention_type(row.get("tipo"))
    occurred_at = _parse_occurred_at(
        row.get("fecha_detencion_aprehension"), row.get("hora_detencion_aprehension")
    )
    if occurred_at.year < MIN_YEAR:
        raise RowRejected("before_min_year")
    latitude, longitude = _parse_coordinates(row.get("latitud"), row.get("longitud"))

    return NormalizedDetention(
        source_record_id=hash_row(row),
        detention_type=detention_type,
        iccs_code=_parse_iccs_code(row.get("codigo_iccs")),
        occurred_at=occurred_at,
        latitude=latitude,
        longitude=longitude,
        # The file carries these directly; no name-based lookup needed.
        province_code=_clean(row.get("codigo_provincia")).zfill(2),
        canton_code=_clean(row.get("codigo_canton")).zfill(4),
    )
