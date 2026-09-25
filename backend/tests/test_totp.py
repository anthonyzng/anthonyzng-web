"""Two-factor sign-in (TOTP): the RFC 6238 codes, the secret's encryption, the admin panel's
setup / enable / disable routes, the two-step sign-in and the shell reset."""

import base64
from datetime import UTC, datetime
from http.cookies import SimpleCookie
from typing import Any

import httpx
import pytest
from fastapi import FastAPI
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.admin_totp import run as run_cli
from app.core.config import Settings
from app.core.security import (
    SESSION_COOKIE_NAME,
    TOTP_PENDING_COOKIE_NAME,
    create_totp_pending_token,
)
from app.core.totp import (
    SecretBox,
    SecretDecryptionError,
    code_at,
    current_counter,
    match_code,
    new_secret,
    provisioning_uri,
)
from app.models.admin_user import AdminUser
from tests.conftest import (
    TEST_ADMIN_EMAIL,
    TEST_ADMIN_PASSWORD,
    TEST_JWT_SECRET,
    TEST_ORIGIN,
    make_client,
    services_of,
)

LOGIN = "/api/v1/auth/login"
LOGIN_TOTP = "/api/v1/auth/login/totp"
ME = "/api/v1/auth/me"
TOTP = "/api/v1/admin/totp"
CREDENTIALS = {"email": TEST_ADMIN_EMAIL, "password": TEST_ADMIN_PASSWORD, "turnstileToken": "t"}

# RFC 6238 appendix B, SHA-1: the ASCII secret "12345678901234567890", codes cut to 6 digits.
RFC_SECRET = base64.b32encode(b"12345678901234567890").decode().rstrip("=")
RFC_VECTORS = [
    (59, "287082"),
    (1111111109, "081804"),
    (1111111111, "050471"),
    (1234567890, "005924"),
    (2000000000, "279037"),
    (20000000000, "353130"),
]


# --- codes and secrets ------------------------------------------------------------------------


@pytest.mark.parametrize(("moment", "code"), RFC_VECTORS)
def test_codes_match_the_rfc_vectors(moment: int, code: str) -> None:
    assert code_at(RFC_SECRET, current_counter(moment)) == code


def test_a_code_is_accepted_within_one_step_and_only_once() -> None:
    now = 1_000_000_000.0
    step = current_counter(now)
    for drift in (-1, 0, 1):
        assert match_code(RFC_SECRET, code_at(RFC_SECRET, step + drift), last_counter=None, now=now)
    for drift in (-2, 2):
        code = code_at(RFC_SECRET, step + drift)
        assert match_code(RFC_SECRET, code, last_counter=None, now=now) is None
    current = code_at(RFC_SECRET, step)
    assert match_code(RFC_SECRET, current, last_counter=step, now=now) is None
    assert match_code(RFC_SECRET, current, last_counter=step - 1, now=now) == step


FULLWIDTH_DIGITS = "".join(chr(0xFF11 + i) for i in range(6))
"""Unicode digits `str.isdigit()` accepts: a code must be ASCII."""


@pytest.mark.parametrize("code", ["", "12345", "1234567", "12345a", FULLWIDTH_DIGITS, " 12345"])
def test_malformed_codes_never_match(code: str) -> None:
    assert match_code(RFC_SECRET, code, last_counter=None) is None


def test_new_secrets_are_160_random_bits_in_base32() -> None:
    first, second = new_secret(), new_secret()
    assert first != second
    assert len(first) == 32
    assert len(base64.b32decode(first)) == 20


def test_provisioning_uri() -> None:
    uri = provisioning_uri("ABCDEF", "admin@example.com")
    assert uri == (
        "otpauth://totp/owwsolution.com:admin@example.com?secret=ABCDEF&issuer=owwsolution.com"
        "&algorithm=SHA1&digits=6&period=30"
    )


def test_the_secret_box_binds_the_key_and_the_row() -> None:
    box = SecretBox("key-material-0123456789-0123456789")
    sealed = box.encrypt(RFC_SECRET, admin_id=1)
    assert RFC_SECRET.encode() not in sealed
    assert box.decrypt(sealed, admin_id=1) == RFC_SECRET
    assert box.encrypt(RFC_SECRET, admin_id=1) != sealed  # a fresh nonce every time
    with pytest.raises(SecretDecryptionError):
        box.decrypt(sealed, admin_id=2)
    with pytest.raises(SecretDecryptionError):
        SecretBox("another-key-0123456789-0123456789").decrypt(sealed, admin_id=1)
    with pytest.raises(SecretDecryptionError):
        box.decrypt(b"\x02" + sealed[1:], admin_id=1)


