"""Uploads: project cover images and the CV, stored in PostgreSQL and served by `/files/{id}`."""

import asyncio
import hashlib
import io
from typing import Any

import httpx
import pytest
from PIL import Image
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.stored_file import StoredFile
from app.seed import SeedFile, seed_content
from app.services.files import MAX_IMAGE_UPLOAD_BYTES, cv_download_name

ADMIN = "/api/v1/admin"
PDF = b"%PDF-1.7\n% test CV\n1 0 obj\n<< >>\nendobj\ntrailer\n<< >>\n%%EOF\n"

PROJECT: dict[str, Any] = {
    "slug": "portfolio",
    "sortOrder": 5,
    "placeholder": False,
    "url": "https://owwsolution.com",
    "tech": ["React", "FastAPI"],
    "translations": {
        "en": {"title": "This site", "summary": "A bilingual portfolio."},
        "zh-Hant": {"title": "本網站", "summary": "雙語作品集。"},
    },
}


def image_bytes(size: tuple[int, int], image_format: str = "PNG", **save: Any) -> bytes:
    buffer = io.BytesIO()
    Image.new("RGB", size, (30, 120, 90)).save(buffer, format=image_format, **save)
    return buffer.getvalue()


def upload(
    content: bytes, filename: str = "file.bin", mime: str = "application/octet-stream"
) -> dict[str, tuple[str, bytes, str]]:
    return {"file": (filename, content, mime)}


async def create_project(client: httpx.AsyncClient, **overrides: Any) -> dict[str, Any]:
    response = await client.post(f"{ADMIN}/content/projects", json={**PROJECT, **overrides})
    assert response.status_code == 201, response.json()
    created: dict[str, Any] = response.json()
    return created


async def file_count(session: AsyncSession) -> int:
    return (await session.scalar(select(func.count()).select_from(StoredFile))) or 0


# --- project cover images -------------------------------------------------------------------


async def test_cover_image_is_resized_to_webp_and_served(
    admin_client: httpx.AsyncClient,
) -> None:
    await create_project(admin_client)
    response = await admin_client.put(
        f"{ADMIN}/content/projects/portfolio/image",
        files=upload(image_bytes((2400, 1200)), "shot.png", "image/png"),
    )
    assert response.status_code == 200, response.json()
    image = response.json()["image"]
    assert image["width"] == 1600
    assert image["height"] == 800
    assert image["url"].startswith("/api/v1/files/")

    served = await admin_client.get(image["url"])
    assert served.status_code == 200
    assert served.headers["content-type"] == "image/webp"
    assert served.headers["cache-control"] == "public, max-age=31536000, immutable"
    assert served.headers["content-disposition"] == "inline"
    assert served.headers["etag"] == f'"{hashlib.sha256(served.content).hexdigest()}"'
    with Image.open(io.BytesIO(served.content)) as decoded:
        assert decoded.format == "WEBP"
        assert decoded.size == (1600, 800)

    not_modified = await admin_client.get(
        image["url"], headers={"If-None-Match": served.headers["etag"]}
    )
    assert not_modified.status_code == 304

    public = await admin_client.get("/api/v1/content")
    project = next(item for item in public.json()["projects"] if item["id"] == "portfolio")
    assert project["image"] == image


async def test_camera_orientation_is_applied_and_metadata_dropped(
    admin_client: httpx.AsyncClient,
) -> None:
    exif = Image.Exif()
    exif[0x0112] = 6  # rotate 90 degrees clockwise for display
    exif[0x010F] = "Test Camera Maker"
    photo = image_bytes((300, 200), "JPEG", exif=exif.tobytes())
    await create_project(admin_client)
    response = await admin_client.put(
        f"{ADMIN}/content/projects/portfolio/image", files=upload(photo, "photo.jpg", "image/jpeg")
    )
    assert response.status_code == 200
    image = response.json()["image"]
    assert (image["width"], image["height"]) == (200, 300)
    served = await admin_client.get(image["url"])
    assert b"Test Camera Maker" not in served.content
    with Image.open(io.BytesIO(served.content)) as decoded:
        assert not decoded.getexif()


