"""Derive a content-addressed retrieval snapshot from the same canonical build."""
import hashlib
import html
import json
import os
from pathlib import Path
import re
import subprocess
import sys

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from agent.revisions import canonical_bytes, contract_digest


def plain(value):
    return re.sub(r'\s+', ' ', html.unescape(re.sub(r'<[^>]+>', ' ', value))).strip()


def source_revision(root):
    revision = os.environ.get('GITHUB_SHA', '')
    if not revision:
        result = subprocess.run(['git', 'rev-parse', 'HEAD'], cwd=root, capture_output=True, text=True)
        revision = result.stdout.strip() if result.returncode == 0 else ''
    return revision if re.fullmatch(r'[a-f0-9]{40}', revision) else None


def export_knowledge(root, dist, payload):
    articles = []
    for page in payload['pages']:
        markdown = (root / 'content' / page['file']).read_text(encoding='utf-8')
        headings = list(re.finditer(r'<h([1-6]) id="([^"]+)"[^>]*>(.*?)</h\1>', page['html'], re.S))
        sections = []
        for i, match in enumerate(headings):
            end = headings[i + 1].start() if i + 1 < len(headings) else len(page['html'])
            sections.append({'anchor': html.unescape(match[2]), 'title': plain(match[3]),
                             'level': int(match[1]), 'text': plain(page['html'][match.end():end])})
        articles.append({'id': page['id'], 'title': page['title'], 'primary_domain': page['primary_domain'],
                         'summary': page['summary'], 'tags': page['tags'], 'file': page['file'],
                         'markdown': markdown, 'text': page['search_text'], 'sections': sections,
                         'content_digest': hashlib.sha256(markdown.encode('utf-8')).hexdigest()})
    revision = source_revision(root)
    snapshot = {'schema_version': 1, 'revision': revision, 'contract_digest': contract_digest(root),
                'domains': payload['sections'], 'architecture': payload['architecture'],
                'topics': payload['topics'], 'relations': payload['relations'], 'articles': articles}
    body = canonical_bytes(snapshot)
    content_digest = hashlib.sha256(body).hexdigest()
    index_path = f'knowledge-index.{content_digest}.json'
    manifest = {'schema_version': 1, 'revision': revision, 'contract_digest': snapshot['contract_digest'],
                'index_path': index_path, 'index_sha256': content_digest,
                'articles': len(articles), 'topics': len(snapshot['topics'])}
    for old in dist.glob('knowledge-index.*.json'):
        old.unlink()
    (dist / index_path).write_bytes(body)
    (dist / 'knowledge-manifest.json').write_bytes(canonical_bytes(manifest))
    return manifest
