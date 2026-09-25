"""The one error shape every non-2xx/3xx response uses.

    {"error": {"code": "<snake_case>", "message": "<developer-facing>", "fields": {...}}}

`fields` appears only on `validation_error`. FastAPI's default handlers for `HTTPException`,
`RequestValidationError`, 404/405 and unhandled exceptions are all replaced here.
"""

import logging
from collections.abc import Mapping
from http import HTTPStatus

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException

from app.schemas.errors import ErrorBody, ErrorResponse

logger = logging.getLogger(__name__)

_STATUS_CODES: dict[int, tuple[str, str]] = {
    400: ("bad_request", "Bad request."),
    401: ("unauthorized", "Authentication required."),
    403: ("forbidden", "Forbidden."),
    404: ("not_found", "Not found."),
    405: ("method_not_allowed", "Method not allowed."),
    413: ("payload_too_large", "Request body too large."),
    429: ("rate_limited", "Too many requests. Try again later."),
    500: ("internal_error", "Unexpected error."),
    503: ("service_unavailable", "Service unavailable."),
}


class ApiError(Exception):
    """An error the API reports deliberately, with a stable `code`."""

    def __init__(
        self,
        status_code: int,
        code: str,
        message: str,
        *,
        fields: Mapping[str, str] | None = None,
        headers: Mapping[str, str] | None = None,
    ) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.code = code
        self.message = message
        self.fields = dict(fields) if fields else None
        self.headers = dict(headers) if headers else None


class RateLimitedError(ApiError):
    def __init__(self, retry_after: int) -> None:
        code, message = _STATUS_CODES[429]
        super().__init__(429, code, message, headers={"Retry-After": str(max(1, retry_after))})


def error_response(
    status_code: int,
    code: str,
    message: str,
    *,
    fields: Mapping[str, str] | None = None,
    headers: Mapping[str, str] | None = None,
) -> JSONResponse:
    body = ErrorResponse(
        error=ErrorBody(code=code, message=message, fields=dict(fields) if fields else None)
    )
    return JSONResponse(
        status_code=status_code,
        content=body.model_dump(mode="json", exclude_none=True),
        headers=dict(headers) if headers else None,
    )


def status_error(status_code: int) -> tuple[str, str]:
    """The envelope's `(code, message)` for a bare HTTP status."""
    return _code_for_status(status_code)


def _code_for_status(status_code: int) -> tuple[str, str]:
    if status_code in _STATUS_CODES:
        return _STATUS_CODES[status_code]
    try:
        phrase = HTTPStatus(status_code).phrase
    except ValueError:
        phrase = "Error"
    return phrase.lower().replace(" ", "_").replace("-", "_"), f"{phrase}."


def _validation_fields(exc: RequestValidationError) -> dict[str, str]:
    """`fields` for a 422: location joined with `.` after dropping `body`/`query`/`path`."""
    fields: dict[str, str] = {}
    for error in exc.errors():
        loc = [str(part) for part in error.get("loc", ())]
        if error.get("type") == "json_invalid" or len(loc) <= 1:
            key = loc[0] if loc else "body"
        else:
            key = ".".join(loc[1:])
        fields.setdefault(key, str(error.get("msg", "Invalid value.")))
    return fields


async def _handle_api_error(_request: Request, exc: Exception) -> JSONResponse:
    assert isinstance(exc, ApiError)
    return error_response(
        exc.status_code, exc.code, exc.message, fields=exc.fields, headers=exc.headers
    )


async def _handle_http_exception(_request: Request, exc: Exception) -> JSONResponse:
    assert isinstance(exc, HTTPException)
    code, message = _code_for_status(exc.status_code)
    if exc.status_code not in _STATUS_CODES and isinstance(exc.detail, str) and exc.detail:
        message = exc.detail
    return error_response(exc.status_code, code, message, headers=exc.headers)


async def _handle_validation_error(_request: Request, exc: Exception) -> JSONResponse:
    assert isinstance(exc, RequestValidationError)
    return error_response(
        422, "validation_error", "Request validation failed.", fields=_validation_fields(exc)
    )


async def _handle_unexpected(request: Request, exc: Exception) -> JSONResponse:
    # The traceback is logged by the server (Starlette re-raises after this handler runs).
    # %r: an encoded newline in the path (%0a) cannot start a forged log line.
    logger.error("Unhandled %s on %s %r", type(exc).__name__, request.method, request.url.path)
    code, message = _STATUS_CODES[500]
    return error_response(500, code, message)


def register_exception_handlers(app: FastAPI) -> None:
    app.add_exception_handler(ApiError, _handle_api_error)
    app.add_exception_handler(HTTPException, _handle_http_exception)
    app.add_exception_handler(RequestValidationError, _handle_validation_error)
    app.add_exception_handler(Exception, _handle_unexpected)
