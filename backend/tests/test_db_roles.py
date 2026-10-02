"""The backend's database role check (`app.db_roles`), against the real test database.

The test database's superuser plays the platform's schema owner. Almost every test runs inside one
transaction that is rolled back at the end, even when the test fails: the `scenario` fixture
creates a role with exactly the rights the platform's `provision-app` gives `anthonyzng_web_app`
(the statements of `scripts/provision_app.py`, applied to the tables that already exist), and a
test then grants that role one right too many and asserts the specific finding. Nothing is
committed, so no role, grant or default privilege outlives a test. The one committed role (the
`run()` test) is dropped, and the test database's ACL put back, in a `finally`.
"""

import asyncio
import logging
import traceback
import uuid
from collections.abc import AsyncIterator
from dataclasses import dataclass
from typing import Any

import pytest
from pydantic import ValidationError
from sqlalchemy import text
from sqlalchemy.exc import DBAPIError
from sqlalchemy.ext.asyncio import AsyncConnection, AsyncEngine

from app.db_roles import RoleSettings, check_app_role, main, revoke_migration_tables, run

IP_HASH = "a" * 64


def quoted(name: str) -> str:
    return '"' + name.replace('"', '""') + '"'


@dataclass(frozen=True)
class Scenario:
    connection: AsyncConnection
    role: str
    owner: str
    database: str

    def fill(self, template: str) -> str:
        """`{role}`, `{owner}` and `{db}` are quoted identifiers; `{name}`, `{owner_name}` and
        `{database}` the plain names (for the expected findings)."""
        return template.format(
            role=quoted(self.role),
            owner=quoted(self.owner),
            db=quoted(self.database),
            name=self.role,
            owner_name=self.owner,
            database=self.database,
        )

    async def execute(self, *statements: str) -> None:
        for statement in statements:
            await self.connection.exec_driver_sql(self.fill(statement))

    async def problems(self) -> list[str]:
        return await check_app_role(self.connection, self.role)


async def provision(connection: AsyncConnection, role: str, *, cluster_wide: bool = True) -> None:
    """The statements of scripts/provision_app.py for a role named `role` and the connected
    superuser as the owner, then what its default privileges would have granted on the tables the
    migrations already made. `cluster_wide=False` leaves out what would touch other databases and
    schema public's ACL (only a committed role does)."""
    owner, database = (
        await connection.execute(text("SELECT current_user, current_database()"))
    ).one()
    others = (
        (
            await connection.execute(
                text(
                    "SELECT datname FROM pg_database WHERE datallowconn "
                    "AND datname <> current_database()"
                )
            )
        )
        .scalars()
        .all()
    )
    statements = [
        (
            f"CREATE ROLE {quoted(role)} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE "
            "NOREPLICATION NOBYPASSRLS INHERIT"
        ),
        f"REVOKE ALL ON DATABASE {quoted(database)} FROM PUBLIC",
        f"GRANT CONNECT ON DATABASE {quoted(database)} TO {quoted(role)}",
        # provision revokes PUBLIC's CONNECT on `postgres` and `template1` (and on every app's
        # database as it creates it), so no other database is open to the role.
        *(f"REVOKE CONNECT ON DATABASE {quoted(name)} FROM PUBLIC" for name in others),
        "REVOKE ALL ON SCHEMA public FROM PUBLIC",
        f"GRANT USAGE ON SCHEMA public TO {quoted(role)}",
        (
            f"ALTER DEFAULT PRIVILEGES FOR ROLE {quoted(owner)} "
            f"GRANT USAGE ON SCHEMAS TO {quoted(role)}"
        ),
        (
            f"ALTER DEFAULT PRIVILEGES FOR ROLE {quoted(owner)} "
            f"GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO {quoted(role)}"
        ),
        (
            f"ALTER DEFAULT PRIVILEGES FOR ROLE {quoted(owner)} "
            f"GRANT USAGE ON SEQUENCES TO {quoted(role)}"
        ),
        f"GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO {quoted(role)}",
        f"GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO {quoted(role)}",
    ]
    for statement in statements:
        if not cluster_wide and (
            "ON SCHEMA public FROM PUBLIC" in statement
            or (statement.startswith("REVOKE CONNECT ON DATABASE"))
        ):
            continue
        await connection.exec_driver_sql(statement)


