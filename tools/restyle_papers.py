#!/usr/bin/env python3
"""Rewrap existing paper HTML without rebuilding scientific content or PDFs.

Run with --apply after changing the shared company shell. The default reports
changes without writing. Only article index.html files beneath oph/papers are
eligible; the library redirect and all publication artifacts remain untouched.
"""

from __future__ import annotations

import argparse
import hashlib
import html
import importlib.util
import json
import re
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[1]

PAPER_EXTRA = r'''<link rel="stylesheet" href="/assets/papers.css?v=4">
<script>
window.MathJax = {
  tex: { inlineMath: [['\\(', '\\)'], ['$', '$']], displayMath: [['\\[', '\\]']] },
  svg: { fontCache: 'global' }
};
</script>
<script defer src="https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-svg.js"></script>
<script>
document.addEventListener('DOMContentLoaded', function () {
  var links = Array.from(document.querySelectorAll('.paper-aside .paper-toc a'));
  if (!links.length || !('IntersectionObserver' in window)) return;
  var byId = new Map(links.map(function (a) { return [a.hash.slice(1), a]; }));
  var observer = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (!entry.isIntersecting) return;
      links.forEach(function (a) {
        var selected = a.hash.slice(1) === entry.target.id;
        a.classList.toggle('on', selected);
        if (selected) a.setAttribute('aria-current', 'location');
        else a.removeAttribute('aria-current');
      });
    });
  }, { rootMargin: '-10% 0px -75% 0px' });
  document.querySelectorAll('.paper-body h1[id], .paper-body h2[id]').forEach(function (heading) {
    if (byId.has(heading.id)) observer.observe(heading);
  });
});
</script>'''


