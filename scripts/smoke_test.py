"""Check the generated offline Atlas v0.2 payload and legacy links."""
import json, pathlib, re
from html.parser import HTMLParser
from urllib.parse import urlsplit
path = pathlib.Path(__file__).resolve().parent.parent / "dist" / "index.html"
content = path.read_text(encoding="utf-8")

class IconLinks(HTMLParser):
    def __init__(self):
        super().__init__()
        self.links = []

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == "link" and attrs.get("rel") in ("icon", "apple-touch-icon"):
            self.links.append(attrs)

icons = IconLinks()
icons.feed(content)
assert {x["type"] for x in icons.links} == {"image/x-icon", "image/png", "image/svg+xml"}
assert any(x["rel"] == "apple-touch-icon" and x["sizes"] == "180x180" for x in icons.links)
for icon in icons.links:
    url = urlsplit(icon["href"])
    assert not url.scheme and not url.path.startswith("/"), "Icon URL must support a Pages subpath"
    assert (path.parent / url.path).read_bytes() == (path.parent.parent / "assets/icons" / url.path).read_bytes()
match = re.search(r'<script id="atlas-data" type="application/json">(.+?)</script>', content, re.S)
assert match, "Missing embedded data payload"
payload = json.loads(match.group(1))
release = '.'.join(payload['site']['version'].split('.')[:2])
offline = IconLinks()
offline.feed((path.parent.parent.parent / f"Embodied_AI_Atlas_v{release}.html").read_text(encoding="utf-8"))
assert len(offline.links) == len(icons.links) and all(x['href'].startswith('data:') for x in offline.links), "Standalone export must embed its icons"
legacy = json.loads((path.parent.parent / "scripts" / "legacy_articles.json").read_text())
assert set(legacy) <= {p["id"] for p in payload["pages"]}, "Historical articles missing"
assert len({p['id'] for p in payload['pages']}) == len(payload['pages'])
assert len(payload["architecture"]["lifecycle"]) == 6
assert len(payload["architecture"]["loops"]) == 3
assert len([x for x in payload["sections"] if not x.get("auxiliary")]) == 9
assert any(x["id"] == "vio" and x["anchor"] for x in payload["topics"])
assert any(x["article"] == "data-recipe" and x["view"] == "stage:06" and x["anchor"] for x in payload["focus"])
assert any('id="section-1"' in p["html"] for p in payload["pages"]), "Legacy section-1 anchor absent"
assert any('id="一个成熟的判断框架"' in p["html"] for p in payload["pages"]), "Stable heading anchor absent"
for stage in payload['architecture']['lifecycle']:
    assert stage['loops'] == [loop['id'] for loop in payload['architecture']['loops'] if stage['id'] in loop['stages']]
for article in payload['pages']:
    anchors = re.findall(r'\bid="([^"]+)"', article['html'])
    assert len(anchors) == len(set(anchors)), f"Duplicate HTML anchors: {article['id']}"
print(f"Smoke OK: {len(payload['pages'])} articles, bidirectional membership, stable anchors and focus.")
