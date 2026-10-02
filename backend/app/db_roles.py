"""`python -m app.db_roles` (run by the `migrate` service after `alembic upgrade head`): checks the
backend's least-privilege database role against an allowlist.

The platform (Owwsolution/platform, `scripts/provision-app anthonyzng-web`) creates the database and
both roles. `anthonyzng_web_owner` owns the schema and only the migrations connect as it;
`anthonyzng_web_app`, the backend's role, may read and write rows and nothing else. This module
creates no role and grants nothing. It takes the migrations' own tables (`alembic_version`,
`goose_db_version`, which the default privileges grant like any other table) away from the app role,
then checks that the role holds exactly what the platform gives it and nothing else:

- LOGIN, and none of superuser, CREATEDB, CREATEROLE, replication or RLS bypass;
- no role membership at all (predefined `pg_*` roles and the owner role included);
- CONNECT on its own database, no CREATE or TEMPORARY there, no CONNECT or CREATE on any other
  database, no grant option anywhere;
- USAGE on schema public, USAGE on schemas the owner created (the default privileges grant it), no
  CREATE on any schema, nothing for PUBLIC beyond its USAGE on public;
- SELECT, INSERT, UPDATE and DELETE on every table, view and the like in every schema, and nothing
  more; nothing at all, not even a column privilege, on the migrations' tables; USAGE and nothing
  more on sequences; no column privilege anywhere; nothing for PUBLIC on any relation;
- no default privilege beyond the platform's (USAGE on schemas, the four row privileges on tables,
  USAGE on sequences, all `FOR ROLE <owner>`), none of the role's own, none for PUBLIC;
- no object owned (relations, schemas, functions, types, large objects, databases, anything else
  `pg_shdepend` records), no explicit grant on functions, types, large objects, tablespaces,
  foreign data wrappers, foreign servers, languages or parameters, no role-level settings;
- no SECURITY DEFINER function the role (or PUBLIC) can execute.

Any finding stops the deploy (exit 1), each one logged by role, object and privilege name only,
never a value, so a change that widens the app role's rights never goes unnoticed. One
transaction. Needs PostgreSQL 17 (the `MAINTAIN` privilege and `pg_parameter_acl`); an older
server fails with an SQL error instead of a finding.
"""

import asyncio
import logging
import sys
from collections import defaultdict
from collections.abc import Callable, Iterable, Sequence
from typing import Annotated

from pydantic import Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict
from sqlalchemy import RowMapping, text
from sqlalchemy.ext.asyncio import AsyncConnection, create_async_engine
from sqlalchemy.pool import NullPool

from app.core.config import BACKEND_DIR
from app.core.log_config import configure_logging

ROLE_NAME_PATTERN = r"^[a-z_][a-z0-9_]{0,62}$"
"""A plain lowercase identifier: no quoting surprises, at most PostgreSQL's 63 bytes."""
ROW_PRIVILEGES = ("SELECT", "INSERT", "UPDATE", "DELETE")
"""What the app role must have on every table (and all it may have on a relation)."""
PRIVILEGE_ORDER = (
    *ROW_PRIVILEGES,
    "TRUNCATE",
    "REFERENCES",
    "TRIGGER",
    "MAINTAIN",
    "USAGE",
    "CREATE",
    "EXECUTE",
    "CONNECT",
    "TEMPORARY",
    "SET",
    "ALTER SYSTEM",
)
"""The order privileges are listed in a finding (unknown ones follow alphabetically)."""
MIGRATION_TABLES = ("alembic_version", "goose_db_version")
"""Tables the migrations own and the app never touches (Alembic's and goose's bookkeeping)."""
ROLE_FLAGS = ("rolsuper", "rolcreatedb", "rolcreaterole", "rolreplication", "rolbypassrls")

