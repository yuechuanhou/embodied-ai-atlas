"""Build Embodied AI Atlas v0.2 as one offline HTML document."""
from __future__ import annotations
import html
import json
import pathlib
import re
import shutil
import unicodedata
import mistune

ROOT = pathlib.Path(__file__).resolve().parent
CONTENT = ROOT / "content"
manifest = json.loads((CONTENT / "manifest.json").read_text(encoding="utf-8"))
architecture = json.loads((CONTENT / "architecture.json").read_text(encoding="utf-8"))
registry = json.loads((CONTENT / "topics.json").read_text(encoding="utf-8"))

def stable_slug(title):
    normalized = unicodedata.normalize("NFKC", html.unescape(re.sub(r"<[^>]*>", "", title))).strip().lower()
    return re.sub(r"[^\w\-]+", "-", normalized, flags=re.UNICODE).strip("-") or "section"

class AtlasRenderer(mistune.HTMLRenderer):
    def __init__(self):
        super().__init__(escape=False)
        self.toc = []
        self.head_count = 0
        self.slug_counts = {}

    def heading(self, text, level, **attrs):
        self.head_count += 1
        plain = html.unescape(re.sub(r"<[^>]+>", "", text)).strip()
        base = stable_slug(plain)
        count = self.slug_counts.get(base, 0) + 1
        self.slug_counts[base] = count
        anchor = base if count == 1 else f"{base}-{count}"
        legacy = f'<span id="section-{self.head_count}" class="legacy-anchor" aria-hidden="true"></span>'
        if level <= 3:
            self.toc.append({"level": level, "title": plain, "id": anchor})
        return f'<h{level} id="{html.escape(anchor, quote=True)}">{legacy}{text}</h{level}>\n'

pages = []
for entry in manifest["pages"]:
    path = CONTENT / entry["file"]
    if not path.is_file():
        raise RuntimeError(f"Missing Markdown: {entry['file']}")
    source = path.read_text(encoding="utf-8")
    renderer = AtlasRenderer()
    parser = mistune.create_markdown(renderer=renderer, plugins=["table", "strikethrough", "url", "task_lists"])
    body = parser(source)
    words = len(re.sub(r"\s+", "", re.sub(r"<[^>]+>", "", body)))
    pages.append({**entry, "html": body, "toc": renderer.toc, "words": words})

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
relations = list(registry.get("relations", []))
for article in pages:
    for dest in article.get("related", []):
        relations.append({"from": article["id"], "to": dest, "type": "related"})

payload = {"site": manifest["site"], "sections": manifest["sections"], "pages": pages,
           "architecture": architecture, "topics": topics, "relations": relations, "focus": focus}
data = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/")
css = (ROOT / "assets" / "site.css").read_text(encoding="utf-8")
css += "\n" + (ROOT / "assets" / "v02.css").read_text(encoding="utf-8")
js = (ROOT / "assets" / "site.js").read_text(encoding="utf-8")
page = f'''<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<meta name="color-scheme" content="light dark"/>
<meta name="description" content="Embodied AI Atlas: system lifecycle, robot execution, learning and engineering."/>
<title>Embodied AI Atlas · 具身智能知识图谱</title>
<style>{css}</style></head><body><div id="app"></div>
<script id="atlas-data" type="application/json">{data}</script><script>{js}</script>
</body></html>'''
dist = ROOT / "dist"
dist.mkdir(exist_ok=True)
(dist / "index.html").write_text(page, encoding="utf-8")
shutil.copyfile(dist / "index.html", ROOT.parent / "Embodied_AI_Atlas_v0.2.html")
print(f"Built {len(pages)} articles and {len(topics)} topics -> {dist / 'index.html'} ({len(page) / 1024:.0f} KiB)")
