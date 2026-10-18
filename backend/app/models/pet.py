from datetime import date
from enum import StrEnum

from sqlalchemy import Date, Enum, ForeignKey, Index, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class PetSex(StrEnum):
    BOY = "boy"
    GIRL = "girl"


class Pet(Base):
    __tablename__ = "pets"
    __table_args__ = (Index("ix_pets_user_id", "user_id"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    species: Mapped[str] = mapped_column(String(100), nullable=False)
    sex: Mapped[PetSex] = mapped_column(
        Enum(
            PetSex,
            name="pet_sex",
            native_enum=False,
            create_constraint=True,
            validate_strings=True,
            values_callable=lambda enum_class: [member.value for member in enum_class],
        ),
        nullable=False,
    )
    breed: Mapped[str | None] = mapped_column(String(255), nullable=True)
    birth_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    approximate_age_years: Mapped[int | None] = mapped_column(Integer, nullable=True)
    weight_g: Mapped[int | None] = mapped_column(Integer, nullable=True)
    photo_url: Mapped[str | None] = mapped_column(String(500), nullable=True)

    user = relationship("User", back_populates="pets")
    feeding_records = relationship(
        "FeedingRecord", back_populates="pet", cascade="all, delete-orphan"
    )
    # Health records: listed only so that deleting a pet through the ORM removes them.
    symptoms = relationship("Symptom", cascade="all, delete-orphan")
    allergies = relationship("Allergy", cascade="all, delete-orphan")
    pregnancies = relationship("Pregnancy", cascade="all, delete-orphan")
    vaccinations = relationship("Vaccination", cascade="all, delete-orphan")
    parasite_treatments = relationship("ParasiteTreatment", cascade="all, delete-orphan")
    medications = relationship("Medication", cascade="all, delete-orphan")
    vet_visits = relationship("VetVisit", back_populates="pet", cascade="all, delete-orphan")
    measurement_parameters = relationship("MeasurementParameter", cascade="all, delete-orphan")
    measurement_profile = relationship(
        "MeasurementProfile", cascade="all, delete-orphan", uselist=False
    )
    weight_history = relationship(
        "PetWeight", back_populates="pet", cascade="all, delete-orphan"
    )
    transfers = relationship("PetTransfer", back_populates="pet", cascade="all, delete-orphan")
