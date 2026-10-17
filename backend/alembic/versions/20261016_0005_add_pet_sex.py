"""Add required sex to pets.

Revision ID: 20261016_0005
Revises: 20261016_0004
Create Date: 2026-10-16
"""
from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = "20261016_0005"
down_revision: str | None = "20261016_0004"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


SEX_CHECK_CONSTRAINT = "ck_pets_pet_sex"


def upgrade() -> None:
    op.add_column(
        "pets",
        sa.Column("sex", sa.String(length=4), nullable=True),
    )
    op.execute(sa.text("UPDATE pets SET sex = 'boy' WHERE sex IS NULL"))
    with op.batch_alter_table("pets") as batch_op:
        batch_op.alter_column(
            "sex",
            existing_type=sa.String(length=4),
            nullable=False,
        )
        batch_op.create_check_constraint(
            SEX_CHECK_CONSTRAINT,
            "sex IN ('boy', 'girl')",
        )


def downgrade() -> None:
    with op.batch_alter_table("pets") as batch_op:
        batch_op.drop_constraint(SEX_CHECK_CONSTRAINT, type_="check")
        batch_op.drop_column("sex")
