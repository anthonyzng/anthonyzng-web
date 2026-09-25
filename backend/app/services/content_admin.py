"""Admin operations on the content collections, the project cover images and the dashboard.

The order of a sortable collection belongs to the server: a new row the client sends without
`sortOrder` is placed here (an experience entry by date, anything else last), an update without
it keeps the stored order, and `reorder_items` rewrites it. Order changes and cover image changes
never touch `updated_at`, which stays the version of the row's editable content: an update may name
the version it was edited from (`If-Match`) and is refused when the row changed since. An image
upload in the middle of an edit therefore never moves that version, so it can neither hide a change
saved elsewhere nor make the edit's own save fail.
"""

import uuid
from collections.abc import Sequence
from datetime import datetime
from typing import Any

from pydantic import BaseModel
from sqlalchemy import delete, func, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.concurrency import run_in_threadpool

from app.models.contact_message import ContactMessage
from app.models.content import Project
from app.models.stored_file import StoredFile
from app.schemas.admin import SummaryOut
from app.schemas.content import ImageRef
from app.services.collections import COLLECTIONS, EXPERIENCE, PROJECTS, Collection
from app.services.files import (
    FileRejectedError,
    encode_cover_image,
    get_cv_ref,
    image_ref,
    new_cover_image,
)


class ItemNotFoundError(Exception):
    """No row with that slug in the collection."""


class SlugConflictError(Exception):
    """A row with that slug already exists."""


class ItemChangedError(Exception):
    """The row changed since the version the client edited (its `updated_at` differs)."""


class ItemRejectedError(Exception):
    """A request the write model accepts but the current state does not; reported on `field`."""

    def __init__(self, field: str, message: str) -> None:
        super().__init__(message)
        self.field = field
        self.message = message


RESERVED_SLUGS = frozenset({"new"})
"""Words of the admin panel's own paths: `/admin/content/<collection>/new` is the empty form."""


def _order_by(collection: Collection) -> list[Any]:
    model = collection.model
    return [model.sort_order, model.slug] if collection.sortable else [model.slug]


async def _image_refs(session: AsyncSession, rows: Sequence[Any]) -> dict[uuid.UUID, ImageRef]:
    ids = [row.image_id for row in rows if row.image_id is not None]
    if not ids:
        return {}
    files = await session.scalars(select(StoredFile).where(StoredFile.id.in_(ids)))
    return {file.id: image_ref(file) for file in files}


def _to_out(collection: Collection, row: Any, images: dict[uuid.UUID, ImageRef]) -> BaseModel:
    values = {**collection.from_row(row), "updated_at": row.updated_at}
    if collection is PROJECTS:
        values["image"] = images.get(row.image_id) if row.image_id is not None else None
    return collection.out_model.model_validate(values)


async def _item_out(session: AsyncSession, collection: Collection, row: Any) -> BaseModel:
    images = await _image_refs(session, [row]) if collection is PROJECTS else {}
    return _to_out(collection, row, images)


async def _get_row(
    session: AsyncSession, collection: Collection, slug: str, *, lock: bool = False
) -> Any:
    """The row, or ItemNotFoundError. `lock` takes it FOR UPDATE until the transaction ends, so a
    concurrent request on the same row waits and then sees this one's result."""
    row = await session.get(collection.model, slug, with_for_update=lock or None)
    if row is None:
        raise ItemNotFoundError(slug)
    return row


def _chronology(end: str | None, start: str) -> tuple[int, int]:
    """Timeline sort key: current roles first, then the latest start first (`YYYY-MM`, ASCII)."""
    return (0 if end is None else 1, -int(start.replace("-", "")))


async def _set_project_image_id(
    session: AsyncSession, slug: str, image_id: uuid.UUID | None
) -> None:
    """Point the project at another image without bumping `updated_at` (see the module doc)."""
    await session.execute(
        update(Project)
        .where(Project.slug == slug)
        .values(image_id=image_id, updated_at=Project.updated_at)
        .execution_options(synchronize_session=False)
    )


async def _set_sort_orders(
    session: AsyncSession, collection: Collection, orders: dict[str, int]
) -> None:
    """Write sort orders without bumping `updated_at` (an order change is not a content change)."""
    model = collection.model
    for slug, sort_order in orders.items():
        await session.execute(
            update(model)
            .where(model.slug == slug)
            .values(sort_order=sort_order, updated_at=model.updated_at)
            .execution_options(synchronize_session=False)
        )


async def _placed_sort_order(
    session: AsyncSession, collection: Collection, values: dict[str, Any]
) -> int:
    """The sort order of a new row sent without one. An experience entry goes where the timeline
    wants it (the rows after it move down one); anything else goes last."""
    model = collection.model
    if collection is not EXPERIENCE:
        highest = await session.scalar(select(func.max(model.sort_order)))
        return 0 if highest is None else highest + 1
    rows = list((await session.scalars(select(model).order_by(model.sort_order, model.slug))).all())
    new_key = _chronology(values["end_month"], values["start_month"])
    index = next(
        (
            position
            for position, row in enumerate(rows)
            if _chronology(row.end_month, row.start_month) > new_key
        ),
        len(rows),
    )
    changed: dict[str, int] = {}
    for position, row in enumerate(rows):
        target = position if position < index else position + 1
        if row.sort_order != target:
            changed[row.slug] = target
    await _set_sort_orders(session, collection, changed)
    return index


