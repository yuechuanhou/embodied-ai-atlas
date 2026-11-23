"""Semantic proposal gates against the real knowledge model, without repo writes."""
import copy
import hashlib
import json
from pathlib import Path
import sys
import unittest

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / 'scripts'))
from agent.change_validation import validate_change_set
from agent.proposals import proposal_digest
from test_agent import proposal_fixture


class ChangeContracts(unittest.TestCase):
    def setUp(self):
        self.proposal = proposal_fixture()

    def check(self):
        self.proposal['patch_digest'] = proposal_digest(self.proposal)
        return validate_change_set(self.proposal, root=ROOT, current_head=self.proposal['base_commit'])

    def metadata(self, name, mutate):
        path = ROOT / ('content/' + name + '.json')
        value = json.loads(path.read_text())
        mutate(value)
        self.proposal['file_changes'].append({'path': str(path.relative_to(ROOT)),
            'before_sha256': hashlib.sha256(path.read_bytes()).hexdigest(),
            'after_utf8': json.dumps(value, ensure_ascii=False, indent=2)})

    def test_canonical_extension_builds_without_touching_source(self):
        before = (ROOT / 'content/overview.md').read_bytes()
        result = self.check()
        self.assertGreaterEqual(result['articles'], 26)
        self.assertEqual((ROOT / 'content/overview.md').read_bytes(), before)

    def test_before_image_or_repository_change_blocks(self):
        with self.assertRaisesRegex(ValueError, 'Repository changed'):
            validate_change_set(self.proposal, root=ROOT, current_head='f' * 40)
        self.proposal['file_changes'][0]['before_sha256'] = '0' * 64
        with self.assertRaisesRegex(ValueError, 'Before-image'):
            self.check()

    def test_taxonomy_edit_cannot_hide_behind_valid_content_path(self):
        self.metadata('architecture', lambda value: value['lifecycle'][0].update(title='Replaced stage'))
        with self.assertRaisesRegex(ValueError, 'Architecture definition'):
            self.check()

    def test_ordinary_view_reference_can_be_added(self):
        self.metadata('architecture', lambda value: value['lifecycle'][0]['topics'][0]['articles'].append(
            {'topic': 'vio', 'reason': 'Synthetic view reference to validate a canonical target'}))
        self.check()

    def test_primary_domain_move_is_not_an_ordinary_content_update(self):
        self.metadata('manifest', lambda value: value['pages'][0].update(primary_domain='data', section='data'))
        with self.assertRaisesRegex(ValueError, 'ownership'):
            self.check()

    def test_removal_of_historical_articles_relations_or_view_entries_is_blocked(self):
        mutations = (
            ('manifest', lambda value: value['pages'].pop(), 'Historical article removed'),
            ('topics', lambda value: value['relations'].pop(), 'Existing relation removed'),
            ('architecture', lambda value: value['contexts'][0]['articles'].pop(), 'Existing view reference removed'),
        )
        for name, mutate, message in mutations:
            with self.subTest(kind=name):
                self.proposal = proposal_fixture()
                self.metadata(name, mutate)
                with self.assertRaisesRegex(ValueError, message):
                    self.check()

    def test_historical_topic_anchor_and_alias_cannot_be_removed(self):
        for name, mutate in (('topics', lambda value: value['topics'].pop()),
                             ('anchors', lambda value: value.pop())):
            with self.subTest(name=name):
                self.proposal = proposal_fixture()
                self.metadata(name, mutate)
                with self.assertRaisesRegex(ValueError, 'Historical'):
                    self.check()

    def test_unknown_reference_and_unregistered_file_are_rejected(self):
        self.metadata('architecture', lambda value: value['contexts'][0]['articles'].append('absent-topic'))
        with self.assertRaisesRegex(ValueError, 'validation failed'):
            self.check()
        self.proposal = proposal_fixture()
        self.proposal['file_changes'].append({'path': 'content/unregistered.md', 'before_sha256': None, 'after_utf8': '# Extra'})
        with self.assertRaisesRegex(ValueError, 'Unregistered'):
            self.check()

    def test_rendered_active_html_and_unsafe_urls_fail_but_fenced_xml_passes(self):
        original = self.proposal['file_changes'][0]['after_utf8']
        for addition in ('\n<script>alert(1)</script>\n', '\n<img src="x" onerror="alert(1)">\n',
                         '\n<a href="jav&#97;script:alert(1)">unsafe</a>\n'):
            with self.subTest(addition=addition):
                self.proposal['file_changes'][0]['after_utf8'] = original + addition
                with self.assertRaises(ValueError):
                    self.check()
        self.proposal['file_changes'][0]['after_utf8'] = original + '\n```xml\n<joint name="demo"/>\n```\n'
        self.check()


if __name__ == '__main__':
    unittest.main()
