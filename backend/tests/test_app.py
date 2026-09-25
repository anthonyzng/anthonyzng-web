"""Cross-cutting behaviour: error envelope, security headers, CORS, docs, request body cap."""

import json
import subprocess
import sys
from collections.abc import AsyncIterator

import httpx
import pytest
from fastapi import FastAPI
from sqlalchemy.ext.asyncio import AsyncEngine

from app.core.config import BACKEND_DIR, Settings
from app.core.middleware import MAX_REQUEST_BODY_BYTES
from tests.conftest import (
    TEST_ORIGIN,
    FakeTurnstile,
    RecordingEmailProvider,
    make_client,
    running_app,
)

TOO_LARGE = {"error": {"code": "payload_too_large", "message": "Request body too large."}}


def contact_body(size: int) -> bytes:
    """A syntactically valid contact request of exactly `size` bytes."""
    body = {"name": "Jane", "email": "jane@example.com", "turnstileToken": "t", "message": ""}
    overhead = len(json.dumps(body).encode())
    body["message"] = "x" * (size - overhead)
    encoded = json.dumps(body).encode()
    assert len(encoded) == size
    return encoded


def oversized_contact_body() -> bytes:
    return contact_body(MAX_REQUEST_BODY_BYTES + 1)


def test_importing_the_app_module_reads_no_settings() -> None:
    """The tests (and CI, which has no backend/.env) import `create_app` from `app.main`: the
    ASGI `app` must only be built when a server asks for it."""
    script = (
        "import app.main\n"
        "from app.core.config import get_settings\n"
        "assert get_settings.cache_info().currsize == 0, 'settings were read on import'\n"
    )
    result = subprocess.run(
        [sys.executable, "-c", script],
        cwd=BACKEND_DIR,
        capture_output=True,
        text=True,
        check=False,
    )
    assert result.returncode == 0, result.stderr


async def test_root_is_not_found(client: httpx.AsyncClient) -> None:
    response = await client.get("/")
    assert response.status_code == 404
    assert response.json() == {"error": {"code": "not_found", "message": "Not found."}}


async def test_unknown_api_route(client: httpx.AsyncClient) -> None:
    response = await client.get("/api/v1/nope")
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "not_found"


async def test_trailing_slash_is_not_redirected(client: httpx.AsyncClient) -> None:
    response = await client.get("/api/v1/health/")
    assert response.status_code == 404


async def test_wrong_method(client: httpx.AsyncClient) -> None:
    response = await client.get("/api/v1/contact")
    assert response.status_code == 405
    assert response.json() == {
        "error": {"code": "method_not_allowed", "message": "Method not allowed."}
    }
    assert "POST" in response.headers["allow"]


async def test_invalid_json_body(client: httpx.AsyncClient) -> None:
    response = await client.post(
        "/api/v1/contact", content=b"{not json", headers={"Content-Type": "application/json"}
    )
    assert response.status_code == 422
    body = response.json()
    assert body["error"]["code"] == "validation_error"
    assert list(body["error"]["fields"]) == ["body"]


async def test_missing_body(client: httpx.AsyncClient) -> None:
    response = await client.post("/api/v1/contact")
    assert response.status_code == 422
    assert "body" in response.json()["error"]["fields"]


async def test_unhandled_exception_is_masked(app: FastAPI) -> None:
    async def boom() -> None:
        raise RuntimeError("secret detail")

    app.add_api_route("/api/v1/boom", boom, methods=["GET"])
    async with make_client(app) as client:
        response = await client.get("/api/v1/boom", headers={"Origin": TEST_ORIGIN})
    assert response.status_code == 500
    assert response.json() == {"error": {"code": "internal_error", "message": "Unexpected error."}}
    assert "secret detail" not in response.text
    # Readable cross-origin, like every other error: the admin panel reports a server error
    # instead of "the server could not be reached".
    assert response.headers["access-control-allow-origin"] == TEST_ORIGIN
    assert response.headers["access-control-allow-credentials"] == "true"
    assert response.headers["x-content-type-options"] == "nosniff"


async def test_security_headers(client: httpx.AsyncClient) -> None:
    response = await client.get("/api/v1/health")
    assert response.headers["x-content-type-options"] == "nosniff"
    assert response.headers["x-frame-options"] == "DENY"
    assert response.headers["referrer-policy"] == "no-referrer"


async def test_cors_preflight_for_allowed_origin(client: httpx.AsyncClient) -> None:
    response = await client.options(
        "/api/v1/contact",
        headers={
            "Origin": TEST_ORIGIN,
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "content-type",
        },
    )
    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == TEST_ORIGIN
    assert response.headers["access-control-allow-credentials"] == "true"
    assert response.headers["access-control-max-age"] == "600"
    assert "content-type" in response.headers["access-control-allow-headers"].lower()


