from typing import Any

from alembic import command
from alembic.autogenerate import compare_metadata
from alembic.migration import MigrationContext
from sqlalchemy import Connection, inspect, text
from sqlalchemy.ext.asyncio import AsyncEngine

from app.models import Base
from tests.conftest import HEAD_REVISION, TABLES, alembic_config


async def test_database_is_at_head(engine: AsyncEngine) -> None:
    async with engine.connect() as connection:
        version = await connection.execute(text("SELECT version_num FROM alembic_version"))
    assert version.scalar_one() == HEAD_REVISION


async def test_every_table_exists(engine: AsyncEngine) -> None:
    async with engine.connect() as connection:
        names = await connection.run_sync(lambda sync: inspect(sync).get_table_names())
    assert set(TABLES) <= set(names)


async def test_expected_indexes_and_constraints(engine: AsyncEngine) -> None:
    def collect(sync: Connection) -> dict[str, Any]:
        inspector = inspect(sync)
        return {
            "experience_idx": {i["name"] for i in inspector.get_indexes("experience_entries")},
            "messages_idx": {i["name"] for i in inspector.get_indexes("contact_messages")},
            "admin_unique": [u["name"] for u in inspector.get_unique_constraints("admin_users")],
            "project_checks": {c["name"] for c in inspector.get_check_constraints("projects")},
            "translations_type": next(
                c["type"] for c in inspector.get_columns("projects") if c["name"] == "translations"
            ),
        }

    async with engine.connect() as connection:
        found = await connection.run_sync(collect)
    assert "experience_entries_sort_idx" in found["experience_idx"]
    assert "contact_messages_created_at_idx" in found["messages_idx"]
    assert found["admin_unique"] == ["uq_admin_users_email"]
    assert {
        "ck_projects_slug_format",
        "ck_projects_translations_locales",
        "ck_projects_placeholder_empty",
    } <= found["project_checks"]
    assert str(found["translations_type"]) == "JSONB"


async def test_models_match_the_migration(engine: AsyncEngine) -> None:
    """Autogenerate finds nothing to add: models and migration describe the same schema."""

    def compare(sync: Connection) -> list[Any]:
        context = MigrationContext.configure(sync, opts={"compare_type": True})
        diffs: list[Any] = compare_metadata(context, Base.metadata)
        return diffs

    async with engine.connect() as connection:
        diffs = await connection.run_sync(compare)
    assert diffs == []


def test_downgrade_and_upgrade_roundtrip(migrated_database: str) -> None:
    config = alembic_config(migrated_database)
    command.downgrade(config, "base")
    command.upgrade(config, "head")
