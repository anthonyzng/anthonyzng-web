"""The public `/content` cache: one build per miss, fresh after admin writes, bounded lifetime."""

import asyncio

import httpx
import pytest

import app.api.v1.content as content_routes
from app.services.content import ContentCache, ContentDocument, get_content_document

ADMIN = "/api/v1/admin"


def document(tag: str) -> ContentDocument:
    return ContentDocument(body=tag.encode(), etag=f'"{tag}"')


async def test_concurrent_misses_build_once() -> None:
    cache = ContentCache()
    builds = 0

    async def build() -> ContentDocument:
        nonlocal builds
        builds += 1
        await asyncio.sleep(0.01)
        return document("a")

    results = await asyncio.gather(*(cache.get("en", build) for _ in range(20)))
    assert builds == 1
    assert {result.etag for result in results} == {'"a"'}


async def test_entries_expire_and_are_per_locale() -> None:
    now = 0.0
    cache = ContentCache(ttl_seconds=30, clock=lambda: now)
    versions = iter(["v1", "v2"])

    async def build() -> ContentDocument:
        return document(next(versions))

    assert (await cache.get("en", build)).etag == '"v1"'
    now = 29.0
    assert (await cache.get("en", build)).etag == '"v1"'
    now = 30.0
    assert (await cache.get("en", build)).etag == '"v2"'
    assert (await cache.get("zh-Hant", lambda: asyncio.sleep(0, document("zh")))).etag == '"zh"'


async def test_a_build_overtaken_by_a_write_is_served_but_not_kept() -> None:
    cache = ContentCache()
    release = asyncio.Event()

    async def slow_build() -> ContentDocument:
        await release.wait()
        return document("before-write")

    pending = asyncio.create_task(cache.get("en", slow_build))
    await asyncio.sleep(0)
    cache.clear()  # an admin write lands while the old state is being read
    release.set()
    assert (await pending).etag == '"before-write"'
    assert (await cache.get("en", lambda: asyncio.sleep(0, document("after")))).etag == '"after"'


@pytest.mark.usefixtures("seeded")
async def test_the_route_serves_the_cached_document(
    client: httpx.AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    builds: list[str] = []
    original = get_content_document

    async def counting(session: object, locale: str) -> ContentDocument:
        builds.append(locale)
        return await original(session, locale)  # type: ignore[arg-type]

    monkeypatch.setattr(content_routes, "get_content_document", counting)
    first = await client.get("/api/v1/content?locale=en")
    second = await client.get("/api/v1/content?locale=en")
    assert first.content == second.content
    assert builds == ["en"]


@pytest.mark.usefixtures("seeded")
async def test_an_admin_write_shows_on_the_public_content_at_once(
    admin_client: httpx.AsyncClient,
) -> None:
    def certification_ids(response: httpx.Response) -> list[str]:
        return [item["id"] for item in response.json()["skills"]["certifications"]]

    before = await admin_client.get("/api/v1/content?locale=en")
    assert "pmp" in certification_ids(before)
    assert (await admin_client.delete(f"{ADMIN}/content/certifications/pmp")).status_code == 204
    after = await admin_client.get("/api/v1/content?locale=en")
    assert "pmp" not in certification_ids(after)
    assert after.headers["etag"] != before.headers["etag"]