@pytest.fixture
async def scenario(engine: AsyncEngine) -> AsyncIterator[Scenario]:
    """A freshly provisioned role inside a transaction that is rolled back, pass or fail."""
    role = f"test_app_{uuid.uuid4().hex[:12]}"
    async with engine.connect() as connection:
        transaction = await connection.begin()
        try:
            await provision(connection, role)
            owner, database = (
                await connection.execute(text("SELECT current_user, current_database()"))
            ).one()
            yield Scenario(connection, role, owner, database)
        finally:
            await transaction.rollback()


SECURITY_DEFINER_FUNCTION = (
    "CREATE FUNCTION public.probe_secdef() RETURNS int LANGUAGE sql SECURITY DEFINER AS 'SELECT 1'"
)
DEFAULT_SCHEMA_USAGE_WITH_GRANT_OPTION = (
    "ALTER DEFAULT PRIVILEGES FOR ROLE {owner} GRANT USAGE ON SCHEMAS TO {role} WITH GRANT OPTION"
)
DEFAULT_TABLE_SELECT_IN_SCHEMA = (
    "ALTER DEFAULT PRIVILEGES FOR ROLE {owner} IN SCHEMA public GRANT SELECT ON TABLES TO {role}"
)

# What each case grants beyond the platform's rights (statements run as the owner, inside the
# rolled-back transaction) and the one finding that must name it.
CASES: dict[str, tuple[list[str], str]] = {
    # Role attributes.
    "superuser": (["ALTER ROLE {role} SUPERUSER"], "{name} has rolsuper"),
    "createdb": (["ALTER ROLE {role} CREATEDB"], "{name} has rolcreatedb"),
    "createrole": (["ALTER ROLE {role} CREATEROLE"], "{name} has rolcreaterole"),
    "replication": (["ALTER ROLE {role} REPLICATION"], "{name} has rolreplication"),
    "bypassrls": (["ALTER ROLE {role} BYPASSRLS"], "{name} has rolbypassrls"),
    "no_login": (["ALTER ROLE {role} NOLOGIN"], "{name} cannot log in"),
    "role_settings": (
        ["ALTER ROLE {role} SET search_path = 'elsewhere'"],
        "{name} has role-level settings",
    ),
    # Memberships.
    "member_of_predefined_role": (
        ["GRANT pg_write_all_data TO {role}"],
        "{name} is a member of pg_write_all_data",
    ),
    "member_of_program_role": (
        ["GRANT pg_execute_server_program TO {role}"],
        "{name} is a member of pg_execute_server_program",
    ),
    "member_of_the_owner": (["GRANT {owner} TO {role}"], "{name} is a member of {owner_name}"),
    "member_without_inherit": (
        ['CREATE ROLE "{name}_g" NOLOGIN', 'GRANT "{name}_g" TO {role} WITH INHERIT FALSE'],
        "{name} is a member of {name}_g",
    ),
    # Ownership.
    "owns_a_table": (
        [
            "CREATE TABLE public.probe_owned (id int)",
            "ALTER TABLE public.probe_owned OWNER TO {role}",
        ],
        "{name} owns 1 relations",
    ),
    "owns_a_schema": (["CREATE SCHEMA probe_s AUTHORIZATION {role}"], "{name} owns 1 schemas"),
    "owns_a_function": (
        [
            "CREATE FUNCTION public.probe_f() RETURNS int LANGUAGE sql AS 'SELECT 1'",
            "ALTER FUNCTION public.probe_f() OWNER TO {role}",
        ],
        "{name} owns 1 functions",
    ),
    "owns_a_type": (
        ["CREATE TYPE public.probe_t AS ENUM ('a')", "ALTER TYPE public.probe_t OWNER TO {role}"],
        "{name} owns 1 types",
    ),
    "owns_the_database": (["ALTER DATABASE {db} OWNER TO {role}"], "{name} owns 1 databases"),
    # Tables and columns.
    "table_truncate_references": (
        ["GRANT TRUNCATE, REFERENCES ON projects TO {role}"],
        "{name} has TRUNCATE, REFERENCES on projects",
    ),
    "table_trigger_maintain": (
        ["GRANT TRIGGER, MAINTAIN ON projects TO {role}"],
        "{name} has TRIGGER, MAINTAIN on projects",
    ),
    "table_grant_option": (
        ["GRANT SELECT ON projects TO {role} WITH GRANT OPTION"],
        "{name} has grant option for SELECT on projects",
    ),
    "table_for_public": (["GRANT SELECT ON projects TO PUBLIC"], "PUBLIC has SELECT on projects"),
    "missing_row_privileges": (
        ["REVOKE INSERT, DELETE ON projects FROM {role}"],
        "{name} lacks INSERT, DELETE on projects",
    ),
    "column_grant": (
        ["GRANT REFERENCES (slug) ON projects TO {role}"],
        "{name} has REFERENCES on column slug of projects",
    ),
    "column_grant_for_public": (
        ["GRANT SELECT (slug) ON projects TO PUBLIC"],
        "PUBLIC has SELECT on column slug of projects",
    ),
    # The migrations' tables.
    "migration_table_granted_by_default": (
        [],
        "{name} has SELECT, INSERT, UPDATE, DELETE on alembic_version",
    ),
    "migration_table_other_privilege": (
        [
            "REVOKE ALL ON TABLE alembic_version FROM {role}",
            "GRANT TRUNCATE ON alembic_version TO {role}",
        ],
        "{name} has TRUNCATE on alembic_version",
    ),
    "migration_table_column_grant": (
        [
            "REVOKE ALL ON TABLE alembic_version FROM {role}",
            "GRANT SELECT (version_num), UPDATE (version_num) ON alembic_version TO {role}",
        ],
        "{name} has SELECT, UPDATE on column version_num of alembic_version",
    ),
    "goose_table": (
        ["CREATE TABLE public.goose_db_version (id int)"],
        "{name} has SELECT, INSERT, UPDATE, DELETE on goose_db_version",
    ),
    # Sequences, views, other schemas.
    "sequence_select_update": (
        [
            "CREATE SEQUENCE public.probe_seq",
            "GRANT SELECT, UPDATE ON SEQUENCE public.probe_seq TO {role}",
        ],
        "{name} has SELECT, UPDATE on probe_seq",
    ),
    "view_trigger": (
        [
            "CREATE VIEW public.probe_v AS SELECT 1 AS a",
            "GRANT TRIGGER ON public.probe_v TO {role}",
        ],
        "{name} has TRIGGER on probe_v",
    ),
    "table_in_another_schema": (
        [
            "CREATE SCHEMA probe_s",
            "CREATE TABLE probe_s.t (id int)",
            "GRANT ALL ON probe_s.t TO {role}",
        ],
        "{name} has TRUNCATE, REFERENCES, TRIGGER, MAINTAIN on probe_s.t",
    ),
    "create_on_another_schema": (
        ["CREATE SCHEMA probe_s", "GRANT CREATE ON SCHEMA probe_s TO {role}"],
        "{name} may create objects in schema probe_s",
    ),
    "create_on_public": (
        ["GRANT CREATE ON SCHEMA public TO {role}"],
        "{name} may create objects in schema public",
    ),
    "usage_on_a_foreign_schema": (
        [
            'CREATE ROLE "{name}_o" NOLOGIN',
            'CREATE SCHEMA probe_s AUTHORIZATION "{name}_o"',
            "GRANT USAGE ON SCHEMA probe_s TO {role}",
        ],
        "{name} has USAGE on schema probe_s",
    ),
    "usage_on_a_schema_for_public": (
        ["CREATE SCHEMA probe_s", "GRANT USAGE ON SCHEMA probe_s TO PUBLIC"],
        "PUBLIC has USAGE on schema probe_s",
    ),
    "schema_grant_option": (
        ["GRANT USAGE ON SCHEMA public TO {role} WITH GRANT OPTION"],
        "{name} has grant option for USAGE on schema public",
    ),
    "no_usage_on_public": (
        ["REVOKE USAGE ON SCHEMA public FROM {role}"],
        "{name} has no USAGE on schema public",
    ),
    # Databases.
    "cannot_connect": (
        ["REVOKE CONNECT ON DATABASE {db} FROM {role}"],
        "{name} cannot connect to the database",
    ),
    "temporary_tables": (
        ["GRANT TEMPORARY ON DATABASE {db} TO {role}"],
        "{name} may create temporary tables",
    ),
    "create_schemas": (["GRANT CREATE ON DATABASE {db} TO {role}"], "{name} may create schemas"),
    "database_grant_option": (
        ["GRANT CONNECT ON DATABASE {db} TO {role} WITH GRANT OPTION"],
        "{name} has grant option for CONNECT on database {database}",
    ),
    "connect_to_another_database": (
        ["GRANT CONNECT ON DATABASE postgres TO {role}"],
        "{name} can connect to database postgres",
    ),
    "create_in_another_database": (
        ["GRANT CREATE ON DATABASE postgres TO {role}"],
        "{name} may create schemas in database postgres",
    ),
    "connect_for_public_to_another_database": (
        ["GRANT CONNECT ON DATABASE postgres TO PUBLIC"],
        "{name} can connect to database postgres",
    ),
    # Default privileges.
    "default_truncate": (
        ["ALTER DEFAULT PRIVILEGES FOR ROLE {owner} GRANT TRUNCATE ON TABLES TO {role}"],
        "default privileges grant {name} TRUNCATE on tables",
    ),
    "default_sequence_select": (
        ["ALTER DEFAULT PRIVILEGES FOR ROLE {owner} GRANT SELECT, UPDATE ON SEQUENCES TO {role}"],
        "default privileges grant {name} SELECT, UPDATE on sequences",
    ),
    "default_function_execute": (
        ["ALTER DEFAULT PRIVILEGES FOR ROLE {owner} GRANT EXECUTE ON FUNCTIONS TO {role}"],
        "default privileges grant {name} EXECUTE on functions",
    ),
    "default_for_public": (
        ["ALTER DEFAULT PRIVILEGES FOR ROLE {owner} GRANT SELECT ON TABLES TO PUBLIC"],
        "default privileges grant PUBLIC SELECT on tables",
    ),
    "default_in_a_schema": (
        [DEFAULT_TABLE_SELECT_IN_SCHEMA],
        "default privileges grant {name} SELECT on tables in a schema",
    ),
    "default_grant_option": (
        [DEFAULT_SCHEMA_USAGE_WITH_GRANT_OPTION],
        "default privileges grant {name} USAGE on schemas",
    ),
    "default_privileges_of_its_own": (
        ["ALTER DEFAULT PRIVILEGES FOR ROLE {role} GRANT SELECT ON TABLES TO PUBLIC"],
        "{name} has default privileges of its own",
    ),
    # Functions, types and the other object kinds.
    "security_definer_function": (
        [SECURITY_DEFINER_FUNCTION],
        "{name} can execute SECURITY DEFINER function public.probe_secdef",
    ),
    "function_grant": (
        [
            "CREATE FUNCTION public.probe_f() RETURNS int LANGUAGE sql AS 'SELECT 1'",
            "GRANT EXECUTE ON FUNCTION public.probe_f() TO {role}",
        ],
        "{name} has EXECUTE on function public.probe_f",
    ),
    "type_grant": (
        [
            "CREATE TYPE public.probe_t AS ENUM ('a')",
            "GRANT USAGE ON TYPE public.probe_t TO {role}",
        ],
        "{name} has USAGE on type public.probe_t",
    ),
    "tablespace_grant": (
        ["GRANT CREATE ON TABLESPACE pg_default TO {role}"],
        "{name} has CREATE on tablespace pg_default",
    ),
    "language_grant": (
        ["GRANT USAGE ON LANGUAGE plpgsql TO {role}"],
        "{name} has USAGE on language plpgsql",
    ),
    "parameter_grant": (
        ["GRANT SET ON PARAMETER work_mem TO {role}"],
        "{name} has SET on parameter work_mem",
    ),
}


