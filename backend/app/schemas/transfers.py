from datetime import UTC, date, datetime, timedelta
from typing import Literal

from pydantic import (
    AwareDatetime,
    BaseModel,
    ConfigDict,
    EmailStr,
    Field,
    field_validator,
    model_validator,
)

from app.models.pet import PetSex
from app.models.transfer import TransferDuration, TransferStatus

MAX_TRANSFER_DAYS = 366


class TransferCreate(BaseModel):
    recipient_email: EmailStr = Field(description="Who should take care of the pet.")
    duration: TransferDuration | None = Field(
        default=None,
        description=(
            "A preset counted from the moment the request is sent; indefinite has no end. "
            "Omit it (or send custom) when ends_at is given."
        ),
    )
    ends_at: AwareDatetime | None = Field(
        default=None,
        description=f"Chosen end of the care, in the future and at most {MAX_TRANSFER_DAYS} days ahead.",
    )

    @model_validator(mode="after")
    def check_period(self) -> "TransferCreate":
        if self.ends_at is not None:
            if self.duration not in (None, TransferDuration.CUSTOM):
                raise ValueError("Send either a duration preset or ends_at, not both")
            now = datetime.now(UTC)
            if self.ends_at <= now:
                raise ValueError("ends_at must be in the future")
            if self.ends_at > now + timedelta(days=MAX_TRANSFER_DAYS):
                raise ValueError(f"ends_at must be within {MAX_TRANSFER_DAYS} days")
            self.duration = TransferDuration.CUSTOM
        elif self.duration in (None, TransferDuration.CUSTOM):
            raise ValueError("ends_at is required for a custom duration")
        return self

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
