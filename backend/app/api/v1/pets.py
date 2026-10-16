from pathlib import Path

from fastapi import APIRouter, File, HTTPException, Response, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.api.dependencies import AppSettings, CurrentUser, DbSession
from app.models.pet import Pet
from app.schemas.pets import PetCreate, PetPublic, PetUpdate
from app.services.storage import FileTooLargeError, InvalidImageError, LocalMediaStorage

router = APIRouter(prefix="/pets", tags=["pets"])


def get_owned_pet(pet_id: int, current_user: CurrentUser, db: DbSession) -> Pet:
    pet = db.scalar(select(Pet).where(Pet.id == pet_id, Pet.user_id == current_user.id))
    if pet is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Pet not found")
    return pet


def storage_for(settings: AppSettings) -> LocalMediaStorage:
    return LocalMediaStorage(settings.media_dir, settings.max_upload_size_bytes)


@router.post("/", response_model=PetPublic, status_code=status.HTTP_201_CREATED)
def create_pet(payload: PetCreate, current_user: CurrentUser, db: DbSession) -> Pet:
    pet = Pet(user_id=current_user.id, **payload.model_dump())
    db.add(pet)
    db.commit()
    db.refresh(pet)
    return pet


@router.get("/", response_model=list[PetPublic])
def list_pets(current_user: CurrentUser, db: DbSession) -> list[Pet]:
    return list(db.scalars(select(Pet).where(Pet.user_id == current_user.id).order_by(Pet.id)).all())


@router.get("/{pet_id}", response_model=PetPublic)
def get_pet(pet_id: int, current_user: CurrentUser, db: DbSession) -> Pet:
    return get_owned_pet(pet_id, current_user, db)


@router.patch("/{pet_id}", response_model=PetPublic)
def update_pet(
    pet_id: int, payload: PetUpdate, current_user: CurrentUser, db: DbSession
) -> Pet:
    pet = get_owned_pet(pet_id, current_user, db)
    changes = payload.model_dump(exclude_unset=True)
    if not changes:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="At least one field is required",
        )
    for field, value in changes.items():
        setattr(pet, field, value)
    db.commit()
    db.refresh(pet)
    return pet


@router.delete("/{pet_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_pet(
    pet_id: int, current_user: CurrentUser, db: DbSession, settings: AppSettings
) -> None:
    pet = get_owned_pet(pet_id, current_user, db)
    photo_url = pet.photo_url
    db.delete(pet)
    db.commit()
    storage_for(settings).delete(photo_url)


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
    pet = get_owned_pet(pet_id, current_user, db)
    resolved = storage_for(settings).resolve_photo(pet.photo_url)
    if resolved is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Photo not found")
    path, media_type = resolved
    return FileResponse(path=Path(path), media_type=media_type)
