from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class FeedingRecord(Base):
    __tablename__ = "feeding_records"
    __table_args__ = (
        Index("ix_feeding_records_pet_id", "pet_id"),
        Index("ix_feeding_records_pet_food_name", "pet_id", "food_name"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    pet_id: Mapped[int] = mapped_column(
        ForeignKey("pets.id", ondelete="CASCADE"), nullable=False
    )
    food_name: Mapped[str] = mapped_column(String(255), nullable=False)
    fed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    liked: Mapped[bool] = mapped_column(Boolean, nullable=False)
    tolerated: Mapped[bool] = mapped_column(Boolean, nullable=False)
    reaction_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    pet = relationship("Pet", back_populates="feeding_records")
