from typing import Annotated

from fastapi import APIRouter, Query, Request, Response

from app.api.deps import SessionDep
from app.schemas.common import DEFAULT_LOCALE, Locale
from app.schemas.content import ContentPayload
from app.services.content import CACHE_CONTROL, etag_matches, get_content_document

router = APIRouter(tags=["content"])


@router.get(
    "/content",
    response_model=ContentPayload,
    responses={304: {"description": "Not modified (If-None-Match matched the ETag)"}},
)
async def get_content(
    request: Request,
    session: SessionDep,
    locale: Annotated[Locale, Query(description="Locale every string is resolved for.")] = (
        DEFAULT_LOCALE
    ),
) -> Response:
    document = await get_content_document(session, locale)
    headers = {"ETag": document.etag, "Cache-Control": CACHE_CONTROL}
    if etag_matches(request.headers.get("if-none-match"), document.etag):
        return Response(status_code=304, headers=headers)
    return Response(content=document.body, media_type="application/json", headers=headers)
