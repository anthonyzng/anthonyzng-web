"""`/admin/totp`: the admin's two-factor sign-in (status, setup, turning it on and off).

Turning it on or off needs the password again and a current code, is limited per admin (counted
on arrival), and revokes every other session; the caller's own session is re-issued, so the tab
that made the change stays signed in.
"""

from fastapi import APIRouter, Depends, Response

from app.api.deps import (
    CurrentAdminDep,
    RateLimiterDep,
    ServicesDep,
    SessionDep,
    SettingsDep,
    get_current_admin,
    require_trusted_origin,
)
from app.api.v1.auth import start_session
from app.core.errors import ApiError, RateLimitedError
from app.core.rate_limit import ADMIN_REAUTH_RULE
from app.models.admin_user import AdminUser
from app.schemas.auth import TotpConfirmRequest, TotpSetup, TotpStatus
from app.schemas.errors import ErrorResponse
from app.services import totp
from app.services.auth import password_check_slot, password_matches

router = APIRouter(
    prefix="/admin/totp",
    tags=["admin"],
    dependencies=[Depends(require_trusted_origin), Depends(get_current_admin)],
)
"""Every response carries `Cache-Control: no-store` (the security-headers middleware)."""

CONFIRM_RESPONSES: dict[int | str, dict[str, object]] = {
    400: {"model": ErrorResponse, "description": "Wrong password or authenticator code"},
    409: {"model": ErrorResponse, "description": "Already on / off, or no setup started"},
    429: {"model": ErrorResponse, "description": "Too many attempts"},
}


def status_of(admin: AdminUser) -> TotpStatus:
    return TotpStatus(enabled=admin.totp_secret is not None, enabled_at=admin.totp_enabled_at)


async def reauthenticate(
    admin: AdminUser, password: str, services: ServicesDep, limiter: RateLimiterDep
) -> str:
    """Checks the password again; answers the limiter key to clear once the change succeeded."""
    key = f"admin:reauth:{admin.id}"
    decision = limiter.hit(key, ADMIN_REAUTH_RULE)
    if not decision.allowed:
        raise RateLimitedError(decision.retry_after)
    async with password_check_slot(services.password_checks):
        matches = await password_matches(admin, password)
    if not matches:
        raise ApiError(400, "wrong_password", "The password is not correct.")
    return key


@router.get("", response_model=TotpStatus)
async def get_status(admin: CurrentAdminDep) -> TotpStatus:
    return status_of(admin)


@router.post("/setup", response_model=TotpSetup, responses={409: CONFIRM_RESPONSES[409]})
async def setup(admin: CurrentAdminDep, session: SessionDep, services: ServicesDep) -> TotpSetup:
    """A new secret to scan (replacing any unconfirmed one); nothing changes until `enable`."""
    secret, uri = await totp.start_setup(session, admin, services.totp_box)
    return TotpSetup(secret=secret, uri=uri)


@router.post("/enable", response_model=TotpStatus, responses=CONFIRM_RESPONSES)
async def enable(
    body: TotpConfirmRequest,
    response: Response,
    admin: CurrentAdminDep,
    session: SessionDep,
    settings: SettingsDep,
    services: ServicesDep,
    limiter: RateLimiterDep,
) -> TotpStatus:
    key = await reauthenticate(admin, body.password, services, limiter)
    admin = await totp.enable(session, admin, services.totp_box, body.code)
    limiter.clear(key)
    start_session(response, admin, settings)
    return status_of(admin)


@router.post("/disable", response_model=TotpStatus, responses=CONFIRM_RESPONSES)
async def disable(
    body: TotpConfirmRequest,
    response: Response,
    admin: CurrentAdminDep,
    session: SessionDep,
    settings: SettingsDep,
    services: ServicesDep,
    limiter: RateLimiterDep,
) -> TotpStatus:
    key = await reauthenticate(admin, body.password, services, limiter)
    admin = await totp.disable(session, admin, services.totp_box, body.code)
    limiter.clear(key)
    start_session(response, admin, settings)
    return status_of(admin)
