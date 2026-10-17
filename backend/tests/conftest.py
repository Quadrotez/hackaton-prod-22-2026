import os
import shutil
import tempfile
from collections.abc import AsyncGenerator, Generator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import NullPool

os.environ["DATABASE_URL"] = "sqlite+pysqlite:///:memory:"
os.environ["JWT_SECRET_KEY"] = "test-only-secret-key-with-sufficient-length"
os.environ["ACCESS_TOKEN_EXPIRE_MINUTES"] = "30"
os.environ["MEDIA_DIR"] = str(Path(__file__).resolve().parent / "test-media")
os.environ["MAX_UPLOAD_SIZE_BYTES"] = str(5 * 1024 * 1024)

from app.db.async_session import get_async_db
from app.db.base import Base
from app.db.session import get_db
from app.main import app


# A file instead of :memory: so the sync and the async engine share one database.
DATABASE_PATH = Path(tempfile.mkdtemp(prefix="petcare-tests-")) / "test.sqlite"

engine = create_engine(
    f"sqlite+pysqlite:///{DATABASE_PATH}",
    connect_args={"check_same_thread": False},
)


@event.listens_for(engine, "connect")
def enable_wal(dbapi_connection, _connection_record) -> None:
    # WAL lets one engine read while the other writes instead of failing with "locked".
    dbapi_connection.execute("PRAGMA journal_mode=WAL")


TestingSessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)

# NullPool: every TestClient runs its own event loop, so connections must not outlive it.
async_engine = create_async_engine(f"sqlite+aiosqlite:///{DATABASE_PATH}", poolclass=NullPool)
AsyncTestingSessionLocal = async_sessionmaker(
    bind=async_engine, autoflush=False, expire_on_commit=False
)


def override_get_db() -> Generator[Session, None, None]:
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()


async def override_get_async_db() -> AsyncGenerator[AsyncSession, None]:
    async with AsyncTestingSessionLocal() as session:
        yield session


app.dependency_overrides[get_db] = override_get_db
app.dependency_overrides[get_async_db] = override_get_async_db


@pytest.fixture(autouse=True)
def reset_database() -> Generator[None, None, None]:
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    shutil.rmtree(os.environ["MEDIA_DIR"], ignore_errors=True)
    yield
    shutil.rmtree(os.environ["MEDIA_DIR"], ignore_errors=True)


@pytest.fixture
def client() -> Generator[TestClient, None, None]:
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture
def db() -> Generator[Session, None, None]:
    session = TestingSessionLocal()
    try:
        yield session
    finally:
        session.close()
