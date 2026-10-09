"""route reference metric

Revision ID: c4e8a1b2d3f5
Revises: b7d2e9f0a1c3
Create Date: 2026-10-10 09:00:00.000000

The score moved from a trip's total exposure to danger per km (density).
Existing rows hold exposure breakpoints, so they are marked
'exposure_total' and the service never scores with them. New rows must
name their metric (no server default). `exposures_count` becomes
`values_count`: it counts route x hour values of whichever metric.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'c4e8a1b2d3f5'
down_revision: Union[str, Sequence[str], None] = 'b7d2e9f0a1c3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column(
        'route_risk_reference',
        sa.Column('metric', sa.Text(), server_default='exposure_total', nullable=False),
    )
    op.alter_column('route_risk_reference', 'metric', server_default=None)
    op.alter_column('route_risk_reference', 'exposures_count', new_column_name='values_count')


def downgrade() -> None:
    """Downgrade schema.

    Density rows are deleted: the previous code reads the newest row as
    exposure breakpoints and would score with the wrong scale.
    """
    op.execute("DELETE FROM route_risk_reference WHERE metric <> 'exposure_total'")
    op.alter_column('route_risk_reference', 'values_count', new_column_name='exposures_count')
    op.drop_column('route_risk_reference', 'metric')
