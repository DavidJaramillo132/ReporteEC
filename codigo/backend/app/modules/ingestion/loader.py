"""Load a source file end-to-end: read, normalize, dedupe and persist one PipelineRun.

Idempotent at two levels: a file already loaded successfully is skipped
outright (by content hash), and even a fresh run never inserts the same
record twice (on_conflict_do_nothing on (source_id, source_record_id)).
"""

import hashlib
import json
import logging
from collections import Counter
from collections.abc import Callable, Iterable
from pathlib import Path

from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.modules.incidents.models import Confidence, Incident
from app.modules.ingestion.models import PipelineRun, RunStatus
from app.modules.ingestion.readers.xlsx import read_rows
from app.modules.ingestion.records import NormalizedIncident, RowRejected, assign_record_ids
from app.modules.ingestion.sources import ensure_source

logger = logging.getLogger(__name__)

BATCH_SIZE = 1000

# Reasons that are an intentional filter, not a data problem -- tallied
# apart so they never inflate the "errors" count a maintainer should react to.
SKIPPED_REASONS = {"before_min_year"}


def _file_hash(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _normalize_all(
    rows: Iterable[dict[str, str]],
    normalize: Callable[[dict[str, str]], NormalizedIncident],
) -> tuple[list[NormalizedIncident], int, Counter[str], Counter[str]]:
    accepted: list[NormalizedIncident] = []
    processed = 0
    errors: Counter[str] = Counter()
    skipped: Counter[str] = Counter()
    for row in rows:
        processed += 1
        try:
            accepted.append(normalize(row))
        except RowRejected as exc:
            (skipped if exc.reason in SKIPPED_REASONS else errors)[exc.reason] += 1
    return accepted, processed, errors, skipped


def _insert_batch(session: Session, source_id: int, batch: list[NormalizedIncident]) -> int:
    values = [
        {
            "source_id": source_id,
            "source_record_id": row.source_record_id,
            "type": row.type,
            "confidence": Confidence.OFICIAL,
            "occurred_at": row.occurred_at,
            "geom": func.ST_SetSRID(func.ST_MakePoint(row.longitude, row.latitude), 4326),
            "location_precision": row.location_precision,
            "province_code": row.province_code,
            "canton_code": row.canton_code,
        }
        for row in batch
    ]
    statement = (
        insert(Incident)
        .values(values)
        .on_conflict_do_nothing(index_elements=[Incident.source_id, Incident.source_record_id])
        # cursor.rowcount is unreliable (-1) for a multi-row VALUES insert
        # under psycopg; RETURNING only yields the rows actually inserted,
        # since ON CONFLICT DO NOTHING excludes skipped ones from it.
        .returning(Incident.id)
    )
    return len(session.execute(statement).all())


def load_file(
    session: Session,
    source_slug: str,
    path: str | Path,
    normalize: Callable[[dict[str, str]], NormalizedIncident],
) -> PipelineRun:
    """Read, normalize and insert one source file, recorded as one PipelineRun."""
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
    if existing is not None:
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
        rows, processed, errors, skipped = _normalize_all(read_rows(path), normalize)
        rows = assign_record_ids(rows)

        inserted = 0
        for start in range(0, len(rows), BATCH_SIZE):
            inserted += _insert_batch(session, source.id, rows[start : start + BATCH_SIZE])

        run.processed = processed
        run.inserted = inserted
        run.duplicates = len(rows) - inserted
        run.errors = sum(errors.values())
        detail = {"errors": dict(errors), "skipped": dict(skipped)}
        run.error_detail = json.dumps(detail, ensure_ascii=False) if errors or skipped else None
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
