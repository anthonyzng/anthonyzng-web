"""Cloudflare Turnstile server-side verification (`siteverify`)."""

import logging
from typing import Protocol

import httpx

logger = logging.getLogger(__name__)

SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify"
SITEVERIFY_TIMEOUT_SECONDS = 5.0


class TurnstileUnavailableError(Exception):
    """siteverify could not be reached or answered with something unusable."""


class TurnstileVerifier(Protocol):
    async def verify(self, token: str, remote_ip: str | None) -> bool:
        """True when Cloudflare accepts `token`; raises `TurnstileUnavailableError` otherwise."""
        ...


class CloudflareTurnstileVerifier:
    def __init__(
        self,
        secret: str,
        client: httpx.AsyncClient,
        *,
        url: str = SITEVERIFY_URL,
        timeout: float = SITEVERIFY_TIMEOUT_SECONDS,
    ) -> None:
        self._secret = secret
        self._client = client
        self._url = url
        self._timeout = timeout

    async def verify(self, token: str, remote_ip: str | None) -> bool:
        data = {"secret": self._secret, "response": token}
        if remote_ip:
            data["remoteip"] = remote_ip
        try:
            response = await self._client.post(self._url, data=data, timeout=self._timeout)
        except httpx.HTTPError as exc:
            raise TurnstileUnavailableError(f"siteverify request failed: {exc!r}") from exc
        if response.is_error:
            raise TurnstileUnavailableError(f"siteverify responded {response.status_code}")
        try:
            payload = response.json()
        except ValueError as exc:
            raise TurnstileUnavailableError("siteverify returned a non-JSON body") from exc
        if not isinstance(payload, dict) or not isinstance(payload.get("success"), bool):
            raise TurnstileUnavailableError("siteverify returned an unexpected body")
        if not payload["success"]:
            logger.info("Turnstile rejected a token: %s", payload.get("error-codes"))
            return False
        return True
