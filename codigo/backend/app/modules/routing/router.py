"""GET /api/routes/risk: violent deaths registered near a driving route, by departure hour.

See `app.modules.routing.service` for the method. Errors: malformed or
out-of-Ecuador coordinates, an hour outside 0-23, an end more than 2 km from
any road, or origin and destination at the same place -> 422; no drivable
route -> 404; OSRM down or slower than 2 s in total -> 503; already
computing `MAX_CONCURRENT_COMPUTATIONS` uncached routes in this worker -> 503.
Messages are Spanish.
"""

from functools import lru_cache

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.core.config import osrm_url
from app.database.session import get_session
from app.modules.routing.geometry import LonLat
from app.modules.routing.osrm import OsrmClient, OsrmUnavailable, RouteNotFound
from app.modules.routing.schemas import RouteRiskResponse
from app.modules.routing.service import (
    InvalidRoute,
    InvalidRouteReason,
    RoutingBusy,
    ScoreFn,
    route_risk,
    score_fn_for,
)

router = APIRouter(prefix="/routes", tags=["routes"])

# Ecuador's bounding box, Galápagos included.
ECUADOR_LON_RANGE = (-92.1, -75.1)
ECUADOR_LAT_RANGE = (-5.1, 1.7)

NO_ROUTE_MESSAGE = "No encontramos una ruta por carretera entre esos dos puntos."
OSRM_DOWN_MESSAGE = (
    "El servicio de rutas no está disponible en este momento. Intenta de nuevo en unos minutos."
)
BUSY_MESSAGE = "Hay muchas consultas de rutas en este momento. Intenta de nuevo en unos segundos."
INVALID_ROUTE_MESSAGES: dict[InvalidRouteReason, str] = {
    "origin_far_from_road": (
        "El origen está a más de 2 km de una vía. "
        "Elige un punto más cerca de una carretera o calle."
    ),
    "destination_far_from_road": (
        "El destino está a más de 2 km de una vía. "
        "Elige un punto más cerca de una carretera o calle."
    ),
    "same_place": "El origen y el destino son el mismo lugar.",
}


@lru_cache
def get_osrm_client() -> OsrmClient:
    """FastAPI dependency: one shared client (keeps OSRM connections alive)."""
    return OsrmClient(osrm_url())


def get_score_fn(session: Session = Depends(get_session)) -> ScoreFn:
    """FastAPI dependency: density -> 0-100 score from the newest stored density reference.

    Without a reference row every score is None (`score_available: false`).
    """
    return score_fn_for(session)


def parse_point(raw: str, name: str) -> LonLat:
    """`"lon,lat"` -> (lon, lat), inside Ecuador's bounding box, or a Spanish 422."""
    parts = raw.split(",")
    try:
        if len(parts) != 2:
            raise ValueError
        lon, lat = float(parts[0]), float(parts[1])
    except ValueError:
        raise HTTPException(
            status_code=422,
            detail=f"`{name}` debe tener el formato lon,lat (por ejemplo -79.8862,-2.1894).",
        ) from None
    in_lon = ECUADOR_LON_RANGE[0] <= lon <= ECUADOR_LON_RANGE[1]
    in_lat = ECUADOR_LAT_RANGE[0] <= lat <= ECUADOR_LAT_RANGE[1]
    if not (in_lon and in_lat):  # also rejects nan
        raise HTTPException(status_code=422, detail=f"`{name}` está fuera del Ecuador.")
    return lon, lat


@router.get("/risk", response_model=RouteRiskResponse)
def get_route_risk(
    session: Session = Depends(get_session),
    client: OsrmClient = Depends(get_osrm_client),
    score_fn: ScoreFn = Depends(get_score_fn),
    from_: str = Query(alias="from", description="Origin as `lon,lat` (WGS84)."),
    to: str = Query(description="Destination as `lon,lat` (WGS84)."),
    hour: int = Query(ge=0, le=23, description="Departure hour, local time (0-23)."),
) -> RouteRiskResponse:
    origin = parse_point(from_, "from")
    destination = parse_point(to, "to")
    try:
        return route_risk(session, client, origin, destination, hour, score_fn)
    except InvalidRoute as exc:
        raise HTTPException(status_code=422, detail=INVALID_ROUTE_MESSAGES[exc.reason]) from None
    except RouteNotFound:
        raise HTTPException(status_code=404, detail=NO_ROUTE_MESSAGE) from None
    except OsrmUnavailable:
        raise HTTPException(status_code=503, detail=OSRM_DOWN_MESSAGE) from None
    except RoutingBusy:
        raise HTTPException(status_code=503, detail=BUSY_MESSAGE) from None
