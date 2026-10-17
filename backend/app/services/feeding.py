import re
import unicodedata

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.feeding import FeedingRecord


_WHITESPACE_RE = re.compile(r"\s+")


def clean_food_name(food_name: str) -> str:
    return _WHITESPACE_RE.sub(" ", food_name.strip())


def normalize_food_name(food_name: str) -> str:
    return unicodedata.normalize("NFKC", clean_food_name(food_name)).casefold()


def find_latest_matching_record(
    db: Session, pet_id: int, food_name: str
) -> FeedingRecord | None:
    normalized_name = normalize_food_name(food_name)
    records = db.scalars(
        select(FeedingRecord)
        .where(FeedingRecord.pet_id == pet_id)
        .order_by(
            FeedingRecord.fed_at.desc(),
            FeedingRecord.created_at.desc(),
            FeedingRecord.id.desc(),
        )
    )
    return next(
        (
            record
            for record in records
            if normalize_food_name(record.food_name) == normalized_name
        ),
        None,
    )
