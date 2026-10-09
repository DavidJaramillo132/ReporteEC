"""GET /api/places/search: accent/case-insensitive canton lookup for route endpoints."""

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.modules.territory.models import AdminUnit, AdminUnitLevel, Canton
from app.modules.territory.service import normalize_place_query

_PROVINCES = {"09": "Guayas", "12": "Los Ríos", "23": "Santo Domingo de los Tsáchilas"}


def _square(lon: float, lat: float, size: float = 0.04) -> str:
    return (
        f"SRID=4326;MULTIPOLYGON((({lon} {lat}, {lon} {lat + size}, {lon + size} {lat + size}, "
        f"{lon + size} {lat}, {lon} {lat})))"
    )


def _seed(session: Session, cantons: list[tuple[str, str, str]]) -> None:
    for code, name in _PROVINCES.items():
        session.add(
            AdminUnit(code=code, level=AdminUnitLevel.PROVINCE, name=name, province_code=None)
        )
    for index, (code, name, province_code) in enumerate(cantons):
        lon, lat = -79.9 + index * 0.1, -2.2
        session.add(
            Canton(
                code=code,
                province_code=province_code,
                name=name,
                geom=_square(lon, lat),
                centroid=f"SRID=4326;POINT({lon + 0.02} {lat + 0.02})",
            )
        )
    session.commit()


@pytest.fixture
def cantons(db_session: Session) -> None:
    _seed(
        db_session,
        [
            ("1205", "Quevedo", "12"),
            ("2301", "Santo Domingo", "23"),
            ("0907", "Durán", "09"),
            ("0901", "Guayaquil", "09"),
            ("1201", "Babahoyo", "12"),
            ("0920", "Coronel Marcelino Maridueña", "09"),
        ],
    )


def _names(response) -> list[str]:
    assert response.status_code == 200, response.text
    return [place["name"] for place in response.json()["places"]]


@pytest.mark.parametrize("query", ["Quevedo", "quevedo", "QUEVEDO", "quev"])
def test_finds_a_canton_whatever_the_case(client: TestClient, cantons, query: str):
    assert _names(client.get("/api/places/search", params={"q": query})) == ["Quevedo"]


def test_multi_word_name(client: TestClient, cantons):
    body = client.get("/api/places/search", params={"q": "Santo Domingo"}).json()

    (place,) = body["places"]
    assert place["code"] == "2301"
    assert place["province_name"] == "Santo Domingo de los Tsáchilas"


@pytest.mark.parametrize("query", ["durán", "duran", "DURÁN", "Duran"])
def test_accents_are_optional_and_the_result_keeps_them(client: TestClient, cantons, query: str):
    assert _names(client.get("/api/places/search", params={"q": query})) == ["Durán"]


def test_accented_letters_inside_the_name_match_plain_queries(client: TestClient, cantons):
    assert _names(client.get("/api/places/search", params={"q": "maridue"})) == [
        "Coronel Marcelino Maridueña"
    ]
    assert _names(client.get("/api/places/search", params={"q": "mariduen"})) == [
        "Coronel Marcelino Maridueña"
    ]


def test_returns_code_province_and_a_point_inside_the_canton(client: TestClient, cantons):
    (place,) = client.get("/api/places/search", params={"q": "Guayaquil"}).json()["places"]

    assert place["code"] == "0901"
    assert place["province_code"] == "09"
    assert place["province_name"] == "Guayas"
    # Guayaquil is the 4th seeded square: lon -79.6..-79.56, lat -2.2..-2.16.
    assert -79.6 < place["lon"] < -79.56
    assert -2.2 < place["lat"] < -2.16
    assert place["seat_name"] is None  # no seat loaded: the point is the fallback


def _set_seat(session: Session, code: str, name: str, lon: float, lat: float) -> None:
    canton = session.get(Canton, code)
    canton.seat_name = name
    canton.seat_geom = f"SRID=4326;POINT({lon} {lat})"
    session.commit()


def test_returns_the_cabecera_point_and_name_when_loaded(
    client: TestClient, db_session: Session, cantons
):
    _set_seat(db_session, "0901", "Guayaquil", -79.5962, -2.1958)

    (place,) = client.get("/api/places/search", params={"q": "Guayaquil"}).json()["places"]
    (other,) = client.get("/api/places/search", params={"q": "Babahoyo"}).json()["places"]

    assert (place["lon"], place["lat"]) == pytest.approx((-79.5962, -2.1958))
    assert place["seat_name"] == "Guayaquil"
    assert other["seat_name"] is None  # Babahoyo has no seat: point inside its square
    assert -79.5 < other["lon"] < -79.46


def test_the_cabecera_name_finds_its_canton(client: TestClient, db_session: Session, cantons):
    _set_seat(db_session, "1205", "San Camilo", -79.88, -2.18)

    (place,) = client.get("/api/places/search", params={"q": "camilo"}).json()["places"]

    assert (place["name"], place["seat_name"]) == ("Quevedo", "San Camilo")


def test_prefix_matches_rank_before_contains_matches(client: TestClient, db_session: Session):
    _seed(
        db_session,
        [
            ("0101", "Playas", "09"),
            ("0102", "Pasaje", "09"),
            ("0103", "La Libertad", "09"),
            ("0104", "Balao", "09"),
        ],
    )

    # Only "La Libertad" starts with "la"; "Balao" and "Playas" contain it
    # (alphabetical after it); "Pasaje" does not match at all.
    assert _names(client.get("/api/places/search", params={"q": "la"})) == [
        "La Libertad",
        "Balao",
        "Playas",
    ]


def test_at_most_ten_results(client: TestClient, db_session: Session):
    _seed(db_session, [(f"09{index:02d}", f"San Canton {index:02d}", "09") for index in range(15)])

    assert len(_names(client.get("/api/places/search", params={"q": "san"}))) == 10


def test_no_match_is_an_empty_list(client: TestClient, cantons):
    assert _names(client.get("/api/places/search", params={"q": "zzz"})) == []


def test_like_wildcards_are_literal(client: TestClient, cantons):
    assert _names(client.get("/api/places/search", params={"q": "%_"})) == []


@pytest.mark.parametrize("query", ["", "q", "  q  ", "é"])
def test_a_query_shorter_than_two_letters_is_a_422(client: TestClient, query: str):
    response = client.get("/api/places/search", params={"q": query})

    assert response.status_code == 422
    assert "2 letras" in response.json()["detail"]


def test_missing_query_is_a_422(client: TestClient):
    assert client.get("/api/places/search").status_code == 422


def test_query_normalization():
    assert normalize_place_query("  Durán   Ñuñoa ") == "duran nunoa"
