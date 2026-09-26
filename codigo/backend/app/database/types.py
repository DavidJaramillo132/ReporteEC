"""Column types shared across modules."""

from enum import StrEnum

from geoalchemy2 import Geometry
from sqlalchemy import Enum


def text_enum(enum_cls: type[StrEnum], name: str) -> Enum:
    """Store a StrEnum as VARCHAR plus a CHECK constraint.

    A native PostgreSQL ENUM cannot drop or rename values inside a
    transaction; a CHECK constraint is replaced with a plain migration when a
    new incident type or status arrives.
    """
    return Enum(
        enum_cls,
        name=name,
        native_enum=False,
        create_constraint=True,
        length=32,
        values_callable=lambda members: [member.value for member in members],
    )


# WGS84 points, the reference system of every official dataset and of Martin.
Point = Geometry(geometry_type="POINT", srid=4326, spatial_index=True)
