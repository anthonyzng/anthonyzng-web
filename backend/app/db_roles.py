"""`python -m app.db_roles` (run by the `migrate` service after `alembic upgrade head`): checks the
backend's least-privilege database role.

The platform (Owwsolution/platform, `scripts/provision-app anthonyzng-web`) creates the database and
both roles. `anthonyzng_web_owner` owns the schema and only the migrations connect as it;
`anthonyzng_web_app`, the backend's role, may read and write rows and nothing else, through
default privileges that grant it SELECT, INSERT, UPDATE and DELETE on every table the owner
creates. This module creates no role and grants nothing. It takes the migrations' own table
(`alembic_version`, which the default privileges grant like any other) away from the app role, then
checks the app role: LOGIN, no superuser, CREATEDB, CREATEROLE, replication or RLS bypass; a
member of no role; CONNECT and schema USAGE, but no CREATE or TEMPORARY; exactly the four row
privileges on every table but the migrations', and none there; owner of nothing. Any finding
stops the deploy (exit 1), each one logged by role and table name only, never a value, so a
change that widens the app role's rights never goes unnoticed. One transaction.
"""

import asyncio
import logging
import sys
from typing import Annotated

from pydantic import Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncConnection, create_async_engine
from sqlalchemy.pool import NullPool

from app.core.config import BACKEND_DIR
from app.core.log_config import configure_logging

ROLE_NAME_PATTERN = r"^[a-z_][a-z0-9_]{0,62}$"
"""A plain lowercase identifier: no quoting surprises, at most PostgreSQL's 63 bytes."""
ROW_PRIVILEGES = ("SELECT", "INSERT", "UPDATE", "DELETE")
"""What the app role must have on every table (and all it may have)."""
OTHER_TABLE_PRIVILEGES = ("TRUNCATE", "REFERENCES", "TRIGGER", "MAINTAIN")
MIGRATION_TABLES = ("alembic_version",)
"""Tables the migrations own and the app never touches."""
ROLE_FLAGS = ("rolsuper", "rolcreatedb", "rolcreaterole", "rolreplication", "rolbypassrls")

logger = logging.getLogger(__name__)


class RoleSettings(BaseSettings):
    """What the check reads: the schema owner's URL and the app role's name."""

    model_config = SettingsConfigDict(
        env_file=BACKEND_DIR / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
        hide_input_in_errors=True,
    )

    DATABASE_URL: SecretStr
    """The schema owner's connection (the migrations' URL)."""
    DATABASE_APP_USER: Annotated[str, Field(pattern=ROLE_NAME_PATTERN)]


async def revoke_migration_tables(connection: AsyncConnection, user: str) -> None:
    """Takes every privilege on the migrations' tables away from `user` (the owner may)."""
    for table in MIGRATION_TABLES:
        present = (
            await connection.execute(
                text("SELECT to_regclass(:name) IS NOT NULL"), {"name": f"public.{table}"}
            )
        ).scalar_one()
        if not present:
            continue
        # REVOKE takes no bind parameters: the server quotes the names itself.
        statement = (
            await connection.execute(
                text(
                    "SELECT format('REVOKE ALL ON TABLE public.%I FROM %I', "
                    "CAST(:table AS text), CAST(:user AS text))"
                ),
                {"table": table, "user": user},
            )
        ).scalar_one()
        await connection.exec_driver_sql(statement)


async def _role_problems(connection: AsyncConnection, user: str) -> list[str] | None:
    """The role's own attributes and memberships; None when the role does not exist."""
    role = (
        (
            await connection.execute(
                text(
                    "SELECT rolcanlogin, rolsuper, rolcreatedb, rolcreaterole, rolreplication, "
                    "rolbypassrls FROM pg_roles WHERE rolname = :name"
                ),
                {"name": user},
            )
        )
        .mappings()
        .first()
    )
    if role is None:
        return None
    problems = [] if role["rolcanlogin"] else [f"{user} cannot log in"]
    problems += [f"{user} has {flag}" for flag in ROLE_FLAGS if role[flag]]
    memberships = (
        await connection.execute(
            text(
                "SELECT g.rolname FROM pg_auth_members m "
                "JOIN pg_roles g ON g.oid = m.roleid JOIN pg_roles r ON r.oid = m.member "
                "WHERE r.rolname = :name ORDER BY 1"
            ),
            {"name": user},
        )
    ).scalars()
    return problems + [f"{user} is a member of {granted}" for granted in memberships]


