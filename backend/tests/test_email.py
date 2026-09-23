import json
import logging
from typing import Any

import httpx
import pytest

from app.services.email import (
    ConsoleEmailProvider,
    EmailDeliveryError,
    OutgoingEmail,
    ResendEmailProvider,
    build_email_provider,
)
from tests.conftest import build_settings

URL = "https://resend.test/emails"
MESSAGE = OutgoingEmail(
    to="inbox@example.com",
    from_="noreply@owwsolution.com",
    reply_to="jane@example.com",
    subject="[owwsolution.com] New message from Jane",
    text="Name: Jane\n\nHello",
)


async def test_resend_posts_json_with_bearer_token() -> None:
    seen: list[tuple[str, dict[str, Any]]] = []

    def handler(request: httpx.Request) -> httpx.Response:
        assert str(request.url) == URL
        seen.append((request.headers["authorization"], json.loads(request.content)))
        return httpx.Response(200, json={"id": "email_123"})

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        await ResendEmailProvider("re_key", client, url=URL).send(MESSAGE)
    assert seen == [
        (
            "Bearer re_key",
            {
                "from": "noreply@owwsolution.com",
                "to": ["inbox@example.com"],
                "reply_to": "jane@example.com",
                "subject": "[owwsolution.com] New message from Jane",
                "text": "Name: Jane\n\nHello",
            },
        )
    ]


async def test_resend_omits_reply_to_when_absent() -> None:
    bodies: list[dict[str, Any]] = []

    def handler(request: httpx.Request) -> httpx.Response:
        bodies.append(json.loads(request.content))
        return httpx.Response(200, json={"id": "email_123"})

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        await ResendEmailProvider("re_key", client, url=URL).send(
            OutgoingEmail(to="a@b.test", from_="c@d.test", reply_to=None, subject="s", text="t")
        )
    assert "reply_to" not in bodies[0]


async def test_resend_error_status_raises() -> None:
    handler = lambda _: httpx.Response(422, json={"message": "invalid from"})  # noqa: E731
    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        with pytest.raises(EmailDeliveryError, match="422"):
            await ResendEmailProvider("re_key", client, url=URL).send(MESSAGE)


async def test_resend_network_failure_raises() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("refused", request=request)

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        with pytest.raises(EmailDeliveryError, match="request failed"):
            await ResendEmailProvider("re_key", client, url=URL).send(MESSAGE)


async def test_console_provider_logs_the_message(caplog: pytest.LogCaptureFixture) -> None:
    with caplog.at_level(logging.INFO, logger="app.services.email"):
        await ConsoleEmailProvider().send(MESSAGE)
    assert "[owwsolution.com] New message from Jane" in caplog.text
    assert "inbox@example.com" in caplog.text


async def test_provider_selection() -> None:
    async with httpx.AsyncClient() as client:
        console = build_email_provider(build_settings(EMAIL_PROVIDER="console"), client)
        assert isinstance(console, ConsoleEmailProvider)
        resend = build_email_provider(
            build_settings(EMAIL_PROVIDER="resend", RESEND_API_KEY="re_key"), client
        )
        assert isinstance(resend, ResendEmailProvider)
