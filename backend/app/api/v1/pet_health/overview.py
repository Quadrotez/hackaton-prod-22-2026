from fastapi import APIRouter

from app.api.async_dependencies import AsyncCurrentUser, AsyncDbSession, OwnedPet
from app.api.v1.pet_health.dependencies import LocalTimezone
from app.schemas.health import HealthOverview, HealthSummary
from app.services.health.overview import build_overview, build_summary


router = APIRouter(prefix="/pets/{pet_id}/health", tags=["health"])


@router.get(
    "",
    response_model=HealthOverview,
    summary="Everything the pet health screen shows, in one request",
)
async def get_health_overview(
    pet: OwnedPet, db: AsyncDbSession, tz: LocalTimezone
) -> HealthOverview:
    return await build_overview(db, pet, tz)


@router.get(
    "/summary",
    response_model=HealthSummary,
    summary="Health summary for sharing with a vet",
    description="Includes recent feeding data. PDF rendering is left to the client.",
)
async def get_health_summary(
    pet: OwnedPet, current_user: AsyncCurrentUser, db: AsyncDbSession, tz: LocalTimezone
) -> HealthSummary:
    return await build_summary(db, pet, current_user.email, tz)
