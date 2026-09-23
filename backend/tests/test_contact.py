"""`POST /contact`: honeypot, Turnstile outcomes, storage, delivery status, rate limit, and the
rule that the visitor's raw IP is never stored, emailed or logged (only its keyed hash)."""

import logging
from typing import Any

import httpx
import pytest
from fastapi import FastAPI
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession

from app.core.client_ip import fingerprint, hash_client_ip
from app.core.config import Settings
from app.models.contact_message import ContactMessage
from app.schemas.contact import ContactRequest
from app.services.contact import ContactOutcome, submit_contact
from app.services.email import EmailDeliveryError
from app.services.turnstile import TurnstileUnavailableError
from tests.conftest import (
    TEST_CONTACT_TO_EMAIL,
    TEST_IP_HASH_SECRET,
    FakeTurnstile,
    RecordingEmailProvider,
    make_client,
    running_app,
    services_of,
)

CONTACT = "/api/v1/contact"
VALID: dict[str, Any] = {
    "name": "Jane Doe",
    "email": "jane@example.com",
    "message": "Hello there, this is a test message.",
    "turnstileToken": "token-123",
    "website": "",
}


async def messages(session: AsyncSession) -> list[ContactMessage]:
    return list((await session.scalars(select(ContactMessage))).all())


def ip_hash(ip: str) -> str:
    digest = hash_client_ip(ip, TEST_IP_HASH_SECRET)
    assert digest is not None
    return digest


async def test_happy_path(
    client: httpx.AsyncClient,
    session: AsyncSession,
    turnstile: FakeTurnstile,
    mailbox: RecordingEmailProvider,
) -> None:
    response = await client.post(CONTACT, json=VALID, headers={"User-Agent": "pytest-agent"})
    assert response.status_code == 202
    assert response.json() == {"status": "accepted"}
    assert turnstile.calls == [("token-123", "127.0.0.1")]

    rows = await messages(session)
    assert len(rows) == 1
    row = rows[0]
    assert (row.name, row.email, row.message) == (
        "Jane Doe",
        "jane@example.com",
        VALID["message"],
    )
    # Turnstile needs the real address; the stored row only its keyed hash.
    assert row.ip_hash == ip_hash("127.0.0.1")
    assert row.user_agent == "pytest-agent"
    assert row.delivery_status == "sent"
    assert row.delivered_at is not None
    assert row.delivery_error is None

    assert len(mailbox.sent) == 1
    email = mailbox.sent[0]
    assert email.to == TEST_CONTACT_TO_EMAIL
    assert email.from_ == "noreply@owwsolution.com"
    assert email.reply_to == "jane@example.com"
    assert email.subject == "[owwsolution.com] New message from Jane Doe"
    assert email.text.startswith(
        "Name: Jane Doe\nEmail: jane@example.com\n"
        f"Source: {fingerprint(ip_hash('127.0.0.1'))} (hashed IP)\nReceived: "
    )
    assert email.text.endswith(f"\n\n{VALID['message']}")
    assert "127.0.0.1" not in email.text


async def test_whitespace_is_trimmed_and_subject_is_single_line(
    client: httpx.AsyncClient, session: AsyncSession, mailbox: RecordingEmailProvider
) -> None:
    payload = {**VALID, "name": "  Jane\nDoe  ", "message": "  Trimmed message body.  "}
    response = await client.post(CONTACT, json=payload)
    assert response.status_code == 202
    row = (await messages(session))[0]
    assert row.name == "Jane\nDoe"
    assert row.message == "Trimmed message body."
    assert mailbox.sent[0].subject == "[owwsolution.com] New message from Jane Doe"


async def test_honeypot_is_silently_accepted(
    client: httpx.AsyncClient,
    session: AsyncSession,
    turnstile: FakeTurnstile,
    mailbox: RecordingEmailProvider,
    caplog: pytest.LogCaptureFixture,
) -> None:
    with caplog.at_level(logging.INFO, logger="app.services.contact"):
        response = await client.post(CONTACT, json={**VALID, "website": "http://spam.test"})
    assert response.status_code == 202
    assert response.json() == {"status": "accepted"}
    assert turnstile.calls == []
    assert await messages(session) == []
    assert mailbox.sent == []
    # The log names the source by its hash fingerprint, never by address.
    assert f"source {fingerprint(ip_hash('127.0.0.1'))}" in caplog.text
    assert "127.0.0.1" not in caplog.text


@pytest.mark.parametrize(
    ("payload", "field"),
    [
        ({**VALID, "name": ""}, "name"),
        ({**VALID, "name": "x" * 101}, "name"),
        ({**VALID, "email": "nope"}, "email"),
        ({**VALID, "message": "short"}, "message"),
        ({**VALID, "message": "x" * 5001}, "message"),
        ({**VALID, "turnstileToken": ""}, "turnstileToken"),
        ({**VALID, "extra": 1}, "extra"),
    ],
)
async def test_validation_errors(
    client: httpx.AsyncClient, turnstile: FakeTurnstile, payload: dict[str, Any], field: str
) -> None:
    response = await client.post(CONTACT, json=payload)
    assert response.status_code == 422
    body = response.json()
    assert body["error"]["code"] == "validation_error"
    assert list(body["error"]["fields"]) == [field]
    assert turnstile.calls == []


