"""Lightweight checks for the Atlas manifest and internal page links."""
import json
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
CONTENT = ROOT / 'content'
manifest = json.loads((CONTENT / 'manifest.json').read_text(encoding='utf-8'))
errors = []
sections = {section['id'] for section in manifest['sections']}
entries = manifest['pages']
ids = [page['id'] for page in entries]
known_ids = set(ids)

if len(known_ids) != len(ids):
    errors.append('Duplicate page IDs in manifest.json')
if not all(page.get('title') and page.get('summary') for page in entries):
    errors.append('Every page needs a title and summary')

for page in entries:
    name = page['id']
    if page['section'] not in sections:
        errors.append(f'{name}: undefined section {page["section"]}')
    path = CONTENT / page['file']
    if not path.is_file() or path.resolve().parent != CONTENT.resolve():
        errors.append(f'{name}: missing or invalid Markdown file {page["file"]}')
        continue
    source = path.read_text(encoding='utf-8')
    for target in re.findall(r'\]\(\?page=([a-zA-Z0-9_-]+)', source):
        if target not in known_ids and target != 'home':
            errors.append(f'{name}: broken link to ?page={target}')
    for target in page.get('related', []):
        if target not in known_ids:
            errors.append(f'{name}: unknown related page {target}')

if errors:
    print('Content validation failed:')
    for issue in errors:
        print('  -', issue)
    sys.exit(1)
print(f'OK: {len(entries)} pages validated, {len(sections)} sections, internal links resolved.')