@pytest.mark.parametrize("method", ["PUT", "PATCH", "DELETE"])
async def test_cors_preflight_admits_the_admin_write_methods(
    client: httpx.AsyncClient, method: str
) -> None:
    """The admin panel (another origin in development and production) edits with credentials."""
    response = await client.options(
        "/api/v1/admin/content/experience/sksys",
        headers={"Origin": TEST_ORIGIN, "Access-Control-Request-Method": method},
    )
    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == TEST_ORIGIN
    assert response.headers["access-control-allow-credentials"] == "true"
    allowed = response.headers["access-control-allow-methods"].split(",")
    assert method in [value.strip() for value in allowed]


async def test_cors_actual_request_exposes_headers(client: httpx.AsyncClient) -> None:
    response = await client.get("/api/v1/content", headers={"Origin": TEST_ORIGIN})
    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == TEST_ORIGIN
    exposed = response.headers["access-control-expose-headers"]
    assert "ETag" in exposed
    assert "Retry-After" in exposed
    assert "origin" in response.headers["vary"].lower()


async def test_cors_disallowed_origin(client: httpx.AsyncClient) -> None:
    response = await client.get("/api/v1/health", headers={"Origin": "http://evil.test"})
    assert response.status_code == 200
    assert "access-control-allow-origin" not in response.headers


async def test_openapi_and_docs_are_served(client: httpx.AsyncClient) -> None:
    schema = await client.get("/api/v1/openapi.json")
    assert schema.status_code == 200
    paths = schema.json()["paths"]
    assert {"/api/v1/health", "/api/v1/content", "/api/v1/contact", "/api/v1/auth/login"} <= set(
        paths
    )
    docs = await client.get("/api/v1/docs")
    assert docs.status_code == 200
    assert "swagger" in docs.text.lower()


async def test_docs_are_not_published_in_production(
    engine: AsyncEngine,
    test_settings: Settings,
    turnstile: FakeTurnstile,
    mailbox: RecordingEmailProvider,
) -> None:
    settings = test_settings.model_copy(update={"APP_ENV": "production"})
    async with running_app(settings, turnstile, mailbox) as app, make_client(app) as client:
        for path in ("/api/v1/docs", "/api/v1/openapi.json", "/api/v1/docs/oauth2-redirect"):
            response = await client.get(path)
            assert response.status_code == 404, path
            assert response.json()["error"]["code"] == "not_found"
        assert (await client.get("/api/v1/health")).status_code == 200


async def test_declared_oversized_body_is_refused_before_any_work(
    client: httpx.AsyncClient, turnstile: FakeTurnstile
) -> None:
    response = await client.post(
        "/api/v1/contact",
        content=oversized_contact_body(),
        headers={"Content-Type": "application/json", "Origin": TEST_ORIGIN},
    )
    assert response.status_code == 413
    assert response.json() == TOO_LARGE
    # Still a well-formed API response: CORS lets the site read it, security headers are set.
    assert response.headers["access-control-allow-origin"] == TEST_ORIGIN
    assert response.headers["x-content-type-options"] == "nosniff"
    assert turnstile.calls == []
    # Refused before routing: no rate-limit slot was spent on it.
    for _ in range(5):
        assert (await client.post("/api/v1/contact", json={})).status_code == 422


async def test_streamed_oversized_body_is_cut_off(
    client: httpx.AsyncClient, turnstile: FakeTurnstile
) -> None:
    """No Content-Length (chunked): the body is counted as it arrives and refused at the cap."""
    body = oversized_contact_body()

    async def chunks() -> AsyncIterator[bytes]:
        for start in range(0, len(body), 8192):
            yield body[start : start + 8192]

    response = await client.post(
        "/api/v1/contact", content=chunks(), headers={"Content-Type": "application/json"}
    )
    assert "content-length" not in {name.lower() for name in response.request.headers}
    assert response.status_code == 413
    assert response.json() == TOO_LARGE
    # As on the fast path: the server drops the rest of the body instead of reading it.
    assert response.headers["connection"] == "close"
    assert turnstile.calls == []


async def test_body_at_the_cap_is_accepted_for_parsing(client: httpx.AsyncClient) -> None:
    """Exactly MAX_REQUEST_BODY_BYTES passes the cap (and then fails ordinary validation)."""
    response = await client.post(
        "/api/v1/contact",
        content=contact_body(MAX_REQUEST_BODY_BYTES),
        headers={"Content-Type": "application/json"},
    )
    assert response.status_code == 422
    assert list(response.json()["error"]["fields"]) == ["message"]
