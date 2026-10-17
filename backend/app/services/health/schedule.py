"""Medication schedules are not stored per dose: doses are derived from the course
(start/end date, interval, times of day) and only intake marks are persisted."""

from collections.abc import Iterator, Sequence
from datetime import date, datetime, time, timedelta

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.health import Medication, MedicationIntake
from app.schemas.health import ScheduledDose

MAX_SCHEDULE_DAYS = 92


def is_dosing_day(medication: Medication, day: date) -> bool:
    if day < medication.start_date:
        return False
    if medication.end_date is not None and day > medication.end_date:
        return False
    return (day - medication.start_date).days % medication.interval_days == 0


def is_scheduled_dose(medication: Medication, moment: datetime) -> bool:
    return is_dosing_day(medication, moment.date()) and any(
        slot.time_of_day == moment.time() for slot in medication.times
    )


def dose_slots(medication: Medication, start: date, end: date) -> Iterator[datetime]:
    day = max(start, medication.start_date)
    last = end if medication.end_date is None else min(end, medication.end_date)
    while day <= last:
        if is_dosing_day(medication, day):
            for slot in medication.times:
                yield datetime.combine(day, slot.time_of_day)
        day += timedelta(days=1)


async def load_medications(
    db: AsyncSession, pet_id: int, start: date | None = None, end: date | None = None
) -> Sequence[Medication]:
    """Medications of a pet, optionally only courses that overlap [start, end]."""
    query = select(Medication).where(Medication.pet_id == pet_id)
    if end is not None:
        query = query.where(Medication.start_date <= end)
    if start is not None:
        query = query.where(or_(Medication.end_date.is_(None), Medication.end_date >= start))
    return (await db.scalars(query.order_by(Medication.start_date, Medication.id))).all()


async def build_schedule(
    db: AsyncSession, pet_id: int, start: date, end: date
) -> list[ScheduledDose]:
    medications = await load_medications(db, pet_id, start, end)
    if not medications:
        return []

    window_start = datetime.combine(start, time.min)
    window_end = datetime.combine(end + timedelta(days=1), time.min)
    intakes = await db.scalars(
        select(MedicationIntake).where(
            MedicationIntake.medication_id.in_([medication.id for medication in medications]),
            MedicationIntake.scheduled_for >= window_start,
            MedicationIntake.scheduled_for < window_end,
        )
    )
    marks = {
        (intake.medication_id, intake.scheduled_for): intake.status.value for intake in intakes
    }

    doses = [
        ScheduledDose(
            medication_id=medication.id,
            name=medication.name,
            dose=medication.dose,
            scheduled_for=slot,
            status=marks.get((medication.id, slot), "pending"),
        )
        for medication in medications
        for slot in dose_slots(medication, start, end)
    ]
    return sorted(doses, key=lambda dose: (dose.scheduled_for, dose.medication_id))
