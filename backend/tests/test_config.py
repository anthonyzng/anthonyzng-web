from typing import Any

import pytest
from pydantic import SecretStr, ValidationError

from app.core.config import Settings


@pytest.fixture(autouse=True)
def no_settings_in_environment(monkeypatch: pytest.MonkeyPatch) -> None:
    """These tests check defaults and parsing: no setting may come from the process environment
    (CI exports TEST_DATABASE_URL; a developer may export others). `.env` is off via `_env_file`."""
    for name in Settings.model_fields:
        monkeypatch.delenv(name, raising=False)


def base_values(**overrides: Any) -> dict[str, Any]:
    values: dict[str, Any] = {
        "_env_file": None,
        "DATABASE_URL": "postgresql+asyncpg://u:p@127.0.0.1:5432/db",
        "JWT_SECRET": "0123456789abcdef0123456789abcdef",
        "IP_HASH_SECRET": "fedcba9876543210fedcba9876543210",
        "TOTP_ENCRYPTION_KEY": "totp-key-0123456789abcdef-0123456789",
        "ADMIN_EMAIL": " Admin@Example.COM ",
        "ADMIN_PASSWORD": "secret",
        "CONTACT_TO_EMAIL": "inbox@example.com",
        "TURNSTILE_SECRET_KEY": "turnstile",
        "CORS_ORIGINS": "http://a.test, http://b.test,,",
    }
    values.update(overrides)
    return values


def test_defaults_and_parsing() -> None:
    settings = Settings(**base_values())
    assert settings.APP_ENV == "development"
    assert settings.CORS_ORIGINS == ["http://a.test", "http://b.test"]
    assert settings.ADMIN_EMAIL == "admin@example.com"
    assert settings.EMAIL_PROVIDER == "console"
    assert settings.EMAIL_FROM == "noreply@owwsolution.com"
    assert settings.TRUSTED_PROXY is False
    assert settings.TEST_DATABASE_URL is None
    assert not settings.is_production
    assert isinstance(settings.JWT_SECRET, SecretStr)
    assert "secret" not in repr(settings)


def test_cors_origins_list_input() -> None:
    settings = Settings(**base_values(CORS_ORIGINS=["http://a.test", " http://b.test "]))
    assert settings.CORS_ORIGINS == ["http://a.test", "http://b.test"]


def test_cors_wildcard_is_rejected() -> None:
    with pytest.raises(ValidationError, match="exact origins"):
        Settings(**base_values(CORS_ORIGINS="*"))


def test_resend_requires_api_key() -> None:
    with pytest.raises(ValidationError, match="RESEND_API_KEY"):
        Settings(**base_values(EMAIL_PROVIDER="resend"))
    settings = Settings(**base_values(EMAIL_PROVIDER="resend", RESEND_API_KEY="re_123"))
    assert settings.RESEND_API_KEY.get_secret_value() == "re_123"


def test_short_jwt_secret_is_rejected() -> None:
    with pytest.raises(ValidationError, match="JWT_SECRET"):
        Settings(**base_values(JWT_SECRET="short"))


def test_short_ip_hash_secret_is_rejected() -> None:
    with pytest.raises(ValidationError, match="IP_HASH_SECRET"):
        Settings(**base_values(IP_HASH_SECRET="short"))
    values = base_values()
    del values["IP_HASH_SECRET"]
    with pytest.raises(ValidationError, match="IP_HASH_SECRET"):
        Settings(**values)


def production_values(**overrides: Any) -> dict[str, Any]:
    """A configuration production accepts: real-looking secrets, Resend, a real Turnstile key."""
    values = base_values(
        APP_ENV="production",
        ADMIN_PASSWORD="a-long-admin-password",
        TURNSTILE_SECRET_KEY="0x4AAAAAAAreal-looking-secret",
        EMAIL_PROVIDER="resend",
        RESEND_API_KEY="re_123",
        CORS_ORIGINS="https://owwsolution.com",
    )
    values.update(overrides)
    return values


def test_production_flag() -> None:
    assert Settings(**production_values()).is_production


@pytest.mark.parametrize(
    ("overrides", "problem"),
    [
        ({"JWT_SECRET": "change-me-change-me-change-me-change-me"}, "JWT_SECRET is still"),
        ({"IP_HASH_SECRET": "CHANGE-ME-change-me-change-me-change-me"}, "IP_HASH_SECRET is still"),
        ({"ADMIN_PASSWORD": "change-me"}, "ADMIN_PASSWORD is still"),
        ({"ADMIN_PASSWORD": "short-pass1"}, "at least 12 characters"),
        ({"IP_HASH_SECRET": "0123456789abcdef0123456789abcdef"}, "must be different"),
        ({"TOTP_ENCRYPTION_KEY": "0123456789abcdef0123456789abcdef"}, "must be different"),
        (
            {"TOTP_ENCRYPTION_KEY": "change-me-change-me-change-me-change-me"},
            "TOTP_ENCRYPTION_KEY is still",
        ),
        ({"TURNSTILE_SECRET_KEY": "1x0000000000000000000000000000000AA"}, "Cloudflare test"),
        ({"TURNSTILE_SECRET_KEY": "2x0000000000000000000000000000000AA"}, "Cloudflare test"),
        ({"EMAIL_PROVIDER": "console"}, "EMAIL_PROVIDER must be 'resend'"),
        ({"CORS_ORIGINS": ""}, "CORS_ORIGINS must list"),
    ],
)
def test_production_refuses_development_values(overrides: dict[str, Any], problem: str) -> None:
    with pytest.raises(ValidationError, match="unsafe production configuration") as raised:
        Settings(**production_values(**overrides))
    assert problem in str(raised.value)


def test_production_names_every_problem_without_showing_values() -> None:
    with pytest.raises(ValidationError) as raised:
        Settings(
            **production_values(
                JWT_SECRET="change-me-change-me-change-me-change-me",
                TURNSTILE_SECRET_KEY="1x0000000000000000000000000000000AA",
                EMAIL_PROVIDER="console",
            )
        )
    message = str(raised.value)
    assert "JWT_SECRET" in message
    assert "TURNSTILE_SECRET_KEY" in message
    assert "EMAIL_PROVIDER" in message
    # A failed start prints this error: it must not echo the configured values back.
    assert "1x0000000000000000000000000000000AA" not in message
    assert "change-me-change-me" not in message
    assert "re_123" not in message


def test_field_errors_do_not_echo_secret_input() -> None:
    with pytest.raises(ValidationError) as raised:
        Settings(**base_values(JWT_SECRET="too-short-but-secret"))
    assert "too-short-but-secret" not in str(raised.value)


def test_development_accepts_the_example_values() -> None:
    settings = Settings(
        **base_values(
            JWT_SECRET="change-me-change-me-change-me-change-me",
            IP_HASH_SECRET="change-me-change-me-change-me-change-me",
            ADMIN_PASSWORD="change-me",
            TURNSTILE_SECRET_KEY="1x0000000000000000000000000000000AA",
        )
    )
    assert not settings.is_production


def test_invalid_admin_email_is_rejected() -> None:
    with pytest.raises(ValidationError, match="ADMIN_EMAIL"):
        Settings(**base_values(ADMIN_EMAIL="not-an-email"))
