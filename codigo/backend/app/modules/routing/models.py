"""Stored reference distributions of route risk (the scale behind the 0-100 score).

One row per run of `python -m app.ingestion route-reference`; rows are kept
(history) and the service reads the newest row of the metric it scores
(`DENSITY_METRIC`). See `app.modules.routing.reference` for how a row is
built.
"""

from datetime import datetime
from typing import Final

from sqlalchemy import BigInteger, DateTime, Float, Integer, Text, func
from sqlalchemy.dialects.postgresql import ARRAY
from sqlalchemy.orm import Mapped, mapped_column

from app.database.base import Base

DENSITY_METRIC: Final = "density_per_km"
"""Breakpoints of density: weighted cases per km x 24 x the trip's mean hourly share."""
EXPOSURE_METRIC: Final = "exposure_total"
"""Breakpoints of the first V2 scale (a trip's total exposure). Never used to score."""


class RouteRiskReference(Base):
    __tablename__ = "route_risk_reference"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    metric: Mapped[str] = mapped_column(Text)
    """What the breakpoints measure: `DENSITY_METRIC` or the retired `EXPOSURE_METRIC`."""
    breakpoints: Mapped[list[float]] = mapped_column(ARRAY(Float))
    """101 values: percentiles 0..100 of the pooled route x hour values of `metric`."""
    routes_ok: Mapped[int] = mapped_column(Integer)
    routes_skipped: Mapped[int] = mapped_column(Integer)
    values_count: Mapped[int] = mapped_column(Integer)
    """How many route x hour values were pooled (24 per route)."""
    data_cut: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    data_version: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