ALLOWED_ON_RELATION = {
    **dict.fromkeys("rpvmf", ROW_PRIVILEGES),
    "S": ("USAGE",),
}
"""Per relkind (table, partitioned table, view, materialized view, foreign table, sequence)."""
ALLOWED_DEFAULTS = {"n": ("USAGE",), "r": ROW_PRIVILEGES, "S": ("USAGE",)}
"""The platform's default privileges for the app role, per `pg_default_acl.defaclobjtype`."""
IMPLICIT_PUBLIC_DEFAULTS = {"f": ("EXECUTE",), "T": ("USAGE",)}
"""What PostgreSQL already gives PUBLIC by default (a restated entry is no widening)."""
DEFAULT_KINDS = {
    "r": "tables",
    "S": "sequences",
    "f": "functions",
    "T": "types",
    "n": "schemas",
    "L": "large objects",
}
OWNED_KINDS = {
    "pg_class": "relations",
    "pg_namespace": "schemas",
    "pg_proc": "functions",
    "pg_type": "types",
    "pg_largeobject": "large objects",
    "pg_database": "databases",
}
OTHER_ACL_CATALOGS = (
    # (catalog, ACL column, name column, what it is called, PUBLIC's default is not a finding)
    ("pg_tablespace", "spcacl", "spcname", "tablespace", False),
    ("pg_foreign_data_wrapper", "fdwacl", "fdwname", "foreign data wrapper", False),
    ("pg_foreign_server", "srvacl", "srvname", "foreign server", False),
    ("pg_language", "lanacl", "lanname", "language", True),
    ("pg_parameter_acl", "paracl", "parname", "parameter", False),
)
"""Object kinds with an ACL the app role must not appear in (the names are constants)."""

ROLE_OID = "(SELECT oid FROM pg_roles WHERE rolname = :user)"
OWNER_OID = "(SELECT oid FROM pg_roles WHERE rolname = current_user)"
PUBLIC_OID = 0
NON_SYSTEM = (
    "n.nspname NOT IN ('pg_catalog', 'information_schema') AND n.nspname !~ '^pg_(toast|temp)'"
)
"""Restricts a query on `pg_namespace n` to the schemas a migration can create."""
SCHEMA_QUALIFIED = (
    "CASE WHEN n.nspname = 'public' THEN {0}.{1} ELSE n.nspname || '.' || {0}.{1} END"
)
"""A name as a finding shows it, unqualified in public (`{0}` the alias, `{1}` the column)."""

logger = logging.getLogger(__name__)

Row = RowMapping
RowRule = Callable[[Row], Iterable[str]]


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
        # REVOKE takes no bind parameters: the server quotes the names itself. It takes the
        # column privileges along.
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


async def _rows(connection: AsyncConnection, sql: str, user: str) -> Sequence[Row]:
    return (await connection.execute(text(sql), {"user": user})).mappings().all()


def _listed(privileges: Iterable[str]) -> str:
    def position(privilege: str) -> tuple[int, str]:
        known = PRIVILEGE_ORDER.index(privilege) if privilege in PRIVILEGE_ORDER else 99
        return known, privilege

    return ", ".join(sorted(set(privileges), key=position))


def _nothing(_row: Row) -> Iterable[str]:
    return ()


def _acl_findings(
    user: str,
    rows: Iterable[Row],
    target: str,
    allowed: RowRule = _nothing,
    public_allowed: RowRule = _nothing,
) -> list[str]:
    """Findings for `aclexplode` rows (`name`, `grantee`, `privilege`, `grantable`, whatever the
    rules read): every privilege `allowed` (for the role) or `public_allowed` (for PUBLIC) does
    not name, and every grant option."""
    excess: dict[tuple[str, str], set[str]] = defaultdict(set)
    grantable: dict[str, set[str]] = defaultdict(set)
    for row in rows:
        public = row["grantee"] == PUBLIC_OID
        if row["privilege"] not in (public_allowed(row) if public else allowed(row)):
            excess[("PUBLIC" if public else user, row["name"])].add(row["privilege"])
        if row["grantable"] and not public:
            grantable[row["name"]].add(row["privilege"])
    return [f"{who} has {_listed(p)} on {target}{name}" for (who, name), p in excess.items()] + [
        f"{user} has grant option for {_listed(p)} on {target}{name}"
        for name, p in grantable.items()
    ]


