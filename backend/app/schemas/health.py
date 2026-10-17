from datetime import date, datetime, time
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.models.health import IntakeStatus, VaccinationStatus, VisitReason, VisitStatus
from app.models.pet import PetSex


def strip_text(value: str | None) -> str | None:
    if value is None:
        return None
    value = value.strip()
    if not value:
        raise ValueError("must not be blank")
    return value


def normalize_times(values: list[time]) -> list[time]:
    # Minute precision, naive wall-clock time, no duplicates, sorted.
    return sorted({value.replace(second=0, microsecond=0, tzinfo=None) for value in values})


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


# --- Symptoms ---------------------------------------------------------------------


class SymptomCreate(BaseModel):
    description: str = Field(min_length=1, max_length=2000)
    observed_at: datetime = Field(description="When the symptom was observed.")

    @field_validator("description")
    @classmethod
    def strip_fields(cls, value: str | None) -> str | None:
        return strip_text(value)


class SymptomUpdate(BaseModel):
    description: str | None = Field(default=None, min_length=1, max_length=2000)
    observed_at: datetime | None = None

    @field_validator("description")
    @classmethod
    def strip_fields(cls, value: str | None) -> str | None:
        return strip_text(value)


class SymptomPublic(ORMModel):
    id: int
    pet_id: int
    description: str
    observed_at: datetime
    created_at: datetime


# --- Allergies --------------------------------------------------------------------


class AllergyCreate(BaseModel):
    allergen: str = Field(min_length=1, max_length=255)
    reactions: str | None = Field(default=None, max_length=2000)
    notes: str | None = Field(default=None, max_length=2000)

    @field_validator("allergen", "reactions", "notes")
    @classmethod
    def strip_fields(cls, value: str | None) -> str | None:
        return strip_text(value)


class AllergyUpdate(BaseModel):
    allergen: str | None = Field(default=None, min_length=1, max_length=255)
    reactions: str | None = Field(default=None, max_length=2000)
    notes: str | None = Field(default=None, max_length=2000)

    @field_validator("allergen", "reactions", "notes")
    @classmethod
    def strip_fields(cls, value: str | None) -> str | None:
        return strip_text(value)


class AllergyPublic(ORMModel):
    id: int
    pet_id: int
    allergen: str
    reactions: str | None
    notes: str | None
    created_at: datetime


# --- Pregnancy --------------------------------------------------------------------


class PregnancyUpsert(BaseModel):
    month: int | None = Field(
        default=None,
        ge=1,
        le=9,
        description="Current month of pregnancy; the start date is derived from it.",
    )
    started_on: date | None = Field(
        default=None, description="Exact start date. Provide either this or month."
    )

    @model_validator(mode="after")
    def exactly_one(self) -> "PregnancyUpsert":
        if (self.month is None) == (self.started_on is None):
            raise ValueError("Provide exactly one of month or started_on")
        return self


class PregnancyPublic(BaseModel):
    id: int
    pet_id: int
    started_on: date
    month: int = Field(ge=1, le=9, description="Current month, counted from started_on.")
    ended_on: date | None


# --- Vaccinations -----------------------------------------------------------------


class VaccinationCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    scheduled_on: date = Field(description="Planned date, or the date it was given when done.")
    status: VaccinationStatus = VaccinationStatus.PLANNED
    clinic: str | None = Field(default=None, max_length=255)
    notes: str | None = Field(default=None, max_length=2000)

    @field_validator("name", "clinic", "notes")
    @classmethod
    def strip_fields(cls, value: str | None) -> str | None:
        return strip_text(value)


class VaccinationUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    scheduled_on: date | None = None
    status: VaccinationStatus | None = None
    clinic: str | None = Field(default=None, max_length=255)
    notes: str | None = Field(default=None, max_length=2000)

    @field_validator("name", "clinic", "notes")
    @classmethod
    def strip_fields(cls, value: str | None) -> str | None:
        return strip_text(value)


class VaccinationPublic(ORMModel):
    id: int
    pet_id: int
    name: str
    scheduled_on: date
    status: VaccinationStatus
    clinic: str | None
    notes: str | None
    created_at: datetime


# --- Medications ------------------------------------------------------------------


class MedicationCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    dose: str = Field(min_length=1, max_length=100, description='Free text, e.g. "1/2 tablet".')
    start_date: date
    end_date: date | None = Field(default=None, description="Last day of the course, inclusive.")
    interval_days: int = Field(default=1, ge=1, le=365, description="1 = every day.")
    times: list[time] = Field(
        min_length=1,
        max_length=12,
        description="Local wall-clock times of each dose on a dosing day, e.g. 09:00.",
    )
    notes: str | None = Field(default=None, max_length=2000)

    @field_validator("name", "dose", "notes")
    @classmethod
    def strip_fields(cls, value: str | None) -> str | None:
        return strip_text(value)
    @field_validator("times")
    @classmethod
    def normalize(cls, value: list[time]) -> list[time]:
        return normalize_times(value)

    @model_validator(mode="after")
    def validate_dates(self) -> "MedicationCreate":
        if self.end_date is not None and self.end_date < self.start_date:
            raise ValueError("end_date must not be before start_date")
        return self


class MedicationUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    dose: str | None = Field(default=None, min_length=1, max_length=100)
    start_date: date | None = None
    end_date: date | None = None
    interval_days: int | None = Field(default=None, ge=1, le=365)
    times: list[time] | None = Field(default=None, min_length=1, max_length=12)
    notes: str | None = Field(default=None, max_length=2000)

    @field_validator("name", "dose", "notes")
    @classmethod
    def strip_fields(cls, value: str | None) -> str | None:
        return strip_text(value)

    @field_validator("times")
    @classmethod
    def normalize(cls, value: list[time] | None) -> list[time] | None:
        return None if value is None else normalize_times(value)


class MedicationPublic(ORMModel):
    id: int
    pet_id: int
    name: str
    dose: str
    start_date: date
    end_date: date | None
    interval_days: int
    times: list[time]
    notes: str | None
    created_at: datetime

    @field_validator("times", mode="before")
    @classmethod
    def from_rows(cls, value: list) -> list:
        return [getattr(item, "time_of_day", item) for item in value]


class ScheduledDose(BaseModel):
    medication_id: int
    name: str
    dose: str
    scheduled_for: datetime = Field(description="Naive local date and time of the dose.")
    status: Literal["pending", "taken", "skipped"]


class IntakeMark(BaseModel):
    scheduled_for: datetime = Field(
        description="A dose slot from the schedule (naive local date and time)."
    )
    status: IntakeStatus


# --- Vet visits -------------------------------------------------------------------


class VetVisitCreate(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    visit_at: datetime
    doctor_name: str | None = Field(default=None, max_length=255)
    doctor_specialty: str | None = Field(default=None, max_length=255)
    reason: VisitReason
    topic: str | None = Field(
        default=None,
        max_length=255,
        description='Grouping label such as "Allergy", matched case-insensitively.',
    )
    status: VisitStatus = VisitStatus.PLANNED
    diagnosis: str | None = Field(default=None, max_length=5000)
    notes: str | None = Field(default=None, max_length=5000)
    referred_by_visit_id: int | None = Field(
        default=None, description="Earlier visit of the same pet that referred to this one."
    )

    @field_validator("title", "doctor_name", "doctor_specialty", "topic", "diagnosis", "notes")
    @classmethod
    def strip_fields(cls, value: str | None) -> str | None:
        return strip_text(value)


class VetVisitUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=255)
    visit_at: datetime | None = None
    doctor_name: str | None = Field(default=None, max_length=255)
    doctor_specialty: str | None = Field(default=None, max_length=255)
    reason: VisitReason | None = None
    topic: str | None = Field(default=None, max_length=255)
    status: VisitStatus | None = None
    diagnosis: str | None = Field(default=None, max_length=5000)
    notes: str | None = Field(default=None, max_length=5000)
    referred_by_visit_id: int | None = None

    @field_validator("title", "doctor_name", "doctor_specialty", "topic", "diagnosis", "notes")
    @classmethod
    def strip_fields(cls, value: str | None) -> str | None:
        return strip_text(value)


class VetVisitPublic(ORMModel):
    id: int
    pet_id: int
    title: str
    visit_at: datetime
    doctor_name: str | None
    doctor_specialty: str | None
    reason: VisitReason
    topic: str | None
    status: VisitStatus
    diagnosis: str | None
    notes: str | None
    referred_by_visit_id: int | None
    created_at: datetime


class VisitTopic(BaseModel):
    topic: str
    total: int
    planned: int
    completed: int
    cancelled: int


