"""Uploaded files: validation, re-encoding, storage and the references the API hands out.

Project cover images are decoded and re-encoded as WebP (at most `MAX_IMAGE_WIDTH` wide and
`MAX_IMAGE_HEIGHT` tall): that strips EXIF (GPS included) and anything else hidden in the upload,
and bounds the served size. An RGB colour profile (Display P3, Adobe RGB) is kept, so browsers show
the colours the photo was taken in. The CV must be a PDF; it is stored as uploaded and served as an
attachment.
"""

import contextlib
import hashlib
import io
import re
import struct
import unicodedata
import uuid
from dataclasses import dataclass

from PIL import Image, ImageOps, UnidentifiedImageError
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.stored_file import FILE_KIND_CV, FILE_KIND_PROJECT_IMAGE, StoredFile
from app.schemas.content import CvRef, ImageRef

FILES_PATH = "/api/v1/files"

MAX_IMAGE_UPLOAD_BYTES = 8 * 1024 * 1024
MAX_CV_UPLOAD_BYTES = 10 * 1024 * 1024
MAX_IMAGE_PIXELS = 40_000_000
"""Checked from the header, before decoding: guards against decompression bombs."""
MAX_IMAGE_WIDTH = 1600
MAX_IMAGE_HEIGHT = 16383
"""WebP's own limit per side: a taller image (a full-page screenshot) is scaled down to fit."""
WEBP_QUALITY = 82
ACCEPTED_IMAGE_FORMATS = frozenset({"JPEG", "MPO", "PNG", "WEBP"})
OPENED_FORMATS = ("JPEG", "PNG", "WEBP")
"""The readers Pillow may use on an upload (its JPEG reader also returns MPO files)."""
"""MPO is how Pillow names a JPEG with a multi-picture (MPF) segment, common in phone photos."""
DRAFT_FORMATS = frozenset({"JPEG", "MPO"})
ROTATING_ORIENTATIONS = frozenset({5, 6, 7, 8})
"""EXIF orientations that turn the image a quarter: its stored height becomes the width."""
EXIF_ORIENTATION = 0x0112
IMAGE_CONTENT_TYPE = "image/webp"
CV_CONTENT_TYPE = "application/pdf"
PDF_MAGIC = b"%PDF-"
DEFAULT_CV_FILENAME = "CV.pdf"
MAX_FILENAME_LENGTH = 120
CV_LOCK_KEY = 0x6376
"""`pg_advisory_xact_lock` key that serialises CV replacements (the table admits one CV)."""


class FileRejectedError(Exception):
    """The upload is not acceptable.

    `code` is the stable reason the admin panel maps to its own translated message; the message is
    developer-facing (it goes into the error envelope's `fields.file`).
    """

    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code
        self.message = message


@dataclass(frozen=True, slots=True)
class EncodedImage:
    data: bytes
    width: int
    height: int


UNREADABLE_IMAGE_ERRORS = (
    UnidentifiedImageError,
    Image.DecompressionBombError,
    OSError,
    ValueError,
    SyntaxError,
    EOFError,
    struct.error,
)
"""What Pillow raises for broken files: a damaged chunk, a truncated stream, malformed metadata."""


def _unreadable() -> FileRejectedError:
    return FileRejectedError("image_unreadable", "The file is not a readable image.")


def _has_accepted_signature(raw: bytes) -> bool:
    """JPEG (also MPO), PNG or WebP by the file's first bytes."""
    return raw.startswith((b"\xff\xd8\xff", b"\x89PNG\r\n\x1a\n")) or (
        raw[:4] == b"RIFF" and raw[8:12] == b"WEBP"
    )


def _open_image(raw: bytes) -> Image.Image:
    """Read the header only (no pixels are decoded yet), with the accepted formats' readers only:
    Pillow never runs the parser of another format on an upload."""
    try:
        return Image.open(io.BytesIO(raw), formats=OPENED_FORMATS)
    except UNREADABLE_IMAGE_ERRORS as exc:
        raise _unreadable() from exc


def _orientation(image: Image.Image) -> int | None:
    """The EXIF orientation tag, or None when absent or unreadable (broken metadata is ignored)."""
    try:
        value = image.getexif().get(EXIF_ORIENTATION)
    except UNREADABLE_IMAGE_ERRORS:
        return None
    return value if isinstance(value, int) else None


def _to_8_bit(image: Image.Image) -> Image.Image:
    """16-bit and 32-bit greyscale scaled to 8 bits (`convert` would clip everything to white)."""
    transparency = image.info.get("transparency")
    grey = image.convert("I").point(lambda value: value * (1 / 257)).convert("L")
    if isinstance(transparency, int):
        grey.info["transparency"] = round(transparency / 257)
    return grey


