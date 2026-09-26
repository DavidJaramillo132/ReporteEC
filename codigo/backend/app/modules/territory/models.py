"""Canton boundaries, cantonal population projections, and canton-level indicators.

`Canton` carries the geometry used to derive a centroid for coordinate-less
homicides (see `app.modules.ingestion.adapters.mdi_homicidios`) and the
`map_cantons` view (see `app.database.views`). `CantonPopulation` is the INEC
population projection used by the statistics API to turn a raw count into a
rate per 100.000 inhabitants (see `app.modules.stats`). `CantonIndicator` is
the canton/year/month aggregate behind `GET /api/cantons/indicators` (see
`app.modules.canton_indicators`) -- extortion complaints (OECO) and traffic
crashes (INEC ESTRA) as of writing.

None of these tables declare a foreign key to `admin_units`: like
`incidents.canton_code`/`detentions.canton_code`, the DPA code is stored as a
plain string so each ingestion pipeline (incidents, cantons, population,
canton indicators) can run independently of the others' load order.
"""

from enum import StrEnum

from sqlalchemy import (
    BigInteger,
    ForeignKey,
    Index,
    Integer,
    SmallInteger,
    String,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.database.base import Base
from app.database.types import MultiPolygon, Point, text_enum


class Canton(Base):
    __tablename__ = "cantons"

    # DPA (INEC/CONALI) canton code, e.g. "0101".
    code: Mapped[str] = mapped_column(String(4), primary_key=True)
    province_code: Mapped[str | None] = mapped_column(String(2), index=True)
    name: Mapped[str] = mapped_column(String(128))
    geom: Mapped[str] = mapped_column(MultiPolygon)
    # ST_PointOnSurface, not ST_Centroid: a concave canton's centroid of mass
    # can fall outside its own boundary (e.g. a C-shaped canton), which would
    # place a coordinate-less incident in a neighboring canton.
    centroid: Mapped[str] = mapped_column(Point)


class CantonPopulation(Base):
    __tablename__ = "canton_population"

    canton_code: Mapped[str] = mapped_column(String(4), primary_key=True)
    year: Mapped[int] = mapped_column(SmallInteger, primary_key=True)
    population: Mapped[int] = mapped_column(Integer)


class Indicator(StrEnum):
    """Canton-level indicators aggregated into `canton_indicators`.

    `SECUESTRO_EXTORSIVO` is loaded from the same OECO source as `EXTORSION`
    (see `app.modules.ingestion.adapters.oeco_extorsion`) but is not one of
    the indicators the public API (`app.modules.canton_indicators.router`)
    currently exposes -- it is here so a future endpoint can serve it without
    a schema change.
    """

    EXTORSION = "extorsion"
    SECUESTRO_EXTORSIVO = "secuestro_extorsivo"
    SINIESTROS = "siniestros"
    SINIESTROS_FALLECIDOS = "siniestros_fallecidos"


class CantonIndicator(Base):
    """One aggregated indicator value per (indicator, canton, year, month).

    Every ingestion run recomputes and overwrites the *entire* aggregate for
    the file it loaded (`ON CONFLICT ... DO UPDATE SET value = excluded.value`
    -- replace, not add), so re-running the same file with `--force` is safe:
    see `app.modules.ingestion.canton_indicators.load_indicator_file`. This is
    unlike `incidents`/`detentions`, which insert one row per source record.

    `month` stays nullable for a future source that reports only yearly
    totals; every source loaded as of writing (OECO extortion, INEC ESTRA
    traffic crashes) always populates it for every row. Caveat: SQL UNIQUE
    treats NULLs as distinct from each other, so two rows sharing
    (indicator, canton_code, year, NULL) would NOT collide against
    `uq_canton_indicators_indicator_canton_code_year_month` and could both be
    inserted -- harmless today since no loaded source ever leaves `month`
    NULL, but worth knowing before wiring up one that does.
    """

    __tablename__ = "canton_indicators"
    __table_args__ = (
        UniqueConstraint("indicator", "canton_code", "year", "month"),
        Index("ix_canton_indicators_indicator_year", "indicator", "year"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    indicator: Mapped[Indicator] = mapped_column(text_enum(Indicator, "canton_indicator"))
    canton_code: Mapped[str] = mapped_column(String(4))
    year: Mapped[int] = mapped_column(Integer)
    month: Mapped[int | None] = mapped_column(Integer)
    value: Mapped[int] = mapped_column(Integer)
    source_id: Mapped[int] = mapped_column(SmallInteger, ForeignKey("sources.id"))
