from datetime import date

from pydantic import BaseModel, ConfigDict, Field, StrictFloat, StrictInt, field_validator


class VeterinaryDocumentAnalysis(BaseModel):
    """The only four values accepted from and returned for an LLM analysis."""

    model_config = ConfigDict(extra="forbid", strict=True)

    animal_name: str | None
    visit_date: str | None
    visit_reason: str | None
    visit_price: StrictInt | StrictFloat | None = Field(ge=0)

    @field_validator("animal_name", "visit_reason")
    @classmethod
    def validate_optional_text(cls, value: str | None) -> str | None:
        if value is None:
            return None
        value = value.strip()
        if not value:
            raise ValueError("must not be blank")
        return value

    @field_validator("visit_date")
    @classmethod
    def validate_iso_date(cls, value: str | None) -> str | None:
        if value is None:
            return None
        try:
            parsed = date.fromisoformat(value)
        except ValueError as exc:
            raise ValueError("visit_date must use YYYY-MM-DD format") from exc
        if parsed.isoformat() != value:
            raise ValueError("visit_date must use YYYY-MM-DD format")
        return value
