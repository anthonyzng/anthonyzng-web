"""`/admin/content/*`: access rules, CRUD per collection, validation paths, reorder, summary."""

import copy
import json
from typing import Any

import httpx
import pytest

from app.services.collections import COLLECTIONS
from tests.conftest import TEST_ORIGIN

ADMIN = "/api/v1/admin"
READ_ONLY = ("updatedAt", "image")

NEW_EXPERIENCE: dict[str, Any] = {
    "slug": "newco",
    "sortOrder": 3,
    "company": "NewCo Ltd",
    "start": "2019-01",
    "end": "2020-06",
    "tech": ["Python", {"en": "Data pipelines", "zh-Hant": "數據管道"}],
    "translations": {
        "en": {"role": "Developer", "location": "Hong Kong", "bullets": ["Built things."]},
        "zh-Hant": {"role": "開發員", "location": "香港", "bullets": ["開發系統。"]},
    },
}


def writable(item: dict[str, Any]) -> dict[str, Any]:
    """An item as the admin sends it back: without the read-only fields."""
    return {key: value for key, value in item.items() if key not in READ_ONLY}


async def items(client: httpx.AsyncClient, collection: str) -> list[dict[str, Any]]:
    response = await client.get(f"{ADMIN}/content/{collection}")
    assert response.status_code == 200
    result: list[dict[str, Any]] = response.json()["items"]
    return result


# --- access -----------------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("method", "path"),
    [
        ("GET", "/summary"),
        ("GET", "/content/experience"),
        ("POST", "/content/experience"),
        ("PUT", "/content/experience/sksys"),
        ("DELETE", "/content/experience/sksys"),
        ("POST", "/content/experience/reorder"),
        ("PUT", "/cv"),
        ("GET", "/messages"),
    ],
)
async def test_admin_routes_require_a_session(
    client: httpx.AsyncClient, method: str, path: str
) -> None:
    response = await client.request(method, f"{ADMIN}{path}", json={})
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "unauthorized"


@pytest.mark.usefixtures("seeded")
async def test_foreign_origin_is_refused_on_writes(admin_client: httpx.AsyncClient) -> None:
    response = await admin_client.post(
        f"{ADMIN}/content/experience", json=NEW_EXPERIENCE, headers={"Origin": "http://evil.test"}
    )
    assert response.status_code == 403
    assert response.json()["error"]["code"] == "forbidden"
    assert all(item["slug"] != "newco" for item in await items(admin_client, "experience"))
    # The site's own origin, and a request without Origin (curl), are accepted.
    ok = await admin_client.post(
        f"{ADMIN}/content/experience", json=NEW_EXPERIENCE, headers={"Origin": TEST_ORIGIN}
    )
    assert ok.status_code == 201
    # Reads are not origin-checked.
    read = await admin_client.get(f"{ADMIN}/summary", headers={"Origin": "http://evil.test"})
    assert read.status_code == 200


async def test_foreign_origin_cannot_even_try_to_log_in(client: httpx.AsyncClient) -> None:
    response = await client.post(
        "/api/v1/auth/login",
        json={"email": "admin@example.com", "password": "x", "turnstileToken": "t"},
        headers={"Origin": "http://evil.test"},
    )
    assert response.status_code == 403


@pytest.mark.usefixtures("seeded")
async def test_admin_responses_are_never_cached(admin_client: httpx.AsyncClient) -> None:
    for path in ("/summary", "/content/experience", "/messages", "/cv"):
        response = await admin_client.get(f"{ADMIN}{path}")
        assert response.status_code == 200
        assert response.headers["cache-control"] == "no-store", path
    deleted = await admin_client.delete(f"{ADMIN}/content/certifications/pmp")
    assert deleted.status_code == 204
    assert deleted.headers["cache-control"] == "no-store"


async def test_admin_and_auth_errors_are_never_cached_either(client: httpx.AsyncClient) -> None:
    unauthorized = await client.get(f"{ADMIN}/summary")
    assert unauthorized.status_code == 401
    assert unauthorized.headers["cache-control"] == "no-store"
    refused = await client.post(
        "/api/v1/auth/login",
        json={"email": "someone@example.com", "password": "wrong", "turnstileToken": "t"},
    )
    assert refused.status_code == 401
    assert refused.headers["cache-control"] == "no-store"


