"""Add feeding amount and food stock check constraints.

Revision ID: 20261017_0010
Revises: 20261017_0009
Create Date: 2026-10-17
"""
from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = "20261017_0010"
down_revision: str | None = "20261017_0009"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Bring existing rows in line with the new constraints before adding them.
    op.execute("UPDATE food_stocks SET remaining_grams = 0 WHERE remaining_grams < 0")
    op.execute(
        "UPDATE food_stocks SET remaining_grams = total_grams "
        "WHERE remaining_grams > total_grams"
    )

    with op.batch_alter_table("feeding_records") as batch_op:
        batch_op.add_column(sa.Column("amount_grams", sa.Integer(), nullable=True))
        batch_op.create_check_constraint(
            "ck_feeding_records_amount_grams_positive",
            "amount_grams IS NULL OR amount_grams > 0",
        )

    with op.batch_alter_table("food_stocks") as batch_op:
        batch_op.create_check_constraint(
            "ck_food_stocks_total_grams_positive", "total_grams > 0"
        )
        batch_op.create_check_constraint(
            "ck_food_stocks_remaining_grams_range",
            "remaining_grams >= 0 AND remaining_grams <= total_grams",
        )


def downgrade() -> None:
    with op.batch_alter_table("food_stocks") as batch_op:
        batch_op.drop_constraint("ck_food_stocks_remaining_grams_range", type_="check")
        batch_op.drop_constraint("ck_food_stocks_total_grams_positive", type_="check")

    with op.batch_alter_table("feeding_records") as batch_op:
        batch_op.drop_constraint("ck_feeding_records_amount_grams_positive", type_="check")
        batch_op.drop_column("amount_grams")
