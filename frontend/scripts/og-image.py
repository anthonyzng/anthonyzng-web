"""Draws frontend/public/og-image.png (1200x630): the link-preview image, in the site's dark palette.

Needs Pillow and the installed Fontsource files; run it with the backend's environment:
    cd backend && python -m uv run python ../frontend/scripts/og-image.py
"""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
FONTS = ROOT / "node_modules"
BG, FG, MUTED, ACCENT, LINE = "#0b1120", "#f1f5f9", "#94a3b8", "#34d399", "#1e293b"


def font(relative: str, size: int, weight: int | None = None) -> ImageFont.FreeTypeFont:
    face = ImageFont.truetype(str(FONTS / relative), size)
    if weight is not None:
        face.set_variation_by_axes([weight])
    return face


inter = "@fontsource-variable/inter/files/inter-latin-wght-normal.woff2"
mono = "@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-400-normal.woff2"

image = Image.new("RGB", (1200, 630), BG)
draw = ImageDraw.Draw(image)
# The ghost numeral motif of the sections, faint on the right.
draw.text((1180, 640), "00", font=font(mono, 420), fill=LINE, anchor="rd")
draw.text((80, 150), "owwsolution.com", font=font(mono, 30), fill=ACCENT)
draw.text((76, 205), "Anthony Ng", font=font(inter, 128, 700), fill=FG)
draw.rectangle((80, 372, 200, 378), fill=ACCENT)
roles = ["Full Stack Software Developer", "AI Developer", "Assistant Manager, Software Development"]
for index, role in enumerate(roles):
    draw.text((80, 410 + index * 46), role, font=font(inter, 34, 500), fill=MUTED)
image.save(ROOT / "public" / "og-image.png", optimize=True)
print(image.size, (ROOT / "public" / "og-image.png").stat().st_size, "bytes")
