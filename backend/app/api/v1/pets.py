import logging
from datetime import UTC, datetime
from pathlib import Path

from fastapi import APIRouter, File, HTTPException, Response, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy import select

from app.api.dependencies import AppSettings, CurrentUser, DbSession
from app.models.pet import Pet
from app.models.pet_weight import PetWeight
from app.models.transfer import PetTransfer
from app.schemas.pets import PetCreate, PetPublic, PetUpdate, PetWeightPublic
from app.services.pet_access import (
    PetAccess,
    active_care,
    get_visible_pet,
    require_owner,
    visible_pet_condition,
)
from app.services.storage import FileTooLargeError, InvalidImageError, LocalMediaStorage

router = APIRouter(prefix="/pets", tags=["pets"])
logger = logging.getLogger(__name__)


def get_owned_pet(pet_id: int, current_user: CurrentUser, db: DbSession) -> Pet:
    """The caller's own pet: 404 for strangers, 403 for a temporary caretaker."""
    return require_owner(get_visible_pet(db, pet_id, current_user.id), current_user.id)


def get_cared_pet(pet_id: int, current_user: CurrentUser, db: DbSession) -> Pet:
    """The caller's own pet or one in their temporary care, else 404."""
    return get_visible_pet(db, pet_id, current_user.id)


def care_transfers(db: DbSession, user_id: int, pet_ids: list[int]) -> dict[int, PetTransfer]:
    if not pet_ids:
        return {}
    transfers = db.scalars(
        select(PetTransfer).where(PetTransfer.pet_id.in_(pet_ids), active_care(user_id))
    ).unique()
    return {transfer.pet_id: transfer for transfer in transfers}


def to_public(db: DbSession, pets: list[Pet], user_id: int) -> list[PetPublic]:
    cared = care_transfers(db, user_id, [pet.id for pet in pets if pet.user_id != user_id])
    result = []
    for pet in pets:
        public = PetPublic.model_validate(pet)
        transfer = cared.get(pet.id)
        if transfer is not None:
            public.access = PetAccess.CARETAKER.value
            public.care_transfer_id = transfer.id
            public.care_ends_at = transfer.ends_at
            public.owner_name = transfer.owner.name or transfer.owner.email
        result.append(public)
    return result


def pet_public(db: DbSession, pet: Pet, user_id: int) -> PetPublic:
    return to_public(db, [pet], user_id)[0]


def storage_for(settings: AppSettings) -> LocalMediaStorage:
    return LocalMediaStorage(settings.media_dir, settings.max_upload_size_bytes)


@router.post("/", response_model=PetPublic, status_code=status.HTTP_201_CREATED)
def create_pet(payload: PetCreate, current_user: CurrentUser, db: DbSession) -> Pet:
    pet = Pet(user_id=current_user.id, **payload.model_dump())
    db.add(pet)
    db.flush()
    db.add(
        PetWeight(
            pet_id=pet.id,
            weight_g=pet.weight_g,
            measured_at=datetime.now(UTC),
        )
    )
    db.commit()
    db.refresh(pet)
    logger.info("Pet created", extra={"event": "pet.created", "pet_id": pet.id})
    return pet


@router.get(
    "/",
    response_model=list[PetPublic],
    description="The caller's own pets first, then pets in their temporary care.",
)
def list_pets(current_user: CurrentUser, db: DbSession) -> list[PetPublic]:
    pets = db.scalars(
        select(Pet)
        .where(visible_pet_condition(current_user.id))
        .order_by((Pet.user_id != current_user.id), Pet.id)
    ).all()
    return to_public(db, list(pets), current_user.id)


@router.get("/{pet_id}", response_model=PetPublic)
def get_pet(pet_id: int, current_user: CurrentUser, db: DbSession) -> PetPublic:
    return pet_public(db, get_cared_pet(pet_id, current_user, db), current_user.id)


