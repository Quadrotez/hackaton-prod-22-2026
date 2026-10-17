"""Pet transfer workflow. Formal only for now: a transfer records who has the pet and
until when, but does not yet change who may read or edit the pet's data."""

import calendar
from collections.abc import Iterable
from datetime import UTC, datetime, timedelta

from fastapi import HTTPException, status
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.transfer import OPEN_STATUSES, PetTransfer, TransferDuration, TransferStatus
from app.models.user import User
from app.schemas.transfers import TransferPet, TransferPublic, TransferUser


def utc_now() -> datetime:
    return datetime.now(UTC)


def as_utc(moment: datetime) -> datetime:
    # SQLite hands timezone-aware columns back naive; values are always written in UTC.
    return moment if moment.tzinfo is not None else moment.replace(tzinfo=UTC)


def add_months(moment: datetime, months: int) -> datetime:
    month_index = moment.month - 1 + months
    year, month = moment.year + month_index // 12, month_index % 12 + 1
    day = min(moment.day, calendar.monthrange(year, month)[1])
    return moment.replace(year=year, month=month, day=day)


def ends_at_for(duration: TransferDuration, start: datetime) -> datetime | None:
    match duration:
        case TransferDuration.WEEK:
            return start + timedelta(weeks=1)
        case TransferDuration.MONTH:
            return add_months(start, 1)
        case TransferDuration.THREE_MONTHS:
            return add_months(start, 3)
        case TransferDuration.INDEFINITE:
            return None


def role_of(transfer: PetTransfer, user: User) -> str | None:
    if transfer.owner_id == user.id:
        return "owner"
    if transfer.recipient_id == user.id or transfer.recipient_email == user.email.lower():
        return "recipient"
    return None


def to_public(transfer: PetTransfer, user: User) -> TransferPublic:
    return TransferPublic(
        id=transfer.id,
        role=role_of(transfer, user),
        status=transfer.status,
        duration=transfer.duration,
        ends_at=transfer.ends_at,
        pet=TransferPet.model_validate(transfer.pet),
        owner=TransferUser.model_validate(transfer.owner),
        recipient_email=transfer.recipient_email,
        recipient=TransferUser.model_validate(transfer.recipient) if transfer.recipient else None,
        created_at=transfer.created_at,
        responded_at=transfer.responded_at,
        return_requested_at=transfer.return_requested_at,
        ended_at=transfer.ended_at,
    )


async def expire_due(db: AsyncSession, transfers: Iterable[PetTransfer]) -> None:
    """Close unfinished transfers whose end date has passed. Checked on read instead of
    by a scheduler; the change is persisted so the one-open-transfer rule stays exact."""
    now = utc_now()
    changed = False
    for transfer in transfers:
        if (
            transfer.status in OPEN_STATUSES
            and transfer.ends_at is not None
            and as_utc(transfer.ends_at) <= now
        ):
            transfer.status = TransferStatus.EXPIRED
            transfer.ended_at = transfer.ends_at
            changed = True
    if changed:
        await db.commit()


async def load_transfers(db: AsyncSession, *conditions) -> list[PetTransfer]:
    transfers = list(
        (
            await db.scalars(
                select(PetTransfer)
                .where(*conditions)
                .order_by(PetTransfer.created_at.desc(), PetTransfer.id.desc())
            )
        ).unique()
    )
    await expire_due(db, transfers)
    return transfers


async def get_visible_transfer(db: AsyncSession, transfer_id: int, user: User) -> PetTransfer:
    """A transfer the caller is a party of (owner or addressed recipient), or 404."""
    transfers = await load_transfers(
        db,
        PetTransfer.id == transfer_id,
        or_(
            PetTransfer.owner_id == user.id,
            PetTransfer.recipient_id == user.id,
            PetTransfer.recipient_email == user.email.lower(),
        ),
    )
    if not transfers:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Transfer not found")
    return transfers[0]


def require_role(transfer: PetTransfer, user: User, role: str, action: str) -> None:
    if role_of(transfer, user) != role:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Only the {role} can {action} this transfer",
        )


def require_status(transfer: PetTransfer, expected: TransferStatus, action: str) -> None:
    if transfer.status != expected:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Cannot {action} a transfer in status {transfer.status.value}",
        )
