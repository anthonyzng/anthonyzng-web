from datetime import UTC, datetime, timedelta
from http.cookies import SimpleCookie

import jwt
from fastapi import Response

from app.core.security import (
    SESSION_COOKIE_NAME,
    SESSION_TTL,
    clear_session_cookie,
    create_session_token,
    decode_session_token,
    hash_password,
    make_dummy_password_hash,
    set_session_cookie,
    verify_password,
)

SECRET = "unit-test-secret-0123456789abcdef-0123456789abcdef"


def test_password_roundtrip() -> None:
    digest = hash_password("hunter2")
    assert digest.startswith("$argon2id$")
    assert verify_password(digest, "hunter2")
    assert not verify_password(digest, "hunter3")


def test_unreadable_hash_does_not_verify() -> None:
    assert not verify_password("not-a-hash", "hunter2")
    assert not verify_password("", "hunter2")


def test_dummy_hash_is_random_and_valid() -> None:
    first, second = make_dummy_password_hash(), make_dummy_password_hash()
    assert first != second
    assert not verify_password(first, "")


def test_session_token_roundtrip() -> None:
    now = datetime.now(UTC).replace(microsecond=0)
    token = create_session_token(
        user_id=7, email="admin@example.com", version=3, secret=SECRET, now=now
    )
    claims = decode_session_token(token, SECRET)
    assert claims is not None
    assert claims.user_id == 7
    assert claims.email == "admin@example.com"
    assert claims.version == 3
    assert claims.issued_at == now
    assert claims.expires_at == now + SESSION_TTL
    payload = jwt.decode(token, SECRET, algorithms=["HS256"])
    assert payload["typ"] == "admin_session"
    assert payload["sub"] == "7"
    assert payload["ver"] == 3


def test_wrong_secret_is_rejected() -> None:
    token = create_session_token(user_id=1, email="a@b.test", version=1, secret=SECRET)
    assert decode_session_token(token, "another-unit-test-secret-0123456789abcdef") is None


def test_expired_token_is_rejected() -> None:
    long_ago = datetime.now(UTC) - SESSION_TTL - timedelta(minutes=1)
    token = create_session_token(
        user_id=1, email="a@b.test", version=1, secret=SECRET, now=long_ago
    )
    assert decode_session_token(token, SECRET) is None


def test_other_token_types_are_rejected() -> None:
    now = int(datetime.now(UTC).timestamp())
    base = {"sub": "1", "email": "a@b.test", "ver": 1, "iat": now, "exp": now + 600}
    wrong_type = jwt.encode({**base, "typ": "refresh"}, SECRET, algorithm="HS256")
    assert decode_session_token(wrong_type, SECRET) is None
    no_exp = jwt.encode(
        {"sub": "1", "email": "a@b.test", "ver": 1, "typ": "admin_session", "iat": now},
        SECRET,
        algorithm="HS256",
    )
    assert decode_session_token(no_exp, SECRET) is None
    bad_sub = jwt.encode(
        {**base, "sub": "seven", "typ": "admin_session"}, SECRET, algorithm="HS256"
    )
    assert decode_session_token(bad_sub, SECRET) is None
    assert decode_session_token("garbage", SECRET) is None


def test_session_version_is_required_and_must_be_an_integer() -> None:
    now = int(datetime.now(UTC).timestamp())
    base = {"sub": "1", "email": "a@b.test", "typ": "admin_session", "iat": now, "exp": now + 600}
    # A token minted before session versions existed carries no `ver`: it no longer works.
    assert decode_session_token(jwt.encode(base, SECRET, algorithm="HS256"), SECRET) is None
    for bad in ("1", 1.0, True, None):
        token = jwt.encode({**base, "ver": bad}, SECRET, algorithm="HS256")
        assert decode_session_token(token, SECRET) is None, bad


def _cookie(response: Response) -> SimpleCookie:
    jar = SimpleCookie()
    jar.load(response.headers["set-cookie"])
    return jar


def test_set_session_cookie_attributes() -> None:
    response = Response()
    set_session_cookie(response, "tok", secure=False)
    morsel = _cookie(response)[SESSION_COOKIE_NAME]
    assert morsel.value == "tok"
    assert morsel["path"] == "/api"
    assert morsel["max-age"] == "43200"
    assert morsel["httponly"]
    assert morsel["samesite"].lower() == "lax"
    assert not morsel["secure"]
    assert not morsel["domain"]


def test_set_session_cookie_is_secure_in_production() -> None:
    response = Response()
    set_session_cookie(response, "tok", secure=True)
    assert _cookie(response)[SESSION_COOKIE_NAME]["secure"]


def test_clear_session_cookie() -> None:
    response = Response()
    clear_session_cookie(response, secure=False)
    morsel = _cookie(response)[SESSION_COOKIE_NAME]
    assert morsel.value == ""
    assert morsel["max-age"] == "0"
    assert morsel["path"] == "/api"
    assert morsel["httponly"]
    assert "1970" in morsel["expires"]
