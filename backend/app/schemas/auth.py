import re
from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator


USERNAME_PATTERN = re.compile(r"^[a-z0-9_]{3,30}$")


class UserRegistration(BaseModel):
    email: EmailStr
    username: str = Field(min_length=3, max_length=30)
    password: str = Field(min_length=8, max_length=128)

    @field_validator("email")
    @classmethod
    def normalize_email(cls, value: EmailStr) -> str:
        return str(value).strip().lower()

    @field_validator("username")
    @classmethod
    def normalize_username(cls, value: str) -> str:
        normalized = value.strip().lower()
        if not USERNAME_PATTERN.fullmatch(normalized):
            raise ValueError("Username must contain only lowercase letters, numbers, and underscores")
        return normalized


class Credentials(BaseModel):
    identifier: str = Field(min_length=3, max_length=320)
    password: str = Field(min_length=8, max_length=128)

    @field_validator("identifier")
    @classmethod
    def normalize_identifier(cls, value: str) -> str:
        return value.strip().lower()


class UserPublic(BaseModel):
    id: int
    email: EmailStr
    username: str
    avatar_url: str | None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
