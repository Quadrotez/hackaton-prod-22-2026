from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.models.food import FoodType


class FoodCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    description: str | None = Field(default=None, max_length=5000)
    type: FoodType
    protein: float = Field(ge=0)
    fats: float = Field(ge=0)
    carbohydrates: float = Field(ge=0)
    calories: float = Field(ge=0)
    total_grams: int = Field(gt=0)
    remaining_grams: int | None = Field(default=None, ge=0)

    @field_validator("name")
    @classmethod
    def strip_name(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("must not be blank")
        return value

    @field_validator("description")
    @classmethod
    def strip_description(cls, value: str | None) -> str | None:
        if value is None:
            return None
        value = value.strip()
        return value or None

    @model_validator(mode="after")
    def validate_stock(self) -> "FoodCreate":
        if self.remaining_grams is None:
            self.remaining_grams = self.total_grams
        if self.remaining_grams > self.total_grams:
            raise ValueError("remaining_grams cannot exceed total_grams")
        return self


class FoodUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = Field(default=None, max_length=5000)
    type: FoodType | None = None
    protein: float | None = Field(default=None, ge=0)
    fats: float | None = Field(default=None, ge=0)
    carbohydrates: float | None = Field(default=None, ge=0)
    calories: float | None = Field(default=None, ge=0)
    total_grams: int | None = Field(default=None, gt=0)
    remaining_grams: int | None = Field(default=None, ge=0)

    @field_validator("name")
    @classmethod
    def strip_name(cls, value: str | None) -> str:
        if value is None:
            raise ValueError("must not be null")
        value = value.strip()
        if not value:
            raise ValueError("must not be blank")
        return value

    @field_validator("description")
    @classmethod
    def strip_description(cls, value: str | None) -> str | None:
        if value is None:
            return None
        value = value.strip()
        return value or None

    @model_validator(mode="after")
    def require_changes(self) -> "FoodUpdate":
        if not self.model_fields_set:
            raise ValueError("At least one field is required")
        return self


class FoodPublic(BaseModel):
    id: int
    name: str
    description: str | None
    type: FoodType
    protein: float
    fats: float
    carbohydrates: float
    calories: float
    total_grams: int
    remaining_grams: int
    out_of_stock: bool = Field(
        description="True when remaining_grams is 0, i.e. the food has run out."
    )
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)
