from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from app.api.dependencies import AppSettings, CurrentUser, DbSession
from app.core.security import create_access_token, hash_password
from app.models.user import User
from app.schemas.auth import Credentials, TokenResponse, UserPublic


router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=UserPublic, status_code=status.HTTP_201_CREATED)
def register(credentials: Credentials, db: DbSession) -> User:
    user = User(
        email=str(credentials.email),
        password_hash=hash_password(credentials.password),
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

    user = User(email=email, password_hash=hash_password(credentials.password))
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
    # Demo mode: signing in with an unknown email registers it on the fly and any
    # password is accepted, so reviewers can always get into their own account.
    user = get_or_create_user(credentials, db)
    return TokenResponse(access_token=create_access_token(str(user.id), settings))


@router.get("/me", response_model=UserPublic)
def me(current_user: CurrentUser) -> User:
    return current_user
