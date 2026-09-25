from fastapi import APIRouter, Depends, Request

from app.api.deps import (
    ClientIpDep,
    EmailProviderDep,
    RateLimiterDep,
    SessionDep,
    SettingsDep,
    TurnstileDep,
)
from app.core.client_ip import rate_limit_subject
from app.core.errors import ApiError, RateLimitedError
from app.core.rate_limit import CONTACT_IP_RULE
from app.schemas.contact import ContactAccepted, ContactRequest
from app.schemas.errors import ErrorResponse
from app.services.contact import ContactStorageError, TurnstileRejectedError, submit_contact
from app.services.turnstile import TurnstileUnavailableError

router = APIRouter(tags=["contact"])


async def enforce_contact_rate_limit(client_ip: ClientIpDep, limiter: RateLimiterDep) -> None:
    """Counted on arrival, before the body is validated (dependencies run first)."""
    decision = limiter.hit(f"contact:ip:{rate_limit_subject(client_ip)}", CONTACT_IP_RULE)
    if not decision.allowed:
        raise RateLimitedError(decision.retry_after)


@router.post(
    "/contact",
    status_code=202,
    response_model=ContactAccepted,
    dependencies=[Depends(enforce_contact_rate_limit)],
    responses={
        400: {"model": ErrorResponse, "description": "Turnstile rejected the token"},
        429: {"model": ErrorResponse, "description": "Too many submissions from this IP"},
        503: {"model": ErrorResponse, "description": "Turnstile unreachable"},
    },
)
async def post_contact(
    submission: ContactRequest,
    request: Request,
    session: SessionDep,
    settings: SettingsDep,
    client_ip: ClientIpDep,
    verifier: TurnstileDep,
    provider: EmailProviderDep,
) -> ContactAccepted:
    try:
        await submit_contact(
            session,
            submission,
            settings=settings,
            client_ip=client_ip,
            user_agent=request.headers.get("user-agent"),
            verifier=verifier,
            provider=provider,
        )
    except TurnstileRejectedError as exc:
        raise ApiError(400, "turnstile_failed", "Verification failed. Please try again.") from exc
    except TurnstileUnavailableError as exc:
        raise ApiError(503, "service_unavailable", "Verification service unavailable.") from exc
    except ContactStorageError as exc:
        raise ApiError(500, "internal_error", "Unexpected error.") from exc
    return ContactAccepted()
