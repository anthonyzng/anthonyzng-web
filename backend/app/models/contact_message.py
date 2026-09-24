from datetime import datetime

from sqlalchemy import BigInteger, CheckConstraint, DateTime, Identity, Index, Text, func, text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base

DELIVERY_PENDING = "pending"
DELIVERY_SENT = "sent"
DELIVERY_FAILED = "failed"
USER_AGENT_MAX_LENGTH = 512
DELIVERY_ERROR_MAX_LENGTH = 1000
IP_HASH_PATTERN = "^[0-9a-f]{64}$"


class ContactMessage(Base):
    """One contact-form submission. Kept until the owner deletes it (no automatic expiry)."""

    __tablename__ = "contact_messages"
    __table_args__ = (
        CheckConstraint(
            "delivery_status IN ('pending', 'sent', 'failed')", name="delivery_status_values"
        ),
        # Only an HMAC hex digest fits: a raw IP address can never land in this column.
        CheckConstraint(f"ip_hash IS NULL OR ip_hash ~ '{IP_HASH_PATTERN}'", name="ip_hash_format"),
        Index("contact_messages_created_at_idx", text("created_at DESC")),
    )
    # Fetch server-generated columns (id, created_at) with the INSERT's RETURNING clause.
    __mapper_args__ = {"eager_defaults": True}

    id: Mapped[int] = mapped_column(BigInteger, Identity(always=True), primary_key=True)
    name: Mapped[str] = mapped_column(Text, nullable=False)
    email: Mapped[str] = mapped_column(Text, nullable=False)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    ip_hash: Mapped[str | None] = mapped_column(Text, nullable=True)
    """`hash_client_ip` of the sender (HMAC-SHA256 hex), NULL when the IP was unknown."""
    user_agent: Mapped[str | None] = mapped_column(Text, nullable=True)
    """The sender's User-Agent header, truncated to `USER_AGENT_MAX_LENGTH`."""
    delivery_status: Mapped[str] = mapped_column(
        Text, nullable=False, server_default=text(f"'{DELIVERY_PENDING}'")
    )
    delivery_error: Mapped[str | None] = mapped_column(Text, nullable=True)
    delivered_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    """When the owner opened it in the admin panel; NULL = unread."""
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
