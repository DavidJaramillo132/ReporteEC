"""Adapter for the Ministerio del Interior "homicidios intencionales" files.

Turns one raw XLSX row (as `readers.xlsx.read_rows` yields it) into a
NormalizedIncident, or raises RowRejected when the row cannot be located,
dated or classified. This is the first ingestion adapter and sets the
pattern the others (missing persons, detentions) copy.
"""

from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

from app.modules.incidents.models import IncidentType, LocationPrecision
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

# Only rows from this year on are loaded for V1; the 2014-2025 historical
# file goes back much further than the product currently needs.
MIN_YEAR = 2019

_SENTINELS = {"", "SIN DATO", "SIN_DATO", "NO_APLICA", "NO APLICA"}

# "asesinato" is the file's own umbrella term for what the product calls
# "homicidio"; sicariato and femicidio are recorded as distinct causes.
TIPO_MUERTE_TO_INCIDENT_TYPE = {
    "homicidio": IncidentType.HOMICIDIO,
    "asesinato": IncidentType.HOMICIDIO,
    "sicariato": IncidentType.SICARIATO,
    "femicidio": IncidentType.FEMICIDIO,
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


def _parse_incident_type(raw: str | None) -> IncidentType:
    incident_type = TIPO_MUERTE_TO_INCIDENT_TYPE.get(_clean(raw).lower())
    if incident_type is None:
        raise RowRejected("unknown_type")
    return incident_type


class _CoordinatesMissing(Exception):
    """Raised only for a row with no usable lat/lon at all (blank or 0,0).

    Distinct from every other `RowRejected` reason: `normalize_row` catches
    this one and, when the row still carries a canton code, keeps it as a
    canton-precision record instead of rejecting it outright. `reason`
    preserves the original ("missing_coordinates" or "null_island") for the
    row that turns out to have no canton either and is rejected after all.
    """

    def __init__(self, reason: str) -> None:
        super().__init__(reason)
        self.reason = reason


def _parse_coordinates(raw_lat: str | None, raw_lon: str | None) -> tuple[float, float]:
    lat, lon = _to_float(raw_lat), _to_float(raw_lon)
    if lat is None or lon is None:
        raise _CoordinatesMissing("missing_coordinates")
    if lat == 0 and lon == 0:
        raise _CoordinatesMissing("null_island")
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


def normalize_row(row: dict[str, str]) -> NormalizedIncident:
    """Turn one raw row into a NormalizedIncident, or raise RowRejected.

    Never reads personal columns (age, sex, ethnicity, nationality, ...)
    into the result -- only their presence in `row` affects the content
    hash used for `source_record_id`.

    A row with no usable coordinate (blank, or the literal 0,0 "null
    island") is not rejected outright: as long as it carries a canton code,
    it is kept with `location_precision=CANTON` and `latitude`/`longitude`
    left as None. This adapter has no database access, so it cannot confirm
    that code actually exists in `cantons` -- the loader does that and
    fills `geom` from the canton's centroid, rejecting the row only then if
    the code turns out unknown.
    """
    incident_type = _parse_incident_type(row.get("tipo_muerte"))
    occurred_at = _parse_occurred_at(row.get("fecha_infraccion"), row.get("hora_infraccion"))
    if occurred_at.year < MIN_YEAR:
        raise RowRejected("before_min_year")
    # Files may drop leading zeros ("7", "701"); DPA codes need them back.
    province_code = _clean(row.get("codigo_provincia")).zfill(2)
    canton_code = _clean(row.get("codigo_canton")).zfill(4)

    try:
        latitude, longitude = _parse_coordinates(row.get("coordenada_y"), row.get("coordenada_x"))
        location_precision = LocationPrecision.EXACTA
    except _CoordinatesMissing as exc:
        if not canton_code.strip("0"):
            raise RowRejected(exc.reason) from None
        latitude = longitude = None
        location_precision = LocationPrecision.CANTON

    return NormalizedIncident(
        source_record_id=hash_row(row),
        type=incident_type,
        occurred_at=occurred_at,
        latitude=latitude,
        longitude=longitude,
        province_code=province_code,
        canton_code=canton_code,
        location_precision=location_precision,
    )
