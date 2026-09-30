#!/usr/bin/env python3
"""Render the simple SVG brand mark into browser and home-screen fallbacks.

Requires Pillow. Geometry and colors are read from favicon.svg so the fallback
icons stay in sync with the canonical vector, without any external font assets.
"""
import json
from pathlib import Path
from xml.etree import ElementTree as ET

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]


def render(size):
    svg = ET.parse(ROOT / "favicon.svg").getroot()
    scale = size * 4 / float(svg.get("viewBox").split()[2])
    image = Image.new("RGBA", (size * 4, size * 4))
    draw = ImageDraw.Draw(image)
    for element in svg:
        kind = element.tag.split("}")[-1]
        fill = element.get("fill")
        if kind == "rect":
            draw.rounded_rectangle((0, 0, float(element.get("width")) * scale,
                                    float(element.get("height")) * scale),
                                   radius=float(element.get("rx", "0")) * scale, fill=fill)
        elif kind == "polygon":
            points = [tuple(float(c) * scale for c in pair.split(','))
                      for pair in element.get("points").split()]
            draw.polygon(points, fill=fill)
    return image.resize((size, size), Image.Resampling.LANCZOS)


def main():
    render(48).save(ROOT / "favicon.ico", sizes=[(16, 16), (32, 32), (48, 48)])
    render(180).save(ROOT / "apple-touch-icon.png")
    icons = []
    for size in (192, 512):
        name = f"assets/pragma-icon-{size}.png"
        render(size).save(ROOT / name)
        icons.append({"src": "/" + name + "?v=5", "sizes": f"{size}x{size}", "type": "image/png"})
    manifest = {"name": "Pragma Research", "short_name": "Pragma", "start_url": "/",
                "display": "browser", "background_color": "#f3f1e9",
                "theme_color": "#f3f1e9", "icons": icons}
    (ROOT / "site.webmanifest").write_text(json.dumps(manifest, indent=2) + "\n")
    print("Built favicon, touch icon and web manifest from favicon.svg")


if __name__ == "__main__":
    main()
