from fastapi import APIRouter, HTTPException, status

from app.api.async_dependencies import AsyncDbSession, CaredPet, OwnedPet
from app.api.v1.pet_health.dependencies import LocalTimezone
from app.models.health import Pregnancy
from app.models.pet import PetSex
from app.schemas.health import PregnancyPublic, PregnancyUpsert
from app.services.health.common import local_today, save, unprocessable
from app.services.health.pregnancy import active_pregnancy, started_on_for_month, to_public

router = APIRouter(prefix="/pets/{pet_id}/pregnancy", tags=["pet health: pregnancy"])


@router.get(
    "",
    response_model=PregnancyPublic | None,
    summary="Get the active pregnancy",
    description="Returns null when the pet is not currently pregnant.",
)
async def get_pregnancy(
    pet: CaredPet, db: AsyncDbSession, tz: LocalTimezone
) -> PregnancyPublic | None:
    pregnancy = await active_pregnancy(db, pet.id)
    return to_public(pregnancy, local_today(tz)) if pregnancy else None


@router.put(
    "",
    response_model=PregnancyPublic,
    summary="Start or update the active pregnancy",
    description=(
        "Accepts either the current month (1-9) or the exact start date. The month then "
        "advances by itself every 30 days. Only allowed for pets with sex 'girl'."
    ),
)
async def put_pregnancy(
    pet: OwnedPet, payload: PregnancyUpsert, db: AsyncDbSession, tz: LocalTimezone
) -> PregnancyPublic:
    if pet.sex is not PetSex.GIRL:
        raise unprocessable("Pregnancy can only be recorded for a girl")
    today = local_today(tz)
    started_on = payload.started_on or started_on_for_month(payload.month, today)
    if started_on > today:
        raise unprocessable("started_on must not be in the future")

    pregnancy = await active_pregnancy(db, pet.id) or Pregnancy(pet_id=pet.id)
    pregnancy.started_on = started_on
    return to_public(await save(db, pregnancy), today)


@router.delete(
    "", status_code=status.HTTP_204_NO_CONTENT, summary="End the active pregnancy"
)
async def end_pregnancy(pet: OwnedPet, db: AsyncDbSession, tz: LocalTimezone) -> None:
    pregnancy = await active_pregnancy(db, pet.id)
    if pregnancy is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No active pregnancy")
    pregnancy.ended_on = local_today(tz)
    await db.commit()
