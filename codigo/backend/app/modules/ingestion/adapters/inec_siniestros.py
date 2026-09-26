"""Adapter for INEC's ESTRA (Estadisticas de Transporte) traffic-crash files.

Each `--file` is one of INEC's yearly-or-quarterly zip bundles (see the
CLI's `siniestros` subcommand); this module opens it, finds the traffic-crash
CSV entry/entries inside (never the unrelated maritime/vehicle-registration/
air-transport/railway CSVs the same zip ships, and never a `.ods`
methodology file), and aggregates two indicators per (canton_code, year,
month): `siniestros` (row count) and `siniestros_fallecidos` (sum of
`NUM_FALLECIDO`).

Two incompatible CSV shapes exist across the files this feature loads
(confirmed by direct inspection of every file as of 2026-09-26):

- "Legacy text" (2014-2020 bundle, 2021, 2022): `;`-separated, `PROVINCIA`/
  `CANTON` as upper-case TEXT names, matched to a DPA code the same way the
  OECO adapter matches its rows (`resolve_canton_code`). Some files carry an
  `ANIO` column (2014-2020 bundle, 2021); the 2022 file does not, so its year
  is taken from its own zip-member filename instead (every file name this
  adapter has ever seen carries a 4-digit year in it).
- "Modern numeric" (2023 annual onward): also `;`-separated (quoted or not --
  `csv.DictReader` handles either), but `CANTON` is already the 4-digit DPA
  code the `cantons` table uses, so no name matching is needed at all; just
  validate the code is a known canton.

Which shape a member uses is detected per-file, from its own first data
row's `PROVINCIA` value (a bare digit string in the modern shape, a name in
the legacy one) -- never assumed from which zip filename it came from, since
`--file` is a path the caller chooses freely.

The one exception the "one file per calendar year" rule needs is 2021's zip,
which bundles the 2014-2020 historical file *and* the current 2021 file
side by side; both are processed here (see `_siniestros_members`), and the
2014-2020 file's own `ANIO` column naturally restricts what actually gets
aggregated to 2019-2020 (see `MIN_YEAR`) without any special-casing.
"""

from __future__ import annotations

import csv
import io
import re
import zipfile
from collections import defaultdict
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.modules.ingestion.adapters.oeco_extorsion import CANTON_ALIASES as _OECO_CANTON_ALIASES
from app.modules.ingestion.adapters.oeco_extorsion import PROVINCE_ALIASES
from app.modules.ingestion.canton_indicators import (
    SPANISH_MONTHS,
    IndicatorRow,
    ParsedIndicatorFile,
    build_canton_matcher,
    resolve_canton_code,
)
from app.modules.territory.models import Canton, Indicator

INDICATOR_COUNT = Indicator.SINIESTROS.value
INDICATOR_FALLECIDOS = Indicator.SINIESTROS_FALLECIDOS.value

# Only rows from this year on are in scope for the product (matches
# `app.modules.ingestion.adapters.mdi_homicidios.MIN_YEAR`); the 2014-2020
# bundle inside the 2021 zip goes back further than that.
MIN_YEAR = 2019

# On top of the OECO alias dict (reused verbatim: the same two files' names
# feed both sources), these extra legacy-shape spellings/duplicated-province-
# as-canton-name cases were confirmed by hand against the live cantons table.
CANTON_ALIASES: dict[str, str] = {
    **_OECO_CANTON_ALIASES,
    "BOLIVAR (CARCHI)": "BOLIVAR",
    "OLMEDO (LOJA)": "OLMEDO",
    "BOLIVAR (MANABI)": "BOLIVAR",
    "OLMEDO (MANABI)": "OLMEDO",
    "ORELLANA": "FRANCISCO DE ORELLANA",
}

_YEAR_IN_NAME_RE = re.compile(r"20\d{2}")


def _year_from_name(name: str) -> int | None:
    match = _YEAR_IN_NAME_RE.search(name)
    return int(match.group()) if match else None


