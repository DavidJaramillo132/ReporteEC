"""Adapter for the OECO "Noticias de Delito relacionados a Crimen Organizado" CSV.

Aggregates `d_DELITO == "Extorsión"` rows into `canton_indicators` under
indicator `extorsion` (summed over both `d_TIPO_DELITO` values, "Consumado"
and "Tentativa"), keyed by (canton_code, year, month). `d_DELITO ==
"Secuestro Extorsivo"` is aggregated too, under `secuestro_extorsivo`: the
same file, the same per-row work, so keeping it costs nothing -- it just
is not one of the indicators `app.modules.canton_indicators`'s API exposes
yet (see `app.modules.territory.models.Indicator`).

Every (province, canton) name pair in the file is expected to resolve to a
real canton via `app.modules.ingestion.canton_indicators.build_canton_matcher`
plus the alias dicts below (confirmed against the live `admin_units`/
`cantons` tables for the full 2019-2025 file: 223 distinct pairs, 0
unmatched). A row that still fails to match is never silently dropped: it is
recorded in `ParsedIndicatorFile.unmatched` for the CLI to print and a test
to assert against.
"""

from __future__ import annotations

import csv
from collections import defaultdict
from pathlib import Path

from sqlalchemy.orm import Session

from app.modules.ingestion.canton_indicators import (
    SPANISH_MONTHS,
    IndicatorRow,
    ParsedIndicatorFile,
    build_canton_matcher,
    resolve_canton_code,
)
from app.modules.territory.models import Indicator

DELITO_TO_INDICATOR = {
    "Extorsión": Indicator.EXTORSION.value,
    "Secuestro Extorsivo": Indicator.SECUESTRO_EXTORSIVO.value,
}

# "Santo Domingo de los Tsáchilas" (the file's full province name) -> the
# admin_units DPA-abbreviated form. Confirmed by hand against the live
# admin_units table as of 2026-09-26.
PROVINCE_ALIASES: dict[str, str] = {
    "SANTO DOMINGO DE LOS TSACHILAS": "STO DGO DE LOS TSACHILAS",
}

# d_CANTON_INCIDENTE spelling/alternate-name -> admin_units/cantons canton
# name, both normalized. Confirmed by hand against the live cantons table as
# of 2026-09-26 (see the module docstring above for the verified match rate).
CANTON_ALIASES: dict[str, str] = {
    "ECHANDIA": "ECHEANDIA",
    "SAN JOSE DE CHIMBO": "CHIMBO",
    "SAN MIGUEL DE SALCEDO": "SALCEDO",
    "RIO VERDE": "RIOVERDE",
    "ALFREDO BAQUERIZO MORENO": "ALFREDO BAQUERIZO MORENO (JUJAN)",
    "PUEBLO VIEJO": "PUEBLOVIEJO",
    "SAN JACINTO DE BUENA FE": "BUENA FE",
    "CALCETA": "BOLIVAR",
    "SANTIAGO DE MENDEZ": "SANTIAGO",
    "PUERTO FRANCISCO DE ORELLANA": "FRANCISCO DE ORELLANA",
    "PUERTO EL CARMEN DE PUTUMAYO": "PUTUMAYO",
}


def parse(session: Session, path: str | Path) -> ParsedIndicatorFile:
    matcher = build_canton_matcher(session)
    totals: dict[tuple[str, str, int, int], int] = defaultdict(int)
    unmatched: list[str] = []
    processed = 0

    with Path(path).open(encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        for row in reader:
            processed += 1
            indicator = DELITO_TO_INDICATOR.get((row.get("d_DELITO") or "").strip())
            if indicator is None:
                continue

            year = int((row.get("d_ANIO_PS") or "").strip())
            month = SPANISH_MONTHS.get((row.get("d_mes") or "").strip().lower())
            if month is None:
                unmatched.append(f"unknown month {row.get('d_mes')!r} (row {processed})")
                continue

            canton_code = resolve_canton_code(
                matcher,
                row.get("d_PROVINCIA_INCIDENTE") or "",
                row.get("d_CANTON_INCIDENTE") or "",
                province_aliases=PROVINCE_ALIASES,
                canton_aliases=CANTON_ALIASES,
            )
            if canton_code is None:
                unmatched.append(
                    f"{row.get('d_PROVINCIA_INCIDENTE')} / {row.get('d_CANTON_INCIDENTE')}"
                )
                continue

            value = int((row.get("d_total") or "0").strip() or 0)
            totals[(indicator, canton_code, year, month)] += value

    rows = [
        IndicatorRow(indicator=key[0], canton_code=key[1], year=key[2], month=key[3], value=value)
        for key, value in totals.items()
    ]
    return ParsedIndicatorFile(rows=rows, processed=processed, unmatched=unmatched)
