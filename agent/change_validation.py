"""Read-only semantic gate: apply after-images to an isolated copy and build it.

Not authentication, technical fact review or a publisher. The future server supplies
the trusted checkout/current_head; proposal intents are never used as permission.
"""
import hashlib
from html.parser import HTMLParser
import json
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile
from urllib.parse import urlsplit

from agent.proposals import contract_digest, validate_proposal
from agent.revisions import copy_contract_files


def require(condition, message):
    if not condition:
        raise ValueError(message)


def unchanged_except(before, after, allowed, label):
    require({k: v for k, v in before.items() if k not in allowed} ==
            {k: v for k, v in after.items() if k not in allowed}, f"{label}: protected definition changed")


def indexed(items, key):
    result = {key(item): item for item in items}
    require(len(result) == len(items), "Duplicate metadata identity")
    return result


def check_metadata(before, after):
    old, new = before['manifest'], after['manifest']
    unchanged_except(old, new, {'pages'}, 'Domain/site')
    old_pages, new_pages = (indexed(m['pages'], lambda p: p['id']) for m in (old, new))
    require(old_pages.keys() <= new_pages.keys(), 'Historical article removed')
    allowed_fields = set().union(*(set(p) for p in old['pages']))
    for key, page in new_pages.items():
        require(set(page) <= allowed_fields, 'Derived or unknown article field')
        if key in old_pages:
            unchanged_except(old_pages[key], page, {'title', 'summary', 'tags', 'maturity'}, 'Article identity/ownership')

    old_anchors, new_anchors = (indexed(a['anchors'], lambda x: (x['article'], x['id'])) for a in (before, after))
    require(old_anchors.keys() <= new_anchors.keys(), 'Historical anchor removed')
    for key, anchor in new_anchors.items():
        require(set(anchor) <= {'article', 'heading', 'id', 'aliases'}, 'Unknown anchor field')
        if key in old_anchors:
            require(set(old_anchors[key].get('aliases', [])) <= set(anchor.get('aliases', [])), 'Historical alias removed')

    old, new = before['topics'], after['topics']
    unchanged_except(old, new, {'topics', 'relations', 'focus'}, 'Topic registry')
    old_topics, new_topics = (indexed(m['topics'], lambda t: t['id']) for m in (old, new))
    require(old_topics.keys() <= new_topics.keys(), 'Historical topic removed')
    for key, topic in new_topics.items():
        require(set(topic) <= {'id', 'title', 'article', 'heading', 'aliases'}, 'Derived or unknown topic field')
        if key in old_topics:
            prior = old_topics[key]
            unchanged_except(prior, topic, {'title', 'heading', 'aliases'}, 'Topic canonical article')
            require(set(prior.get('aliases', [])) <= set(topic.get('aliases', [])), 'Topic alias removed')
            if prior.get('heading') != topic.get('heading'):
                def anchor_id(registry, heading):
                    return next((x['id'] for x in registry.values() if x['article'] == topic['article'] and x['heading'] == heading), None)
                identity = anchor_id(old_anchors, prior.get('heading'))
                require(identity is not None and identity == anchor_id(new_anchors, topic.get('heading')), 'Topic moved to another section identity')
    require(all(edge in new['relations'] for edge in old['relations']), 'Existing relation removed or rewritten')
    for edge in new['relations']:
        require(set(edge) <= {'from', 'to', 'type', 'reason'}, 'Unknown relation field')
    old_focus, new_focus = (indexed(m['focus'], lambda f: (f['article'], f['view'])) for m in (old, new))
    require(old_focus.keys() <= new_focus.keys(), 'Existing focus removed')
    for focus in new['focus']:
        require(set(focus) <= {'article', 'view', 'heading', 'reason'}, 'Unknown focus field')

    # Traverse only the established reference containers. Everything else must match.
    old, new = json.loads(json.dumps(before['architecture'])), json.loads(json.dumps(after['architecture']))
    def containers(architecture):
        return ([topic for stage in architecture['lifecycle'] for topic in stage['topics']] +
                [step for loop in architecture['loops'] for step in loop['steps']] + architecture['contexts'])
    left, right = containers(old), containers(new)
    require(len(left) == len(right), 'Architecture definition changed')
    for prior, current in zip(left, right):
        refs = current.pop('articles')
        require(all(ref in refs for ref in prior.pop('articles')), 'Existing view reference removed')
        for ref in refs:
            if isinstance(ref, dict):
                require(set(ref) <= {'article', 'topic', 'reason'}, 'Unknown navigation reference field')
    require(old == new, 'Architecture definition changed')