async def test_replacing_or_removing_the_image_deletes_the_old_file(
    admin_client: httpx.AsyncClient, session: AsyncSession
) -> None:
    await create_project(admin_client)
    path = f"{ADMIN}/content/projects/portfolio/image"
    first = (await admin_client.put(path, files=upload(image_bytes((40, 20))))).json()["image"]
    second = (await admin_client.put(path, files=upload(image_bytes((60, 20))))).json()["image"]
    assert first["url"] != second["url"]
    assert (await admin_client.get(first["url"])).status_code == 404
    assert await file_count(session) == 1

    removed = await admin_client.delete(path)
    assert removed.status_code == 200
    assert removed.json()["image"] is None
    assert (await admin_client.get(second["url"])).status_code == 404
    assert await file_count(session) == 0


async def test_image_changes_keep_the_content_version(admin_client: httpx.AsyncClient) -> None:
    """An image change is not a content change: an edit open meanwhile still saves with its
    If-Match, and one made from an older version is still refused."""
    created = await create_project(admin_client)
    version = {"If-Match": f'"{created["updatedAt"]}"'}
    path = f"{ADMIN}/content/projects/portfolio"
    uploaded = await admin_client.put(f"{path}/image", files=upload(image_bytes((40, 20))))
    assert uploaded.json()["updatedAt"] == created["updatedAt"]
    removed = await admin_client.delete(f"{path}/image")
    assert removed.json()["updatedAt"] == created["updatedAt"]

    edited = {**PROJECT, "tech": ["React"]}
    saved = await admin_client.put(path, json=edited, headers=version)
    assert saved.status_code == 200, saved.json()
    await admin_client.put(f"{path}/image", files=upload(image_bytes((40, 20))))
    stale = await admin_client.put(path, json=PROJECT, headers=version)
    assert stale.status_code == 412


async def test_deleting_the_project_deletes_its_image(
    admin_client: httpx.AsyncClient, session: AsyncSession
) -> None:
    await create_project(admin_client)
    image = (
        await admin_client.put(
            f"{ADMIN}/content/projects/portfolio/image", files=upload(image_bytes((40, 20)))
        )
    ).json()["image"]
    assert (await admin_client.delete(f"{ADMIN}/content/projects/portfolio")).status_code == 204
    assert (await admin_client.get(image["url"])).status_code == 404
    assert await file_count(session) == 0


@pytest.mark.parametrize(
    ("content", "code", "message"),
    [
        (b"", "file_empty", "empty"),
        (b"definitely not an image", "file_type", "JPEG, PNG or WebP"),
        (image_bytes((20, 20), "GIF"), "file_type", "JPEG, PNG or WebP"),
    ],
)
async def test_unacceptable_images_are_rejected(
    admin_client: httpx.AsyncClient, content: bytes, code: str, message: str
) -> None:
    await create_project(admin_client)
    response = await admin_client.put(
        f"{ADMIN}/content/projects/portfolio/image", files=upload(content)
    )
    assert response.status_code == 422
    error = response.json()["error"]
    assert error["code"] == code
    assert message in error["fields"]["file"]


async def test_decompression_bomb_is_refused_before_decoding(
    admin_client: httpx.AsyncClient,
) -> None:
    buffer = io.BytesIO()
    Image.new("1", (7000, 7000)).save(buffer, format="PNG")  # 49 MP, a few KB on disk
    await create_project(admin_client)
    response = await admin_client.put(
        f"{ADMIN}/content/projects/portfolio/image", files=upload(buffer.getvalue())
    )
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "image_too_many_pixels"
    assert "40 megapixels" in response.json()["error"]["fields"]["file"]


async def test_a_full_page_screenshot_becomes_a_cover(admin_client: httpx.AsyncClient) -> None:
    """Taller than WebP's 16383 px: scaled to fit instead of failing the encoder (a 500)."""
    await create_project(admin_client)
    response = await admin_client.put(
        f"{ADMIN}/content/projects/portfolio/image",
        files=upload(image_bytes((400, 20000)), "page.png", "image/png"),
    )
    assert response.status_code == 200, response.json()
    assert response.json()["image"]["height"] == 16383


async def test_an_upload_over_the_route_cap_is_refused(admin_client: httpx.AsyncClient) -> None:
    await create_project(admin_client)
    too_big = b"\0" * (MAX_IMAGE_UPLOAD_BYTES + 1024 * 1024 + 1)
    response = await admin_client.put(
        f"{ADMIN}/content/projects/portfolio/image", files=upload(too_big)
    )
    assert response.status_code == 413
    assert response.json()["error"]["code"] == "payload_too_large"


