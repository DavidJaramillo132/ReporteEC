"""Province and canton names, looked up by DPA (INEC/CONALI) code.

Incidents and detentions only ever store `province_code`/`canton_code`; this
is the one place their human-readable names live, populated by the ingestion
loader from the official files' own `provincia`/`canton` columns (see
`app.modules.ingestion.admin_units`). The frontend never needs its own copy
of the DPA catalog -- it reads it from `GET /api/admin-units`.
"""

from enum import StrEnum

from sqlalchemy import ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from app.database.base import Base
from app.database.types import text_enum


class AdminUnitLevel(StrEnum):
    PROVINCE = "province"
    CANTON = "canton"


class AdminUnit(Base):
    __tablename__ = "admin_units"

    # The DPA code itself: 2 digits for a province, 4 for a canton. Both
    # levels share this one column since their lengths never collide.
    code: Mapped[str] = mapped_column(String(4), primary_key=True)
    level: Mapped[AdminUnitLevel] = mapped_column(text_enum(AdminUnitLevel, "admin_unit_level"))
    name: Mapped[str] = mapped_column(String(128))
    # The parent province's code, set for cantons; NULL for provinces.
    province_code: Mapped[str | None] = mapped_column(String(2), ForeignKey("admin_units.code"))
