"""Builds the public content payload for one locale and renders it to reproducible bytes."""

import hashlib
from dataclasses import dataclass
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import InstrumentedAttribute

from app.models.content import (
    CONTACT_LOCATION_SLUG,
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
from app.schemas.common import TAG_LIST, Locale, Localized, resolve_tags
from app.schemas.content import (
    CertificationItem,
    ContactLinkItem,
    ContactPayload,
    ContentPayload,
    EducationItem,
    ExperienceItem,
    ProjectItem,
    SkillGroupItem,
    SkillsPayload,
    SpokenLanguageItem,
)
from app.schemas.content_write import (
    ContactLinkText,
    EducationText,
    ExperienceText,
    ProjectText,
    SiteTextText,
    SkillGroupText,
    SpokenLanguageText,
)
from app.services.files import get_cv_ref, image_ref

CACHE_CONTROL = "public, max-age=60"


async def _rows[RowT](
    session: AsyncSession, model: type[RowT], *order_by: InstrumentedAttribute[Any]
) -> list[RowT]:
    result = await session.scalars(select(model).order_by(*order_by))
    return list(result.all())


async def _experience(session: AsyncSession, locale: Locale) -> list[ExperienceItem]:
    items: list[ExperienceItem] = []
    for row in await _rows(
        session, ExperienceEntry, ExperienceEntry.sort_order, ExperienceEntry.slug
    ):
        text = Localized[ExperienceText].model_validate(row.translations).get(locale)
        items.append(
            ExperienceItem(
                id=row.slug,
                company=row.company,
                role=text.role,
                location=text.location,
                start=row.start_month,
                end=row.end_month,
                bullets=list(text.bullets),
                tech=resolve_tags(TAG_LIST.validate_python(row.tech), locale),
            )
        )
    return items


async def _projects(session: AsyncSession, locale: Locale) -> list[ProjectItem]:
    items: list[ProjectItem] = []
    # The cover image's metadata only: `stored_files.data` is deferred and never loaded here.
    result = await session.execute(
        select(Project, StoredFile)
        .outerjoin(StoredFile, Project.image_id == StoredFile.id)
        .order_by(Project.sort_order, Project.slug)
    )
    for row, image in result.tuples():
        text = Localized[ProjectText].model_validate(row.translations).get(locale)
        items.append(
            ProjectItem(
                id=row.slug,
                placeholder=row.placeholder,
                title=text.title,
                summary=text.summary,
                tech=resolve_tags(TAG_LIST.validate_python(row.tech), locale),
                url=row.url,
                image=image_ref(image) if image is not None else None,
            )
        )
    return items


async def _skills(session: AsyncSession, locale: Locale) -> SkillsPayload:
    groups = [
        SkillGroupItem(
            id=row.slug,
            label=Localized[SkillGroupText].model_validate(row.translations).get(locale).label,
            items=resolve_tags(TAG_LIST.validate_python(row.items), locale),
        )
        for row in await _rows(session, SkillGroup, SkillGroup.sort_order, SkillGroup.slug)
    ]
    education = [
        EducationItem(
            id=row.slug,
            degree=Localized[EducationText].model_validate(row.translations).get(locale).degree,
            school=row.school,
            year=row.year,
        )
        for row in await _rows(
            session, EducationEntry, EducationEntry.sort_order, EducationEntry.slug
        )
    ]
    certifications = [
        CertificationItem(id=row.slug, name=row.name, in_progress=row.in_progress)
        for row in await _rows(session, Certification, Certification.sort_order, Certification.slug)
    ]
    languages = [
        SpokenLanguageItem(
            id=row.slug,
            name=Localized[SpokenLanguageText].model_validate(row.translations).get(locale).name,
        )
        for row in await _rows(
            session, SpokenLanguage, SpokenLanguage.sort_order, SpokenLanguage.slug
        )
    ]
    return SkillsPayload(
        groups=groups, education=education, certifications=certifications, languages=languages
    )


async def _contact(session: AsyncSession, locale: Locale) -> ContactPayload:
    links = [
        ContactLinkItem(
            id=row.slug,
            label=Localized[ContactLinkText].model_validate(row.translations).get(locale).label,
            href=row.href,
            display=row.display,
        )
        for row in await _rows(session, ContactLink, ContactLink.sort_order, ContactLink.slug)
    ]
    location_row = await session.get(SiteText, CONTACT_LOCATION_SLUG)
    location = ""
    if location_row is not None:
        location = (
            Localized[SiteTextText].model_validate(location_row.translations).get(locale).text
        )
    return ContactPayload(links=links, location=location)


async def build_content_payload(session: AsyncSession, locale: Locale) -> ContentPayload:
    return ContentPayload(
        locale=locale,
        experience=await _experience(session, locale),
        projects=await _projects(session, locale),
        skills=await _skills(session, locale),
        contact=await _contact(session, locale),
        cv=await get_cv_ref(session),
    )


@dataclass(frozen=True, slots=True)
class ContentDocument:
    body: bytes
    etag: str


def render_content(payload: ContentPayload) -> ContentDocument:
    """Compact JSON (non-ASCII unescaped) and a strong ETag over exactly those bytes."""
    body = payload.model_dump_json(by_alias=True).encode("utf-8")
    return ContentDocument(body=body, etag=f'"{hashlib.sha256(body).hexdigest()}"')


async def get_content_document(session: AsyncSession, locale: Locale) -> ContentDocument:
    return render_content(await build_content_payload(session, locale))


def etag_matches(if_none_match: str | None, etag: str) -> bool:
    """True when an `If-None-Match` header names `etag` (weak form accepted) or is `*`."""
    if not if_none_match:
        return False
    for candidate in if_none_match.split(","):
        value = candidate.strip()
        if value == "*":
            return True
        value = value.removeprefix("W/")
        if value == etag:
            return True
    return False
