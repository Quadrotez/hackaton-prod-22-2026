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


def test_stock_checks_migration_adds_amount_and_constraints(
    tmp_path: Path, monkeypatch,
) -> None:
    database_path = tmp_path / "stock-checks-migration.sqlite"
    database_url = f"sqlite+pysqlite:///{database_path}"
    monkeypatch.setenv("DATABASE_URL", database_url)
    get_settings.cache_clear()

    config = Config("alembic.ini")
    engine = create_engine(database_url)
    try:
        command.upgrade(config, "20261017_0009")
        with engine.begin() as connection:
            connection.execute(
                text(
                    "INSERT INTO users (email, password_hash, created_at) "
                    "VALUES ('stock@example.com', 'hash', CURRENT_TIMESTAMP)"
                )
            )
            connection.execute(
                text(
                    "INSERT INTO foods (user_id, name, type, protein, fats, carbohydrates, "
                    "calories, created_at) VALUES (1, 'F', 'dry', 1, 1, 1, 1, CURRENT_TIMESTAMP)"
                )
            )
            connection.execute(
                text(
                    "INSERT INTO food_stocks (user_id, food_id, total_grams, remaining_grams, "
                    "updated_at) VALUES (1, 1, 100, 250, CURRENT_TIMESTAMP)"
                )
            )

        command.upgrade(config, "head")
        inspector = inspect(engine)
        columns = {c["name"]: c for c in inspector.get_columns("feeding_records")}
        assert columns["amount_grams"]["nullable"] is True
        check_names = {
            c["name"] for c in inspector.get_check_constraints("food_stocks")
        }
        assert {
            "ck_food_stocks_total_grams_positive",
            "ck_food_stocks_remaining_grams_range",
        }.issubset(check_names)
        with engine.connect() as connection:
            assert connection.execute(
                text("SELECT remaining_grams FROM food_stocks")
            ).scalar_one() == 100

        command.downgrade(config, "20261017_0009")
        inspector = inspect(engine)
        assert "amount_grams" not in {
            c["name"] for c in inspector.get_columns("feeding_records")
        }
        assert not inspector.get_check_constraints("food_stocks")
    finally:
        engine.dispose()
        get_settings.cache_clear()


def test_user_profile_migration_replaces_username_with_optional_name(
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
        assert {"name", "avatar_url"}.issubset(columns)
        assert "username" not in columns
        assert not any(index["name"] == "ix_users_username" for index in inspector.get_indexes("users"))

        with engine.begin() as connection:
            row = connection.execute(
                text("SELECT name, avatar_url FROM users")
            ).one()
            assert row.name is None
            assert row.avatar_url is None

        command.downgrade(config, "20261016_0005")
        downgraded_columns = {
            column["name"] for column in inspect(engine).get_columns("users")
        }
        assert "username" not in downgraded_columns
        assert "name" not in downgraded_columns
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


HEALTH_TABLES = {
    "symptoms",
    "allergies",
    "pregnancies",
    "vaccinations",
    "medications",
    "medication_times",
    "medication_intakes",
    "vet_visits",
}


def test_health_tables_migration_upgrade_and_downgrade(tmp_path: Path, monkeypatch) -> None:
    database_url = f"sqlite+pysqlite:///{tmp_path / 'health-migration.sqlite'}"
    monkeypatch.setenv("DATABASE_URL", database_url)
    get_settings.cache_clear()

    config = Config("alembic.ini")
    try:
        command.upgrade(config, "head")
        inspector = inspect(create_engine(database_url))
        assert HEALTH_TABLES <= set(inspector.get_table_names())

        visit_keys = {
            tuple(key["constrained_columns"]): key
            for key in inspector.get_foreign_keys("vet_visits")
        }
        assert visit_keys[("pet_id",)]["options"].get("ondelete") == "CASCADE"
        assert visit_keys[("referred_by_visit_id",)]["referred_table"] == "vet_visits"
        assert visit_keys[("referred_by_visit_id",)]["options"].get("ondelete") == "SET NULL"

        active_index = next(
            index
            for index in inspector.get_indexes("pregnancies")
            if index["name"] == "uq_pregnancies_active_pet"
        )
        assert active_index["unique"]

        command.downgrade(config, "20261016_0005")
        downgraded = set(inspect(create_engine(database_url)).get_table_names())
        assert not HEALTH_TABLES & downgraded
        assert "feeding_records" in downgraded
    finally:
        get_settings.cache_clear()


MEASUREMENT_TABLES = {"measurement_profiles", "measurement_parameters", "measurements"}


def test_measurements_migration_upgrade_and_downgrade(tmp_path: Path, monkeypatch) -> None:
    database_url = f"sqlite+pysqlite:///{tmp_path / 'measurements-migration.sqlite'}"
    monkeypatch.setenv("DATABASE_URL", database_url)
    get_settings.cache_clear()

    config = Config("alembic.ini")
    try:
        command.upgrade(config, "head")
        inspector = inspect(create_engine(database_url))
        assert MEASUREMENT_TABLES <= set(inspector.get_table_names())
        measurement_keys = inspector.get_foreign_keys("measurements")
        assert measurement_keys[0]["referred_table"] == "measurement_parameters"
        assert measurement_keys[0]["options"].get("ondelete") == "CASCADE"

        command.downgrade(config, "20261017_0010")
        downgraded = set(inspect(create_engine(database_url)).get_table_names())
        assert not MEASUREMENT_TABLES & downgraded
        assert "vet_visits" in downgraded
    finally:
        get_settings.cache_clear()


def test_calendar_feeds_migration_upgrade_and_downgrade(tmp_path: Path, monkeypatch) -> None:
    database_url = f"sqlite+pysqlite:///{tmp_path / 'calendar-migration.sqlite'}"
    monkeypatch.setenv("DATABASE_URL", database_url)
    get_settings.cache_clear()

    config = Config("alembic.ini")
    try:
        command.upgrade(config, "head")
        inspector = inspect(create_engine(database_url))
        assert "calendar_feeds" in inspector.get_table_names()
        keys = inspector.get_foreign_keys("calendar_feeds")
        assert keys[0]["referred_table"] == "users"
        assert keys[0]["options"].get("ondelete") == "CASCADE"

        command.downgrade(config, "20261017_0012")
        downgraded = set(inspect(create_engine(database_url)).get_table_names())
        assert "calendar_feeds" not in downgraded
        assert "measurements" in downgraded
    finally:
        get_settings.cache_clear()


def test_pet_transfers_migration_upgrade_and_downgrade(tmp_path: Path, monkeypatch) -> None:
    database_url = f"sqlite+pysqlite:///{tmp_path / 'transfers-migration.sqlite'}"
    monkeypatch.setenv("DATABASE_URL", database_url)
    get_settings.cache_clear()

    config = Config("alembic.ini")
    try:
        command.upgrade(config, "head")
        inspector = inspect(create_engine(database_url))
        assert "pet_transfers" in inspector.get_table_names()
        keys = {
            tuple(key["constrained_columns"]): key
            for key in inspector.get_foreign_keys("pet_transfers")
        }
        assert keys[("pet_id",)]["options"].get("ondelete") == "CASCADE"
        assert keys[("owner_id",)]["referred_table"] == "users"
        open_index = next(
            index
            for index in inspector.get_indexes("pet_transfers")
            if index["name"] == "uq_pet_transfers_open_pet"
        )
        assert open_index["unique"]

        command.downgrade(config, "20261017_0014")
        downgraded = set(inspect(create_engine(database_url)).get_table_names())
        assert "pet_transfers" not in downgraded
        assert "pets" in downgraded
    finally:
        get_settings.cache_clear()
