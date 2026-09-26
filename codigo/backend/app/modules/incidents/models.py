"""Incidents drawn on the map: homicides, missing persons and, later, reports.

Sensitive fields from the official files (ethnicity, nationality, migratory
status) are never stored: what is not kept cannot leak.
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


class IncidentType(StrEnum):
    """See "Tipos de Incidente" in the documentation vault."""

    HOMICIDIO = "homicidio"
    SICARIATO = "sicariato"
    FEMICIDIO = "femicidio"
    DESAPARECIDA = "desaparecida"
    SINIESTRO_TRANSITO = "siniestro_transito"
    TIROTEO = "tiroteo"
    ROBO = "robo"
    SECUESTRO = "secuestro"
    EXTORSION = "extorsion"
    VIOLENCIA_SEXUAL = "violencia_sexual"
    RINA = "rina"
    OTRO = "otro"


class Confidence(StrEnum):
    """See "Niveles de Confianza". Recency (vigencia) is derived from the date."""

    OFICIAL = "oficial"
    VERIFICADO = "verificado"
    REPORTADO = "reportado"
    EN_REVISION = "en_revision"


class IncidentStatus(StrEnum):
    ACTIVO = "activo"
    RETIRADO = "retirado"  # withdrawn, e.g. a report declared false
    FUSIONADO = "fusionado"  # merged into another incident (duplicate)


class LocationPrecision(StrEnum):
    EXACTA = "exacta"
    APROXIMADA = "aproximada"
    CANTON = "canton"


class Incident(TimestampMixin, Base):
    __tablename__ = "incidents"
    __table_args__ = (
        # Makes ingestion idempotent: loading the same file twice inserts nothing new.
        UniqueConstraint("source_id", "source_record_id"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    source_id: Mapped[int] = mapped_column(SmallInteger, ForeignKey("sources.id"))
    # Identifier of the row in the original file, unique within its source.
    source_record_id: Mapped[str] = mapped_column(String(128))

    type: Mapped[IncidentType] = mapped_column(text_enum(IncidentType, "incident_type"), index=True)
    confidence: Mapped[Confidence] = mapped_column(text_enum(Confidence, "confidence"))
    status: Mapped[IncidentStatus] = mapped_column(
        text_enum(IncidentStatus, "incident_status"), default=IncidentStatus.ACTIVO
    )
    merged_into_id: Mapped[int | None] = mapped_column(
        BigInteger, ForeignKey("incidents.id"), index=True
    )

    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    geom: Mapped[str] = mapped_column(Point)
    location_precision: Mapped[LocationPrecision] = mapped_column(
        text_enum(LocationPrecision, "location_precision")
    )
    # DPA codes (INEC/CONALI) as text: they have leading zeros ("01", "0101").
    province_code: Mapped[str | None] = mapped_column(String(2), index=True)
    canton_code: Mapped[str | None] = mapped_column(String(4), index=True)

    # Missing persons only: once located they leave the map but stay in statistics.
    located_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
