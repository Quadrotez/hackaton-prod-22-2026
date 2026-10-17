"""Create pet weight history.

Revision ID: 20261017_0014
Revises: 20261017_0013
Create Date: 2026-10-17
"""
from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = "20261017_0014"
down_revision: str | None = "20261017_0013"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "pet_weights",
        sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
        sa.Column("pet_id", sa.Integer(), nullable=False),
        sa.Column("weight_g", sa.Integer(), nullable=False),
        sa.Column("measured_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["pet_id"], ["pets.id"], ondelete="CASCADE"),
    )
    op.create_index(
        "ix_pet_weights_pet_id_measured_at",
        "pet_weights",
        ["pet_id", "measured_at"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_pet_weights_pet_id_measured_at", table_name="pet_weights")
    op.drop_table("pet_weights")
