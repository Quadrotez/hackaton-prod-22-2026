from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import select

from app.api.dependencies import CurrentUser, DbSession
from app.api.v1.pets import get_owned_pet
from app.models.feeding import FeedingRecord
from app.models.food import Food
from app.schemas.feeding import (
    FeedingRecordCreate,
    FeedingRecordPublic,
    FeedingRecordUpdate,
    FeedingSuggestedValues,
    FeedingSuggestionResponse,
)
from app.services.feeding import clean_food_name, find_latest_matching_record


router = APIRouter(prefix="/pets/{pet_id}/feeding-records", tags=["feeding records"])


def get_pet_feeding_record(
    pet_id: int, record_id: int, current_user: CurrentUser, db: DbSession
) -> FeedingRecord:
    get_owned_pet(pet_id, current_user, db)
    record = db.scalar(
        select(FeedingRecord).where(
            FeedingRecord.id == record_id,
            FeedingRecord.pet_id == pet_id,
        )
    )
    if record is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Feeding record not found"
        )
    return record


def get_owned_food(food_id: int, current_user: CurrentUser, db: DbSession) -> Food:
    food = db.scalar(select(Food).where(Food.id == food_id, Food.user_id == current_user.id))
    if food is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Food not found")
    return food


@router.post(
    "",
    response_model=FeedingRecordPublic,
    status_code=status.HTTP_201_CREATED,
    summary="Create a feeding history record",
    description=(
        "Creates a new historical record without changing earlier records. Use food_id for a food "
        "from the user's catalog, or food_name for legacy records. For a food this pet has never "
        "tried, liked and tolerated are both required. For a previously tried food, omitted ratings "
        "are copied from the most recent record."
    ),
)
def create_feeding_record(
    pet_id: int, payload: FeedingRecordCreate, current_user: CurrentUser, db: DbSession
) -> FeedingRecord:
    get_owned_pet(pet_id, current_user, db)

    food: Food | None = None
    if payload.food_id is not None:
        food = get_owned_food(payload.food_id, current_user, db)
        food_name = food.name
        previous = find_latest_matching_record(db, pet_id, food_id=food.id)
    else:
        food_name = clean_food_name(payload.food_name or "")
        previous = find_latest_matching_record(db, pet_id, food_name=food_name)

    liked = payload.liked
    tolerated = payload.tolerated
    if previous is None and (liked is None or tolerated is None):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=(
                "liked and tolerated are required when this pet has not previously tried this food"
            ),
        )
    if previous is not None:
        if liked is None:
            liked = previous.liked
        if tolerated is None:
            tolerated = previous.tolerated

    record = FeedingRecord(
        pet_id=pet_id,
        food_id=food.id if food is not None else None,
        food_name=food_name,
        fed_at=payload.fed_at,
        liked=liked,
        tolerated=tolerated,
        reaction_notes=payload.reaction_notes,
        notes=payload.notes,
    )
    db.add(record)
    db.commit()
    db.refresh(record)
    return record


@router.get(
    "/suggestions",
    response_model=FeedingSuggestionResponse,
    response_model_exclude_none=True,
    summary="Get ratings suggested from this pet's history",
    description=(
        "Returns the latest saved liked and tolerated values for a catalog food_id or a legacy "
        "food_name. Suggestions are historical values only."
    ),
)
def get_feeding_suggestions(
    pet_id: int,
    current_user: CurrentUser,
    db: DbSession,
    food_id: int | None = Query(default=None, gt=0),
    food_name: str | None = Query(default=None, min_length=1, max_length=255),
) -> FeedingSuggestionResponse:
    get_owned_pet(pet_id, current_user, db)
    if food_id is None and food_name is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="food_id or food_name is required",
        )

    food: Food | None = None
    if food_id is not None:
        food = get_owned_food(food_id, current_user, db)
        cleaned_name = food.name
        previous = find_latest_matching_record(db, pet_id, food_id=food.id)
    else:
        cleaned_name = clean_food_name(food_name or "")
        if not cleaned_name:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="food_name must not be blank",
            )
        previous = find_latest_matching_record(db, pet_id, food_name=cleaned_name)

    return FeedingSuggestionResponse(
        food_id=food.id if food is not None else None,
        food_name=cleaned_name,
        previously_tried=previous is not None,
        suggested_values=(
            FeedingSuggestedValues(liked=previous.liked, tolerated=previous.tolerated)
            if previous is not None
            else None
        ),
    )


@router.get("", response_model=list[FeedingRecordPublic])
def list_feeding_records(
    pet_id: int, current_user: CurrentUser, db: DbSession
) -> list[FeedingRecord]:
    get_owned_pet(pet_id, current_user, db)
    return list(
        db.scalars(
            select(FeedingRecord)
            .where(FeedingRecord.pet_id == pet_id)
            .order_by(
                FeedingRecord.fed_at.desc(),
                FeedingRecord.created_at.desc(),
                FeedingRecord.id.desc(),
            )
        ).all()
    )


@router.get("/{record_id}", response_model=FeedingRecordPublic)
def get_feeding_record(
    pet_id: int, record_id: int, current_user: CurrentUser, db: DbSession
) -> FeedingRecord:
    return get_pet_feeding_record(pet_id, record_id, current_user, db)


@router.patch("/{record_id}", response_model=FeedingRecordPublic)
def update_feeding_record(
    pet_id: int,
    record_id: int,
    payload: FeedingRecordUpdate,
    current_user: CurrentUser,
    db: DbSession,
) -> FeedingRecord:
    record = get_pet_feeding_record(pet_id, record_id, current_user, db)
    changes = payload.model_dump(exclude_unset=True)
    if not changes:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="At least one field is required",
        )

    if "food_id" in changes:
        food_id = changes["food_id"]
        if food_id is None:
            record.food_id = None
        else:
            food = get_owned_food(food_id, current_user, db)
            record.food_id = food.id
            record.food_name = food.name
        changes.pop("food_id")

    if "food_name" in changes:
        changes["food_name"] = clean_food_name(changes["food_name"])
    for field, value in changes.items():
        setattr(record, field, value)
    db.commit()
    db.refresh(record)
    return record


@router.delete("/{record_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_feeding_record(
    pet_id: int, record_id: int, current_user: CurrentUser, db: DbSession
) -> None:
    record = get_pet_feeding_record(pet_id, record_id, current_user, db)
    db.delete(record)
    db.commit()
