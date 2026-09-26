"""Detentions: police activity, not insecurity.

Kept apart from incidents so they are never counted or drawn as incidents.
Personal fields from the official file (age, sex, ethnicity, nationality,
migratory status, civil status) are never stored.
"""

from datetime import datetime
from enum import StrEnum

from sqlalchemy import (
    BigInteger,
    DateTime,
    ForeignKey,
    SmallInteger,
    String,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.database.base import Base, TimestampMixin
from app.database.types import Point, text_enum


class DetentionType(StrEnum):
    DETENIDO = "detenido"
    APREHENDIDO = "aprehendido"


class Detention(TimestampMixin, Base):
    __tablename__ = "detentions"
    __table_args__ = (UniqueConstraint("source_id", "source_record_id"),)

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    source_id: Mapped[int] = mapped_column(SmallInteger, ForeignKey("sources.id"))
    source_record_id: Mapped[str] = mapped_column(String(128))

    detention_type: Mapped[DetentionType] = mapped_column(
        text_enum(DetentionType, "detention_type")
    )
    # International Classification of Crime for Statistical Purposes, for statistics.
    iccs_code: Mapped[str | None] = mapped_column(String(16))

    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    geom: Mapped[str] = mapped_column(Point)
    province_code: Mapped[str | None] = mapped_column(String(2), index=True)
    canton_code: Mapped[str | None] = mapped_column(String(4), index=True)
