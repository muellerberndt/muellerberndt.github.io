#!/usr/bin/env python3
"""Build the public investor PDF from the shared HTML deck body.

Install reportlab and pypdf, then run from any directory:
    python3 tools/build_investor_pdf.py

The embedded fonts ship with ReportLab, so the build needs no font download or
system font installation. All slide copy and links come from the HTML partial.
The renderer rejects overflowing slides and checks extracted text after writing.
"""

from __future__ import annotations

import argparse
from dataclasses import dataclass, field
from html import escape
from html.parser import HTMLParser
from pathlib import Path
import re
from urllib.parse import urljoin

import reportlab
from reportlab.lib.colors import HexColor
from reportlab.lib.styles import ParagraphStyle
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas
from reportlab.platypus import Paragraph
from pypdf import PdfReader


SITE = Path(__file__).resolve().parents[1]
WIDTH, HEIGHT = 960, 540
MARGIN, FOOTER = 54, 38
IVORY = HexColor("#f3f1e9")
INK = HexColor("#191d1c")
LIME = HexColor("#dcf664")
MUTED = HexColor("#626a64")
LINE = HexColor("#cbd0c5")
CARD = HexColor("#e9e9df")
WHITE = HexColor("#ffffff")
VOID = {"area", "base", "br", "col", "embed", "hr", "img", "input", "link",
        "meta", "param", "source", "track", "wbr"}


@dataclass
class Node:
    tag: str
    attrs: dict[str, str | None] = field(default_factory=dict)
    children: list["Node | str"] = field(default_factory=list)

    @property
    def classes(self) -> set[str]:
        return set((self.attrs.get("class") or "").split())

    @property
    def blocks(self) -> list["Node"]:
        return [child for child in self.children if isinstance(child, Node)]


class DeckParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.root = Node("root")
        self.stack = [self.root]

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        node = Node(tag, dict(attrs))
        self.stack[-1].children.append(node)
        if tag not in VOID:
            self.stack.append(node)

    def handle_endtag(self, tag: str) -> None:
        if len(self.stack) == 1 or self.stack[-1].tag != tag:
            raise ValueError(f"Unbalanced deck HTML at </{tag}>")
        self.stack.pop()

    def handle_data(self, data: str) -> None:
        self.stack[-1].children.append(data)


def normalize(text: str) -> str:
    text = text.replace("\u2192", ">").replace("\u2190", "<")
    for dash in "\u2010\u2011\u2012\u2013\u2014\u2212":
        text = text.replace(dash, "-")
    return re.sub(r"\s+", " ", text).strip()


def plain(node: Node | str) -> str:
    if isinstance(node, str):
        return node
    if node.tag == "br":
        return " "
    return " ".join(plain(child) for child in node.children)


def inline(node: Node | str) -> str:
    if isinstance(node, str):
        return escape(node.replace("\u2192", ">").replace("\u2190", "<"))
    inner = "".join(inline(child) for child in node.children)
    if node.tag == "br":
        return "<br/>"
    if node.tag in {"strong", "b"}:
        return f"<b>{inner}</b>"
    if node.tag in {"em", "i"}:
        return f"<i>{inner}</i>"
    if node.tag == "a":
        href = urljoin("https://floatingpragma.io/", node.attrs.get("href") or "")
        return f'<a href="{escape(href, quote=True)}"><u>{inner}</u></a>'
    return inner


def register_fonts() -> None:
    fonts = Path(reportlab.__file__).resolve().parent / "fonts"
    for name, filename in (("Pragma", "Vera.ttf"), ("Pragma-Bold", "VeraBd.ttf"),
                           ("Pragma-Italic", "VeraIt.ttf"), ("Pragma-BoldItalic", "VeraBI.ttf")):
        pdfmetrics.registerFont(TTFont(name, fonts / filename))
    pdfmetrics.registerFontFamily("Pragma", normal="Pragma", bold="Pragma-Bold",
                                  italic="Pragma-Italic", boldItalic="Pragma-BoldItalic")


