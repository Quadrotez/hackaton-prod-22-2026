from datetime import datetime

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import select

from app.api.async_dependencies import AsyncDbSession, OwnedPet
from app.models.health import Measurement, MeasurementParameter
from app.schemas.health import (
    MeasurementCreate,
    MeasurementParameterCreate,
    MeasurementParameterPublic,
    MeasurementParameterSummary,
    MeasurementParameterUpdate,
    MeasurementPublic,
    MeasurementTemplate,
    MeasurementTemplateParameter,
    MeasurementUpdate,
)
from app.services.health.common import get_pet_child, patch_changes, save
from app.services.health.measurement_templates import SPECIES_ALIASES, TEMPLATES
from app.services.health.measurements import (
    apply_template,
    ensure_initialized,
    ensure_unique_name,
    load_parameters,
    next_sort_order,
    summarize,
)


templates_router = APIRouter(prefix="/measurement-templates", tags=["pet health: measurements"])
router = APIRouter(
    prefix="/pets/{pet_id}/measurement-parameters", tags=["pet health: measurements"]
)
PARAMETER_NOT_FOUND = "Measurement parameter not found"
TEMPLATE_NOTE = (
    "Cats and dogs get default parameters from a template the first time measurements "
    "are requested; other species start with none. Template parameters are ordinary "
    "parameters afterwards and can be renamed or deleted."
)


@templates_router.get(
    "", response_model=list[MeasurementTemplate], summary="Default parameters per species"
)
async def list_templates() -> list[MeasurementTemplate]:
    return [
        MeasurementTemplate(
            key=key,
            species=list(SPECIES_ALIASES[key]),
            parameters=[
                MeasurementTemplateParameter(name=name, unit=unit) for name, unit in parameters
            ],
        )
        for key, parameters in TEMPLATES.items()
    ]


@router.get(
    "",
    response_model=list[MeasurementParameterPublic],
    summary="List measurement parameters",
    description=TEMPLATE_NOTE,
)
async def list_parameters(pet: OwnedPet, db: AsyncDbSession) -> list[MeasurementParameter]:
    await ensure_initialized(db, pet)
    return list(await load_parameters(db, pet.id))


@router.get(
    "/summary",
    response_model=list[MeasurementParameterSummary],
    summary="Parameters with latest value, change and recent points",
    description=TEMPLATE_NOTE,
)
async def get_summary(pet: OwnedPet, db: AsyncDbSession) -> list[MeasurementParameterSummary]:
    await ensure_initialized(db, pet)
    return await summarize(db, pet.id)


@router.post(
    "", response_model=MeasurementParameterPublic, status_code=status.HTTP_201_CREATED
)
async def create_parameter(
    pet: OwnedPet, payload: MeasurementParameterCreate, db: AsyncDbSession
) -> MeasurementParameter:
    await ensure_initialized(db, pet)
    await ensure_unique_name(db, pet.id, payload.name)
    sort_order = payload.sort_order
    if sort_order is None:
        sort_order = await next_sort_order(db, pet.id)
    return await save(
        db,
        MeasurementParameter(
            pet_id=pet.id, name=payload.name, unit=payload.unit, sort_order=sort_order
        ),
    )


@router.post(
    "/apply-template",
    response_model=list[MeasurementParameterPublic],
    summary="Add the species template's missing parameters",
    description=(
        "Adds template parameters whose names the pet does not have yet, e.g. after the "
        "species was changed or a template parameter was deleted. Existing parameters are "
        "left untouched. 422 when the species has no template."
    ),
)
async def apply_species_template(
    pet: OwnedPet, db: AsyncDbSession
) -> list[MeasurementParameter]:
    await apply_template(db, pet)
    return list(await load_parameters(db, pet.id))


@router.get("/{parameter_id}", response_model=MeasurementParameterPublic)
async def get_parameter(
    pet: OwnedPet, parameter_id: int, db: AsyncDbSession
) -> MeasurementParameter:
    return await get_pet_child(db, MeasurementParameter, pet.id, parameter_id, PARAMETER_NOT_FOUND)


