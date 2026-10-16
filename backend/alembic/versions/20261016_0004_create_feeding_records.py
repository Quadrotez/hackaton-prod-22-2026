"""Create feeding records table.

Revision ID: 20261016_0004
Revises: 20261016_0003
Create Date: 2026-10-16
"""
from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = "20261016_0004"
down_revision: str | None = "20261016_0003"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "feeding_records",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("pet_id", sa.Integer(), nullable=False),
        sa.Column("food_name", sa.String(length=255), nullable=False),
        sa.Column("fed_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("liked", sa.Boolean(), nullable=False),
        sa.Column("tolerated", sa.Boolean(), nullable=False),
        sa.Column("reaction_notes", sa.Text(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["pet_id"], ["pets.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_feeding_records_pet_food_name",
        "feeding_records",
        ["pet_id", "food_name"],
        unique=False,
    )
    op.create_index(
        "ix_feeding_records_pet_id", "feeding_records", ["pet_id"], unique=False
    )


def downgrade() -> None:
    op.drop_index("ix_feeding_records_pet_id", table_name="feeding_records")
    op.drop_index("ix_feeding_records_pet_food_name", table_name="feeding_records")
    op.drop_table("feeding_records")
