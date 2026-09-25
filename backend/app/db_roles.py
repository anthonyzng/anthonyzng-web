"""`python -m app.db_roles` (run by the `migrate` service after `alembic upgrade head`): the
backend's least-privilege database role.

The stack's `POSTGRES_USER` owns the schema (it is the postgres image's superuser) and only the
migrations connect as it. The backend connects as `DATABASE_APP_USER`, which may read and write
rows and nothing else: no DDL, no TRUNCATE, no `alembic_version`, no superuser powers. A flaw in the
app can then neither drop or alter a table nor, as a superuser could with `COPY ... PROGRAM`, run a
program in the database container.

Every run creates the role or resets its attributes and password (so changing
`POSTGRES_APP_PASSWORD` in the root `.env` and running `docker compose up -d` rotates it), then
grants on every table as the schema now stands, which covers tables a migration just added.
Idempotent; everything happens in one transaction.
"""

import asyncio
import base64
import hashlib
import hmac
import logging
import re
import secrets
import sys
from typing import Annotated, Literal

from pydantic import Field, SecretStr, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncConnection, create_async_engine
from sqlalchemy.pool import NullPool

from app.core.config import BACKEND_DIR, PLACEHOLDER_MARKER
from app.core.log_config import configure_logging

ROLE_NAME_PATTERN = r"^[a-z_][a-z0-9_]{0,62}$"
"""A plain lowercase identifier: no quoting surprises, at most PostgreSQL's 63 bytes."""
PASSWORD_PATTERN = re.compile(r"^[A-Za-z0-9._~-]+$")
"""The password is also part of the backend's DATABASE_URL, so URL-safe characters only."""
MIN_PASSWORD_LENGTH = 24

TABLE_PRIVILEGES = "SELECT, INSERT, UPDATE, DELETE"
"""Rows only. Identity columns need no sequence privilege, so none is granted."""
MIGRATION_TABLES = ("alembic_version",)
"""Tables the migrations own and the app never touches."""

ROLE_ATTRIBUTES = "LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS"
SCRAM_ITERATIONS = 4096
"""PostgreSQL's default `scram_iterations`."""

RoleOutcome = Literal["created", "updated"]

logger = logging.getLogger(__name__)


class RoleSettings(BaseSettings):
    """What the role setup reads: the schema owner's URL and the app role's credentials."""

    model_config = SettingsConfigDict(
        env_file=BACKEND_DIR / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
        hide_input_in_errors=True,
    )

    DATABASE_URL: SecretStr
    """The schema owner's connection (the migrations' URL)."""
    DATABASE_APP_USER: Annotated[str, Field(pattern=ROLE_NAME_PATTERN)]
    DATABASE_APP_PASSWORD: Annotated[SecretStr, Field(min_length=MIN_PASSWORD_LENGTH)]

    @field_validator("DATABASE_APP_PASSWORD")
    @classmethod
    def _url_safe(cls, value: SecretStr) -> SecretStr:
        if not PASSWORD_PATTERN.fullmatch(value.get_secret_value()):
            raise ValueError("use URL-safe characters only (letters, digits, - _ . ~)")
        if PLACEHOLDER_MARKER in value.get_secret_value():
            raise ValueError("replace the .env.example placeholder with a generated password")
        return value


def scram_sha256_verifier(password: str, salt: bytes | None = None) -> str:
    """What PostgreSQL stores for `password` (SCRAM-SHA-256, RFC 7677, in PostgreSQL's format).

    The role is given this verifier instead of the password, so the plaintext never reaches the
    server, its log (which records a failing statement) or a SQLAlchemy error. The password is
    ASCII (`PASSWORD_PATTERN`), which SASLprep leaves unchanged.
    """
    salt = secrets.token_bytes(16) if salt is None else salt
    salted = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, SCRAM_ITERATIONS)
    client_key = hmac.digest(salted, b"Client Key", "sha256")
    server_key = hmac.digest(salted, b"Server Key", "sha256")
    stored_key = hashlib.sha256(client_key).digest()

    def b64(value: bytes) -> str:
        return base64.b64encode(value).decode("ascii")

    return f"SCRAM-SHA-256${SCRAM_ITERATIONS}:{b64(salt)}${b64(stored_key)}:{b64(server_key)}"


