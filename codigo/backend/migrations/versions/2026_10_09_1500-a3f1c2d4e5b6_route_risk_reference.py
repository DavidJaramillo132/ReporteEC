"""route risk reference

Revision ID: a3f1c2d4e5b6
Revises: 92eafee9aa9d
Create Date: 2026-10-09 15:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = 'a3f1c2d4e5b6'
down_revision: Union[str, Sequence[str], None] = '92eafee9aa9d'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table('route_risk_reference',
    sa.Column('id', sa.BigInteger(), nullable=False),
    sa.Column('breakpoints', postgresql.ARRAY(sa.Float()), nullable=False),
    sa.Column('routes_ok', sa.Integer(), nullable=False),
    sa.Column('routes_skipped', sa.Integer(), nullable=False),
    sa.Column('exposures_count', sa.Integer(), nullable=False),
    sa.Column('data_cut', sa.DateTime(timezone=True), nullable=True),
    sa.Column('data_version', sa.Text(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_route_risk_reference'))
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_table('route_risk_reference')
