"""`/auth/*`: login cookie, identical failure paths, rate limits, `/me`, logout, revocation."""

import threading
from datetime import UTC, datetime, timedelta
from email.utils import parsedate_to_datetime
from http.cookies import Morsel, SimpleCookie

import httpx
import pytest
from fastapi import FastAPI
from pydantic import SecretStr
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession

import app.services.auth as auth_service
from app.core.config import Settings
from app.core.security import (
    SESSION_COOKIE_NAME,
    create_session_token,
    hash_password,
    verify_password,
)
from app.models.admin_user import AdminUser
from app.services.auth import ensure_admin_user
from tests.conftest import (
    TEST_ADMIN_EMAIL,
    TEST_ADMIN_PASSWORD,
    TEST_JWT_SECRET,
    FakeTurnstile,
    RecordingEmailProvider,
    make_client,
    running_app,
)

LOGIN = "/api/v1/auth/login"
LOGOUT = "/api/v1/auth/logout"
ME = "/api/v1/auth/me"
CREDENTIALS = {"email": TEST_ADMIN_EMAIL, "password": TEST_ADMIN_PASSWORD}
INVALID_CREDENTIALS = {
    "error": {"code": "invalid_credentials", "message": "Invalid email or password."}
}


def session_cookie(response: httpx.Response) -> Morsel[str]:
    jar = SimpleCookie()
    jar.load(response.headers["set-cookie"])
    return jar[SESSION_COOKIE_NAME]


def cookie_header(token: str) -> dict[str, str]:
    return {"Cookie": f"{SESSION_COOKIE_NAME}={token}"}


async def test_login_sets_the_session_cookie(client: httpx.AsyncClient) -> None:
    response = await client.post(LOGIN, json=CREDENTIALS)
    assert response.status_code == 200
    assert response.json() == {"email": TEST_ADMIN_EMAIL}
    assert response.headers["cache-control"] == "no-store"
    morsel = session_cookie(response)
    assert morsel.value
    assert morsel["path"] == "/api"
    assert morsel["max-age"] == "43200"
    assert morsel["httponly"]
    assert morsel["samesite"].lower() == "lax"
    assert not morsel["secure"]
    assert not morsel["domain"]


async def test_login_cookie_is_secure_in_production(
    engine: AsyncEngine,
    test_settings: Settings,
    turnstile: FakeTurnstile,
    mailbox: RecordingEmailProvider,
) -> None:
    settings = test_settings.model_copy(update={"APP_ENV": "production"})
    async with running_app(settings, turnstile, mailbox) as app, make_client(app) as client:
        response = await client.post(LOGIN, json=CREDENTIALS)
    assert response.status_code == 200
    assert session_cookie(response)["secure"]


async def test_login_email_is_case_insensitive(client: httpx.AsyncClient) -> None:
    response = await client.post(LOGIN, json={**CREDENTIALS, "email": " ADMIN@Example.com "})
    assert response.status_code == 200


async def test_wrong_password_and_unknown_email_look_identical(client: httpx.AsyncClient) -> None:
    wrong_password = await client.post(LOGIN, json={**CREDENTIALS, "password": "nope"})
    unknown_email = await client.post(
        LOGIN, json={"email": "nobody@example.com", "password": TEST_ADMIN_PASSWORD}
    )
    for response in (wrong_password, unknown_email):
        assert response.status_code == 401
        assert response.json() == INVALID_CREDENTIALS
        assert "set-cookie" not in response.headers


async def test_login_validation(client: httpx.AsyncClient) -> None:
    response = await client.post(LOGIN, json={"email": TEST_ADMIN_EMAIL})
    assert response.status_code == 422
    assert list(response.json()["error"]["fields"]) == ["password"]
    response = await client.post(LOGIN, json={"email": TEST_ADMIN_EMAIL, "password": ""})
    assert response.status_code == 422


async def test_email_failure_limit(client: httpx.AsyncClient) -> None:
    for _ in range(5):
        assert (
            await client.post(LOGIN, json={**CREDENTIALS, "password": "nope"})
        ).status_code == 401
    response = await client.post(LOGIN, json=CREDENTIALS)
    assert response.status_code == 429
    assert response.json()["error"]["code"] == "rate_limited"
    assert int(response.headers["retry-after"]) >= 1


