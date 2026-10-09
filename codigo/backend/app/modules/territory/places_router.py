"""GET /api/places/search: pick a canton as a route origin or destination."""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.database.session import get_session
from app.modules.territory.schemas import PlaceOut, PlacesSearchResponse
from app.modules.territory.service import normalize_place_query, search_places

router = APIRouter(prefix="/places", tags=["places"])

MIN_QUERY_LENGTH = 2


@router.get("/search", response_model=PlacesSearchResponse)
def search(
    session: Session = Depends(get_session),
    q: str = Query(max_length=100, description="Canton name or part of it; accents optional."),
) -> PlacesSearchResponse:
    if len(normalize_place_query(q)) < MIN_QUERY_LENGTH:
        raise HTTPException(
            status_code=422, detail="Escribe al menos 2 letras para buscar un cantón."
        )
    places = search_places(session, q)
    return PlacesSearchResponse(
        query=q, places=[PlaceOut.model_validate(place, from_attributes=True) for place in places]
    )
