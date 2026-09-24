"""FastAPI dependencies. Everything comes from the lifespan-created `AppServices`, except the
rate limiter, which is the module-level object in `app.core.rate_limit` (overridable in tests)."""

from collections.abc import AsyncIterator
from typing import Annotated, cast

from fastapi import Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.client_ip import client_ip
from app.core.config import Settings
from app.core.errors import ApiError
from app.core.rate_limit import SlidingWindowRateLimiter, rate_limiter
from app.core.security import SESSION_COOKIE_NAME, decode_session_token
from app.core.state import AppServices
from app.models.admin_user import AdminUser
from app.services.auth import get_admin_for_session
from app.services.email import EmailProvider
from app.services.turnstile import TurnstileVerifier


def get_services(request: Request) -> AppServices:
    services = getattr(request.app.state, "services", None)
    if services is None:
        raise RuntimeError("application services are not initialised (lifespan did not run)")
    return cast(AppServices, services)


ServicesDep = Annotated[AppServices, Depends(get_services)]


def get_settings(services: ServicesDep) -> Settings:
    return services.settings


SettingsDep = Annotated[Settings, Depends(get_settings)]


async def get_session(services: ServicesDep) -> AsyncIterator[AsyncSession]:
    async with services.session_factory() as session:
        yield session


SessionDep = Annotated[AsyncSession, Depends(get_session)]


def get_client_ip(request: Request, settings: SettingsDep) -> str:
    return client_ip(request, trusted_proxy=settings.TRUSTED_PROXY)


ClientIpDep = Annotated[str, Depends(get_client_ip)]


def get_rate_limiter() -> SlidingWindowRateLimiter:
    return rate_limiter


RateLimiterDep = Annotated[SlidingWindowRateLimiter, Depends(get_rate_limiter)]


def get_turnstile_verifier(services: ServicesDep) -> TurnstileVerifier:
    return services.turnstile_verifier


TurnstileDep = Annotated[TurnstileVerifier, Depends(get_turnstile_verifier)]


def get_email_provider(services: ServicesDep) -> EmailProvider:
    return services.email_provider


EmailProviderDep = Annotated[EmailProvider, Depends(get_email_provider)]


def _unauthorized() -> ApiError:
    return ApiError(401, "unauthorized", "Authentication required.")


async def get_current_admin(
    request: Request, session: SessionDep, settings: SettingsDep
) -> AdminUser:
    token = request.cookies.get(SESSION_COOKIE_NAME)
    if not token:
        raise _unauthorized()
    claims = decode_session_token(token, settings.JWT_SECRET.get_secret_value())
    if claims is None:
        raise _unauthorized()
    # None also when the session was revoked (password change, logout, removed account).
    user = await get_admin_for_session(session, claims)
    if user is None:
        raise _unauthorized()
    # End the lookup's transaction: an upload route then receives its body (megabytes, maybe on a
    # slow link) without holding a pooled connection idle in a transaction. The session keeps
    # `user` usable (`expire_on_commit=False`) and opens a new transaction on its next query.
    await session.commit()
    return user


CurrentAdminDep = Annotated[AdminUser, Depends(get_current_admin)]

SAFE_METHODS = frozenset({"GET", "HEAD", "OPTIONS"})


def require_trusted_origin(request: Request, settings: SettingsDep) -> None:
    """Refuse a state-changing request that a browser sent from a foreign origin.

    Defence in depth next to SameSite=Lax and JSON-only bodies: a browser always sends `Origin`
    on a cross-origin POST / PUT / PATCH / DELETE, so a foreign one is refused outright. A request
    without the header (curl, a server-side client) is left to the cookie check.
    """
    if request.method in SAFE_METHODS:
        return
    origin = request.headers.get("origin")
    if origin is not None and origin not in settings.CORS_ORIGINS:
        raise ApiError(403, "forbidden", "Cross-origin request refused.")