# --- helpers ----------------------------------------------------------------------------------


async def admin_row(session: AsyncSession) -> AdminUser:
    session.expire_all()
    return (await session.scalars(select(AdminUser))).one()


async def turn_on(client: httpx.AsyncClient, session: AsyncSession) -> str:
    """Sets up and enables two-factor sign-in through the API; returns the secret."""
    setup = await client.post(f"{TOTP}/setup")
    assert setup.status_code == 200
    secret: str = setup.json()["secret"]
    code = code_at(secret, current_counter())
    enabled = await client.post(
        f"{TOTP}/enable", json={"password": TEST_ADMIN_PASSWORD, "code": code}
    )
    assert enabled.status_code == 200, enabled.text
    return secret


async def next_code(session: AsyncSession, secret: str) -> str:
    """A code for the step after the last one accepted (valid for the next 30-60 seconds)."""
    last = (await admin_row(session)).totp_last_counter
    assert last is not None
    return code_at(secret, max(last + 1, current_counter()))


def cookies_set(response: httpx.Response) -> dict[str, Any]:
    jar: SimpleCookie = SimpleCookie()
    for header in response.headers.get_list("set-cookie"):
        jar.load(header)
    return dict(jar)


# --- admin panel routes -------------------------------------------------------------------------


def cookie(name: str, value: str) -> dict[str, str]:
    return {"Cookie": f"{name}={value}"}


async def test_status_setup_and_enable(
    app: FastAPI, admin_client: httpx.AsyncClient, session: AsyncSession
) -> None:
    assert (await admin_client.get(TOTP)).json() == {"enabled": False, "enabledAt": None}

    setup = await admin_client.post(f"{TOTP}/setup")
    assert setup.headers["cache-control"] == "no-store"
    body = setup.json()
    assert body["uri"] == provisioning_uri(body["secret"], TEST_ADMIN_EMAIL)
    row = await admin_row(session)
    assert row.totp_pending_secret is not None
    assert body["secret"].encode() not in row.totp_pending_secret  # stored encrypted
    assert row.totp_secret is None
    version = row.session_version
    old_cookie = admin_client.cookies.get(SESSION_COOKIE_NAME)

    code = code_at(body["secret"], current_counter())
    wrong_password = await admin_client.post(
        f"{TOTP}/enable", json={"password": "nope", "code": code}
    )
    assert wrong_password.status_code == 400
    assert wrong_password.json()["error"]["code"] == "wrong_password"
    wrong_code = await admin_client.post(
        f"{TOTP}/enable",
        json={"password": TEST_ADMIN_PASSWORD, "code": "000000" if code != "000000" else "111111"},
    )
    assert wrong_code.status_code == 400
    assert wrong_code.json()["error"]["code"] == "totp_invalid"

    enabled = await admin_client.post(
        f"{TOTP}/enable", json={"password": TEST_ADMIN_PASSWORD, "code": code}
    )
    assert enabled.status_code == 200
    assert enabled.json()["enabled"] is True
    assert SESSION_COOKIE_NAME in cookies_set(enabled)  # this tab stays signed in
    row = await admin_row(session)
    assert row.totp_secret is not None
    assert row.totp_pending_secret is None
    assert row.totp_enabled_at is not None
    assert row.session_version == version + 1  # every other session is revoked

    assert (await admin_client.get(ME)).status_code == 200
    async with make_client(app) as other:
        stale = await other.get(ME, headers=cookie(SESSION_COOKIE_NAME, old_cookie or ""))
    assert stale.status_code == 401
    summary = await admin_client.get("/api/v1/admin/summary")
    assert summary.json()["totpEnabled"] is True

    again = await admin_client.post(f"{TOTP}/setup")
    assert again.status_code == 409


async def test_enable_needs_a_setup_first(admin_client: httpx.AsyncClient) -> None:
    response = await admin_client.post(
        f"{TOTP}/enable", json={"password": TEST_ADMIN_PASSWORD, "code": "123456"}
    )
    assert response.status_code == 409


