"""`app.seed`: idempotent upsert by slug that never deletes."""

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings
from app.models import Base
from app.models.content import Certification, ExperienceEntry
from app.seed import SeedFile, seed_content
from app.seed.__main__ import run

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
    counts = await run(test_settings)
    assert counts == EXPECTED_COUNTS
    assert await row_counts(session) == EXPECTED_COUNTS
