from fastapi import APIRouter, HTTPException, Query, status
from fastapi.responses import JSONResponse
from sqlalchemy import select, update

from app.api.dependencies import CurrentUser, DbSession, get_owned_food, get_user_food
from app.api.v1.pets import get_cared_pet, get_owned_pet
from app.models.feeding import FeedingRecord
from app.models.food import Food, FoodStock
from app.schemas.feeding import (
    FeedingRecordCreate,
    FeedingRecordCreated,
    FeedingRecordPublic,
    FeedingRecordUpdate,
    FeedingStockStatus,
    FeedingSuggestedValues,
    FeedingSuggestionResponse,
    FoodOutOfStockError,
)
from app.services.feeding import clean_food_name, find_latest_matching_record

router = APIRouter(prefix="/pets/{pet_id}/feeding-records", tags=["feeding records"])


def get_pet_feeding_record(
    pet_id: int, record_id: int, current_user: CurrentUser, db: DbSession, *, owner: bool
) -> FeedingRecord:
    if owner:
        get_owned_pet(pet_id, current_user, db)
    else:
        get_cared_pet(pet_id, current_user, db)
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


FOOD_OUT_OF_STOCK_EXAMPLE = {
    "code": "food_out_of_stock",
    "message": "Food has run out",
    "food_id": 12,
    "food_name": "Catalog Chicken",
    "requested_grams": 85,
    "remaining_grams": 0,
    "out_of_stock": True,
}


REACTION_CONFLICT = "Reaction types require tolerated to be false"


def check_reaction_types(tolerated: bool, digestive: bool, allergic: bool) -> None:
    """A food that caused a GI or allergic reaction cannot be rated as tolerated."""
    if tolerated and (digestive or allergic):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=REACTION_CONFLICT
        )


def food_out_of_stock_response(
    food: Food, requested_grams: int, remaining_grams: int
) -> JSONResponse:
    out_of_stock = remaining_grams <= 0
    body = FoodOutOfStockError(
        code="food_out_of_stock",
        message=(
            "Food has run out"
            if out_of_stock
            else "Not enough food left for the requested amount"
        ),
        food_id=food.id,
        food_name=food.name,
        requested_grams=requested_grams,
        remaining_grams=max(remaining_grams, 0),
        out_of_stock=out_of_stock,
    )
    return JSONResponse(
        status_code=status.HTTP_409_CONFLICT, content=body.model_dump(mode="json")
    )


