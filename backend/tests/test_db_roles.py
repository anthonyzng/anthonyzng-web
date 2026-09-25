"""The backend's least-privilege database role (`app.db_roles`), against the real test database."""

import uuid
from collections.abc import AsyncIterator
from typing import Any

import asyncpg
import pytest
from pydantic import ValidationError
from sqlalchemy import make_url, text
from sqlalchemy.exc import DBAPIError
from sqlalchemy.ext.asyncio import AsyncEngine, create_async_engine
from sqlalchemy.pool import NullPool

from app.db_roles import RoleSettings, apply_app_role

# Throwaway credentials of a temporary test role (not secrets).
FIRST_PASSWORD = "first-password-0123456789abcdef"  # ggignore
SECOND_PASSWORD = "second-password-0123456789abcdef"  # ggignore
IP_HASH = "a" * 64


@pytest.fixture
async def role(engine: AsyncEngine) -> AsyncIterator[str]:
    """A fresh role name (roles are cluster-wide), dropped with its grants afterwards."""
    name = f"test_app_{uuid.uuid4().hex[:12]}"
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


async def test_app_role_reads_and_writes_rows_only(
    engine: AsyncEngine, migrated_database: str, role: str
) -> None:
    async with engine.begin() as connection:
        assert await apply_app_role(connection, role, FIRST_PASSWORD) == "created"

    app_engine = engine_as(migrated_database, role, FIRST_PASSWORD)
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
            "CREATE ROLE another_role",
            "COPY projects TO PROGRAM 'id'",
        ):
            assert await refused(app_engine, statement), statement
    finally:
        await app_engine.dispose()


async def test_rerun_rotates_the_password_and_resets_privileges(
    engine: AsyncEngine, migrated_database: str, role: str
) -> None:
    async with engine.begin() as connection:
        await apply_app_role(connection, role, FIRST_PASSWORD)
        # A privilege granted by hand is taken back by the next run.
        await connection.exec_driver_sql(f'GRANT TRUNCATE ON projects TO "{role}"')
        await connection.exec_driver_sql(f'GRANT pg_write_all_data TO "{role}"')
        owner = (await connection.execute(text("SELECT current_user"))).scalar_one()
        await connection.exec_driver_sql(f'GRANT "{owner}" TO "{role}"')
    async with engine.begin() as connection:
        assert await apply_app_role(connection, role, SECOND_PASSWORD) == "updated"
        has_truncate = (
            await connection.execute(
                text("SELECT has_table_privilege(:r, 'projects', 'TRUNCATE')"), {"r": role}
            )
        ).scalar_one()
        assert has_truncate is False
        memberships = (
            await connection.execute(
                text(
                    "SELECT count(*) FROM pg_auth_members m "
                    "JOIN pg_roles r ON r.oid = m.member WHERE r.rolname = :r"
                ),
                {"r": role},
            )
        ).scalar_one()
        assert memberships == 0

    old = engine_as(migrated_database, role, FIRST_PASSWORD)
    new = engine_as(migrated_database, role, SECOND_PASSWORD)
    try:
        # A failed login surfaces as asyncpg's own error (the connect is not wrapped).
        with pytest.raises(
            (DBAPIError, asyncpg.InvalidPasswordError), match="password authentication"
        ):
            async with old.connect():
                pass
        async with new.connect() as connection:
            assert (await connection.execute(text("SELECT current_user"))).scalar_one() == role
    finally:
        await old.dispose()
        await new.dispose()


async def test_refuses_the_schema_owner(engine: AsyncEngine) -> None:
    async with engine.begin() as connection:
        owner = (await connection.execute(text("SELECT current_user"))).scalar_one()
        with pytest.raises(ValueError, match="schema owner"):
            await apply_app_role(connection, owner, FIRST_PASSWORD)


def role_settings(**overrides: Any) -> RoleSettings:
    values: dict[str, Any] = {
        "_env_file": None,
        "DATABASE_URL": "postgresql+asyncpg://owner:pw@db:5432/app",  # ggignore
        "DATABASE_APP_USER": "anthonyzng_app",
        "DATABASE_APP_PASSWORD": FIRST_PASSWORD,
    }
    values.update(overrides)
    return RoleSettings(**values)


def test_settings_accept_a_plain_name_and_a_url_safe_password() -> None:
    settings = role_settings()
    assert settings.DATABASE_APP_USER == "anthonyzng_app"


@pytest.mark.parametrize(
    "overrides",
    [
        {"DATABASE_APP_USER": "App"},
        {"DATABASE_APP_USER": 'x"; DROP TABLE projects; --'},
        {"DATABASE_APP_USER": "a" * 64},
        {"DATABASE_APP_PASSWORD": "tiny-pw"},
        {"DATABASE_APP_PASSWORD": "change-me-change-me-change-me"},
        {"DATABASE_APP_PASSWORD": "has spaces and @ signs, 0123456789"},
    ],
)
def test_settings_refuse_unsafe_values_without_echoing_them(overrides: dict[str, str]) -> None:
    with pytest.raises(ValidationError) as caught:
        role_settings(**overrides)
    assert FIRST_PASSWORD not in str(caught.value)
    for value in overrides.values():
        assert value not in str(caught.value)
