#!/usr/bin/env python3
"""Build the static company pages; run from any directory. No external dependencies."""
from pathlib import Path
from html import escape
import json
ROOT = Path(__file__).resolve().parents[1]
PAGES = {
 "home": ("index.html", "Pragma Research | Brains that learn", "Cadence is a deep real-time brain that learns from experience. Pragma Research is building the intelligence for robots that keep improving."),
 "cadence": ("cadence/index.html", "Cadence | A deep real-time brain", "Explore Cadence: a recursive settling network that learns from experience. Architecture, working code and measured simulation results."),
 "robotics": ("robotics/index.html", "Robotics | Put a learning brain in your robot", "Partner with Pragma Research to evaluate Cadence on one robot and one measurable adaptation problem. We build the brains; you build the bodies."),
 "investors": ("investors/index.html", "Invest in Pragma Research | The brain company", "Pragma Research is building a reusable learning brain for robots. Explore our proposed $4 million seed round and 18-month physical deployment programme."),
 "deck": ("investors/deck/index.html", "Pragma Research | Investor deck", "The Cadence investment case: a deep real-time brain, measurable simulation learning, and a proposed $4 million round for physical deployment."),
 "physics": ("physics/index.html", "Research | The ideas behind Cadence", "Observer Patch Holography connects local observers, shared records and repair. Explore the mathematical research that inspired Cadence."),
 "watch": ("watch/index.html", "Watch | The research behind Pragma Research", "Watch the Pragma Research explainer: observer-based physics, self-reading systems and the ideas behind Cadence."),
 "not-found": ("404.html", "Page not found | Pragma Research", "Find Cadence, the Pragma Research paper library, our robotics programme and investor materials."),
}
NAV = [("cadence", "/cadence/", "Cadence"), ("robotics", "/robotics/", "Robotics"), ("investors", "/investors/", "Investors"), ("physics", "/physics/", "Research")]
def build():
 template = (ROOT / "_company/layout.html").read_text()
 for name, (destination, title, description) in PAGES.items():
  route = "/" + destination.removesuffix("index.html")
  active = "investors" if name == "deck" else "physics" if name == "watch" else name
  nav = "".join(f'<a href="{url}"' + (' aria-current="page"' if key == active else '') + f'>{label}</a>' for key, url, label in NAV)
  schema = {"@context":"https://schema.org", "@type":"WebPage", "name":title, "description":description, "url":"https://floatingpragma.io" + route, "publisher":{"@type":"Organization", "name":"Pragma Research", "url":"https://floatingpragma.io/", "founder":{"@type":"Person", "name":"Bernhard Mueller"}}}
  values = {"TITLE":escape(title), "DESCRIPTION":escape(description, quote=True), "CANONICAL":"https://floatingpragma.io"+route, "NAV":nav, "SCHEMA":json.dumps(schema), "CONTENT":(ROOT/f"_company/pages/{name}.html").read_text(), "BODYCLASS":"deck-page" if name == "deck" else "", "YEAR":"2026", "EXTRA":""}
  if name == "cadence":
   values["EXTRA"] = '<link rel="stylesheet" href="/assets/brain-explorer.css?v=1"><script src="/assets/brain-model.js?v=1" defer></script><script src="/assets/brain-explorer.js?v=1" defer></script>'
  if name == "not-found":
   values["EXTRA"] = r'<meta name="robots" content="noindex"><script>if(location.pathname.replace(/\/+$/, "") === "/cadence/paper.pdf") location.replace("https://philpapers.org/rec/MUECAP-2");</script>'
  output=template
  for key, value in values.items(): output=output.replace("@@"+key+"@@",value)
  if "@@" in output: raise ValueError("Unexpanded template token")
  path=ROOT/destination
  path.parent.mkdir(parents=True,exist_ok=True)
  path.write_text(output)
  print(destination)
if __name__ == "__main__": build()
