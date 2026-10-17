from datetime import datetime

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class FeedingRecord(Base):
    __tablename__ = "feeding_records"
    __table_args__ = (
        Index("ix_feeding_records_pet_id", "pet_id"),
        Index("ix_feeding_records_food_id", "food_id"),
        Index("ix_feeding_records_pet_food_name", "pet_id", "food_name"),
        CheckConstraint(
            "amount_grams IS NULL OR amount_grams > 0",
            name="ck_feeding_records_amount_grams_positive",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    pet_id: Mapped[int] = mapped_column(
        ForeignKey("pets.id", ondelete="CASCADE"), nullable=False
    )
    food_id: Mapped[int | None] = mapped_column(
        ForeignKey("foods.id", ondelete="SET NULL"), nullable=True
    )
    food_name: Mapped[str] = mapped_column(String(255), nullable=False)
    amount_grams: Mapped[int | None] = mapped_column(Integer, nullable=True)
    fed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    liked: Mapped[bool] = mapped_column(Boolean, nullable=False)
    tolerated: Mapped[bool] = mapped_column(Boolean, nullable=False)
    reaction_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    pet = relationship("Pet", back_populates="feeding_records")
    food = relationship("Food", back_populates="feeding_records")
