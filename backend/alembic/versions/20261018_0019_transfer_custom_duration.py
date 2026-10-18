"""Allow a transfer with an end date chosen by the owner (duration "custom").

Revision ID: 20261018_0019
Revises: 20261018_0018
Create Date: 2026-10-18
"""
from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = "20261018_0019"
down_revision: str | None = "20261018_0018"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

OLD = ("week", "month", "three_months", "indefinite")
NEW = (*OLD, "custom")
CONSTRAINT = "transfer_duration"


def duration_type(values: tuple[str, ...]) -> sa.Enum:
    return sa.Enum(*values, name=CONSTRAINT, native_enum=False, create_constraint=True)


def check_sql(values: tuple[str, ...]) -> str:
    return "duration IN (" + ", ".join(f"'{value}'" for value in values) + ")"


def replace_check(old: tuple[str, ...], new: tuple[str, ...]) -> None:
    if op.get_bind().dialect.name == "sqlite":
        # SQLite cannot alter a CHECK: batch mode rebuilds the table with the new type.
        with op.batch_alter_table("pet_transfers") as batch_op:
            batch_op.alter_column(
                "duration", existing_type=duration_type(old), type_=duration_type(new),
                existing_nullable=False,
            )
        return
    # The column is VARCHAR(12) already, wide enough for "custom".
    op.drop_constraint(CONSTRAINT, "pet_transfers", type_="check")
    op.create_check_constraint(CONSTRAINT, "pet_transfers", check_sql(new))


def upgrade() -> None:
    replace_check(OLD, NEW)


def downgrade() -> None:
    # Custom transfers keep their end date and become a fixed one-week-like record.
    op.execute("UPDATE pet_transfers SET duration = 'week' WHERE duration = 'custom'")
    replace_check(NEW, OLD)
