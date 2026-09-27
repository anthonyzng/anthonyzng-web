"""Public `GET /content` payload: every string already resolved for the requested locale."""

from datetime import datetime

from app.schemas.common import CamelModel, Locale, Month


class ImageRef(CamelModel):
    """A stored image. `url` is a path on the API origin (`/api/v1/files/<uuid>`)."""

    url: str
    width: int
    height: int


class CvRef(CamelModel):
    """The downloadable CV. `url` is a path on the API origin (`/api/v1/files/<uuid>`)."""

    url: str
    filename: str
    size: int
    updated_at: datetime


class ExperienceItem(CamelModel):
    id: str
    company: str
    company_url: str | None
    role: str
    location: str
    start: Month
    end: Month | None
    bullets: list[str]
    tech: list[str]


class ProjectItem(CamelModel):
    id: str
    placeholder: bool
    title: str | None
    summary: str | None
    tech: list[str]
    url: str | None
    image: ImageRef | None


class SkillGroupItem(CamelModel):
    id: str
    label: str
    items: list[str]


class EducationItem(CamelModel):
    id: str
    degree: str
    school: str
    url: str | None
    year: str


class CertificationItem(CamelModel):
    id: str
    name: str
    url: str | None
    in_progress: bool


class SpokenLanguageItem(CamelModel):
    id: str
    name: str


class ToolItem(CamelModel):
    id: str
    name: str
    kind: str
    summary: str
    tech: list[str]
    url: str


class ArchiveItem(CamelModel):
    id: str
    kind: str
    title: str
    summary: str | None
    month: Month
    url: str


class ContactLinkItem(CamelModel):
    id: str
    label: str
    href: str
    display: str


class SkillsPayload(CamelModel):
    groups: list[SkillGroupItem]
    education: list[EducationItem]
    certifications: list[CertificationItem]
    languages: list[SpokenLanguageItem]


class ContactPayload(CamelModel):
    links: list[ContactLinkItem]
    location: str


class ContentPayload(CamelModel):
    locale: Locale
    experience: list[ExperienceItem]
    projects: list[ProjectItem]
    skills: SkillsPayload
    tools: list[ToolItem]
    contact: ContactPayload
    archive: list[ArchiveItem]
    cv: CvRef | None