class VisitEdge(BaseModel):
    from_visit_id: int = Field(description="The referring visit.")
    to_visit_id: int = Field(description="The visit it referred to.")


class VisitTopicGraph(VisitTopic):
    visits: list[VetVisitPublic]
    edges: list[VisitEdge]


# --- Measurements -----------------------------------------------------------------


class MeasurementTemplateParameter(BaseModel):
    name: str
    unit: str


class MeasurementTemplate(BaseModel):
    key: str
    species: list[str] = Field(description="Species values (case-insensitive) that use it.")
    parameters: list[MeasurementTemplateParameter]


class MeasurementParameterCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    unit: str | None = Field(default=None, max_length=20, description='E.g. "см" or "°C".')
    sort_order: int | None = Field(
        default=None, description="Position in lists; defaults to after the last parameter."
    )

    @field_validator("name", "unit")
    @classmethod
    def strip_fields(cls, value: str | None) -> str | None:
        return strip_text(value)


class MeasurementParameterUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=100)
    unit: str | None = Field(default=None, max_length=20)
    sort_order: int | None = None

    @field_validator("name", "unit")
    @classmethod
    def strip_fields(cls, value: str | None) -> str | None:
        return strip_text(value)


class MeasurementParameterPublic(ORMModel):
    id: int
    pet_id: int
    name: str
    unit: str | None
    sort_order: int
    created_at: datetime


class MeasurementCreate(BaseModel):
    value: float = Field(allow_inf_nan=False)
    measured_at: datetime
    notes: str | None = Field(default=None, max_length=2000)

    @field_validator("notes")
    @classmethod
    def strip_fields(cls, value: str | None) -> str | None:
        return strip_text(value)


class MeasurementUpdate(BaseModel):
    value: float | None = Field(default=None, allow_inf_nan=False)
    measured_at: datetime | None = None
    notes: str | None = Field(default=None, max_length=2000)

    @field_validator("notes")
    @classmethod
    def strip_fields(cls, value: str | None) -> str | None:
        return strip_text(value)


class MeasurementPublic(ORMModel):
    id: int
    parameter_id: int
    value: float
    measured_at: datetime
    notes: str | None
    created_at: datetime


class MeasurementPoint(BaseModel):
    value: float
    measured_at: datetime


class MeasurementParameterSummary(MeasurementParameterPublic):
    latest: MeasurementPoint | None
    change: float | None = Field(description="Latest value minus the previous measurement.")
    recent: list[MeasurementPoint] = Field(description="Last points, oldest first.")


# --- Aggregates -------------------------------------------------------------------


class HealthOverview(BaseModel):
    symptoms: list[SymptomPublic] = Field(description="Most recent symptoms first.")
    symptoms_total: int
    pregnancy: PregnancyPublic | None
    allergies: list[AllergyPublic]
    medications_today: list[ScheduledDose]
    upcoming_doses: list[ScheduledDose] = Field(description="Pending doses from now on.")
    planned_vaccinations: list[VaccinationPublic]
    planned_visits: list[VetVisitPublic]
    past_visits: list[VetVisitPublic]
    top_topic: VisitTopic | None
    measurements: list[MeasurementParameterSummary]


class PetBrief(ORMModel):
    id: int
    name: str
    species: str
    sex: PetSex
    breed: str | None
    birth_date: date | None
    approximate_age_years: int | None
    weight_g: int | None


class FeedingBrief(ORMModel):
    food_name: str
    fed_at: datetime
    liked: bool
    tolerated: bool
    reaction_notes: str | None


class HealthSummary(BaseModel):
    generated_on: date
    pet: PetBrief
    owner_email: str
    recent_symptoms: list[SymptomPublic]
    last_feeding: FeedingBrief | None
    foods_in_diet: list[str] = Field(description="Distinct foods fed during the last 30 days.")
    feeding_reactions_last_week: list[FeedingBrief] = Field(
        description="Feedings of the last 7 days that were not tolerated or have reaction notes."
    )
    allergies: list[AllergyPublic]
    pregnancy: PregnancyPublic | None
    past_visits: list[VetVisitPublic]
    planned_visits: list[VetVisitPublic]
    done_vaccinations: list[VaccinationPublic]
    planned_vaccinations: list[VaccinationPublic]
    current_medications: list[MedicationPublic]