class Renderer:
    def __init__(self, output: Path) -> None:
        self.canvas = canvas.Canvas(str(output), pagesize=(WIDTH, HEIGHT),
                                    invariant=1, pageCompression=1)
        self.canvas.setTitle("Cadence | Pragma Research Investor Deck")
        self.canvas.setAuthor("Pragma Research")
        self.canvas.setCreator("Pragma Research investor PDF builder")
        self.canvas.setSubject("A deep real-time brain that learns from experience")
        self.dark = False

    def paragraph(self, node: Node, width: float, *, card: bool = False,
                  scale: float = 1.0) -> tuple[Paragraph, float, float]:
        classes = node.classes
        size, leading, gap, bold = (13.5, 20, 13, False)
        color = IVORY if self.dark else INK
        if card:
            size, leading, gap = 12.2, 18, 10
        if node.tag == "h1":
            size, leading, gap, bold = 40, 47, 19, True
        elif node.tag == "h2":
            size, leading, gap, bold = 32, 39, 17, True
        elif node.tag == "h3":
            size, leading, gap, bold = 16.5, 21, 12, True
        elif "eyebrow" in classes:
            size, leading, gap, bold = 9.2, 13, 19, True
            color = LIME if self.dark else MUTED
        elif "lead" in classes:
            size, leading, gap = 17.5, 25, 21
        elif "small" in classes:
            size, leading, gap = 10, 15, 11
            color = HexColor("#c1c6bd") if self.dark else MUTED
        elif "label" in classes or "number" in classes:
            size, leading, gap, bold = 9.2, 13, 12, True
            color = MUTED
        elif "metric-value" in classes:
            size, leading, gap, bold = 58, 68, 7, True
        elif "metric-label" in classes:
            size, leading, gap = 13, 19, 0
        elif node.tag == "a":
            size, leading, gap, bold = 11.5, 18, 8, True
        markup = re.sub(r"\s+", " ", inline(node)).strip()
        if "eyebrow" in classes or "label" in classes:
            markup = markup.upper()
        style = ParagraphStyle("deck", fontName="Pragma-Bold" if bold else "Pragma",
                               fontSize=size * scale, leading=leading * scale,
                               textColor=color, allowWidows=0, allowOrphans=0,
                               splitLongWords=False)
        paragraph = Paragraph(markup, style)
        _, height = paragraph.wrap(width, 10000)
        return paragraph, height, gap * scale

    def size(self, node: Node, width: float, *, card: bool = False,
             scale: float = 1.0) -> float:
        if node.tag in {"h1", "h2", "h3", "p", "a"}:
            _, height, gap = self.paragraph(node, width, card=card, scale=scale)
            return height + gap
        if node.classes & {"grid-2", "grid-3", "split"}:
            blocks = node.blocks
            gap = 22 if "split" not in node.classes else 36
            column_width = (width - gap * (len(blocks) - 1)) / len(blocks)
            return max(self.size(child, column_width, scale=scale) for child in blocks) + 21
        boxed = bool(node.classes & {"card", "metric", "callout"})
        padding = 20 if boxed else 0
        values = [self.size(child, width - padding * 2, card=boxed, scale=scale)
                  for child in node.blocks]
        return sum(values) + padding * 2 + (18 if "callout" in node.classes else 0)

    def draw(self, node: Node, x: float, top: float, width: float, *,
             card: bool = False, scale: float = 1.0, box_height: float | None = None) -> float:
        canvas_ = self.canvas
        if node.tag in {"h1", "h2", "h3", "p", "a"}:
            paragraph, height, gap = self.paragraph(node, width, card=card, scale=scale)
            paragraph.drawOn(canvas_, x, top - height)
            return top - height - gap
        if node.classes & {"grid-2", "grid-3", "split"}:
            blocks = node.blocks
            gap = 22 if "split" not in node.classes else 36
            column_width = (width - gap * (len(blocks) - 1)) / len(blocks)
            height = max(self.size(child, column_width, scale=scale) for child in blocks)
            for index, child in enumerate(blocks):
                self.draw(child, x + index * (column_width + gap), top, column_width,
                          scale=scale, box_height=height)
            return top - height - 21
        boxed = bool(node.classes & {"card", "metric", "callout"})
        padding = 20 if boxed else 0
        height = box_height or self.size(node, width, scale=scale)
        painted_height = height - (18 if "callout" in node.classes else 0)
        previous_dark = self.dark
        if boxed:
            fill = LIME if "callout" in node.classes or "metric" in node.classes else CARD
            canvas_.setFillColor(fill)
            canvas_.rect(x, top - painted_height, width, painted_height, fill=1, stroke=0)
            canvas_.setFillColor(INK)
            canvas_.rect(x, top - 3, width, 3, fill=1, stroke=0)
            self.dark = False
        cursor = top - padding
        for child in node.blocks:
            cursor = self.draw(child, x + padding, cursor, width - padding * 2,
                               card=boxed, scale=scale)
        self.dark = previous_dark
        return top - height

    def slide(self, slide: Node, index: int, total: int) -> None:
        c = self.canvas
        self.dark = index == 1
        background = INK if self.dark else (LIME if index == total else IVORY)
        c.setFillColor(background)
        c.rect(0, 0, WIDTH, HEIGHT, fill=1, stroke=0)
        c.setFillColor(LIME if self.dark else INK)
        c.rect(MARGIN, HEIGHT - 22, 38, 4, fill=1, stroke=0)
        available = HEIGHT - 44 - FOOTER - 19
        width = WIDTH - 2 * MARGIN
        scale = 1.0
        # A single, small reduction keeps a long heading from forcing a tiny body.
        # Larger copy changes fail explicitly and require a layout review.
        for candidate in (1.0, 0.98, 0.96, 0.94):
            needed = sum(self.size(node, width, scale=candidate) for node in slide.blocks)
            if needed <= available:
                scale = candidate
                break
        else:
            raise ValueError(f"Slide {index} overflows: {needed:.1f}pt > {available:.1f}pt")
        cursor = HEIGHT - 44
        for node in slide.blocks:
            cursor = self.draw(node, MARGIN, cursor, width, scale=scale)
        if cursor < FOOTER + 19 - 0.1:
            raise ValueError(f"Slide {index} entered footer at {cursor:.1f}pt")
        c.setStrokeColor(HexColor("#454c45") if self.dark else LINE)
        c.setLineWidth(0.5)
        c.line(MARGIN, FOOTER, WIDTH - MARGIN, FOOTER)
        c.setFont("Pragma", 8.2)
        c.setFillColor(HexColor("#c1c6bd") if self.dark else MUTED)
        c.drawString(MARGIN, 23, "PRAGMA RESEARCH  /  CADENCE")
        c.drawRightString(WIDTH - MARGIN, 23, f"{index:02d} / {total:02d}")
        c.showPage()
        print(f"Slide {index}: {needed:.1f}pt used; {cursor - FOOTER:.1f}pt footer clearance; scale {scale:.2f}")

    def save(self) -> None:
        self.canvas.save()


