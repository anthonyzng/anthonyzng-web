"""Outgoing email through a pluggable provider: `console` (log only) or `resend` (HTTP API)."""

import logging
from dataclasses import dataclass
from typing import Protocol

import httpx

from app.core.config import Settings

logger = logging.getLogger(__name__)

RESEND_API_URL = "https://api.resend.com/emails"
RESEND_TIMEOUT_SECONDS = 10.0


class EmailDeliveryError(Exception):
    """The provider did not accept the message."""


@dataclass(frozen=True, slots=True)
class OutgoingEmail:
    to: str
    from_: str
    reply_to: str | None
    subject: str
    text: str


class EmailProvider(Protocol):
    async def send(self, message: OutgoingEmail) -> None:
        """Deliver `message`; raises `EmailDeliveryError` on failure."""
        ...


class ConsoleEmailProvider:
    """Development provider: writes the message to the log instead of sending it."""

    async def send(self, message: OutgoingEmail) -> None:
        logger.info(
            "Email (console provider)\nTo: %s\nFrom: %s\nReply-To: %s\nSubject: %s\n\n%s",
            message.to,
            message.from_,
            message.reply_to or "-",
            message.subject,
            message.text,
        )


class ResendEmailProvider:
    def __init__(
        self,
        api_key: str,
        client: httpx.AsyncClient,
        *,
        url: str = RESEND_API_URL,
        timeout: float = RESEND_TIMEOUT_SECONDS,
    ) -> None:
        self._api_key = api_key
        self._client = client
        self._url = url
        self._timeout = timeout

    async def send(self, message: OutgoingEmail) -> None:
        body: dict[str, object] = {
            "from": message.from_,
            "to": [message.to],
            "subject": message.subject,
            "text": message.text,
        }
        if message.reply_to:
            body["reply_to"] = message.reply_to
        try:
            response = await self._client.post(
                self._url,
                json=body,
                headers={"Authorization": f"Bearer {self._api_key}"},
                timeout=self._timeout,
            )
        except httpx.HTTPError as exc:
            raise EmailDeliveryError(f"Resend request failed: {exc!r}") from exc
        if response.is_error:
            raise EmailDeliveryError(
                f"Resend responded {response.status_code}: {response.text[:200]}"
            )


def build_email_provider(settings: Settings, client: httpx.AsyncClient) -> EmailProvider:
    if settings.EMAIL_PROVIDER == "resend":
        return ResendEmailProvider(settings.RESEND_API_KEY.get_secret_value(), client)
    return ConsoleEmailProvider()
