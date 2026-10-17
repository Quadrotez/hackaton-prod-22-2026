from datetime import datetime

from sqlalchemy import DateTime, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(320), unique=True, index=True, nullable=False)
    name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    avatar_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    pets = relationship("Pet", back_populates="user", cascade="all, delete-orphan")
    vet_visits = relationship("VetVisit", back_populates="user", cascade="all, delete-orphan")
    foods = relationship("Food", back_populates="user", cascade="all, delete-orphan")
    food_stocks = relationship("FoodStock", back_populates="user", cascade="all, delete-orphan")
