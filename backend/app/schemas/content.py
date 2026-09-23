"""Public `GET /content` payload: every string already resolved for the requested locale."""

from app.schemas.common import CamelModel, Locale, Month


class ExperienceItem(CamelModel):
    id: str
    company: str
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


class SkillGroupItem(CamelModel):
    id: str
    label: str
    items: list[str]


class EducationItem(CamelModel):
    id: str
    degree: str
    school: str
    year: str


class CertificationItem(CamelModel):
    id: str
    name: str
    in_progress: bool


class SpokenLanguageItem(CamelModel):
    id: str
    name: str


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
    contact: ContactPayload