@pytest.mark.parametrize(("setup", "expected"), CASES.values(), ids=CASES.keys())
async def test_every_excess_right_is_reported_by_name(
    scenario: Scenario, setup: list[str], expected: str
) -> None:
    await scenario.execute(*setup)
    assert scenario.fill(expected) in await scenario.problems()


async def test_large_object_rights_and_ownership_are_reported(scenario: Scenario) -> None:
    oid = (await scenario.connection.execute(text("SELECT lo_create(0)"))).scalar_one()
    await scenario.execute(f"GRANT SELECT ON LARGE OBJECT {int(oid)} TO {{role}}")
    assert scenario.fill("{name} has SELECT on 1 large objects") in await scenario.problems()
    await scenario.execute(f"ALTER LARGE OBJECT {int(oid)} OWNER TO {{role}}")
    assert scenario.fill("{name} owns 1 large objects") in await scenario.problems()


async def test_the_platform_role_is_clean_with_everything_the_owner_creates(
    scenario: Scenario,
) -> None:
    await revoke_migration_tables(scenario.connection, scenario.role)
    # Objects a migration may create: the default privileges give the role its rows and USAGE.
    await scenario.execute(
        "CREATE TABLE public.probe_t (id int GENERATED ALWAYS AS IDENTITY PRIMARY KEY, v text)",
        "CREATE SEQUENCE public.probe_seq",
        "CREATE VIEW public.probe_v AS SELECT id FROM public.probe_t",
        "CREATE MATERIALIZED VIEW public.probe_m AS SELECT id FROM public.probe_t",
        "CREATE INDEX probe_i ON public.probe_t (v)",
        "CREATE SCHEMA probe_s",
        "CREATE TABLE probe_s.t (id int)",
        "CREATE FUNCTION public.probe_f() RETURNS int LANGUAGE sql AS 'SELECT 1'",
        "CREATE TYPE public.probe_e AS ENUM ('a')",
    )
    assert await scenario.problems() == []


