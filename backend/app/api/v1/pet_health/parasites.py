from fastapi import APIRouter, Query, status
from sqlalchemy import select

from app.api.async_dependencies import AsyncDbSession, OwnedPet
from app.models.health import ParasiteKind, ParasiteTreatment
from app.schemas.health import (
    ParasiteTreatmentCreate,
    ParasiteTreatmentPublic,
    ParasiteTreatmentUpdate,
)
from app.services.health.common import get_pet_child, patch_changes, save
from app.services.health.procedures import compute_next_due

router = APIRouter(
    prefix="/pets/{pet_id}/parasite-treatments",
    tags=["pet health: parasite treatments"],
)
NOT_FOUND = "Parasite treatment not found"


@router.post("", response_model=ParasiteTreatmentPublic, status_code=status.HTTP_201_CREATED)
async def create_parasite_treatment(
    pet: OwnedPet, payload: ParasiteTreatmentCreate, db: AsyncDbSession
) -> ParasiteTreatment:
    data = payload.model_dump()
    data["next_due_on"] = compute_next_due(
        data["treated_on"], data["interval_days"], data["next_due_on"]
    )
    return await save(db, ParasiteTreatment(pet_id=pet.id, **data))


@router.get("", response_model=list[ParasiteTreatmentPublic], summary="List parasite treatments")
async def list_parasite_treatments(
    pet: OwnedPet,
    db: AsyncDbSession,
    kind: ParasiteKind | None = Query(default=None),
) -> list[ParasiteTreatment]:
    query = select(ParasiteTreatment).where(ParasiteTreatment.pet_id == pet.id)
    if kind is not None:
        query = query.where(ParasiteTreatment.kind == kind)
    return list(
        await db.scalars(query.order_by(ParasiteTreatment.treated_on, ParasiteTreatment.id))
    )


@router.get("/{treatment_id}", response_model=ParasiteTreatmentPublic)
async def get_parasite_treatment(
    pet: OwnedPet, treatment_id: int, db: AsyncDbSession
) -> ParasiteTreatment:
    return await get_pet_child(db, ParasiteTreatment, pet.id, treatment_id, NOT_FOUND)


@router.patch("/{treatment_id}", response_model=ParasiteTreatmentPublic)
async def update_parasite_treatment(
    pet: OwnedPet, treatment_id: int, payload: ParasiteTreatmentUpdate, db: AsyncDbSession
) -> ParasiteTreatment:
    treatment = await get_pet_child(db, ParasiteTreatment, pet.id, treatment_id, NOT_FOUND)
    changes = patch_changes(payload, {"kind", "product_name", "treated_on"})
    for field, value in changes.items():
        setattr(treatment, field, value)
    # Recompute only when the anchor or the interval changed; an explicit next date wins,
    # and resetting the interval clears the derived date.
    if {"treated_on", "interval_days"} & changes.keys():
        treatment.next_due_on = compute_next_due(
            treatment.treated_on, treatment.interval_days, changes.get("next_due_on")
        )
    return await save(db, treatment)


@router.delete("/{treatment_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_parasite_treatment(
    pet: OwnedPet, treatment_id: int, db: AsyncDbSession
) -> None:
    await db.delete(await get_pet_child(db, ParasiteTreatment, pet.id, treatment_id, NOT_FOUND))
    await db.commit()
