from fastapi import APIRouter, Query, status
from sqlalchemy import select

from app.api.async_dependencies import AsyncDbSession, OwnedPet
from app.models.health import Vaccination, VaccinationStatus
from app.schemas.health import VaccinationCreate, VaccinationPublic, VaccinationUpdate
from app.services.health.common import get_pet_child, patch_changes, save
from app.services.health.procedures import compute_next_due

router = APIRouter(prefix="/pets/{pet_id}/vaccinations", tags=["pet health: vaccinations"])
NOT_FOUND = "Vaccination not found"


@router.post("", response_model=VaccinationPublic, status_code=status.HTTP_201_CREATED)
async def create_vaccination(
    pet: OwnedPet, payload: VaccinationCreate, db: AsyncDbSession
) -> Vaccination:
    data = payload.model_dump()
    data["next_due_on"] = compute_next_due(
        data["scheduled_on"], data["interval_days"], data["next_due_on"]
    )
    return await save(db, Vaccination(pet_id=pet.id, **data))


@router.get("", response_model=list[VaccinationPublic], summary="List vaccinations by date")
async def list_vaccinations(
    pet: OwnedPet,
    db: AsyncDbSession,
    status_filter: VaccinationStatus | None = Query(default=None, alias="status"),
) -> list[Vaccination]:
    query = select(Vaccination).where(Vaccination.pet_id == pet.id)
    if status_filter is not None:
        query = query.where(Vaccination.status == status_filter)
    return list(await db.scalars(query.order_by(Vaccination.scheduled_on, Vaccination.id)))


@router.get("/{vaccination_id}", response_model=VaccinationPublic)
async def get_vaccination(pet: OwnedPet, vaccination_id: int, db: AsyncDbSession) -> Vaccination:
    return await get_pet_child(db, Vaccination, pet.id, vaccination_id, NOT_FOUND)


@router.patch("/{vaccination_id}", response_model=VaccinationPublic)
async def update_vaccination(
    pet: OwnedPet, vaccination_id: int, payload: VaccinationUpdate, db: AsyncDbSession
) -> Vaccination:
    vaccination = await get_pet_child(db, Vaccination, pet.id, vaccination_id, NOT_FOUND)
    changes = patch_changes(payload, {"name", "scheduled_on", "status"})
    for field, value in changes.items():
        setattr(vaccination, field, value)
    # Recompute only when the anchor or the interval changed; an explicit next date wins,
    # and resetting the interval clears the derived date.
    if {"scheduled_on", "interval_days"} & changes.keys():
        vaccination.next_due_on = compute_next_due(
            vaccination.scheduled_on, vaccination.interval_days, changes.get("next_due_on")
        )
    return await save(db, vaccination)


@router.delete("/{vaccination_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_vaccination(pet: OwnedPet, vaccination_id: int, db: AsyncDbSession) -> None:
    await db.delete(await get_pet_child(db, Vaccination, pet.id, vaccination_id, NOT_FOUND))
    await db.commit()
