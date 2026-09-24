"""`app.seed`: idempotent upsert by slug that never deletes; the CLI seeds only empty databases."""

import pytest
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings
from app.models import Base
from app.models.content import Certification, ExperienceEntry, Project
from app.models.stored_file import StoredFile
from app.seed import SeedFile, has_content, seed_content
from app.seed.__main__ import SeedRefusedError, run
from app.services.files import EncodedImage, new_cover_image

EXPECTED_COUNTS = {
    "experience_entries": 3,
    "projects": 2,
    "skill_groups": 6,
    "education_entries": 1,
    "certifications": 3,
    "spoken_languages": 3,
    "contact_links": 3,
    "site_texts": 1,
}


async def row_counts(session: AsyncSession) -> dict[str, int]:
    counts: dict[str, int] = {}
    for name in EXPECTED_COUNTS:
        table = Base.metadata.tables[name]
        counts[name] = (await session.execute(select(func.count()).select_from(table))).scalar_one()
    return counts


def test_seed_file_validates_and_covers_both_locales(seed_data: SeedFile) -> None:
    assert seed_data.comment
    assert {row.slug for row in seed_data.experience} == {"sksys", "hactl", "ivc"}
    for item in seed_data.skill_groups:
        assert item.translations.en.label
        assert item.translations.zh_hant.label
    assert seed_data.site_texts[0].slug == "contact_location"


async def test_seed_is_idempotent(session: AsyncSession, seed_data: SeedFile) -> None:
    first = await seed_content(session, seed_data)
    second = await seed_content(session, seed_data)
    assert first == second == EXPECTED_COUNTS
    assert await row_counts(session) == EXPECTED_COUNTS


async def test_seed_restores_edited_rows(session: AsyncSession, seed_data: SeedFile) -> None:
    await seed_content(session, seed_data)
    row = await session.get_one(ExperienceEntry, "sksys")
    original_company = row.company
    first_update = row.updated_at
    row.company = "Edited Ltd"
    await session.commit()

    await seed_content(session, seed_data)
    session.expire_all()
    row = await session.get_one(ExperienceEntry, "sksys")
    assert row.company == original_company
    assert row.updated_at >= first_update


async def test_seed_keeps_rows_absent_from_the_file(
    session: AsyncSession, seed_data: SeedFile
) -> None:
    await seed_content(session, seed_data)
    session.add(Certification(slug="extra", sort_order=99, name="Extra", in_progress=False))
    await session.commit()
    await seed_content(session, seed_data)
    assert await session.get(Certification, "extra") is not None


async def test_cli_runner_seeds_the_configured_database(
    session: AsyncSession, test_settings: Settings
) -> None:
    assert not await has_content(session)
    counts = await run(test_settings)
    assert counts == EXPECTED_COUNTS
    assert await row_counts(session) == EXPECTED_COUNTS
    assert await has_content(session)


async def test_forced_seed_resets_a_slot_that_gained_a_cover_image(
    session: AsyncSession, seed_data: SeedFile
) -> None:
    """The admin filled seed slot `slotOne` and gave it an image; `--force` puts the placeholder
    back, which cannot keep an image (the CHECK would fail), so the image goes too."""
    await seed_content(session, seed_data)
    image = new_cover_image(EncodedImage(data=b"webp-bytes", width=4, height=3))
    session.add(image)
    await session.flush()
    project = await session.get_one(Project, "slotOne")
    project.placeholder = False
    project.url = "https://example.com"
    project.translations = {
        "en": {"title": "Real", "summary": "Real work."},
        "zh-Hant": {"title": "真實", "summary": "真實項目。"},
    }
    project.image_id = image.id
    await session.commit()

    await seed_content(session, seed_data)
    session.expire_all()
    project = await session.get_one(Project, "slotOne")
    assert project.placeholder is True
    assert project.image_id is None
    assert await session.get(StoredFile, image.id) is None


async def test_cli_runner_refuses_a_database_with_content(
    session: AsyncSession, test_settings: Settings
) -> None:
    """An edit made in the admin panel survives an accidental `python -m app.seed`."""
    session.add(Certification(slug="extra", sort_order=99, name="Edited", in_progress=False))
    await session.commit()
    with pytest.raises(SeedRefusedError):
        await run(test_settings)
    assert (await row_counts(session))["experience_entries"] == 0

    assert await run(test_settings, force=True) == EXPECTED_COUNTS
    assert await session.get(Certification, "extra") is not None