async def test_each_route_keeps_its_own_body_cap(admin_client: httpx.AsyncClient) -> None:
    """Uploads allow megabytes and content writes 512 KiB; everything else keeps 64 KiB."""
    headers = {"Content-Type": "application/json"}
    public = await admin_client.post(
        "/api/v1/contact", content=b"{" + b" " * (70 * 1024) + b"}", headers=headers
    )
    assert public.status_code == 413
    content_write = await admin_client.post(
        f"{ADMIN}/content/experience", content=b"{" + b" " * (600 * 1024) + b"}", headers=headers
    )
    assert content_write.status_code == 413
    within_cap = await admin_client.post(
        f"{ADMIN}/content/experience", content=b"{" + b" " * (70 * 1024) + b"}", headers=headers
    )
    assert within_cap.status_code == 422  # read and validated, not cut off


@pytest.mark.usefixtures("seeded")
async def test_placeholders_have_no_image(admin_client: httpx.AsyncClient) -> None:
    placeholder = await admin_client.put(
        f"{ADMIN}/content/projects/slotOne/image", files=upload(image_bytes((40, 20)))
    )
    assert placeholder.status_code == 422
    assert placeholder.json()["error"]["code"] == "image_placeholder"
    assert "placeholder" in placeholder.json()["error"]["fields"]["file"]

    await create_project(admin_client)
    await admin_client.put(
        f"{ADMIN}/content/projects/portfolio/image", files=upload(image_bytes((40, 20)))
    )
    as_placeholder = {
        **PROJECT,
        "placeholder": True,
        "url": None,
        "tech": [],
        "translations": {
            "en": {"title": None, "summary": None},
            "zh-Hant": {"title": None, "summary": None},
        },
    }
    response = await admin_client.put(f"{ADMIN}/content/projects/portfolio", json=as_placeholder)
    assert response.status_code == 422
    assert list(response.json()["error"]["fields"]) == ["placeholder"]


async def test_upload_needs_multipart_and_a_file(admin_client: httpx.AsyncClient) -> None:
    await create_project(admin_client)
    path = f"{ADMIN}/content/projects/portfolio/image"
    as_json = await admin_client.put(path, json={"file": "x"})
    assert as_json.status_code == 422
    assert as_json.json()["error"]["code"] == "file_missing"
    assert "multipart" in as_json.json()["error"]["fields"]["file"]
    wrong_field = await admin_client.put(path, files={"other": ("a.png", b"x", "image/png")})
    assert wrong_field.status_code == 422
    assert wrong_field.json()["error"]["code"] == "file_missing"
    assert "Choose a file" in wrong_field.json()["error"]["fields"]["file"]


async def test_unknown_project(admin_client: httpx.AsyncClient) -> None:
    response = await admin_client.put(
        f"{ADMIN}/content/projects/ghost/image", files=upload(image_bytes((40, 20)))
    )
    assert response.status_code == 404


async def test_uploads_need_a_session_before_any_body_is_read(
    client: httpx.AsyncClient,
) -> None:
    response = await client.put(
        f"{ADMIN}/content/projects/portfolio/image", files=upload(image_bytes((40, 20)))
    )
    assert response.status_code == 401


@pytest.mark.usefixtures("seeded")
async def test_reseeding_keeps_a_cover_image(
    admin_client: httpx.AsyncClient, session: AsyncSession, seed_data: SeedFile
) -> None:
    await create_project(admin_client)
    await admin_client.put(
        f"{ADMIN}/content/projects/portfolio/image", files=upload(image_bytes((40, 20)))
    )
    await seed_content(session, seed_data)
    projects = (await admin_client.get(f"{ADMIN}/content/projects")).json()["items"]
    assert next(item for item in projects if item["slug"] == "portfolio")["image"] is not None


# --- CV -------------------------------------------------------------------------------------