async def test_unknown_collection(admin_client: httpx.AsyncClient) -> None:
    response = await admin_client.get(f"{ADMIN}/content/nope")
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "not_found"


# --- read -------------------------------------------------------------------------------------


@pytest.mark.usefixtures("seeded")
async def test_list_returns_both_locales_in_order(admin_client: httpx.AsyncClient) -> None:
    experience = await items(admin_client, "experience")
    assert [item["slug"] for item in experience] == ["sksys", "hactl", "ivc"]
    first = experience[0]
    assert set(first) == {
        "slug",
        "sortOrder",
        "company",
        "start",
        "end",
        "tech",
        "translations",
        "updatedAt",
    }
    assert first["end"] is None
    assert set(first["translations"]) == {"en", "zh-Hant"}
    assert first["translations"]["zh-Hant"]["role"]
    projects = await items(admin_client, "projects")
    assert all(project["image"] is None for project in projects)


@pytest.mark.usefixtures("seeded")
@pytest.mark.parametrize("collection", sorted(COLLECTIONS))
async def test_every_collection_round_trips_unchanged(
    admin_client: httpx.AsyncClient, collection: str
) -> None:
    """What the list returns, sent back as is, is accepted and changes nothing."""
    before = await items(admin_client, collection)
    assert before
    for item in before:
        response = await admin_client.put(
            f"{ADMIN}/content/{collection}/{item['slug']}", json=writable(item)
        )
        assert response.status_code == 200, response.json()
        assert writable(response.json()) == writable(item)
    after = await items(admin_client, collection)
    assert [writable(item) for item in after] == [writable(item) for item in before]


# --- create -------------------------------------------------------------------------------


@pytest.mark.usefixtures("seeded")
async def test_create_then_public_content_shows_it(admin_client: httpx.AsyncClient) -> None:
    response = await admin_client.post(f"{ADMIN}/content/experience", json=NEW_EXPERIENCE)
    assert response.status_code == 201
    created = response.json()
    assert writable(created) == NEW_EXPERIENCE
    assert created["updatedAt"]

    public = await admin_client.get("/api/v1/content", params={"locale": "zh-Hant"})
    newco = next(item for item in public.json()["experience"] if item["id"] == "newco")
    assert newco["role"] == "開發員"
    assert newco["tech"] == ["Python", "數據管道"]


@pytest.mark.usefixtures("seeded")
async def test_duplicate_slug_is_a_conflict(admin_client: httpx.AsyncClient) -> None:
    duplicate = {**NEW_EXPERIENCE, "slug": "sksys"}
    response = await admin_client.post(f"{ADMIN}/content/experience", json=duplicate)
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "conflict"


def without_order(item: dict[str, Any]) -> dict[str, Any]:
    return {key: value for key, value in item.items() if key != "sortOrder"}


def if_match(version: str) -> dict[str, str]:
    return {"If-Match": f'"{version}"'}


@pytest.mark.usefixtures("seeded")
async def test_new_rows_are_placed_by_the_server(admin_client: httpx.AsyncClient) -> None:
    """Sent without sortOrder: a role lands where the timeline wants it, anything else last."""
    current = {
        **without_order(NEW_EXPERIENCE),
        "slug": "nextrole",
        "start": "2025-01",
        "end": None,
    }
    assert (await admin_client.post(f"{ADMIN}/content/experience", json=current)).status_code == 201
    between = {**without_order(NEW_EXPERIENCE), "slug": "shortrole", "start": "2021-05"}
    between["end"] = "2021-07"
    assert (await admin_client.post(f"{ADMIN}/content/experience", json=between)).status_code == 201
    timeline = await items(admin_client, "experience")
    assert [item["slug"] for item in timeline] == ["nextrole", "sksys", "hactl", "shortrole", "ivc"]
    assert [item["sortOrder"] for item in timeline] == [0, 1, 2, 3, 4]

    certification = {"slug": "cka", "name": "CKA", "inProgress": True}
    created = await admin_client.post(f"{ADMIN}/content/certifications", json=certification)
    assert created.status_code == 201
    listed = await items(admin_client, "certifications")
    assert listed[-1]["slug"] == "cka"
    assert created.json()["sortOrder"] == max(item["sortOrder"] for item in listed[:-1]) + 1


