"""Pet health section. Built on AsyncSession, unlike the older sync routers."""

from fastapi import APIRouter

from app.api.v1.pet_health import (
    allergies,
    medications,
    overview,
    pregnancy,
    symptoms,
    vaccinations,
    visits,
)


router = APIRouter()
for module in (overview, symptoms, allergies, pregnancy, vaccinations, medications, visits):
    router.include_router(module.router)