async def _database_problems(connection: AsyncConnection, user: str) -> list[str]:
    """Rights on the database and schema public, and anything the role owns."""
    rights = (
        (
            await connection.execute(
                text(
                    "SELECT NOT has_database_privilege(:u, current_database(), 'CONNECT'), "
                    "has_database_privilege(:u, current_database(), 'CREATE'), "
                    "has_database_privilege(:u, current_database(), 'TEMPORARY'), "
                    "NOT has_schema_privilege(:u, 'public', 'USAGE'), "
                    "has_schema_privilege(:u, 'public', 'CREATE'), "
                    "EXISTS (SELECT FROM pg_class WHERE relowner = "
                    "(SELECT oid FROM pg_roles WHERE rolname = :u))"
                ),
                {"u": user},
            )
        )
        .tuples()
        .one()
    )
    findings = (
        "cannot connect to the database",
        "may create schemas",
        "may create temporary tables",
        "has no USAGE on schema public",
        "may create objects in schema public",
        "owns relations",
    )
    return [f"{user} {finding}" for finding, found in zip(findings, rights, strict=True) if found]


async def _table_problems(connection: AsyncConnection, user: str) -> list[str]:
    """Exactly the row privileges on every table in public, none on the migrations' tables."""
    privileges = ROW_PRIVILEGES + OTHER_TABLE_PRIVILEGES
    columns = ", ".join(
        f"has_table_privilege(:u, c.oid, '{privilege}') AS {privilege.lower()}_granted"
        for privilege in privileges
    )
    tables = (
        await connection.execute(
            text(
                f"SELECT c.relname AS name, {columns} FROM pg_class c "
                "JOIN pg_namespace n ON n.oid = c.relnamespace "
                "WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p') ORDER BY c.relname"
            ),
            {"u": user},
        )
    ).mappings()
    problems: list[str] = []
    for table in tables:
        granted = [p for p in privileges if table[f"{p.lower()}_granted"]]
        if table["name"] in MIGRATION_TABLES:
            unexpected = granted
        else:
            missing = [p for p in ROW_PRIVILEGES if p not in granted]
            if missing:
                problems.append(f"{user} lacks {', '.join(missing)} on {table['name']}")
            unexpected = [p for p in OTHER_TABLE_PRIVILEGES if p in granted]
        if unexpected:
            problems.append(f"{user} has {', '.join(unexpected)} on {table['name']}")
    return problems


async def check_app_role(connection: AsyncConnection, user: str) -> list[str]:
    """Every way `user` differs from a rows-only app role (an empty list when it does not)."""
    owner = (await connection.execute(text("SELECT current_user"))).scalar_one()
    if user == owner:
        return [f"{user} is the schema owner, not a separate app role"]
    role_problems = await _role_problems(connection, user)
    if role_problems is None:
        return [f"{user} does not exist (the platform's provision-app creates it)"]
    return (
        role_problems
        + await _database_problems(connection, user)
        + await _table_problems(connection, user)
    )


async def run(settings: RoleSettings) -> list[str]:
    """Takes the migrations' tables away from the app role, then checks it (one transaction)."""
    user = settings.DATABASE_APP_USER
    engine = create_async_engine(
        settings.DATABASE_URL.get_secret_value(), poolclass=NullPool, hide_parameters=True
    )
    try:
        async with engine.begin() as connection:
            owner = (await connection.execute(text("SELECT current_user"))).scalar_one()
            if user != owner and await _role_problems(connection, user) is not None:
                await revoke_migration_tables(connection, user)
            return await check_app_role(connection, user)
    finally:
        await engine.dispose()


def main() -> int:
    configure_logging()
    settings = RoleSettings()
    problems = asyncio.run(run(settings))
    for problem in problems:
        logger.error("database role check: %s", problem)
    if problems:
        return 1
    logger.info("database role %s checked: rows only", settings.DATABASE_APP_USER)
    return 0


if __name__ == "__main__":
    sys.exit(main())
