from datetime import datetime

from sqlalchemy import (
    BigInteger,
    CheckConstraint,
    DateTime,
    Identity,
    Integer,
    LargeBinary,
    Text,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class AdminUser(TimestampMixin, Base):
    """The single admin account (the startup upsert removes any other row)."""

    __tablename__ = "admin_users"
    __table_args__ = (
        # Two-factor sign-in is on exactly when a secret is stored.
        CheckConstraint(
            "(totp_secret IS NULL) = (totp_enabled_at IS NULL)", name="totp_enabled_consistent"
        ),
    )

    id: Mapped[int] = mapped_column(Integer, Identity(always=True), primary_key=True)
    email: Mapped[str] = mapped_column(Text, nullable=False, unique=True)
    """Stored lowercased."""
    password_hash: Mapped[str] = mapped_column(Text, nullable=False)
    """Argon2id."""
    session_version: Mapped[int] = mapped_column(
        Integer, nullable=False, default=1, server_default=text("1")
    )
    """Copied into every session token; bumping it (password change, logout, two-factor sign-in
    turned on or off) revokes them all."""
    totp_secret: Mapped[bytes | None] = mapped_column(LargeBinary, nullable=True)
    """The authenticator secret, encrypted (`app.core.totp.SecretBox`); NULL = no second factor."""
    totp_enabled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    totp_last_counter: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    """The time step of the last accepted code: a code for it or an earlier step is refused."""
    totp_pending_secret: Mapped[bytes | None] = mapped_column(LargeBinary, nullable=True)
    """A secret being set up (shown as a QR code), encrypted; it becomes `totp_secret` once a
    code from it is confirmed together with the password."""
