"""Shapes and errors shared by every ingestion adapter.

Kept apart from any single adapter (mdi_homicidios, mdi_desaparecidas,
mdi_detenidos) because the id-assignment and rejection contract is the same
for all of them.
"""

import hashlib
import json
from collections.abc import Sequence
from dataclasses import dataclass, replace
from datetime import datetime

from app.modules.detentions.models import DetentionType
from app.modules.incidents.models import IncidentType, LocationPrecision


class RowRejected(Exception):
    """Raised by an adapter's normalize_row when a source row cannot be loaded.

    `reason` is a short machine-readable code (e.g. "outside_ecuador") that
    the loader tallies per pipeline run instead of raising -- one bad row
    must never abort an otherwise-good file.
    """

    def __init__(self, reason: str) -> None:
        super().__init__(reason)
        self.reason = reason


@dataclass(frozen=True, slots=True)
class NormalizedIncident:
    """One incident ready to load, with every personal-data column stripped.

    `source_record_id` starts out as the row's full content hash (from
    `hash_row`); `assign_record_ids` rewrites it to its final,
    ordinal-suffixed form once every row of the file has been normalized.
    """

    source_record_id: str
    type: IncidentType
    occurred_at: datetime
    latitude: float
    longitude: float
    province_code: str
    canton_code: str
    location_precision: LocationPrecision = LocationPrecision.EXACTA
    # Missing persons only: once located, the row keeps its place in the
    # incidents table (for statistics) but the map view hides it (see the
    # Phase 3 migration's map_incidents WHERE clause). Every other adapter
    # leaves this None.
    located_at: datetime | None = None


@dataclass(frozen=True, slots=True)
class NormalizedDetention:
    """One detention/apprehension ready to load, with no personal-data column.

    Detentions are police activity, not insecurity, so they are never
    normalized into a NormalizedIncident: a separate shape keeps them out of
    the incidents table (and the crime map) by construction, not by a filter
    that could be forgotten.
    """

    source_record_id: str
    detention_type: DetentionType
    occurred_at: datetime
    latitude: float
    longitude: float
    province_code: str
    canton_code: str
    iccs_code: str | None = None


# What `assign_record_ids` and the loader operate over: any adapter's output,
# regardless of which table it ultimately loads into.
NormalizedRecord = NormalizedIncident | NormalizedDetention


def hash_row(row: dict[str, str]) -> str:
    """SHA-256 hex digest of every column of a raw row (sorted keys, stripped values).

    Official files carry no row identifier, so the row's own content is the
    only handle a rerun can recognize. Every column is hashed -- including
    personal ones -- because that is what makes two victims recorded at the
    same place and time distinguishable; only the resulting hash, never the
    personal values themselves, ends up stored.
    """
    canonical = json.dumps(
        {str(key).strip(): (value or "").strip() for key, value in sorted(row.items())},
        ensure_ascii=False,
        separators=(",", ":"),
    )
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def assign_record_ids(rows: Sequence[NormalizedRecord]) -> list[NormalizedRecord]:
    """Suffix each row's content hash with its 1-based occurrence ordinal.

    Two rows can hash identically -- e.g. two victims sharing every recorded
    attribute -- and without a disambiguator the second would look like a
    duplicate of the first and silently vanish on insert. Ordinals are
    assigned in row order, so re-running over an unchanged file reproduces
    the exact same ids (deterministic across reruns). Works the same for any
    adapter's output: only `.source_record_id` and dataclass `replace` matter.
    """
    seen: dict[str, int] = {}
    result: list[NormalizedRecord] = []
    for row in rows:
        seen[row.source_record_id] = seen.get(row.source_record_id, 0) + 1
        ordinal = seen[row.source_record_id]
        final_id = f"{row.source_record_id[:40]}-{ordinal}"
        result.append(replace(row, source_record_id=final_id))
    return result
