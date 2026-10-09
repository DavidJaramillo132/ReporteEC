"""canton seats

Revision ID: b7d2e9f0a1c3
Revises: a3f1c2d4e5b6
Create Date: 2026-10-09 21:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from geoalchemy2 import Geometry

# revision identifiers, used by Alembic.
revision: str = 'b7d2e9f0a1c3'
down_revision: Union[str, Sequence[str], None] = 'a3f1c2d4e5b6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('cantons', sa.Column('seat_name', sa.String(length=128), nullable=True))
    op.add_column('cantons', sa.Column('seat_geom', Geometry(geometry_type='POINT', srid=4326, dimension=2, spatial_index=False, from_text='ST_GeomFromEWKT', name='geometry'), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('cantons', 'seat_geom')
    op.drop_column('cantons', 'seat_name')