@router.patch(
    "/{pet_id}",
    response_model=PetPublic,
    description="A temporary caretaker may only send weight_g (weighing the pet).",
)
def update_pet(
    pet_id: int, payload: PetUpdate, current_user: CurrentUser, db: DbSession
) -> PetPublic:
    pet = get_cared_pet(pet_id, current_user, db)
    changes = payload.model_dump(exclude_unset=True)
    if not changes:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="At least one field is required",
        )
    if set(changes) != {"weight_g"}:
        require_owner(pet, current_user.id)

    resulting_birth_date = changes.get("birth_date", pet.birth_date)
    resulting_approximate_age = changes.get(
        "approximate_age_years", pet.approximate_age_years
    )
    if resulting_birth_date is not None and resulting_approximate_age is not None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="birth_date and approximate_age_years cannot both be provided",
        )

    previous_weight = pet.weight_g
    for field, value in changes.items():
        setattr(pet, field, value)
    if "weight_g" in changes and changes["weight_g"] != previous_weight:
        db.add(
            PetWeight(
                pet=pet,
                weight_g=changes["weight_g"],
                measured_at=datetime.now(UTC),
            )
        )
    db.commit()
    db.refresh(pet)
    return pet_public(db, pet, current_user.id)


@router.get("/{pet_id}/weight", response_model=list[PetWeightPublic])
def get_pet_weight_history(
    pet_id: int, current_user: CurrentUser, db: DbSession
) -> list[PetWeight]:
    get_cared_pet(pet_id, current_user, db)
    return list(
        db.scalars(
            select(PetWeight)
            .where(PetWeight.pet_id == pet_id)
            .order_by(PetWeight.measured_at, PetWeight.id)
        ).all()
    )


@router.delete("/{pet_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_pet(
    pet_id: int, current_user: CurrentUser, db: DbSession, settings: AppSettings
) -> None:
    pet = get_owned_pet(pet_id, current_user, db)
    photo_url = pet.photo_url
    db.delete(pet)
    db.commit()
    storage_for(settings).delete(photo_url)
    logger.info(
        "Pet deleted with all its records", extra={"event": "pet.deleted", "pet_id": pet_id}
    )


@router.post("/{pet_id}/photo", response_model=PetPublic)
async def upload_pet_photo(
    pet_id: int,
    current_user: CurrentUser,
    db: DbSession,
    settings: AppSettings,
    file: UploadFile = File(...),
) -> Pet:
    pet = get_owned_pet(pet_id, current_user, db)
    storage = storage_for(settings)
    photo_url: str | None = None
    try:
        photo_url = await storage.save_pet_photo(file)
        old_photo_url = pet.photo_url
        pet.photo_url = photo_url
        db.commit()
        db.refresh(pet)
    except FileTooLargeError:
        if photo_url:
            storage.delete(photo_url)
        raise HTTPException(
            status_code=status.HTTP_413_CONTENT_TOO_LARGE,
            detail="Image exceeds the maximum allowed size",
        ) from None
    except InvalidImageError:
        if photo_url:
            storage.delete(photo_url)
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail="Unsupported or invalid image; use PNG, JPEG, GIF, or WebP",
        ) from None
    except Exception:
        logger.exception(
            "Could not save pet photo", extra={"event": "pet.photo_failed", "pet_id": pet_id}
        )
        db.rollback()
        if photo_url:
            storage.delete(photo_url)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Could not save pet photo",
        ) from None
    finally:
        await file.close()

    if old_photo_url:
        storage.delete(old_photo_url)
    return pet


@router.get("/{pet_id}/photo", response_class=FileResponse, response_model=None)
def get_pet_photo(
    pet_id: int, current_user: CurrentUser, db: DbSession, settings: AppSettings
) -> Response:
    pet = get_cared_pet(pet_id, current_user, db)
    resolved = storage_for(settings).resolve_photo(pet.photo_url)
    if resolved is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Photo not found")
    path, media_type = resolved
    return FileResponse(path=Path(path), media_type=media_type)
