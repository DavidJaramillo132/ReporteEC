"""Core `Table` objects for the read-only map views, on their own MetaData.

`map_incidents`, `map_detentions` and `map_cantons` exist only as `CREATE
VIEW` statements (see the `admin_units_and_map_views` and
`canton_indicators_and_map_cantons` migrations) -- never as tables Alembic
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

# The first polygon layer: canton boundaries, simplified for tile-friendly
# size (see the migration for the exact ST_SimplifyPreserveTopology
# tolerance). No `id` column -- a canton has no natural integer id, `code` is
# a 4-char string -- so Martin's config carries no `id_column` and the
# frontend keys feature-state off the `code` property itself
# (MapLibre's `promoteId: 'code'`).
map_cantons = Table(
    "map_cantons",
    metadata,
    Column("code", String(4)),
    Column("name", String(128)),
    Column("province_code", String(2)),
    Column("geom", Geometry(geometry_type="MULTIPOLYGON", srid=4326)),
)
