"""Create pet transfers table.

Revision ID: 20261017_0015
Revises: 20261017_0014
Create Date: 2026-10-17
"""
from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = "20261017_0015"
down_revision: str | None = "20261017_0014"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


OPEN_STATUSES = "status IN ('pending', 'accepted', 'return_requested')"


def upgrade() -> None:
    op.create_table(
        "pet_transfers",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("pet_id", sa.Integer(), nullable=False),
        sa.Column("owner_id", sa.Integer(), nullable=False),
        sa.Column("recipient_email", sa.String(length=320), nullable=False),
        sa.Column("recipient_id", sa.Integer(), nullable=True),
        sa.Column(
            "duration",
            sa.Enum(
                "week",
                "month",
                "three_months",
                "indefinite",
                name="transfer_duration",
                native_enum=False,
                create_constraint=True,
            ),
            nullable=False,
        ),
        sa.Column("ends_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "status",
            sa.Enum(
                "pending",
                "accepted",
                "return_requested",
                "returned",
                "declined",
                "cancelled",
                "expired",
                name="transfer_status",
                native_enum=False,
                create_constraint=True,
            ),
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column("responded_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("return_requested_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("ended_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["pet_id"], ["pets.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["owner_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["recipient_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_pet_transfers_pet_id", "pet_transfers", ["pet_id"])
    op.create_index("ix_pet_transfers_owner_id", "pet_transfers", ["owner_id"])
    op.create_index("ix_pet_transfers_recipient_email", "pet_transfers", ["recipient_email"])
    op.create_index(
        "uq_pet_transfers_open_pet",
        "pet_transfers",
        ["pet_id"],
        unique=True,
        postgresql_where=sa.text(OPEN_STATUSES),
        sqlite_where=sa.text(OPEN_STATUSES),
    )


def downgrade() -> None:
    op.drop_index("uq_pet_transfers_open_pet", table_name="pet_transfers")
    op.drop_index("ix_pet_transfers_recipient_email", table_name="pet_transfers")
    op.drop_index("ix_pet_transfers_owner_id", table_name="pet_transfers")
    op.drop_index("ix_pet_transfers_pet_id", table_name="pet_transfers")
    op.drop_table("pet_transfers")
