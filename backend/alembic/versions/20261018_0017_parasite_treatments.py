"""Add parasite treatments and next-due dates for vaccinations.

Revision ID: 20261018_0017
Revises: 20261018_0016
Create Date: 2026-10-18
"""
from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = "20261018_0017"
down_revision: str | None = "20261018_0016"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def string_enum(name: str, *values: str) -> sa.Enum:
    return sa.Enum(*values, name=name, native_enum=False, create_constraint=True)


def created_at() -> sa.Column:
    return sa.Column(
        "created_at",
        sa.DateTime(timezone=True),
        server_default=sa.func.now(),
        nullable=False,
    )


def upgrade() -> None:
    op.create_table(
        "parasite_treatments",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("pet_id", sa.Integer(), nullable=False),
        sa.Column("kind", string_enum("parasite_kind", "internal", "external"), nullable=False),
        sa.Column("product_name", sa.String(length=255), nullable=False),
        sa.Column("treated_on", sa.Date(), nullable=False),
        sa.Column("interval_days", sa.Integer(), nullable=True),
        sa.Column("next_due_on", sa.Date(), nullable=True),
        sa.Column("clinic", sa.String(length=255), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        created_at(),
        sa.ForeignKeyConstraint(["pet_id"], ["pets.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_parasite_treatments_pet_id", "parasite_treatments", ["pet_id"])

    with op.batch_alter_table("vaccinations") as batch:
        batch.add_column(sa.Column("interval_days", sa.Integer(), nullable=True))
        batch.add_column(sa.Column("next_due_on", sa.Date(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("vaccinations") as batch:
        batch.drop_column("next_due_on")
        batch.drop_column("interval_days")

    op.drop_index("ix_parasite_treatments_pet_id", table_name="parasite_treatments")
    op.drop_table("parasite_treatments")
