import re
import unicodedata
from datetime import date, datetime
from typing import Any, TypeVar
from zoneinfo import ZoneInfo

from fastapi import HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.base import Base

DEFAULT_TIMEZONE = "Europe/Moscow"

ModelT = TypeVar("ModelT", bound=Base)
_WHITESPACE_RE = re.compile(r"\s+")


async def get_pet_child(
    db: AsyncSession, model: type[ModelT], pet_id: int, item_id: int, detail: str
) -> ModelT:
    """Load a record that belongs to the given (already ownership-checked) pet, or 404."""
    item = await db.scalar(select(model).where(model.id == item_id, model.pet_id == pet_id))
    if item is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=detail)
    return item


def unprocessable(detail: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=detail)


def patch_changes(payload: BaseModel, required: set[str] = frozenset()) -> dict[str, Any]:
    """Fields explicitly sent in a PATCH; required columns may be changed but not nulled."""
    changes = payload.model_dump(exclude_unset=True)
    if not changes:
        raise unprocessable("At least one field is required")
    for field in required & changes.keys():
        if changes[field] is None:
            raise unprocessable(f"{field} must not be null")
    return changes


async def save(db: AsyncSession, item: ModelT) -> ModelT:
    db.add(item)
    await db.commit()
    await db.refresh(item)
    return item


def clean_label(value: str) -> str:
    return _WHITESPACE_RE.sub(" ", value.strip())


def label_key(value: str) -> str:
    """Comparison key for free-form labels: whitespace-, case- and width-insensitive."""
    return unicodedata.normalize("NFKC", clean_label(value)).casefold()


def local_now(tz: ZoneInfo) -> datetime:
    """Current naive wall-clock time in the given timezone."""
    return datetime.now(tz).replace(tzinfo=None)


def local_today(tz: ZoneInfo) -> date:
    return datetime.now(tz).date()
