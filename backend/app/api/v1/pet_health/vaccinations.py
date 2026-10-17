from fastapi import APIRouter, Query, status
from sqlalchemy import select

from app.api.async_dependencies import AsyncDbSession, OwnedPet
from app.models.health import Vaccination, VaccinationStatus
from app.schemas.health import VaccinationCreate, VaccinationPublic, VaccinationUpdate
from app.services.health.common import get_pet_child, patch_changes, save


router = APIRouter(prefix="/pets/{pet_id}/vaccinations", tags=["pet health: vaccinations"])
NOT_FOUND = "Vaccination not found"


@router.post("", response_model=VaccinationPublic, status_code=status.HTTP_201_CREATED)
async def create_vaccination(
    pet: OwnedPet, payload: VaccinationCreate, db: AsyncDbSession
) -> Vaccination:
    return await save(db, Vaccination(pet_id=pet.id, **payload.model_dump()))


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
    for field, value in patch_changes(payload, {"name", "scheduled_on", "status"}).items():
        setattr(vaccination, field, value)
    return await save(db, vaccination)


@router.delete("/{vaccination_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_vaccination(pet: OwnedPet, vaccination_id: int, db: AsyncDbSession) -> None:
    await db.delete(await get_pet_child(db, Vaccination, pet.id, vaccination_id, NOT_FOUND))
    await db.commit()
