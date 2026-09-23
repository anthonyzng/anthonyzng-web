"""Application settings, read from environment variables (and `backend/.env` when present).

Field names match the environment variable names one to one so the mapping is obvious when
reading `.env.example`. Secrets are `SecretStr` so they never appear in reprs or logs.
"""

from functools import lru_cache
from pathlib import Path
from typing import Annotated, Literal

from pydantic import EmailStr, Field, SecretStr, field_validator, model_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parents[2]

AppEnv = Literal["development", "test", "production"]
EmailProviderName = Literal["console", "resend"]

PLACEHOLDER_MARKER = "change-me"
"""Every placeholder secret in `.env.example` contains this; production refuses to start on one."""
TURNSTILE_TEST_SECRETS = frozenset(
    {
        "1x0000000000000000000000000000000AA",
        "2x0000000000000000000000000000000AA",
        "3x0000000000000000000000000000000AA",
    }
)
"""Cloudflare's public dummy secrets (always pass / always fail / token spent): development only."""
PRODUCTION_MIN_ADMIN_PASSWORD_LENGTH = 12


class Settings(BaseSettings):
    """Configuration for one backend process."""

    model_config = SettingsConfigDict(
        env_file=BACKEND_DIR / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
        # A failed start prints the ValidationError: never let it echo secrets from the input.
        hide_input_in_errors=True,
    )

    APP_ENV: AppEnv = "development"

    # SQLAlchemy async URLs (postgresql+asyncpg://...). TEST_DATABASE_URL is only used by pytest.
    DATABASE_URL: SecretStr
    TEST_DATABASE_URL: SecretStr | None = None

    # Signs the admin session JWT (HS256 wants at least 32 bytes, RFC 7518 section 3.2).
    JWT_SECRET: Annotated[SecretStr, Field(min_length=32)]

    # HMAC key for contact-message IP hashes: raw visitor IPs are never stored, emailed or logged.
    IP_HASH_SECRET: Annotated[SecretStr, Field(min_length=32)]

    # The single admin account, upserted at startup.
    ADMIN_EMAIL: EmailStr
    ADMIN_PASSWORD: Annotated[SecretStr, Field(min_length=1)]

    # Contact form delivery.
    CONTACT_TO_EMAIL: EmailStr
    EMAIL_FROM: EmailStr = "noreply@owwsolution.com"
    EMAIL_PROVIDER: EmailProviderName = "console"
    RESEND_API_KEY: SecretStr = SecretStr("")

    # Cloudflare Turnstile server-side secret.
    TURNSTILE_SECRET_KEY: Annotated[SecretStr, Field(min_length=1)]

    # Comma-separated list of exact browser origins allowed to call the API.
    CORS_ORIGINS: Annotated[list[str], NoDecode] = []

    # Trust the rightmost X-Forwarded-For entry (set by Caddy) as the client IP.
    TRUSTED_PROXY: bool = False

    @field_validator("CORS_ORIGINS", mode="before")
    @classmethod
    def _split_origins(cls, value: object) -> list[str]:
        if isinstance(value, str):
            items = [item.strip() for item in value.split(",")]
        elif isinstance(value, list):
            items = [str(item).strip() for item in value]
        else:
            raise TypeError("CORS_ORIGINS must be a comma-separated string")
        origins = [item for item in items if item]
        if "*" in origins:
            raise ValueError("CORS_ORIGINS must list exact origins; '*' is not allowed")
        return origins

    @field_validator("ADMIN_EMAIL", mode="after")
    @classmethod
    def _normalize_admin_email(cls, value: str) -> str:
        return value.strip().lower()

    @model_validator(mode="after")
    def _require_resend_key(self) -> "Settings":
        if self.EMAIL_PROVIDER == "resend" and not self.RESEND_API_KEY.get_secret_value():
            raise ValueError("RESEND_API_KEY is required when EMAIL_PROVIDER=resend")
        return self

    @model_validator(mode="after")
    def _refuse_unsafe_production(self) -> "Settings":
        """Production must not start on development values. Every problem is named; no value
        is shown."""
        if not self.is_production:
            return self
        problems: list[str] = []
        configured = {
            "JWT_SECRET": self.JWT_SECRET,
            "IP_HASH_SECRET": self.IP_HASH_SECRET,
            "ADMIN_PASSWORD": self.ADMIN_PASSWORD,
        }
        for name, secret in configured.items():
            if PLACEHOLDER_MARKER in secret.get_secret_value().lower():
                problems.append(f"{name} is still the .env.example placeholder")
        if len(self.ADMIN_PASSWORD.get_secret_value()) < PRODUCTION_MIN_ADMIN_PASSWORD_LENGTH:
            problems.append(
                f"ADMIN_PASSWORD must be at least {PRODUCTION_MIN_ADMIN_PASSWORD_LENGTH} characters"
            )
        if self.JWT_SECRET.get_secret_value() == self.IP_HASH_SECRET.get_secret_value():
            problems.append("JWT_SECRET and IP_HASH_SECRET must be different values")
        if self.TURNSTILE_SECRET_KEY.get_secret_value() in TURNSTILE_TEST_SECRETS:
            problems.append("TURNSTILE_SECRET_KEY is a Cloudflare test secret")
        if self.EMAIL_PROVIDER != "resend":
            problems.append("EMAIL_PROVIDER must be 'resend' (console only logs messages)")
        if not self.CORS_ORIGINS:
            problems.append("CORS_ORIGINS must list the site's origin")
        if problems:
            raise ValueError("unsafe production configuration: " + "; ".join(problems))
        return self

    @property
    def is_production(self) -> bool:
        return self.APP_ENV == "production"


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Process-wide settings, loaded once."""
    return Settings()
