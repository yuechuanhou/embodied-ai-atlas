"""Build Embodied AI Atlas as one offline HTML document."""
from __future__ import annotations
import base64
import hashlib
import html
import json
import pathlib
import re
import unicodedata
import xml.etree.ElementTree as ET
import mistune

ROOT = pathlib.Path(__file__).resolve().parent
CONTENT = ROOT / "content"
manifest = json.loads((CONTENT / "manifest.json").read_text(encoding="utf-8"))
architecture = json.loads((CONTENT / "architecture.json").read_text(encoding="utf-8"))
registry = json.loads((CONTENT / "topics.json").read_text(encoding="utf-8"))
anchors = json.loads((CONTENT / "anchors.json").read_text(encoding="utf-8"))
# Loop membership is authored once; stages expose its derived inverse.
for stage in architecture["lifecycle"]:
    stage["loops"] = [loop["id"] for loop in architecture["loops"] if stage["id"] in loop["stages"]]

def stable_slug(title):
    normalized = unicodedata.normalize("NFKC", html.unescape(re.sub(r"<[^>]*>", "", title))).strip().lower()
    return re.sub(r"[^\w\-]+", "-", normalized, flags=re.UNICODE).strip("-") or "section"

class AtlasRenderer(mistune.HTMLRenderer):
    def __init__(self, article_id):
        super().__init__(escape=False)
        self.toc = []
        self.head_count = 0
        self.slug_counts = {}
        self.locations = {x["heading"]: x for x in anchors if x["article"] == article_id}

    def heading(self, text, level, **attrs):
        self.head_count += 1
        plain = html.unescape(re.sub(r"<[^>]+>", "", text)).strip()
        base = stable_slug(plain)
        count = self.slug_counts.get(base, 0) + 1
        self.slug_counts[base] = count
        slug = base if count == 1 else f"{base}-{count}"
        location = self.locations.get(plain, {})
        anchor = location.get("id", slug)
        legacy = f'<span id="section-{self.head_count}" class="legacy-anchor" aria-hidden="true"></span>'
        aliases = set(location.get("aliases", [])) | {slug}
        legacy += ''.join(f'<span id="{html.escape(alias, quote=True)}" class="legacy-anchor" aria-hidden="true"></span>' for alias in sorted(aliases - {anchor}))
        if level <= 3:
            self.toc.append({"level": level, "title": plain, "id": anchor})
        return f'<h{level} id="{html.escape(anchor, quote=True)}">{legacy}{text}</h{level}>\n'

pages = []
for entry in manifest["pages"]:
    path = CONTENT / entry["file"]
    if not path.is_file():
        raise RuntimeError(f"Missing Markdown: {entry['file']}")
    source = path.read_text(encoding="utf-8")
    renderer = AtlasRenderer(entry["id"])
    parser = mistune.create_markdown(renderer=renderer, plugins=["table", "strikethrough", "url", "task_lists"])
    body = parser(source)
    words = len(re.sub(r"\s+", "", re.sub(r"<[^>]+>", "", body)))
    search_text = html.unescape(re.sub(r"<[^>]+>", " ", body))
    pages.append({**entry, "html": body, "toc": renderer.toc, "words": words, "search_text": search_text})

page_by_id = {p["id"]: p for p in pages}

def resolve_location(article_id, heading=None):
    article = page_by_id.get(article_id)
    if not article:
        raise ValueError(f"Unknown canonical article {article_id}")
    if not heading:
        return None
    matches = [x["id"] for x in article["toc"] if x["title"] == heading]
    if len(matches) != 1:
        raise ValueError(f"Expected one heading {heading!r} in {article_id}; got {len(matches)}")
    return matches[0]

topics = []
topic_ids = set()
for article in pages:
    topics.append({"id": article["id"], "title": article["title"], "article": article["id"], "anchor": None,
                   "primary_domain": article["primary_domain"], "kind": "article"})
    topic_ids.add(article["id"])
for item in registry["topics"]:
    if item["id"] in topic_ids:
        raise ValueError(f"Duplicate topic: {item['id']}")
    topics.append({**item, "anchor": resolve_location(item["article"], item.get("heading")),
                   "primary_domain": page_by_id[item["article"]]["primary_domain"], "kind": "section"})
    topic_ids.add(item["id"])

focus = [{**item, "anchor": resolve_location(item["article"], item.get("heading"))} for item in registry["focus"]]
topic_by_id = {t["id"]: t for t in topics}

def resolve_entries(owner):
    entries = []
    for ref in owner["articles"]:
        ref = {"article": ref} if isinstance(ref, str) else ref
        topic = topic_by_id[ref.get("topic", ref.get("article"))]
        entries.append({"article": topic["article"], "topic_id": topic["id"], "title": topic["title"],
                        "anchor": topic["anchor"], "reason": ref.get("reason", "")})
    owner["entries"] = entries
    owner["articles"] = list(dict.fromkeys(x["article"] for x in entries))

for stage in architecture["lifecycle"]:
    for secondary in stage["topics"]:
        resolve_entries(secondary)
