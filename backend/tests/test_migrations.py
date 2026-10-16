from pathlib import Path

from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, inspect

from app.core.config import get_settings


def test_feeding_records_migration_upgrade_and_downgrade(
    tmp_path: Path, monkeypatch,
) -> None:
    database_path = tmp_path / "migration.sqlite"
    database_url = f"sqlite+pysqlite:///{database_path}"
    monkeypatch.setenv("DATABASE_URL", database_url)
    get_settings.cache_clear()

    config = Config("alembic.ini")
    try:
        command.upgrade(config, "head")
        inspector = inspect(create_engine(database_url))
        assert "feeding_records" in inspector.get_table_names()

        columns = {
            column["name"]: column
            for column in inspector.get_columns("feeding_records")
        }
        assert columns["pet_id"]["nullable"] is False
        assert columns["food_name"]["nullable"] is False
        assert columns["fed_at"]["nullable"] is False
        assert columns["liked"]["nullable"] is False
        assert columns["tolerated"]["nullable"] is False
        assert columns["reaction_notes"]["nullable"] is True
        assert columns["notes"]["nullable"] is True

        foreign_keys = inspector.get_foreign_keys("feeding_records")
        assert len(foreign_keys) == 1
        assert foreign_keys[0]["constrained_columns"] == ["pet_id"]
        assert foreign_keys[0]["referred_table"] == "pets"
        assert foreign_keys[0]["options"].get("ondelete") == "CASCADE"

        command.downgrade(config, "20261016_0003")
        downgraded_inspector = inspect(create_engine(database_url))
        assert "feeding_records" not in downgraded_inspector.get_table_names()
        assert "pets" in downgraded_inspector.get_table_names()
    finally:
        get_settings.cache_clear()
