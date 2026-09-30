#!/usr/bin/env python3
"""Build Pragma Research pages, shared navigation and legacy entry points."""
from html import escape
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ORIGIN = "https://floatingpragma.io"
PAGES = {
    "home": ("index.html", "Pragma Research | Brains that learn", "Cadence is a deep real-time brain that learns from experience. Pragma Research is building the intelligence for robots that keep improving."),
    "cadence": ("cadence/index.html", "Cadence | A deep real-time brain", "Explore Cadence: brains that settle and learn from experience. Three design patterns, working code and measured simulation results."),
    "demos": ("demos/index.html", "Demonstrations | Cadence in action", "Explore Cadence demonstrations: music, games and learning in simulated worlds. Working software, interactive experiments and measured results from cadence-demos."),
    "demo-amen": ("demos/amen/index.html", "AMEN | Play the Cadence music demo", "Generate and hear a jungle track in your browser. Explore the archived Cadence record-patch composer with its own engine and trained brain."),
    "demo-patch-world": ("demos/patch-world/index.html", "Patch World | Explore a living simulation", "Explore creatures with recursive settling brains in a conserved-mass world. Inspect their observations, prediction errors and evolving body plans."),
    "robotics": ("robotics/index.html", "Robotics | Put a learning brain in your robot", "Partner with Pragma Research to evaluate Cadence on one robot and one measurable adaptation problem. We build the brains; you build the bodies."),
    "investors": ("investors/index.html", "Invest in Pragma Research | The brain company", "Pragma Research is building a reusable learning brain for robots. Explore our proposed $4 million seed round and 18-month physical deployment programme."),
    "deck": ("investors/deck/index.html", "Pragma Research | Investor deck", "The Cadence investment case: a deep real-time brain, measurable simulation learning, and a proposed $4 million round for physical deployment."),
    "research": ("research/index.html", "Research & preprints | Pragma Research", "Explore the main Observer Patch Holography and Cadence preprints, research code, and the Pragma Research blog."),
    "physics": ("physics/index.html", "Physics | Observer Patch Holography", "Observer Patch Holography connects local observers, shared records and repair. Explore the mathematical research that inspired Cadence."),
    "work": ("work/index.html", "Bernhard Mueller | Work & research", "Bernhard Mueller's work in physics, mathematics, AI and security: research, open-source software, companies, publications and talks."),
    "watch": ("watch/index.html", "Watch | The research behind Pragma Research", "Watch the Pragma Research explainer: observer-based physics, self-reading systems and the ideas behind Cadence."),
    "unsubscribe": ("oph/unsubscribe/index.html", "Email preferences | Pragma Research", "Manage Pragma Research and OPH outreach emails."),
    "not-found": ("404.html", "Page not found | Pragma Research", "Find Cadence, the Pragma Research preprints, our robotics programme and investor materials."),
}
NAV = [
    ("cadence", "/cadence/", "Cadence"),
    ("demos", "/demos/", "Demos"),
    ("robotics", "/robotics/", "Robotics"),
    ("research", "/research/", "Research"),
    ("investors", "/investors/", "Investors"),
    ("work", "/work/", "Work"),
]
REDIRECTS = {
    "/oph/": "/physics/",
    "/oph/papers/": "/research/#preprints",
    "/selected-works/": "/work/",
    "/awesome-zk-proofs/": "/work/#platforms",
    "/awesome-ai-security/": "/work/#platforms",
    "/cadence-markets/": "/cadence/",
    "/cadence-examples/amen-beats/": "/demos/amen/",
    "/oph/physics-unification/": "/physics/",
    "/oph/standard-model-gravity-unification/": "/physics/",
    "/oph/cosmological-constant-derivation/": "/research/#preprints",
    "/oph/quantum-gravity/": "/physics/",
    "/oph/theory-of-everything/": "/physics/",
    "/oph/what-is-a-theory-of-everything/": "/physics/",
    "/oph/what-is-simulation-theory/": "/physics/",
    "/oph/simulation-theory/": "/physics/",
    "/oph/fatal-step/": "/research/#preprints",
    "/oph/stress-test/": "/research/#preprints",
}
# Keep old article URLs useful without retaining publication content.
RETIRED_PAPER_SLUGS = (
    'de-sitter-time-advance-fixed-screen-capacity',
    'fine-structure-constant-oph-pixel-fixed-point',
    'from-observer-consensus-to-standard-physics',
    'machine-checked-finite-event-algebras',
    'observation-determined-normal-forms',
    'observer-patch-holography-string-vacuum-selector',
    'observer-spacetime-einstein-dynamics',
    'observers-are-all-you-need',
    'paradise-as-fixed-point-consensus',
    'particle-spectrum-from-observer-consistency',
    'positive-chamber-koide-icosahedral-face-circulants',
    'reality-as-consensus-protocol',
    'screen-microphysics-and-observer-synchronization',
    'standard-model-gauge-structure',
    'thinking-as-patch-net-fixed-point-search',
    'yang-mills-mass-gap-observer-patch-holography',
)
REDIRECTS.update({f"/oph/papers/{slug}/": "/research/#preprints" for slug in RETIRED_PAPER_SLUGS})
RESEARCH_LINKS = (
    ("Observer Patch Holography — main preprint", "https://philpapers.org/rec/MUEFOC",
     "The physics research behind Pragma Research."),
    ("Cadence — main preprint", "https://philpapers.org/rec/MUECAP-2",
     "The research behind Cadence's settling brains."),
    ("Pragma Research Blog", "https://blog.floatingpragma.io/",
     "Essays, explanations and research updates."),
)
RESEARCH_LINKS_UPDATED = "2026-09-30T00:00:00Z"


