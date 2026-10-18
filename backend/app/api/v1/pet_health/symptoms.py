from fastapi import APIRouter, status
from sqlalchemy import select

from app.api.async_dependencies import AsyncDbSession, CaredPet, OwnedPet
from app.models.health import Symptom
from app.schemas.health import SymptomCreate, SymptomPublic, SymptomUpdate
from app.services.health.common import get_pet_child, patch_changes, save

router = APIRouter(prefix="/pets/{pet_id}/symptoms", tags=["pet health: symptoms"])
NOT_FOUND = "Symptom not found"


@router.post("", response_model=SymptomPublic, status_code=status.HTTP_201_CREATED)
async def create_symptom(pet: CaredPet, payload: SymptomCreate, db: AsyncDbSession) -> Symptom:
    return await save(db, Symptom(pet_id=pet.id, **payload.model_dump()))


@router.get("", response_model=list[SymptomPublic], summary="List symptoms, latest first")
async def list_symptoms(pet: CaredPet, db: AsyncDbSession) -> list[Symptom]:
    return list(
        await db.scalars(
            select(Symptom)
            .where(Symptom.pet_id == pet.id)
            .order_by(Symptom.observed_at.desc(), Symptom.id.desc())
        )
    )


@router.get("/{symptom_id}", response_model=SymptomPublic)
async def get_symptom(pet: CaredPet, symptom_id: int, db: AsyncDbSession) -> Symptom:
    return await get_pet_child(db, Symptom, pet.id, symptom_id, NOT_FOUND)


@router.patch("/{symptom_id}", response_model=SymptomPublic)
async def update_symptom(
    pet: OwnedPet, symptom_id: int, payload: SymptomUpdate, db: AsyncDbSession
) -> Symptom:
    symptom = await get_pet_child(db, Symptom, pet.id, symptom_id, NOT_FOUND)
    for field, value in patch_changes(payload, {"description", "observed_at"}).items():
        setattr(symptom, field, value)
    return await save(db, symptom)


@router.delete("/{symptom_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_symptom(pet: OwnedPet, symptom_id: int, db: AsyncDbSession) -> None:
    await db.delete(await get_pet_child(db, Symptom, pet.id, symptom_id, NOT_FOUND))
    await db.commit()
