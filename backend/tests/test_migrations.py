from pathlib import Path

from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, inspect, text

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

        command.downgrade(config, "20261017_0006")
        downgraded = set(inspect(create_engine(database_url)).get_table_names())
        assert not MEASUREMENT_TABLES & downgraded
        assert "vet_visits" in downgraded
    finally:
        get_settings.cache_clear()