class SafeArticleHTML(HTMLParser):
    """Reject executable content after Markdown rendering (code fences remain text)."""
    allowed = {'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'span', 'a', 'strong', 'em',
               'del', 'code', 'pre', 'blockquote', 'ul', 'ol', 'li', 'hr', 'br',
               'table', 'thead', 'tbody', 'tr', 'th', 'td', 'img', 'input'}

    def handle_starttag(self, tag, attrs):
        require(tag in self.allowed, 'Active/unsupported HTML in knowledge change')
        attrs = dict(attrs)
        if tag == 'input':
            require(attrs.get('type') == 'checkbox' and 'disabled' in attrs, 'Interactive HTML in knowledge change')
        for key, value in attrs.items():
            require(not key.startswith('on') and key not in {'style', 'srcdoc', 'formaction'}, 'Active HTML attribute')
            if key in {'href', 'src'}:
                url = re.sub(r'[\x00-\x20]', '', value or '')
                require('\\' not in url and not url.startswith('//') and urlsplit(url).scheme.lower() in {'', 'https', 'http'}, 'Unsafe content URL')


def validate_change_set(proposal, *, root, current_head, progress=None):
    """Return build counts; never edits the checkout or calls GitHub."""
    root = Path(root).resolve()
    notify = progress or (lambda stage, status: None)
    notify('envelope', 'running')
    validate_proposal(proposal)
    require(proposal['base_commit'] == current_head, 'Repository changed; reconfirm')
    require(proposal['contract_digest'] == contract_digest(root), 'Contract changed; reconfirm')
    changes = {item['path']: item for item in proposal['file_changes']}
    for name, item in changes.items():
        path = root / name
        require(path.resolve().parent == (root / 'content').resolve() and not path.is_symlink(), 'Path escapes canonical content')
        actual = hashlib.sha256(path.read_bytes()).hexdigest() if path.exists() else None
        require(actual == item['before_sha256'], 'Before-image changed: ' + name)
    notify('envelope', 'passed')
    notify('semantic_validation', 'running')
    before, after = {}, {}
    for name in ('manifest', 'topics', 'anchors', 'architecture'):
        path = 'content/' + name + '.json'
        before[name] = json.loads((root / path).read_text(encoding='utf-8'))
        after[name] = json.loads(changes[path]['after_utf8']) if path in changes else before[name]
    try:
        check_metadata(before, after)
        files = {p['file'] for p in after['manifest']['pages']}
        require(all(Path(path).name in files for path in changes if path.endswith('.md')), 'Unregistered Markdown file')
    except (KeyError, TypeError) as error:
        raise ValueError('Malformed knowledge metadata') from error

    notify('semantic_validation', 'passed')
    with tempfile.TemporaryDirectory() as temp:
        target = Path(temp) / 'atlas'
        target.mkdir()
        for folder in ('content', 'assets', 'scripts'):
            shutil.copytree(root / folder, target / folder, ignore=shutil.ignore_patterns('__pycache__'))
        shutil.copy(root / 'build.py', target)
        copy_contract_files(root, target)
        for name, item in changes.items():
            (target / name).write_text(item['after_utf8'], encoding='utf-8')
        for stage, script in (('content_validation', 'scripts/validate_content.py'), ('repository_build', 'build.py')):
            notify(stage, 'running')
            result = subprocess.run([sys.executable, script], cwd=target, capture_output=True, text=True)
            require(result.returncode == 0, 'Candidate validation failed: ' + result.stdout + result.stderr)
            notify(stage, 'passed')
        notify('render_regression', 'running')
        built = (target / 'dist/index.html').read_text(encoding='utf-8')
        payload = json.loads(re.search(r'<script id="atlas-data" type="application/json">(.+?)</script>', built, re.S)[1])
        for page in payload['pages']:
            if 'content/' + page['file'] in changes:
                SafeArticleHTML().feed(page['html'])
        result = subprocess.run([sys.executable, 'scripts/smoke_test.py'], cwd=target, capture_output=True, text=True)
        require(result.returncode == 0, 'Candidate rendering regression failed')
        notify('render_regression', 'passed')
        return {'articles': len(payload['pages']), 'topics': len(payload['topics'])}