@pytest.mark.usefixtures("seeded")
async def test_an_update_without_sort_order_keeps_the_order(
    admin_client: httpx.AsyncClient,
) -> None:
    item = (await items(admin_client, "experience"))[1]
    body = without_order(writable(item))
    body["translations"]["en"]["role"] = "Renamed"
    response = await admin_client.put(f"{ADMIN}/content/experience/{item['slug']}", json=body)
    assert response.status_code == 200
    assert response.json()["sortOrder"] == item["sortOrder"]
    assert [row["slug"] for row in await items(admin_client, "experience")][1] == item["slug"]


@pytest.mark.usefixtures("seeded")
async def test_if_match_refuses_to_overwrite_a_newer_version(
    admin_client: httpx.AsyncClient,
) -> None:
    item = (await items(admin_client, "experience"))[0]
    path = f"{ADMIN}/content/experience/{item['slug']}"
    first = writable(item)
    first["translations"]["en"]["role"] = "Saved first"
    saved = await admin_client.put(path, json=first, headers=if_match(item["updatedAt"]))
    assert saved.status_code == 200
    assert saved.json()["updatedAt"] != item["updatedAt"]

    stale = writable(item)
    stale["translations"]["en"]["role"] = "Edited in an older tab"
    refused = await admin_client.put(path, json=stale, headers=if_match(item["updatedAt"]))
    assert refused.status_code == 412
    assert refused.json()["error"]["code"] == "precondition_failed"
    for header in ("not a timestamp", '"2026-01-01T00:00:00"'):  # garbage, or no time zone
        response = await admin_client.put(path, json=stale, headers={"If-Match": header})
        assert response.status_code == 412
    current = [
        row for row in await items(admin_client, "experience") if row["slug"] == item["slug"]
    ]
    assert current[0]["translations"]["en"]["role"] == "Saved first"

    latest = await admin_client.put(path, json=stale, headers=if_match(saved.json()["updatedAt"]))
    assert latest.status_code == 200
    assert (await admin_client.put(path, json=first, headers={"If-Match": "*"})).status_code == 200


@pytest.mark.usefixtures("seeded")
async def test_reordering_does_not_change_the_content_version(
    admin_client: httpx.AsyncClient,
) -> None:
    before = {item["slug"]: item["updatedAt"] for item in await items(admin_client, "skill-groups")}
    response = await admin_client.post(
        f"{ADMIN}/content/skill-groups/reorder", json={"slugs": list(reversed(before))}
    )
    assert response.status_code == 200
    after = {item["slug"]: item["updatedAt"] for item in response.json()["items"]}
    assert after == before


async def test_a_long_bilingual_entry_fits_the_write_cap(admin_client: httpx.AsyncClient) -> None:
    """20 bullets of 1000 characters per locale (the model's limits) is ~80 KB of UTF-8 JSON."""
    body = copy.deepcopy(NEW_EXPERIENCE)
    body["translations"]["en"]["bullets"] = ["a" * 1000] * 20
    body["translations"]["zh-Hant"]["bullets"] = ["開" * 1000] * 20
    assert len(json.dumps(body, ensure_ascii=False).encode()) > 64 * 1024
    response = await admin_client.post(f"{ADMIN}/content/experience", json=body)
    assert response.status_code == 201, response.json()


