"""The admin's second factor: setting it up, turning it on and off, and checking a sign-in code.

Every change of state happens on the admin row locked `FOR UPDATE`, so two requests carrying the
same code cannot both be accepted, and turning two-factor sign-in on or off bumps
`session_version`, which revokes every other session (the caller re-issues its own cookie).
"""

import logging
from datetime import UTC, datetime

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ApiError
from app.core.totp import SecretBox, SecretDecryptionError, match_code, new_secret
from app.core.totp import provisioning_uri as totp_uri
from app.models.admin_user import AdminUser

logger = logging.getLogger(__name__)


def invalid_code() -> ApiError:
    return ApiError(400, "totp_invalid", "The authenticator code is not valid.")


async def _locked(session: AsyncSession, user: AdminUser) -> AdminUser:
    locked = await session.get(AdminUser, user.id, with_for_update=True, populate_existing=True)
    if locked is None:  # pragma: no cover - the session dependency just loaded the row
        raise ApiError(401, "unauthorized", "Not signed in.")
    return locked


def _decrypt(box: SecretBox, blob: bytes, admin_id: int) -> str:
    try:
        return box.decrypt(blob, admin_id=admin_id)
    except SecretDecryptionError:
        logger.exception(
            "The admin's TOTP secret does not decrypt (TOTP_ENCRYPTION_KEY changed?); "
            "reset it with `python -m app.admin_totp reset`"
        )
        raise ApiError(
            503, "service_unavailable", "Two-factor sign-in is unavailable on this server."
        ) from None


async def start_setup(session: AsyncSession, user: AdminUser, box: SecretBox) -> tuple[str, str]:
    """A new pending secret (replacing any earlier one): its text and its `otpauth://` URI."""
    user = await _locked(session, user)
    if user.totp_secret is not None:
        raise ApiError(409, "conflict", "Two-factor sign-in is already on.")
    secret = new_secret()
    user.totp_pending_secret = box.encrypt(secret, admin_id=user.id)
    await session.commit()
    return secret, totp_uri(secret, user.email)


async def enable(session: AsyncSession, user: AdminUser, box: SecretBox, code: str) -> AdminUser:
    """Turns two-factor sign-in on once `code` matches the pending secret (the password was
    checked by the caller). Revokes every session."""
    user = await _locked(session, user)
    if user.totp_secret is not None:
        raise ApiError(409, "conflict", "Two-factor sign-in is already on.")
    if user.totp_pending_secret is None:
        raise ApiError(409, "conflict", "Start the setup first.")
    counter = match_code(_decrypt(box, user.totp_pending_secret, user.id), code, last_counter=None)
    if counter is None:
        raise invalid_code()
    user.totp_secret = user.totp_pending_secret
    user.totp_pending_secret = None
    user.totp_enabled_at = datetime.now(UTC)
    user.totp_last_counter = counter
    user.session_version += 1
    await session.commit()
    logger.info("Two-factor sign-in turned on for the admin; other sessions revoked")
    return user


async def disable(session: AsyncSession, user: AdminUser, box: SecretBox, code: str) -> AdminUser:
    """Turns two-factor sign-in off with a current code (the password was checked by the
    caller). Revokes every session."""
    user = await _locked(session, user)
    if user.totp_secret is None:
        raise ApiError(409, "conflict", "Two-factor sign-in is already off.")
    if (
        match_code(
            _decrypt(box, user.totp_secret, user.id), code, last_counter=user.totp_last_counter
        )
        is None
    ):
        raise invalid_code()
    clear(user)
    await session.commit()
    logger.info("Two-factor sign-in turned off for the admin; other sessions revoked")
    return user


def clear(user: AdminUser) -> None:
    """Forgets every second-factor secret and revokes the sessions (the caller commits)."""
    user.totp_secret = None
    user.totp_enabled_at = None
    user.totp_last_counter = None
    user.totp_pending_secret = None
    user.session_version += 1


async def verify_sign_in_code(
    session: AsyncSession, user: AdminUser, box: SecretBox, code: str
) -> bool:
    """True, and the code's step recorded as used, when `code` is valid for this sign-in."""
    user = await _locked(session, user)
    if user.totp_secret is None:
        return False
    counter = match_code(
        _decrypt(box, user.totp_secret, user.id), code, last_counter=user.totp_last_counter
    )
    if counter is None:
        await session.commit()  # release the lock
        return False
    user.totp_last_counter = counter
    await session.commit()
    return True
