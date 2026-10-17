from datetime import date

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.models.pet import PetSex


AGE_FIELDS_DESCRIPTION = (
    "Specify either birth_date or approximate_age_years, but not both. "
    "Both may be omitted when the pet's age is unknown."
)


class PetCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    species: str = Field(min_length=1, max_length=100)
    sex: PetSex = Field(description="Pet sex: boy or girl.")
    breed: str | None = Field(default=None, max_length=255)
    birth_date: date | None = Field(
        default=None,
        description=(
            "Exact date of birth. This is preferred when known and must not be "
            "provided together with approximate_age_years."
        ),
    )
    approximate_age_years: int | None = Field(
        default=None,
        ge=0,
        le=100,
        description=(
            "Approximate age in full years (0 to 100), used instead of birth_date "
            "when the exact date is unknown. Must not be provided together with birth_date."
        ),
    )
    weight_g: int = Field(
        gt=0,
        description="Pet weight in grams. Must be a positive integer and is required on creation.",
    )

    @field_validator("name", "species", "breed")
    @classmethod
    def strip_text(cls, value: str | None) -> str | None:
        if value is None:
            return None
        value = value.strip()
        if not value:
            raise ValueError("must not be blank")
        return value

    @model_validator(mode="after")
    def validate_age_fields(self) -> "PetCreate":
        if self.birth_date is not None and self.approximate_age_years is not None:
            raise ValueError("birth_date and approximate_age_years cannot both be provided")
        return self

    model_config = ConfigDict(
        title="PetCreate",
        json_schema_extra={
            "description": AGE_FIELDS_DESCRIPTION,
            "not": {
                "required": ["birth_date", "approximate_age_years"],
                "properties": {
                    "birth_date": {"type": "string"},
                    "approximate_age_years": {"type": "integer"},
                },
            },
        },
    )


class PetUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    species: str | None = Field(default=None, min_length=1, max_length=100)
    sex: PetSex | None = Field(default=None, description="Pet sex: boy or girl.")
    breed: str | None = Field(default=None, max_length=255)
    birth_date: date | None = Field(
        default=None,
        description=(
            "Exact date of birth. Preferred when known. Set the existing "
            "approximate_age_years to null in the same PATCH when switching to this field."
        ),
    )
    approximate_age_years: int | None = Field(
        default=None,
        ge=0,
        le=100,
        description=(
            "Approximate age in full years (0 to 100), used when birth_date is unknown. "
            "Set the existing birth_date to null in the same PATCH when switching to this field."
        ),
    )
    weight_g: int = Field(
        default=None,
        gt=0,
        description="Pet weight in grams. Optional in PATCH; when provided, it must be a positive integer.",
    )

    @field_validator("name", "species")
    @classmethod
    def strip_required_text(cls, value: str | None) -> str:
        if value is None:
            raise ValueError("must not be null")
        value = value.strip()
        if not value:
            raise ValueError("must not be blank")
        return value

    @field_validator("sex")
    @classmethod
    def reject_null_sex(cls, value: PetSex | None) -> PetSex:
        if value is None:
            raise ValueError("must not be null")
        return value

    @field_validator("breed")
    @classmethod
    def strip_optional_text(cls, value: str | None) -> str | None:
        if value is None:
            return None
        value = value.strip()
        if not value:
            raise ValueError("must not be blank")
        return value

    @model_validator(mode="after")
    def validate_update(self) -> "PetUpdate":
        if not self.model_fields_set:
            raise ValueError("At least one field is required")
        if self.birth_date is not None and self.approximate_age_years is not None:
            raise ValueError("birth_date and approximate_age_years cannot both be provided")
        return self

    model_config = ConfigDict(
        title="PetUpdate",
        json_schema_extra={
            "description": (
                f"{AGE_FIELDS_DESCRIPTION} PATCH validates the resulting stored state; "
                "explicitly send null to clear a nullable age field."
            ),
            "not": {
                "required": ["birth_date", "approximate_age_years"],
                "properties": {
                    "birth_date": {"type": "string"},
                    "approximate_age_years": {"type": "integer"},
                },
            },
        },
    )


class PetPublic(BaseModel):
    id: int
    name: str
    species: str
    sex: PetSex
    breed: str | None
    birth_date: date | None = Field(
        description="Exact date of birth, when known. Mutually exclusive with approximate_age_years."
    )
    approximate_age_years: int | None = Field(
        ge=0,
        le=100,
        description=(
            "Approximate age in full years, when the exact birth date is unknown. "
            "Mutually exclusive with birth_date."
        ),
    )
    weight_g: int | None = Field(
        gt=0,
        description="Pet weight in grams. May be null only for records created before weight was added.",
    )
    photo_url: str | None

    model_config = ConfigDict(from_attributes=True)
