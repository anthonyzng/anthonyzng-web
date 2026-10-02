"""The backend's database role check (`app.db_roles`), against the real test database.

The test database's superuser plays the platform: the `role` fixture gives a fresh role exactly
the rights the platform's `provision-app` gives `anthonyzng_web_app` (LOGIN, CONNECT, USAGE on
public, the four row privileges on every table, nothing for PUBLIC on the database), and each test
widens or narrows them.
"""

import uuid
from collections.abc import AsyncIterator
from typing import Any

import pytest
from pydantic import ValidationError
from sqlalchemy import make_url, text
from sqlalchemy.exc import DBAPIError
from sqlalchemy.ext.asyncio import AsyncEngine, create_async_engine
from sqlalchemy.pool import NullPool

from app.db_roles import RoleSettings, check_app_role, revoke_migration_tables, run

# Throwaway credentials of a temporary test role (not secrets).
TEST_PASSWORD = "test-role-password-0123456789abcdef"  # ggignore
IP_HASH = "a" * 64


@pytest.fixture
async def role(engine: AsyncEngine) -> AsyncIterator[str]:
    """A fresh role (roles are cluster-wide) with the platform's app-role rights, dropped after."""
    name = f"test_app_{uuid.uuid4().hex[:12]}"
    async with engine.begin() as connection:
        database = (await connection.execute(text("SELECT current_database()"))).scalar_one()
        await connection.exec_driver_sql(f"CREATE ROLE \"{name}\" LOGIN PASSWORD '{TEST_PASSWORD}'")
        # As provision-app does: PUBLIC keeps no right on the database.
        await connection.exec_driver_sql(f'REVOKE ALL ON DATABASE "{database}" FROM PUBLIC')
        await connection.exec_driver_sql(f'GRANT CONNECT ON DATABASE "{database}" TO "{name}"')
        await connection.exec_driver_sql(f'GRANT USAGE ON SCHEMA public TO "{name}"')
        await connection.exec_driver_sql(
            f'GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO "{name}"'
        )
    try:
        yield name
    finally:
        async with engine.begin() as connection:
            exists = (
                await connection.execute(
                    text("SELECT 1 FROM pg_roles WHERE rolname = :n"), {"n": name}
                )
            ).first()
            if exists:
                await connection.exec_driver_sql(f'DROP OWNED BY "{name}"')
                await connection.exec_driver_sql(f'DROP ROLE "{name}"')


def engine_as(database_url: str, user: str, password: str) -> AsyncEngine:
    url = make_url(database_url).set(username=user, password=password)
    return create_async_engine(url, poolclass=NullPool)


async def refused(app_engine: AsyncEngine, statement: str) -> bool:
    try:
        async with app_engine.begin() as connection:
            await connection.execute(text(statement))
    except DBAPIError as exc:
        return "permission denied" in str(exc.orig) or "must be owner" in str(exc.orig)
    return False


async def problems_of(engine: AsyncEngine, role: str) -> list[str]:
    async with engine.begin() as connection:
        return await check_app_role(connection, role)


async def test_platform_role_passes_and_reads_writes_rows_only(
    engine: AsyncEngine, migrated_database: str, role: str
) -> None:
    async with engine.begin() as connection:
        await revoke_migration_tables(connection, role)
        assert await check_app_role(connection, role) == []

    app_engine = engine_as(migrated_database, role, TEST_PASSWORD)
    try:
        async with app_engine.begin() as connection:
            # The identity column needs no sequence privilege.
            message_id = (
                await connection.execute(
                    text(
                        "INSERT INTO contact_messages (name, email, message, ip_hash) "
                        "VALUES ('A', 'a@example.com', 'Hello there', :h) RETURNING id"
                    ),
                    {"h": IP_HASH},
                )
            ).scalar_one()
            await connection.execute(
                text("UPDATE contact_messages SET read_at = now() WHERE id = :id"),
                {"id": message_id},
            )
            await connection.execute(text("SELECT id FROM contact_messages FOR UPDATE"))
            await connection.execute(text("SELECT pg_advisory_xact_lock(1)"))
            await connection.execute(
                text("DELETE FROM contact_messages WHERE id = :id"), {"id": message_id}
            )

        for statement in (
            "CREATE TABLE intruder (id int)",
            "DROP TABLE projects",
            "ALTER TABLE projects ADD COLUMN extra int",
            "TRUNCATE contact_messages",
            "SELECT version_num FROM alembic_version",
            "CREATE TEMP TABLE scratch (id int)",
            "CREATE ROLE another_role",
            "COPY projects TO PROGRAM 'id'",
        ):
            assert await refused(app_engine, statement), statement
    finally:
        await app_engine.dispose()


