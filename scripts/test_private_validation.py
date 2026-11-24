"""Synthetic tests only: no cloud credentials, user drafts or live Actions jobs."""
import copy
import importlib.util
import json
from pathlib import Path
import subprocess
import sqlite3
import sys
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / 'scripts'))
sys.path.insert(0, str(ROOT))
from test_agent import proposal_fixture
from agent.proposals import proposal_digest


def load(name):
    spec = importlib.util.spec_from_file_location('atlas_' + name, ROOT / 'agent/validation' / (name + '.py'))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


runner, workflow = load('runner'), load('prepare_workflow')


class PrivateChecks(unittest.TestCase):
    def check(self, proposal):
        proposal['patch_digest'] = proposal_digest(proposal)
        with tempfile.TemporaryDirectory() as temp:
            return runner.isolated_check(ROOT, proposal, 'a' * 40, Path(temp))

    def test_actual_after_image_builds_and_reports_all_five_checks_without_changing_source(self):
        before = (ROOT / 'content/overview.md').read_bytes()
        report = self.check(proposal_fixture())
        self.assertEqual(report['status'], 'passed')
        self.assertEqual(set(report['checks'].values()), {'passed'})
        articles = len(json.loads((ROOT / 'content/manifest.json').read_text())['pages'])
        self.assertEqual(report['counts'], {'articles': articles,
            'topics': articles + len(json.loads((ROOT / 'content/topics.json').read_text())['topics'])})
        self.assertEqual((ROOT / 'content/overview.md').read_bytes(), before)

    def test_invalid_envelope_and_active_html_fail_without_leaking_private_text_or_tracebacks(self):
        for addition in ('unknown_field', 'active_html'):
            with self.subTest(kind=addition), tempfile.TemporaryDirectory() as temp:
                marker = 'SYNTHETIC_PRIVATE_DO_NOT_LOG'
                p = proposal_fixture()
                if addition == 'unknown_field':
                    p[marker] = marker
                else:
                    p['file_changes'][0]['after_utf8'] += '\n<script>' + marker + '</script>\n'
                p['patch_digest'] = proposal_digest(p)
                directory = Path(temp)
                source, target = directory / 'p.json', directory / 'r.json'
                source.write_text(json.dumps(p))
                child = subprocess.run([sys.executable, '-I', str(ROOT / 'agent/validation/runner.py'), '--check', str(ROOT), str(source), str(target), 'a' * 40],
                    capture_output=True, text=True, env=runner.clean_env('a' * 40))
                self.assertEqual(child.returncode, 0)
                report = target.read_text()
                self.assertEqual(json.loads(report)['status'], 'failed')
                for result in (child.stdout, child.stderr, report):
                    self.assertNotIn(marker, result)
                    self.assertNotIn('Traceback', result)

    def test_before_image_and_architecture_change_fail_at_the_relevant_stage(self):
        p = proposal_fixture()
        p['file_changes'][0]['before_sha256'] = '0' * 64
        self.assertEqual(self.check(p)['checks']['envelope'], 'failed')
        p = proposal_fixture()
        file = ROOT / 'content/architecture.json'
        data = json.loads(file.read_text())
        data['lifecycle'][0]['title'] = 'Synthetic unauthorized taxonomy change'
        import hashlib
        p['file_changes'].append({'path': 'content/architecture.json', 'before_sha256': hashlib.sha256(file.read_bytes()).hexdigest(), 'after_utf8': json.dumps(data)})
        report = self.check(p)
        self.assertEqual(report['checks']['envelope'], 'passed')
        self.assertEqual(report['checks']['semantic_validation'], 'failed')

    def test_build_subprocess_environment_excludes_oidc_github_and_model_credentials(self):
        with patch.dict('os.environ', {'ACTIONS_ID_TOKEN_REQUEST_TOKEN': 'secret', 'GITHUB_TOKEN': 'secret', 'MODEL_API_KEY': 'secret', 'PYTHONPATH': 'untrusted'}):
            value = runner.clean_env('a' * 40)
        self.assertEqual(value['GITHUB_SHA'], 'a' * 40)
        self.assertFalse(any('TOKEN' in key or 'SECRET' in key or key == 'PYTHONPATH' for key in value))

    def test_private_workflow_is_pinned_and_has_no_draft_input_artifact_or_cache(self):
        body = workflow.prepare('a' * 40, 'https://validation.example.workers.dev')
        self.assertIn('github.event.repository.private == true', body)
        self.assertIn('ATLAS_VALIDATOR_REVISION: ' + 'a' * 40, body)
        self.assertIn('timeout-minutes: 8', body)
        self.assertNotIn('upload-artifact', body)
        self.assertNotIn('actions/cache', body)
        self.assertNotIn('pull_request_target', body)
        self.assertNotIn('__ATLAS_', body)
        for revision, origin in (('main', 'https://validation.example.workers.dev'), ('a' * 40, 'https://attacker.example')):
            with self.assertRaises(ValueError):
                workflow.prepare(revision, origin)

    def test_oidc_request_origin_cannot_be_replaced_with_a_user_url(self):
        with patch.dict('os.environ', {'ACTIONS_ID_TOKEN_REQUEST_URL': 'https://attacker.example/token', 'ACTIONS_ID_TOKEN_REQUEST_TOKEN': 'secret'}):
            with self.assertRaises(runner.RunnerError):
                runner.oidc('https://validation.example.workers.dev', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')

    def test_executor_and_source_dependencies_must_use_the_same_approved_toolchain(self):
        lock = (ROOT / 'agent/validation/requirements.lock').read_bytes()
        runner.verify_toolchain(ROOT, lock)
        with self.assertRaises(runner.RunnerError):
            runner.verify_toolchain(ROOT, lock + b'\n# synthetic changed dependencies\n')

    def test_additive_migration_preserves_existing_data_and_keeps_owner_and_binding_guards(self):
        db = sqlite3.connect(':memory:')
        self.addCleanup(db.close)
        db.execute('PRAGMA foreign_keys=ON')
        for name in ('0001_initial.sql', '0002_private_runtime.sql'):
            db.executescript((ROOT / 'agent/db/migrations' / name).read_text())
        db.execute("INSERT INTO sessions(id,owner_id,created_at,updated_at) VALUES('session','owner',1,1)")
        db.execute("INSERT INTO messages(id,session_id,sequence,role,body,status,created_at) VALUES('message','session',1,'user','Synthetic preserved message','complete',1)")
        db.execute("INSERT INTO change_proposals(id,owner_id,status,created_at,updated_at) VALUES('proposal','owner','draft',1,1)")
        db.execute("INSERT INTO proposal_versions(proposal_id,proposal_version,owner_id,schema_version,patch_digest,base_commit,contract_digest,release_scope,envelope_json,created_at) VALUES('proposal',1,'owner',1,?,?,?,'open_pr','{}',1)", ('a'*64, 'b'*40, 'c'*64))
        before = db.execute('SELECT * FROM messages').fetchall()
        db.executescript((ROOT / 'agent/db/migrations/0003_proposal_validation.sql').read_text())
        self.assertEqual(db.execute('SELECT * FROM messages').fetchall(), before)
        self.assertEqual(db.execute('SELECT COUNT(*) FROM proposal_versions').fetchone()[0], 1)
        self.assertEqual(db.execute('SELECT COUNT(*) FROM proposal_validations').fetchone()[0], 0)
        insert = "INSERT INTO proposal_validations(id,owner_id,proposal_id,proposal_version,patch_digest,base_commit,contract_digest,executor_digest,attempt,status,lease_until,created_at,updated_at) VALUES(?,?,'proposal',1,?,?,?,?,1,'queued',10,1,1)"
        with self.assertRaises(sqlite3.IntegrityError):
            db.execute(insert, ('wrong-owner','other','a'*64,'b'*40,'c'*64,'d'*64))
        db.execute(insert, ('check','owner','a'*64,'b'*40,'c'*64,'d'*64))
        with self.assertRaises(sqlite3.IntegrityError):
            db.execute("UPDATE proposal_validations SET base_commit=?", ('f'*40,))
        self.assertEqual(db.execute('PRAGMA foreign_key_check').fetchall(), [])


if __name__ == '__main__':
    unittest.main()
