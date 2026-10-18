"""Async counterparts of app.api.dependencies for routers built on AsyncSession."""

from typing import Annotated

import jwt
from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import AppSettings, authentication_error, bearer_scheme
from app.core.log import bind_user
from app.core.security import decode_access_token
from app.db.async_session import get_async_db
from app.models.pet import Pet
from app.models.user import User
from app.services.pet_access import get_visible_pet_async, require_owner

AsyncDbSession = Annotated[AsyncSession, Depends(get_async_db)]


async def get_current_user(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer_scheme)],
    db: AsyncDbSession,
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

    user = await db.get(User, user_id)
    if user is None:
        raise authentication_error()
    bind_user(user.id)
    return user


AsyncCurrentUser = Annotated[User, Depends(get_current_user)]


async def get_cared_pet(pet_id: int, current_user: AsyncCurrentUser, db: AsyncDbSession) -> Pet:
    return await get_visible_pet_async(db, pet_id, current_user.id)


async def get_owned_pet(pet_id: int, current_user: AsyncCurrentUser, db: AsyncDbSession) -> Pet:
    return require_owner(await get_visible_pet_async(db, pet_id, current_user.id), current_user.id)


# Resolves the {pet_id} path parameter to a pet owned by the caller: 404 for strangers,
# 403 for someone who has the pet in temporary care.
OwnedPet = Annotated[Pet, Depends(get_owned_pet)]
# The same, but a temporary caretaker passes too: reading and adding care records.
CaredPet = Annotated[Pet, Depends(get_cared_pet)]
