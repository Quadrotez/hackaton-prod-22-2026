"""Create pet measurement tables.

Revision ID: 20261017_0011
Revises: 20261017_0010
Create Date: 2026-10-17
"""
from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = "20261017_0011"
down_revision: str | None = "20261017_0010"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "measurement_profiles",
        sa.Column("pet_id", sa.Integer(), nullable=False),
        sa.Column("template", sa.String(length=50), nullable=True),
        sa.Column(
            "initialized_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["pet_id"], ["pets.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("pet_id"),
    )

    op.create_table(
        "measurement_parameters",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("pet_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column("unit", sa.String(length=20), nullable=True),
        sa.Column("sort_order", sa.Integer(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["pet_id"], ["pets.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_measurement_parameters_pet_id", "measurement_parameters", ["pet_id"]
    )

    op.create_table(
        "measurements",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("parameter_id", sa.Integer(), nullable=False),
        sa.Column("value", sa.Numeric(precision=12, scale=3), nullable=False),
        sa.Column("measured_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["parameter_id"], ["measurement_parameters.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_measurements_parameter_measured_at",
        "measurements",
        ["parameter_id", "measured_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_measurements_parameter_measured_at", table_name="measurements")
    op.drop_table("measurements")
    op.drop_index("ix_measurement_parameters_pet_id", table_name="measurement_parameters")
    op.drop_table("measurement_parameters")
    op.drop_table("measurement_profiles")
