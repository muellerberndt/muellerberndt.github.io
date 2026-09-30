#!/usr/bin/env python3
"""Build the Cadence social card from editable vector geometry.

Requires the existing Python Playwright/Pillow utilities and installed Chrome:
    python3 tools/build_social_card.py --preview-dir /tmp/pragma-card-preview

No external images or fonts are fetched. The canonical caret geometry comes
from favicon.svg. Published card filenames are immutable; use a fresh STEM for
subsequent designs. --svg-only writes the vector without launching a browser.
"""
from __future__ import annotations

import argparse
from pathlib import Path
from xml.etree import ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
STEM = 'pragma-settling-networks-2026-09'
WIDTH, HEIGHT = 1200, 630
ALT = ('Cadence: Brains that learn. Deep real-time settling networks. The Pragma '
       'Research caret above three bounded patches linked by state and error feedback.')


def vector():
    mark = next(node for node in ET.parse(ROOT / 'favicon.svg').getroot()
                if node.tag.endswith('polygon')).get('points')
    return f'''<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630" role="img" aria-labelledby="title description">
  <title id="title">Cadence. Brains that learn.</title>
  <desc id="description">{ALT} A schematic of recursive settling, not a measured network trace.</desc>
  <defs>
    <marker id="read-arrow" viewBox="0 0 12 12" refX="10" refY="6" markerWidth="12" markerHeight="12" markerUnits="userSpaceOnUse" orient="auto"><path d="M 1 1 L 11 6 L 1 11 Z" fill="#8fb8e8"/></marker>
    <marker id="return-arrow" viewBox="0 0 16 16" refX="13" refY="8" markerWidth="16" markerHeight="16" markerUnits="userSpaceOnUse" orient="auto"><path d="M 2 2 L 14 8 L 2 14 Z" fill="#f3f1e9"/></marker>
  </defs>
  <rect width="1200" height="630" fill="#191d1c"/>
  <g font-family="Arial, Helvetica, sans-serif">
    <!-- The company wordmark and the exact canonical caret. -->
    <text x="522" y="69" fill="#f3f1e9" font-size="23" font-weight="700" letter-spacing="3">PRAGMA</text>
    <text x="523" y="89" fill="#f3f1e9" font-size="10" font-weight="600" letter-spacing="4.9">RESEARCH</text>
    <g transform="translate(650 49) scale(.66) translate(-25 -15)"><polygon points="{mark}" fill="#8fb8e8"/></g>

    <!-- The product name stays readable in a 160-pixel thumbnail. -->
    <text x="600" y="231" text-anchor="middle" fill="#8fb8e8" font-size="138" font-weight="700" letter-spacing="-6">Cadence</text>
    <text x="600" y="310" text-anchor="middle" fill="#f3f1e9" font-size="60" font-weight="600" letter-spacing="-2.1">Brains that learn.</text>

    <!-- Readback and returning influence are distinct, bold paths. -->
    <g fill="none" stroke-linecap="round" stroke-linejoin="round">
      <path d="M 456 420 L 539 420 M 656 420 L 739 420" stroke="#8fb8e8" stroke-width="5" marker-end="url(#read-arrow)"/>
      <path d="M 544 452 L 461 452 M 744 452 L 661 452" stroke="#f3f1e9" stroke-width="3.5" marker-end="url(#return-arrow)"/>
      <path d="M 823 489 C 807 537 393 537 377 489" stroke="#f3f1e9" stroke-width="5" marker-end="url(#return-arrow)"/>
      <path d="M 421 385 C 486 345 714 345 779 385" stroke="#315d8a" stroke-width="4" marker-end="url(#read-arrow)"/>
    </g>

    <!-- Each bounded patch carries a state and a prediction mismatch. -->
    <g>
      <rect x="347" y="383" width="106" height="106" rx="21" fill="#315d8a" stroke="#8fb8e8" stroke-width="3"/>
      <rect x="373" y="413" width="53" height="10" rx="5" fill="#f3f1e9"/>
      <rect x="373" y="446" width="31" height="10" rx="5" fill="#8fb8e8"/>
      <rect x="547" y="383" width="106" height="106" rx="21" fill="#f3f1e9"/>
      <text x="561" y="425" fill="#191d1c" font-size="15" font-weight="600">state</text>
      <text x="561" y="454" fill="#315d8a" font-size="15" font-weight="600">error</text>
      <rect x="604" y="415" width="33" height="9" rx="4.5" fill="#191d1c"/>
      <rect x="604" y="444" width="18" height="9" rx="4.5" fill="#315d8a"/>
      <rect x="747" y="383" width="106" height="106" rx="21" fill="#315d8a" stroke="#8fb8e8" stroke-width="3"/>
      <rect x="773" y="413" width="53" height="10" rx="5" fill="#f3f1e9"/>
      <rect x="773" y="446" width="19" height="10" rx="5" fill="#8fb8e8"/>
    </g>
    <text x="600" y="585" text-anchor="middle" fill="#f3f1e9" font-size="25" letter-spacing="-.35">Deep real-time settling networks.</text>
  </g>
</svg>
'''


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--svg-only', action='store_true')
    parser.add_argument('--preview-dir', type=Path)
    args = parser.parse_args()
    svg_path = ROOT / 'assets' / f'{STEM}.svg'
    png_path = svg_path.with_suffix('.png')
    svg_path.write_text(vector())
    if args.svg_only:
        print(svg_path)
        return

    from playwright.sync_api import sync_playwright
    from PIL import Image

    with sync_playwright() as p:
        browser = p.chromium.launch(channel='chrome', headless=True)
        page = browser.new_page(viewport={'width': WIDTH, 'height': HEIGHT}, device_scale_factor=1)
        page.set_content('<!doctype html><html><head><style>html,body{margin:0;width:1200px;height:630px;overflow:hidden}svg{display:block}</style></head><body>' + vector() + '</body></html>')
        page.evaluate('document.fonts.ready')
        page.screenshot(path=str(png_path))
        browser.close()

    with Image.open(png_path) as card:
        assert card.size == (WIDTH, HEIGHT)
        if args.preview_dir:
            args.preview_dir.mkdir(parents=True, exist_ok=True)
            for size in [(256, 134), (160, 84)]:
                card.resize(size, Image.Resampling.LANCZOS).save(args.preview_dir / f'card-{size[0]}x{size[1]}.png')
            card.crop((285, 0, 915, 630)).resize((160, 160), Image.Resampling.LANCZOS).save(args.preview_dir / 'card-square-160.png')
    print(f'{svg_path}\n{png_path}\n{WIDTH}×{HEIGHT}; alt: {ALT}')


if __name__ == '__main__':
    main()
