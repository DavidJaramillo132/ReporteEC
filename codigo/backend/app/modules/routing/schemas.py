"""Response shape of GET /api/routes/risk: the contract the frontend (V2 Task 4) reads.

Units live in the field names (`distance_km`, `duration_min`, `km_from`) or
in the field descriptions. Hours are local time (America/Guayaquil), 0-23.

The score measures danger per km: `density` (weighted cases per km, at
least 10 km in the divisor, x 24 x the trip's mean hourly share) as a 0-100
percentile. `score`/`band` stay
null with `score_available: false` until a stored reference distribution of
densities exists; `density` is always present. The case total is reported
apart, in `cases`.
"""

from datetime import date
from typing import Literal

from pydantic import BaseModel, Field

from app.modules.routing.scoring import Band

IncidentTypeKey = Literal["homicidio", "sicariato", "femicidio"]


class Coordinates(BaseModel):
    lon: float
    lat: float


class RouteGeometry(BaseModel):
    """GeoJSON LineString of the route for drawing, [lon, lat] pairs in WGS84.

    Simplified with Douglas-Peucker at 20 m (first and last points kept); every
    number in the response is computed on OSRM's full geometry.
    """

    type: Literal["LineString"] = "LineString"
    coordinates: list[tuple[float, float]]


class RouteCases(BaseModel):
    total: int = Field(description="Registered cases within the route's buffer, unweighted.")
    by_type: dict[IncidentTypeKey, int] = Field(
        description="Unweighted count per incident type; every type is always present."
    )
    weighted_total: float = Field(
        description=(
            "Sum of recency weights of every case, with or without a recorded hour "
            "(a case one year before the data cut weighs 0.5)."
        )
    )
    without_hour: int = Field(
        description=(
            "Cases with no recorded hour (stored as 00:00:00 local): counted in totals, "
            "density and blackspots, left out of every hourly curve."
        )
    )


class HourRisk(BaseModel):
    hour: int = Field(ge=0, le=23, description="Departure hour, local time (America/Guayaquil).")
    share: float = Field(
        description=(
            "Share of the route's cases at this hour of day after smoothing and shrinkage "
            "toward the national curve; the 24 shares sum to 1."
        )
    )
    weighted_cases: float = Field(
        description=(
            "Recency-weighted cases on the route at this local hour (before smoothing); "
            "cases without a recorded hour are not in any hour."
        )
    )
    density: float = Field(
        description=(
            "Danger per km when leaving at this hour: weighted cases / max(distance_km, 10) x 24 "
            "x the mean share over the hours the trip spans, weighted by minutes (a trip under "
            "1 h: share at this hour). From 10 km on, a flat hourly curve gives exactly "
            "`cases_per_km`."
        )
    )
    score: int | None = Field(
        description="0-100 percentile of density against the reference; null when unavailable."
    )
    score_available: bool
    band: Band | None = Field(description="Semáforo band key for `score`; null with no score.")
    band_label: str | None = Field(description="Spanish band label, e.g. «Precaución».")


class Blackspot(BaseModel):
    km_from: float = Field(description="Start of the 1 km piece, km from the origin.")
    km_to: float = Field(description="End of the piece, km from the origin.")
    lon: float = Field(description="Midpoint of the piece on the route.")
    lat: float
    weighted_cases: float
    cases: int = Field(description="Unweighted case count in the piece.")
    by_type: dict[IncidentTypeKey, int]
    peak_hours: list[int] = Field(
        description=(
            "Up to 3 local hours with the most weighted cases in the piece, busiest first; "
            "cases without a recorded hour are left out."
        )
    )
    first_date: date = Field(description="Earliest case in the piece (local date).")
    last_date: date = Field(description="Latest case in the piece (local date).")


class RouteRiskResponse(BaseModel):
    origin: Coordinates = Field(description="Origin as routed (rounded to 4 decimals).")
    destination: Coordinates
    geometry: RouteGeometry
    distance_km: float
    duration_min: float = Field(description="OSRM driving time in minutes.")
    cases_per_km: float = Field(
        description=(
            "Recency-weighted cases per km of route: `cases.weighted_total` / `distance_km`."
        )
    )
    cases: RouteCases
    selected: HourRisk = Field(description="Risk for the requested departure `hour`.")
    best_hour: int | None = Field(
        ge=0,
        le=23,
        description=(
            "Departure hour with the lowest density; hours within 5% of it count as tied "
            "and the earliest is reported. Null when the route has no case at all."
        ),
    )
    hourly: list[HourRisk] = Field(description="All 24 departure hours, 0 to 23.")
    blackspots: list[Blackspot] = Field(description="At most 5, heaviest first.")
    low_data: bool = Field(
        description=(
            "True when the route's weighted cases with a recorded hour are below the "
            "shrinkage constant K=20, so the hourly curve leans on the national one."
        )
    )
    data_cut: date | None = Field(
        description="Local date of the latest case used; recency weights are measured from it."
    )
    notes: list[str] = Field(description="Plain-Spanish limits of what the score measures.")
