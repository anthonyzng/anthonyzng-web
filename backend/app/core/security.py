"""Password hashing (Argon2id), admin session JWTs and the session cookie."""

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
JWT_ALGORITHM = "HS256"
EPOCH = datetime(1970, 1, 1, tzinfo=UTC)
"""`Expires` value that clears a cookie (an int would mean "seconds from now" to Starlette)."""

_hasher = PasswordHasher()


def hash_password(password: str) -> str:
    """Argon2id hash with the library's current recommended parameters."""
    return _hasher.hash(password)


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


def create_session_token(
    *, user_id: int, email: str, version: int, secret: str, now: datetime | None = None
) -> str:
    issued_at = now or datetime.now(UTC)
    expires_at = issued_at + SESSION_TTL
    payload: dict[str, Any] = {
        "sub": str(user_id),
        "email": email,
        "ver": version,
        "typ": SESSION_TOKEN_TYPE,
        "iat": int(issued_at.timestamp()),
        "exp": int(expires_at.timestamp()),
    }
    return jwt.encode(payload, secret, algorithm=JWT_ALGORITHM)


def decode_session_token(token: str, secret: str) -> SessionClaims | None:
    """Claims of a valid, unexpired admin session token, or None for anything else."""
    try:
        payload = jwt.decode(
            token,
            secret,
            algorithms=[JWT_ALGORITHM],
            options={"require": ["exp", "sub", "iat", "ver"]},
        )
    except jwt.PyJWTError:
        return None
    if payload.get("typ") != SESSION_TOKEN_TYPE:
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
