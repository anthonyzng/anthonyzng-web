from sqlalchemy import Identity, Integer, Text, text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class AdminUser(TimestampMixin, Base):
    """The single admin account (the startup upsert removes any other row)."""

    __tablename__ = "admin_users"

    id: Mapped[int] = mapped_column(Integer, Identity(always=True), primary_key=True)
    email: Mapped[str] = mapped_column(Text, nullable=False, unique=True)
    """Stored lowercased."""
    password_hash: Mapped[str] = mapped_column(Text, nullable=False)
    """Argon2id."""
    session_version: Mapped[int] = mapped_column(
        Integer, nullable=False, default=1, server_default=text("1")
    )
    """Copied into every session token; bumping it (password change, logout) revokes them all."""
