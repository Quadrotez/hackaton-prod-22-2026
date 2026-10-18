from datetime import date, datetime, time
from enum import StrEnum

from sqlalchemy import (
    CheckConstraint,
    Date,
    DateTime,
    Enum,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    Time,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


def string_enum(enum_class: type[StrEnum], name: str) -> Enum:
    # Stored as VARCHAR + CHECK, same as pets.sex, so SQLite tests and Postgres agree.
    return Enum(
        enum_class,
        name=name,
        native_enum=False,
        create_constraint=True,
        validate_strings=True,
        values_callable=lambda members: [member.value for member in members],
    )


class VaccinationStatus(StrEnum):
    PLANNED = "planned"
    DONE = "done"


class VisitReason(StrEnum):
    ILLNESS = "illness"
    EXAMINATION = "examination"
    VACCINATION = "vaccination"
    CHECKUP = "checkup"


class VisitStatus(StrEnum):
    PLANNED = "planned"
    COMPLETED = "completed"
    CANCELLED = "cancelled"


class IntakeStatus(StrEnum):
    TAKEN = "taken"
    SKIPPED = "skipped"


class ParasiteKind(StrEnum):
    INTERNAL = "internal"  # internal parasites (helminths etc.)
    EXTERNAL = "external"  # external parasites (fleas, ticks)


class Symptom(Base):
    __tablename__ = "symptoms"
    __table_args__ = (Index("ix_symptoms_pet_id", "pet_id"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    pet_id: Mapped[int] = mapped_column(ForeignKey("pets.id", ondelete="CASCADE"), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    observed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class Allergy(Base):
    __tablename__ = "allergies"
    __table_args__ = (Index("ix_allergies_pet_id", "pet_id"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    pet_id: Mapped[int] = mapped_column(ForeignKey("pets.id", ondelete="CASCADE"), nullable=False)
    allergen: Mapped[str] = mapped_column(String(255), nullable=False)
    reactions: Mapped[str | None] = mapped_column(Text, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class Pregnancy(Base):
    __tablename__ = "pregnancies"
    __table_args__ = (
        Index("ix_pregnancies_pet_id", "pet_id"),
        # At most one active (not ended) pregnancy per pet.
        Index(
            "uq_pregnancies_active_pet",
            "pet_id",
            unique=True,
            postgresql_where=text("ended_on IS NULL"),
            sqlite_where=text("ended_on IS NULL"),
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    pet_id: Mapped[int] = mapped_column(ForeignKey("pets.id", ondelete="CASCADE"), nullable=False)
    started_on: Mapped[date] = mapped_column(Date, nullable=False)
    ended_on: Mapped[date | None] = mapped_column(Date, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class Vaccination(Base):
    __tablename__ = "vaccinations"
    __table_args__ = (Index("ix_vaccinations_pet_id", "pet_id"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    pet_id: Mapped[int] = mapped_column(ForeignKey("pets.id", ondelete="CASCADE"), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    scheduled_on: Mapped[date] = mapped_column(Date, nullable=False)
    status: Mapped[VaccinationStatus] = mapped_column(
        string_enum(VaccinationStatus, "vaccination_status"), nullable=False
    )
    clinic: Mapped[str | None] = mapped_column(String(255), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Optional booster interval; when set, next_due_on is derived server-side.
    interval_days: Mapped[int | None] = mapped_column(Integer, nullable=True)
    next_due_on: Mapped[date | None] = mapped_column(Date, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class ParasiteTreatment(Base):
    __tablename__ = "parasite_treatments"
    __table_args__ = (Index("ix_parasite_treatments_pet_id", "pet_id"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    pet_id: Mapped[int] = mapped_column(ForeignKey("pets.id", ondelete="CASCADE"), nullable=False)
    kind: Mapped[ParasiteKind] = mapped_column(
        string_enum(ParasiteKind, "parasite_kind"), nullable=False
    )
    product_name: Mapped[str] = mapped_column(String(255), nullable=False)
    treated_on: Mapped[date] = mapped_column(Date, nullable=False)
    interval_days: Mapped[int | None] = mapped_column(Integer, nullable=True)
    next_due_on: Mapped[date | None] = mapped_column(Date, nullable=True)
    clinic: Mapped[str | None] = mapped_column(String(255), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class Medication(Base):
    __tablename__ = "medications"
    __table_args__ = (
        Index("ix_medications_pet_id", "pet_id"),
        CheckConstraint("interval_days >= 1", name="ck_medications_interval_days"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    pet_id: Mapped[int] = mapped_column(ForeignKey("pets.id", ondelete="CASCADE"), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    dose: Mapped[str] = mapped_column(String(100), nullable=False)
    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    end_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    interval_days: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    # Eager by default: times are part of every medication response and async
    # sessions cannot lazy-load.
    times = relationship(
        "MedicationTime",
        cascade="all, delete-orphan",
        lazy="selectin",
        order_by="MedicationTime.time_of_day",
    )
    intakes = relationship("MedicationIntake", cascade="all, delete-orphan")


class MedicationTime(Base):
    __tablename__ = "medication_times"
    __table_args__ = (
        UniqueConstraint("medication_id", "time_of_day", name="uq_medication_times_time"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    medication_id: Mapped[int] = mapped_column(
        ForeignKey("medications.id", ondelete="CASCADE"), nullable=False
    )
    # Wall-clock time in the owner's timezone, e.g. 09:00.
    time_of_day: Mapped[time] = mapped_column(Time, nullable=False)


class MedicationIntake(Base):
    __tablename__ = "medication_intakes"
    __table_args__ = (
        UniqueConstraint("medication_id", "scheduled_for", name="uq_medication_intakes_slot"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    medication_id: Mapped[int] = mapped_column(
        ForeignKey("medications.id", ondelete="CASCADE"), nullable=False
    )
    # Naive local date and time of the scheduled dose this mark belongs to.
    scheduled_for: Mapped[datetime] = mapped_column(DateTime(timezone=False), nullable=False)
    status: Mapped[IntakeStatus] = mapped_column(
        string_enum(IntakeStatus, "intake_status"), nullable=False
    )
    recorded_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class VetVisit(Base):
    __tablename__ = "vet_visits"
    __table_args__ = (
        Index("ix_vet_visits_pet_id", "pet_id"),
        Index("ix_vet_visits_user_id", "user_id"),
        Index("ix_vet_visits_referred_by", "referred_by_visit_id"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    pet_id: Mapped[int] = mapped_column(ForeignKey("pets.id", ondelete="CASCADE"), nullable=False)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    # Legacy API names are retained for compatibility; the analyzer maps
    # veterinarian_name -> doctor_name, veterinarian_profession -> doctor_specialty,
    # and visit_reason -> reason.
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    visit_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    doctor_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    doctor_specialty: Mapped[str | None] = mapped_column(String(255), nullable=True)
    reason: Mapped[str] = mapped_column(Text, nullable=False)
    visit_price: Mapped[float | None] = mapped_column(Numeric(12, 2), nullable=True)
    clinic: Mapped[str | None] = mapped_column(String(255), nullable=True)
    post_visit_instructions: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Free-form grouping label such as "Allergy"; compared case-insensitively.
    topic: Mapped[str | None] = mapped_column(String(255), nullable=True)
    status: Mapped[VisitStatus] = mapped_column(
        string_enum(VisitStatus, "visit_status"), nullable=False
    )
    diagnosis: Mapped[str | None] = mapped_column(Text, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    referred_by_visit_id: Mapped[int | None] = mapped_column(
        ForeignKey("vet_visits.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    pet = relationship("Pet", back_populates="vet_visits")
    user = relationship("User", back_populates="vet_visits")

    @property
    def visit_reason(self) -> str:
        return self.reason

    @property
    def veterinarian_name(self) -> str | None:
        return self.doctor_name

    @property
    def veterinarian_profession(self) -> str | None:
        return self.doctor_specialty

    @property
    def vet(self) -> str | None:
        return self.clinic


class MeasurementProfile(Base):
    """Marks that a pet's measurement parameters were initialized, so a template is
    applied once and parameters the owner deleted do not come back."""

    __tablename__ = "measurement_profiles"

    pet_id: Mapped[int] = mapped_column(
        ForeignKey("pets.id", ondelete="CASCADE"), primary_key=True
    )
    # Key of the template applied at initialization; None when the species has none.
    template: Mapped[str | None] = mapped_column(String(50), nullable=True)
    initialized_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class MeasurementParameter(Base):
    __tablename__ = "measurement_parameters"
    __table_args__ = (Index("ix_measurement_parameters_pet_id", "pet_id"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    pet_id: Mapped[int] = mapped_column(ForeignKey("pets.id", ondelete="CASCADE"), nullable=False)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    unit: Mapped[str | None] = mapped_column(String(20), nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    measurements = relationship("Measurement", cascade="all, delete-orphan")


class Measurement(Base):
    __tablename__ = "measurements"
    __table_args__ = (
        Index("ix_measurements_parameter_measured_at", "parameter_id", "measured_at"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    parameter_id: Mapped[int] = mapped_column(
        ForeignKey("measurement_parameters.id", ondelete="CASCADE"), nullable=False
    )
    value: Mapped[float] = mapped_column(Numeric(12, 3, asdecimal=False), nullable=False)
    measured_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