@pytest.mark.parametrize(
    ("collection", "change", "field"),
    [
        ("experience", {"start": "２０２４-01"}, "start"),  # noqa: RUF001 - full-width digits
        ("experience", {"end": "٢٠٢١-01"}, "end"),  # Arabic-Indic digits
        ("experience", {"sortOrder": 2**31}, "sortOrder"),
    ],
)
async def test_numbers_are_ascii_and_in_range(
    admin_client: httpx.AsyncClient, collection: str, change: dict[str, Any], field: str
) -> None:
    response = await admin_client.post(
        f"{ADMIN}/content/{collection}", json={**NEW_EXPERIENCE, **change}
    )
    assert response.status_code == 422
    assert field in response.json()["error"]["fields"]


@pytest.mark.parametrize(
    "url",
    [
        "https://my site.com",
        "https://",
        "https://example.com:99999/",
        "https://%zz.com",
        "http://[::1",
    ],
)
async def test_project_links_must_be_urls_a_browser_can_parse(
    admin_client: httpx.AsyncClient, url: str
) -> None:
    """The public site drops a whole payload it cannot validate, so a bad link is refused here."""
    project = {
        "slug": "demo",
        "placeholder": False,
        "url": url,
        "tech": [],
        "translations": {
            "en": {"title": "Demo", "summary": "A demo."},
            "zh-Hant": {"title": "示範", "summary": "示範項目。"},
        },
    }
    response = await admin_client.post(f"{ADMIN}/content/projects", json=project)
    assert response.status_code == 422
    assert "url" in response.json()["error"]["fields"]
    project["url"] = "https://example.com/path?query=1#top"
    assert (await admin_client.post(f"{ADMIN}/content/projects", json=project)).status_code == 201


async def test_the_admin_panels_path_words_are_not_slugs(admin_client: httpx.AsyncClient) -> None:
    """`/admin/content/<collection>/new` is the panel's empty form: no item may be called `new`."""
    response = await admin_client.post(
        f"{ADMIN}/content/experience", json={**NEW_EXPERIENCE, "slug": "new"}
    )
    assert response.status_code == 422
    assert list(response.json()["error"]["fields"]) == ["slug"]
    assert await items(admin_client, "experience") == []


@pytest.mark.usefixtures("seeded")
@pytest.mark.parametrize(
    ("change", "field"),
    [
        (lambda body: body.update(slug="Bad Slug"), "slug"),
        (lambda body: body["translations"]["zh-Hant"].pop("role"), "translations.zh-Hant.role"),
        (lambda body: body["translations"]["en"].update(role="  "), "translations.en.role"),
        (lambda body: body["tech"].append(""), "tech.2"),
        (lambda body: body.update(start="2019-13"), "start"),
        (lambda body: body.update(end="2018-01"), "body"),
        (lambda body: body["translations"]["en"]["bullets"].append("One more."), "body"),
        (lambda body: body.update(updatedAt="2026-01-01T00:00:00Z"), "updatedAt"),
    ],
)
async def test_validation_errors_name_the_field(
    admin_client: httpx.AsyncClient, change: Any, field: str
) -> None:
    body = copy.deepcopy(NEW_EXPERIENCE)
    change(body)
    response = await admin_client.post(f"{ADMIN}/content/experience", json=body)
    assert response.status_code == 422
    error = response.json()["error"]
    assert error["code"] == "validation_error"
    assert field in error["fields"], error["fields"]


async def test_a_non_object_body_is_a_body_error(admin_client: httpx.AsyncClient) -> None:
    response = await admin_client.post(f"{ADMIN}/content/experience", json=["not", "an object"])
    assert response.status_code == 422
    assert list(response.json()["error"]["fields"]) == ["body"]


@pytest.mark.parametrize("content_type", ["text/plain", "application/x-www-form-urlencoded"])
async def test_writes_need_a_json_body(admin_client: httpx.AsyncClient, content_type: str) -> None:
    """An HTML form can only send text/plain, urlencoded or multipart bodies, and none of them is
    read as an item: a forged cross-site form post cannot write content (CSRF defence in depth)."""
    response = await admin_client.post(
        f"{ADMIN}/content/experience",
        content=json.dumps(NEW_EXPERIENCE),
        headers={"Content-Type": content_type},
    )
    assert response.status_code == 422
    assert all(item["slug"] != "newco" for item in await items(admin_client, "experience"))


