"""Who may see and touch a pet: its owner, and the recipient of an accepted transfer
("caretaker") until the transfer ends.

A caretaker can read everything about the pet and add day-to-day care records (feeding,
symptoms, measurements, medication intakes, vet visits), but cannot edit or delete
anything, change the pet itself or its health setup. Everyone else gets 404, so the
pet's existence is not revealed; a caretaker hitting an owner-only action gets 403.
"""

from datetime import UTC, datetime
from enum import StrEnum

from fastapi import HTTPException, status
from sqlalchemy import exists, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import Session

from app.models.pet import Pet
from app.models.transfer import PetTransfer, TransferStatus

# The transfer gives access while the pet is with the recipient, including while a
# return is pending: until the owner confirms it, the recipient still feeds the pet.
CARE_STATUSES = (TransferStatus.ACCEPTED, TransferStatus.RETURN_REQUESTED)


class PetAccess(StrEnum):
    OWNER = "owner"
    CARETAKER = "caretaker"


def active_care(user_id: int, now: datetime | None = None):
    """Condition on PetTransfer: an accepted, unexpired transfer of the pet to the user."""
    now = now or datetime.now(UTC)
    return (
        (PetTransfer.recipient_id == user_id)
        & PetTransfer.status.in_(CARE_STATUSES)
        # Checked here and not only by expire_due, so access ends exactly on time.
        & (PetTransfer.ends_at.is_(None) | (PetTransfer.ends_at > now))
    )


def cared_for_condition(user_id: int):
    """Condition on Pet: the user currently takes care of it."""
    return exists(
        select(PetTransfer.id).where(
            PetTransfer.pet_id == Pet.id,
            # A transfer made by a previous owner gives nothing.
            PetTransfer.owner_id == Pet.user_id,
            active_care(user_id),
        )
    ).correlate(Pet)


def visible_pet_condition(user_id: int):
    """Condition on Pet: the user owns it or takes care of it."""
    return or_(Pet.user_id == user_id, cared_for_condition(user_id))


def access_of(pet: Pet, user_id: int) -> PetAccess:
    # Only called on pets matched by visible_pet_condition.
    return PetAccess.OWNER if pet.user_id == user_id else PetAccess.CARETAKER


def not_found() -> HTTPException:
    return HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Pet not found")


def owner_only() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="Only the owner can do this; the pet is in your temporary care",
    )


def require_owner(pet: Pet, user_id: int) -> Pet:
    if access_of(pet, user_id) is not PetAccess.OWNER:
        raise owner_only()
    return pet


def get_visible_pet(db: Session, pet_id: int, user_id: int) -> Pet:
    pet = db.scalar(select(Pet).where(Pet.id == pet_id, visible_pet_condition(user_id)))
    if pet is None:
        raise not_found()
    return pet


async def get_visible_pet_async(db: AsyncSession, pet_id: int, user_id: int) -> Pet:
    pet = await db.scalar(select(Pet).where(Pet.id == pet_id, visible_pet_condition(user_id)))
    if pet is None:
        raise not_found()
    return pet
