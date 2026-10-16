"""Add approximate age and weight to pets.

Revision ID: 20261016_0003
Revises: 20261016_0002
Create Date: 2026-10-16
"""
from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = "20261016_0003"
down_revision: str | None = "20261016_0002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "pets", sa.Column("approximate_age_years", sa.Integer(), nullable=True)
    )
    op.add_column("pets", sa.Column("weight_g", sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_column("pets", "weight_g")
    op.drop_column("pets", "approximate_age_years")