async def test_disable_needs_the_password_and_a_fresh_code(
    admin_client: httpx.AsyncClient, session: AsyncSession
) -> None:
    secret = await turn_on(admin_client, session)
    used = code_at(secret, (await admin_row(session)).totp_last_counter or 0)
    replay = await admin_client.post(
        f"{TOTP}/disable", json={"password": TEST_ADMIN_PASSWORD, "code": used}
    )
    assert replay.json()["error"]["code"] == "totp_invalid"
    fresh = await next_code(session, secret)
    wrong_password = await admin_client.post(
        f"{TOTP}/disable", json={"password": "nope", "code": fresh}
    )
    assert wrong_password.json()["error"]["code"] == "wrong_password"

    response = await admin_client.post(
        f"{TOTP}/disable", json={"password": TEST_ADMIN_PASSWORD, "code": fresh}
    )
    assert response.status_code == 200
    assert response.json() == {"enabled": False, "enabledAt": None}
    row = await admin_row(session)
    assert row.totp_secret is None
    assert row.totp_last_counter is None
    # Signing in is one step again.
    admin_client.cookies.clear()
    login = await admin_client.post(LOGIN, json=CREDENTIALS)
    assert login.json()["totpRequired"] is False


async def test_confirmations_are_rate_limited(admin_client: httpx.AsyncClient) -> None:
    await admin_client.post(f"{TOTP}/setup")
    body = {"password": "nope", "code": "123456"}
    statuses = [
        (await admin_client.post(f"{TOTP}/enable", json=body)).status_code for _ in range(6)
    ]
    assert statuses == [400] * 5 + [429]


@pytest.mark.parametrize(
    ("method", "path", "body"),
    [
        ("GET", TOTP, None),
        ("POST", f"{TOTP}/setup", None),
        ("POST", f"{TOTP}/enable", {"password": "x", "code": "123456"}),
        ("POST", f"{TOTP}/disable", {"password": "x", "code": "123456"}),
    ],
)
async def test_routes_need_a_session(
    client: httpx.AsyncClient, method: str, path: str, body: dict[str, str] | None
) -> None:
    response = await client.request(method, path, json=body)
    assert response.status_code == 401
    assert response.headers["cache-control"] == "no-store"


async def test_writes_from_a_foreign_origin_are_refused(admin_client: httpx.AsyncClient) -> None:
    response = await admin_client.post(f"{TOTP}/setup", headers={"Origin": "https://evil.test"})
    assert response.status_code == 403
    ok = await admin_client.post(f"{TOTP}/setup", headers={"Origin": TEST_ORIGIN})
    assert ok.status_code == 200


@pytest.mark.parametrize("code", ["12345", "12 345", "abcdef", ""])
async def test_codes_are_validated(admin_client: httpx.AsyncClient, code: str) -> None:
    response = await admin_client.post(
        f"{TOTP}/enable", json={"password": TEST_ADMIN_PASSWORD, "code": code}
    )
    assert response.status_code == 422


# --- two-step sign-in ------------------------------------------------------------------------


async def test_sign_in_asks_for_a_code_once_enabled(
    app: FastAPI, admin_client: httpx.AsyncClient, session: AsyncSession
) -> None:
    secret = await turn_on(admin_client, session)
    admin_client.cookies.clear()

    first = await admin_client.post(LOGIN, json=CREDENTIALS)
    assert first.status_code == 200
    assert first.json() == {"email": TEST_ADMIN_EMAIL, "totpRequired": True}
    cookies = cookies_set(first)
    assert SESSION_COOKIE_NAME not in cookies  # no session yet
    pending = cookies[TOTP_PENDING_COOKIE_NAME]
    assert pending["path"] == "/api/v1/auth"
    assert pending["max-age"] == "300"
    assert pending["httponly"]
    assert pending["samesite"].lower() == "strict"
    assert (await admin_client.get(ME)).status_code == 401
    # The pending token is not a session, whatever cookie name carries it.
    async with make_client(app) as other:
        as_session = await other.get(ME, headers=cookie(SESSION_COOKIE_NAME, pending.value))
    assert as_session.status_code == 401

    wrong = await admin_client.post(LOGIN_TOTP, json={"code": "000000"})
    if wrong.status_code == 200:  # pragma: no cover - "000000" happened to be the code
        pytest.skip("the random secret's current code was 000000")
    assert wrong.status_code == 400
    assert wrong.json()["error"]["code"] == "totp_invalid"

    code = await next_code(session, secret)
    done = await admin_client.post(LOGIN_TOTP, json={"code": code})
    assert done.status_code == 200
    assert done.json() == {"email": TEST_ADMIN_EMAIL, "totpRequired": False}
    cookies = cookies_set(done)
    assert cookies[SESSION_COOKIE_NAME].value
    assert cookies[TOTP_PENDING_COOKIE_NAME].value == ""  # cleared
    assert (await admin_client.get(ME)).status_code == 200

    # The same code cannot finish another sign-in.
    admin_client.cookies.clear()
    await admin_client.post(LOGIN, json=CREDENTIALS)
    replay = await admin_client.post(LOGIN_TOTP, json={"code": code})
    assert replay.json()["error"]["code"] == "totp_invalid"


