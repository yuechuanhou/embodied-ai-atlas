"""Check the generated offline Atlas v0.2 payload and legacy links."""
import json, pathlib, re
path = pathlib.Path(__file__).resolve().parent.parent / "dist" / "index.html"
content = path.read_text(encoding="utf-8")
match = re.search(r'<script id="atlas-data" type="application/json">(.+?)</script>', content, re.S)
assert match, "Missing embedded data payload"
payload = json.loads(match.group(1))
assert len(payload["pages"]) == 26
assert len(payload["architecture"]["lifecycle"]) == 6
assert len(payload["architecture"]["loops"]) == 3
assert len([x for x in payload["sections"] if not x.get("auxiliary")]) == 9
assert any(x["id"] == "vio" and x["anchor"] for x in payload["topics"])
assert any(x["article"] == "data-recipe" and x["view"] == "stage:06" and x["anchor"] for x in payload["focus"])
assert any('id="section-1"' in p["html"] for p in payload["pages"]), "Legacy section-1 anchor absent"
assert any('id="一个成熟的判断框架"' in p["html"] for p in payload["pages"]), "Stable heading anchor absent"
print("Smoke OK: 26 articles, 6 stages, 3 loops, 9 domains, topic focus and historic anchors.")
