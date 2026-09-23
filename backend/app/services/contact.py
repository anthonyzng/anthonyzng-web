"""Contact-form processing: honeypot, Turnstile, store the message, hand it to the provider.

Delivery failures are recorded on the row and logged, never reported to the visitor. The visitor's
raw IP is only passed to Turnstile; the row, the email and the logs carry `hash_client_ip` of it.
"""

import logging
from datetime import UTC, datetime
from enum import Enum

from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.client_ip import UNKNOWN_IP, fingerprint, hash_client_ip
from app.core.config import Settings
from app.models.contact_message import (
    DELIVERY_ERROR_MAX_LENGTH,
    DELIVERY_FAILED,
    DELIVERY_SENT,
    USER_AGENT_MAX_LENGTH,
    ContactMessage,
)
from app.schemas.contact import ContactRequest
from app.services.email import EmailDeliveryError, EmailProvider, OutgoingEmail
from app.services.turnstile import TurnstileVerifier

logger = logging.getLogger(__name__)

SUBJECT_PREFIX = "[owwsolution.com]"


class ContactOutcome(Enum):
    ACCEPTED = "accepted"
    HONEYPOT = "honeypot"


class TurnstileRejectedError(Exception):
    """Cloudflare answered `success: false` for the visitor's token."""


class ContactStorageError(Exception):
    """The message could not be written to the database."""


def build_contact_email(
    settings: Settings, submission: ContactRequest, ip_hash: str | None, received_at: datetime
) -> OutgoingEmail:
    name = " ".join(submission.name.split())
    text = "\n".join(
        [
            f"Name: {submission.name}",
            f"Email: {submission.email}",
            # The same sender always shows the same short hash, so repeat senders stand out.
            f"Source: {fingerprint(ip_hash)} (hashed IP)",
            f"Received: {received_at.astimezone(UTC).isoformat(timespec='seconds')}",
            "",
            submission.message,
        ]
    )
    return OutgoingEmail(
        to=settings.CONTACT_TO_EMAIL,
        from_=settings.EMAIL_FROM,
        reply_to=submission.email,
        subject=f"{SUBJECT_PREFIX} New message from {name}",
        text=text,
    )


async def submit_contact(
    session: AsyncSession,
    submission: ContactRequest,
    *,
    settings: Settings,
    client_ip: str,
    user_agent: str | None,
    verifier: TurnstileVerifier,
    provider: EmailProvider,
) -> ContactOutcome:
    """Process one submission. Raises `TurnstileRejectedError`, `TurnstileUnavailableError`
    (propagated from the verifier) or `ContactStorageError`; email failures are swallowed."""
    ip_hash = hash_client_ip(client_ip, settings.IP_HASH_SECRET.get_secret_value())

    if submission.website.strip():
        logger.info("Contact honeypot triggered by source %s", fingerprint(ip_hash))
        return ContactOutcome.HONEYPOT

    remote_ip = None if client_ip == UNKNOWN_IP else client_ip
    if not await verifier.verify(submission.turnstile_token, remote_ip):
        raise TurnstileRejectedError

    row = ContactMessage(
        name=submission.name,
        email=submission.email,
        message=submission.message,
        ip_hash=ip_hash,
        user_agent=user_agent[:USER_AGENT_MAX_LENGTH] if user_agent else None,
    )
    try:
        session.add(row)
        await session.commit()
    except SQLAlchemyError as exc:
        await session.rollback()
        logger.exception("Storing a contact message failed")
        raise ContactStorageError from exc

    # Read now: a rollback below expires the row, and lazy loads are not allowed in async code.
    message_id = row.id
    email = build_contact_email(settings, submission, ip_hash, row.created_at)
    try:
        await provider.send(email)
    except EmailDeliveryError as exc:
        logger.exception("Contact message %s stored but not delivered", message_id)
        row.delivery_status = DELIVERY_FAILED
        row.delivery_error = str(exc)[:DELIVERY_ERROR_MAX_LENGTH]
    else:
        row.delivery_status = DELIVERY_SENT
        row.delivered_at = datetime.now(UTC)
    try:
        await session.commit()
    except SQLAlchemyError:
        # The message is stored (and possibly delivered): a failed status update must not turn
        # into an error that makes the visitor send it again. The row simply stays 'pending'.
        await session.rollback()
        logger.exception("Recording the delivery status of contact message %s failed", message_id)
    return ContactOutcome.ACCEPTED
