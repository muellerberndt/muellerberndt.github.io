#!/usr/bin/env python3
"""Build Pragma Research pages, shared navigation and legacy entry points."""
from html import escape
from datetime import date
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ORIGIN = "https://floatingpragma.io"
PAGES = {
    "home": ("index.html", "Pragma Research | AI that learns from live experience", "Cadence is a novel real-time AI modeled after animal and human brains. It learns from live experience. Pragma Research builds the brains for robots that keep improving."),
    "cadence": ("cadence/index.html", "Cadence | Real-time AI modeled after the brain", "Cadence is a novel real-time AI modeled after animal and human brains. It learns from live experience, adapts when conditions change and learns on the machine itself."),
    "demos": ("demos/index.html", "Demonstrations | Cadence in action", "Cadence demonstrations of live learning, brain evolution and adaptation to a changed body. Working software and interactive experiments from cadence-demos."),
    "demo-amen": ("demos/amen/index.html", "AMEN | Play the Cadence music demo", "Generate and hear a jungle track in your browser, composed from silence by a small Cadence brain with slow learning and one-shot memory."),
    "demo-patch-world": ("demos/patch-world/index.html", "Patch World | Explore a living simulation", "Watch creatures learn in your browser and evolve their brains in a conserved-mass world. Inspect their observations, prediction errors and inherited body plans."),
    "demo-atari-arcade": ("demos/atari-arcade/index.html", "Atari Arcade | Watch Cadence brains learn to play", "Watch two newborn Cadence brains learn Freeway and Atlantis live in your browser: animal-like brains that watch a teacher, take the controls and keep learning."),
    "demo-rover-lab": ("demos/rover-lab/index.html", "Rover Lab | Watch a Cadence brain adapt to a changed body", "Weaken a simulated rover's wheel and watch the live Cadence brain relearn its body in your browser, beside a frozen copy, an adaptive estimator and a small neural network."),
    "robotics": ("robotics/index.html", "Robotics | Put a learning brain in your robot", "Partner with Pragma Research to evaluate Cadence on one robot and one measurable adaptation problem. We build the brains; you build the bodies."),
    "investors": ("investors/index.html", "Invest in Pragma Research | The brain company", "Pragma Research builds real-time AI modeled after animal and human brains, for robots that learn from live experience. Explore our proposed $4 million seed round."),
    "deck": ("investors/deck/index.html", "Pragma Research | Investor deck", "The Cadence investment case: real-time AI that learns from live experience, working software and demonstrations, and a proposed $4 million round for physical deployment."),
    "research": ("research/index.html", "Research & preprints | Pragma Research", "Explore the main Observer Patch Holography and Cadence preprints, research code, and the Pragma Research blog."),
    "physics": ("physics/index.html", "Physics | Observer Patch Holography", "Observer Patch Holography connects local observers, shared records and repair. Explore the mathematical research that inspired Cadence."),
    "work": ("work/index.html", "Bernhard Mueller | Work & research", "Bernhard Mueller's work in physics, mathematics, AI and security: research, open-source software, companies, publications and talks."),
    "watch": ("watch/index.html", "Watch | The research behind Pragma Research", "Watch the Pragma Research explainer: observer-based physics, self-reading systems and the ideas behind Cadence."),
    "unsubscribe": ("oph/unsubscribe/index.html", "Email preferences | Pragma Research", "Manage Pragma Research and OPH outreach emails."),
    "not-found": ("404.html", "Page not found | Pragma Research", "Find Cadence, the Pragma Research preprints, our robotics programme and investor materials."),
}
NAV = [
    ("cadence", "/cadence/", "Cadence"),
    ("code", "https://github.com/muellerberndt/cadence", "Code"),
    ("demos", "/demos/", "Demos"),
    ("research", "/research/", "Research"),
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
# The Cadence film plays on these pages; search engines index it from this node.
CADENCE_FILM_PAGES = ("home", "cadence")
CADENCE_FILM = {
    "@type": "VideoObject", "@id": ORIGIN + "/watch/cadence-explainer.mp4#video",
    "name": "Cadence: a settling neural architecture",
    "description": "A seven-minute narrated tour of Cadence: regions that settle on one answer together, local learning from the result of each action, memory, optional observer regions and private imagination.",
    "thumbnailUrl": ORIGIN + "/watch/cadence-explainer-poster.jpg",
    "contentUrl": ORIGIN + "/watch/cadence-explainer.mp4",
    "uploadDate": "2026-10-03", "duration": "PT6M48S", "inLanguage": "en",
    "publisher": {"@id": ORIGIN + "/#organization"},
}


def page_schema(title, description, route):
    """Stable identities shared by the visible company, founder and pages."""
    canonical = ORIGIN + route
    organization = {"@type": "Organization", "@id": ORIGIN + "/#organization",
                    "name": "Pragma Research", "url": ORIGIN + "/",
                    "logo": ORIGIN + "/apple-touch-icon.png",
                    "founder": {"@id": ORIGIN + "/work/#person"}}
    website = {"@type": "WebSite", "@id": ORIGIN + "/#website",
               "name": "Pragma Research", "url": ORIGIN + "/",
               "publisher": {"@id": organization["@id"]}, "inLanguage": "en"}
    person = {"@type": "Person", "@id": ORIGIN + "/work/#person",
              "name": "Bernhard Mueller", "url": ORIGIN + "/work/",
              "sameAs": ["https://github.com/muellerberndt"]}
    page_type = "ProfilePage" if route == "/work/" else "CollectionPage" if route in ("/research/", "/demos/") else "WebPage"
    page = {"@type": page_type, "@id": canonical + "#webpage", "name": title,
            "description": description, "url": canonical, "inLanguage": "en",
            "isPartOf": {"@id": website["@id"]}, "publisher": {"@id": organization["@id"]}}
    graph = [organization, website, person, page]
    if route == "/work/":
        page["mainEntity"] = {"@id": person["@id"]}
    if route != "/":
        crumbs = [{"@type": "ListItem", "position": 1, "name": "Pragma Research", "item": ORIGIN + "/"}]
        parent = "/" + route.strip("/").split("/")[0] + "/"
        if parent != route and parent in ("/demos/", "/investors/"):
            crumbs.append({"@type": "ListItem", "position": 2, "name": parent.strip("/").title(), "item": ORIGIN + parent})
        label = "Investor deck" if route == "/investors/deck/" else title.split(" | ")[0]
        crumbs.append({"@type": "ListItem", "position": len(crumbs) + 1,
                       "name": label, "item": canonical})
        breadcrumb = {"@type": "BreadcrumbList", "@id": canonical + "#breadcrumb", "itemListElement": crumbs}
        page["breadcrumb"] = {"@id": breadcrumb["@id"]}
        graph.append(breadcrumb)
    return {"@context": "https://schema.org", "@graph": graph}


def render_shell(*, content, title, description, route, active="research", extra="", body_class="", schema=None, site_root=None, robots="index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1"):
    root = Path(site_root) if site_root else ROOT
    template = (root / "_company/layout.html").read_text()
    nav = "".join(
        f'<a href="{url}"' + (' aria-current="page"' if key == active else '') + f'>{label}</a>'
        for key, url, label in NAV
    )
    canonical = ORIGIN + route
    if schema is None:
        schema = page_schema(title, description, route)
    values = {
        "TITLE": escape(title), "DESCRIPTION": escape(description, quote=True),
        "CANONICAL": escape(canonical, quote=True), "NAV": nav,
        "ROBOTS": escape(robots, quote=True),
        "SCHEMA": json.dumps(schema, ensure_ascii=False).replace("<", "\\u003c"),
        "CONTENT": content, "BODYCLASS": escape(body_class, quote=True), "YEAR": "2026", "EXTRA": extra,
    }
    for key, value in values.items():
        template = template.replace("@@" + key + "@@", value)
    if "@@" in template:
        raise ValueError("Unexpanded template token")
    return template



def render_redirect(route, target, *, site_root=None):
    script = f'<meta http-equiv="refresh" content="0;url={escape(target, quote=True)}"><script>location.replace({json.dumps(target)} + (location.hash && !{json.dumps(target)}.includes("#") ? location.hash : ""));</script>'
    content = f'<section class="section page-hero"><div class="container"><p class="eyebrow">Pragma Research</p><h1 class="display">Continue exploring.</h1><p class="lead">This page is part of our unified research website.</p><div class="actions"><a class="button primary" href="{escape(target, quote=True)}">Continue ↗</a></div></div></section>'
    return render_shell(content=content, title="Continue | Pragma Research", description="Continue to the Pragma Research website.", route=target.split("#")[0], extra=script, site_root=site_root, robots="noindex, follow")


def publication_dates(root, paths, today=None):
    """Retain lastmod on identical builds; advance only for changed page bytes.

    The checked-in record makes local and CI builds deterministic. First entry
    records this metadata publication, not a guessed historical publication date.
    """
    today = today or date.today().isoformat()
    record = root / "_company/indexing.json"
    previous = json.loads(record.read_text()) if record.exists() else {}
    current = {}
    for path in paths:
        fingerprint = hashlib.sha256((root / path.lstrip("/") / "index.html").read_bytes()).hexdigest()
        old = previous.get(path, {})
        current[path] = {"sha256": fingerprint, "lastmod": old.get("lastmod", today) if old.get("sha256") == fingerprint else today}
    record.write_text(json.dumps(current, indent=2) + "\n")
    return {path: value["lastmod"] for path, value in current.items()}


def build_sitemaps():
    from xml.etree import ElementTree as ET
    namespace = "http://www.sitemaps.org/schemas/sitemap/0.9"
    ET.register_namespace("", namespace)
    paths = ["/" + dest.removesuffix("index.html") for key, (dest, *_rest) in PAGES.items() if key not in ("not-found", "unsubscribe")]
    dates = publication_dates(ROOT, paths)
    def write_map(name, urls):
        tree = ET.Element(f"{{{namespace}}}urlset")
        for url in dict.fromkeys(urls):
            node = ET.SubElement(tree, f"{{{namespace}}}url")
            ET.SubElement(node, f"{{{namespace}}}loc").text = url
            ET.SubElement(node, f"{{{namespace}}}lastmod").text = dates[url.removeprefix(ORIGIN)]
        ET.indent(tree, space="  ")
        (ROOT / name).write_text('<?xml version="1.0" encoding="UTF-8"?>\n' + ET.tostring(tree, encoding="unicode") + "\n")
    write_map("sitemap-root.xml", [ORIGIN + p for p in paths])
    write_map("oph/sitemap.xml", [ORIGIN + "/physics/", ORIGIN + "/research/"])
    write_map("sitemap.xml", [ORIGIN + p for p in paths])
    index = ET.Element(f"{{{namespace}}}sitemapindex")
    for path in ("sitemap-root.xml", "starklab/sitemap.xml"):
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
        robots = "index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1"
        if name == "cadence":
            extra = '<link rel="stylesheet" href="/assets/brain-explorer.css?v=4"><script src="/assets/brain-model.js?v=2" defer></script><script src="/assets/brain-explorer.js?v=5" defer></script>'
        elif name.startswith("demo-"):
            extra = '<script src="/assets/demo-player.js?v=1" defer></script>'
        elif name == "unsubscribe":
            robots = "noindex, nofollow"
        elif name == "not-found":
            robots = "noindex, follow"
            extra = r'<script>if(location.pathname.replace(/\/+$/, "") === "/cadence/paper.pdf") location.replace("https://philpapers.org/rec/MUECAP-2");else if(location.pathname.startsWith("/oph/papers/")) location.replace("/research/#preprints");</script>'
        schema = None
        if name in CADENCE_FILM_PAGES:
            schema = page_schema(title, description, route)
            schema["@graph"].append(CADENCE_FILM)
        output = render_shell(content=content, title=title, description=description, route=route, active=active, extra=extra, body_class="deck-page" if name == "deck" else "", robots=robots, schema=schema)
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