async def test_the_platform_role_reads_and_writes_rows_only(scenario: Scenario) -> None:
    connection = scenario.connection
    await revoke_migration_tables(connection, scenario.role)
    await scenario.execute("SET LOCAL ROLE {role}")

    async def refused(statement: str) -> bool:
        try:
            async with connection.begin_nested():
                await connection.execute(text(statement))
        except DBAPIError as exc:
            return "permission denied" in str(exc.orig) or "must be owner" in str(exc.orig)
        return False

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
        text("UPDATE contact_messages SET read_at = now() WHERE id = :id"), {"id": message_id}
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
        assert await refused(statement), statement


async def test_migration_tables_are_taken_back_with_their_column_privileges(
    scenario: Scenario,
) -> None:
    await scenario.execute(
        "CREATE TABLE public.goose_db_version (id int)",
        "GRANT SELECT (version_num) ON alembic_version TO {role}",
        "GRANT UPDATE (id) ON goose_db_version TO {role}",
    )
    problems = await scenario.problems()
    assert scenario.fill("{name} has SELECT, INSERT, UPDATE, DELETE on alembic_version") in problems
    assert scenario.fill("{name} has UPDATE on column id of goose_db_version") in problems
    await revoke_migration_tables(scenario.connection, scenario.role)
    await revoke_migration_tables(scenario.connection, scenario.role)  # idempotent
    problems = await scenario.problems()
    assert [p for p in problems if "alembic_version" in p or "goose_db_version" in p] == []