def encode_cover_image(raw: bytes) -> EncodedImage:
    """Validate a JPEG / PNG / WebP upload and re-encode it as WebP.

    CPU-bound: call it through `run_in_threadpool`. A JPEG is decoded at the smallest scale that
    still yields `MAX_IMAGE_WIDTH` (after the camera's rotation), so a large photo never occupies
    full-resolution buffers.
    """
    if not raw:
        raise FileRejectedError("file_empty", "The file is empty.")
    if len(raw) > MAX_IMAGE_UPLOAD_BYTES:
        raise FileRejectedError("file_too_large", "The image is larger than 8 MB.")
    if not _has_accepted_signature(raw):
        raise FileRejectedError("file_type", "Upload a JPEG, PNG or WebP image.")
    image = _open_image(raw)
    if image.format not in ACCEPTED_IMAGE_FORMATS:  # pragma: no cover - the readers above only
        raise FileRejectedError("file_type", "Upload a JPEG, PNG or WebP image.")
    if image.width * image.height > MAX_IMAGE_PIXELS:
        raise FileRejectedError(
            "image_too_many_pixels", "The image is too large (40 megapixels at most)."
        )
    if image.format in DRAFT_FORMATS:
        rotated = _orientation(image) in ROTATING_ORIENTATIONS
        image.draft("RGB", (1, MAX_IMAGE_WIDTH) if rotated else (MAX_IMAGE_WIDTH, 1))
    try:
        image.load()
    except UNREADABLE_IMAGE_ERRORS as exc:
        raise _unreadable() from exc

    # Honour the camera orientation before EXIF is dropped; malformed metadata leaves the pixels
    # as stored.
    with contextlib.suppress(*UNREADABLE_IMAGE_ERRORS):
        ImageOps.exif_transpose(image, in_place=True)
    # Only an RGB profile describes the pixels that are written (a CMYK or grey one would not).
    icc_profile = image.info.get("icc_profile") if image.mode in ("RGB", "RGBA") else None
    if image.mode == "I" or image.mode.startswith("I;16"):
        image = _to_8_bit(image)
    has_alpha = "A" in image.getbands() or "transparency" in image.info
    if image.mode not in ("RGB", "RGBA") or (image.mode == "RGB" and has_alpha):
        image = image.convert("RGBA" if has_alpha else "RGB")
    scale = min(1.0, MAX_IMAGE_WIDTH / image.width, MAX_IMAGE_HEIGHT / image.height)
    if scale < 1:
        size = (max(1, round(image.width * scale)), max(1, round(image.height * scale)))
        image = image.resize(size, Image.Resampling.LANCZOS, reducing_gap=3.0)

    out = io.BytesIO()
    try:
        image.save(out, format="WEBP", quality=WEBP_QUALITY, icc_profile=icc_profile or None)
    except (ValueError, OSError) as exc:
        raise _unreadable() from exc
    return EncodedImage(data=out.getvalue(), width=image.width, height=image.height)


def cv_download_name(filename: str | None) -> str:
    """A safe download name from the uploaded one: no path, no control or quote characters, .pdf."""
    name = unicodedata.normalize("NFC", (filename or "").replace("\\", "/").rsplit("/", 1)[-1])
    name = re.sub(r'[\x00-\x1f\x7f"<>:|?*;]', "", name).strip(" .")
    if not name:
        return DEFAULT_CV_FILENAME
    if not name.lower().endswith(".pdf"):
        name = f"{name}.pdf"
    if len(name) > MAX_FILENAME_LENGTH:
        name = name[: MAX_FILENAME_LENGTH - 4].rstrip(" .") + ".pdf"
    return name


def validate_cv(raw: bytes) -> None:
    if not raw:
        raise FileRejectedError("file_empty", "The file is empty.")
    if len(raw) > MAX_CV_UPLOAD_BYTES:
        raise FileRejectedError("file_too_large", "The CV is larger than 10 MB.")
    if not raw.startswith(PDF_MAGIC):
        raise FileRejectedError("file_type", "Upload a PDF file.")


def new_file(
    *,
    kind: str,
    content_type: str,
    data: bytes,
    filename: str | None = None,
    width: int | None = None,
    height: int | None = None,
) -> StoredFile:
    return StoredFile(
        id=uuid.uuid4(),
        kind=kind,
        content_type=content_type,
        filename=filename,
        size=len(data),
        sha256=hashlib.sha256(data).hexdigest(),
        width=width,
        height=height,
        data=data,
    )


