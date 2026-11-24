"""Check an explicitly public Orbit commit using only its public Git objects.

Run from the trusted PR base checkout. No private envelope, evidence record,
candidate/session ID, D1 access, publisher credential or model call is required.
"""
import hashlib
import json
from pathlib import Path
import re
import subprocess

from agent.change_validation import require, validate_content_changes
from agent.revisions import canonical_bytes, contract_digest

PREFIX = 'Atlas-Publication: '
FIELDS = {'schema_version', 'operation', 'base_commit', 'contract_digest',
          'article_id', 'path', 'before_sha256', 'after_sha256'}


def git(root, *args):
    result = subprocess.run(['git', *args], cwd=root, capture_output=True, check=True)
    require(len(result.stdout) <= 800_000, 'Git object too large')
    return result.stdout


def validate_publication(*, root, base, head):
    root = Path(root).resolve()
    require(all(re.fullmatch(r'[a-f0-9]{40}', value or '') for value in (base, head)), 'Invalid Git revision')
    require(git(root, 'rev-parse', 'HEAD').decode().strip() == base, 'Validator must run from the trusted base checkout')
    parents = git(root, 'rev-list', '--parents', '-n', '1', head).decode().strip().split()
    require(parents == [head, base], 'Orbit change must be one commit on the approved base')
    message = git(root, 'show', '-s', '--format=%B', head).decode('utf-8').strip()
    require(message.startswith('Atlas knowledge update\n\n' + PREFIX), 'Missing public publication receipt')
    encoded = message[len('Atlas knowledge update\n\n' + PREFIX):]
    receipt = json.loads(encoded)
    require(isinstance(receipt, dict) and set(receipt) == FIELDS and type(receipt['schema_version']) is int and
            receipt['schema_version'] == 1 and receipt['operation'] == 'extend_article', 'Unsupported public receipt')
    require(encoded.encode() == canonical_bytes(receipt), 'Receipt must be canonical')
    require(receipt['base_commit'] == base and receipt['contract_digest'] == contract_digest(root), 'Base or contract changed')
    for key in ('before_sha256', 'after_sha256'):
        require(isinstance(receipt[key], str) and re.fullmatch(r'[a-f0-9]{64}', receipt[key]), 'Invalid content digest')
    name = receipt['path']
    require(isinstance(name, str) and re.fullmatch(r'content/[a-z0-9][a-z0-9_-]*\.md', name), 'Unsupported content path')
    manifest = json.loads((root / 'content/manifest.json').read_text())
    article = next((page for page in manifest['pages'] if page['id'] == receipt['article_id']), None)
    require(article and 'content/' + article['file'] == name, 'Canonical article mismatch')
    changed = git(root, 'diff', '--name-only', '-z', base, head).decode().split('\0')
    require(changed == [name, ''], 'Unexpected file changes')
    require(git(root, 'ls-tree', head, '--', name).decode().startswith('100644 blob '), 'Article must be a regular file')
    before = (root / name).read_bytes()
    after = git(root, 'show', head + ':' + name)
    require(len(before) < 500_000 and len(before) < len(after) <= len(before) + 60_000 and after.startswith(before), 'Only a bounded exact article append is supported')
    require(hashlib.sha256(before).hexdigest() == receipt['before_sha256'] and
            hashlib.sha256(after).hexdigest() == receipt['after_sha256'], 'Public content digest mismatch')
    return validate_content_changes([{'path': name, 'before_sha256': receipt['before_sha256'], 'after_utf8': after.decode('utf-8')}], root=root)


if __name__ == '__main__':
    import os
    try:
        validate_publication(root='.', base=os.environ.get('ATLAS_REVIEW_BASE'), head=os.environ.get('ATLAS_REVIEW_HEAD'))
        print('PASS: approved public diff passed structural, content, build and render checks.')
    except Exception:
        # Fixed diagnostics suffice; the public receipt never imports private data.
        raise SystemExit('FAIL: Orbit public change validation did not complete. Review the exact base/head diff.')
