from datetime import date as Date
from datetime import datetime
from datetime import time as Time
from enum import StrEnum

from pydantic import BaseModel, Field


class CalendarEventType(StrEnum):
    VISIT = "visit"
    VACCINATION = "vaccination"
    MEDICATION = "medication"


class CalendarEvent(BaseModel):
    id: str = Field(description='Stable id, e.g. "visit-12" or "dose-5-20261016T1800".')
    type: CalendarEventType
    pet_id: int
    pet_name: str
    title: str = Field(description="Visit title, vaccine name or medication name.")
    detail: str | None = Field(description="Doctor, clinic or dose.")
    date: Date = Field(description="Local date in the requested timezone.")
    time: Time | None = Field(description="Local time; null for all-day events (vaccinations).")
    status: str = Field(
        description=(
            "visit: planned/completed; vaccination: planned/done; "
            "medication: pending/taken/skipped."
        )
    )
    source_id: int = Field(description="Id of the visit, vaccination or medication.")


class CalendarFeedStatus(BaseModel):
    active: bool
    timezone: str | None
    created_at: datetime | None


class CalendarFeedCreate(BaseModel):
    timezone: str | None = Field(
        default=None, description="IANA timezone for dose times; defaults to the request's tz."
    )


class CalendarFeedLink(CalendarFeedStatus):
    path: str = Field(
        description=(
            "Secret path of the .ics feed, shown only now. Prefix it with the site origin; "
            "use webcal:// to subscribe from Apple Calendar or Outlook."
        )
    )