async def test_the_migration_table_is_taken_back(engine: AsyncEngine, role: str) -> None:
    # The default privileges grant alembic_version like any table (the fixture did too).
    assert f"{role} has SELECT, INSERT, UPDATE, DELETE on alembic_version" in await problems_of(
        engine, role
    )
    async with engine.begin() as connection:
        await revoke_migration_tables(connection, role)
    assert await problems_of(engine, role) == []


async def test_widened_rights_are_reported_by_name_only(engine: AsyncEngine, role: str) -> None:
    async with engine.begin() as connection:
        await revoke_migration_tables(connection, role)
        await connection.exec_driver_sql(f'GRANT TRUNCATE, REFERENCES ON projects TO "{role}"')
        await connection.exec_driver_sql(f'GRANT pg_write_all_data TO "{role}"')
        await connection.exec_driver_sql(f'ALTER ROLE "{role}" CREATEDB')
        await connection.exec_driver_sql(f'GRANT CREATE ON SCHEMA public TO "{role}"')
    problems = await problems_of(engine, role)
    assert f"{role} has TRUNCATE, REFERENCES on projects" in problems
    assert f"{role} is a member of pg_write_all_data" in problems
    assert f"{role} has rolcreatedb" in problems
    assert f"{role} may create objects in schema public" in problems
    assert all(TEST_PASSWORD not in problem for problem in problems)


async def test_missing_rights_are_reported(engine: AsyncEngine, role: str) -> None:
    async with engine.begin() as connection:
        await revoke_migration_tables(connection, role)
        await connection.exec_driver_sql(f'REVOKE INSERT, DELETE ON projects FROM "{role}"')
        database = (await connection.execute(text("SELECT current_database()"))).scalar_one()
        await connection.exec_driver_sql(f'REVOKE CONNECT ON DATABASE "{database}" FROM "{role}"')
    problems = await problems_of(engine, role)
    assert f"{role} lacks INSERT, DELETE on projects" in problems
    assert f"{role} cannot connect to the database" in problems


async def test_the_owner_and_an_unknown_role_are_reported(engine: AsyncEngine) -> None:
    async with engine.begin() as connection:
        owner = (await connection.execute(text("SELECT current_user"))).scalar_one()
    assert await problems_of(engine, owner) == [
        f"{owner} is the schema owner, not a separate app role"
    ]
    assert await problems_of(engine, "no_such_role") == [
        "no_such_role does not exist (the platform's provision-app creates it)"
    ]


async def test_run_revokes_then_checks(migrated_database: str, role: str) -> None:
    settings = role_settings(DATABASE_URL=migrated_database, DATABASE_APP_USER=role)
    assert await run(settings) == []


def role_settings(**overrides: Any) -> RoleSettings:
    values: dict[str, Any] = {
        "_env_file": None,
        "DATABASE_URL": "postgresql+asyncpg://owner:pw@platform-postgres:5432/app",  # ggignore
        "DATABASE_APP_USER": "anthonyzng_web_app",
    }
    values.update(overrides)
    return RoleSettings(**values)


def test_settings_accept_a_plain_name() -> None:
    assert role_settings().DATABASE_APP_USER == "anthonyzng_web_app"


@pytest.mark.parametrize(
    "name", ["App", 'x"; DROP TABLE projects; --', "a" * 64, "anthonyzng-web-app"]
)
def test_settings_refuse_unsafe_names_without_echoing_them(name: str) -> None:
    with pytest.raises(ValidationError) as caught:
        role_settings(DATABASE_APP_USER=name)
    assert name not in str(caught.value)
