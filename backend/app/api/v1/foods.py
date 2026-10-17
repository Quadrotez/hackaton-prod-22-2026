from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select, update

from app.api.dependencies import CurrentUser, DbSession, get_owned_food
from app.models.feeding import FeedingRecord
from app.models.food import Food, FoodStock
from app.schemas.foods import FoodCreate, FoodPublic, FoodUpdate

router = APIRouter(prefix="/foods", tags=["foods"])


def public_food(food: Food) -> FoodPublic:
    if food.stock is None:
        raise RuntimeError("Food stock is missing")
    return FoodPublic(
        id=food.id,
        name=food.name,
        description=food.description,
        type=food.type,
        protein=food.protein,
        fats=food.fats,
        carbohydrates=food.carbohydrates,
        calories=food.calories,
        total_grams=food.stock.total_grams,
        remaining_grams=food.stock.remaining_grams,
        out_of_stock=food.stock.remaining_grams <= 0,
        created_at=food.created_at,
    )


@router.post("", response_model=FoodPublic, status_code=status.HTTP_201_CREATED)
def create_food(payload: FoodCreate, current_user: CurrentUser, db: DbSession) -> FoodPublic:
    data = payload.model_dump()
    total_grams = data.pop("total_grams")
    remaining_grams = data.pop("remaining_grams")
    food = Food(user_id=current_user.id, **data)
    food.stock = FoodStock(
        user_id=current_user.id,
        total_grams=total_grams,
        remaining_grams=remaining_grams,
    )
    db.add(food)
    db.commit()
    db.refresh(food)
    return public_food(food)


@router.get("", response_model=list[FoodPublic])
def list_foods(current_user: CurrentUser, db: DbSession) -> list[FoodPublic]:
    foods = db.scalars(
        select(Food).where(Food.user_id == current_user.id).order_by(Food.id)
    ).all()
    return [public_food(food) for food in foods]


@router.get("/{food_id}", response_model=FoodPublic)
def get_food(food_id: int, current_user: CurrentUser, db: DbSession) -> FoodPublic:
    return public_food(get_owned_food(food_id, current_user, db))


@router.patch("/{food_id}", response_model=FoodPublic)
def update_food(
    food_id: int, payload: FoodUpdate, current_user: CurrentUser, db: DbSession
) -> FoodPublic:
    food = get_owned_food(food_id, current_user, db)
    changes = payload.model_dump(exclude_unset=True)
    resulting_total = changes.get("total_grams", food.stock.total_grams)
    resulting_remaining = changes.get("remaining_grams", food.stock.remaining_grams)
    if resulting_remaining > resulting_total:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="remaining_grams cannot exceed total_grams",
        )

    stock_fields = {"total_grams", "remaining_grams"}
    for field, value in changes.items():
        if field not in stock_fields:
            setattr(food, field, value)
    if "total_grams" in changes:
        food.stock.total_grams = changes["total_grams"]
    if "remaining_grams" in changes:
        food.stock.remaining_grams = changes["remaining_grams"]
    db.commit()
    db.refresh(food)
    return public_food(food)


@router.delete("/{food_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_food(food_id: int, current_user: CurrentUser, db: DbSession) -> None:
    food = get_owned_food(food_id, current_user, db)
    db.execute(
        update(FeedingRecord)
        .where(FeedingRecord.food_id == food.id)
        .values(food_id=None)
    )
    db.delete(food)
    db.commit()
