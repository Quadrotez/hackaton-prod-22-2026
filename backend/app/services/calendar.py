"""Calendar of all pets of a user, assembled on read from health records:
vet visits, vaccinations and medication doses (flea treatments are medications too)."""

from collections.abc import Collection
from datetime import UTC, date, datetime, time, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.health import (
    ParasiteTreatment,
    Vaccination,
    VaccinationStatus,
    VetVisit,
    VisitStatus,
)
from app.models.pet import Pet
from app.schemas.calendar import CalendarEvent, CalendarEventType
from app.services.health.common import local_now, local_today
from app.services.health.schedule import build_schedule

MAX_RANGE_DAYS = 400


def as_utc(moment: datetime) -> datetime:
    # SQLite returns timezone-aware columns naive; values are written in UTC.
    return moment if moment.tzinfo is not None else moment.replace(tzinfo=UTC)


def utc_bound(day: date, tz: ZoneInfo) -> datetime:
    return datetime.combine(day, time.min, tzinfo=tz).astimezone(UTC)


def visit_detail(visit: VetVisit) -> str | None:
    parts = [part for part in (visit.doctor_name, visit.doctor_specialty) if part]
    return " · ".join(parts) or None


async def load_pets(db: AsyncSession, user_id: int, pet_id: int | None = None) -> list[Pet]:
    query = select(Pet).where(Pet.user_id == user_id)
    if pet_id is not None:
        query = query.where(Pet.id == pet_id)
    return list(await db.scalars(query.order_by(Pet.id)))


async def collect_events(
    db: AsyncSession,
    pets: list[Pet],
    start: date,
    end: date,
    tz: ZoneInfo,
    types: Collection[CalendarEventType] = tuple(CalendarEventType),
) -> list[CalendarEvent]:
    """Events of the given pets whose local date is within [start, end]."""
    if not pets:
        return []
    names = {pet.id: pet.name for pet in pets}
    events: list[CalendarEvent] = []

    if CalendarEventType.VISIT in types:
        visits = await db.scalars(
            select(VetVisit).where(
                VetVisit.pet_id.in_(names),
                VetVisit.status != VisitStatus.CANCELLED,
                VetVisit.visit_at >= utc_bound(start, tz),
                VetVisit.visit_at < utc_bound(end + timedelta(days=1), tz),
            )
        )
        for visit in visits:
            local = as_utc(visit.visit_at).astimezone(tz)
            events.append(
                CalendarEvent(
                    id=f"visit-{visit.id}",
                    type=CalendarEventType.VISIT,
                    pet_id=visit.pet_id,
                    pet_name=names[visit.pet_id],
                    title=visit.title,
                    detail=visit_detail(visit),
                    date=local.date(),
                    time=local.time().replace(second=0, microsecond=0),
                    status=visit.status.value,
                    source_id=visit.id,
                )
            )

    if CalendarEventType.VACCINATION in types:
        vaccinations = await db.scalars(
            select(Vaccination).where(
                Vaccination.pet_id.in_(names),
                Vaccination.scheduled_on >= start,
                Vaccination.scheduled_on <= end,
            )
        )
        for vaccination in vaccinations:
            events.append(
                CalendarEvent(
                    id=f"vaccination-{vaccination.id}",
                    type=CalendarEventType.VACCINATION,
                    pet_id=vaccination.pet_id,
                    pet_name=names[vaccination.pet_id],
                    title=vaccination.name,
                    detail=vaccination.clinic,
                    date=vaccination.scheduled_on,
                    time=None,
                    status=vaccination.status.value,
                    source_id=vaccination.id,
                )
            )

    if CalendarEventType.PARASITE in types:
        treatments = await db.scalars(
            select(ParasiteTreatment).where(
                ParasiteTreatment.pet_id.in_(names),
                ParasiteTreatment.next_due_on.is_not(None),
                ParasiteTreatment.next_due_on >= start,
                ParasiteTreatment.next_due_on <= end,
            )
        )
        for treatment in treatments:
            events.append(
                CalendarEvent(
                    id=f"parasite-{treatment.id}",
                    type=CalendarEventType.PARASITE,
                    pet_id=treatment.pet_id,
                    pet_name=names[treatment.pet_id],
                    title=f"{treatment.product_name} (обработка от паразитов)",
                    detail=treatment.clinic,
                    date=treatment.next_due_on,
                    time=None,
                    status="planned",
                    source_id=treatment.id,
                )
            )

    if CalendarEventType.MEDICATION in types:
        for pet in pets:
            for dose in await build_schedule(db, pet.id, start, end):
                events.append(
                    CalendarEvent(
                        id=f"dose-{dose.medication_id}-{dose.scheduled_for:%Y%m%dT%H%M}",
                        type=CalendarEventType.MEDICATION,
                        pet_id=pet.id,
                        pet_name=pet.name,
                        title=dose.name,
                        detail=dose.dose,
                        date=dose.scheduled_for.date(),
                        time=dose.scheduled_for.time(),
                        status=dose.status,
                        source_id=dose.medication_id,
                    )
                )

    # All-day events first within a day, then by time.
    return sorted(
        events,
        key=lambda event: (event.date, event.time is not None, event.time or time.min, event.id),
    )


def is_upcoming(event: CalendarEvent, now: datetime) -> bool:
    """Still ahead and still to be done; now is naive local time."""
    if event.type is CalendarEventType.VACCINATION:
        return event.status == VaccinationStatus.PLANNED and event.date >= now.date()
    if event.time is None:
        # All-day events (parasite treatment repeats) are upcoming from today on.
        return event.date >= now.date()
    if datetime.combine(event.date, event.time) < now:
        return False
    if event.type is CalendarEventType.VISIT:
        return event.status == VisitStatus.PLANNED
    return event.status == "pending"


async def upcoming_events(
    db: AsyncSession, pets: list[Pet], tz: ZoneInfo, days: int, limit: int
) -> list[CalendarEvent]:
    today, now = local_today(tz), local_now(tz)
    events = await collect_events(db, pets, today, today + timedelta(days=days), tz)
    return [event for event in events if is_upcoming(event, now)][:limit]