def company_builder(site_root: Path = ROOT):
    """Load the selected checkout's canonical shell, including --site overrides."""
    path = site_root / "tools/build_company_site.py"
    spec = importlib.util.spec_from_file_location("pragma_company_site", path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Cannot load company renderer: {path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def render_paper_shell(*, content, title, description, route, extra="", schema=None):
    page = company_builder().render_shell(
        content=content, title=title, description=description, route=route,
        active="research", extra=PAPER_EXTRA + "\n" + extra,
        body_class="paper-page", schema=schema,
    )
    return page.replace(
        '<meta property="og:type" content="website">',
        '<meta property="og:type" content="article">', 1,
    )


class Elements(HTMLParser):
    """Find exact original element spans, including nested mathematical divs."""

    def __init__(self, source):
        super().__init__(convert_charrefs=False)
        self.source = source
        self.lines = [0]
        self.lines.extend(match.end() for match in re.finditer("\n", source))
        self.stack = []
        self.spans = []

    def source_offset(self):
        line, column = self.getpos()
        return self.lines[line - 1] + column

    def handle_starttag(self, tag, attrs):
        if tag in {"area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"}:
            return
        self.stack.append((tag, dict(attrs), self.source_offset()))

    def handle_startendtag(self, tag, attrs):
        pass

    def handle_endtag(self, tag):
        if not self.stack or self.stack[-1][0] != tag:
            raise ValueError(f"Unbalanced element {tag!r} in paper HTML")
        opening, attrs, start = self.stack.pop()
        end = self.source.index(">", self.source_offset()) + 1
        self.spans.append((opening, attrs, start, end))

    def one(self, tag, class_name=None):
        matches = [
            (start, end) for name, attrs, start, end in self.spans
            if name == tag and (class_name is None or class_name in attrs.get("class", "").split())
        ]
        if len(matches) != 1:
            raise ValueError(f"Expected one {tag}.{class_name or '*'}, found {len(matches)}")
        return matches[0]


def paper_body(source):
    elements = Elements(source)
    elements.feed(source)
    start, end = elements.one("div", "paper-body")
    return source[start:end]


class Head(HTMLParser):
    def __init__(self):
        super().__init__()
        self.description = None
        self.canonical = None
        self.extra = []

    def handle_starttag(self, tag, attrs):
        fields = dict(attrs)
        if tag == "meta":
            name = fields.get("name", "")
            if name == "description":
                self.description = fields.get("content")
            if name.startswith(("citation_", "DC.", "article:", "prism.")) or name in {"keywords", "robots", "author"}:
                self.extra.append(self.get_starttag_text())
        elif tag == "link":
            if fields.get("rel") == "canonical":
                self.canonical = fields.get("href")
            elif fields.get("rel") in {"alternate", "related"}:
                self.extra.append(self.get_starttag_text())


def article_chrome(source):
    """Change navigation outside the exact scientific body only."""
    elements = Elements(source)
    elements.feed(source)
    start, end = elements.one("article")
    body_start, body_end = elements.one("div", "paper-body")

    def chrome(value):
        return (value
                .replace('<article class="shell">', '<article class="container paper-article">')
                .replace('class="btn btn-phys"', 'class="button primary"')
                .replace('class="btn"', 'class="button secondary"')
                .replace('href="/oph/papers/"', 'href="/research/#papers"'))

    prefix = chrome(source[start:body_start])
    crumbs = re.search(r'<nav class="crumbs".*?</nav>', prefix, re.S)
    if crumbs:
        label = re.search(r'<span aria-current="page">(.*?)</span>', crumbs[0], re.S)
        if not label:
            raise ValueError("Paper breadcrumb lacks a current label")
        prefix = prefix[:crumbs.start()] + (
            '<nav class="crumbs" aria-label="Breadcrumb"><a href="/research/">Research</a>'
            '<span aria-hidden="true">/</span><a href="/research/#papers">Papers</a>'
            '<span aria-hidden="true">/</span><span aria-current="page">'
            + label[1] + '</span></nav>'
        ) + prefix[crumbs.end():]
    return prefix + source[body_start:body_end] + chrome(source[body_end:end])


def restyle(source):
    head_match = re.search(r'<head>(.*?)</head>', source, re.S)
    title_match = re.search(r'<title>(.*?)</title>', source, re.S)
    if not head_match or not title_match:
        raise ValueError("Paper must have an existing head and title")
    head = Head()
    head.feed(head_match[1])
    if not head.description or not head.canonical:
        raise ValueError("Paper must have a description and canonical URL")
    canonical = urlsplit(head.canonical)
    if canonical.netloc != "floatingpragma.io" or not canonical.path.startswith("/oph/papers/"):
        raise ValueError(f"Unexpected paper canonical URL: {head.canonical}")
    schemas = []
    for script in re.findall(r'<script type="application/ld\+json">(.*?)</script>', head_match[1], re.S):
        value = json.loads(script)
        schemas.extend(value if isinstance(value, list) else [value])
    if not any(value.get("@type") == "ScholarlyArticle" for value in schemas):
        raise ValueError("Missing existing ScholarlyArticle metadata")
    for schema in schemas:
        if schema.get("@type") == "BreadcrumbList":
            for item in schema.get("itemListElement", []):
                if item.get("item") == "https://floatingpragma.io/physics/":
                    item.update(name="Research", item="https://floatingpragma.io/research/")
                elif item.get("item") == "https://floatingpragma.io/oph/papers/":
                    item["item"] = "https://floatingpragma.io/research/#papers"
    page = render_paper_shell(
        content=article_chrome(source), title=html.unescape(title_match[1]),
        description=head.description, route=canonical.path,
        extra="\n".join(head.extra), schema=schemas,
    )
    if paper_body(page) != paper_body(source):
        raise ValueError("Restyling changed scientific body bytes")
    new_head = Head()
    new_head.feed(page[:page.index("</head>")])
    if new_head.extra != head.extra:
        raise ValueError("Restyling changed scholarly metadata or related links")
    return page


def pdf_hashes():
    hashes = {}
    for path in sorted((ROOT / "oph/papers").rglob("*.pdf")):
        digest = hashlib.sha256()
        with path.open("rb") as stream:
            for block in iter(lambda: stream.read(65536), b""):
                digest.update(block)
        hashes[str(path.relative_to(ROOT))] = digest.hexdigest()
    return hashes


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    before = pdf_hashes()
    outputs = []
    for path in sorted((ROOT / "oph/papers").glob("*/index.html")):
        source = path.read_text()
        result = restyle(source)
        outputs.append((path, source, result))
    for path, source, result in outputs:
        if args.apply and source != result:
            path.write_text(result)
        print(f'{"changed" if source != result else "unchanged"}: {path.relative_to(ROOT)}')
    if before != pdf_hashes():
        raise ValueError("Publication PDF hashes changed")
    print(f'{len(outputs)} article bodies and metadata preserved; {len(before)} PDFs unchanged.')
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
