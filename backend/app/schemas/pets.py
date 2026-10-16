from datetime import date

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


class PetCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    species: str = Field(min_length=1, max_length=100)
    breed: str | None = Field(default=None, max_length=255)
    birth_date: date | None = None

    @field_validator("name", "species", "breed")
    @classmethod
    def strip_text(cls, value: str | None) -> str | None:
        if value is None:
            return None
        value = value.strip()
        if not value:
            raise ValueError("must not be blank")
        return value


class PetUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    species: str | None = Field(default=None, min_length=1, max_length=100)
    breed: str | None = Field(default=None, max_length=255)
    birth_date: date | None = None

    @field_validator("name", "species")
    @classmethod
    def strip_required_text(cls, value: str | None) -> str:
        if value is None:
            raise ValueError("must not be null")
        value = value.strip()
        if not value:
            raise ValueError("must not be blank")
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
    def require_changes(self) -> "PetUpdate":
        if not self.model_fields_set:
            raise ValueError("At least one field is required")
        return self


class PetPublic(BaseModel):
    id: int
    name: str
    species: str
    breed: str | None
    birth_date: date | None
    photo_url: str | None

    model_config = ConfigDict(from_attributes=True)
