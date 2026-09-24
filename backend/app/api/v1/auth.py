from fastapi import APIRouter, Depends, Request, Response

from app.api.deps import (
    ClientIpDep,
    CurrentAdminDep,
    RateLimiterDep,
    ServicesDep,
    SessionDep,
    SettingsDep,
    require_trusted_origin,
)
from app.core.errors import ApiError, RateLimitedError
from app.core.rate_limit import LOGIN_EMAIL_RULE, LOGIN_IP_RULE
from app.core.security import (
    SESSION_COOKIE_NAME,
    clear_session_cookie,
    create_session_token,
    decode_session_token,
    set_session_cookie,
)
from app.schemas.auth import AdminInfo, LoginRequest
from app.schemas.errors import ErrorResponse
from app.services.auth import (
    authenticate_admin,
    get_admin_for_session,
    normalize_email,
    revoke_sessions,
)

router = APIRouter(prefix="/auth", tags=["auth"], dependencies=[Depends(require_trusted_origin)])
"""Every response here carries `Cache-Control: no-store` (the security-headers middleware)."""


async def enforce_login_ip_rate_limit(client_ip: ClientIpDep, limiter: RateLimiterDep) -> None:
    """Every attempt counts, on arrival."""
    decision = limiter.hit(f"login:ip:{client_ip}", LOGIN_IP_RULE)
    if not decision.allowed:
        raise RateLimitedError(decision.retry_after)


@router.post(
    "/login",
    response_model=AdminInfo,
    dependencies=[Depends(enforce_login_ip_rate_limit)],
    responses={
        401: {"model": ErrorResponse, "description": "Unknown email or wrong password"},
        429: {"model": ErrorResponse, "description": "Too many attempts"},
    },
)
async def login(
    body: LoginRequest,
    response: Response,
    session: SessionDep,
    settings: SettingsDep,
    services: ServicesDep,
    limiter: RateLimiterDep,
) -> AdminInfo:
    email = normalize_email(body.email)
    email_key = f"login:email:{email}"
    decision = limiter.check(email_key, LOGIN_EMAIL_RULE)
    if not decision.allowed:
        raise RateLimitedError(decision.retry_after)

    user = await authenticate_admin(
        session, email, body.password, dummy_hash=services.dummy_password_hash
    )
    if user is None:
        limiter.record(email_key, LOGIN_EMAIL_RULE)
        raise ApiError(401, "invalid_credentials", "Invalid email or password.")
    limiter.clear(email_key)

    token = create_session_token(
        user_id=user.id,
        email=user.email,
        version=user.session_version,
        secret=settings.JWT_SECRET.get_secret_value(),
    )
    set_session_cookie(response, token, secure=settings.is_production)
    return AdminInfo(email=user.email)


@router.post("/logout", status_code=204, response_class=Response)
async def logout(request: Request, session: SessionDep, settings: SettingsDep) -> Response:
    """Idempotent: always clears the cookie. A still-valid session is also revoked server-side, so
    a copy of the token (another tab, another device, a leaked cookie) stops working as well."""
    token = request.cookies.get(SESSION_COOKIE_NAME)
    claims = decode_session_token(token, settings.JWT_SECRET.get_secret_value()) if token else None
    if claims is not None:
        user = await get_admin_for_session(session, claims)
        if user is not None:
            await revoke_sessions(session, user)
    response = Response(status_code=204)
    clear_session_cookie(response, secure=settings.is_production)
    return response


@router.get(
    "/me",
    response_model=AdminInfo,
    responses={401: {"model": ErrorResponse, "description": "No valid session cookie"}},
)
async def me(admin: CurrentAdminDep) -> AdminInfo:
    return AdminInfo(email=admin.email)
