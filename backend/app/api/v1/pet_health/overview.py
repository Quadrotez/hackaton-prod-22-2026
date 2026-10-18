from fastapi import APIRouter

from app.api.async_dependencies import AsyncDbSession, CaredPet
from app.api.v1.pet_health.dependencies import LocalTimezone
from app.models.user import User
from app.schemas.health import HealthOverview, HealthSummary
from app.services.health.overview import build_overview, build_summary

router = APIRouter(prefix="/pets/{pet_id}/health", tags=["pet health"])


@router.get(
    "",
    response_model=HealthOverview,
    summary="Everything the pet health screen shows, in one request",
)
async def get_health_overview(
    pet: CaredPet, db: AsyncDbSession, tz: LocalTimezone
) -> HealthOverview:
    return await build_overview(db, pet, tz)


@router.get(
    "/summary",
    response_model=HealthSummary,
    summary="Health summary for sharing with a vet",
    description="Includes recent feeding data. PDF rendering is left to the client.",
)
async def get_health_summary(
    pet: CaredPet, db: AsyncDbSession, tz: LocalTimezone
) -> HealthSummary:
    # The owner's contact even when a temporary caretaker prints it for the vet.
    owner = await db.get(User, pet.user_id)
    return await build_summary(db, pet, owner.email, tz)