async def _run(connection: AsyncConnection, template: str, *args: str) -> None:
    """Runs a utility statement built by PostgreSQL's `format()`.

    GRANT, CREATE ROLE and friends take no bind parameters, so names (`%I`) and literals (`%L`)
    are quoted by the server itself, never pasted into SQL by Python.
    """
    statement = (
        await connection.execute(
            text("SELECT format(:template, VARIADIC CAST(:args AS text[]))"),
            {"template": template, "args": list(args)},
        )
    ).scalar_one()
    await connection.exec_driver_sql(statement)


async def apply_app_role(connection: AsyncConnection, user: str, password: str) -> RoleOutcome:
    """Creates or updates `user` with `password` and row-only privileges on the `public` schema."""
    owner = (await connection.execute(text("SELECT current_user"))).scalar_one()
    if user == owner:
        raise ValueError("the app role must not be the schema owner")
    exists = (
        await connection.execute(
            text("SELECT 1 FROM pg_roles WHERE rolname = :name"), {"name": user}
        )
    ).first() is not None
    verb = "ALTER" if exists else "CREATE"
    verifier = scram_sha256_verifier(password)
    await _run(connection, f"{verb} ROLE %I WITH {ROLE_ATTRIBUTES} PASSWORD %L", user, verifier)
    # Start from nothing on every run, so nothing granted by hand lingers: first any role
    # membership (in the owner or `pg_write_all_data`, say, it would bring their rights along) ...
    memberships = await connection.execute(
        text(
            "SELECT granted.rolname, grantor.rolname FROM pg_auth_members m "
            "JOIN pg_roles granted ON granted.oid = m.roleid "
            "JOIN pg_roles grantor ON grantor.oid = m.grantor "
            "JOIN pg_roles member ON member.oid = m.member WHERE member.rolname = :name"
        ),
        {"name": user},
    )
    for granted, grantor in memberships.all():
        await _run(connection, "REVOKE %I FROM %I GRANTED BY %I", granted, user, grantor)
    database = (await connection.execute(text("SELECT current_database()"))).scalar_one()
    await _run(connection, "GRANT CONNECT ON DATABASE %I TO %I", database, user)
    await _run(connection, "GRANT USAGE ON SCHEMA public TO %I", user)
    # ... then every table and sequence privilege.
    await _run(connection, "REVOKE ALL ON ALL TABLES IN SCHEMA public FROM %I", user)
    await _run(connection, "REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM %I", user)
    await _run(connection, f"GRANT {TABLE_PRIVILEGES} ON ALL TABLES IN SCHEMA public TO %I", user)
    for table in MIGRATION_TABLES:
        present = (
            await connection.execute(
                text("SELECT to_regclass(:name) IS NOT NULL"), {"name": f"public.{table}"}
            )
        ).scalar_one()
        if present:
            await _run(connection, "REVOKE ALL ON TABLE public.%I FROM %I", table, user)
    return "updated" if exists else "created"


async def run(settings: RoleSettings) -> RoleOutcome:
    engine = create_async_engine(
        settings.DATABASE_URL.get_secret_value(), poolclass=NullPool, hide_parameters=True
    )
    try:
        async with engine.begin() as connection:
            return await apply_app_role(
                connection,
                settings.DATABASE_APP_USER,
                settings.DATABASE_APP_PASSWORD.get_secret_value(),
            )
    finally:
        await engine.dispose()


def main() -> int:
    configure_logging()
    settings = RoleSettings()
    outcome = asyncio.run(run(settings))
    logger.info("database role %s %s, row privileges granted", settings.DATABASE_APP_USER, outcome)
    return 0


if __name__ == "__main__":
    sys.exit(main())
