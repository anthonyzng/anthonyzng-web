"""Admin account management and credential checks.

Argon2 is deliberately slow (tens of milliseconds of CPU per hash): every hash and verification
runs in the thread pool so a login attempt never stalls the event loop for other requests.
"""

import logging

from sqlalchemy import delete, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.concurrency import run_in_threadpool

from app.core.config import Settings
from app.core.security import (
    SessionClaims,
    hash_password,
    password_needs_rehash,
    verify_password,
)
from app.models.admin_user import AdminUser

logger = logging.getLogger(__name__)

PASSWORD_CHECK_CONCURRENCY = 2
"""Argon2 checks allowed at once: a flood of logins queues instead of exhausting memory."""
PASSWORD_CHECK_WAIT_SECONDS = 5
"""How long a login waits for a free check before it is answered 429 (try again shortly)."""


def normalize_email(email: str) -> str:
    return email.strip().lower()


async def get_admin_by_email(session: AsyncSession, email: str) -> AdminUser | None:
    result = await session.scalars(select(AdminUser).where(AdminUser.email == email))
    return result.one_or_none()


async def get_admin_by_id(session: AsyncSession, user_id: int) -> AdminUser | None:
    return await session.get(AdminUser, user_id)


async def ensure_admin_user(session: AsyncSession, settings: Settings) -> AdminUser:
    """Make the configured account the one and only admin. Safe to run on every startup.

    Inserts `ADMIN_EMAIL` with `ON CONFLICT (email) DO NOTHING`; when the stored hash no longer
    verifies against `ADMIN_PASSWORD`, re-hashes it and bumps `session_version`, which revokes
    every session issued under the old password. Any other admin row (a previous `ADMIN_EMAIL`)
    is deleted, so its credentials and sessions stop working.
    """
    email = normalize_email(settings.ADMIN_EMAIL)
    password = settings.ADMIN_PASSWORD.get_secret_value()

    user = await get_admin_by_email(session, email)
    if user is None:
        await session.execute(
            insert(AdminUser)
            .values(email=email, password_hash=await run_in_threadpool(hash_password, password))
            .on_conflict_do_nothing(index_elements=[AdminUser.email])
        )
        user = await get_admin_by_email(session, email)
        if user is None:  # pragma: no cover - the row was just inserted or already existed
            raise RuntimeError("admin user could not be created")
        logger.info("Admin user created")
    # Also after an insert: a concurrent start may have created the row with another password.
    if not await run_in_threadpool(verify_password, user.password_hash, password):
        user.password_hash = await run_in_threadpool(hash_password, password)
        user.session_version += 1
        logger.info("Admin password updated from configuration; existing sessions revoked")
    elif password_needs_rehash(user.password_hash):
        # Same password, older hashing parameters: re-hash; sessions stay valid.
        user.password_hash = await run_in_threadpool(hash_password, password)
        logger.info("Admin password re-hashed with the current parameters")

    stale = await session.scalars(
        delete(AdminUser).where(AdminUser.email != email).returning(AdminUser.id)
    )
    removed = len(stale.all())
    if removed:
        logger.info("Removed %d admin account(s) not matching ADMIN_EMAIL", removed)
    await session.commit()
    return user


async def authenticate_admin(
    session: AsyncSession, email: str, password: str, *, dummy_hash: str
) -> AdminUser | None:
    """The admin matching `email` + `password`, else None.

    An unknown email still runs one Argon2 verification (against `dummy_hash`) so the failure
    path costs the same whether or not the account exists.
    """
    user = await get_admin_by_email(session, normalize_email(email))
    if user is None:
        await run_in_threadpool(verify_password, dummy_hash, password)
        return None
    if not await run_in_threadpool(verify_password, user.password_hash, password):
        return None
    return user


async def get_admin_for_session(session: AsyncSession, claims: SessionClaims) -> AdminUser | None:
    """The admin a session token belongs to, or None when the token has been revoked."""
    user = await get_admin_by_id(session, claims.user_id)
    if user is None or user.session_version != claims.version:
        return None
    return user


async def revoke_sessions(session: AsyncSession, user: AdminUser) -> None:
    """Invalidate every session token issued to `user` so far (logout)."""
    user.session_version += 1
    await session.commit()
