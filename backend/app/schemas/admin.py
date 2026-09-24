"""Admin API models: content items as the admin edits them (both locales), messages, files.

An item is its write model (`app.schemas.content_write`) plus read-only fields; the admin sends
the write model back, without the read-only fields (unknown keys are rejected). `sortOrder` is
always present on a read item (the write models let a client leave it out). `updatedAt` is the
version of the row's content: send it back as `If-Match` to refuse overwriting a newer change.
"""

from datetime import datetime
from typing import Annotated, Literal

from pydantic import Field

from app.schemas.common import CamelModel, Slug, StrictCamelModel
from app.schemas.content import CvRef, ImageRef
from app.schemas.content_write import (
    CertificationIn,
    ContactLinkIn,
    EducationIn,
    ExperienceIn,
    ProjectIn,
    SiteTextIn,
    SkillGroupIn,
    SortOrder,
    SpokenLanguageIn,
)


class ExperienceOut(ExperienceIn):
    sort_order: SortOrder
    updated_at: datetime


class ProjectOut(ProjectIn):
    sort_order: SortOrder
    updated_at: datetime
    image: ImageRef | None


class SkillGroupOut(SkillGroupIn):
    sort_order: SortOrder
    updated_at: datetime


class EducationOut(EducationIn):
    sort_order: SortOrder
    updated_at: datetime


class CertificationOut(CertificationIn):
    sort_order: SortOrder
    updated_at: datetime


class SpokenLanguageOut(SpokenLanguageIn):
    sort_order: SortOrder
    updated_at: datetime


class ContactLinkOut(ContactLinkIn):
    sort_order: SortOrder
    updated_at: datetime


class SiteTextOut(SiteTextIn):
    updated_at: datetime


class ReorderRequest(StrictCamelModel):
    slugs: Annotated[list[Slug], Field(max_length=500)]


DeliveryStatus = Literal["pending", "sent", "failed"]


class MessageOut(CamelModel):
    id: int
    name: str
    email: str
    message: str
    created_at: datetime
    read_at: datetime | None
    delivery_status: DeliveryStatus
    delivery_error: str | None
    source: str
    """The sender's IP hash fingerprint (12 hex characters), or `unknown`."""
    user_agent: str | None


class MessagesPage(CamelModel):
    items: list[MessageOut]
    total: int
    """Messages matching the filter, as of `as_of`."""
    unread: int
    """Unread messages overall, now."""
    as_of: datetime
    """The instant the filtered set was taken at; pass it back as `asOf` for the next pages."""


class MessageUpdate(StrictCamelModel):
    read: bool


class CvResponse(CamelModel):
    cv: CvRef | None


class SummaryOut(CamelModel):
    counts: dict[str, int]
    unread_messages: int
    cv: CvRef | None