def _siniestros_members(archive: zipfile.ZipFile) -> list[str]:
    """Every traffic-crash CSV entry in `archive` -- one, except the 2021 zip's two.

    Matched on the unaccented, upper-cased substring "SINIESTROS": some zip
    member names carry a mangled (non-UTF-8-flagged) accented "TRANSITO", so
    matching on the accented full word is not reliable, but every file's name
    -- 2014-2026 alike -- always contains the plain "SINIESTROS" segment.
    `.ods` methodology/dictionary files (`_DD_`, `_PM_`) match too and are
    excluded explicitly; nothing else in these zips ever matches.
    """
    return [
        name
        for name in archive.namelist()
        if not name.endswith("/")
        and "SINIESTROS" in name.upper()
        and not name.upper().endswith(".ODS")
    ]


def _parse_member(
    archive: zipfile.ZipFile,
    member: str,
    matcher,
    known_cantons: set[str],
) -> tuple[dict[tuple[str, str, int, int], int], list[str], int, dict[str, int]]:
    totals: dict[tuple[str, str, int, int], int] = defaultdict(int)
    unmatched: list[str] = []
    skipped: dict[str, int] = defaultdict(int)
    processed = 0

    with archive.open(member) as raw:
        text_stream = io.TextIOWrapper(raw, encoding="utf-8-sig", newline="")
        reader = csv.DictReader(text_stream, delimiter=";")
        shape_numeric: bool | None = None

        for row in reader:
            processed += 1
            province_raw = (row.get("PROVINCIA") or "").strip()
            if shape_numeric is None:
                shape_numeric = province_raw.isdigit()

            year_raw = (row.get("ANIO") or "").strip()
            year = (
                int(year_raw)
                if year_raw
                else (_year_from_name(member) or _year_from_name(archive.filename or ""))
            )
            if year is None:
                skipped["missing_year"] += 1
                continue
            if year < MIN_YEAR:
                skipped["before_min_year"] += 1
                continue

            canton_raw = (row.get("CANTÓN") or row.get("CANTON") or "").strip()
            if shape_numeric:
                canton_code = canton_raw.zfill(4)
                if canton_code not in known_cantons:
                    unmatched.append(f"unknown canton code {canton_code!r} (row {processed})")
                    continue
            else:
                canton_code = resolve_canton_code(
                    matcher,
                    province_raw,
                    canton_raw,
                    province_aliases=PROVINCE_ALIASES,
                    canton_aliases=CANTON_ALIASES,
                )
                if canton_code is None:
                    unmatched.append(f"{province_raw} / {canton_raw}")
                    continue

            month_raw = (row.get("MES") or "").strip()
            if shape_numeric:
                try:
                    month = int(month_raw)
                except ValueError:
                    unmatched.append(f"unknown month {month_raw!r} (row {processed})")
                    continue
            else:
                month = SPANISH_MONTHS.get(month_raw.lower())
                if month is None:
                    unmatched.append(f"unknown month {month_raw!r} (row {processed})")
                    continue

            fallecidos_raw = (row.get("NUM_FALLECIDO") or "0").strip()
            fallecidos = int(fallecidos_raw) if fallecidos_raw else 0

            totals[(INDICATOR_COUNT, canton_code, year, month)] += 1
            totals[(INDICATOR_FALLECIDOS, canton_code, year, month)] += fallecidos

    return totals, unmatched, processed, dict(skipped)


def parse(session: Session, path: str | Path) -> ParsedIndicatorFile:
    matcher = build_canton_matcher(session)
    known_cantons = set(session.scalars(select(Canton.code)))

    totals: dict[tuple[str, str, int, int], int] = defaultdict(int)
    unmatched: list[str] = []
    skipped: dict[str, int] = defaultdict(int)
    processed = 0

    with zipfile.ZipFile(path) as archive:
        members = _siniestros_members(archive)
        if not members:
            raise ValueError(f"{path}: no SINIESTROS csv entry found in {archive.namelist()}")
        for member in members:
            member_totals, member_unmatched, member_processed, member_skipped = _parse_member(
                archive, member, matcher, known_cantons
            )
            for key, value in member_totals.items():
                totals[key] += value
            unmatched.extend(member_unmatched)
            processed += member_processed
            for reason, count in member_skipped.items():
                skipped[reason] += count

    rows = [
        IndicatorRow(indicator=key[0], canton_code=key[1], year=key[2], month=key[3], value=value)
        for key, value in totals.items()
    ]
    return ParsedIndicatorFile(
        rows=rows, processed=processed, unmatched=unmatched, skipped=dict(skipped)
    )
