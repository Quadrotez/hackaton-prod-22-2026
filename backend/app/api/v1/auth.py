import logging

from fastapi import APIRouter, File, HTTPException, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from app.api.dependencies import AppSettings, CurrentUser, DbSession
from app.core.log import bind_user
from app.core.security import create_access_token, hash_password, verify_password
from app.models.user import User
from app.schemas.auth import (
    Credentials,
    PasswordUpdate,
    TokenResponse,
    UserPublic,
    UserRegistration,
    UserUpdate,
)
from app.services.storage import FileTooLargeError, InvalidImageError, LocalMediaStorage

router = APIRouter(prefix="/auth", tags=["auth"])
logger = logging.getLogger(__name__)


def storage_for(settings: AppSettings) -> LocalMediaStorage:
    return LocalMediaStorage(settings.media_dir, settings.max_upload_size_bytes)


@router.post("/register", response_model=UserPublic, status_code=status.HTTP_201_CREATED)
def register(payload: UserRegistration, db: DbSession) -> User:
    user = User(
        email=str(payload.email),
        name=payload.name,
        password_hash=hash_password(payload.password),
    )
    db.add(user)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A user with this email already exists",
        ) from None
    db.refresh(user)
    logger.info("User registered", extra={"event": "user.registered", "new_user_id": user.id})
    return user


@router.post("/login", response_model=TokenResponse)
def login(credentials: Credentials, db: DbSession, settings: AppSettings) -> TokenResponse:
    user = db.scalar(select(User).where(User.email == str(credentials.email)))
    if user is None or not verify_password(credentials.password, user.password_hash):
        # No email in logs; whether the account exists is enough to spot guessing.
        logger.warning(
            "Login failed",
            extra={"event": "auth.login_failed", "known_user": user is not None},
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    bind_user(user.id)
    logger.info("Login succeeded", extra={"event": "auth.login"})
    return TokenResponse(access_token=create_access_token(str(user.id), settings))


@router.get("/me", response_model=UserPublic)
def me(current_user: CurrentUser) -> User:
    return current_user


@router.patch("/me", response_model=UserPublic)
def update_me(payload: UserUpdate, current_user: CurrentUser, db: DbSession) -> User:
    current_user.name = payload.name
    db.commit()
    db.refresh(current_user)
    return current_user


@router.patch("/me/password", status_code=status.HTTP_204_NO_CONTENT)
def update_password(payload: PasswordUpdate, current_user: CurrentUser, db: DbSession) -> None:
    if not verify_password(payload.current_password, current_user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Current password is incorrect",
        )
    if payload.current_password == payload.new_password:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="New password must be different from the current password",
        )

    current_user.password_hash = hash_password(payload.new_password)
    db.commit()
    logger.info("Password changed", extra={"event": "auth.password_changed"})


@router.post("/me/avatar", response_model=UserPublic)
async def upload_avatar(
    current_user: CurrentUser,
    db: DbSession,
    settings: AppSettings,
    file: UploadFile = File(...),
) -> User:
    storage = storage_for(settings)
    avatar_url: str | None = None
    old_avatar_url = current_user.avatar_url
    try:
        avatar_url = await storage.save_avatar(file)
        current_user.avatar_url = avatar_url
        db.commit()
        db.refresh(current_user)
    except FileTooLargeError:
        if avatar_url:
            storage.delete(avatar_url)
        raise HTTPException(
            status_code=status.HTTP_413_CONTENT_TOO_LARGE,
            detail="Image exceeds the maximum allowed size",
        ) from None
    except InvalidImageError:
        if avatar_url:
            storage.delete(avatar_url)
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail="Unsupported or invalid image; use PNG, JPEG, GIF, or WebP",
        ) from None
    except Exception:
        logger.exception("Could not save avatar", extra={"event": "auth.avatar_failed"})
        db.rollback()
        if avatar_url:
            storage.delete(avatar_url)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Could not save avatar",
        ) from None
    finally:
        await file.close()

    if old_avatar_url:
        storage.delete(old_avatar_url)
    return current_user


@router.get("/me/avatar", response_class=FileResponse, response_model=None)
def get_avatar(current_user: CurrentUser, settings: AppSettings) -> FileResponse:
    resolved = storage_for(settings).resolve_photo(current_user.avatar_url)
    if resolved is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Avatar not found")
    path, media_type = resolved
    return FileResponse(path=path, media_type=media_type)