@router.patch("/{parameter_id}", response_model=MeasurementParameterPublic)
async def update_parameter(
    pet: OwnedPet, parameter_id: int, payload: MeasurementParameterUpdate, db: AsyncDbSession
) -> MeasurementParameter:
    parameter = await get_pet_child(
        db, MeasurementParameter, pet.id, parameter_id, PARAMETER_NOT_FOUND
    )
    changes = patch_changes(payload, {"name", "sort_order"})
    if "name" in changes:
        await ensure_unique_name(db, pet.id, changes["name"], exclude_id=parameter.id)
    for field, value in changes.items():
        setattr(parameter, field, value)
    return await save(db, parameter)


@router.delete(
    "/{parameter_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    description="Also deletes all measurements of the parameter.",
)
async def delete_parameter(pet: OwnedPet, parameter_id: int, db: AsyncDbSession) -> None:
    await db.delete(
        await get_pet_child(db, MeasurementParameter, pet.id, parameter_id, PARAMETER_NOT_FOUND)
    )
    await db.commit()


async def get_measurement(
    db: AsyncDbSession, pet_id: int, parameter_id: int, measurement_id: int
) -> Measurement:
    await get_pet_child(db, MeasurementParameter, pet_id, parameter_id, PARAMETER_NOT_FOUND)
    measurement = await db.scalar(
        select(Measurement).where(
            Measurement.id == measurement_id, Measurement.parameter_id == parameter_id
        )
    )
    if measurement is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Measurement not found")
    return measurement


@router.post(
    "/{parameter_id}/measurements",
    response_model=MeasurementPublic,
    status_code=status.HTTP_201_CREATED,
)
async def create_measurement(
    pet: OwnedPet, parameter_id: int, payload: MeasurementCreate, db: AsyncDbSession
) -> Measurement:
    await get_pet_child(db, MeasurementParameter, pet.id, parameter_id, PARAMETER_NOT_FOUND)
    return await save(db, Measurement(parameter_id=parameter_id, **payload.model_dump()))


@router.get(
    "/{parameter_id}/measurements",
    response_model=list[MeasurementPublic],
    summary="Measurement series, oldest first",
    description="Optionally limited to [from, to] for charts.",
)
async def list_measurements(
    pet: OwnedPet,
    parameter_id: int,
    db: AsyncDbSession,
    start: datetime | None = Query(default=None, alias="from"),
    end: datetime | None = Query(default=None, alias="to"),
) -> list[Measurement]:
    await get_pet_child(db, MeasurementParameter, pet.id, parameter_id, PARAMETER_NOT_FOUND)
    query = select(Measurement).where(Measurement.parameter_id == parameter_id)
    if start is not None:
        query = query.where(Measurement.measured_at >= start)
    if end is not None:
        query = query.where(Measurement.measured_at <= end)
    return list(await db.scalars(query.order_by(Measurement.measured_at, Measurement.id)))


@router.get("/{parameter_id}/measurements/{measurement_id}", response_model=MeasurementPublic)
async def read_measurement(
    pet: OwnedPet, parameter_id: int, measurement_id: int, db: AsyncDbSession
) -> Measurement:
    return await get_measurement(db, pet.id, parameter_id, measurement_id)


@router.patch("/{parameter_id}/measurements/{measurement_id}", response_model=MeasurementPublic)
async def update_measurement(
    pet: OwnedPet,
    parameter_id: int,
    measurement_id: int,
    payload: MeasurementUpdate,
    db: AsyncDbSession,
) -> Measurement:
    measurement = await get_measurement(db, pet.id, parameter_id, measurement_id)
    for field, value in patch_changes(payload, {"value", "measured_at"}).items():
        setattr(measurement, field, value)
    return await save(db, measurement)


@router.delete(
    "/{parameter_id}/measurements/{measurement_id}", status_code=status.HTTP_204_NO_CONTENT
)
async def delete_measurement(
    pet: OwnedPet, parameter_id: int, measurement_id: int, db: AsyncDbSession
) -> None:
    await db.delete(await get_measurement(db, pet.id, parameter_id, measurement_id))
    await db.commit()
