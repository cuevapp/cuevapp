"""Generate Google Play store-listing graphics from the brand icon.

Outputs (into store/play/):
  - icon-512.png              512x512 hi-res store icon (Play requirement)
  - feature-graphic-1024x500.png   1024x500 feature graphic (Play requirement)

Run:  .venv\\Scripts\\python.exe scripts\\gen_play_assets.py
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "web" / "assets" / "icon.png"
OUT = ROOT / "store" / "play"
OUT.mkdir(parents=True, exist_ok=True)

# Brand palette
DARK = (12, 10, 9)        # #0c0a09 app background
AMBER = (245, 158, 11)    # #f59e0b
CREAM = (250, 245, 230)
MUTED = (200, 196, 191)


def load_font(candidates, size):
    for name in candidates:
        try:
            return ImageFont.truetype(name, size)
        except OSError:
            continue
    return ImageFont.load_default()


SERIF = ["georgiab.ttf", "timesbd.ttf", "cambriab.ttf", "constanb.ttf"]
SANS = ["segoeui.ttf", "arial.ttf", "calibri.ttf"]


def rounded(img, radius):
    mask = Image.new("L", img.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, img.size[0] - 1, img.size[1] - 1],
                                           radius=radius, fill=255)
    out = img.convert("RGBA")
    out.putalpha(mask)
    return out


def make_icon_512():
    icon = Image.open(SRC).convert("RGB").resize((512, 512), Image.LANCZOS)
    path = OUT / "icon-512.png"
    icon.save(path, "PNG")
    return path


def make_feature_graphic():
    W, H = 1024, 500
    base = Image.new("RGB", (W, H), DARK)

    # Soft amber glow behind the logo (left third)
    glow = Image.new("L", (W, H), 0)
    gd = ImageDraw.Draw(glow)
    cx, cy = 300, H // 2
    gd.ellipse([cx - 330, cy - 330, cx + 330, cy + 330], fill=130)
    glow = glow.filter(ImageFilter.GaussianBlur(120))
    amber_layer = Image.new("RGB", (W, H), AMBER)
    base = Image.composite(amber_layer, base, glow)

    # Icon tile (rounded), vertically centered on the left
    tile = 300
    icon = Image.open(SRC).convert("RGB").resize((tile, tile), Image.LANCZOS)
    icon = rounded(icon, 64)
    base.paste(icon, (88, (H - tile) // 2), icon)

    d = ImageDraw.Draw(base)
    wordmark = load_font(SERIF, 150)
    tagline = load_font(SANS, 33)

    tx = 452
    # Vertically center the text block (wordmark + tagline)
    wm_bbox = d.textbbox((0, 0), "Cueva", font=wordmark)
    wm_h = wm_bbox[3] - wm_bbox[1]
    tg_bbox = d.textbbox((0, 0), "Your movie taste, fingerprinted.", font=tagline)
    tg_h = tg_bbox[3] - tg_bbox[1]
    gap = 28
    block_h = wm_h + gap + tg_h
    top = (H - block_h) // 2 - wm_bbox[1]

    d.text((tx, top), "Cueva", font=wordmark, fill=CREAM)
    d.text((tx + 6, top + wm_h + gap), "Your movie taste, fingerprinted.",
           font=tagline, fill=MUTED)

    path = OUT / "feature-graphic-1024x500.png"
    base.save(path, "PNG")
    return path


if __name__ == "__main__":
    p1 = make_icon_512()
    p2 = make_feature_graphic()
    for p in (p1, p2):
        im = Image.open(p)
        print(f"{p.relative_to(ROOT)}  {im.size[0]}x{im.size[1]}  {p.stat().st_size/1024:.0f} KB")