async def _role_problems(connection: AsyncConnection, user: str) -> list[str] | None:
    """The role's own attributes, memberships, settings and owned objects; None when the role
    does not exist."""
    role = (
        (
            await connection.execute(
                text(
                    "SELECT rolcanlogin, rolsuper, rolcreatedb, rolcreaterole, rolreplication, "
                    "rolbypassrls FROM pg_roles WHERE rolname = :user"
                ),
                {"user": user},
            )
        )
        .mappings()
        .first()
    )
    if role is None:
        return None
    problems = [] if role["rolcanlogin"] else [f"{user} cannot log in"]
    problems += [f"{user} has {flag}" for flag in ROLE_FLAGS if role[flag]]
    for row in await _rows(
        connection,
        "SELECT DISTINCT g.rolname AS name FROM pg_auth_members m "
        "JOIN pg_roles g ON g.oid = m.roleid JOIN pg_roles r ON r.oid = m.member "
        "WHERE r.rolname = :user ORDER BY 1",
        user,
    ):
        problems.append(f"{user} is a member of {row['name']}")
    if await _rows(
        connection, f"SELECT 1 FROM pg_db_role_setting WHERE setrole = {ROLE_OID}", user
    ):
        problems.append(f"{user} has role-level settings")
    for row in await _rows(
        connection,
        "SELECT CAST(classid::regclass AS text) AS catalog, count(*) AS n FROM pg_shdepend "
        f"WHERE refclassid = 'pg_authid'::regclass AND refobjid = {ROLE_OID} AND deptype = 'o' "
        "AND dbid IN (0, (SELECT oid FROM pg_database WHERE datname = current_database())) "
        "GROUP BY 1 ORDER BY 1",
        user,
    ):
        kind = OWNED_KINDS.get(row["catalog"], row["catalog"])
        problems.append(f"{user} owns {row['n']} {kind}")
    return problems


async def _database_problems(connection: AsyncConnection, user: str) -> list[str]:
    """CONNECT on its own database and nothing more; no way into any other database."""
    problems: list[str] = []
    for row in await _rows(
        connection,
        "SELECT d.datname AS name, d.datname = current_database() AS own, "
        "has_database_privilege(:user, d.oid, 'CONNECT') AS can_connect, "
        "has_database_privilege(:user, d.oid, 'CREATE') AS can_create, "
        "has_database_privilege(:user, d.oid, 'TEMPORARY') AS can_temp "
        "FROM pg_database d WHERE d.datallowconn ORDER BY d.datname",
        user,
    ):
        if row["own"]:
            if not row["can_connect"]:
                problems.append(f"{user} cannot connect to the database")
            if row["can_create"]:
                problems.append(f"{user} may create schemas")
            if row["can_temp"]:
                problems.append(f"{user} may create temporary tables")
        else:
            if row["can_connect"]:
                problems.append(f"{user} can connect to database {row['name']}")
            if row["can_create"]:
                problems.append(f"{user} may create schemas in database {row['name']}")
    # The rights above are the effective ones; what is left to find here is a grant option.
    grants = await _rows(
        connection,
        "SELECT d.datname AS name, x.grantee, x.privilege_type AS privilege, "
        "x.is_grantable AS grantable FROM pg_database d "
        f"CROSS JOIN LATERAL aclexplode(d.datacl) x WHERE x.grantee = {ROLE_OID}",
        user,
    )
    return problems + _acl_findings(user, grants, "database ", allowed=lambda r: (r["privilege"],))


async def _schema_problems(connection: AsyncConnection, user: str) -> list[str]:
    """USAGE on public and on the owner's schemas, no CREATE anywhere, nothing for PUBLIC."""
    problems: list[str] = []
    for row in await _rows(
        connection,
        "SELECT n.nspname AS name, has_schema_privilege(:user, n.oid, 'CREATE') AS can_create, "
        "has_schema_privilege(:user, n.oid, 'USAGE') AS can_use FROM pg_namespace n "
        f"WHERE {NON_SYSTEM} ORDER BY n.nspname",
        user,
    ):
        if row["can_create"]:
            problems.append(f"{user} may create objects in schema {row['name']}")
        if row["name"] == "public" and not row["can_use"]:
            problems.append(f"{user} has no USAGE on schema public")
    # CREATE is reported above (the effective right). USAGE is the platform's default privilege on
    # a schema the owner created and the role's right on public; PUBLIC's own USAGE on public is
    # no widening (the role has it anyway).
    grants = await _rows(
        connection,
        "SELECT n.nspname AS name, x.grantee, x.privilege_type AS privilege, "
        f"x.is_grantable AS grantable, n.nspowner = {OWNER_OID} AS by_owner "
        f"FROM pg_namespace n CROSS JOIN LATERAL aclexplode(n.nspacl) x WHERE {NON_SYSTEM} "
        f"AND x.privilege_type <> 'CREATE' AND x.grantee IN ({PUBLIC_OID}, {ROLE_OID}) "
        "ORDER BY n.nspname",
        user,
    )
    return problems + _acl_findings(
        user,
        grants,
        "schema ",
        allowed=lambda r: ("USAGE",) if r["by_owner"] or r["name"] == "public" else (),
        public_allowed=lambda r: ("USAGE",) if r["name"] == "public" else (),
    )


