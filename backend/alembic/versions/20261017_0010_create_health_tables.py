"""Create pet health tables.

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


def string_enum(name: str, *values: str) -> sa.Enum:
    return sa.Enum(*values, name=name, native_enum=False, create_constraint=True)


def created_at() -> sa.Column:
    return sa.Column(
        "created_at",
        sa.DateTime(timezone=True),
        server_default=sa.func.now(),
        nullable=False,
    )


def pet_fk() -> sa.ForeignKeyConstraint:
    return sa.ForeignKeyConstraint(["pet_id"], ["pets.id"], ondelete="CASCADE")


def upgrade() -> None:
    op.create_table(
        "symptoms",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("pet_id", sa.Integer(), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("observed_at", sa.DateTime(timezone=True), nullable=False),
        created_at(),
        pet_fk(),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_symptoms_pet_id", "symptoms", ["pet_id"])

    op.create_table(
        "allergies",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("pet_id", sa.Integer(), nullable=False),
        sa.Column("allergen", sa.String(length=255), nullable=False),
        sa.Column("reactions", sa.Text(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        created_at(),
        pet_fk(),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_allergies_pet_id", "allergies", ["pet_id"])

    op.create_table(
        "pregnancies",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("pet_id", sa.Integer(), nullable=False),
        sa.Column("started_on", sa.Date(), nullable=False),
        sa.Column("ended_on", sa.Date(), nullable=True),
        created_at(),
        pet_fk(),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_pregnancies_pet_id", "pregnancies", ["pet_id"])
    op.create_index(
        "uq_pregnancies_active_pet",
        "pregnancies",
        ["pet_id"],
        unique=True,
        postgresql_where=sa.text("ended_on IS NULL"),
        sqlite_where=sa.text("ended_on IS NULL"),
    )

    op.create_table(
        "vaccinations",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("pet_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("scheduled_on", sa.Date(), nullable=False),
        sa.Column("status", string_enum("vaccination_status", "planned", "done"), nullable=False),
        sa.Column("clinic", sa.String(length=255), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        created_at(),
        pet_fk(),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_vaccinations_pet_id", "vaccinations", ["pet_id"])

    op.create_table(
        "medications",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("pet_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("dose", sa.String(length=100), nullable=False),
        sa.Column("start_date", sa.Date(), nullable=False),
        sa.Column("end_date", sa.Date(), nullable=True),
        sa.Column("interval_days", sa.Integer(), nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        created_at(),
        pet_fk(),
        sa.PrimaryKeyConstraint("id"),
        sa.CheckConstraint("interval_days >= 1", name="ck_medications_interval_days"),
    )
    op.create_index("ix_medications_pet_id", "medications", ["pet_id"])

    op.create_table(
        "medication_times",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("medication_id", sa.Integer(), nullable=False),
        sa.Column("time_of_day", sa.Time(), nullable=False),
        sa.ForeignKeyConstraint(["medication_id"], ["medications.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("medication_id", "time_of_day", name="uq_medication_times_time"),
    )

    op.create_table(
        "medication_intakes",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("medication_id", sa.Integer(), nullable=False),
        sa.Column("scheduled_for", sa.DateTime(timezone=False), nullable=False),
        sa.Column("status", string_enum("intake_status", "taken", "skipped"), nullable=False),
        sa.Column(
            "recorded_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["medication_id"], ["medications.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("medication_id", "scheduled_for", name="uq_medication_intakes_slot"),
    )

    op.create_table(
        "vet_visits",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("pet_id", sa.Integer(), nullable=False),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("visit_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("doctor_name", sa.String(length=255), nullable=True),
        sa.Column("doctor_specialty", sa.String(length=255), nullable=True),
        sa.Column(
            "reason",
            string_enum("visit_reason", "illness", "examination", "vaccination", "checkup"),
            nullable=False,
        ),
        sa.Column("topic", sa.String(length=255), nullable=True),
        sa.Column(
            "status",
            string_enum("visit_status", "planned", "completed", "cancelled"),
            nullable=False,
        ),
        sa.Column("diagnosis", sa.Text(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("referred_by_visit_id", sa.Integer(), nullable=True),
        created_at(),
        pet_fk(),
        sa.ForeignKeyConstraint(
            ["referred_by_visit_id"], ["vet_visits.id"], ondelete="SET NULL"
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_vet_visits_pet_id", "vet_visits", ["pet_id"])
    op.create_index("ix_vet_visits_referred_by", "vet_visits", ["referred_by_visit_id"])


def downgrade() -> None:
    op.drop_index("ix_vet_visits_referred_by", table_name="vet_visits")
    op.drop_index("ix_vet_visits_pet_id", table_name="vet_visits")
    op.drop_table("vet_visits")
    op.drop_table("medication_intakes")
    op.drop_table("medication_times")
    op.drop_index("ix_medications_pet_id", table_name="medications")
    op.drop_table("medications")
    op.drop_index("ix_vaccinations_pet_id", table_name="vaccinations")
    op.drop_table("vaccinations")
    op.drop_index("uq_pregnancies_active_pet", table_name="pregnancies")
    op.drop_index("ix_pregnancies_pet_id", table_name="pregnancies")
    op.drop_table("pregnancies")
    op.drop_index("ix_allergies_pet_id", table_name="allergies")
    op.drop_table("allergies")
    op.drop_index("ix_symptoms_pet_id", table_name="symptoms")
    op.drop_table("symptoms")
