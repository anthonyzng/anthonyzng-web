"""Password hashing (Argon2id), admin session JWTs and the session cookie, and the short-lived
token of a sign-in waiting for its second factor."""

import secrets
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError, VerifyMismatchError
from fastapi import Response

SESSION_COOKIE_NAME = "admin_session"
SESSION_COOKIE_PATH = "/api"
SESSION_TTL = timedelta(hours=12)
SESSION_TOKEN_TYPE = "admin_session"
TOTP_PENDING_COOKIE_NAME = "admin_totp_pending"
TOTP_PENDING_COOKIE_PATH = "/api/v1/auth"
"""Sent to the sign-in routes only."""
TOTP_PENDING_TTL = timedelta(minutes=5)
TOTP_PENDING_TOKEN_TYPE = "admin_totp_pending"
"""The password was right; the authenticator code is still to come. Never a session: the admin
session dependency accepts `admin_session` tokens only."""
JWT_ALGORITHM = "HS256"
EPOCH = datetime(1970, 1, 1, tzinfo=UTC)
"""`Expires` value that clears a cookie (an int would mean "seconds from now" to Starlette)."""

# OWASP's Argon2id baseline (m=19 MiB, t=2, p=1): the library default takes 64 MiB per check,
# which a burst of logins would turn into an out-of-memory kill on the 1 GiB VM. Checks also run at
# most PASSWORD_CHECK_CONCURRENCY at a time (the login route).
_hasher = PasswordHasher(time_cost=2, memory_cost=19 * 1024, parallelism=1)


def hash_password(password: str) -> str:
    """Argon2id hash with the parameters above."""
    return _hasher.hash(password)


def password_needs_rehash(password_hash: str) -> bool:
    """True when `password_hash` was made with other parameters (or is unreadable)."""
    try:
        return _hasher.check_needs_rehash(password_hash)
    except InvalidHashError:
        return True


def verify_password(password_hash: str, password: str) -> bool:
    """True when `password` matches `password_hash`; False for a mismatch or an unreadable hash."""
    try:
        return _hasher.verify(password_hash, password)
    except (VerifyMismatchError, VerificationError, InvalidHashError):
        return False


def make_dummy_password_hash() -> str:
    """A hash of random bytes, verified against on unknown-email logins to equalise timing."""
    return hash_password(secrets.token_urlsafe(32))


@dataclass(frozen=True, slots=True)
class SessionClaims:
    user_id: int
    email: str
    version: int
    """The admin's `session_version` when the token was issued; a later bump revokes the token."""
    issued_at: datetime
    expires_at: datetime


def _encode_token(
    *,
    token_type: str,
    ttl: timedelta,
    user_id: int,
    email: str,
    version: int,
    secret: str,
    now: datetime | None,
) -> str:
    issued_at = now or datetime.now(UTC)
    expires_at = issued_at + ttl
    payload: dict[str, Any] = {
        "sub": str(user_id),
        "email": email,
        "ver": version,
        "typ": token_type,
        "iat": int(issued_at.timestamp()),
        "exp": int(expires_at.timestamp()),
    }
    return jwt.encode(payload, secret, algorithm=JWT_ALGORITHM)


def create_session_token(
    *, user_id: int, email: str, version: int, secret: str, now: datetime | None = None
) -> str:
    return _encode_token(
        token_type=SESSION_TOKEN_TYPE,
        ttl=SESSION_TTL,
        user_id=user_id,
        email=email,
        version=version,
        secret=secret,
        now=now,
    )


def create_totp_pending_token(
    *, user_id: int, email: str, version: int, secret: str, now: datetime | None = None
) -> str:
    return _encode_token(
        token_type=TOTP_PENDING_TOKEN_TYPE,
        ttl=TOTP_PENDING_TTL,
        user_id=user_id,
        email=email,
        version=version,
        secret=secret,
        now=now,
    )


def decode_session_token(token: str, secret: str) -> SessionClaims | None:
    """Claims of a valid, unexpired admin session token, or None for anything else."""
    return _decode_token(token, secret, SESSION_TOKEN_TYPE)


def decode_totp_pending_token(token: str, secret: str) -> SessionClaims | None:
    """Claims of a valid, unexpired second-factor token, or None for anything else."""
    return _decode_token(token, secret, TOTP_PENDING_TOKEN_TYPE)


def _decode_token(token: str, secret: str, token_type: str) -> SessionClaims | None:
    try:
        payload = jwt.decode(
            token,
            secret,
            algorithms=[JWT_ALGORITHM],
            options={"require": ["exp", "sub", "iat", "ver"]},
        )
    except jwt.PyJWTError:
        return None
    if payload.get("typ") != token_type:
        return None
    try:
        user_id = int(payload["sub"])
    except (TypeError, ValueError):
        return None
    email = payload.get("email")
    version = payload.get("ver")
    # bool is an int subclass: `true` must not pass as version 1.
    if not isinstance(email, str) or not isinstance(version, int) or isinstance(version, bool):
        return None
    return SessionClaims(
        user_id=user_id,
        email=email,
        version=version,
        issued_at=datetime.fromtimestamp(int(payload["iat"]), tz=UTC),
        expires_at=datetime.fromtimestamp(int(payload["exp"]), tz=UTC),
    )


def set_session_cookie(response: Response, token: str, *, secure: bool) -> None:
    """`admin_session=<JWT>; Path=/api; Max-Age=43200; HttpOnly; SameSite=Lax[; Secure]`."""
    response.set_cookie(
        SESSION_COOKIE_NAME,
        token,
        max_age=int(SESSION_TTL.total_seconds()),
        path=SESSION_COOKIE_PATH,
        secure=secure,
        httponly=True,
        samesite="lax",
    )


def clear_session_cookie(response: Response, *, secure: bool) -> None:
    """Same attributes as `set_session_cookie`, empty value, `Max-Age=0`, `Expires` in the past."""
    response.set_cookie(
        SESSION_COOKIE_NAME,
        "",
        max_age=0,
        expires=EPOCH,
        path=SESSION_COOKIE_PATH,
        secure=secure,
        httponly=True,
        samesite="lax",
    )


def set_totp_pending_cookie(response: Response, token: str, *, secure: bool) -> None:
    """`admin_totp_pending=<JWT>; Path=/api/v1/auth; Max-Age=300; HttpOnly; SameSite=Strict`."""
    response.set_cookie(
        TOTP_PENDING_COOKIE_NAME,
        token,
        max_age=int(TOTP_PENDING_TTL.total_seconds()),
        path=TOTP_PENDING_COOKIE_PATH,
        secure=secure,
        httponly=True,
        samesite="strict",
    )


def clear_totp_pending_cookie(response: Response, *, secure: bool) -> None:
    response.set_cookie(
        TOTP_PENDING_COOKIE_NAME,
        "",
        max_age=0,
        expires=EPOCH,
        path=TOTP_PENDING_COOKIE_PATH,
        secure=secure,
        httponly=True,
        samesite="strict",
    )
