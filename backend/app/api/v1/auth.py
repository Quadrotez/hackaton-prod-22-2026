from fastapi import APIRouter, File, HTTPException, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from app.api.dependencies import AppSettings, CurrentUser, DbSession
from app.core.security import create_access_token, hash_password, verify_password
from app.models.user import User
from app.schemas.auth import Credentials, TokenResponse, UserPublic, UserRegistration
from app.services.storage import FileTooLargeError, InvalidImageError, LocalMediaStorage


router = APIRouter(prefix="/auth", tags=["auth"])


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
    return user


def get_or_create_user(credentials: Credentials, db: DbSession) -> User:
    email = str(credentials.email)
    user = db.scalar(select(User).where(User.email == email))
    if user is not None:
        return user

    user = User(
        email=email,
        name=None,
        password_hash=hash_password(credentials.password),
    )
    db.add(user)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        user = db.scalar(select(User).where(User.email == email))
        if user is None:
            raise
        return user
    db.refresh(user)
    return user


@router.post("/login", response_model=TokenResponse)
def login(credentials: Credentials, db: DbSession, settings: AppSettings) -> TokenResponse:
    user = db.scalar(select(User).where(User.email == str(credentials.email)))
    if user is None:
        user = get_or_create_user(credentials, db)
    elif not verify_password(credentials.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return TokenResponse(access_token=create_access_token(str(user.id), settings))


@router.get("/me", response_model=UserPublic)
def me(current_user: CurrentUser) -> User:
    return current_user


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
