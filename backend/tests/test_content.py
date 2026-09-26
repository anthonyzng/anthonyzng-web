"""`GET /content`: resolved strings per locale, ordering, ETag / 304, validation."""

import hashlib
import json
from typing import Any

import httpx
import pytest
from sqlalchemy import delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.content import SiteText
from app.seed import SEED_PATH

CONTENT = "/api/v1/content"
LOCALES = ("en", "zh-Hant")


def raw_seed() -> dict[str, Any]:
    with SEED_PATH.open(encoding="utf-8") as handle:
        data: dict[str, Any] = json.load(handle)
    return data


def resolve(tag: Any, locale: str) -> str:
    return tag if isinstance(tag, str) else str(tag[locale])


def ordered(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return sorted(rows, key=lambda row: (row.get("sortOrder", 0), row["slug"]))


@pytest.mark.usefixtures("seeded")
@pytest.mark.parametrize("locale", LOCALES)
async def test_payload_matches_the_seed_for_locale(client: httpx.AsyncClient, locale: str) -> None:
    raw = raw_seed()
    response = await client.get(CONTENT, params={"locale": locale})
    assert response.status_code == 200
    assert response.headers["content-type"] == "application/json"
    body = response.json()
    assert body["locale"] == locale

    assert body["experience"] == [
        {
            "id": row["slug"],
            "company": row["company"],
            "companyUrl": row.get("companyUrl"),
            "role": row["translations"][locale]["role"],
            "location": row["translations"][locale]["location"],
            "start": row["start"],
            "end": row["end"],
            "bullets": row["translations"][locale]["bullets"],
            "tech": [resolve(tag, locale) for tag in row["tech"]],
        }
        for row in ordered(raw["experience"])
    ]
    assert body["projects"] == [
        {
            "id": row["slug"],
            "placeholder": row["placeholder"],
            "title": row["translations"][locale]["title"],
            "summary": row["translations"][locale]["summary"],
            "tech": [resolve(tag, locale) for tag in row["tech"]],
            "url": row["url"],
            "image": None,
        }
        for row in ordered(raw["projects"])
    ]
    assert body["skills"]["groups"] == [
        {
            "id": row["slug"],
            "label": row["translations"][locale]["label"],
            "items": [resolve(tag, locale) for tag in row["items"]],
        }
        for row in ordered(raw["skillGroups"])
    ]
    assert body["skills"]["education"] == [
        {
            "id": row["slug"],
            "degree": row["translations"][locale]["degree"],
            "school": row["school"],
            "year": row["year"],
        }
        for row in ordered(raw["education"])
    ]
    assert body["skills"]["certifications"] == [
        {"id": row["slug"], "name": row["name"], "inProgress": row["inProgress"]}
        for row in ordered(raw["certifications"])
    ]
    assert body["skills"]["languages"] == [
        {"id": row["slug"], "name": row["translations"][locale]["name"]}
        for row in ordered(raw["spokenLanguages"])
    ]
    assert body["contact"]["links"] == [
        {
            "id": row["slug"],
            "label": row["translations"][locale]["label"],
            "href": row["href"],
            "display": row["display"],
        }
        for row in ordered(raw["contactLinks"])
    ]
    location = next(row for row in raw["siteTexts"] if row["slug"] == "contact_location")
    assert body["contact"]["location"] == location["translations"][locale]["text"]
    # No CV uploaded yet.
    assert body["cv"] is None


@pytest.mark.usefixtures("seeded")
async def test_experience_is_newest_first_and_terms_are_translated(
    client: httpx.AsyncClient,
) -> None:
    english = (await client.get(CONTENT, params={"locale": "en"})).json()
    chinese = (await client.get(CONTENT, params={"locale": "zh-Hant"})).json()
    assert [row["id"] for row in english["experience"]] == ["sksys", "hactl", "ivc"]
    assert english["experience"][0]["end"] is None
    hactl_en = english["experience"][1]
    hactl_zh = chinese["experience"][1]
    assert "Data pipelines" in hactl_en["tech"]
    assert "數據管道" in hactl_zh["tech"]
    assert "Data pipelines" not in hactl_zh["tech"]
    assert hactl_en["company"] == hactl_zh["company"]
    assert english["skills"]["groups"][0]["label"] == "Front-end"
    assert chinese["skills"]["groups"][0]["label"] == "前端"


@pytest.mark.usefixtures("seeded")
async def test_default_locale_is_english(client: httpx.AsyncClient) -> None:
    response = await client.get(CONTENT)
    assert response.json()["locale"] == "en"


@pytest.mark.parametrize("locale", ["fr", "EN", "zh-hant", "zh_Hant", ""])
async def test_invalid_locale(client: httpx.AsyncClient, locale: str) -> None:
    response = await client.get(CONTENT, params={"locale": locale})
    assert response.status_code == 422
    body = response.json()
    assert body["error"]["code"] == "validation_error"
    assert list(body["error"]["fields"]) == ["locale"]


@pytest.mark.usefixtures("seeded")
async def test_unicode_is_not_escaped(client: httpx.AsyncClient) -> None:
    response = await client.get(CONTENT, params={"locale": "zh-Hant"})
    assert "香港".encode() in response.content
    assert b"\\u" not in response.content


@pytest.mark.usefixtures("seeded")
async def test_etag_and_cache_headers(client: httpx.AsyncClient) -> None:
    response = await client.get(CONTENT, params={"locale": "en"})
    etag = response.headers["etag"]
    assert etag == f'"{hashlib.sha256(response.content).hexdigest()}"'
    assert response.headers["cache-control"] == "public, max-age=60"
    again = await client.get(CONTENT, params={"locale": "en"})
    assert again.headers["etag"] == etag
    assert again.content == response.content
    other = await client.get(CONTENT, params={"locale": "zh-Hant"})
    assert other.headers["etag"] != etag


@pytest.mark.usefixtures("seeded")
@pytest.mark.parametrize("prefix", ["", "W/"])
async def test_if_none_match_returns_304(client: httpx.AsyncClient, prefix: str) -> None:
    first = await client.get(CONTENT, params={"locale": "en"})
    etag = first.headers["etag"]
    response = await client.get(
        CONTENT, params={"locale": "en"}, headers={"If-None-Match": f'"stale", {prefix}{etag}'}
    )
    assert response.status_code == 304
    assert response.content == b""
    assert response.headers["etag"] == etag
    assert response.headers["cache-control"] == "public, max-age=60"


@pytest.mark.usefixtures("seeded")
async def test_if_none_match_star_and_mismatch(client: httpx.AsyncClient) -> None:
    star = await client.get(CONTENT, headers={"If-None-Match": "*"})
    assert star.status_code == 304
    stale = await client.get(CONTENT, headers={"If-None-Match": '"0123abcd"'})
    assert stale.status_code == 200


async def test_empty_tables_give_empty_arrays(client: httpx.AsyncClient) -> None:
    response = await client.get(CONTENT, params={"locale": "zh-Hant"})
    assert response.status_code == 200
    assert response.json() == {
        "locale": "zh-Hant",
        "experience": [],
        "projects": [],
        "skills": {"groups": [], "education": [], "certifications": [], "languages": []},
        "contact": {"links": [], "location": ""},
        "cv": None,
    }


@pytest.mark.usefixtures("seeded")
async def test_missing_location_row_is_empty_string(
    client: httpx.AsyncClient, session: AsyncSession
) -> None:
    await session.execute(delete(SiteText))
    await session.commit()
    response = await client.get(CONTENT)
    assert response.status_code == 200
    assert response.json()["contact"]["location"] == ""
    assert len(response.json()["contact"]["links"]) == 3
