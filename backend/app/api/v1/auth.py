import asyncio

from fastapi import APIRouter, Depends, Request, Response

from app.api.deps import (
    ClientIpDep,
    CurrentAdminDep,
    RateLimiterDep,
    ServicesDep,
    SessionDep,
    SettingsDep,
    TurnstileDep,
    require_trusted_origin,
)
from app.core.client_ip import UNKNOWN_IP
from app.core.errors import ApiError, RateLimitedError
from app.core.rate_limit import LOGIN_EMAIL_IP_RULE, LOGIN_EMAIL_RULE, LOGIN_IP_RULE
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
    PASSWORD_CHECK_WAIT_SECONDS,
    authenticate_admin,
    get_admin_for_session,
    normalize_email,
    revoke_sessions,
)
from app.services.turnstile import TurnstileUnavailableError

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
        400: {"model": ErrorResponse, "description": "Turnstile rejected the token"},
        401: {"model": ErrorResponse, "description": "Unknown email or wrong password"},
        429: {"model": ErrorResponse, "description": "Too many attempts, or the server is busy"},
        503: {"model": ErrorResponse, "description": "Turnstile unreachable"},
    },
)
async def login(
    body: LoginRequest,
    response: Response,
    session: SessionDep,
    settings: SettingsDep,
    services: ServicesDep,
    limiter: RateLimiterDep,
    client_ip: ClientIpDep,
    verifier: TurnstileDep,
) -> AdminInfo:
    """IP limit (a dependency, which also bounds the calls to Cloudflare), then Turnstile, then the
    email limits, then at most PASSWORD_CHECK_CONCURRENCY password checks at a time.

    Turnstile comes before the email limits: the admin email is public, and an attempt without a
    solved challenge must not count toward its lockout. Every limit is a single check-and-record
    (`hit`) before the slow password check, so a parallel burst cannot slip past a check made
    before its failure is recorded; a successful login clears the email counters."""
    remote_ip = None if client_ip == UNKNOWN_IP else client_ip
    try:
        human = await verifier.verify(body.turnstile_token, remote_ip)
    except TurnstileUnavailableError as exc:
        raise ApiError(503, "service_unavailable", "Verification service unavailable.") from exc
    if not human:
        raise ApiError(400, "turnstile_failed", "Verification failed. Please try again.")

    email = normalize_email(body.email)
    email_keys = (
        (f"login:email-ip:{email}:{client_ip}", LOGIN_EMAIL_IP_RULE),
        (f"login:email:{email}", LOGIN_EMAIL_RULE),
    )
    for key, rule in email_keys:
        decision = limiter.hit(key, rule)
        if not decision.allowed:
            raise RateLimitedError(decision.retry_after)

    try:
        async with asyncio.timeout(PASSWORD_CHECK_WAIT_SECONDS):
            await services.password_checks.acquire()
    except TimeoutError:
        raise RateLimitedError(PASSWORD_CHECK_WAIT_SECONDS) from None
    try:
        user = await authenticate_admin(
            session, email, body.password, dummy_hash=services.dummy_password_hash
        )
    finally:
        services.password_checks.release()
    if user is None:
        raise ApiError(401, "invalid_credentials", "Invalid email or password.")
    for key, _rule in email_keys:
        limiter.clear(key)

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
