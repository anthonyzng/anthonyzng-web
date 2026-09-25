from collections.abc import Callable
from urllib.parse import parse_qs

import httpx
import pytest

from app.main import site_hostnames
from app.services.turnstile import CloudflareTurnstileVerifier, TurnstileUnavailableError
from tests.conftest import build_settings

URL = "https://turnstile.test/siteverify"


def make_verifier(
    handler: Callable[[httpx.Request], httpx.Response],
) -> tuple[CloudflareTurnstileVerifier, httpx.AsyncClient]:
    client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    return CloudflareTurnstileVerifier("secret-key", client, url=URL), client


async def test_success_sends_form_fields() -> None:
    seen: list[dict[str, list[str]]] = []

    def handler(request: httpx.Request) -> httpx.Response:
        assert str(request.url) == URL
        assert request.headers["content-type"].startswith("application/x-www-form-urlencoded")
        seen.append(parse_qs(request.content.decode()))
        return httpx.Response(200, json={"success": True})

    verifier, client = make_verifier(handler)
    async with client:
        assert await verifier.verify("tok-1", "203.0.113.9") is True
    assert seen == [{"secret": ["secret-key"], "response": ["tok-1"], "remoteip": ["203.0.113.9"]}]


async def test_remoteip_is_omitted_when_unknown() -> None:
    seen: list[dict[str, list[str]]] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(parse_qs(request.content.decode()))
        return httpx.Response(200, json={"success": True})

    verifier, client = make_verifier(handler)
    async with client:
        await verifier.verify("tok-1", None)
    assert "remoteip" not in seen[0]


async def test_rejection_returns_false() -> None:
    verifier, client = make_verifier(
        lambda _: httpx.Response(200, json={"success": False, "error-codes": ["invalid-input"]})
    )
    async with client:
        assert await verifier.verify("tok", "1.1.1.1") is False


@pytest.mark.parametrize(
    "response",
    [
        httpx.Response(500, text="boom"),
        httpx.Response(200, text="<html>not json</html>"),
        httpx.Response(200, json={"unexpected": True}),
        httpx.Response(200, json=["nope"]),
    ],
)
async def test_unusable_answers_raise(response: httpx.Response) -> None:
    verifier, client = make_verifier(lambda _: response)
    async with client:
        with pytest.raises(TurnstileUnavailableError):
            await verifier.verify("tok", "1.1.1.1")


async def test_network_failure_raises() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ReadTimeout("timed out", request=request)

    verifier, client = make_verifier(handler)
    async with client:
        with pytest.raises(TurnstileUnavailableError, match="request failed"):
            await verifier.verify("tok", "1.1.1.1")


@pytest.mark.parametrize(
    ("hostname", "accepted"),
    [("owwsolution.com", True), ("evil.example", False), (None, False)],
)
async def test_production_accepts_only_tokens_solved_on_the_site(
    hostname: str | None, accepted: bool
) -> None:
    body: dict[str, object] = {"success": True}
    if hostname is not None:
        body["hostname"] = hostname
    client = httpx.AsyncClient(
        transport=httpx.MockTransport(lambda _: httpx.Response(200, json=body))
    )
    verifier = CloudflareTurnstileVerifier(
        "secret-key", client, url=URL, hostnames=frozenset({"owwsolution.com"})
    )
    async with client:
        assert await verifier.verify("token", None) is accepted


def test_site_hostnames_come_from_the_cors_origins() -> None:
    settings = build_settings(CORS_ORIGINS=["https://owwsolution.com", "http://localhost:5173"])
    assert site_hostnames(settings) == frozenset({"owwsolution.com", "localhost"})
