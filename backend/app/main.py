"""FastAPI application factory and the ASGI entry point (`uvicorn app.main:app`)."""

import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import cast

import httpx
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.exc import ProgrammingError

from app.api.v1 import API_V1_PREFIX
from app.api.v1 import router as v1_router
from app.core.config import Settings, get_settings
from app.core.db import create_engine, create_session_factory
from app.core.errors import register_exception_handlers
from app.core.log_config import configure_logging
from app.core.middleware import RequestBodyLimitMiddleware, SecurityHeadersMiddleware
from app.core.security import make_dummy_password_hash
from app.core.state import AppServices
from app.services.auth import ensure_admin_user
from app.services.email import build_email_provider
from app.services.turnstile import CloudflareTurnstileVerifier

logger = logging.getLogger(__name__)

APP_TITLE = "anthonyzng-web API"
APP_VERSION = "0.1.0"
HTTP_USER_AGENT = f"anthonyzng-web-backend/{APP_VERSION}"


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    """Create the engine and HTTP client, upsert the admin, expose everything as `AppServices`.

    Migrations are not applied here: run `alembic upgrade head` explicitly.
    """
    settings = cast(Settings, app.state.settings)
    engine = create_engine(settings.DATABASE_URL.get_secret_value())
    session_factory = create_session_factory(engine)
    http_client = httpx.AsyncClient(headers={"User-Agent": HTTP_USER_AGENT})
    try:
        try:
            async with session_factory() as session:
                await ensure_admin_user(session, settings)
        except ProgrammingError as exc:
            raise RuntimeError(
                "database schema is missing or outdated; run `alembic upgrade head`"
            ) from exc
        app.state.services = AppServices(
            settings=settings,
            engine=engine,
            session_factory=session_factory,
            http_client=http_client,
            dummy_password_hash=make_dummy_password_hash(),
            turnstile_verifier=CloudflareTurnstileVerifier(
                settings.TURNSTILE_SECRET_KEY.get_secret_value(), http_client
            ),
            email_provider=build_email_provider(settings, http_client),
        )
        logger.info("Backend ready (env=%s, email=%s)", settings.APP_ENV, settings.EMAIL_PROVIDER)
        yield
    finally:
        await http_client.aclose()
        await engine.dispose()


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or get_settings()
    configure_logging()
    # The interactive docs (and the schema they load) are a development aid: production does not
    # publish a map of the API, including the admin routes, from under the admin cookie's path.
    expose_docs = not settings.is_production
    app = FastAPI(
        title=APP_TITLE,
        version=APP_VERSION,
        lifespan=lifespan,
        docs_url=f"{API_V1_PREFIX}/docs" if expose_docs else None,
        openapi_url=f"{API_V1_PREFIX}/openapi.json" if expose_docs else None,
        redoc_url=None,
        redirect_slashes=False,
    )
    app.state.settings = settings
    # Middleware added first sits innermost, so the body limit's 413 still gets CORS and the
    # security headers.
    app.add_middleware(RequestBodyLimitMiddleware)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.CORS_ORIGINS,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
        expose_headers=["ETag", "Retry-After"],
        max_age=600,
    )
    app.add_middleware(SecurityHeadersMiddleware)
    register_exception_handlers(app)
    app.include_router(v1_router)
    return app


app = create_app()