async def test_cv_upload_download_replace_delete(
    admin_client: httpx.AsyncClient, session: AsyncSession
) -> None:
    assert (await admin_client.get(f"{ADMIN}/cv")).json() == {"cv": None}

    uploaded = await admin_client.put(
        f"{ADMIN}/cv", files=upload(PDF, "Anthony Ng CV.pdf", "application/pdf")
    )
    assert uploaded.status_code == 200
    cv = uploaded.json()["cv"]
    assert cv["filename"] == "Anthony Ng CV.pdf"
    assert cv["size"] == len(PDF)
    assert cv["updatedAt"]

    download = await admin_client.get(cv["url"])
    assert download.status_code == 200
    assert download.content == PDF
    assert download.headers["content-type"] == "application/pdf"
    assert download.headers["content-disposition"] == (
        "attachment; filename=\"Anthony Ng CV.pdf\"; filename*=UTF-8''Anthony%20Ng%20CV.pdf"
    )
    # Personal data: no shared cache keeps it, and a browser revalidates, so a removal is final.
    assert download.headers["cache-control"] == "private, no-cache"
    revalidated = await admin_client.get(
        cv["url"], headers={"If-None-Match": download.headers["etag"]}
    )
    assert revalidated.status_code == 304

    public = await admin_client.get("/api/v1/content")
    assert public.json()["cv"] == cv
    summary = await admin_client.get(f"{ADMIN}/summary")
    assert summary.json()["cv"] == cv

    replaced = (
        await admin_client.put(f"{ADMIN}/cv", files=upload(PDF + b"% v2\n", "v2.pdf"))
    ).json()["cv"]
    assert replaced["url"] != cv["url"]
    assert (await admin_client.get(cv["url"])).status_code == 404
    assert await file_count(session) == 1

    deleted = await admin_client.delete(f"{ADMIN}/cv")
    assert deleted.json() == {"cv": None}
    assert (await admin_client.get(replaced["url"])).status_code == 404
    assert (await admin_client.get("/api/v1/content")).json()["cv"] is None


@pytest.mark.parametrize(
    ("content", "code", "message"),
    [(b"", "file_empty", "empty"), (b"<html>not a pdf</html>", "file_type", "PDF")],
)
async def test_cv_must_be_a_pdf(
    admin_client: httpx.AsyncClient, content: bytes, code: str, message: str
) -> None:
    response = await admin_client.put(f"{ADMIN}/cv", files=upload(content, "cv.pdf"))
    assert response.status_code == 422
    assert response.json()["error"]["code"] == code
    assert message in response.json()["error"]["fields"]["file"]


async def test_overlapping_uploads_leave_exactly_one_file_each(
    admin_client: httpx.AsyncClient, session: AsyncSession
) -> None:
    """Two CV uploads, and two cover uploads for one project, at the same time: each pair ends
    with one stored file (no orphan still served, no clash on the one-CV index)."""
    await create_project(admin_client)
    cvs = await asyncio.gather(
        *(admin_client.put(f"{ADMIN}/cv", files=upload(PDF + bytes([n]), "cv.pdf")) for n in (1, 2))
    )
    assert [response.status_code for response in cvs] == [200, 200]
    covers = await asyncio.gather(
        *(
            admin_client.put(
                f"{ADMIN}/content/projects/portfolio/image", files=upload(image_bytes((40 + n, 20)))
            )
            for n in (1, 2)
        )
    )
    assert [response.status_code for response in covers] == [200, 200]
    kinds = (await session.scalars(select(StoredFile.kind).order_by(StoredFile.kind))).all()
    assert list(kinds) == ["cv", "project_image"]


@pytest.mark.parametrize(
    ("uploaded", "served"),
    [
        ("C:\\Users\\me\\Anthony CV.pdf", "Anthony CV.pdf"),
        ("../../etc/cv", "cv.pdf"),
        ('evil";\r\nX-Header: 1.pdf', "evilX-Header 1.pdf"),
        ("", "CV.pdf"),
        (None, "CV.pdf"),
        ("履歷.pdf", "履歷.pdf"),
    ],
)
def test_cv_download_name_is_sanitised(uploaded: str | None, served: str) -> None:
    assert cv_download_name(uploaded) == served


async def test_non_ascii_cv_name_is_encoded_for_the_header(admin_client: httpx.AsyncClient) -> None:
    cv = (await admin_client.put(f"{ADMIN}/cv", files=upload(PDF, "履歷.pdf"))).json()["cv"]
    download = await admin_client.get(cv["url"])
    assert download.headers["content-disposition"] == (
        "attachment; filename=\"__.pdf\"; filename*=UTF-8''%E5%B1%A5%E6%AD%B7.pdf"
    )


# --- public file endpoint ----------------------------------------------------------------


@pytest.mark.parametrize("file_id", ["not-a-uuid", "00000000-0000-0000-0000-000000000000"])
async def test_unknown_files_are_not_found(client: httpx.AsyncClient, file_id: str) -> None:
    response = await client.get(f"/api/v1/files/{file_id}")
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "not_found"
