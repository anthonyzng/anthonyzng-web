"""Uploaded files (the CV and project cover images), kept in PostgreSQL.

Files are small (the upload limits keep a CV under 10 MB and a re-encoded cover image well under
1 MB), so storing them next to the content keeps one backup for everything and needs no extra
service or credentials. `data` is deferred: listing or referencing files never loads the bytes.
"""

import uuid
from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, Index, Integer, LargeBinary, Text, func, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base

FILE_KIND_CV = "cv"
FILE_KIND_PROJECT_IMAGE = "project_image"
SHA256_PATTERN = "^[0-9a-f]{64}$"


class StoredFile(Base):
    __tablename__ = "stored_files"
    __table_args__ = (
        CheckConstraint(
            f"kind IN ('{FILE_KIND_CV}', '{FILE_KIND_PROJECT_IMAGE}')", name="kind_values"
        ),
        CheckConstraint(f"sha256 ~ '{SHA256_PATTERN}'", name="sha256_format"),
        CheckConstraint("size > 0 AND size = octet_length(data)", name="size_matches_data"),
        CheckConstraint(
            "(width IS NULL AND height IS NULL) OR (width > 0 AND height > 0)", name="dimensions"
        ),
        # At most one CV: uploading a new one replaces it.
        Index(
            "stored_files_single_cv",
            "kind",
            unique=True,
            postgresql_where=text(f"kind = '{FILE_KIND_CV}'"),
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    """Random, so file URLs cannot be enumerated; a new upload always gets a new id (and URL)."""
    kind: Mapped[str] = mapped_column(Text, nullable=False)
    content_type: Mapped[str] = mapped_column(Text, nullable=False)
    filename: Mapped[str | None] = mapped_column(Text, nullable=True)
    """The download name (CVs); None for images."""
    size: Mapped[int] = mapped_column(Integer, nullable=False)
    sha256: Mapped[str] = mapped_column(Text, nullable=False)
    width: Mapped[int | None] = mapped_column(Integer, nullable=True)
    height: Mapped[int | None] = mapped_column(Integer, nullable=True)
    data: Mapped[bytes] = mapped_column(LargeBinary, nullable=False, deferred=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
