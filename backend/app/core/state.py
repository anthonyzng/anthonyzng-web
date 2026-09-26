"""Typed container for the objects the lifespan creates and request handlers need."""

import asyncio
from dataclasses import dataclass

import httpx
from sqlalchemy.ext.asyncio import AsyncEngine

from app.core.config import Settings
from app.core.db import SessionFactory
from app.core.totp import SecretBox
from app.services.content import ContentCache
from app.services.email import EmailProvider
from app.services.turnstile import TurnstileVerifier


@dataclass(slots=True)
class AppServices:
    settings: Settings
    engine: AsyncEngine
    session_factory: SessionFactory
    http_client: httpx.AsyncClient
    dummy_password_hash: str
    turnstile_verifier: TurnstileVerifier
    email_provider: EmailProvider
    password_checks: asyncio.Semaphore
    """At most PASSWORD_CHECK_CONCURRENCY Argon2 checks at a time (each takes 19 MiB of memory)."""
    content_cache: ContentCache
    totp_box: SecretBox
    """Encrypts and decrypts the admin's TOTP secret (TOTP_ENCRYPTION_KEY)."""
