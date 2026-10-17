from fastapi import APIRouter, HTTPException, status
from sqlalchemy.exc import IntegrityError

from app.api.async_dependencies import AsyncCurrentUser, AsyncDbSession, OwnedPet
from app.models.transfer import OPEN_STATUSES, PetTransfer, TransferStatus
from app.schemas.transfers import TransferCreate, TransferPublic
from app.services.transfers import (
    ends_at_for,
    get_visible_transfer,
    load_transfers,
    require_role,
    require_status,
    to_public,
    utc_now,
)

pet_router = APIRouter(prefix="/pets/{pet_id}/transfers", tags=["transfers"])
router = APIRouter(prefix="/transfers", tags=["transfers"])

ALREADY_OPEN = "This pet already has an unfinished transfer"


# --- Owner, per pet -------------------------------------------------------------------


@pet_router.post(
    "",
    response_model=TransferPublic,
    status_code=status.HTTP_201_CREATED,
    summary="Ask another person to take the pet",
    description=(
        "Creates a pending request addressed to recipient_email; the recipient does not "
        "need an account yet. The end date is counted from now. A pet can have only one "
        "unfinished transfer at a time."
    ),
)
async def create_transfer(
    pet: OwnedPet, payload: TransferCreate, current_user: AsyncCurrentUser, db: AsyncDbSession
) -> TransferPublic:
    if payload.recipient_email == current_user.email.lower():
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="You cannot transfer a pet to yourself",
        )
    # Loading expires a transfer whose end date passed, so it does not block a new one.
    open_transfers = await load_transfers(
        db, PetTransfer.pet_id == pet.id, PetTransfer.status.in_(OPEN_STATUSES)
    )
    if any(transfer.status in OPEN_STATUSES for transfer in open_transfers):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=ALREADY_OPEN)

    now = utc_now()
    transfer = PetTransfer(
        pet_id=pet.id,
        owner_id=current_user.id,
        recipient_email=payload.recipient_email,
        duration=payload.duration,
        ends_at=ends_at_for(payload.duration, now),
        status=TransferStatus.PENDING,
        created_at=now,
    )
    db.add(transfer)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=ALREADY_OPEN) from None
    return to_public(await get_visible_transfer(db, transfer.id, current_user), current_user)


@pet_router.get("", response_model=list[TransferPublic], summary="Transfer history of a pet")
async def list_pet_transfers(
    pet: OwnedPet, current_user: AsyncCurrentUser, db: AsyncDbSession
) -> list[TransferPublic]:
    transfers = await load_transfers(db, PetTransfer.pet_id == pet.id)
    return [to_public(transfer, current_user) for transfer in transfers]


@pet_router.get(
    "/current",
    response_model=TransferPublic | None,
    summary="The pet's unfinished transfer, if any",
)
async def get_current_transfer(
    pet: OwnedPet, current_user: AsyncCurrentUser, db: AsyncDbSession
) -> TransferPublic | None:
    transfers = await load_transfers(db, PetTransfer.pet_id == pet.id)
    current = next((item for item in transfers if item.status in OPEN_STATUSES), None)
    return to_public(current, current_user) if current else None


# --- Lists for the caller ---------------------------------------------------------------


@router.get(
    "/incoming",
    response_model=list[TransferPublic],
    summary="Requests waiting for the caller to accept or decline",
)
async def list_incoming(current_user: AsyncCurrentUser, db: AsyncDbSession) -> list[TransferPublic]:
    transfers = await load_transfers(
        db,
        PetTransfer.recipient_email == current_user.email.lower(),
        PetTransfer.status == TransferStatus.PENDING,
    )
    return [to_public(item, current_user) for item in transfers if item.status == TransferStatus.PENDING]


@router.get(
    "/received",
    response_model=list[TransferPublic],
    summary="Pets currently with the caller",
    description="Accepted transfers, including those with a return requested.",
)
async def list_received(current_user: AsyncCurrentUser, db: AsyncDbSession) -> list[TransferPublic]:
    active = (TransferStatus.ACCEPTED, TransferStatus.RETURN_REQUESTED)
    transfers = await load_transfers(
        db, PetTransfer.recipient_id == current_user.id, PetTransfer.status.in_(active)
    )
    return [to_public(item, current_user) for item in transfers if item.status in active]