def render_shell(*, content, title, description, route, active="research", extra="", body_class="", schema=None, site_root=None):
    root = Path(site_root) if site_root else ROOT
    template = (root / "_company/layout.html").read_text()
    nav = "".join(
        f'<a href="{url}"' + (' aria-current="page"' if key == active else '') + f'>{label}</a>'
        for key, url, label in NAV
    )
    canonical = ORIGIN + route
    if schema is None:
        schema = {"@context": "https://schema.org", "@type": "WebPage", "name": title, "description": description, "url": canonical, "publisher": {"@type": "Organization", "name": "Pragma Research", "url": ORIGIN + "/", "founder": {"@type": "Person", "name": "Bernhard Mueller"}}}
    values = {
        "TITLE": escape(title), "DESCRIPTION": escape(description, quote=True),
        "CANONICAL": escape(canonical, quote=True), "NAV": nav,
        "SCHEMA": json.dumps(schema, ensure_ascii=False).replace("<", "\\u003c"),
        "CONTENT": content, "BODYCLASS": escape(body_class, quote=True), "YEAR": "2026", "EXTRA": extra,
    }
    for key, value in values.items():
        template = template.replace("@@" + key + "@@", value)
    if "@@" in template:
        raise ValueError("Unexpanded template token")
    return template



def render_redirect(route, target, *, site_root=None):
    script = f'<meta name="robots" content="noindex"><meta http-equiv="refresh" content="0;url={escape(target, quote=True)}"><script>location.replace({json.dumps(target)} + (location.hash && !{json.dumps(target)}.includes("#") ? location.hash : ""));</script>'
    content = f'<section class="section page-hero"><div class="container"><p class="eyebrow">Pragma Research</p><h1 class="display">Continue exploring.</h1><p class="lead">This page is part of our unified research website.</p><div class="actions"><a class="button primary" href="{escape(target, quote=True)}">Continue ↗</a></div></div></section>'
    return render_shell(content=content, title="Continue | Pragma Research", description="Continue to the Pragma Research website.", route=target.split("#")[0], extra=script, site_root=site_root)


def build_sitemaps():
    from xml.etree import ElementTree as ET
    namespace = "http://www.sitemaps.org/schemas/sitemap/0.9"
    ET.register_namespace("", namespace)
    paths = ["/" + dest.removesuffix("index.html") for key, (dest, *_rest) in PAGES.items() if key not in ("not-found", "unsubscribe")]
    def write_map(name, urls):
        tree = ET.Element(f"{{{namespace}}}urlset")
        for url in dict.fromkeys(urls):
            node = ET.SubElement(tree, f"{{{namespace}}}url")
            ET.SubElement(node, f"{{{namespace}}}loc").text = url
        ET.indent(tree, space="  ")
        (ROOT / name).write_text('<?xml version="1.0" encoding="UTF-8"?>\n' + ET.tostring(tree, encoding="unicode") + "\n")
    write_map("sitemap-root.xml", [ORIGIN + p for p in paths])
    write_map("oph/sitemap.xml", [ORIGIN + "/physics/", ORIGIN + "/research/"])
    write_map("sitemap.xml", [ORIGIN + p for p in paths])
    index = ET.Element(f"{{{namespace}}}sitemapindex")
    for path in ("sitemap-root.xml",):
        entry = ET.SubElement(index, f"{{{namespace}}}sitemap")
        ET.SubElement(entry, f"{{{namespace}}}loc").text = ORIGIN + "/" + path
    ET.indent(index, space="  ")
    (ROOT / "sitemap-index.xml").write_text('<?xml version="1.0" encoding="UTF-8"?>\n' + ET.tostring(index, encoding="unicode") + "\n")


