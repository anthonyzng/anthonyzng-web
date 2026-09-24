"""Contact messages as the admin panel sees them. Kept until the owner deletes them."""

from datetime import UTC, datetime

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.client_ip import fingerprint
from app.models.contact_message import ContactMessage
from app.schemas.admin import MessageOut, MessagesPage


class MessageNotFoundError(Exception):
    """No contact message with that id."""


def message_out(row: ContactMessage) -> MessageOut:
    return MessageOut.model_validate(
        {
            "id": row.id,
            "name": row.name,
            "email": row.email,
            "message": row.message,
            "created_at": row.created_at,
            "read_at": row.read_at,
            "delivery_status": row.delivery_status,
            "delivery_error": row.delivery_error,
            "source": fingerprint(row.ip_hash),
            "user_agent": row.user_agent,
        }
    )


async def list_messages(
    session: AsyncSession,
    *,
    unread_only: bool,
    limit: int,
    offset: int,
    as_of: datetime | None = None,
) -> MessagesPage:
    """Newest first. `total` counts the filtered set; `unread` counts every unread message.

    The set is taken as it was at `as_of` (now when absent; the page returns the instant it used):
    messages received later are left out, and in the unread view a message read later still
    counts. Later pages that pass the first page's `asOf` therefore page through the same set,
    however many messages are read or arrive in between.
    """
    moment = as_of or datetime.now(UTC)
    filtered = select(ContactMessage).where(ContactMessage.created_at <= moment)
    if unread_only:
        filtered = filtered.where(
            or_(ContactMessage.read_at.is_(None), ContactMessage.read_at > moment)
        )
    total = await session.scalar(select(func.count()).select_from(filtered.subquery()))
    rows = await session.scalars(
        filtered.order_by(ContactMessage.created_at.desc(), ContactMessage.id.desc())
        .limit(limit)
        .offset(offset)
    )
    unread = await session.scalar(
        select(func.count()).select_from(ContactMessage).where(ContactMessage.read_at.is_(None))
    )
    return MessagesPage(
        items=[message_out(row) for row in rows],
        total=total or 0,
        unread=unread or 0,
        as_of=moment,
    )


async def _get(session: AsyncSession, message_id: int) -> ContactMessage:
    row = await session.get(ContactMessage, message_id)
    if row is None:
        raise MessageNotFoundError(message_id)
    return row


async def set_read(session: AsyncSession, message_id: int, *, read: bool) -> MessageOut:
    """Marking an already-read message read again keeps its first `read_at`."""
    row = await _get(session, message_id)
    if not read:
        row.read_at = None
    elif row.read_at is None:
        row.read_at = datetime.now(UTC)
    await session.commit()
    return message_out(row)


async def delete_message(session: AsyncSession, message_id: int) -> None:
    await session.delete(await _get(session, message_id))
    await session.commit()
