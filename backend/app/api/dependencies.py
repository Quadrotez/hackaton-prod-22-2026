from typing import Annotated

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import Settings, get_settings
from app.core.security import decode_access_token
from app.db.session import get_db
from app.models.food import Food
from app.models.user import User


bearer_scheme = HTTPBearer(auto_error=False)
DbSession = Annotated[Session, Depends(get_db)]
AppSettings = Annotated[Settings, Depends(get_settings)]


def authentication_error() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )


def get_current_user(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer_scheme)],
    db: DbSession,
    settings: AppSettings,
) -> User:
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise authentication_error()

    try:
        payload = decode_access_token(credentials.credentials, settings)
        subject = payload.get("sub")
        if not isinstance(subject, str):
            raise authentication_error()
        user_id = int(subject)
    except (jwt.InvalidTokenError, TypeError, UnicodeError, ValueError):
        raise authentication_error() from None

    user = db.get(User, user_id)
    if user is None:
        raise authentication_error()
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]


def get_owned_food(food_id: int, current_user: CurrentUser, db: DbSession) -> Food:
    """Return the catalog food only if it belongs to the authenticated user, else 404."""
    food = db.scalar(select(Food).where(Food.id == food_id, Food.user_id == current_user.id))
    if food is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Food not found")
    return food
