"""Add reaction types (digestive, allergic) to feeding records.

Revision ID: 20261018_0018
Revises: 20261018_0017
Create Date: 2026-10-18
"""
from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = "20261018_0018"
down_revision: str | None = "20261018_0017"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Existing records get false: their reactions stay described in reaction_notes.
    with op.batch_alter_table("feeding_records") as batch_op:
        batch_op.add_column(
            sa.Column(
                "digestive_reaction", sa.Boolean(), server_default=sa.false(), nullable=False
            )
        )
        batch_op.add_column(
            sa.Column(
                "allergic_reaction", sa.Boolean(), server_default=sa.false(), nullable=False
            )
        )


def downgrade() -> None:
    with op.batch_alter_table("feeding_records") as batch_op:
        batch_op.drop_column("allergic_reaction")
        batch_op.drop_column("digestive_reaction")
