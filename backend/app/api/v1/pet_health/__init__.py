"""Pet health section. Built on AsyncSession, unlike the older sync routers."""

from fastapi import APIRouter

from app.api.v1.pet_health import (
    allergies,
    measurements,
    medications,
    overview,
    pregnancy,
    symptoms,
    vaccinations,
    visits,
)

router = APIRouter()
for module in (
    overview,
    symptoms,
    allergies,
    pregnancy,
    vaccinations,
    medications,
    visits,
    measurements,
):
    router.include_router(module.router)
router.include_router(measurements.templates_router)