async def _relation_problems(connection: AsyncConnection, user: str) -> list[str]:
    """Exactly the row privileges on tables, USAGE on sequences, nothing on the migrations'
    tables, no column privilege, nothing for PUBLIC."""
    name = SCHEMA_QUALIFIED.format("c", "relname")
    relations = await _rows(
        connection,
        f"SELECT {name} AS name, c.relname AS base, CAST(c.relkind AS text) AS kind, x.grantee, "
        "x.privilege_type AS privilege, x.is_grantable AS grantable "
        "FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace "
        f"CROSS JOIN LATERAL aclexplode(c.relacl) x WHERE {NON_SYSTEM} "
        f"AND x.grantee IN ({PUBLIC_OID}, {ROLE_OID}) ORDER BY 1",
        user,
    )
    problems = _acl_findings(
        user,
        relations,
        "",
        allowed=lambda r: (
            () if r["base"] in MIGRATION_TABLES else ALLOWED_ON_RELATION.get(r["kind"], ())
        ),
    )
    migration_names = ", ".join(f"'{table}'" for table in MIGRATION_TABLES)
    for row in await _rows(
        connection,
        f"SELECT {name} AS name, ARRAY(SELECT p FROM "
        "unnest(ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE']) AS p "
        "WHERE NOT has_table_privilege(:user, c.oid, p)) AS missing "
        "FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace "
        f"WHERE {NON_SYSTEM} AND c.relkind IN ('r', 'p') AND c.relname NOT IN ({migration_names}) "
        "ORDER BY 1",
        user,
    ):
        if row["missing"]:
            problems.append(f"{user} lacks {_listed(row['missing'])} on {row['name']}")
    columns: dict[tuple[str, str, str], set[str]] = defaultdict(set)
    for row in await _rows(
        connection,
        f"SELECT {name} AS relation, a.attname AS column, x.grantee, "
        "x.privilege_type AS privilege FROM pg_attribute a "
        "JOIN pg_class c ON c.oid = a.attrelid JOIN pg_namespace n ON n.oid = c.relnamespace "
        "CROSS JOIN LATERAL aclexplode(a.attacl) x "
        f"WHERE a.attnum > 0 AND NOT a.attisdropped AND {NON_SYSTEM} "
        f"AND x.grantee IN ({PUBLIC_OID}, {ROLE_OID}) ORDER BY 1, 2",
        user,
    ):
        who = "PUBLIC" if row["grantee"] == PUBLIC_OID else user
        columns[(who, row["relation"], row["column"])].add(row["privilege"])
    return problems + [
        f"{who} has {_listed(p)} on column {column} of {relation}"
        for (who, relation, column), p in columns.items()
    ]


async def _default_privilege_problems(connection: AsyncConnection, user: str) -> list[str]:
    """Only the platform's default privileges: the owner's, for the role, nothing for PUBLIC."""
    problems: list[str] = []
    if await _rows(connection, f"SELECT 1 FROM pg_default_acl WHERE defaclrole = {ROLE_OID}", user):
        problems.append(f"{user} has default privileges of its own")
    granted: dict[tuple[str, str], set[str]] = defaultdict(set)
    for row in await _rows(
        connection,
        "SELECT CAST(d.defaclobjtype AS text) AS kind, d.defaclrole = "
        f"{OWNER_OID} AS by_owner, d.defaclnamespace <> 0 AS in_schema, x.grantee, "
        "x.privilege_type AS privilege, x.is_grantable AS grantable "
        "FROM pg_default_acl d CROSS JOIN LATERAL aclexplode(d.defaclacl) x "
        f"WHERE x.grantee IN ({PUBLIC_OID}, {ROLE_OID})",
        user,
    ):
        public = row["grantee"] == PUBLIC_OID
        platform = (
            not public
            and row["by_owner"]
            and not row["in_schema"]
            and not row["grantable"]
            and row["privilege"] in ALLOWED_DEFAULTS.get(row["kind"], ())
        )
        implicit = public and row["privilege"] in IMPLICIT_PUBLIC_DEFAULTS.get(row["kind"], ())
        if not (platform or implicit):
            kind = str(DEFAULT_KINDS.get(row["kind"], row["kind"]))
            where = " in a schema" if row["in_schema"] else ""
            granted[("PUBLIC" if public else user, kind + where)].add(row["privilege"])
    return problems + [
        f"default privileges grant {who} {_listed(p)} on {kind}"
        for (who, kind), p in granted.items()
    ]


