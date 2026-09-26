"""Load a canton-indicator source file end-to-end into `canton_indicators`.

Unlike `app.modules.ingestion.loader` (one row per source record, deduped by
`ON CONFLICT DO NOTHING`), a canton-indicator source is *aggregated*: one row
per (indicator, canton_code, year, month), computed by summing every raw
source row that falls into that bucket. Re-running the same file (`--force`)
must reproduce the exact same aggregate, so the upsert here is
`ON CONFLICT DO UPDATE SET value = excluded.value` -- replace, never add.

Mirrors `load_file`'s shape (hash -> ensure_source -> parse -> skip-check ->
create RUNNING run -> process -> update counters -> commit -> return run; on
exception mark FAILED with error_detail and re-raise), but the "process" step
is adapter-specific (`parse`), since OECO and INEC ESTRA have nothing in
common but their destination table.
"""

from __future__ import annotations

import hashlib
import json
import logging
import unicodedata
from collections.abc import Callable, Sequence
from dataclasses import dataclass, field
from pathlib import Path

from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.modules.admin_units.models import AdminUnit, AdminUnitLevel
from app.modules.ingestion.models import PipelineRun, RunStatus
from app.modules.ingestion.sources import ensure_source
from app.modules.territory.models import Canton, CantonIndicator

logger = logging.getLogger(__name__)

# Reused by both adapters (OECO's `d_mes` is title-case, INEC's `MES` is
# uppercase) -- lookup is always done against `.strip().lower()`.
SPANISH_MONTHS: dict[str, int] = {
    "enero": 1,
    "febrero": 2,
    "marzo": 3,
    "abril": 4,
    "mayo": 5,
    "junio": 6,
    "julio": 7,
    "agosto": 8,
    "septiembre": 9,
    "octubre": 10,
    "noviembre": 11,
    "diciembre": 12,
}


def normalize_name(name: str) -> str:
    """Accent/case/whitespace-insensitive key for matching a place name.

    Same normalization as `app.modules.ingestion.territory._normalize_name`
    (NFKD-decompose, strip combining marks, collapse whitespace, upper-case),
    reimplemented here rather than imported: that function is private to the
    cantons/population loader, and this module has no other dependency on it.
    """
    decomposed = unicodedata.normalize("NFKD", name)
    ascii_only = "".join(char for char in decomposed if not unicodedata.combining(char))
    return " ".join(ascii_only.split()).strip().upper()


CantonMatcher = dict[str, dict[str, str]]


def build_canton_matcher(session: Session) -> CantonMatcher:
    """{normalized_province_name: {normalized_canton_name: canton_code}}.

    Built from `cantons` (the DPA-code source of truth carrying
    `province_code`) joined to `admin_units` provinces (the only place a
    province's *name* lives) -- never from `admin_units` canton names, which
    would need their own separate join back to a DPA code.
    """
    province_names = {
        unit.code: normalize_name(unit.name)
        for unit in session.scalars(
            select(AdminUnit).where(AdminUnit.level == AdminUnitLevel.PROVINCE)
        )
    }
    matcher: CantonMatcher = {}
    for canton in session.scalars(select(Canton)):
        province_name = province_names.get(canton.province_code or "")
        if province_name is None:
            continue
        matcher.setdefault(province_name, {})[normalize_name(canton.name)] = canton.code
    return matcher


def resolve_canton_code(
    matcher: CantonMatcher,
    province_raw: str,
    canton_raw: str,
    *,
    province_aliases: dict[str, str],
    canton_aliases: dict[str, str],
) -> str | None:
    """DPA canton code for one (province name, canton name) source pair, or None."""
    province_key = normalize_name(province_raw)
    province_key = province_aliases.get(province_key, province_key)
    cantons = matcher.get(province_key)
    if cantons is None:
        return None
    canton_key = normalize_name(canton_raw)
    canton_key = canton_aliases.get(canton_key, canton_key)
    return cantons.get(canton_key)


@dataclass(frozen=True, slots=True)
class IndicatorRow:
    """One aggregated (indicator, canton, year, month) bucket ready to upsert."""

    indicator: str
    canton_code: str
    year: int
    month: int | None
    value: int


@dataclass(slots=True)
class ParsedIndicatorFile:
    """What one adapter's `parse(session, path)` hands back to `load_indicator_file`.

    `processed` is every raw source row read (matching or not, in scope or
    not) -- the same meaning `PipelineRun.processed` has elsewhere. `unmatched`
    lists every row whose place name (or canton code) could not be resolved,
    verbatim, for the CLI to print -- never silently dropped. `skipped` tallies
    rows excluded by an intentional filter (e.g. "before_min_year"), the same
    way `loader.SKIPPED_REASONS` keeps a filter from inflating `errors`.
    """

    rows: list[IndicatorRow]
    processed: int
    unmatched: list[str] = field(default_factory=list)
    skipped: dict[str, int] = field(default_factory=dict)


def _file_hash(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _upsert_rows(session: Session, source_id: int, rows: Sequence[IndicatorRow]) -> None:
    if not rows:
        return
    values = [
        {
            "indicator": row.indicator,
            "canton_code": row.canton_code,
            "year": row.year,
            "month": row.month,
            "value": row.value,
            "source_id": source_id,
        }
        for row in rows
    ]
    statement = insert(CantonIndicator).values(values)
    statement = statement.on_conflict_do_update(
        index_elements=[
            CantonIndicator.indicator,
            CantonIndicator.canton_code,
            CantonIndicator.year,
            CantonIndicator.month,
        ],
        set_={"value": statement.excluded.value, "source_id": statement.excluded.source_id},
    )
    session.execute(statement)


def load_indicator_file(
    session: Session,
    source_slug: str,
    path: str | Path,
    parse: Callable[[Session, Path], ParsedIndicatorFile],
    *,
    force: bool = False,
) -> PipelineRun:
    """Read, aggregate and upsert one canton-indicator source file.

    `force=True` skips the already-loaded early return and reprocesses the
    file regardless: safe because the aggregate this file produces fully
    replaces (never adds to) whatever the same file produced last time --
    see `_upsert_rows`'s `ON CONFLICT DO UPDATE`.
    """
    path = Path(path)
    source = ensure_source(session, source_slug)
    file_hash = _file_hash(path)

    existing = session.scalar(
        select(PipelineRun).where(
            PipelineRun.source_id == source.id,
            PipelineRun.file_hash == file_hash,
            PipelineRun.status == RunStatus.SUCCEEDED,
        )
    )
    if existing is not None and not force:
        logger.info("skip %s: already loaded as pipeline_run %s", path.name, existing.id)
        return existing

    run = PipelineRun(
        source_id=source.id,
        file_name=path.name,
        file_hash=file_hash,
        status=RunStatus.RUNNING,
    )
    session.add(run)
    session.flush()

    try:
        parsed = parse(session, path)
        _upsert_rows(session, source.id, parsed.rows)

        run.processed = parsed.processed
        run.inserted = len(parsed.rows)
        run.duplicates = 0
        run.errors = len(parsed.unmatched)
        detail = {"unmatched": parsed.unmatched, "skipped": parsed.skipped}
        run.error_detail = (
            json.dumps(detail, ensure_ascii=False) if parsed.unmatched or parsed.skipped else None
        )
        run.status = RunStatus.SUCCEEDED
        run.finished_at = func.now()
    except Exception as exc:
        run.status = RunStatus.FAILED
        run.error_detail = json.dumps({"exception": str(exc)}, ensure_ascii=False)
        run.finished_at = func.now()
        session.commit()
        raise

    session.commit()
    return run
