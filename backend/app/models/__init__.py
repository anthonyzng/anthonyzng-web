"""SQLAlchemy models. Importing this package registers every table on `Base.metadata`."""

from app.models.admin_user import AdminUser
from app.models.base import Base
from app.models.contact_message import ContactMessage
from app.models.content import (
    Certification,
    ContactLink,
    EducationEntry,
    ExperienceEntry,
    Project,
    SiteText,
    SkillGroup,
    SpokenLanguage,
)
from app.models.stored_file import StoredFile

__all__ = [
    "AdminUser",
    "Base",
    "Certification",
    "ContactLink",
    "ContactMessage",
    "EducationEntry",
    "ExperienceEntry",
    "Project",
    "SiteText",
    "SkillGroup",
    "SpokenLanguage",
    "StoredFile",
]