async def _other_object_problems(connection: AsyncConnection, user: str) -> list[str]:
    """Functions, types, large objects and the other object kinds with an ACL; SECURITY DEFINER."""
    problems: list[str] = []
    for row in await _rows(
        connection,
        "SELECT n.nspname || '.' || p.proname AS name FROM pg_proc p "
        "JOIN pg_namespace n ON n.oid = p.pronamespace "
        f"WHERE {NON_SYSTEM} AND p.prosecdef AND has_function_privilege(:user, p.oid, 'EXECUTE') "
        "ORDER BY 1",
        user,
    ):
        problems.append(f"{user} can execute SECURITY DEFINER function {row['name']}")
    # PUBLIC may execute functions and use types by default, so only the role's own grants count.
    for catalog, acl, label, namer in (
        ("pg_proc", "proacl", "function", "n.nspname || '.' || o.proname"),
        ("pg_type", "typacl", "type", "n.nspname || '.' || o.typname"),
    ):
        schema = "pronamespace" if catalog == "pg_proc" else "typnamespace"
        rows = await _rows(
            connection,
            f"SELECT {namer} AS name, x.grantee, x.privilege_type AS privilege, "
            f"x.is_grantable AS grantable FROM {catalog} o "
            f"JOIN pg_namespace n ON n.oid = o.{schema} "
            f"CROSS JOIN LATERAL aclexplode(o.{acl}) x WHERE {NON_SYSTEM} "
            f"AND x.grantee = {ROLE_OID} ORDER BY 1",
            user,
        )
        problems += _acl_findings(user, rows, f"{label} ")
    large_objects = await _rows(
        connection,
        "SELECT x.grantee, x.privilege_type AS privilege, bool_or(x.is_grantable) AS grantable, "
        "count(*) || ' large objects' AS name FROM pg_largeobject_metadata m "
        f"CROSS JOIN LATERAL aclexplode(m.lomacl) x WHERE x.grantee IN ({PUBLIC_OID}, {ROLE_OID}) "
        "GROUP BY 1, 2 ORDER BY 1, 2",
        user,
    )
    problems += _acl_findings(user, large_objects, "")
    for catalog, acl, name_column, what, public_default in OTHER_ACL_CATALOGS:
        grantees = ROLE_OID if public_default else f"{PUBLIC_OID}, {ROLE_OID}"
        rows = await _rows(
            connection,
            f"SELECT o.{name_column} AS name, x.grantee, x.privilege_type AS privilege, "
            f"x.is_grantable AS grantable FROM {catalog} o "
            f"CROSS JOIN LATERAL aclexplode(o.{acl}) x WHERE x.grantee IN ({grantees}) ORDER BY 1",
            user,
        )
        problems += _acl_findings(user, rows, f"{what} ")
    return problems


async def check_app_role(connection: AsyncConnection, user: str) -> list[str]:
    """Every way `user` differs from the platform's rows-only app role (an empty list when it
    does not)."""
    owner = (await connection.execute(text("SELECT current_user"))).scalar_one()
    if user == owner:
        return [f"{user} is the schema owner, not a separate app role"]
    role_problems = await _role_problems(connection, user)
    if role_problems is None:
        return [f"{user} does not exist (the platform's provision-app creates it)"]
    problems = role_problems
    for check in (
        _database_problems,
        _schema_problems,
        _relation_problems,
        _default_privilege_problems,
        _other_object_problems,
    ):
        problems += await check(connection, user)
    return list(dict.fromkeys(problems))


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
