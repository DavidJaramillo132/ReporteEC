"""Core `Table` objects for the read-only map views, on their own MetaData.

`map_incidents` and `map_detentions` exist only as `CREATE VIEW` statements
(see the `admin_units_and_map_views` migration) -- never as tables Alembic
manages. Declaring them here, instead of on `Base.metadata`, keeps Alembic
autogenerate from ever proposing to create or drop them as tables while still
letting the API build typed, parameterized queries against them with
SQLAlchemy Core, sharing the exact same "visible on the map" definition that
Martin's tiles use.
"""

from geoalchemy2 import Geometry
from sqlalchemy import BigInteger, Column, Integer, MetaData, String, Table

metadata = MetaData()

map_incidents = Table(
    "map_incidents",
    metadata,
    Column("id", BigInteger, primary_key=True),
    Column("type", String(32)),
    Column("confidence", String(32)),
    Column("geom", Geometry(geometry_type="POINT", srid=4326)),
    Column("year", Integer),
    Column("month", Integer),
    Column("province_code", String(2)),
    Column("canton_code", String(4)),
)

map_detentions = Table(
    "map_detentions",
    metadata,
    Column("id", BigInteger, primary_key=True),
    Column("geom", Geometry(geometry_type="POINT", srid=4326)),
    Column("year", Integer),
    Column("month", Integer),
    Column("province_code", String(2)),
    Column("canton_code", String(4)),
    Column("detention_type", String(32)),
)
