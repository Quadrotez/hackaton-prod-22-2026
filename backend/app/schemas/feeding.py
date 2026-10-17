from datetime import datetime
from typing import Literal

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
    amount_grams: int | None = Field(
        default=None,
        gt=0,
        examples=[85],
        description=(
            "Amount of food given, in grams. Required when food_id is set: this amount is "
            "deducted from the food's remaining stock. If the stock is empty or smaller than "
            "the amount, the API responds with 409 (code `food_out_of_stock`) and no record "
            "is created. Optional for legacy records created by food_name only (no stock "
            "is deducted)."
        ),
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
        if self.food_id is not None and self.amount_grams is None:
            raise ValueError("amount_grams is required when food_id is set")
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
    amount_grams: int | None = Field(
        default=None, description="Grams given; null for legacy records without an amount."
    )
    fed_at: datetime
    liked: bool
    tolerated: bool
    reaction_notes: str | None
    notes: str | None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class FeedingStockStatus(BaseModel):
    food_id: int = Field(examples=[12])
    remaining_grams: int = Field(
        ge=0, examples=[0], description="Stock left in the catalog after this feeding."
    )
    out_of_stock: bool = Field(
        examples=[True],
        description="True when the remaining stock is 0 (the food has run out).",
    )


class FeedingRecordCreated(FeedingRecordPublic):
    """Response of record creation: the saved record plus the updated food stock."""

    stock: FeedingStockStatus | None = Field(
        default=None,
        description=(
            "Updated stock of the catalog food. Null for legacy records created by "
            "food_name only."
        ),
    )
    out_of_stock: bool = Field(
        default=False,
        description=(
            "Shortcut for stock.out_of_stock: true when this feeding used up the last of "
            "the food. Frontends can show a 'food has run out' notice."
        ),
    )


class FoodOutOfStockError(BaseModel):
    """Body of the 409 response when the catalog food cannot cover the requested amount."""

    code: Literal["food_out_of_stock"] = Field(
        description="Stable machine-readable error code for the frontend."
    )
    message: str = Field(examples=["Food has run out"], description="Human-readable message.")
    food_id: int = Field(examples=[12])
    food_name: str = Field(examples=["Catalog Chicken"])
    requested_grams: int = Field(examples=[85])
    remaining_grams: int = Field(
        ge=0, examples=[0], description="Grams actually left in stock (0 if the food ran out)."
    )
    out_of_stock: bool = Field(
        examples=[True], description="True when remaining_grams is 0, false if merely insufficient."
    )


class FeedingSuggestedValues(BaseModel):
    liked: bool
    tolerated: bool


class FeedingSuggestionResponse(BaseModel):
    food_id: int | None = None
    food_name: str
    previously_tried: bool
    suggested_values: FeedingSuggestedValues | None
