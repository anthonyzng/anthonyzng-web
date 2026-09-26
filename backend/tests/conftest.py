"""Shared fixtures: a migrated test database, a running app with fakes, HTTP clients.

The suite runs against the real PostgreSQL named by TEST_DATABASE_URL (backend/.env). The schema
is rebuilt once per session with Alembic; every table is truncated before each test. No test
touches the network: Turnstile and email are replaced by recording fakes.
"""

import asyncio
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Any, cast

import httpx
import pytest
from alembic import command
from alembic.config import Config
from fastapi import FastAPI
from pydantic import SecretStr, ValidationError
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, create_async_engine
from sqlalchemy.pool import NullPool

from app.api.deps import get_email_provider, get_turnstile_verifier
from app.core.config import BACKEND_DIR, Settings
from app.core.rate_limit import rate_limiter
from app.core.state import AppServices
from app.main import create_app
from app.seed import SeedFile, load_seed_file, seed_content
from app.services.email import OutgoingEmail

TEST_ADMIN_EMAIL = "admin@example.com"
TEST_ADMIN_PASSWORD = "correct horse battery staple"
TEST_CONTACT_TO_EMAIL = "inbox@example.com"
TEST_JWT_SECRET = "unit-test-secret-not-for-production"
TEST_IP_HASH_SECRET = "unit-test-ip-hash-secret-0123456789"
TEST_TOTP_ENCRYPTION_KEY = "unit-test-totp-encryption-key-0123456789"
TEST_ORIGIN = "http://localhost:5173"
HEAD_REVISION = "0004_experience_company_url"

TABLES = (
    "admin_users",
    "experience_entries",
    "projects",
    "skill_groups",
    "education_entries",
    "certifications",
    "spoken_languages",
    "contact_links",
    "site_texts",
    "contact_messages",
    "stored_files",
)


def build_settings(**overrides: Any) -> Settings:
    """Settings with test-only values; only TEST_DATABASE_URL still comes from the environment."""
    values: dict[str, Any] = {
        "APP_ENV": "test",
        "DATABASE_URL": SecretStr("postgresql+asyncpg://unused:unused@127.0.0.1:1/unused"),
        "JWT_SECRET": SecretStr(TEST_JWT_SECRET),
        "IP_HASH_SECRET": SecretStr(TEST_IP_HASH_SECRET),
        "TOTP_ENCRYPTION_KEY": SecretStr(TEST_TOTP_ENCRYPTION_KEY),
        "ADMIN_EMAIL": TEST_ADMIN_EMAIL,
        "ADMIN_PASSWORD": SecretStr(TEST_ADMIN_PASSWORD),
        "CONTACT_TO_EMAIL": TEST_CONTACT_TO_EMAIL,
        "CORS_ORIGINS": [TEST_ORIGIN],
        "TURNSTILE_SECRET_KEY": SecretStr("test-turnstile-secret"),
        "EMAIL_PROVIDER": "console",
        "RESEND_API_KEY": SecretStr(""),
        "TRUSTED_PROXY": False,
    }
    values.update(overrides)
    return Settings(**values)


def alembic_config(database_url: str) -> Config:
    config = Config(str(BACKEND_DIR / "alembic.ini"))
    config.set_main_option("sqlalchemy.url", database_url.replace("%", "%%"))
    return config


async def _reset_schema(database_url: str) -> None:
    engine = create_async_engine(database_url, poolclass=NullPool)
    try:
        async with engine.begin() as connection:
            await connection.execute(text("DROP SCHEMA public CASCADE"))
            await connection.execute(text("CREATE SCHEMA public"))
    finally:
        await engine.dispose()


@pytest.fixture(scope="session")
def database_url() -> str:
    try:
        settings = build_settings()
    except ValidationError as exc:
        pytest.skip(f"backend settings unavailable: {exc}")
    if settings.TEST_DATABASE_URL is None:
        pytest.skip("TEST_DATABASE_URL is not configured")
    return settings.TEST_DATABASE_URL.get_secret_value()


