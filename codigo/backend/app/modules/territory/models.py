"""Canton boundaries and cantonal population projections.

`Canton` carries the geometry used to derive a centroid for coordinate-less
homicides (see `app.modules.ingestion.adapters.mdi_homicidios`) and, later,
any canton-boundary map layer. `CantonPopulation` is the INEC population
projection used by the statistics API to turn a raw count into a rate per
100.000 inhabitants (see `app.modules.stats`).

Neither table declares a foreign key to `admin_units`: like
`incidents.canton_code`/`detentions.canton_code`, the DPA code is stored as a
plain string so each ingestion pipeline (incidents, cantons, population) can
run independently of the others' load order.
"""

from sqlalchemy import Integer, SmallInteger, String
from sqlalchemy.orm import Mapped, mapped_column

from app.database.base import Base
from app.database.types import MultiPolygon, Point


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
