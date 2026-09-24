"""Pure-ASGI middleware: defensive response headers, the 500 envelope, a cap on request bodies."""

import re
from collections.abc import Sequence

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
"""The default cap: far above any public request (a 5000-character message is at most ~20 KB of
UTF-8). Admin content writes and uploads get their own caps through `route_limits`."""


def _under(path: str, prefix: str) -> bool:
    return path == prefix or path.startswith(f"{prefix}/")


class SecurityHeadersMiddleware:
    """Adds the security headers to every response, and `Cache-Control: no-store` (unless the
    response sets its own) to every response under `no_store_prefixes` (admin and auth data, error
    responses included, must never sit in a browser or proxy cache)."""

    def __init__(self, app: ASGIApp, no_store_prefixes: Sequence[str] = ()) -> None:
        self.app = app
        self.no_store_prefixes = tuple(no_store_prefixes)

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        no_store = any(_under(scope["path"], prefix) for prefix in self.no_store_prefixes)

        async def send_with_headers(message: Message) -> None:
            if message["type"] == "http.response.start":
                headers = MutableHeaders(scope=message)
                for name, value in SECURITY_HEADERS.items():
                    headers.setdefault(name, value)
                if no_store:
                    headers.setdefault("Cache-Control", "no-store")
            await send(message)

        await self.app(scope, receive, send_with_headers)


class ServerErrorEnvelopeMiddleware:
    """Answers an unhandled exception with the 500 error envelope from inside the middleware stack.

    Starlette's own handler for `Exception` runs outermost, outside CORS and the security headers,
    so its 500 reaches the browser without `Access-Control-Allow-Origin` and a cross-origin caller
    sees a network failure instead of a server error. Added first (innermost), this sends the same
    envelope through those layers, then re-raises so the server still logs the traceback.
    """

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        started = False

        async def tracking_send(message: Message) -> None:
            nonlocal started
            if message["type"] == "http.response.start":
                started = True
            await send(message)

        try:
            await self.app(scope, receive, tracking_send)
        except Exception:
            if not started:
                code, message = status_error(500)
                await error_response(500, code, message)(scope, receive, send)
            raise


class RequestBodyTooLargeError(HTTPException):
    """Raised from `receive()` once a streamed body passes the cap.

    A Starlette `HTTPException` on purpose: FastAPI re-raises those from its body reader instead of
    turning them into a generic 400, so the registered handler answers 413 with the error envelope.
    `Connection: close`, as on the fast path: the server then drops the rest of the body instead of
    reading and discarding it on a kept-alive connection.
    """

    def __init__(self) -> None:
        super().__init__(status_code=413, headers={"Connection": "close"})


class RequestBodyLimitMiddleware:
    """Rejects request bodies over the cap before any of them is buffered or parsed.

    The cap is `max_bytes`, or the first `route_limits` entry whose path pattern matches (the
    upload routes). A declared `Content-Length` over the cap is answered at once, without calling
    the app (so no rate-limit slot or database work is spent). A body without one (chunked) is
    counted as it streams in and cut off at the cap. Added before CORS and the security headers
    so its responses still carry both.
    """

    def __init__(
        self,
        app: ASGIApp,
        max_bytes: int = MAX_REQUEST_BODY_BYTES,
        route_limits: Sequence[tuple[str, int]] = (),
    ) -> None:
        self.app = app
        self.max_bytes = max_bytes
        self.route_limits = [(re.compile(pattern), limit) for pattern, limit in route_limits]

    def limit_for(self, path: str) -> int:
        return next(
            (limit for pattern, limit in self.route_limits if pattern.fullmatch(path)),
            self.max_bytes,
        )

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        max_bytes = self.limit_for(scope["path"])
        declared = Headers(scope=scope).get("content-length")
        if declared is not None and declared.isdigit() and int(declared) > max_bytes:
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
                if received > max_bytes:
                    raise RequestBodyTooLargeError
            return message

        await self.app(scope, limited_receive, send)