def build_research_feeds():
    """Keep existing feed URLs as short pointers to external publications."""
    from xml.etree import ElementTree as ET
    feed = {"version": "https://jsonfeed.org/version/1.1", "title": "Pragma Research links",
            "home_page_url": ORIGIN + "/research/", "feed_url": ORIGIN + "/oph/feed.json",
            "description": "Main preprints and the Pragma Research blog.",
            "items": [{"id": url, "url": url, "title": title, "content_text": summary,
                       "date_modified": RESEARCH_LINKS_UPDATED}
                      for title, url, summary in RESEARCH_LINKS]}
    (ROOT / "oph/feed.json").write_text(json.dumps(feed, indent=2, ensure_ascii=False) + "\n")
    ns = "http://www.w3.org/2005/Atom"
    ET.register_namespace("", ns)
    atom = ET.Element(f"{{{ns}}}feed")
    def tag(parent, name, text):
        ET.SubElement(parent, f"{{{ns}}}{name}").text = text
    tag(atom, "title", feed["title"])
    tag(atom, "id", ORIGIN + "/research/")
    tag(atom, "updated", RESEARCH_LINKS_UPDATED)
    ET.SubElement(atom, f"{{{ns}}}link", href=ORIGIN + "/research/")
    ET.SubElement(atom, f"{{{ns}}}link", href=ORIGIN + "/oph/feed.xml", rel="self")
    for title, url, summary in RESEARCH_LINKS:
        entry = ET.SubElement(atom, f"{{{ns}}}entry")
        for name, value in (("title", title), ("id", url), ("summary", summary), ("updated", RESEARCH_LINKS_UPDATED)):
            tag(entry, name, value)
        ET.SubElement(entry, f"{{{ns}}}link", href=url)
    ET.indent(atom, space="  ")
    (ROOT / "oph/feed.xml").write_text('<?xml version="1.0" encoding="UTF-8"?>\n' + ET.tostring(atom, encoding="unicode") + "\n")


def build():
    for name, (destination, title, description) in PAGES.items():
        route = "/" + destination.removesuffix("index.html")
        active = "investors" if name == "deck" else "research" if name in ("physics", "watch") else name
        if name.startswith("demo-"):
            active = "demos"
        content = (ROOT / f"_company/pages/{name}.html").read_text()
        extra = ""
        if name == "cadence":
            extra = '<link rel="stylesheet" href="/assets/brain-explorer.css?v=4"><script src="/assets/brain-model.js?v=2" defer></script><script src="/assets/brain-explorer.js?v=4" defer></script>'
        elif name == "unsubscribe":
            extra = '<meta name="robots" content="noindex, nofollow">'
        elif name == "not-found":
            extra = r'<meta name="robots" content="noindex"><script>if(location.pathname.replace(/\/+$/, "") === "/cadence/paper.pdf") location.replace("https://philpapers.org/rec/MUECAP-2");else if(location.pathname.startsWith("/oph/papers/")) location.replace("/research/#preprints");</script>'
        output = render_shell(content=content, title=title, description=description, route=route, active=active, extra=extra, body_class="deck-page" if name == "deck" else "")
        path = ROOT / destination
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(output)
        print(destination)
    for route, target in REDIRECTS.items():
        path = ROOT / route.lstrip("/") / "index.html"
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(render_redirect(route, target))
    build_sitemaps()
    build_research_feeds()
    # A normal site build must never silently keep or recreate a paper mirror.
    from check_company_site import check_research_publication
    errors = []
    check_research_publication(ROOT, errors)
    if errors:
        raise SystemExit("\n".join(errors))


if __name__ == "__main__":
    build()