# --- update / delete -----------------------------------------------------------------------


@pytest.mark.usefixtures("seeded")
async def test_update_changes_the_item(admin_client: httpx.AsyncClient) -> None:
    item = (await items(admin_client, "experience"))[0]
    body = writable(item)
    body["translations"]["en"]["role"] = "Lead Developer"
    response = await admin_client.put(f"{ADMIN}/content/experience/{item['slug']}", json=body)
    assert response.status_code == 200
    assert response.json()["translations"]["en"]["role"] == "Lead Developer"
    assert response.json()["updatedAt"] >= item["updatedAt"]


@pytest.mark.usefixtures("seeded")
async def test_update_cannot_rename_or_invent(admin_client: httpx.AsyncClient) -> None:
    item = writable((await items(admin_client, "experience"))[0])
    renamed = await admin_client.put(
        f"{ADMIN}/content/experience/{item['slug']}", json={**item, "slug": "other"}
    )
    assert renamed.status_code == 422
    assert list(renamed.json()["error"]["fields"]) == ["slug"]
    missing = await admin_client.put(
        f"{ADMIN}/content/experience/ghost", json={**item, "slug": "ghost"}
    )
    assert missing.status_code == 404


@pytest.mark.usefixtures("seeded")
async def test_delete(admin_client: httpx.AsyncClient) -> None:
    response = await admin_client.delete(f"{ADMIN}/content/certifications/pmp")
    assert response.status_code == 204
    assert response.content == b""
    assert response.headers["cache-control"] == "no-store"
    assert "pmp" not in [item["slug"] for item in await items(admin_client, "certifications")]
    again = await admin_client.delete(f"{ADMIN}/content/certifications/pmp")
    assert again.status_code == 404


# --- reorder ------------------------------------------------------------------------------


@pytest.mark.usefixtures("seeded")
async def test_reorder_rewrites_sort_order(admin_client: httpx.AsyncClient) -> None:
    slugs = [item["slug"] for item in await items(admin_client, "skill-groups")]
    reversed_slugs = list(reversed(slugs))
    response = await admin_client.post(
        f"{ADMIN}/content/skill-groups/reorder", json={"slugs": reversed_slugs}
    )
    assert response.status_code == 200
    reordered = response.json()["items"]
    assert [item["slug"] for item in reordered] == reversed_slugs
    assert [item["sortOrder"] for item in reordered] == list(range(len(slugs)))
    public = await admin_client.get("/api/v1/content")
    assert [group["id"] for group in public.json()["skills"]["groups"]] == reversed_slugs


@pytest.mark.usefixtures("seeded")
@pytest.mark.parametrize(
    "slugs",
    [
        ["frontend"],  # incomplete
        ["frontend", "frontend", "backend", "data", "cloud", "ai"],  # duplicate
        ["frontend", "backend", "data", "cloud", "ai", "ways", "ghost"],  # unknown
    ],
)
async def test_reorder_needs_every_slug_once(
    admin_client: httpx.AsyncClient, slugs: list[str]
) -> None:
    response = await admin_client.post(
        f"{ADMIN}/content/skill-groups/reorder", json={"slugs": slugs}
    )
    assert response.status_code == 422
    assert list(response.json()["error"]["fields"]) == ["slugs"]


async def test_site_texts_are_not_sortable(admin_client: httpx.AsyncClient) -> None:
    response = await admin_client.post(f"{ADMIN}/content/site-texts/reorder", json={"slugs": []})
    assert response.status_code == 404


# --- summary ------------------------------------------------------------------------------


@pytest.mark.usefixtures("seeded")
async def test_summary(admin_client: httpx.AsyncClient) -> None:
    response = await admin_client.get(f"{ADMIN}/summary")
    assert response.status_code == 200
    assert response.json() == {
        "counts": {
            "experience": 3,
            "projects": 2,
            "skill-groups": 6,
            "education": 1,
            "certifications": 3,
            "languages": 3,
            "contact-links": 3,
            "site-texts": 1,
        },
        "unreadMessages": 0,
        "cv": None,
    }
