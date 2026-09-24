"""`GET /files/{id}`: the CV and project cover images.

Every upload gets a new random id, so a file's URL never changes content. Cover images are cached
for a year as `immutable` and served inline (re-encoded WebP). The CV is personal data: it is
served as a download with `private, no-cache`, so shared caches never keep it and a browser checks
back (a cheap 304) before reusing it, which makes a removed CV disappear at once.
`X-Content-Type-Options: nosniff` comes from the security-headers middleware.

The metadata is read on every request (a removed file is a 404 at once); the body comes from a
small in-process cache or, once, from the database, and a revalidation (304) never loads it.
"""

import uuid
from urllib.parse import quote

from fastapi import APIRouter, Request, Response

from app.api.deps import SessionDep
from app.core.errors import ApiError
from app.models.stored_file import FILE_KIND_CV
from app.services.content import etag_matches
from app.services.files import (
    DEFAULT_CV_FILENAME,
    FILE_BODY_CACHE,
    get_file_data,
    get_file_meta,
)

router = APIRouter(tags=["files"])

IMMUTABLE = "public, max-age=31536000, immutable"
REVALIDATE_PRIVATE = "private, no-cache"


def content_disposition(kind: str, filename: str | None) -> str:
    if kind != FILE_KIND_CV:
        return "inline"
    name = filename or DEFAULT_CV_FILENAME
    ascii_name = name.encode("ascii", "replace").decode("ascii").replace("?", "_")
    return f"attachment; filename=\"{ascii_name}\"; filename*=UTF-8''{quote(name)}"


def _not_found() -> ApiError:
    return ApiError(404, "not_found", "Not found.")


@router.get(
    "/files/{file_id}",
    response_class=Response,
    responses={
        200: {"description": "The file", "content": {"image/webp": {}, "application/pdf": {}}},
        304: {"description": "Not modified"},
    },
)
async def get_file(file_id: str, request: Request, session: SessionDep) -> Response:
    try:
        parsed = uuid.UUID(file_id)
    except ValueError as exc:
        raise _not_found() from exc
    file = await get_file_meta(session, parsed)
    if file is None:
        FILE_BODY_CACHE.discard(parsed)
        raise _not_found()
    headers = {
        "ETag": f'"{file.sha256}"',
        "Cache-Control": REVALIDATE_PRIVATE if file.kind == FILE_KIND_CV else IMMUTABLE,
        "Content-Disposition": content_disposition(file.kind, file.filename),
    }
    if etag_matches(request.headers.get("if-none-match"), headers["ETag"]):
        return Response(status_code=304, headers=headers)
    body = FILE_BODY_CACHE.get(parsed)
    if body is None:
        body = await get_file_data(session, parsed)
        if body is None:  # removed between the two reads
            raise _not_found()
        FILE_BODY_CACHE.put(parsed, body)
    return Response(content=body, media_type=file.content_type, headers=headers)
