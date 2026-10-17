from pathlib import Path

from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, inspect, text

from app.core.config import get_settings


def test_food_catalog_migration_creates_and_drops_food_tables(
    tmp_path: Path, monkeypatch,
) -> None:
    database_path = tmp_path / "food-catalog-migration.sqlite"
    database_url = f"sqlite+pysqlite:///{database_path}"
    monkeypatch.setenv("DATABASE_URL", database_url)
    get_settings.cache_clear()

    config = Config("alembic.ini")
    engine = create_engine(database_url)
    try:
        command.upgrade(config, "head")
        inspector = inspect(engine)
        assert {"foods", "food_stocks"}.issubset(inspector.get_table_names())
        food_columns = {column["name"] for column in inspector.get_columns("foods")}
        stock_columns = {column["name"] for column in inspector.get_columns("food_stocks")}
        assert {"user_id", "name", "type", "protein", "fats", "carbohydrates", "calories"}.issubset(food_columns)
        assert {"user_id", "food_id", "total_grams", "remaining_grams"}.issubset(stock_columns)
        assert any(
            index["name"] == "ix_foods_user_id" for index in inspector.get_indexes("foods")
        )
        assert any(
            constraint["name"] == "uq_food_stocks_food_id"
            for constraint in inspector.get_unique_constraints("food_stocks")
        )

        command.downgrade(config, "20261017_0006")
        downgraded_tables = set(inspect(engine).get_table_names())
        assert "foods" not in downgraded_tables
        assert "food_stocks" not in downgraded_tables
    finally:
        engine.dispose()
        get_settings.cache_clear()


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
        assert columns["food_id"]["nullable"] is True
        assert columns["food_name"]["nullable"] is False
        assert columns["fed_at"]["nullable"] is False
        assert columns["liked"]["nullable"] is False
        assert columns["tolerated"]["nullable"] is False
        assert columns["reaction_notes"]["nullable"] is True
        assert columns["notes"]["nullable"] is True

        foreign_keys = inspector.get_foreign_keys("feeding_records")
        assert len(foreign_keys) == 2
        pet_foreign_key = next(
            foreign_key
            for foreign_key in foreign_keys
            if foreign_key["constrained_columns"] == ["pet_id"]
        )
        food_foreign_key = next(
            foreign_key
            for foreign_key in foreign_keys
            if foreign_key["constrained_columns"] == ["food_id"]
        )
        assert pet_foreign_key["referred_table"] == "pets"
        assert pet_foreign_key["options"].get("ondelete") == "CASCADE"
        assert food_foreign_key["referred_table"] == "foods"
        assert food_foreign_key["options"].get("ondelete") == "SET NULL"

        command.downgrade(config, "20261016_0003")
        downgraded_inspector = inspect(create_engine(database_url))
        assert "feeding_records" not in downgraded_inspector.get_table_names()
        assert "pets" in downgraded_inspector.get_table_names()
    finally:
        get_settings.cache_clear()


def test_user_profile_migration_backfills_username_and_supports_avatar(
    tmp_path: Path, monkeypatch,
) -> None:
    database_path = tmp_path / "user-profile-migration.sqlite"
    database_url = f"sqlite+pysqlite:///{database_path}"
    monkeypatch.setenv("DATABASE_URL", database_url)
    get_settings.cache_clear()

    config = Config("alembic.ini")
    engine = create_engine(database_url)
    try:
        command.upgrade(config, "20261016_0005")
        with engine.begin() as connection:
            connection.execute(
                text(
                    "INSERT INTO users (email, password_hash, created_at) "
                    "VALUES ('Existing.Owner@example.com', 'hash', CURRENT_TIMESTAMP)"
                )
            )

        command.upgrade(config, "head")
        inspector = inspect(engine)
        columns = {column["name"] for column in inspector.get_columns("users")}
        assert {"username", "avatar_url"}.issubset(columns)
        assert any(
            index["name"] == "ix_users_username" and index["unique"]
            for index in inspector.get_indexes("users")
        )

        with engine.begin() as connection:
            row = connection.execute(
                text("SELECT username, avatar_url FROM users")
            ).one()
            assert row.username == "existing_owner"
            assert row.avatar_url is None

        command.downgrade(config, "20261016_0005")
        downgraded_columns = {
            column["name"] for column in inspect(engine).get_columns("users")
        }
        assert "username" not in downgraded_columns
        assert "avatar_url" not in downgraded_columns
    finally:
        engine.dispose()
        get_settings.cache_clear()


def test_pet_sex_migration_backfills_existing_rows_and_enforces_choices(
    tmp_path: Path, monkeypatch,
) -> None:
    database_path = tmp_path / "pet-sex-migration.sqlite"
    database_url = f"sqlite+pysqlite:///{database_path}"
    monkeypatch.setenv("DATABASE_URL", database_url)
    get_settings.cache_clear()

    config = Config("alembic.ini")
    engine = create_engine(database_url)
    try:
        command.upgrade(config, "20261016_0004")
        with engine.begin() as connection:
            connection.execute(
                text(
                    "INSERT INTO users (email, password_hash, created_at) "
                    "VALUES ('existing@example.com', 'hash', CURRENT_TIMESTAMP)"
                )
            )
            connection.execute(
                text(
                    "INSERT INTO pets (user_id, name, species, weight_g) "
                    "VALUES (1, 'Milo', 'cat', 4500)"
                )
            )

        command.upgrade(config, "head")
        inspector = inspect(engine)
        columns = {column["name"]: column for column in inspector.get_columns("pets")}
        assert columns["sex"]["nullable"] is False

        with engine.connect() as connection:
            assert connection.execute(text("SELECT sex FROM pets")).scalar_one() == "boy"

        check_sql = " ".join(
            constraint.get("sqltext", "")
            for constraint in inspector.get_check_constraints("pets")
        )
        assert "boy" in check_sql
        assert "girl" in check_sql

        command.downgrade(config, "20261016_0004")
        downgraded_columns = {
            column["name"] for column in inspect(engine).get_columns("pets")
        }
        assert "sex" not in downgraded_columns
    finally:
        engine.dispose()
        get_settings.cache_clear()
