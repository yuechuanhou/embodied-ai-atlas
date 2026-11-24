"""Synthetic Git-based regression for the public publication gate."""
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest
import sys
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from agent.publication_gate import validate_publication
from agent.revisions import canonical_bytes, contract_digest, copy_contract_files

ROOT = Path(__file__).resolve().parent.parent


class PublicPublicationTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        for name in ('content', 'assets', 'scripts'):
            shutil.copytree(ROOT / name, self.root / name, ignore=shutil.ignore_patterns('__pycache__'))
        shutil.copy(ROOT / 'build.py', self.root)
        copy_contract_files(ROOT, self.root)
        self.git('init', '-q')
        self.git('config', 'user.name', 'Synthetic fixture')
        self.git('config', 'user.email', 'fixture@example.test')
        self.git('add', '.')
        self.git('commit', '-qm', 'Synthetic base')
        self.base = self.git('rev-parse', 'HEAD').strip()
        manifest = json.loads((self.root / 'content/manifest.json').read_text())
        self.article = next(p for p in manifest['pages'] if p['id'] == 'sensors-and-estimation')
        self.path = 'content/' + self.article['file']
        self.before = (self.root / self.path).read_text()

    def git(self, *args):
        return subprocess.run(['git', *args], cwd=self.root, capture_output=True, text=True, check=True).stdout

    def commit(self, *, after=None, change=None, extra=False):
        after = after if after is not None else self.before + '\n## Synthetic public appendix\n\nA bounded synthetic observation.\n'
        receipt = {'schema_version': 1, 'operation': 'extend_article', 'base_commit': self.base,
                   'contract_digest': contract_digest(self.root), 'article_id': self.article['id'], 'path': self.path,
                   'before_sha256': hashlib.sha256(self.before.encode()).hexdigest(),
                   'after_sha256': hashlib.sha256(after.encode()).hexdigest(), **(change or {})}
        (self.root / self.path).write_text(after)
        if extra:
            with (self.root / 'content/topics.json').open('a') as stream:
                stream.write('\n')
        self.git('add', '.')
        self.git('commit', '-qm', 'Atlas knowledge update\n\nAtlas-Publication: ' + canonical_bytes(receipt).decode())
        head = self.git('rev-parse', 'HEAD').strip()
        self.git('checkout', '-q', '--detach', self.base)
        return head

    def test_exact_public_append_reuses_content_build_and_render_checks(self):
        result = validate_publication(root=self.root, base=self.base, head=self.commit())
        manifest = json.loads((self.root / 'content/manifest.json').read_text())
        topics = json.loads((self.root / 'content/topics.json').read_text())
        self.assertEqual(result, {'articles': len(manifest['pages']), 'topics': len(topics['topics'])})

    def test_extra_private_fields_or_wrong_contract_are_rejected(self):
        for change in ({'candidate_id': 'private-id'}, {'contract_digest': '0' * 64}, {'after_sha256': '0' * 64}, {'operation': 'delete_article'}):
            with self.subTest(change=change):
                head = self.commit(change=change)
                with self.assertRaises(ValueError):
                    validate_publication(root=self.root, base=self.base, head=head)

    def test_original_content_rewrite_and_extra_file_are_rejected(self):
        for options in ({'after': 'Synthetic rewrite\n' + self.before}, {'extra': True}):
            with self.subTest(options=list(options)):
                with self.assertRaises(ValueError):
                    validate_publication(root=self.root, base=self.base, head=self.commit(**options))

    def test_untrusted_checkout_or_non_single_commit_cannot_supply_validator_code(self):
        head = self.commit()
        self.git('checkout', '-q', head)
        with self.assertRaises(ValueError):
            validate_publication(root=self.root, base=self.base, head=head)
        self.git('commit', '--allow-empty', '-qm', 'Unreviewed additional commit')
        later = self.git('rev-parse', 'HEAD').strip()
        self.git('checkout', '-q', self.base)
        with self.assertRaises(ValueError):
            validate_publication(root=self.root, base=self.base, head=later)

    def test_public_workflow_uses_base_code_read_permissions_and_no_private_inputs(self):
        workflow = (ROOT / '.github/workflows/check.yml').read_text().split('  orbit-publication:\n', 1)[1]
        self.assertIn('github.event.pull_request.base.sha', workflow)
        self.assertIn('persist-credentials: false', workflow)
        self.assertIn('python -m agent.publication_gate', workflow)
        self.assertNotIn('secrets.', workflow)
        self.assertNotIn('pull_request_target', workflow)
        self.assertNotIn('upload-artifact', workflow)


if __name__ == '__main__':
    unittest.main()
