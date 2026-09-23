"""Pure-ASGI middleware: defensive response headers, and a cap on request body size."""

from starlette.datastructures import Headers, MutableHeaders
from starlette.exceptions import HTTPException
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from app.core.errors import error_response, status_error

SECURITY_HEADERS: dict[str, str] = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "no-referrer",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
}

MAX_REQUEST_BODY_BYTES = 64 * 1024
"""Far above the largest valid request (a 5000-character message is at most ~20 KB of UTF-8)."""


class SecurityHeadersMiddleware:
    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        async def send_with_headers(message: Message) -> None:
            if message["type"] == "http.response.start":
                headers = MutableHeaders(scope=message)
                for name, value in SECURITY_HEADERS.items():
                    headers.setdefault(name, value)
            await send(message)

        await self.app(scope, receive, send_with_headers)


class RequestBodyTooLargeError(HTTPException):
    """Raised from `receive()` once a streamed body passes the cap.

    A Starlette `HTTPException` on purpose: FastAPI re-raises those from its body reader instead of
    turning them into a generic 400, so the registered handler answers 413 with the error envelope.
    """

    def __init__(self) -> None:
        super().__init__(status_code=413)


class RequestBodyLimitMiddleware:
    """Rejects request bodies over `max_bytes` before any of them is buffered or parsed.

    A declared `Content-Length` over the cap is answered at once, without calling the app (so no
    rate-limit slot or database work is spent). A body without one (chunked) is counted as it
    streams in and cut off at the cap. Added before CORS and the security headers so its responses
    still carry both.
    """

    def __init__(self, app: ASGIApp, max_bytes: int = MAX_REQUEST_BODY_BYTES) -> None:
        self.app = app
        self.max_bytes = max_bytes

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        declared = Headers(scope=scope).get("content-length")
        if declared is not None and declared.isdigit() and int(declared) > self.max_bytes:
            code, message = status_error(413)
            response = error_response(413, code, message, headers={"Connection": "close"})
            await response(scope, receive, send)
            return

        received = 0

        async def limited_receive() -> Message:
            nonlocal received
            message = await receive()
            if message["type"] == "http.request":
                received += len(message.get("body", b""))
                if received > self.max_bytes:
                    raise RequestBodyTooLargeError
            return message

        await self.app(scope, limited_receive, send)