async def test_all_missing_fields_are_reported(client: httpx.AsyncClient) -> None:
    response = await client.post(CONTACT, json={})
    assert response.status_code == 422
    assert set(response.json()["error"]["fields"]) == {"name", "email", "message", "turnstileToken"}


async def test_turnstile_rejection(
    client: httpx.AsyncClient,
    session: AsyncSession,
    turnstile: FakeTurnstile,
    mailbox: RecordingEmailProvider,
) -> None:
    turnstile.outcome = False
    response = await client.post(CONTACT, json=VALID)
    assert response.status_code == 400
    assert response.json() == {
        "error": {"code": "turnstile_failed", "message": "Verification failed. Please try again."}
    }
    assert await messages(session) == []
    assert mailbox.sent == []


async def test_turnstile_unavailable(
    client: httpx.AsyncClient, session: AsyncSession, turnstile: FakeTurnstile
) -> None:
    turnstile.outcome = TurnstileUnavailableError("down")
    response = await client.post(CONTACT, json=VALID)
    assert response.status_code == 503
    assert response.json() == {
        "error": {"code": "service_unavailable", "message": "Verification service unavailable."}
    }
    assert await messages(session) == []


async def test_delivery_failure_is_stored_but_still_accepted(
    client: httpx.AsyncClient, session: AsyncSession, mailbox: RecordingEmailProvider
) -> None:
    mailbox.failure = EmailDeliveryError("Resend responded 500: boom")
    response = await client.post(CONTACT, json=VALID)
    assert response.status_code == 202
    assert response.json() == {"status": "accepted"}
    row = (await messages(session))[0]
    assert row.delivery_status == "failed"
    assert row.delivery_error == "Resend responded 500: boom"
    assert row.delivered_at is None


async def test_rate_limit_per_ip(client: httpx.AsyncClient, app: FastAPI) -> None:
    for _ in range(5):
        assert (await client.post(CONTACT, json=VALID)).status_code == 202
    response = await client.post(CONTACT, json=VALID)
    assert response.status_code == 429
    assert response.json() == {
        "error": {"code": "rate_limited", "message": "Too many requests. Try again later."}
    }
    assert 1 <= int(response.headers["retry-after"]) <= 900
    async with make_client(app, client_ip="10.0.0.2") as other:
        assert (await other.post(CONTACT, json=VALID)).status_code == 202


async def test_rate_limit_counts_invalid_requests_too(client: httpx.AsyncClient) -> None:
    for _ in range(5):
        assert (await client.post(CONTACT, json={})).status_code == 422
    assert (await client.post(CONTACT, json={})).status_code == 429
    assert (await client.post(CONTACT, json=VALID)).status_code == 429


async def test_unknown_client_ip(
    app: FastAPI, session: AsyncSession, turnstile: FakeTurnstile, mailbox: RecordingEmailProvider
) -> None:
    async with make_client(app, client_ip="") as client:
        response = await client.post(CONTACT, json=VALID)
    assert response.status_code == 202
    assert turnstile.calls == [("token-123", None)]
    assert (await messages(session))[0].ip_hash is None
    assert "Source: unknown (hashed IP)" in mailbox.sent[0].text


async def test_a_raw_ip_can_never_be_stored(session: AsyncSession) -> None:
    session.add(ContactMessage(name="n", email="e@example.com", message="m", ip_hash="127.0.0.1"))
    with pytest.raises(IntegrityError, match="ip_hash_format"):
        await session.commit()


async def test_failed_status_update_still_accepts_the_stored_message(
    session: AsyncSession,
    test_settings: Settings,
    turnstile: FakeTurnstile,
    mailbox: RecordingEmailProvider,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """The row is stored and the email sent; if only the status update fails, the visitor must not
    get an error (it would make them send the message again)."""
    real_commit = session.commit
    commits = 0

    async def commit_then_fail() -> None:
        nonlocal commits
        commits += 1
        if commits == 2:
            raise SQLAlchemyError("database went away")
        await real_commit()

    monkeypatch.setattr(session, "commit", commit_then_fail)
    outcome = await submit_contact(
        session,
        ContactRequest.model_validate(VALID),
        settings=test_settings,
        client_ip="127.0.0.1",
        user_agent=None,
        verifier=turnstile,
        provider=mailbox,
    )
    assert outcome is ContactOutcome.ACCEPTED
    assert len(mailbox.sent) == 1
    monkeypatch.undo()
    session.expire_all()
    row = (await messages(session))[0]
    assert row.delivery_status == "pending"


async def test_trusted_proxy_uses_forwarded_ip(
    engine: AsyncEngine,
    test_settings: Settings,
    turnstile: FakeTurnstile,
    mailbox: RecordingEmailProvider,
) -> None:
    settings = test_settings.model_copy(update={"TRUSTED_PROXY": True})
    async with running_app(settings, turnstile, mailbox) as app, make_client(app) as client:
        response = await client.post(
            CONTACT, json=VALID, headers={"X-Forwarded-For": "1.1.1.1, 203.0.113.9"}
        )
        assert response.status_code == 202
        async with services_of(app).session_factory() as session:
            row = (await messages(session))[0]
    assert turnstile.calls == [("token-123", "203.0.113.9")]
    assert row.ip_hash == ip_hash("203.0.113.9")
    text = mailbox.sent[0].text
    assert f"Source: {fingerprint(ip_hash('203.0.113.9'))} (hashed IP)" in text
    assert "203.0.113.9" not in text
