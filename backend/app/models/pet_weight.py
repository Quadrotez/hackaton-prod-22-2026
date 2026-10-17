from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index, Integer
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class PetWeight(Base):
    __tablename__ = "pet_weights"
    __table_args__ = (Index("ix_pet_weights_pet_id_measured_at", "pet_id", "measured_at"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    pet_id: Mapped[int] = mapped_column(
        ForeignKey("pets.id", ondelete="CASCADE"), nullable=False
    )
    weight_g: Mapped[int] = mapped_column(Integer, nullable=False)
    measured_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    pet = relationship("Pet", back_populates="weight_history")
