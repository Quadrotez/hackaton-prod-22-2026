from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


CREATE_RATINGS_DESCRIPTION = (
    "Required when this pet has not previously tried the normalized food name. "
    "For a previously tried food, an omitted rating is copied from the most recent "
    "matching feeding record; explicitly supplied true or false always takes precedence."
)


class FeedingRecordCreate(BaseModel):
    food_id: int | None = Field(
        default=None,
        gt=0,
        description="Optional ID of a food from the authenticated user's catalog.",
    )
    food_name: str | None = Field(
        default=None,
        min_length=1,
        max_length=255,
        description="Legacy/display food name. Required when food_id is omitted.",
    )
    fed_at: datetime = Field(description="Required date and time when the pet was fed.")
    liked: bool = Field(default=None, description=CREATE_RATINGS_DESCRIPTION)  # type: ignore[assignment]
    tolerated: bool = Field(default=None, description=CREATE_RATINGS_DESCRIPTION)  # type: ignore[assignment]
    reaction_notes: str | None = Field(
        default=None, description="Optional adverse reaction observations."
    )
    notes: str | None = Field(default=None, description="Optional additional observations.")

    @field_validator("food_name")
    @classmethod
    def strip_food_name(cls, value: str | None) -> str | None:
        if value is None:
            return None
        value = value.strip()
        if not value:
            raise ValueError("must not be blank")
        return value

    @model_validator(mode="after")
    def require_food_reference(self) -> "FeedingRecordCreate":
        if self.food_id is None and self.food_name is None:
            raise ValueError("food_id or food_name is required")
        return self

    model_config = ConfigDict(
        title="FeedingRecordCreate",
        json_schema_extra={
            "description": (
                "Create a historical feeding record. liked and tolerated are conditionally "
                "required: both must be supplied for a food this pet has never tried. If the "
                "normalized food name exists in this pet's history, omitted ratings are copied "
                "from the most recent record. This database-dependent rule is validated by the API."
            )
        },
    )


class FeedingRecordUpdate(BaseModel):
    food_id: int | None = Field(
        default=None,
        gt=0,
        description="New catalog food ID; send null to unlink while retaining food_name.",
    )
    food_name: str | None = Field(
        default=None,
        min_length=1,
        max_length=255,
        description="New non-blank display name for this record only.",
    )
    fed_at: datetime = Field(
        default=None, description="New feeding date and time; null is not allowed."
    )  # type: ignore[assignment]
    liked: bool = Field(
        default=None, description="New liked rating; true and false are valid, null is not allowed."
    )  # type: ignore[assignment]
    tolerated: bool = Field(
        default=None,
        description="New tolerance rating; true and false are valid, null is not allowed.",
    )  # type: ignore[assignment]
    reaction_notes: str | None = Field(
        default=None, description="Adverse reaction observations; send null to clear."
    )
    notes: str | None = Field(
        default=None, description="Additional observations; send null to clear."
    )

    @field_validator("food_name")
    @classmethod
    def strip_food_name(cls, value: str | None) -> str | None:
        if value is None:
            raise ValueError("must not be null")
        value = value.strip()
        if not value:
            raise ValueError("must not be blank")
        return value

    @model_validator(mode="after")
    def require_changes(self) -> "FeedingRecordUpdate":
        if not self.model_fields_set:
            raise ValueError("At least one field is required")
        return self

    model_config = ConfigDict(
        title="FeedingRecordUpdate",
        json_schema_extra={
            "description": (
                "Only supplied fields are changed. liked, tolerated, food_name, and fed_at cannot "
                "be null. reaction_notes and notes may be cleared with null."
            )
        },
    )


class FeedingRecordPublic(BaseModel):
    id: int
    pet_id: int
    food_id: int | None
    food_name: str
    fed_at: datetime
    liked: bool
    tolerated: bool
    reaction_notes: str | None
    notes: str | None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class FeedingSuggestedValues(BaseModel):
    liked: bool
    tolerated: bool


class FeedingSuggestionResponse(BaseModel):
    food_id: int | None = None
    food_name: str
    previously_tried: bool
    suggested_values: FeedingSuggestedValues | None
