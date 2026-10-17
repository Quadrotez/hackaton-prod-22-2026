"""Link feeding records to the user's food catalog.

Revision ID: 20261017_0008
Revises: 20261017_0007
Create Date: 2026-10-17
"""
from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = "20261017_0008"
down_revision: str | None = "20261017_0007"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table("feeding_records") as batch_op:
        batch_op.add_column(sa.Column("food_id", sa.Integer(), nullable=True))
        batch_op.create_index(
            "ix_feeding_records_food_id", ["food_id"], unique=False
        )
        batch_op.create_foreign_key(
            "fk_feeding_records_food_id_foods",
            "foods",
            ["food_id"],
            ["id"],
            ondelete="SET NULL",
        )


def downgrade() -> None:
    with op.batch_alter_table("feeding_records") as batch_op:
        batch_op.drop_constraint("fk_feeding_records_food_id_foods", type_="foreignkey")
        batch_op.drop_index("ix_feeding_records_food_id")
        batch_op.drop_column("food_id")