for loop in architecture["loops"]:
    for step in loop["steps"]:
        resolve_entries(step)
for context in architecture["contexts"]:
    resolve_entries(context)
relations = list(registry.get("relations", []))
strong_pairs = {frozenset((topic_by_id[r["from"]]["article"], topic_by_id[r["to"]]["article"]))
                for r in relations if r["type"] != "related"}
seen_related = {frozenset((r["from"], r["to"])) for r in relations if r["type"] == "related"}
for article in pages:
    for dest in article.get("related", []):
        pair = frozenset((article["id"], dest))
        if pair in strong_pairs or pair in seen_related:
            continue
        seen_related.add(pair)
        relations.append({"from": article["id"], "to": dest, "type": "related"})

payload = {"site": manifest["site"], "sections": manifest["sections"], "pages": pages,
           "architecture": architecture, "topics": topics, "relations": relations, "focus": focus}
data = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/")
css = (ROOT / "assets" / "site.css").read_text(encoding="utf-8")
css += "\n" + (ROOT / "assets" / "v02.css").read_text(encoding="utf-8")
css += "\n" + (ROOT / "assets" / "lifecycle.css").read_text(encoding="utf-8")
js = (ROOT / "assets" / "site.js").read_text(encoding="utf-8")
brand_source = (ROOT / "assets" / "icons" / "mark.svg").read_text(encoding="utf-8")
brand = ET.fromstring(brand_source)
light_color, dark_color = brand.attrib["color"], brand.attrib["data-dark-color"]
css += f"\n.brand-glyph{{color:{light_color}}}\n:root[data-theme='dark'] .brand-glyph{{color:{dark_color}}}"
ET.register_namespace("", "http://www.w3.org/2000/svg")
symbol = ET.fromstring(brand_source)
symbol.tag = "{http://www.w3.org/2000/svg}symbol"
symbol.attrib = {"id": "atlas-brand-mark", "viewBox": brand.attrib["viewBox"]}
brand_defs = '<svg xmlns="http://www.w3.org/2000/svg" aria-hidden="true" width="0" height="0" style="position:absolute;overflow:hidden">' + ET.tostring(symbol, encoding="unicode") + '</svg>'
favicon = ET.fromstring(brand_source)
favicon.set("viewBox", "6 6 52 52")
favicon.attrib.pop("data-dark-color")
favicon_style = ET.Element("{http://www.w3.org/2000/svg}style")
favicon_style.text = f":root{{color:{light_color}}}@media(prefers-color-scheme:dark){{:root{{color:{dark_color}}}}}"
favicon.insert(0, favicon_style)
icons = [
    ("icon", "image/x-icon", "16x16 32x32 48x48", "favicon.ico", ""),
    ("icon", "image/x-icon", "16x16 32x32 48x48", "favicon-dark.ico", "(prefers-color-scheme: dark)"),
    ("icon", "image/png", "32x32", "favicon-32.png", ""),
    ("icon", "image/png", "32x32", "favicon-dark-32.png", "(prefers-color-scheme: dark)"),
    ("icon", "image/svg+xml", "any", "favicon.svg", ""),
    ("apple-touch-icon", "image/png", "180x180", "apple-touch-icon.png", ""),
]
icon_assets = {name: ((ROOT / "assets" / "icons" / name).read_bytes() if name != "favicon.svg"
                     else ET.tostring(favicon, encoding="utf-8")) for _, _, _, name, _ in icons}

def icon_links(inline=False):
    links = []
    for rel, mime, sizes, name, media in icons:
        content = icon_assets[name]
        href = (f"data:{mime};base64,{base64.b64encode(content).decode()}" if inline
                else f"{name}?v={hashlib.sha256(content).hexdigest()[:10]}")
        media_attr = f' media="{media}"' if media else ''
        links.append(f'<link rel="{rel}" type="{mime}" sizes="{sizes}" href="{href}"{media_attr}/>')
    return "\n".join(links)

page = f'''<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<meta name="color-scheme" content="light dark"/>
<meta name="description" content="Embodied AI Atlas: system lifecycle, robot execution, learning and engineering."/>
<title>Embodied AI Atlas · 具身智能知识图谱</title>
{icon_links()}
<style>{css}</style></head><body>{brand_defs}<div id="app"></div>
<script id="atlas-data" type="application/json">{data}</script><script>{js}</script>
</body></html>'''
dist = ROOT / "dist"
dist.mkdir(exist_ok=True)
(dist / "index.html").write_text(page, encoding="utf-8")
for name, content in icon_assets.items():
    (dist / name).write_bytes(content)
release = '.'.join(manifest['site']['version'].split('.')[:2])
# Keep the shared single-file export self-contained, including its icon metadata.
offline = page.replace(icon_links(), icon_links(inline=True), 1)
(ROOT.parent / f"Embodied_AI_Atlas_v{release}.html").write_text(offline, encoding="utf-8")
print(f"Built {len(pages)} articles and {len(topics)} topics -> {dist / 'index.html'} ({len(page.encode('utf-8')) / 1024:.0f} KiB)")
