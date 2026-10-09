"""`canton-seats`: each canton's cabecera from the committed OpenStreetMap CSV."""

import csv
from pathlib import Path

import pytest
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.ingestion import __main__ as cli
from app.ingestion.loaders.territory import DEFAULT_CANTON_SEATS_FILE, load_canton_seats
from app.modules.territory.models import Canton

ECUADOR_LON = (-92.1, -75.1)
ECUADOR_LAT = (-5.1, 1.7)
HEADER = "canton_code,seat_name,lon,lat,osm_id,method"


def _square(lon: float, lat: float, size: float = 0.1) -> str:
    return (
        f"SRID=4326;MULTIPOLYGON((({lon} {lat}, {lon} {lat + size}, {lon + size} {lat + size}, "
        f"{lon + size} {lat}, {lon} {lat})))"
    )


@pytest.fixture
def cantons(db_session: Session) -> None:
    for code, lon in (("1601", -78.1), ("1401", -78.3)):
        db_session.add(
            Canton(
                code=code,
                province_code=code[:2],
                name=f"Canton {code}",
                geom=_square(lon, -1.6),
                centroid=f"SRID=4326;POINT({lon + 0.05} -1.55)",
            )
        )
    db_session.commit()


def _write(tmp_path: Path, *rows: str) -> Path:
    path = tmp_path / "canton_seats.csv"
    path.write_text(
        "\n".join(["# © colaboradores de OpenStreetMap, ODbL", HEADER, *rows]) + "\n",
        encoding="utf-8",
    )
    return path


def _seats(session: Session) -> dict[str, tuple[str | None, float | None, float | None]]:
    rows = session.execute(
        select(
            Canton.code, Canton.seat_name, func.ST_X(Canton.seat_geom), func.ST_Y(Canton.seat_geom)
        ).order_by(Canton.code)
    ).all()
    return {code: (name, lon, lat) for code, name, lon, lat in rows}


def test_loads_seats_and_running_it_twice_changes_nothing(
    db_session: Session, cantons, tmp_path: Path
):
    path = _write(
        tmp_path,
        "1601,Puyo,-77.995,-1.487,node/1,alias",
        "1401,,,,,fallback",
        "9999,Nowhere,-78.0,-1.0,node/2,name",
    )

    first = load_canton_seats(db_session, path)
    db_session.commit()
    after_first = _seats(db_session)
    second = load_canton_seats(db_session, path)
    db_session.commit()

    assert (first.seats, first.fallbacks, first.unknown_codes) == (1, 1, ["9999"])
    assert (second.seats, second.fallbacks, second.unknown_codes) == (1, 1, ["9999"])
    assert after_first == _seats(db_session)
    assert after_first["1601"] == ("Puyo", pytest.approx(-77.995), pytest.approx(-1.487))
    assert after_first["1401"] == (None, None, None)


def test_a_fallback_row_clears_an_earlier_seat(db_session: Session, cantons, tmp_path: Path):
    load_canton_seats(db_session, _write(tmp_path, "1401,Macas,-78.12,-2.31,node/3,rank"))
    db_session.commit()

    load_canton_seats(db_session, _write(tmp_path, "1401,,,,,fallback"))
    db_session.commit()

    assert _seats(db_session)["1401"] == (None, None, None)


def test_the_committed_csv_is_complete_and_attributed():
    lines = DEFAULT_CANTON_SEATS_FILE.read_text(encoding="utf-8").splitlines()
    rows = list(csv.DictReader(line for line in lines if not line.startswith("#")))
    codes = [row["canton_code"] for row in rows]

    assert lines[0].startswith("# © colaboradores de OpenStreetMap, ODbL")
    assert lines[1] == HEADER
    assert len(codes) == len(set(codes)) >= 221
    for row in rows:
        assert row["method"] in {"name", "alias", "rank", "fallback"}, row
        if row["method"] != "fallback":
            assert row["seat_name"] and row["osm_id"].startswith(("node/", "way/")), row
            assert ECUADOR_LON[0] <= float(row["lon"]) <= ECUADOR_LON[1], row
            assert ECUADOR_LAT[0] <= float(row["lat"]) <= ECUADOR_LAT[1], row


def test_cli_wires_canton_seats_with_the_committed_file_by_default(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
):
    called: list[Path] = []
    monkeypatch.setattr(cli, "run_canton_seats", called.append)

    cli.main(["canton-seats"])
    cli.main(["canton-seats", "--file", str(tmp_path / "other.csv")])

    assert called == [DEFAULT_CANTON_SEATS_FILE, tmp_path / "other.csv"]