@pytest.fixture(scope="session")
def test_settings(database_url: str) -> Settings:
    return build_settings(DATABASE_URL=SecretStr(database_url))


@pytest.fixture(scope="session")
def migrated_database(database_url: str) -> str:
    """An empty schema brought to head with `alembic upgrade head`."""
    asyncio.run(_reset_schema(database_url))
    command.upgrade(alembic_config(database_url), "head")
    return database_url


@pytest.fixture
async def engine(migrated_database: str) -> AsyncIterator[AsyncEngine]:
    """A fresh engine per test; every table is truncated before the test starts."""
    engine = create_async_engine(migrated_database, poolclass=NullPool)
    async with engine.begin() as connection:
        await connection.execute(text(f"TRUNCATE {', '.join(TABLES)} RESTART IDENTITY CASCADE"))
    try:
        yield engine
    finally:
        await engine.dispose()


class FakeTurnstile:
    def __init__(self) -> None:
        self.outcome: bool | Exception = True
        self.calls: list[tuple[str, str | None]] = []

    async def verify(self, token: str, remote_ip: str | None) -> bool:
        self.calls.append((token, remote_ip))
        if isinstance(self.outcome, Exception):
            raise self.outcome
        return self.outcome


class RecordingEmailProvider:
    def __init__(self) -> None:
        self.sent: list[OutgoingEmail] = []
        self.failure: Exception | None = None

    async def send(self, message: OutgoingEmail) -> None:
        if self.failure is not None:
            raise self.failure
        self.sent.append(message)


@pytest.fixture
def turnstile() -> FakeTurnstile:
    return FakeTurnstile()


@pytest.fixture
def mailbox() -> RecordingEmailProvider:
    return RecordingEmailProvider()


@asynccontextmanager
async def running_app(
    settings: Settings, turnstile: FakeTurnstile, mailbox: RecordingEmailProvider
) -> AsyncIterator[FastAPI]:
    """`create_app` + its lifespan, with the network-facing services replaced by fakes."""
    rate_limiter.reset()
    application = create_app(settings)
    application.dependency_overrides[get_turnstile_verifier] = lambda: turnstile
    application.dependency_overrides[get_email_provider] = lambda: mailbox
    try:
        async with application.router.lifespan_context(application):
            yield application
    finally:
        rate_limiter.reset()


@pytest.fixture
async def app(
    engine: AsyncEngine,
    test_settings: Settings,
    turnstile: FakeTurnstile,
    mailbox: RecordingEmailProvider,
) -> AsyncIterator[FastAPI]:
    async with running_app(test_settings, turnstile, mailbox) as application:
        yield application


def make_client(app: FastAPI, *, client_ip: str = "127.0.0.1") -> httpx.AsyncClient:
    transport = httpx.ASGITransport(app=app, client=(client_ip, 12345), raise_app_exceptions=False)
    return httpx.AsyncClient(transport=transport, base_url="http://testserver")


@pytest.fixture
async def client(app: FastAPI) -> AsyncIterator[httpx.AsyncClient]:
    async with make_client(app) as http_client:
        yield http_client


def services_of(app: FastAPI) -> AppServices:
    return cast(AppServices, app.state.services)


@pytest.fixture
async def session(app: FastAPI) -> AsyncIterator[AsyncSession]:
    async with services_of(app).session_factory() as db_session:
        yield db_session


@pytest.fixture(scope="session")
def seed_data() -> SeedFile:
    return load_seed_file()


@pytest.fixture
async def seeded(session: AsyncSession, seed_data: SeedFile) -> None:
    """The database holds the seed content."""
    await seed_content(session, seed_data)


@pytest.fixture
async def admin_client(client: httpx.AsyncClient) -> httpx.AsyncClient:
    """`client` signed in as the admin (the session cookie is in its jar)."""
    response = await client.post(
        "/api/v1/auth/login",
        json={"email": TEST_ADMIN_EMAIL, "password": TEST_ADMIN_PASSWORD, "turnstileToken": "t"},
    )
    assert response.status_code == 200
    return client
