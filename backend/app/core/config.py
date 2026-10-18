from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

PROJECT_ROOT = Path(__file__).resolve().parents[3]


class Settings(BaseSettings):
    database_url: str = "postgresql+psycopg://postgres:postgres@localhost:5432/petcare"
    jwt_secret_key: str
    access_token_expire_minutes: int = 30
    media_dir: Path = PROJECT_ROOT / "media"
    max_upload_size_bytes: int = 5 * 1024 * 1024
    log_level: Literal["DEBUG", "INFO", "WARNING", "ERROR"] = "INFO"
    # json for servers (one object per line), text for reading locally.
    log_format: Literal["json", "text"] = "json"
    # Optional Sage Logs push appender. Disabled when the URL is empty.
    sage_log_url: str | None = None
    sage_api_token: str | None = None
    sage_log_timeout_seconds: float = 5.0

    model_config = SettingsConfigDict(
        env_file=PROJECT_ROOT / ".env", env_file_encoding="utf-8", extra="ignore"
    )

    @field_validator("log_level", mode="before")
    @classmethod
    def upper_log_level(cls, value: object) -> object:
        return value.upper() if isinstance(value, str) else value

    @field_validator("media_dir", mode="after")
    @classmethod
    def resolve_media_dir(cls, value: Path) -> Path:
        return value if value.is_absolute() else PROJECT_ROOT / value


@lru_cache
def get_settings() -> Settings:
    return Settings()
