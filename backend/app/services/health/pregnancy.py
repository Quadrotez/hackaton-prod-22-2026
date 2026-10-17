from datetime import date, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.health import Pregnancy
from app.schemas.health import PregnancyPublic

DAYS_PER_MONTH = 30
MAX_MONTH = 9


def started_on_for_month(month: int, today: date) -> date:
    return today - timedelta(days=(month - 1) * DAYS_PER_MONTH)


def current_month(started_on: date, today: date) -> int:
    elapsed = max((today - started_on).days, 0)
    return min(elapsed // DAYS_PER_MONTH + 1, MAX_MONTH)


async def active_pregnancy(db: AsyncSession, pet_id: int) -> Pregnancy | None:
    return await db.scalar(
        select(Pregnancy).where(Pregnancy.pet_id == pet_id, Pregnancy.ended_on.is_(None))
    )


def to_public(pregnancy: Pregnancy, today: date) -> PregnancyPublic:
    reference = pregnancy.ended_on or today
    return PregnancyPublic(
        id=pregnancy.id,
        pet_id=pregnancy.pet_id,
        started_on=pregnancy.started_on,
        month=current_month(pregnancy.started_on, reference),
        ended_on=pregnancy.ended_on,
    )