@router.post(
    "",
    response_model=FeedingRecordCreated,
    status_code=status.HTTP_201_CREATED,
    summary="Create a feeding history record",
    description=(
        "Creates a new historical record without changing earlier records. Use food_id for a food "
        "from the user's catalog, or food_name for legacy records. For a food this pet has never "
        "tried, liked and tolerated are both required. For a previously tried food, omitted ratings "
        "are copied from the most recent record.\n\n"
        "**Stock handling (catalog foods).** `amount_grams` is required with `food_id` and is "
        "deducted atomically from the food's remaining stock. The 201 response includes `stock` "
        "and `out_of_stock` (true when this feeding used up the last of the food). If the stock "
        "is empty (`remaining_grams <= 0`) or smaller than `amount_grams`, nothing is saved and "
        "the API returns **409** with `code = food_out_of_stock` so the frontend can show that "
        "the food has run out."
    ),
    responses={
        status.HTTP_409_CONFLICT: {
            "model": FoodOutOfStockError,
            "description": (
                "The catalog food has run out or the remaining stock is smaller than "
                "`amount_grams`. No feeding record is created and the stock is unchanged."
            ),
            "content": {
                "application/json": {
                    "examples": {
                        "ran_out": {
                            "summary": "Food has run out",
                            "value": FOOD_OUT_OF_STOCK_EXAMPLE,
                        },
                        "not_enough": {
                            "summary": "Not enough food for the requested amount",
                            "value": {
                                **FOOD_OUT_OF_STOCK_EXAMPLE,
                                "message": "Not enough food left for the requested amount",
                                "requested_grams": 85,
                                "remaining_grams": 40,
                                "out_of_stock": False,
                            },
                        },
                    }
                }
            },
        },
        status.HTTP_404_NOT_FOUND: {"description": "Pet or catalog food not found."},
    },
)
def create_feeding_record(
    pet_id: int, payload: FeedingRecordCreate, current_user: CurrentUser, db: DbSession
) -> FeedingRecordCreated | JSONResponse:
    pet = get_cared_pet(pet_id, current_user, db)

    food: Food | None = None
    if payload.food_id is not None:
        # A temporary caretaker feeds from the owner's catalog and stock.
        food = get_user_food(payload.food_id, pet.user_id, db)
        food_name = food.name
        previous = find_latest_matching_record(db, pet_id, food_id=food.id)
    else:
        food_name = clean_food_name(payload.food_name or "")
        previous = find_latest_matching_record(db, pet_id, food_name=food_name)

    liked = payload.liked
    tolerated = payload.tolerated
    if tolerated is None and (payload.digestive_reaction or payload.allergic_reaction):
        tolerated = False
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
    check_reaction_types(tolerated, payload.digestive_reaction, payload.allergic_reaction)

    stock_status: FeedingStockStatus | None = None
    food_id = food.id if food is not None else None
    if food is not None:
        amount = payload.amount_grams or 0
        # Atomic deduction: only succeeds if enough stock remains, so concurrent
        # requests can never drive the stock below zero. RETURNING gives the exact
        # post-deduction value without a racy second read.
        remaining_after = db.scalar(
            update(FoodStock)
            .where(FoodStock.food_id == food.id, FoodStock.remaining_grams >= amount)
            .values(remaining_grams=FoodStock.remaining_grams - amount)
            .returning(FoodStock.remaining_grams)
            .execution_options(synchronize_session=False)
        )
        if remaining_after is None:
            remaining = db.scalar(
                select(FoodStock.remaining_grams).where(FoodStock.food_id == food.id)
            )
            response = food_out_of_stock_response(food, amount, remaining or 0)
            db.rollback()
            return response
        stock_status = FeedingStockStatus(
            food_id=food.id,
            remaining_grams=remaining_after,
            out_of_stock=remaining_after <= 0,
        )

    record = FeedingRecord(
        pet_id=pet_id,
        food_id=food_id,
        food_name=food_name,
        amount_grams=payload.amount_grams,
        fed_at=payload.fed_at,
        liked=liked,
        tolerated=tolerated,
        digestive_reaction=payload.digestive_reaction,
        allergic_reaction=payload.allergic_reaction,
        reaction_notes=payload.reaction_notes,
        notes=payload.notes,
    )
    db.add(record)
    db.commit()
    db.refresh(record)
    return FeedingRecordCreated(
        **FeedingRecordPublic.model_validate(record).model_dump(),
        stock=stock_status,
        out_of_stock=stock_status.out_of_stock if stock_status is not None else False,
    )


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
    pet = get_cared_pet(pet_id, current_user, db)
    if food_id is None and food_name is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="food_id or food_name is required",
        )

    food: Food | None = None
    if food_id is not None:
        food = get_user_food(food_id, pet.user_id, db)
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
    get_cared_pet(pet_id, current_user, db)
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
    return get_pet_feeding_record(pet_id, record_id, current_user, db, owner=False)


@router.patch("/{record_id}", response_model=FeedingRecordPublic)
def update_feeding_record(
    pet_id: int,
    record_id: int,
    payload: FeedingRecordUpdate,
    current_user: CurrentUser,
    db: DbSession,
) -> FeedingRecord:
    record = get_pet_feeding_record(pet_id, record_id, current_user, db, owner=True)
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
    check_reaction_types(record.tolerated, record.digestive_reaction, record.allergic_reaction)
    db.commit()
    db.refresh(record)
    return record


@router.delete("/{record_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_feeding_record(
    pet_id: int, record_id: int, current_user: CurrentUser, db: DbSession
) -> None:
    record = get_pet_feeding_record(pet_id, record_id, current_user, db, owner=True)
    db.delete(record)
    db.commit()
