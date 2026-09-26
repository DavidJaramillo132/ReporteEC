"""Populate `admin_units` (province/canton code -> name) from raw source rows.

Ingestion adapters normalize away every column except codes (see
`NormalizedIncident`), so this reads the *raw* rows the way `read_rows`
yields them, straight from the loader before it decides whether the file is
new or already loaded. That is what lets re-running an already-loaded file
still backfill names, without a separate backfill command.
"""

from collections.abc import Iterable

from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.modules.admin_units.models import AdminUnit, AdminUnitLevel

# Small connector words a Spanish place name keeps lowercase, except as its
# first word (e.g. "Los Ríos", but "Sevilla de Oro").
_LOWERCASE_WORDS = {"de", "del", "la", "las", "los", "y"}


def _title_case_es(name: str) -> str:
    words = name.strip().lower().split()
    return " ".join(
        word if word in _LOWERCASE_WORDS and index > 0 else word.capitalize()
        for index, word in enumerate(words)
    )


def _upsert(session: Session, values: list[dict[str, object]]) -> None:
    if not values:
        return
    statement = insert(AdminUnit).values(values)
    statement = statement.on_conflict_do_update(
        index_elements=[AdminUnit.code],
        set_={"name": statement.excluded.name, "province_code": statement.excluded.province_code},
    )
    session.execute(statement)


def upsert_admin_units(session: Session, rows: Iterable[dict[str, str]]) -> None:
    """Upsert every distinct (code -> name) pair found in `rows`.

    Rows without `codigo_provincia`/`provincia`/`codigo_canton`/`canton`
    columns -- a future source with a different layout -- contribute
    nothing: this is a best-effort name lookup, never a requirement for
    loading incidents.
    """
    provinces: dict[str, str] = {}
    cantons: dict[str, tuple[str, str | None]] = {}

    for row in rows:
        province_code = (row.get("codigo_provincia") or "").strip().zfill(2)
        province_name = (row.get("provincia") or "").strip()
        canton_code = (row.get("codigo_canton") or "").strip().zfill(4)
        canton_name = (row.get("canton") or "").strip()

        if province_code.strip("0") and province_name:
            provinces[province_code] = _title_case_es(province_name)
        if canton_code.strip("0") and canton_name:
            cantons[canton_code] = (_title_case_es(canton_name), province_code or None)

    # Provinces first: cantons' `province_code` foreign key must resolve.
    _upsert(
        session,
        [
            {"code": code, "level": AdminUnitLevel.PROVINCE, "name": name, "province_code": None}
            for code, name in provinces.items()
        ],
    )
    _upsert(
        session,
        [
            {
                "code": code,
                "level": AdminUnitLevel.CANTON,
                "name": name,
                "province_code": province_code,
            }
            for code, (name, province_code) in cantons.items()
        ],
    )
