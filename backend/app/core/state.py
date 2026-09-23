"""Typed container for the objects the lifespan creates and request handlers need."""

from dataclasses import dataclass

import httpx
from sqlalchemy.ext.asyncio import AsyncEngine

from app.core.config import Settings
from app.core.db import SessionFactory
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
