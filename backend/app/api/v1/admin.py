"""`/admin/*`: the admin panel's API. Every route needs the admin session cookie and refuses
foreign origins on state-changing methods; `Cache-Control: no-store` is added to every admin
response (errors included) by the security-headers middleware.

Content items are validated against the collection's write model here (the body type depends on
the `{collection}` segment), and validation errors keep the usual 422 envelope with dotted
`fields` keys (`translations.en.role`, `tech.3`; `body` for rules spanning several fields).
An update may carry `If-Match: "<updatedAt>"`: a row changed since answers 412
`precondition_failed`. An upload the server refuses answers 422 with a specific `code`
(`file_missing`, `file_empty`, `file_too_large`, `file_type`, `image_unreadable`,
`image_too_many_pixels`, `image_placeholder`) and the developer-facing text in `fields.file`.
"""

from collections.abc import AsyncIterator
from datetime import datetime
from typing import Annotated, Any, Literal

from fastapi import APIRouter, Body, Depends, Header, Path, Query, Request, Response
from fastapi.exceptions import RequestValidationError
from pydantic import BaseModel, ValidationError
from starlette.datastructures import UploadFile

from app.api.deps import (
    CurrentAdminDep,
    ServicesDep,
    SessionDep,
    get_current_admin,
    require_trusted_origin,
)
from app.core.errors import ApiError
from app.schemas.admin import (
    CvResponse,
    MessageOut,
    MessagesPage,
    MessageUpdate,
    ProjectOut,
    ReorderRequest,
    SummaryOut,
)
from app.schemas.common import Slug
from app.services.collections import COLLECTIONS, Collection
from app.services.content_admin import (
    ItemChangedError,
    ItemNotFoundError,
    ItemRejectedError,
    SlugConflictError,
    create_item,
    delete_item,
    list_items,
    remove_project_image,
    reorder_items,
    set_project_image,
    summary,
    update_item,
)
from app.services.files import FileRejectedError, delete_cv, get_cv_ref, replace_cv
from app.services.messages import MessageNotFoundError, delete_message, list_messages, set_read


async def clear_public_content_on_writes(
    request: Request, services: ServicesDep
) -> AsyncIterator[None]:
    """Every admin write drops the cached public `/content` (after the handler, once its changes
    are committed; a failed write clears it too, which is only a wasted rebuild)."""
    yield
    if request.method not in {"GET", "HEAD", "OPTIONS"}:
        services.content_cache.clear()


router = APIRouter(
    prefix="/admin",
    tags=["admin"],
    dependencies=[
        Depends(require_trusted_origin),
        Depends(get_current_admin),
        Depends(clear_public_content_on_writes),
    ],
)

JsonBody = Annotated[Any, Body()]
MAX_INT32 = 2**31 - 1
MAX_INT64 = 2**63 - 1
MessageId = Annotated[int, Path(ge=1, le=MAX_INT64)]


def _not_found() -> ApiError:
    return ApiError(404, "not_found", "Not found.")


def _field_error(field: str, message: str) -> ApiError:
    return ApiError(422, "validation_error", "Request validation failed.", fields={field: message})


def _file_error(exc: FileRejectedError) -> ApiError:
    return ApiError(422, exc.code, exc.message, fields={"file": exc.message})


def _changed_error() -> ApiError:
    return ApiError(
        412, "precondition_failed", "The item was changed since the version in If-Match."
    )


def parse_if_match(value: str | None) -> datetime | None:
    """The `updatedAt` an update was edited from, sent as `If-Match: "<updatedAt>"`.

    None when the header is absent or `*` (no check). Anything else that is not one aware
    ISO 8601 timestamp cannot match the row, so it is refused like a changed row.
    """
    if value is None or value.strip() == "*":
        return None
    tag = value.strip().removeprefix("W/").strip('"')
    try:
        parsed = datetime.fromisoformat(tag)
    except ValueError:
        raise _changed_error() from None
    if parsed.tzinfo is None:
        raise _changed_error()
    return parsed


def get_collection(collection: str) -> Collection:
    found = COLLECTIONS.get(collection)
    if found is None:
        raise _not_found()
    return found


CollectionDep = Annotated[Collection, Depends(get_collection)]


def parse_item(collection: Collection, payload: Any) -> BaseModel:
    """Validate against the collection's write model; errors read as if it were the body type."""
    try:
        return collection.write_model.model_validate(payload)
    except ValidationError as exc:
        errors = [{**error, "loc": ("body", *error["loc"])} for error in exc.errors()]
        raise RequestValidationError(errors) from exc


async def read_upload(request: Request) -> tuple[bytes, str | None]:
    """The one file of a `multipart/form-data` body, field `file`.

    Read here, after the admin dependencies ran, never as an endpoint parameter: FastAPI parses
    declared form fields before dependencies, which would let anyone upload before the auth check.
    """
    if not request.headers.get("content-type", "").startswith("multipart/form-data"):
        raise _file_error(
            FileRejectedError("file_missing", "Send the file as multipart/form-data.")
        )
    async with request.form(max_files=1, max_fields=1) as form:
        upload = form.get("file")
        if not isinstance(upload, UploadFile):
            raise _file_error(FileRejectedError("file_missing", "Choose a file to upload."))
        return await upload.read(), upload.filename


