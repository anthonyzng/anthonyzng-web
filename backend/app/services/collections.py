"""The content collections: how each table maps to its write model and back.

One registry serves the seed (write model -> row values) and the admin API (list, create, update,
delete, reorder, and row -> the item the admin edits). The URL segment is the collection's `name`.
"""

from collections.abc import Callable
from dataclasses import dataclass
from typing import Any

from pydantic import BaseModel

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
from app.schemas.admin import (
    CertificationOut,
    ContactLinkOut,
    EducationOut,
    ExperienceOut,
    ProjectOut,
    SiteTextOut,
    SkillGroupOut,
    SpokenLanguageOut,
)
from app.schemas.common import TAG_LIST, Localized, Tag
from app.schemas.content_write import (
    CertificationIn,
    ContactLinkIn,
    EducationIn,
    ExperienceIn,
    ProjectIn,
    SiteTextIn,
    SkillGroupIn,
    SpokenLanguageIn,
)


def tags_json(tags: list[Tag]) -> list[Any]:
    dumped: list[Any] = TAG_LIST.dump_python(tags, mode="json", by_alias=True)
    return dumped


def translations_json[T](translations: Localized[T]) -> dict[str, Any]:
    return translations.model_dump(mode="json", by_alias=True)


@dataclass(frozen=True, slots=True)
class Collection:
    name: str
    """URL segment under `/admin/content/`."""
    model: type[Any]
    """A content model (`Base` subclass) with a `slug` primary key, and `sort_order` if sortable."""
    write_model: type[BaseModel]
    out_model: type[BaseModel]
    to_row: Callable[[Any], dict[str, Any]]
    """Write model -> column values (slug included)."""
    from_row: Callable[[Any], dict[str, Any]]
    """Row -> write-model field values (snake_case)."""
    sortable: bool = True


def _experience_row(item: ExperienceIn) -> dict[str, Any]:
    return {
        "slug": item.slug,
        "sort_order": item.sort_order,
        "company": item.company,
        "company_url": item.company_url,
        "start_month": item.start,
        "end_month": item.end,
        "tech": tags_json(item.tech),
        "translations": translations_json(item.translations),
    }


def _experience_fields(row: ExperienceEntry) -> dict[str, Any]:
    return {
        "slug": row.slug,
        "sort_order": row.sort_order,
        "company": row.company,
        "company_url": row.company_url,
        "start": row.start_month,
        "end": row.end_month,
        "tech": row.tech,
        "translations": row.translations,
    }


def _project_row(item: ProjectIn) -> dict[str, Any]:
    return {
        "slug": item.slug,
        "sort_order": item.sort_order,
        "placeholder": item.placeholder,
        "url": item.url,
        "tech": tags_json(item.tech),
        "translations": translations_json(item.translations),
    }


def _project_fields(row: Project) -> dict[str, Any]:
    return {
        "slug": row.slug,
        "sort_order": row.sort_order,
        "placeholder": row.placeholder,
        "url": row.url,
        "tech": row.tech,
        "translations": row.translations,
    }


def _skill_group_row(item: SkillGroupIn) -> dict[str, Any]:
    return {
        "slug": item.slug,
        "sort_order": item.sort_order,
        "items": tags_json(item.items),
        "translations": translations_json(item.translations),
    }


def _skill_group_fields(row: SkillGroup) -> dict[str, Any]:
    return {
        "slug": row.slug,
        "sort_order": row.sort_order,
        "items": row.items,
        "translations": row.translations,
    }


def _education_row(item: EducationIn) -> dict[str, Any]:
    return {
        "slug": item.slug,
        "sort_order": item.sort_order,
        "school": item.school,
        "year": item.year,
        "translations": translations_json(item.translations),
    }


def _education_fields(row: EducationEntry) -> dict[str, Any]:
    return {
        "slug": row.slug,
        "sort_order": row.sort_order,
        "school": row.school,
        "year": row.year,
        "translations": row.translations,
    }


def _certification_row(item: CertificationIn) -> dict[str, Any]:
    return {
        "slug": item.slug,
        "sort_order": item.sort_order,
        "name": item.name,
        "in_progress": item.in_progress,
    }


def _certification_fields(row: Certification) -> dict[str, Any]:
    return {
        "slug": row.slug,
        "sort_order": row.sort_order,
        "name": row.name,
        "in_progress": row.in_progress,
    }


def _language_row(item: SpokenLanguageIn) -> dict[str, Any]:
    return {
        "slug": item.slug,
        "sort_order": item.sort_order,
        "translations": translations_json(item.translations),
    }


def _language_fields(row: SpokenLanguage) -> dict[str, Any]:
    return {"slug": row.slug, "sort_order": row.sort_order, "translations": row.translations}


def _contact_link_row(item: ContactLinkIn) -> dict[str, Any]:
    return {
        "slug": item.slug,
        "sort_order": item.sort_order,
        "href": item.href,
        "display": item.display,
        "translations": translations_json(item.translations),
    }


def _contact_link_fields(row: ContactLink) -> dict[str, Any]:
    return {
        "slug": row.slug,
        "sort_order": row.sort_order,
        "href": row.href,
        "display": row.display,
        "translations": row.translations,
    }


def _site_text_row(item: SiteTextIn) -> dict[str, Any]:
    return {"slug": item.slug, "translations": translations_json(item.translations)}


def _site_text_fields(row: SiteText) -> dict[str, Any]:
    return {"slug": row.slug, "translations": row.translations}


EXPERIENCE = Collection(
    "experience", ExperienceEntry, ExperienceIn, ExperienceOut, _experience_row, _experience_fields
)
PROJECTS = Collection("projects", Project, ProjectIn, ProjectOut, _project_row, _project_fields)
SKILL_GROUPS = Collection(
    "skill-groups", SkillGroup, SkillGroupIn, SkillGroupOut, _skill_group_row, _skill_group_fields
)
EDUCATION = Collection(
    "education", EducationEntry, EducationIn, EducationOut, _education_row, _education_fields
)
CERTIFICATIONS = Collection(
    "certifications",
    Certification,
    CertificationIn,
    CertificationOut,
    _certification_row,
    _certification_fields,
)
LANGUAGES = Collection(
    "languages",
    SpokenLanguage,
    SpokenLanguageIn,
    SpokenLanguageOut,
    _language_row,
    _language_fields,
)
CONTACT_LINKS = Collection(
    "contact-links",
    ContactLink,
    ContactLinkIn,
    ContactLinkOut,
    _contact_link_row,
    _contact_link_fields,
)
SITE_TEXTS = Collection(
    "site-texts",
    SiteText,
    SiteTextIn,
    SiteTextOut,
    _site_text_row,
    _site_text_fields,
    sortable=False,
)

COLLECTIONS: dict[str, Collection] = {
    collection.name: collection
    for collection in (
        EXPERIENCE,
        PROJECTS,
        SKILL_GROUPS,
        EDUCATION,
        CERTIFICATIONS,
        LANGUAGES,
        CONTACT_LINKS,
        SITE_TEXTS,
    )
}
