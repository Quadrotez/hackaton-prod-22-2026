from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, StrictFloat, StrictInt, field_validator


class VeterinaryDocumentFields(BaseModel):
    """The eight flat data fields in a veterinary-document analysis."""

    model_config = ConfigDict(extra="forbid", strict=True)

    animal_name: str | None
    visit_at: str | None = Field(
        default=None,
        description=(
            "Veterinary visit date and time in ISO 8601 format. "
            "Time defaults to midnight when unknown."
        ),
        examples=["2026-10-17T15:44:49.875Z"],
    )
    visit_reason: str | None
    visit_price: StrictInt | StrictFloat | None = Field(ge=0)
    veterinarian_name: str | None
    veterinarian_profession: str | None
    vet: str | None
    post_visit_instructions: str | None

    @field_validator(
        "animal_name",
        "visit_reason",
        "veterinarian_name",
        "veterinarian_profession",
        "vet",
        "post_visit_instructions",
    )
    @classmethod
    def validate_optional_text(cls, value: str | None) -> str | None:
        if value is None:
            return None
        value = value.strip()
        if not value:
            raise ValueError("must not be blank")
        return value

    @field_validator("visit_at")
    @classmethod
    def validate_iso_datetime(cls, value: str | None) -> str | None:
        if value is None:
            return None
        try:
            parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError as exc:
            raise ValueError("visit_at must use ISO 8601 date-time format") from exc
        if parsed.tzinfo is None or not value.endswith("Z"):
            raise ValueError("visit_at must use ISO 8601 format with UTC suffix Z")
        return value


class VeterinaryDocumentAnalysis(VeterinaryDocumentFields):
    """The exact flat response contract for veterinary document analysis."""

    status: Literal["success", "partial", "error"]
    document_type: str | None
    warnings: list[str]
    error_code: Literal[
        "UNREADABLE_IMAGE",
        "UNSUPPORTED_DOCUMENT",
        "INSUFFICIENT_INPUT",
    ] | None

    @field_validator("document_type")
    @classmethod
    def validate_document_type(cls, value: str | None) -> str | None:
        if value is None:
            return None
        value = value.strip()
        if not value:
            raise ValueError("must not be blank")
        return value

    @field_validator("warnings")
    @classmethod
    def validate_warnings(cls, value: list[str]) -> list[str]:
        normalized: list[str] = []
        for warning in value:
            warning = warning.strip()
            if not warning:
                raise ValueError("warnings must not contain blank strings")
            normalized.append(warning)
        return normalized
