"""Standard-library-only rule digests shared by builds and proposal checks."""
import hashlib
import json
from pathlib import Path
import shutil

ROOT = Path(__file__).resolve().parent.parent
CONTRACT_FILES = (
    'ARCHITECTURE.md', 'AGENT_ARCHITECTURE.md', 'CONTENT_WORKFLOW.md',
    'CONTENT_STYLE_GUIDE.md', 'CONTENT_CHANGE_POLICY.md',
    'agent/contracts/knowledge-change.schema.json', 'agent/proposals.py',
    'agent/revisions.py', 'agent/change_validation.py',
    'scripts/validate_content.py', 'scripts/legacy_articles.json',
    'content/manifest.json', 'content/architecture.json', 'content/topics.json', 'content/anchors.json',
)


def canonical_bytes(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True,
                      separators=(',', ':'), allow_nan=False).encode('utf-8')


def digest(value):
    return hashlib.sha256(canonical_bytes(value)).hexdigest()


def contract_digest(root=ROOT):
    return digest({name: hashlib.sha256((root / name).read_bytes()).hexdigest() for name in CONTRACT_FILES})


def copy_contract_files(source, target):
    for name in CONTRACT_FILES:
        destination = target / name
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(source / name, destination)