async def test_the_owner_and_an_unknown_role_are_reported(engine: AsyncEngine) -> None:
    async with engine.begin() as connection:
        owner = (await connection.execute(text("SELECT current_user"))).scalar_one()
        assert await check_app_role(connection, owner) == [
            f"{owner} is the schema owner, not a separate app role"
        ]
        assert await check_app_role(connection, "no_such_role") == [
            "no_such_role does not exist (the platform's provision-app creates it)"
        ]


async def test_run_revokes_the_migration_tables_then_checks(
    engine: AsyncEngine, migrated_database: str
) -> None:
    role = f"test_app_{uuid.uuid4().hex[:12]}"
    async with engine.connect() as connection:
        database = (await connection.execute(text("SELECT current_database()"))).scalar_one()
        # Roles are cluster-wide: sweep what a killed run left behind.
        stale = (
            (
                await connection.execute(
                    text("SELECT rolname FROM pg_roles WHERE left(rolname, 9) = 'test_app_'")
                )
            )
            .scalars()
            .all()
        )
        for name in stale:
            await connection.exec_driver_sql(f"DROP OWNED BY {quoted(name)}")
            await connection.exec_driver_sql(f"DROP ROLE {quoted(name)}")
        await connection.commit()
    try:
        async with engine.begin() as connection:
            await provision(connection, role, cluster_wide=False)
        settings = role_settings(DATABASE_URL=migrated_database, DATABASE_APP_USER=role)
        problems = await run(settings)
        # Other databases of the shared test cluster stay open to PUBLIC (the platform closes
        # them); the committed role must not touch them, so they are the one thing left out.
        assert [p for p in problems if " can connect to database " not in p] == []
    finally:
        async with engine.begin() as connection:
            await connection.exec_driver_sql(
                f"GRANT CONNECT, TEMPORARY ON DATABASE {quoted(database)} TO PUBLIC"
            )
            await connection.exec_driver_sql(f"DROP OWNED BY {quoted(role)}")
            await connection.exec_driver_sql(f"DROP ROLE {quoted(role)}")


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


