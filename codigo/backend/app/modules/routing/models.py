"""Stored reference distribution of route exposure (the scale behind the 0-100 score).

One row per run of `python -m app.ingestion route-reference`; rows are kept
(history) and the service reads the newest. See
`app.modules.routing.reference` for how a row is built.
"""

from datetime import datetime

from sqlalchemy import BigInteger, DateTime, Float, Integer, Text, func
from sqlalchemy.dialects.postgresql import ARRAY
from sqlalchemy.orm import Mapped, mapped_column

from app.database.base import Base


class RouteRiskReference(Base):
    __tablename__ = "route_risk_reference"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    breakpoints: Mapped[list[float]] = mapped_column(ARRAY(Float))
    """101 exposure values: percentiles 0..100 of the pooled route x hour exposures."""
    routes_ok: Mapped[int] = mapped_column(Integer)
    routes_skipped: Mapped[int] = mapped_column(Integer)
    exposures_count: Mapped[int] = mapped_column(Integer)
    data_cut: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    data_version: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
