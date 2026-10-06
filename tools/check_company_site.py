#!/usr/bin/env python3
"""Check company routes and public evidence excerpts, without network or training.

Run from any directory. In the meta workspace, original scientific receipts are
also compared with the published excerpts. A standalone site checkout checks
excerpt consistency and provenance format; it cannot authenticate missing sources.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import struct
from datetime import date
from collections import Counter
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote, urljoin, urlsplit

ORIGIN = "https://floatingpragma.io"
ROUTES = (
    "/", "/cadence/", "/demos/", "/demos/amen/", "/demos/patch-world/", "/demos/atari-arcade/", "/demos/rover-lab/", "/robotics/", "/investors/", "/investors/deck/",
    "/physics/", "/research/", "/work/", "/watch/", "/oph/unsubscribe/", "/404.html",
)
EXTERNAL_PROJECTS = (
    "/selected-works/", "/starklab/",
)
PRIVATE = re.compile(
    r"/Users/|/home/|/private/|ec2-user|amazonaws\.com|"
    r"\bi-[a-f0-9]{8,17}\b|\barn:aws:|\bAKIA[A-Z0-9]{16}\b|"
    r"\b(?:\d{1,3}\.){3}\d{1,3}\b"
)
SHA256 = re.compile(r"^[a-f0-9]{64}$")


class Page(HTMLParser):
    def __init__(self, source):
        super().__init__(convert_charrefs=True)
        self.ids = Counter()
        self.links = []
        self.meta = {}
        self.meta_counts = Counter()
        self.canonical = []
        self.titles = []
        self.h1 = 0
        self.lang = None
        self.ld = []
        self._title = None
        self._ld = None
        self.feed(source)

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if a.get("id"):
            self.ids[a["id"]] += 1
        if tag == "html":
            self.lang = a.get("lang")
        if tag == "h1":
            self.h1 += 1
        if tag == "title":
            self._title = []
        if tag == "meta":
            key = a.get("name") or a.get("property")
            self.meta_counts[key] += 1
            self.meta[key] = a.get("content", "")
        if tag == "link" and "canonical" in a.get("rel", "").split():
            self.canonical.append(a.get("href"))
        if tag == "script" and a.get("type") == "application/ld+json":
            self._ld = []
        for attr in ("href", "src", "poster"):
            if attr in a:
                self.links.append(a[attr])
        for item in a.get("srcset", "").split(","):
            if item.strip():
                self.links.append(item.strip().split()[0])
        if tag == "meta" and a.get("property") in ("og:image", "og:video"):
            self.links.append(a.get("content", ""))
        if tag == "meta" and a.get("name") == "twitter:image":
            self.links.append(a.get("content", ""))

    def handle_startendtag(self, tag, attrs):
        self.handle_starttag(tag, attrs)

    def handle_data(self, data):
        if self._title is not None:
            self._title.append(data)
        if self._ld is not None:
            self._ld.append(data)

    def handle_endtag(self, tag):
        if tag == "title" and self._title is not None:
            self.titles.append("".join(self._title).strip())
            self._title = None
        if tag == "script" and self._ld is not None:
            self.ld.append("".join(self._ld))
            self._ld = None


def route_file(site, route):
    relative = unquote(route).lstrip("/")
    p = (site / relative).resolve()
    if not p.is_relative_to(site):
        raise ValueError(f"path escapes site: {route}")
    return p / "index.html" if route.endswith("/") or p.is_dir() else p


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def check_pages(site, errors):
    pages = {}
    for route in ROUTES:
        path = route_file(site, route)
        if not path.is_file():
            errors.append(f"{route}: missing page")
            continue
        source = path.read_text()
        p = pages[path] = Page(source)
        expected = ORIGIN + route
        if len(p.titles) != 1 or not p.titles[0]:
            errors.append(f"{route}: requires one nonempty title")
        if p.h1 != 1 and not (route == "/investors/deck/" and p.h1 > 0):
            errors.append(f"{route}: expected one h1, found {p.h1}")
        if not p.lang or not p.meta.get("description") or not p.meta.get("viewport"):
            errors.append(f"{route}: missing language, description or viewport")
        if p.canonical != [expected] or p.meta.get("og:url") != expected:
            errors.append(f"{route}: canonical and og:url must equal {expected}")
        for name in ("og:title", "og:description", "twitter:card"):
            if not p.meta.get(name):
                errors.append(f"{route}: missing {name}")
        image_url = p.meta.get("og:image", "")
        if p.meta.get("twitter:image") != image_url or not all(p.meta.get(key) for key in ("og:image:alt", "twitter:image:alt")):
            errors.append(f"{route}: social image and accessible description must be shared")
        if urlsplit(image_url).hostname == "floatingpragma.io":
            image_path = route_file(site, urlsplit(image_url).path)
            if image_path.is_file():
                data = image_path.read_bytes()
                if data[:8] != b'\x89PNG\r\n\x1a\n':
                    errors.append(f"{route}: expected a PNG social image")
                else:
                    width, height = struct.unpack('>II', data[16:24])
                    if [p.meta.get('og:image:width'), p.meta.get('og:image:height')] != [str(width), str(height)]:
                        errors.append(f"{route}: social image dimensions do not match the file")
                    if width < 1200 or height < 627 or len(data) > 5_000_000:
                        errors.append(f"{route}: social image does not meet LinkedIn's size requirements")
        if route == "/404.html" and "noindex" not in p.meta.get("robots", ""):
            errors.append("404 page must carry noindex")
        for identifier, count in p.ids.items():
            if count > 1:
                errors.append(f"{route}: duplicate id {identifier}")
        for block in p.ld:
            try:
                json.loads(block)
            except ValueError as exc:
                errors.append(f"{route}: invalid JSON-LD: {exc}")
        if route not in ("/physics/", "/watch/"):
            for stale in ("TemporalPatchNet", "cadence-net==0.16.0", "opensource.org/licenses/MIT"):
                if stale in source:
                    errors.append(f"{route}: obsolete Cadence reference {stale}")
        for link in p.links:
            target = urlsplit(urljoin(expected, link))
            if target.scheme not in ("http", "https"):
                continue
            if target.hostname in ("localhost", "127.0.0.1"):
                errors.append(f"{route}: published link points to localhost")
                continue
            if target.hostname not in ("floatingpragma.io", "www.floatingpragma.io"):
                continue
            if any(target.path.rstrip("/") == prefix.rstrip("/") or target.path.startswith(prefix)
                   for prefix in EXTERNAL_PROJECTS):
                continue
            try:
                dest = route_file(site, target.path or "/")
            except ValueError as exc:
                errors.append(f"{route}: {exc}")
                continue
            if not dest.is_file():
                errors.append(f"{route}: missing local target {link}")
                continue
            if target.fragment and dest.suffix == ".html":
                if dest not in pages:
                    pages[dest] = Page(dest.read_text())
                if unquote(target.fragment) not in pages[dest].ids:
                    errors.append(f"{route}: missing fragment {link}")


def check_indexing(site, errors):
    """Canonical, discoverable pages only; dates track published content."""
    from xml.etree import ElementTree as ET
    from build_company_site import REDIRECTS
    ns = {"s": "http://www.sitemaps.org/schemas/sitemap/0.9"}
    indexable = set(ROUTES) - {"/404.html", "/oph/unsubscribe/"}
    record = json.loads((site / "_company/indexing.json").read_text())
    for route in ROUTES:
        page = Page(route_file(site, route).read_text())
        robots = page.meta.get("robots", "")
        if page.meta_counts["robots"] != 1:
            errors.append(f"{route}: expected exactly one robots directive")
        if route in indexable:
            if "noindex" in robots or "max-image-preview:large" not in robots:
                errors.append(f"{route}: public page is not indexable with large previews")
            item = record.get(route, {})
            if item.get("sha256") != sha(route_file(site, route)):
                errors.append(f"{route}: indexing record does not match published content")
        elif "noindex" not in robots:
            errors.append(f"{route}: utility page must be noindex")
        graphs = [json.loads(block).get("@graph", []) for block in page.ld]
        ids = {node.get("@id") for graph in graphs for node in graph}
        if not {ORIGIN + "/#organization", ORIGIN + "/#website", ORIGIN + route + "#webpage"}.issubset(ids):
            errors.append(f"{route}: missing stable site and page identities")
    for route in REDIRECTS:
        page = Page(route_file(site, route).read_text())
        if page.meta_counts["robots"] != 1 or "noindex" not in page.meta.get("robots", ""):
            errors.append(f"{route}: legacy redirect must carry one noindex directive")
    for name in ("sitemap.xml", "sitemap-root.xml"):
        entries = ET.parse(site / name).findall("s:url", ns)
        locations = [entry.findtext("s:loc", namespaces=ns) for entry in entries]
        if len(locations) != len(set(locations)) or set(locations) != {ORIGIN + route for route in indexable}:
            errors.append(f"{name}: must list each current indexable page exactly once")
        for entry in entries:
            route = entry.findtext("s:loc", default="", namespaces=ns).removeprefix(ORIGIN)
            lastmod = entry.findtext("s:lastmod", default="", namespaces=ns)
            try:
                valid_date = date.fromisoformat(lastmod) <= date.today()
            except ValueError:
                valid_date = False
            if not valid_date or lastmod != record.get(route, {}).get("lastmod"):
                errors.append(f"{name}: invalid or mismatched lastmod for {route}")
    maps = ET.parse(site / "sitemap-index.xml").findall("s:sitemap/s:loc", ns)
    if {node.text for node in maps} != {ORIGIN + "/sitemap-root.xml", ORIGIN + "/starklab/sitemap.xml"}:
        errors.append("Sitemap index must include the company site and STARK Lab")


def check_unified_surfaces(site, errors):
    """Every public page uses the company shell, including legacy redirects."""
    embedded = {site / "demos/runtime/amen/index.html", site / "demos/runtime/patch-world/index.html", site / "demos/runtime/atari-arcade/index.html", site / "demos/runtime/rover-lab/index.html"}
    html_paths = [p for p in site.rglob("*.html") if p not in embedded and not any(part.startswith((".", "_")) for part in p.relative_to(site).parts)]
    for path in html_paths:
        source = path.read_text()
        label = str(path.relative_to(site))
        for required in ('/assets/company.css?v=8', 'id="site-nav"', 'href="/research/"', 'href="/work/"', 'href="/demos/"', 'href="https://blog.floatingpragma.io/"', '/favicon.svg?v=7', '/favicon.ico?v=7', '/apple-touch-icon.png?v=7'):
            if required not in source:
                errors.append(f"{label}: missing shared site element {required}")
        for stale in ('/assets/pragma.css', '/assets/pragma.js', '/oph/styles.css', 'Frontier mathematics'):
            if stale in source:
                errors.append(f"{label}: stale site shell {stale}")
        if label != 'work/index.html' and 'github.com/muellerberndt/cadence-examples' in source:
            errors.append(f"{label}: current demonstrations must link to cadence-demos")
    research = (site / "research/index.html").read_text()
    for link in ('https://philpapers.org/rec/MUEFOC', 'https://philpapers.org/rec/MUECAP-2', 'https://blog.floatingpragma.io/'):
        if f'href="{link}"' not in research:
            errors.append(f"Research: missing publication link {link}")
    work = Page((site / "work/index.html").read_text())
    for anchor in ('early', 'mobile', 'contracts', 'ai', 'writings', 'physics', 'platforms', 'mathematics'):
        if anchor not in work.ids:
            errors.append(f"Work history: missing retained section {anchor}")
    return len(html_paths)


def check_research_publication(site, errors):
    """Only external preprints and exact legacy redirects may be published."""
    from build_company_site import RETIRED_PAPER_SLUGS, render_redirect
    site = site.resolve()
    paper_dir = site / "oph/papers"
    expected = {Path('index.html'), *(Path(slug) / 'index.html' for slug in RETIRED_PAPER_SLUGS)}
    actual = {p.relative_to(paper_dir) for p in paper_dir.rglob('*') if p.is_file()}
    for path in sorted(actual - expected):
        errors.append(f"Paper mirroring is retired: unexpected oph/papers/{path}")
    for path in sorted(expected):
        full_path = paper_dir / path
        route = '/oph/papers/' + str(path).removesuffix('index.html')
        expected_html = render_redirect(route, '/research/#preprints', site_root=site)
        if not full_path.is_file() or full_path.read_text() != expected_html:
            errors.append(f"Paper mirroring is retired: {route} must be a short preprint redirect")
    for name in ('assets/papers.css', 'assets/research.js', 'tools/restyle_papers.py'):
        if (site / name).exists():
            errors.append(f"Retired paper-library asset or generator remains: {name}")
    for name in ('sitemap.xml', 'sitemap-root.xml', 'sitemap-index.xml', 'oph/sitemap.xml', 'robots.txt', 'oph/feed.json', 'oph/feed.xml', 'llms.txt', 'llms-full.txt'):
        path = site / name
        if path.is_file() and '/oph/papers/' in path.read_text():
            errors.append(f"{name}: still advertises retired paper mirrors")
    for route in ROUTES:
        path = route_file(site, route)
        if path.is_file() and any(urlsplit(urljoin(ORIGIN, link)).path.startswith('/oph/papers/')
                                  for link in Page(path.read_text()).links):
            errors.append(f"{route}: links to a retired paper mirror")


def check_browser_demos(site, errors):
    """Check the four embedded applications separately from their company shell."""
    runtime = site / "demos/runtime"
    manifest = json.loads((runtime / "manifest.json").read_text())
    if manifest["repository"] != "https://github.com/muellerberndt/cadence-demos":
        errors.append("Browser demos: expected official cadence-demos source")
    if not re.fullmatch(r"[a-f0-9]{40}", manifest["commit"]):
        errors.append("Browser demos: source commit is not pinned")
    expected = {"manifest.json"}
    for entry in manifest["files"]:
        expected.add(entry["path"])
        path = runtime / entry["path"]
        if not path.is_file() or sha(path) != entry["published_sha256"]:
            errors.append(f"Browser demos: missing or modified {entry['path']}")
            continue
        if path.suffix != '.html' and entry['source_sha256'] != entry['published_sha256']:
            errors.append(f"Browser demos: application assets changed from source: {entry['path']}")
        if path.suffix == '.html':
            source = path.read_text()
            for required in ('content="noindex"', '/assets/demo-runtime.css?v=5', '/assets/demo-runtime.js?v=4', '/favicon.svg?v=7'):
                if required not in source:
                    errors.append(f"Browser demos: {entry['path']} missing {required}")
            if 'cadence-examples/' in source or 'data:image/svg+xml' in source:
                errors.append(f"Browser demos: old metadata or icon in {entry['path']}")
    actual = {str(p.relative_to(runtime)) for p in runtime.rglob('*') if p.is_file()}
    if actual != expected:
        errors.append("Browser demos: runtime has undeclared or missing files")
    for path in ('favicon.svg', 'favicon.ico', 'apple-touch-icon.png', 'assets/pragma-icon-192.png', 'assets/pragma-icon-512.png', 'site.webmanifest'):
        if not (site / path).is_file():
            errors.append(f"Brand icon missing: {path}")


def check_evidence(site, errors):
    meta = site.parent.parent
    files = ("doom-confirmations.json", "cartpole-confirmations.json")
    evidence = {}
    for name in files:
        path = site / "evidence/cadence" / name
        try:
            source = path.read_text()
            data = evidence[name] = json.loads(source)
        except (OSError, ValueError) as exc:
            errors.append(f"{name}: {exc}")
            continue
        if path.stat().st_size > 100_000:
            errors.append(f"{name}: public excerpt unexpectedly exceeds 100 KB")
        if PRIVATE.search(source):
            errors.append(f"{name}: private filesystem, cloud identifier or host address present")
        if "not the full experiment bundles" not in data.get("evidence_type", ""):
            errors.append(f"{name}: missing excerpt/full-bundle distinction")
        if not data.get("limits"):
            errors.append(f"{name}: missing interpretation limits")
    if len(evidence) != 2:
        return 0
    checked_sources = 0

    def require(condition, message):
        if not condition:
            errors.append(message)

    doom = evidence[files[0]]
    require(len(doom["confirmations"]) == 2, "Doom: expected both confirmations")
    for row in doom["confirmations"]:
        label = row["id"]
        d = meta / "cadence-doom-lab/evidence/run3" / label
        v = row["reported_independent_verification"]
        require(row["passed"] and v["passed"], f"{label}: confirmation/verification did not pass")
        for role, r in row["outcomes"].items():
            require(r["scheduled"] == r["completed"] == 64, f"{label}: incomplete {role} schedule")
            require(r["qualified_queries"] == r["attempted_queries"] and r["fallback_actions"] == 0,
                    f"{label}: nonqualified or fallback actions")
        for name, info in row["source_files"].items():
            require(bool(SHA256.fullmatch(info["sha256"])), f"{label}: invalid source hash")
            if (d / name).is_file():
                require(sha(d / name) == info["sha256"], f"{label}: original {name} hash mismatch")
                checked_sources += 1
        require(v["summary_sha256"] == row["source_files"]["summary.json"]["sha256"],
                f"{label}: verification does not bind source summary")
        if (d / "summary.json").is_file():
            s = json.loads((d / "summary.json").read_text())
            for key in ("paired_bootstrap", "paired_win_table", "criteria", "success_intervals_wilson95"):
                require(row[key] == s[key], f"{label}: {key} differs from original")
            for role, outcome in row["outcomes"].items():
                pairs = [pair[role] for pair in s["pairs"]]
                expected = {"scheduled": 64, "completed": len(pairs),
                            "wins": sum(p["success"] for p in pairs),
                            "mean_native_return": sum(p["return"] for p in pairs) / len(pairs),
                            "qualified_queries": sum(p["qualified_queries"] for p in pairs),
                            "attempted_queries": sum(p["queries"] for p in pairs),
                            "fallback_actions": sum(p["fallback_actions"] for p in pairs)}
                require(outcome == expected, f"{label}: {role} outcomes differ from original")
        if (d / "independent_verification.json").is_file():
            require(v == json.loads((d / "independent_verification.json").read_text()),
                    f"{label}: copied verification differs from original")
        if (d / "freeze.json").is_file():
            frozen = json.loads((d / "freeze.json").read_text())
            for role in ("candidate", "founder"):
                require(row[f"{role}_checkpoint_sha256"]
                        == frozen["bundles"][role]["checkpoint_sha256"],
                        f"{label}: {role} checkpoint differs from original")
    wins = [(r["outcomes"]["candidate"]["wins"], r["outcomes"]["founder"]["wins"])
            for r in doom["confirmations"]]
    require(wins == [(63, 61), (64, 53)], "Doom: headline win counts do not match confirmations")

    cart = evidence[files[1]]
    rows = cart["confirmations"]
    expected_models = {(layout, seed) for layout in ("flat1", "flat6", "observer4_2")
                       for seed in (7, 17, 27)}
    require(len(rows) == 9 and {(r["layout"], r["model_seed"]) for r in rows} == expected_models,
            "CartPole: requires all nine distinct layout/initialization combinations")
    episodes = [e for r in rows for e in r["episodes"]]
    aggregate = {"layouts": sorted({r["layout"] for r in rows}),
                 "model_seeds": sorted({r["model_seed"] for r in rows}),
                 "models": len(rows), "episodes": len(episodes),
                 "episodes_reaching_500": sum(e["reward"] == 500 for e in episodes),
                 "evaluated_actions": int(sum(e["reward"] for e in episodes)),
                 "refused_action_solves": sum(r["refused_action_solves"] for r in rows),
                 "teaching_presentations": sum(r["teaching_examples"] for r in rows),
                 "accepted_teaching_events": sum(r["accepted_teaching_events"] for r in rows),
                 "refused_teaching_events": sum(r["refused_teaching_events"] for r in rows)}
    require(cart["aggregate"] == aggregate, "CartPole: aggregates differ from episode/model rows")
    require(aggregate["episodes_reaching_500"] == aggregate["episodes"] == 180
            and aggregate["evaluated_actions"] == 90_000
            and aggregate["refused_action_solves"] == 0,
            "CartPole: headline outcomes differ from confirmation")
    source_dir = meta / "cadence-flagship/experiments/population_examples_2026_09_28/cartpole"
    if (source_dir / "protocol.json").is_file():
        require(sha(source_dir / "protocol.json") == cart["source_protocol_sha256"],
                "CartPole: original protocol hash mismatch")
    for r in rows:
        require(bool(SHA256.fullmatch(r["source_sha256"])), "CartPole: invalid source hash")
        require([e["seed"] for e in r["episodes"]] == list(range(2000, 2020)),
                "CartPole: confirmation episode schedule is incomplete or duplicated")
        require(r["accepted_teaching_events"] + r["refused_teaching_events"]
                == r["teaching_examples"] == 128,
                "CartPole: teaching accounting mismatch")
        p = source_dir / "results" / r["source_file"]
        if not p.is_file():
            continue
        require(sha(p) == r["source_sha256"], f"CartPole: source hash mismatch {p.name}")
        s = json.loads(p.read_text())
        require(r["episodes"] == s["learned"]["episodes"], f"CartPole: outcome mismatch {p.name}")
        require(r["layout"] == s["arguments"]["layout"]
                and r["model_seed"] == s["arguments"]["seed"]
                and r["accepted_teaching_events"] == s["training"]["accepted"]
                and r["refused_teaching_events"] == s["training"]["refused"],
                f"CartPole: model or teaching counts differ from original {p.name}")
        require(r["source_provenance"] == s["provenance"]
                and r["implementation_sha256"] == s["layout"]["implementation"],
                f"CartPole: provenance mismatch {p.name}")
        checked_sources += 1
    return checked_sources


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--site-root", type=Path, default=Path(__file__).resolve().parents[1])
    args = parser.parse_args()
    errors = []
    site = args.site_root.resolve()
    check_pages(site, errors)
    check_indexing(site, errors)
    unified_pages = check_unified_surfaces(site, errors)
    check_research_publication(site, errors)
    check_browser_demos(site, errors)
    try:
        sources = check_evidence(site, errors)
    except (KeyError, TypeError, ValueError) as exc:
        errors.append(f"Evidence structure invalid: {exc}")
        sources = 0
    for error in errors:
        print(f"ERROR: {error}")
    if errors:
        print(f"Company site check failed: {len(errors)} issue(s).")
        return 1
    print(f"Company site checks passed: {len(ROUTES)} routes, 2 evidence excerpts, "
          f"{sources} original source files checked; {unified_pages} pages share one design.")
    if not sources:
        print("Original workspace receipts unavailable; only published excerpt consistency checked.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
