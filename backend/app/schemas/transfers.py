from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

from app.models.pet import PetSex
from app.models.transfer import TransferDuration, TransferStatus


class TransferCreate(BaseModel):
    recipient_email: EmailStr = Field(description="Who should take care of the pet.")
    duration: TransferDuration = Field(
        description="Counted from the moment the request is sent; indefinite has no end."
    )

    @field_validator("recipient_email")
    @classmethod
    def normalize_email(cls, value: EmailStr) -> str:
        return str(value).strip().lower()


class TransferPet(BaseModel):
    id: int
    name: str
    species: str
    sex: PetSex
    breed: str | None
    birth_date: date | None
    approximate_age_years: int | None

    model_config = ConfigDict(from_attributes=True)


class TransferUser(BaseModel):
    id: int
    name: str | None
    email: str

    model_config = ConfigDict(from_attributes=True)


class TransferPublic(BaseModel):
    id: int
    role: Literal["owner", "recipient"] = Field(description="The caller's side of the transfer.")
    status: TransferStatus
    duration: TransferDuration
    ends_at: datetime | None = Field(description="Null for an indefinite transfer.")
    pet: TransferPet
    owner: TransferUser
    recipient_email: str
    recipient: TransferUser | None = Field(description="Set once the recipient has accepted.")
    created_at: datetime
    responded_at: datetime | None
    return_requested_at: datetime | None
    ended_at: datetime | None
