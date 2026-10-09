"""The recorded OSRM route gives exactly the same cases, pieces, blackspots and display line.

A golden file pins the output of the route pipeline (spatial query, 1 km
pieces, blackspots, display simplification) on the recorded Guayaquil ->
Babahoyo route with 600 seeded incidents scattered around it: many sit near
the 200 m and 1,000 m buffer edges and between two pieces. It was written by
the code before the latency work (WKT pieces, per-row geography casts,
the first `simplify_line`), so any optimization must reproduce it exactly.

Regenerate only on purpose: `REGENERATE_ROUTE_GOLDEN=1 pytest <this file>`.
"""

import json
import os
import random
from datetime import datetime, timedelta
from pathlib import Path

from sqlalchemy.orm import Session

from app.core.time import GUAYAQUIL
from app.modules.incidents.models import (
    Confidence,
    Incident,
    IncidentStatus,
    IncidentType,
    LocationPrecision,
)
from app.modules.routing.geometry import build_pieces
from app.modules.routing.osrm import parse_route
from app.modules.routing.service import (
    analyze_route,
    fetch_route_cases,
    load_national_context,
)
from tests.factories import make_source
from tests.modules.routing.fakes import load_fixture

GOLDEN = Path(__file__).parent / "fixtures" / "route_golden_guayaquil_babahoyo.json"
SEED = 20261010
INCIDENTS = 600
TYPES = (IncidentType.HOMICIDIO, IncidentType.SICARIATO, IncidentType.FEMICIDIO)


def _seed_incidents(session: Session, coordinates: list[list[float]]) -> None:
    rng = random.Random(SEED)
    source = make_source(session)
    start = datetime(2023, 1, 1, tzinfo=GUAYAQUIL)
    rows = []
    for index in range(INCIDENTS):
        lon, lat = rng.choice(coordinates)
        # Up to ~1.5 km away: both sides of the 200 m and 1,000 m edges.
        spread = rng.choice((0.0015, 0.004, 0.01))
        when = start + timedelta(days=rng.uniform(0, 900), minutes=rng.randrange(1, 1440))
        rows.append(
            Incident(
                source_id=source.id,
                source_record_id=f"golden-{index}",
                type=rng.choice(TYPES),
                confidence=Confidence.OFICIAL,
                status=IncidentStatus.ACTIVO,
                occurred_at=when,
                location_precision=LocationPrecision.EXACTA,
                province_code="09",
                canton_code="0901",
                geom=(
                    f"SRID=4326;POINT({lon + rng.uniform(-spread, spread)} "
                    f"{lat + rng.uniform(-spread, spread)})"
                ),
            )
        )
    session.add_all(rows)
    session.commit()


def _snapshot(session: Session) -> dict:
    payload = load_fixture()
    route = parse_route(payload)
    _seed_incidents(session, payload["routes"][0]["geometry"]["coordinates"])
    context = load_national_context(session)
    pieces = build_pieces(route.coordinates, route.segment_distances_m, route.segment_speeds_mps)
    cases = fetch_route_cases(session, pieces)
    analysis = analyze_route(session, route, route.coordinates[0], route.coordinates[-1], context)
    return {
        "pieces": [
            [piece.start_m, piece.length_m, piece.buffer_m, [list(c) for c in piece.coords]]
            for piece in pieces
        ],
        "cases": sorted([case.type, case.occurred_at.isoformat(), case.piece] for case in cases),
        "blackspots": [spot.model_dump(mode="json") for spot in analysis.blackspots],
        "display_line": [list(point) for point in analysis.display_line()],
    }


def test_the_recorded_route_matches_the_golden_output(db_session: Session):
    snapshot = _snapshot(db_session)
    if os.environ.get("REGENERATE_ROUTE_GOLDEN"):
        GOLDEN.write_text(json.dumps(snapshot, indent=1) + "\n")
    golden = json.loads(GOLDEN.read_text())

    assert len(snapshot["cases"]) > 200  # the seed puts plenty of cases on the route
    assert snapshot["blackspots"]
    assert snapshot["pieces"] == golden["pieces"]
    assert snapshot["cases"] == golden["cases"]
    assert snapshot["blackspots"] == golden["blackspots"]
    assert snapshot["display_line"] == golden["display_line"]