async def list_items(session: AsyncSession, collection: Collection) -> list[BaseModel]:
    result = await session.scalars(select(collection.model).order_by(*_order_by(collection)))
    rows = list(result.all())
    images = await _image_refs(session, rows) if collection is PROJECTS else {}
    return [_to_out(collection, row, images) for row in rows]


async def create_item(session: AsyncSession, collection: Collection, item: Any) -> BaseModel:
    if item.slug in RESERVED_SLUGS:
        raise ItemRejectedError("slug", f'"{item.slug}" is reserved; choose another slug.')
    if await session.get(collection.model, item.slug) is not None:
        raise SlugConflictError(item.slug)
    values = collection.to_row(item)
    if collection.sortable and values.get("sort_order") is None:
        values["sort_order"] = await _placed_sort_order(session, collection, values)
    row = collection.model(**values)
    session.add(row)
    try:
        await session.commit()
    except IntegrityError:
        await session.rollback()
        if await session.get(collection.model, item.slug) is not None:  # lost a race
            raise SlugConflictError(item.slug) from None
        raise
    await session.refresh(row)
    return await _item_out(session, collection, row)


async def update_item(
    session: AsyncSession,
    collection: Collection,
    slug: str,
    item: Any,
    *,
    expected_updated_at: datetime | None = None,
) -> BaseModel:
    """Replace the row's content. A `sortOrder` left out keeps the stored order. With
    `expected_updated_at` (the client's `If-Match`), a row changed since is refused."""
    if item.slug != slug:
        raise ItemRejectedError("slug", "The slug cannot be changed.")
    row = await _get_row(session, collection, slug, lock=True)
    if expected_updated_at is not None and row.updated_at != expected_updated_at:
        raise ItemChangedError(slug)
    if collection is PROJECTS and item.placeholder and row.image_id is not None:
        raise ItemRejectedError(
            "placeholder", "Remove the cover image before turning this into a placeholder."
        )
    for column, value in collection.to_row(item).items():
        if column == "slug" or (column == "sort_order" and value is None):
            continue
        setattr(row, column, value)
    await session.commit()
    await session.refresh(row)
    return await _item_out(session, collection, row)


async def delete_item(session: AsyncSession, collection: Collection, slug: str) -> None:
    row = await _get_row(session, collection, slug, lock=collection is PROJECTS)
    image_id = row.image_id if collection is PROJECTS else None
    await session.delete(row)
    await session.flush()
    if image_id is not None:
        await session.execute(delete(StoredFile).where(StoredFile.id == image_id))
    await session.commit()


async def reorder_items(
    session: AsyncSession, collection: Collection, slugs: list[str]
) -> list[BaseModel]:
    result = await session.execute(select(collection.model.slug, collection.model.sort_order))
    current: dict[str, int] = dict(result.tuples().all())
    if len(slugs) != len(set(slugs)) or set(slugs) != set(current):
        raise ItemRejectedError("slugs", "List every item of the collection exactly once.")
    changed = {slug: index for index, slug in enumerate(slugs) if current[slug] != index}
    await _set_sort_orders(session, collection, changed)
    await session.commit()
    return await list_items(session, collection)


async def set_project_image(session: AsyncSession, slug: str, raw: bytes) -> BaseModel:
    """Re-encode `raw` as the project's cover image; the previous image is deleted.

    The project is checked before the (slow) re-encoding and locked after it, so two overlapping
    uploads replace each other in turn and neither leaves its file behind.
    """
    project = await _get_row(session, PROJECTS, slug)
    if project.placeholder:
        raise FileRejectedError("image_placeholder", "A placeholder project has no cover image.")
    encoded = await run_in_threadpool(encode_cover_image, raw)
    project = await _locked_project(session, slug)
    if project.placeholder:  # changed while the image was being encoded
        raise FileRejectedError("image_placeholder", "A placeholder project has no cover image.")
    file = new_cover_image(encoded)
    session.add(file)
    await session.flush()  # the file row must exist before the project points at it
    previous = project.image_id
    await _set_project_image_id(session, slug, file.id)
    if previous is not None:
        await session.execute(delete(StoredFile).where(StoredFile.id == previous))
    await session.commit()
    await session.refresh(project)
    return _to_out(PROJECTS, project, {file.id: image_ref(file)})


async def _locked_project(session: AsyncSession, slug: str) -> Project:
    """The project re-read FOR UPDATE (its image may have changed since it was first read)."""
    project = await session.get(Project, slug, with_for_update=True, populate_existing=True)
    if project is None:
        raise ItemNotFoundError(slug)
    return project


async def remove_project_image(session: AsyncSession, slug: str) -> BaseModel:
    project: Project = await _get_row(session, PROJECTS, slug, lock=True)
    previous = project.image_id
    await _set_project_image_id(session, slug, None)
    if previous is not None:
        await session.execute(delete(StoredFile).where(StoredFile.id == previous))
    await session.commit()
    await session.refresh(project)
    return _to_out(PROJECTS, project, {})


async def summary(session: AsyncSession, *, totp_enabled: bool) -> SummaryOut:
    counts: dict[str, int] = {}
    for name, collection in COLLECTIONS.items():
        total = await session.scalar(select(func.count()).select_from(collection.model))
        counts[name] = total or 0
    unread = await session.scalar(
        select(func.count()).select_from(ContactMessage).where(ContactMessage.read_at.is_(None))
    )
    return SummaryOut(
        counts=counts,
        unread_messages=unread or 0,
        cv=await get_cv_ref(session),
        totp_enabled=totp_enabled,
    )