def file_url(file_id: uuid.UUID) -> str:
    return f"{FILES_PATH}/{file_id}"


def image_ref(file: StoredFile) -> ImageRef:
    if file.width is None or file.height is None:  # pragma: no cover - images always have both
        raise ValueError(f"stored file {file.id} has no dimensions")
    return ImageRef(url=file_url(file.id), width=file.width, height=file.height)


def cv_ref(file: StoredFile) -> CvRef:
    return CvRef(
        url=file_url(file.id),
        filename=file.filename or DEFAULT_CV_FILENAME,
        size=file.size,
        updated_at=file.created_at,
    )


async def get_cv_file(session: AsyncSession) -> StoredFile | None:
    """The CV's metadata (the bytes stay deferred)."""
    result = await session.scalars(select(StoredFile).where(StoredFile.kind == FILE_KIND_CV))
    return result.one_or_none()


async def get_cv_ref(session: AsyncSession) -> CvRef | None:
    file = await get_cv_file(session)
    return cv_ref(file) if file is not None else None


async def _lock_cv(session: AsyncSession) -> None:
    """Serialise CV changes until the transaction ends: two overlapping uploads would otherwise
    both delete the old CV and collide on the one-CV index."""
    await session.execute(select(func.pg_advisory_xact_lock(CV_LOCK_KEY)))


async def replace_cv(session: AsyncSession, raw: bytes, filename: str | None) -> CvRef:
    """Store `raw` as the one CV, replacing any previous one, in a single transaction."""
    validate_cv(raw)
    await _lock_cv(session)
    await session.execute(delete(StoredFile).where(StoredFile.kind == FILE_KIND_CV))
    file = new_file(
        kind=FILE_KIND_CV,
        content_type=CV_CONTENT_TYPE,
        data=raw,
        filename=cv_download_name(filename),
    )
    session.add(file)
    await session.commit()
    await session.refresh(file, ["created_at"])
    return cv_ref(file)


async def delete_cv(session: AsyncSession) -> None:
    await _lock_cv(session)
    await session.execute(delete(StoredFile).where(StoredFile.kind == FILE_KIND_CV))
    await session.commit()


def new_cover_image(encoded: EncodedImage) -> StoredFile:
    return new_file(
        kind=FILE_KIND_PROJECT_IMAGE,
        content_type=IMAGE_CONTENT_TYPE,
        data=encoded.data,
        width=encoded.width,
        height=encoded.height,
    )


async def get_file_meta(session: AsyncSession, file_id: uuid.UUID) -> StoredFile | None:
    """A stored file's metadata; its bytes stay in the database (`data` is deferred)."""
    result = await session.scalars(select(StoredFile).where(StoredFile.id == file_id))
    return result.one_or_none()


async def get_file_data(session: AsyncSession, file_id: uuid.UUID) -> bytes | None:
    data: bytes | None = await session.scalar(
        select(StoredFile.data).where(StoredFile.id == file_id)
    )
    return data


class FileBodyCache:
    """Recently served file bodies, bounded by their total size, least recently used out first.

    A file never changes under its id (a new upload gets a new id), so a cached body is always
    current; deletion is still checked on every request against the metadata, and a missing file is
    discarded here. Concurrent downloads of one file then share one bytes object instead of each
    holding its own copy, and the database sends the body once, not once per request. One process
    only (the app runs a single worker).
    """

    def __init__(self, max_bytes: int) -> None:
        self.max_bytes = max_bytes
        self._bodies: dict[uuid.UUID, bytes] = {}
        self._total = 0

    def get(self, file_id: uuid.UUID) -> bytes | None:
        body = self._bodies.pop(file_id, None)
        if body is not None:
            self._bodies[file_id] = body  # most recently used goes last
        return body

    def put(self, file_id: uuid.UUID, body: bytes) -> None:
        if len(body) > self.max_bytes:
            return
        self.discard(file_id)
        self._bodies[file_id] = body
        self._total += len(body)
        while self._total > self.max_bytes:
            oldest = next(iter(self._bodies))
            self._total -= len(self._bodies.pop(oldest))

    def discard(self, file_id: uuid.UUID) -> None:
        body = self._bodies.pop(file_id, None)
        if body is not None:
            self._total -= len(body)

    def clear(self) -> None:
        self._bodies.clear()
        self._total = 0


FILE_BODY_CACHE = FileBodyCache(64 * 1024 * 1024)
