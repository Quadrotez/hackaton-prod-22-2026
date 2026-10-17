from collections import defaultdict
from collections.abc import Sequence

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.health import Measurement, MeasurementParameter, MeasurementProfile
from app.models.pet import Pet
from app.schemas.health import (
    MeasurementParameterPublic,
    MeasurementParameterSummary,
    MeasurementPoint,
)
from app.services.health.common import label_key
from app.services.health.measurement_templates import SORT_STEP, TEMPLATES, template_for_species


RECENT_POINTS = 8


async def load_parameters(db: AsyncSession, pet_id: int) -> Sequence[MeasurementParameter]:
    return (
        await db.scalars(
            select(MeasurementParameter)
            .where(MeasurementParameter.pet_id == pet_id)
            .order_by(MeasurementParameter.sort_order, MeasurementParameter.id)
        )
    ).all()


def add_template_parameters(
    db: AsyncSession, pet_id: int, template: str, existing: Sequence[MeasurementParameter]
) -> None:
    """Add the template's parameters this pet does not have yet (matched by name)."""
    taken = {label_key(parameter.name) for parameter in existing}
    next_order = max((parameter.sort_order for parameter in existing), default=0) + SORT_STEP
    for name, unit in TEMPLATES[template]:
        if label_key(name) in taken:
            continue
        db.add(
            MeasurementParameter(pet_id=pet_id, name=name, unit=unit, sort_order=next_order)
        )
        next_order += SORT_STEP


async def ensure_initialized(db: AsyncSession, pet: Pet) -> None:
    """Apply the species template once per pet, the first time measurements are used.

    Lazy on purpose: it also covers pets created before measurements existed, and a
    parameter the owner later deletes is not re-created because the profile remains.
    """
    if await db.get(MeasurementProfile, pet.id) is not None:
        return
    template = template_for_species(pet.species)
    db.add(MeasurementProfile(pet_id=pet.id, template=template))
    if template is not None:
        add_template_parameters(db, pet.id, template, await load_parameters(db, pet.id))
    try:
        await db.commit()
    except IntegrityError:
        # A concurrent request initialized the pet first; its result is equivalent.
        await db.rollback()
        await db.refresh(pet)


async def apply_template(db: AsyncSession, pet: Pet) -> None:
    """Re-apply the species template on demand, e.g. after the species was changed."""
    template = template_for_species(pet.species)
    if template is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="No measurement template for this species",
        )
    await ensure_initialized(db, pet)
    add_template_parameters(db, pet.id, template, await load_parameters(db, pet.id))
    profile = await db.get(MeasurementProfile, pet.id)
    profile.template = template
    await db.commit()


async def ensure_unique_name(
    db: AsyncSession, pet_id: int, name: str, exclude_id: int | None = None
) -> None:
    key = label_key(name)
    for parameter in await load_parameters(db, pet_id):
        if parameter.id != exclude_id and label_key(parameter.name) == key:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="A parameter with this name already exists",
            )


async def next_sort_order(db: AsyncSession, pet_id: int) -> int:
    current = await db.scalar(
        select(func.max(MeasurementParameter.sort_order)).where(
            MeasurementParameter.pet_id == pet_id
        )
    )
    return (current or 0) + SORT_STEP


async def summarize(db: AsyncSession, pet_id: int) -> list[MeasurementParameterSummary]:
    """Every parameter with its latest value, change since the previous measurement and
    the last few points for a sparkline."""
    parameters = await load_parameters(db, pet_id)
    if not parameters:
        return []

    position = (
        func.row_number()
        .over(
            partition_by=Measurement.parameter_id,
            order_by=(Measurement.measured_at.desc(), Measurement.id.desc()),
        )
        .label("position")
    )
    ranked = (
        select(Measurement.parameter_id, Measurement.value, Measurement.measured_at, position)
        .where(Measurement.parameter_id.in_([parameter.id for parameter in parameters]))
        .subquery()
    )
    rows = await db.execute(
        select(ranked.c.parameter_id, ranked.c.value, ranked.c.measured_at)
        .where(ranked.c.position <= RECENT_POINTS)
        .order_by(ranked.c.parameter_id, ranked.c.position)
    )
    latest_first: dict[int, list[MeasurementPoint]] = defaultdict(list)
    for parameter_id, value, measured_at in rows:
        latest_first[parameter_id].append(MeasurementPoint(value=value, measured_at=measured_at))

    summaries = []
    for parameter in parameters:
        points = latest_first.get(parameter.id, [])
        summaries.append(
            MeasurementParameterSummary(
                **MeasurementParameterPublic.model_validate(parameter).model_dump(),
                latest=points[0] if points else None,
                change=round(points[0].value - points[1].value, 3) if len(points) > 1 else None,
                recent=list(reversed(points)),
            )
        )
    return summaries
