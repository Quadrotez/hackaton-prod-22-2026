from collections.abc import AsyncGenerator

from sqlalchemy.engine import URL, make_url
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.config import get_settings


# Sync drivers used by the rest of the app -> their async counterparts.
# psycopg 3 serves both modes under the same driver name.
ASYNC_DRIVERS = {
    "postgresql": "postgresql+psycopg",
    "postgresql+psycopg": "postgresql+psycopg",
    "postgresql+psycopg2": "postgresql+psycopg",
    "sqlite": "sqlite+aiosqlite",
    "sqlite+pysqlite": "sqlite+aiosqlite",
}


def to_async_url(database_url: str) -> URL:
    url = make_url(database_url)
    return url.set(drivername=ASYNC_DRIVERS.get(url.drivername, url.drivername))


settings = get_settings()
async_engine = create_async_engine(to_async_url(settings.database_url), pool_pre_ping=True)
# expire_on_commit=False: attributes stay readable after commit without an implicit
# (and in async mode forbidden) lazy reload.
AsyncSessionLocal = async_sessionmaker(
    bind=async_engine, autoflush=False, expire_on_commit=False
)


async def get_async_db() -> AsyncGenerator[AsyncSession, None]:
    async with AsyncSessionLocal() as session:
        yield session
