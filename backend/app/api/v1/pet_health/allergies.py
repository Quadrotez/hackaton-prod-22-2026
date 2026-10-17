from fastapi import APIRouter, status
from sqlalchemy import select

from app.api.async_dependencies import AsyncDbSession, OwnedPet
from app.models.health import Allergy
from app.schemas.health import AllergyCreate, AllergyPublic, AllergyUpdate
from app.services.health.common import get_pet_child, patch_changes, save

router = APIRouter(prefix="/pets/{pet_id}/allergies", tags=["pet health: allergies"])
NOT_FOUND = "Allergy not found"


@router.post("", response_model=AllergyPublic, status_code=status.HTTP_201_CREATED)
async def create_allergy(pet: OwnedPet, payload: AllergyCreate, db: AsyncDbSession) -> Allergy:
    return await save(db, Allergy(pet_id=pet.id, **payload.model_dump()))


@router.get("", response_model=list[AllergyPublic])
async def list_allergies(pet: OwnedPet, db: AsyncDbSession) -> list[Allergy]:
    return list(
        await db.scalars(select(Allergy).where(Allergy.pet_id == pet.id).order_by(Allergy.id))
    )


@router.get("/{allergy_id}", response_model=AllergyPublic)
async def get_allergy(pet: OwnedPet, allergy_id: int, db: AsyncDbSession) -> Allergy:
    return await get_pet_child(db, Allergy, pet.id, allergy_id, NOT_FOUND)


@router.patch("/{allergy_id}", response_model=AllergyPublic)
async def update_allergy(
    pet: OwnedPet, allergy_id: int, payload: AllergyUpdate, db: AsyncDbSession
) -> Allergy:
    allergy = await get_pet_child(db, Allergy, pet.id, allergy_id, NOT_FOUND)
    for field, value in patch_changes(payload, {"allergen"}).items():
        setattr(allergy, field, value)
    return await save(db, allergy)


@router.delete("/{allergy_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_allergy(pet: OwnedPet, allergy_id: int, db: AsyncDbSession) -> None:
    await db.delete(await get_pet_child(db, Allergy, pet.id, allergy_id, NOT_FOUND))
    await db.commit()
