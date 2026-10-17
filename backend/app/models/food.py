from datetime import datetime
from enum import StrEnum

from sqlalchemy import DateTime, Enum, Float, ForeignKey, Index, Integer, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class FoodType(StrEnum):
    DRY = "dry"
    WET = "wet"
    TREAT = "treat"


class Food(Base):
    __tablename__ = "foods"
    __table_args__ = (Index("ix_foods_user_id", "user_id"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    type: Mapped[FoodType] = mapped_column(
        Enum(
            FoodType,
            name="food_type",
            native_enum=False,
            create_constraint=True,
            validate_strings=True,
            values_callable=lambda enum_class: [member.value for member in enum_class],
        ),
        nullable=False,
    )
    protein: Mapped[float] = mapped_column(Float, nullable=False)
    fats: Mapped[float] = mapped_column(Float, nullable=False)
    carbohydrates: Mapped[float] = mapped_column(Float, nullable=False)
    calories: Mapped[float] = mapped_column(Float, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    user = relationship("User", back_populates="foods")
    feeding_records = relationship(
        "FeedingRecord", back_populates="food", passive_deletes=True
    )
    stock = relationship(
        "FoodStock", back_populates="food", uselist=False, cascade="all, delete-orphan"
    )


class FoodStock(Base):
    __tablename__ = "food_stocks"
    __table_args__ = (UniqueConstraint("food_id", name="uq_food_stocks_food_id"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    food_id: Mapped[int] = mapped_column(
        ForeignKey("foods.id", ondelete="CASCADE"), nullable=False
    )
    total_grams: Mapped[int] = mapped_column(Integer, nullable=False)
    remaining_grams: Mapped[int] = mapped_column(Integer, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    food = relationship("Food", back_populates="stock")
    user = relationship("User", back_populates="food_stocks")