MARKER_PASSWORD = "marker-password-9f3a7c1e"  # ggignore
UNREACHABLE_URL = f"postgresql+asyncpg://owner:{MARKER_PASSWORD}@127.0.0.1:1/app"  # ggignore


def assert_no_marker(error: BaseException, caplog: pytest.LogCaptureFixture) -> None:
    rendered = "".join(traceback.format_exception(error)) + repr(error) + caplog.text
    assert MARKER_PASSWORD not in rendered


def test_run_never_shows_the_password_of_an_unreachable_database(
    caplog: pytest.LogCaptureFixture,
) -> None:
    settings = role_settings(DATABASE_URL=UNREACHABLE_URL)
    with caplog.at_level(logging.DEBUG), pytest.raises((OSError, DBAPIError)) as caught:
        asyncio.run(run(settings))
    assert_no_marker(caught.value, caplog)


def test_main_never_shows_the_password_of_an_unreachable_database(
    monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture
) -> None:
    monkeypatch.setenv("DATABASE_URL", UNREACHABLE_URL)
    monkeypatch.setenv("DATABASE_APP_USER", "anthonyzng_web_app")
    with caplog.at_level(logging.DEBUG), pytest.raises((OSError, DBAPIError)) as caught:
        main()
    assert_no_marker(caught.value, caplog)