# --- dashboard ------------------------------------------------------------------------------


@router.get("/summary", response_model=SummaryOut)
async def get_summary(session: SessionDep, admin: CurrentAdminDep) -> SummaryOut:
    return await summary(session, totp_enabled=admin.totp_secret is not None)


# --- content collections --------------------------------------------------------------------


@router.get("/content/{collection}")
async def list_collection(collection: CollectionDep, session: SessionDep) -> dict[str, Any]:
    return {"items": await list_items(session, collection)}


@router.post("/content/{collection}", status_code=201)
async def create_collection_item(
    collection: CollectionDep, payload: JsonBody, session: SessionDep
) -> Any:
    item = parse_item(collection, payload)
    try:
        return await create_item(session, collection, item)
    except SlugConflictError as exc:
        raise ApiError(409, "conflict", "An item with this slug already exists.") from exc
    except ItemRejectedError as exc:
        raise _field_error(exc.field, exc.message) from exc


@router.put("/content/{collection}/{slug}")
async def update_collection_item(
    collection: CollectionDep,
    slug: str,
    payload: JsonBody,
    session: SessionDep,
    if_match: Annotated[str | None, Header()] = None,
) -> Any:
    item = parse_item(collection, payload)
    expected = parse_if_match(if_match)
    try:
        return await update_item(session, collection, slug, item, expected_updated_at=expected)
    except ItemNotFoundError as exc:
        raise _not_found() from exc
    except ItemChangedError as exc:
        raise _changed_error() from exc
    except ItemRejectedError as exc:
        raise _field_error(exc.field, exc.message) from exc


@router.delete("/content/{collection}/{slug}", status_code=204, response_class=Response)
async def delete_collection_item(
    collection: CollectionDep, slug: str, session: SessionDep
) -> Response:
    try:
        await delete_item(session, collection, slug)
    except ItemNotFoundError as exc:
        raise _not_found() from exc
    return Response(status_code=204)


@router.post("/content/{collection}/reorder")
async def reorder_collection(
    collection: CollectionDep, body: ReorderRequest, session: SessionDep
) -> dict[str, Any]:
    if not collection.sortable:
        raise _not_found()
    try:
        return {"items": await reorder_items(session, collection, body.slugs)}
    except ItemRejectedError as exc:
        raise _field_error(exc.field, exc.message) from exc


# --- project cover images -------------------------------------------------------------------


@router.put("/content/projects/{slug}/image", response_model=ProjectOut)
async def put_project_image(slug: Slug, request: Request, session: SessionDep) -> Any:
    raw, _filename = await read_upload(request)
    try:
        return await set_project_image(session, slug, raw)
    except ItemNotFoundError as exc:
        raise _not_found() from exc
    except FileRejectedError as exc:
        raise _file_error(exc) from exc


@router.delete("/content/projects/{slug}/image", response_model=ProjectOut)
async def delete_project_image(slug: Slug, session: SessionDep) -> Any:
    try:
        return await remove_project_image(session, slug)
    except ItemNotFoundError as exc:
        raise _not_found() from exc


# --- CV --------------------------------------------------------------------------------------


@router.get("/cv", response_model=CvResponse)
async def get_cv(session: SessionDep) -> CvResponse:
    return CvResponse(cv=await get_cv_ref(session))


@router.put("/cv", response_model=CvResponse)
async def put_cv(request: Request, session: SessionDep) -> CvResponse:
    raw, filename = await read_upload(request)
    try:
        return CvResponse(cv=await replace_cv(session, raw, filename))
    except FileRejectedError as exc:
        raise _file_error(exc) from exc


@router.delete("/cv", response_model=CvResponse)
async def remove_cv(session: SessionDep) -> CvResponse:
    await delete_cv(session)
    return CvResponse(cv=None)


# --- contact messages -----------------------------------------------------------------------


@router.get("/messages", response_model=MessagesPage)
async def get_messages(
    session: SessionDep,
    status: Literal["all", "unread"] = "all",
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
    offset: Annotated[int, Query(ge=0, le=MAX_INT32)] = 0,
    as_of: Annotated[datetime | None, Query(alias="asOf")] = None,
) -> MessagesPage:
    """`asOf` (from the first page's response) keeps later pages on the same set of messages."""
    return await list_messages(
        session, unread_only=status == "unread", limit=limit, offset=offset, as_of=as_of
    )


@router.patch("/messages/{message_id}", response_model=MessageOut)
async def patch_message(
    message_id: MessageId, body: MessageUpdate, session: SessionDep
) -> MessageOut:
    try:
        return await set_read(session, message_id, read=body.read)
    except MessageNotFoundError as exc:
        raise _not_found() from exc


@router.delete("/messages/{message_id}", status_code=204, response_class=Response)
async def remove_message(message_id: MessageId, session: SessionDep) -> Response:
    try:
        await delete_message(session, message_id)
    except MessageNotFoundError as exc:
        raise _not_found() from exc
    return Response(status_code=204)