async def test_email_failures_are_cleared_by_a_successful_login(client: httpx.AsyncClient) -> None:
    for _ in range(2):
        await client.post(LOGIN, json={**CREDENTIALS, "password": "nope"})
    assert (await client.post(LOGIN, json=CREDENTIALS)).status_code == 200
    for _ in range(5):
        assert (
            await client.post(LOGIN, json={**CREDENTIALS, "password": "nope"})
        ).status_code == 401
    assert (await client.post(LOGIN, json={**CREDENTIALS, "password": "nope"})).status_code == 429


async def test_ip_attempt_limit(app: FastAPI, client: httpx.AsyncClient) -> None:
    # A different unknown email each time keeps the per-email limiter out of the picture.
    for index in range(10):
        unknown = {"email": f"ghost{index}@example.com", "password": "whatever"}
        assert (await client.post(LOGIN, json=unknown)).status_code == 401
    unknown = {"email": "ghost99@example.com", "password": "whatever"}
    assert (await client.post(LOGIN, json=unknown)).status_code == 429
    assert (await client.post(LOGIN, json=CREDENTIALS)).status_code == 429
    async with make_client(app, client_ip="10.0.0.2") as other:
        assert (await other.post(LOGIN, json=CREDENTIALS)).status_code == 200


async def test_me_requires_a_session(client: httpx.AsyncClient) -> None:
    response = await client.get(ME)
    assert response.status_code == 401
    assert response.json() == {
        "error": {"code": "unauthorized", "message": "Authentication required."}
    }


async def test_me_after_login(client: httpx.AsyncClient) -> None:
    await client.post(LOGIN, json=CREDENTIALS)
    response = await client.get(ME)
    assert response.status_code == 200
    assert response.json() == {"email": TEST_ADMIN_EMAIL}
    assert response.headers["cache-control"] == "no-store"


async def test_me_rejects_bad_tokens(client: httpx.AsyncClient, session: AsyncSession) -> None:
    admin = (await session.scalars(select(AdminUser))).one()
    tampered = create_session_token(
        user_id=admin.id,
        email=admin.email,
        version=admin.session_version,
        secret="another-unit-test-secret-0123456789abcdef",
    )
    assert (await client.get(ME, headers=cookie_header(tampered))).status_code == 401
    expired = create_session_token(
        user_id=admin.id,
        email=admin.email,
        version=admin.session_version,
        secret=TEST_JWT_SECRET,
        now=datetime.now(UTC) - timedelta(hours=13),
    )
    assert (await client.get(ME, headers=cookie_header(expired))).status_code == 401
    stale_version = create_session_token(
        user_id=admin.id,
        email=admin.email,
        version=admin.session_version - 1,
        secret=TEST_JWT_SECRET,
    )
    assert (await client.get(ME, headers=cookie_header(stale_version))).status_code == 401
    assert (await client.get(ME, headers=cookie_header("garbage"))).status_code == 401


async def test_me_for_a_deleted_user(client: httpx.AsyncClient, session: AsyncSession) -> None:
    await client.post(LOGIN, json=CREDENTIALS)
    await session.execute(delete(AdminUser))
    await session.commit()
    assert (await client.get(ME)).status_code == 401


async def test_logout_clears_the_cookie(client: httpx.AsyncClient) -> None:
    await client.post(LOGIN, json=CREDENTIALS)
    response = await client.post(LOGOUT)
    assert response.status_code == 204
    assert response.content == b""
    morsel = session_cookie(response)
    assert morsel.value == ""
    assert morsel["max-age"] == "0"
    assert morsel["path"] == "/api"
    assert morsel["httponly"]
    assert parsedate_to_datetime(morsel["expires"]) < datetime.now(UTC)
    assert client.cookies.get(SESSION_COOKIE_NAME) is None
    assert (await client.get(ME)).status_code == 401


async def test_logout_without_a_session(client: httpx.AsyncClient) -> None:
    response = await client.post(LOGOUT)
    assert response.status_code == 204
    assert session_cookie(response)["max-age"] == "0"


async def test_logout_revokes_every_copy_of_the_session(client: httpx.AsyncClient) -> None:
    """Clearing the cookie is not enough: a copy (another tab, a leaked cookie) must stop too."""
    login = await client.post(LOGIN, json=CREDENTIALS)
    token = session_cookie(login).value
    assert (await client.get(ME, headers=cookie_header(token))).status_code == 200
    assert (await client.post(LOGOUT)).status_code == 204
    assert (await client.get(ME, headers=cookie_header(token))).status_code == 401
    # Signing in again issues a fresh session that works.
    assert (await client.post(LOGIN, json=CREDENTIALS)).status_code == 200
    assert (await client.get(ME)).status_code == 200


