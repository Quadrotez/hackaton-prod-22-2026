from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import select

from app.api.async_dependencies import AsyncDbSession, OwnedPet
from app.api.v1.pet_health.dependencies import LocalTimezone
from app.models.health import Medication, MedicationIntake, MedicationTime
from app.schemas.health import (
    IntakeMark,
    MedicationCreate,
    MedicationPublic,
    MedicationUpdate,
    ScheduledDose,
)
from app.services.health.common import (
    get_pet_child,
    local_today,
    patch_changes,
    save,
    unprocessable,
)
from app.services.health.schedule import (
    MAX_SCHEDULE_DAYS,
    build_schedule,
    is_scheduled_dose,
    load_medications,
)


router = APIRouter(prefix="/pets/{pet_id}/medications", tags=["health: medications"])
NOT_FOUND = "Medication not found"
DEFAULT_SCHEDULE_DAYS = 7


def to_local_naive(moment: datetime, tz: ZoneInfo) -> datetime:
    # Dose slots are local wall-clock times; an offset-aware value is converted first.
    if moment.tzinfo is not None:
        moment = moment.astimezone(tz).replace(tzinfo=None)
    return moment.replace(second=0, microsecond=0)


@router.post("", response_model=MedicationPublic, status_code=status.HTTP_201_CREATED)
async def create_medication(
    pet: OwnedPet, payload: MedicationCreate, db: AsyncDbSession
) -> Medication:
    fields = payload.model_dump(exclude={"times"})
    medication = Medication(
        pet_id=pet.id,
        **fields,
        times=[MedicationTime(time_of_day=value) for value in payload.times],
    )
    return await save(db, medication)


@router.get("", response_model=list[MedicationPublic])
async def list_medications(pet: OwnedPet, db: AsyncDbSession) -> list[Medication]:
    return list(await load_medications(db, pet.id))


@router.get(
    "/schedule",
    response_model=list[ScheduledDose],
    summary="Doses of all medications in a date range",
    description=(
        f"Expands every course into dose slots between from and to (inclusive, local dates, "
        f"at most {MAX_SCHEDULE_DAYS} days) with their intake status. "
        f"Defaults to {DEFAULT_SCHEDULE_DAYS} days starting today."
    ),
)
async def get_schedule(
    pet: OwnedPet,
    db: AsyncDbSession,
    tz: LocalTimezone,
    start: date | None = Query(default=None, alias="from"),
    end: date | None = Query(default=None, alias="to"),
) -> list[ScheduledDose]:
    start = start or local_today(tz)
    end = end or start + timedelta(days=DEFAULT_SCHEDULE_DAYS - 1)
    if end < start:
        raise unprocessable("to must not be before from")
    if (end - start).days >= MAX_SCHEDULE_DAYS:
        raise unprocessable(f"The range must not exceed {MAX_SCHEDULE_DAYS} days")
    return await build_schedule(db, pet.id, start, end)


@router.get("/{medication_id}", response_model=MedicationPublic)
async def get_medication(pet: OwnedPet, medication_id: int, db: AsyncDbSession) -> Medication:
    return await get_pet_child(db, Medication, pet.id, medication_id, NOT_FOUND)


@router.patch(
    "/{medication_id}",
    response_model=MedicationPublic,
    description="times, when sent, replaces the whole list of dose times.",
)
async def update_medication(
    pet: OwnedPet, medication_id: int, payload: MedicationUpdate, db: AsyncDbSession
) -> Medication:
    medication = await get_pet_child(db, Medication, pet.id, medication_id, NOT_FOUND)
    changes = patch_changes(
        payload, {"name", "dose", "start_date", "interval_days", "times"}
    )
    new_times = changes.pop("times", None)

    start_date = changes.get("start_date", medication.start_date)
    end_date = changes.get("end_date", medication.end_date)
    if end_date is not None and end_date < start_date:
        raise unprocessable("end_date must not be before start_date")

    for field, value in changes.items():
        setattr(medication, field, value)
    if new_times is not None:
        # Keep unchanged slots: re-inserting an existing time would hit the unique
        # constraint before the old row is deleted.
        kept = [slot for slot in medication.times if slot.time_of_day in new_times]
        existing = {slot.time_of_day for slot in kept}
        medication.times = kept + [
            MedicationTime(time_of_day=value) for value in new_times if value not in existing
        ]
    medication = await save(db, medication)
    await db.refresh(medication, attribute_names=["times"])
    return medication


@router.delete("/{medication_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_medication(pet: OwnedPet, medication_id: int, db: AsyncDbSession) -> None:
    await db.delete(await get_pet_child(db, Medication, pet.id, medication_id, NOT_FOUND))
    await db.commit()


async def find_intake(
    db: AsyncDbSession, medication_id: int, scheduled_for: datetime
) -> MedicationIntake | None:
    return await db.scalar(
        select(MedicationIntake).where(
            MedicationIntake.medication_id == medication_id,
            MedicationIntake.scheduled_for == scheduled_for,
        )
    )


@router.put(
    "/{medication_id}/intakes",
    response_model=ScheduledDose,
    summary="Mark a scheduled dose as taken or skipped",
)
async def mark_intake(
    pet: OwnedPet,
    medication_id: int,
    payload: IntakeMark,
    db: AsyncDbSession,
    tz: LocalTimezone,
) -> ScheduledDose:
    medication = await get_pet_child(db, Medication, pet.id, medication_id, NOT_FOUND)
    scheduled_for = to_local_naive(payload.scheduled_for, tz)
    if not is_scheduled_dose(medication, scheduled_for):
        raise unprocessable("scheduled_for is not a dose of this medication")

    intake = await find_intake(db, medication.id, scheduled_for) or MedicationIntake(
        medication_id=medication.id, scheduled_for=scheduled_for
    )
    intake.status = payload.status
    await save(db, intake)
    return ScheduledDose(
        medication_id=medication.id,
        name=medication.name,
        dose=medication.dose,
        scheduled_for=scheduled_for,
        status=payload.status.value,
    )


@router.delete(
    "/{medication_id}/intakes",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Clear the mark of a dose, making it pending again",
)
async def clear_intake(
    pet: OwnedPet,
    medication_id: int,
    db: AsyncDbSession,
    tz: LocalTimezone,
    scheduled_for: datetime = Query(),
) -> None:
    medication = await get_pet_child(db, Medication, pet.id, medication_id, NOT_FOUND)
    intake = await find_intake(db, medication.id, to_local_naive(scheduled_for, tz))
    if intake is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Intake not found")
    await db.delete(intake)
    await db.commit()
