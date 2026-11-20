"""Validate Embodied AI Atlas content, architecture, relations and focus."""
import json
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
CONTENT = ROOT / "content"
manifest = json.loads((CONTENT / "manifest.json").read_text(encoding="utf-8"))
architecture = json.loads((CONTENT / "architecture.json").read_text(encoding="utf-8"))
registry = json.loads((CONTENT / "topics.json").read_text(encoding="utf-8"))
errors = []
entries = manifest["pages"]
ids = [p["id"] for p in entries]
known = set(ids)
domains = manifest["sections"]
section_ids = [s["id"] for s in domains]

def check_unique(vals, label):
    if len(vals) != len(set(vals)):
        errors.append(f"Duplicate {label}")

check_unique(ids, "article IDs")
check_unique(section_ids, "domain IDs")
if sum(not s.get("auxiliary") for s in domains) != 9:
    errors.append("Expected nine canonical domains")
stages = architecture["lifecycle"]
loops = architecture["loops"]
contexts = architecture["contexts"]
stage_ids = [s["id"] for s in stages]
loop_ids = [l["id"] for l in loops]
context_ids = [c["id"] for c in contexts]
check_unique(stage_ids, "stage IDs")
check_unique(loop_ids, "loop IDs")
check_unique(context_ids, "context IDs")
if set(stage_ids) != {"01", "02", "03", "04", "05", "06"}:
    errors.append("Expected stage IDs 01 through 06")
if set(loop_ids) != {"execution", "learning", "engineering"}:
    errors.append("Expected execution, learning and engineering loops")

headings = {}
for p in entries:
    name = p["id"]
    if not p.get("title") or not p.get("summary"):
        errors.append(f"{name}: missing title or summary")
    if p.get("primary_domain") != p.get("section") or p.get("primary_domain") not in section_ids:
        errors.append(f"{name}: invalid primary_domain or section")
    path = CONTENT / p["file"]
    if not path.is_file() or path.resolve().parent != CONTENT.resolve():
        errors.append(f"{name}: invalid file path")
        continue
    source = path.read_text(encoding="utf-8")
    headings[name] = [x.strip() for x in re.findall(r"^#{1,3}\s+(.+)$", source, flags=re.MULTILINE)]
    for target in re.findall(r"\]\(\?page=([a-zA-Z0-9_-]+)", source):
        if target not in known and target != "home":
            errors.append(f"{name}: broken link {target}")
    for target in p.get("related", []):
        if target not in known:
            errors.append(f"{name}: broken related page {target}")

topic_ids = ids + [t["id"] for t in registry["topics"]]
check_unique(topic_ids, "topic IDs")
known_topics = set(topic_ids)
for topic in registry["topics"]:
    article = topic["article"]
    if article not in known:
        errors.append(f"Missing canonical article for {topic['id']}")
    elif topic.get("heading") and headings.get(article, []).count(topic["heading"]) != 1:
        errors.append(f"Missing or ambiguous section for {topic['id']}: {topic['heading']}")
for edge in registry["relations"]:
    if edge["from"] not in known_topics or edge["to"] not in known_topics:
        errors.append(f"Unknown knowledge endpoint: {edge}")
    if edge["from"] == edge["to"]:
        errors.append(f"Self relation: {edge}")
    if edge["type"] not in {"depends_on","part_of","enables","compares_with","illustrated_by","related"}:
        errors.append(f"Invalid relation type: {edge['type']}")
for f in registry["focus"]:
    kind, sep, view_id = f["view"].partition(":")
    valid = {"stage": stage_ids, "loop": loop_ids, "context": context_ids}
    if f["article"] not in known:
        errors.append(f"Unknown focus article: {f['article']}")
    elif f.get("heading") and headings.get(f["article"], []).count(f["heading"]) != 1:
        errors.append(f"Missing focus heading: {f['article']} / {f['heading']}")
    if not sep or view_id not in valid.get(kind, []):
        errors.append(f"Unknown focus view: {f['view']}")
for stage in stages:
    if len(stage["topics"]) != 5:
        errors.append(f"Expected five secondary topics for {stage['id']}")
    check_unique([t["id"] for t in stage["topics"]], stage["id"] + " subtopics")
    for t in stage["topics"]:
        if not t["id"].startswith(stage["id"] + "."):
            errors.append(f"Invalid subtopic ID: {t['id']}")
        for p in t["articles"]:
            if p not in known:
                errors.append(f"Unknown stage article: {p}")
    for l in stage["loops"]:
        if l not in loop_ids:
            errors.append(f"Unknown loop in {stage['id']}: {l}")
    for c in stage.get("connections", []):
        if c["to"] not in stage_ids:
            errors.append(f"Unknown cross-stage connection: {c['to']}")
for loop in loops:
    check_unique([step["id"] for step in loop["steps"]], loop["id"] + " loop steps")
    for sid in loop["stages"]:
        if sid not in stage_ids:
            errors.append(f"Unknown linked stage: {sid}")
    for step in loop["steps"]:
        for p in step["articles"]:
            if p not in known:
                errors.append(f"Unknown loop article: {p}")
    for x in loop.get("interactions", []):
        if x["to"] not in loop_ids:
            errors.append(f"Unknown cross-loop target: {x['to']}")
for context in contexts:
    for p in context["articles"]:
        if p not in known:
            errors.append(f"Unknown context article: {p}")
if errors:
    print("FAILED:")
    for error in errors: print(" -", error)
    sys.exit(1)
print(f"OK: {len(ids)} articles, {len(known_topics)} canonical topics, 6 stages, 3 loops, {len(contexts)} contexts.")