async def test_admin_is_upserted_at_startup(session: AsyncSession, test_settings: Settings) -> None:
    admins = list((await session.scalars(select(AdminUser))).all())
    assert [admin.email for admin in admins] == [TEST_ADMIN_EMAIL]
    original_hash = admins[0].password_hash
    original_version = admins[0].session_version
    assert verify_password(original_hash, TEST_ADMIN_PASSWORD)

    await ensure_admin_user(session, test_settings)
    session.expire_all()
    same = (await session.scalars(select(AdminUser))).one()
    assert same.password_hash == original_hash
    assert same.session_version == original_version

    rotated = test_settings.model_copy(update={"ADMIN_PASSWORD": SecretStr("new password")})
    await ensure_admin_user(session, rotated)
    session.expire_all()
    updated = (await session.scalars(select(AdminUser))).one()
    assert updated.password_hash != original_hash
    assert verify_password(updated.password_hash, "new password")
    assert updated.session_version == original_version + 1
    assert len(list((await session.scalars(select(AdminUser))).all())) == 1


async def test_password_change_revokes_existing_sessions(
    client: httpx.AsyncClient, session: AsyncSession, test_settings: Settings
) -> None:
    assert (await client.post(LOGIN, json=CREDENTIALS)).status_code == 200
    assert (await client.get(ME)).status_code == 200

    rotated = test_settings.model_copy(update={"ADMIN_PASSWORD": SecretStr("a brand new password")})
    await ensure_admin_user(session, rotated)

    assert (await client.get(ME)).status_code == 401
    assert (await client.post(LOGIN, json=CREDENTIALS)).status_code == 401
    new_login = {"email": TEST_ADMIN_EMAIL, "password": "a brand new password"}
    assert (await client.post(LOGIN, json=new_login)).status_code == 200
    assert (await client.get(ME)).status_code == 200


async def test_changing_admin_email_removes_the_previous_admin(
    client: httpx.AsyncClient, session: AsyncSession, test_settings: Settings
) -> None:
    """Only the configured account may exist: an old ADMIN_EMAIL loses its password and sessions."""
    old_login = await client.post(LOGIN, json=CREDENTIALS)
    old_token = session_cookie(old_login).value

    moved = test_settings.model_copy(update={"ADMIN_EMAIL": "new-admin@example.com"})
    await ensure_admin_user(session, moved)
    session.expire_all()

    emails = [admin.email for admin in (await session.scalars(select(AdminUser))).all()]
    assert emails == ["new-admin@example.com"]
    assert (await client.post(LOGIN, json=CREDENTIALS)).status_code == 401
    assert (await client.get(ME, headers=cookie_header(old_token))).status_code == 401
    new_login = {"email": "new-admin@example.com", "password": TEST_ADMIN_PASSWORD}
    assert (await client.post(LOGIN, json=new_login)).status_code == 200


async def test_stray_admin_rows_are_removed_at_startup(
    session: AsyncSession, test_settings: Settings
) -> None:
    session.add(AdminUser(email="stray@example.com", password_hash=hash_password("whatever")))
    await session.commit()
    await ensure_admin_user(session, test_settings)
    session.expire_all()
    emails = [admin.email for admin in (await session.scalars(select(AdminUser))).all()]
    assert emails == [TEST_ADMIN_EMAIL]


async def test_argon2_runs_off_the_event_loop(
    client: httpx.AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Argon2 costs tens of milliseconds of CPU: on the loop it would stall every other request."""
    loop_thread = threading.get_ident()
    threads: list[int] = []

    def recording_verify(password_hash: str, password: str) -> bool:
        threads.append(threading.get_ident())
        return verify_password(password_hash, password)

    monkeypatch.setattr(auth_service, "verify_password", recording_verify)
    assert (await client.post(LOGIN, json=CREDENTIALS)).status_code == 200
    unknown = {"email": "nobody@example.com", "password": "whatever"}
    assert (await client.post(LOGIN, json=unknown)).status_code == 401
    assert len(threads) == 2
    assert loop_thread not in threads