async def test_the_second_step_needs_a_live_pending_sign_in(
    app: FastAPI, admin_client: httpx.AsyncClient, session: AsyncSession
) -> None:
    secret = await turn_on(admin_client, session)
    admin_client.cookies.clear()
    code = await next_code(session, secret)

    missing = await admin_client.post(LOGIN_TOTP, json={"code": code})
    assert missing.status_code == 401
    assert missing.json()["error"]["code"] == "unauthorized"

    row = await admin_row(session)
    expired = create_totp_pending_token(
        user_id=row.id,
        email=row.email,
        version=row.session_version,
        secret=TEST_JWT_SECRET,
        now=datetime(2020, 1, 1, tzinfo=UTC),
    )
    async with make_client(app) as other:
        response = await other.post(
            LOGIN_TOTP, json={"code": code}, headers=cookie(TOTP_PENDING_COOKIE_NAME, expired)
        )
    assert response.status_code == 401

    # A pending sign-in dies with the sessions (logout elsewhere, password change).
    await admin_client.post(LOGIN, json=CREDENTIALS)
    row.session_version += 1
    await session.commit()
    revoked = await admin_client.post(LOGIN_TOTP, json={"code": code})
    assert revoked.status_code == 401


async def test_codes_are_limited_per_admin(
    admin_client: httpx.AsyncClient, session: AsyncSession
) -> None:
    secret = await turn_on(admin_client, session)
    admin_client.cookies.clear()
    await admin_client.post(LOGIN, json=CREDENTIALS)
    good = await next_code(session, secret)
    bad = "000000" if good != "000000" else "111111"
    statuses = [
        (await admin_client.post(LOGIN_TOTP, json={"code": bad})).status_code for _ in range(5)
    ]
    assert statuses == [400] * 5
    blocked = await admin_client.post(LOGIN_TOTP, json={"code": good})
    assert blocked.status_code == 429
    assert int(blocked.headers["retry-after"]) > 0


async def test_an_undecryptable_secret_is_a_503_not_a_bypass(
    app: FastAPI, admin_client: httpx.AsyncClient, session: AsyncSession
) -> None:
    await turn_on(admin_client, session)
    admin_client.cookies.clear()
    await admin_client.post(LOGIN, json=CREDENTIALS)
    services_of(app).totp_box = SecretBox("a-different-key-0123456789-0123456789")
    response = await admin_client.post(LOGIN_TOTP, json={"code": "123456"})
    assert response.status_code == 503
    assert (await admin_client.get(ME)).status_code == 401


# --- the shell reset ------------------------------------------------------------------------


async def test_the_cli_reset_turns_it_off_and_revokes_sessions(
    admin_client: httpx.AsyncClient, session: AsyncSession, test_settings: Settings
) -> None:
    await turn_on(admin_client, session)
    assert (await run_cli(test_settings, "status")).startswith("Two-factor sign-in is on")
    version = (await admin_row(session)).session_version

    message = await run_cli(test_settings, "reset")
    assert message.startswith("Two-factor sign-in turned off")
    row = await admin_row(session)
    assert row.totp_secret is None
    assert row.session_version == version + 1
    assert (await admin_client.get(ME)).status_code == 401
    assert await run_cli(test_settings, "status") == "Two-factor sign-in is off."
