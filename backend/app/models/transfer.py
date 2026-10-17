from datetime import datetime
from enum import StrEnum

from sqlalchemy import DateTime, Enum, ForeignKey, Index, String, func, text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class TransferDuration(StrEnum):
    WEEK = "week"
    MONTH = "month"
    THREE_MONTHS = "three_months"
    INDEFINITE = "indefinite"


class TransferStatus(StrEnum):
    PENDING = "pending"  # waiting for the recipient to accept or decline
    ACCEPTED = "accepted"  # the pet is with the recipient
    RETURN_REQUESTED = "return_requested"  # the recipient wants to give the pet back
    RETURNED = "returned"
    DECLINED = "declined"
    CANCELLED = "cancelled"  # withdrawn by the owner before acceptance
    EXPIRED = "expired"


OPEN_STATUSES = (
    TransferStatus.PENDING,
    TransferStatus.ACCEPTED,
    TransferStatus.RETURN_REQUESTED,
)
_OPEN_SQL = ", ".join(f"'{status.value}'" for status in OPEN_STATUSES)


def string_enum(enum_class: type[StrEnum], name: str) -> Enum:
    # VARCHAR + CHECK like pets.sex, so SQLite tests and Postgres agree.
    return Enum(
        enum_class,
        name=name,
        native_enum=False,
        create_constraint=True,
        validate_strings=True,
        values_callable=lambda members: [member.value for member in members],
    )


class PetTransfer(Base):
    """Handing a pet over to another person for a period. Ownership does not change."""

    __tablename__ = "pet_transfers"
    __table_args__ = (
        Index("ix_pet_transfers_pet_id", "pet_id"),
        Index("ix_pet_transfers_owner_id", "owner_id"),
        Index("ix_pet_transfers_recipient_email", "recipient_email"),
        # At most one unfinished transfer per pet.
        Index(
            "uq_pet_transfers_open_pet",
            "pet_id",
            unique=True,
            postgresql_where=text(f"status IN ({_OPEN_SQL})"),
            sqlite_where=text(f"status IN ({_OPEN_SQL})"),
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    pet_id: Mapped[int] = mapped_column(ForeignKey("pets.id", ondelete="CASCADE"), nullable=False)
    owner_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    # The request is addressed by email, so it can wait for someone without an account.
    recipient_email: Mapped[str] = mapped_column(String(320), nullable=False)
    # Filled in when the recipient accepts.
    recipient_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=True
    )
    duration: Mapped[TransferDuration] = mapped_column(
        string_enum(TransferDuration, "transfer_duration"), nullable=False
    )
    # None for an indefinite transfer.
    ends_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    status: Mapped[TransferStatus] = mapped_column(
        string_enum(TransferStatus, "transfer_status"), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    responded_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    return_requested_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # Always needed to render a transfer; joined so async sessions never lazy-load.
    pet = relationship("Pet", back_populates="transfers", lazy="joined")
    owner = relationship("User", foreign_keys=[owner_id], lazy="joined")
    recipient = relationship("User", foreign_keys=[recipient_id], lazy="joined")