def verify(output: Path, slides: list[Node]) -> None:
    reader = PdfReader(output)
    if len(reader.pages) != len(slides):
        raise ValueError(f"Expected {len(slides)} pages; got {len(reader.pages)}")
    for index, (page, slide) in enumerate(zip(reader.pages, slides), 1):
        actual = normalize(page.extract_text())
        for node in slide.blocks:
            expected = normalize(plain(node))
            # Eyebrows are typeset in uppercase; whitespace has no semantic role.
            compact_actual = re.sub(r"\s", "", actual).casefold()
            compact_expected = re.sub(r"\s", "", expected).casefold()
            if compact_expected not in compact_actual:
                raise ValueError(f"Slide {index} text mismatch: {expected[:120]}")
    print(f"Verified {len(slides)} pages against HTML source; {output.stat().st_size:,} bytes")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, default=SITE / "_company/pages/deck.html")
    parser.add_argument("--output", type=Path, default=SITE / "investors/deck/Cadence_Investor_Deck.pdf")
    args = parser.parse_args()
    document = DeckParser()
    document.feed(args.source.read_text(encoding="utf-8"))
    if len(document.stack) != 1:
        raise ValueError("Unclosed HTML elements")
    slides = [node for node in document.root.blocks if "deck-slide" in node.classes]
    if len(slides) != 8:
        raise ValueError(f"Expected eight deck slides; found {len(slides)}")
    register_fonts()
    args.output.parent.mkdir(parents=True, exist_ok=True)
    renderer = Renderer(args.output)
    for index, slide in enumerate(slides, 1):
        renderer.slide(slide, index, len(slides))
    renderer.save()
    verify(args.output, slides)


if __name__ == "__main__":
    main()
