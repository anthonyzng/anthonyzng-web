"""Content seed: `content.json` bootstraps an empty database with the site's initial content.

`seed_content` upserts every row by slug in one transaction and never deletes rows that are
absent from the file (only cover images left without a project), so running it repeatedly is a
no-op in effect. Once the admin panel is in
use the database is the source of truth; re-running the seed would overwrite edited rows with
the file's version, so the command line (`python -m app.seed`) refuses a database that already
holds content unless forced (`has_content`). Row mapping comes from the shared collection
registry (`app.services.collections`), the same one the admin API uses.
"""

import json
from pathlib import Path
from typing import Any

from pydantic import Field
from sqlalchemy import case, delete, exists, func, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.base import Base
from app.models.content import Project
from app.models.stored_file import FILE_KIND_PROJECT_IMAGE, StoredFile
from app.schemas.common import StrictCamelModel
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
from app.services.collections import (
    CERTIFICATIONS,
    CONTACT_LINKS,
    EDUCATION,
    EXPERIENCE,
    LANGUAGES,
    PROJECTS,
    SITE_TEXTS,
    SKILL_GROUPS,
    Collection,
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


SEED_SECTIONS: tuple[tuple[str, Collection], ...] = (
    ("experience", EXPERIENCE),
    ("projects", PROJECTS),
    ("skill_groups", SKILL_GROUPS),
    ("education", EDUCATION),
    ("certifications", CERTIFICATIONS),
    ("spoken_languages", LANGUAGES),
    ("contact_links", CONTACT_LINKS),
    ("site_texts", SITE_TEXTS),
)
"""`SeedFile` attribute -> collection, in seeding order."""


def load_seed_file(path: Path = SEED_PATH) -> SeedFile:
    with path.open(encoding="utf-8") as handle:
        return SeedFile.model_validate(json.load(handle))


async def _upsert(session: AsyncSession, model: type[Base], rows: list[dict[str, Any]]) -> int:
    """`INSERT ... ON CONFLICT (slug) DO UPDATE` on every non-key column, `updated_at = now()`.

    Only the columns the write model knows are written, so a project's cover image survives,
    unless the file turns that project into a placeholder, which cannot have one.
    """
    if not rows:
        return 0
    statement = insert(model).values(rows)
    update_columns = [column for column in rows[0] if column != "slug"]
    # Subscript, not getattr: `excluded.items` would be the column collection's method.
    values: dict[str, Any] = {column: statement.excluded[column] for column in update_columns}
    values["updated_at"] = func.now()
    if model is Project:
        values["image_id"] = case((statement.excluded["placeholder"], None), else_=Project.image_id)
    statement = statement.on_conflict_do_update(index_elements=["slug"], set_=values)
    await session.execute(statement)
    return len(rows)


async def has_content(session: AsyncSession) -> bool:
    """Whether any table the seed writes already holds a row."""
    for _attribute, collection in SEED_SECTIONS:
        if await session.scalar(select(exists().select_from(collection.model))):
            return True
    return False


async def seed_content(session: AsyncSession, data: SeedFile) -> dict[str, int]:
    """Upsert every row of `data`; returns the number of rows written per table.

    A row without `sortOrder` takes its position in the file. A project the file makes a
    placeholder loses its cover image (a placeholder has none), and cover images no project points
    at any more are deleted, so `--force` can reset projects that gained an image in the admin.
    """
    counts: dict[str, int] = {}
    for attribute, collection in SEED_SECTIONS:
        items: list[Any] = getattr(data, attribute)
        rows = [collection.to_row(item) for item in items]
        for position, row in enumerate(rows):
            if "sort_order" in row and row["sort_order"] is None:
                row["sort_order"] = position
        counts[collection.model.__tablename__] = await _upsert(session, collection.model, rows)
    await session.execute(
        delete(StoredFile).where(
            StoredFile.kind == FILE_KIND_PROJECT_IMAGE,
            ~exists().where(Project.image_id == StoredFile.id),
        )
    )
    await session.commit()
    return counts