@router.get(
    "/outgoing",
    response_model=list[TransferPublic],
    summary="The caller's unfinished transfers as owner",
    description="Includes returns waiting for the owner's confirmation.",
)
async def list_outgoing(current_user: AsyncCurrentUser, db: AsyncDbSession) -> list[TransferPublic]:
    transfers = await load_transfers(
        db, PetTransfer.owner_id == current_user.id, PetTransfer.status.in_(OPEN_STATUSES)
    )
    return [to_public(item, current_user) for item in transfers if item.status in OPEN_STATUSES]


@router.get("/{transfer_id}", response_model=TransferPublic)
async def get_transfer(
    transfer_id: int, current_user: AsyncCurrentUser, db: AsyncDbSession
) -> TransferPublic:
    return to_public(await get_visible_transfer(db, transfer_id, current_user), current_user)


# --- Status changes ---------------------------------------------------------------------


async def finish(db: AsyncDbSession, transfer: PetTransfer, current_user) -> TransferPublic:
    await db.commit()
    return to_public(transfer, current_user)


@router.post(
    "/{transfer_id}/cancel",
    response_model=TransferPublic,
    summary="Owner withdraws a request that was not accepted yet",
)
async def cancel_transfer(
    transfer_id: int, current_user: AsyncCurrentUser, db: AsyncDbSession
) -> TransferPublic:
    transfer = await get_visible_transfer(db, transfer_id, current_user)
    require_role(transfer, current_user, "owner", "cancel")
    require_status(transfer, TransferStatus.PENDING, "cancel")
    transfer.status, transfer.ended_at = TransferStatus.CANCELLED, utc_now()
    return await finish(db, transfer, current_user)


@router.post("/{transfer_id}/accept", response_model=TransferPublic)
async def accept_transfer(
    transfer_id: int, current_user: AsyncCurrentUser, db: AsyncDbSession
) -> TransferPublic:
    transfer = await get_visible_transfer(db, transfer_id, current_user)
    require_role(transfer, current_user, "recipient", "accept")
    require_status(transfer, TransferStatus.PENDING, "accept")
    transfer.status, transfer.responded_at = TransferStatus.ACCEPTED, utc_now()
    transfer.recipient_id = current_user.id
    transfer.recipient = current_user
    return await finish(db, transfer, current_user)


@router.post("/{transfer_id}/decline", response_model=TransferPublic)
async def decline_transfer(
    transfer_id: int, current_user: AsyncCurrentUser, db: AsyncDbSession
) -> TransferPublic:
    transfer = await get_visible_transfer(db, transfer_id, current_user)
    require_role(transfer, current_user, "recipient", "decline")
    require_status(transfer, TransferStatus.PENDING, "decline")
    now = utc_now()
    transfer.status, transfer.responded_at, transfer.ended_at = TransferStatus.DECLINED, now, now
    return await finish(db, transfer, current_user)


@router.post(
    "/{transfer_id}/return",
    response_model=TransferPublic,
    summary="Recipient asks to give the pet back",
    description="The pet stays with the recipient until the owner confirms the return.",
)
async def request_return(
    transfer_id: int, current_user: AsyncCurrentUser, db: AsyncDbSession
) -> TransferPublic:
    transfer = await get_visible_transfer(db, transfer_id, current_user)
    require_role(transfer, current_user, "recipient", "return")
    require_status(transfer, TransferStatus.ACCEPTED, "return")
    transfer.status, transfer.return_requested_at = TransferStatus.RETURN_REQUESTED, utc_now()
    return await finish(db, transfer, current_user)


@router.post("/{transfer_id}/cancel-return", response_model=TransferPublic)
async def cancel_return(
    transfer_id: int, current_user: AsyncCurrentUser, db: AsyncDbSession
) -> TransferPublic:
    transfer = await get_visible_transfer(db, transfer_id, current_user)
    require_role(transfer, current_user, "recipient", "cancel the return of")
    require_status(transfer, TransferStatus.RETURN_REQUESTED, "cancel the return of")
    transfer.status, transfer.return_requested_at = TransferStatus.ACCEPTED, None
    return await finish(db, transfer, current_user)


@router.post(
    "/{transfer_id}/confirm-return",
    response_model=TransferPublic,
    summary="Owner confirms the pet is back",
)
async def confirm_return(
    transfer_id: int, current_user: AsyncCurrentUser, db: AsyncDbSession
) -> TransferPublic:
    transfer = await get_visible_transfer(db, transfer_id, current_user)
    require_role(transfer, current_user, "owner", "confirm the return of")
    require_status(transfer, TransferStatus.RETURN_REQUESTED, "confirm the return of")
    transfer.status, transfer.ended_at = TransferStatus.RETURNED, utc_now()
    return await finish(db, transfer, current_user)
