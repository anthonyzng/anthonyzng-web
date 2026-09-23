"""Content seed: `content.json` mirrors the frontend's static content in the storage shapes.

`seed_content` upserts every row by slug in one transaction and never deletes rows that are
absent from the file, so running it repeatedly is a no-op in effect.
"""

import json
from pathlib import Path
from typing import Any

from pydantic import Field
from sqlalchemy import func
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.base import Base
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
from app.schemas.common import TAG_LIST, Localized, StrictCamelModel, Tag
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

SEED_PATH = Path(__file__).with_name("content.json")


class SeedFile(StrictCamelModel):
    comment: str | None = Field(default=None, alias="$comment")
    experience: list[ExperienceIn] = []
    projects: list[ProjectIn] = []
    skill_groups: list[SkillGroupIn] = []
    education: list[EducationIn] = []
    certifications: list[CertificationIn] = []
    spoken_languages: list[SpokenLanguageIn] = []
    contact_links: list[ContactLinkIn] = []
    site_texts: list[SiteTextIn] = []


def load_seed_file(path: Path = SEED_PATH) -> SeedFile:
    with path.open(encoding="utf-8") as handle:
        return SeedFile.model_validate(json.load(handle))


def _tags(tags: list[Tag]) -> list[Any]:
    dumped: list[Any] = TAG_LIST.dump_python(tags, mode="json", by_alias=True)
    return dumped


def _translations[T](translations: Localized[T]) -> dict[str, Any]:
    return translations.model_dump(mode="json", by_alias=True)


async def _upsert(session: AsyncSession, model: type[Base], rows: list[dict[str, Any]]) -> int:
    """`INSERT ... ON CONFLICT (slug) DO UPDATE` on every non-key column, `updated_at = now()`."""
    if not rows:
        return 0
    statement = insert(model).values(rows)
    update_columns = [column for column in rows[0] if column != "slug"]
    # Subscript, not getattr: `excluded.items` would be the column collection's method.
    statement = statement.on_conflict_do_update(
        index_elements=["slug"],
        set_={
            **{column: statement.excluded[column] for column in update_columns},
            "updated_at": func.now(),
        },
    )
    await session.execute(statement)
    return len(rows)


async def seed_content(session: AsyncSession, data: SeedFile) -> dict[str, int]:
    """Upsert every row of `data`; returns the number of rows written per table."""
    counts = {
        "experience_entries": await _upsert(
            session,
            ExperienceEntry,
            [
                {
                    "slug": item.slug,
                    "sort_order": item.sort_order,
                    "company": item.company,
                    "start_month": item.start,
                    "end_month": item.end,
                    "tech": _tags(item.tech),
                    "translations": _translations(item.translations),
                }
                for item in data.experience
            ],
        ),
        "projects": await _upsert(
            session,
            Project,
            [
                {
                    "slug": item.slug,
                    "sort_order": item.sort_order,
                    "placeholder": item.placeholder,
                    "url": item.url,
                    "tech": _tags(item.tech),
                    "translations": _translations(item.translations),
                }
                for item in data.projects
            ],
        ),
        "skill_groups": await _upsert(
            session,
            SkillGroup,
            [
                {
                    "slug": item.slug,
                    "sort_order": item.sort_order,
                    "items": _tags(item.items),
                    "translations": _translations(item.translations),
                }
                for item in data.skill_groups
            ],
        ),
        "education_entries": await _upsert(
            session,
            EducationEntry,
            [
                {
                    "slug": item.slug,
                    "sort_order": item.sort_order,
                    "school": item.school,
                    "year": item.year,
                    "translations": _translations(item.translations),
                }
                for item in data.education
            ],
        ),
        "certifications": await _upsert(
            session,
            Certification,
            [
                {
                    "slug": item.slug,
                    "sort_order": item.sort_order,
                    "name": item.name,
                    "in_progress": item.in_progress,
                }
                for item in data.certifications
            ],
        ),
        "spoken_languages": await _upsert(
            session,
            SpokenLanguage,
            [
                {
                    "slug": item.slug,
                    "sort_order": item.sort_order,
                    "translations": _translations(item.translations),
                }
                for item in data.spoken_languages
            ],
        ),
        "contact_links": await _upsert(
            session,
            ContactLink,
            [
                {
                    "slug": item.slug,
                    "sort_order": item.sort_order,
                    "href": item.href,
                    "display": item.display,
                    "translations": _translations(item.translations),
                }
                for item in data.contact_links
            ],
        ),
        "site_texts": await _upsert(
            session,
            SiteText,
            [
                {"slug": item.slug, "translations": _translations(item.translations)}
                for item in data.site_texts
            ],
        ),
    }
    await session.commit()
    return counts
