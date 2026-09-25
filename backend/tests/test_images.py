"""`encode_cover_image`: the upload pipeline for project cover images (no database involved)."""

import io
import struct
import zlib
from typing import Any

import pytest
from PIL import Image, ImageCms
from PIL.PngImagePlugin import PngInfo

from app.services.files import (
    MAX_IMAGE_HEIGHT,
    MAX_IMAGE_WIDTH,
    FileRejectedError,
    encode_cover_image,
)

ORIENTATION = 0x0112


def encoded(image: Image.Image, image_format: str = "PNG", **save: Any) -> bytes:
    buffer = io.BytesIO()
    image.save(buffer, format=image_format, **save)
    return buffer.getvalue()


def decode(data: bytes) -> Image.Image:
    return Image.open(io.BytesIO(data))


def png_chunk(chunk_type: bytes, data: bytes) -> bytes:
    crc = zlib.crc32(chunk_type + data) & 0xFFFFFFFF
    return struct.pack(">I", len(data)) + chunk_type + data + struct.pack(">I", crc)


def small_photo() -> Image.Image:
    return Image.new("RGB", (64, 48), (10, 120, 200))


def png_with_text(key: str, value: str) -> bytes:
    info = PngInfo()
    info.add_text(key, value)
    return encoded(small_photo(), pnginfo=info)


def test_a_tall_image_is_scaled_to_fit_the_webp_limit() -> None:
    """WebP cannot encode a side over 16383 px: a full-page screenshot is scaled down to fit."""
    result = encode_cover_image(encoded(Image.new("L", (400, 20000), 128)))
    assert result.height == MAX_IMAGE_HEIGHT
    assert result.width == round(400 * MAX_IMAGE_HEIGHT / 20000)
    with decode(result.data) as decoded:
        assert decoded.format == "WEBP"
        assert decoded.size == (result.width, result.height)


def test_a_jpeg_with_a_multi_picture_segment_is_accepted() -> None:
    """Pillow names a JPEG with an MPF segment (phone and camera photos) "MPO"; it is a JPEG."""
    primary = Image.new("RGB", (800, 600), (180, 40, 40))
    raw = encoded(primary, "MPO", save_all=True, append_images=[Image.new("RGB", (400, 300))])
    assert decode(raw).format == "MPO"  # the case under test
    result = encode_cover_image(raw)
    assert (result.width, result.height) == (800, 600)


def test_a_large_rotated_jpeg_keeps_its_full_width() -> None:
    """Decoded at a reduced scale, but chosen after the camera's rotation: 6400x1800 turned upright
    is 1800 px wide, so it must not be decoded below 1600 px of its stored height."""
    exif = Image.Exif()
    exif[ORIENTATION] = 6
    raw = encoded(Image.new("RGB", (6400, 1800), (20, 90, 160)), "JPEG", exif=exif.tobytes())
    result = encode_cover_image(raw)
    assert (result.width, result.height) == (MAX_IMAGE_WIDTH, round(6400 * MAX_IMAGE_WIDTH / 1800))


@pytest.mark.parametrize(
    "raw",
    [
        encoded(small_photo(), exif=b"\xde\xad\xbe\xef" * 8),  # an eXIf chunk that is not TIFF
        png_with_text("Raw profile type exif", "not hex"),
        encoded(small_photo(), "JPEG", exif=b"Exif\x00\x00" + b"\xde\xad" * 16, dpi=(72, 72)),
    ],
    ids=["png-exif-chunk", "png-raw-profile", "jpeg-app1"],
)
def test_broken_metadata_is_ignored(raw: bytes) -> None:
    result = encode_cover_image(raw)
    assert (result.width, result.height) == (64, 48)


def test_a_broken_png_stream_is_unreadable() -> None:
    width = height = 64
    rows = b"".join(
        b"\x00" + bytes((x * 7 + y) & 0xFF for x in range(width * 3)) for y in range(height)
    )
    stream = zlib.compress(rows, 9)
    header = struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0)
    raw = (
        b"\x89PNG\r\n\x1a\n"
        + png_chunk(b"IHDR", header)
        + png_chunk(b"IDAT", stream[: len(stream) // 2])
        + png_chunk(b"\x00\x01\x02\x03", stream[len(stream) // 2 :])
        + png_chunk(b"IEND", b"")
    )
    with pytest.raises(FileRejectedError) as caught:
        encode_cover_image(raw)
    assert caught.value.code == "image_unreadable"


def grey_at(image: Image.Image, x: int) -> int:
    value = image.convert("L").getpixel((x, 0))
    assert isinstance(value, float | int)
    return round(value)


def test_16_bit_greyscale_keeps_its_tones() -> None:
    ramp = Image.new("I;16", (256, 1))
    ramp.putdata([value * 257 for value in range(256)])
    with decode(encode_cover_image(encoded(ramp)).data) as decoded:
        assert grey_at(decoded, 0) <= 2
        assert abs(grey_at(decoded, 128) - 128) <= 2
        assert grey_at(decoded, 255) >= 253


def test_an_rgb_colour_profile_is_kept() -> None:
    profile = ImageCms.ImageCmsProfile(ImageCms.createProfile("sRGB")).tobytes()
    raw = encoded(Image.new("RGB", (40, 30), (200, 30, 30)), icc_profile=profile)
    with decode(encode_cover_image(raw).data) as decoded:
        assert decoded.info.get("icc_profile") == profile


@pytest.mark.parametrize(
    ("raw", "code"),
    [
        (b"", "file_empty"),
        (b"definitely not an image", "file_type"),
        (encoded(Image.new("RGB", (20, 20)), "GIF"), "file_type"),
        # The JPEG signature, then nothing Pillow can read.
        (b"\xff\xd8\xff" + b"garbage" * 10, "image_unreadable"),
        (encoded(Image.new("1", (7000, 7000))), "image_too_many_pixels"),
    ],
    ids=["empty", "garbage", "gif", "broken-jpeg", "49-megapixels"],
)
def test_refusals_name_their_reason(raw: bytes, code: str) -> None:
    with pytest.raises(FileRejectedError) as caught:
        encode_cover_image(raw)
    assert caught.value.code == code
