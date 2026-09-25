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
from app.core.client_ip import UNKNOWN_IP, rate_limit_subject
from app.core.config import Settings
from app.core.errors import ApiError, RateLimitedError
from app.core.rate_limit import (
    LOGIN_EMAIL_IP_RULE,
    LOGIN_EMAIL_RULE,
    LOGIN_IP_RULE,
    LOGIN_TOTP_DAILY_RULE,
    LOGIN_TOTP_RULE,
    RateLimitRule,
)
from app.core.security import (
    SESSION_COOKIE_NAME,
    TOTP_PENDING_COOKIE_NAME,
    clear_session_cookie,
    clear_totp_pending_cookie,
    create_session_token,
    create_totp_pending_token,
    decode_session_token,
    decode_totp_pending_token,
    set_session_cookie,
    set_totp_pending_cookie,
)
from app.models.admin_user import AdminUser
from app.schemas.auth import AdminInfo, LoginRequest, LoginResult, LoginTotpRequest
from app.schemas.errors import ErrorResponse
from app.services.auth import (
    authenticate_admin,
    get_admin_for_session,
    normalize_email,
    password_check_slot,
    revoke_sessions,
)
from app.services.totp import invalid_code, verify_sign_in_code
from app.services.turnstile import TurnstileUnavailableError

router = APIRouter(prefix="/auth", tags=["auth"], dependencies=[Depends(require_trusted_origin)])
"""Every response here carries `Cache-Control: no-store` (the security-headers middleware)."""


def email_limit_keys(email: str, client_ip: str) -> tuple[tuple[str, RateLimitRule], ...]:
    return (
        (f"login:email-ip:{email}:{rate_limit_subject(client_ip)}", LOGIN_EMAIL_IP_RULE),
        (f"login:email:{email}", LOGIN_EMAIL_RULE),
    )


def totp_limit_keys(admin_id: int) -> tuple[tuple[str, RateLimitRule], ...]:
    return (
        (f"login:totp:{admin_id}", LOGIN_TOTP_RULE),
        (f"login:totp-day:{admin_id}", LOGIN_TOTP_DAILY_RULE),
    )


def start_session(response: Response, user: AdminUser, settings: Settings) -> None:
    """Sets the session cookie for `user`'s current `session_version`."""
    token = create_session_token(
        user_id=user.id,
        email=user.email,
        version=user.session_version,
        secret=settings.JWT_SECRET.get_secret_value(),
    )
    set_session_cookie(response, token, secure=settings.is_production)


async def enforce_login_ip_rate_limit(client_ip: ClientIpDep, limiter: RateLimiterDep) -> None:
    """Every attempt counts, on arrival."""
    decision = limiter.hit(f"login:ip:{rate_limit_subject(client_ip)}", LOGIN_IP_RULE)
    if not decision.allowed:
        raise RateLimitedError(decision.retry_after)


@router.post(
    "/login",
    response_model=LoginResult,
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
) -> LoginResult:
    """IP limit (a dependency, which also bounds the calls to Cloudflare), then Turnstile, then the
    email limits, then at most PASSWORD_CHECK_CONCURRENCY password checks at a time.

    With two-factor sign-in on, a right password starts no session: it sets the short-lived
    `admin_totp_pending` cookie and answers `totpRequired: true`, and `POST /auth/login/totp`
    finishes the sign-in with an authenticator code (the email counters are cleared only then).

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
    email_keys = email_limit_keys(email, client_ip)
    for key, rule in email_keys:
        decision = limiter.hit(key, rule)
        if not decision.allowed:
            raise RateLimitedError(decision.retry_after)

    async with password_check_slot(services.password_checks):
        user = await authenticate_admin(
            session, email, body.password, dummy_hash=services.dummy_password_hash
        )
    if user is None:
        raise ApiError(401, "invalid_credentials", "Invalid email or password.")

    if user.totp_secret is not None:
        pending = create_totp_pending_token(
            user_id=user.id,
            email=user.email,
            version=user.session_version,
            secret=settings.JWT_SECRET.get_secret_value(),
        )
        set_totp_pending_cookie(response, pending, secure=settings.is_production)
        return LoginResult(email=user.email, totp_required=True)

    for key, _rule in email_keys:
        limiter.clear(key)
    start_session(response, user, settings)
    return LoginResult(email=user.email, totp_required=False)


@router.post(
    "/login/totp",
    response_model=LoginResult,
    dependencies=[Depends(enforce_login_ip_rate_limit)],
    responses={
        400: {"model": ErrorResponse, "description": "The authenticator code is not valid"},
        401: {"model": ErrorResponse, "description": "No pending sign-in (expired or revoked)"},
        429: {"model": ErrorResponse, "description": "Too many codes tried"},
        503: {"model": ErrorResponse, "description": "The stored secret cannot be decrypted"},
    },
)
async def login_totp(
    body: LoginTotpRequest,
    request: Request,
    response: Response,
    session: SessionDep,
    settings: SettingsDep,
    services: ServicesDep,
    limiter: RateLimiterDep,
    client_ip: ClientIpDep,
) -> LoginResult:
    """The second step: the `admin_totp_pending` cookie from `POST /auth/login` (5 minutes) plus
    a current authenticator code, which can be used once. Codes are limited per admin (counted on
    arrival) on top of the IP limit; success clears them and the email counters."""
    token = request.cookies.get(TOTP_PENDING_COOKIE_NAME)
    secret = settings.JWT_SECRET.get_secret_value()
    claims = decode_totp_pending_token(token, secret) if token else None
    user = await get_admin_for_session(session, claims) if claims is not None else None
    if user is None or user.totp_secret is None:
        raise ApiError(401, "unauthorized", "The sign-in has expired. Please start again.")

    totp_keys = totp_limit_keys(user.id)
    for key, rule in totp_keys:
        decision = limiter.hit(key, rule)
        if not decision.allowed:
            raise RateLimitedError(decision.retry_after)
    if not await verify_sign_in_code(session, user, services.totp_box, body.code):
        raise invalid_code()

    for key, _rule in (*totp_keys, *email_limit_keys(normalize_email(user.email), client_ip)):
        limiter.clear(key)
    clear_totp_pending_cookie(response, secure=settings.is_production)
    start_session(response, user, settings)
    return LoginResult(email=user.email, totp_required=False)


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
    clear_totp_pending_cookie(response, secure=settings.is_production)
    return response


@router.get(
    "/me",
    response_model=AdminInfo,
    responses={401: {"model": ErrorResponse, "description": "No valid session cookie"}},
)
async def me(admin: CurrentAdminDep) -> AdminInfo:
    return AdminInfo(email=admin.email)
