"""Offline integrity/DB regressions. No live model, identity or publish tests."""
import copy
import hashlib
import json
from pathlib import Path
import sqlite3
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from agent.proposals import (BINDING_FIELDS, CONTRACT_FILES, canonical_bytes,
                             check_approval_binding, contract_digest,
                             proposal_digest, validate_proposal)
from jsonschema.exceptions import ValidationError

OWNER = "synthetic-owner"
NOW = 1000


def proposal_fixture():
    """Synthetic private envelope; never applies a knowledge edit."""
    before = (ROOT / "content/overview.md").read_bytes()
    proposal = {
        "schema_version": 1, "proposal_id": "fixture-proposal", "proposal_version": 1,
        "base_commit": "a" * 40, "published_revision": "b" * 40,
        "index_revision": "b" * 40, "contract_digest": contract_digest(),
        "patch_digest": "0" * 64, "candidate_ids": ["fixture-candidate"],
        "summary": "Synthetic contract fixture, not real knowledge",
        "intents": [{"kind": "extend_article", "target_id": "overview", "reason": "Contract test"}],
        "evidence": [{
            "source_id": "fixture-source", "kind": "experience",
            "reference": "Synthetic fixture observation", "checked_at": "2026-11-20T00:00:00Z",
            "verification": "owner_experience", "visibility": "private", "supports": ["Fixture only"]
        }],
        "file_changes": [{"path": "content/overview.md",
                          "before_sha256": hashlib.sha256(before).hexdigest(),
                          "after_utf8": before.decode("utf-8") + "\n<!-- synthetic fixture -->\n"}],
        "publication": {"visibility": "public", "release_scope": "open_pr",
                        "review_note": "Synthetic data only"},
    }
    proposal["patch_digest"] = proposal_digest(proposal)
    return proposal


def approval_fixture(proposal):
    return {**{k: proposal[k] for k in BINDING_FIELDS}, "owner_id": OWNER,
            "release_scope": proposal["publication"]["release_scope"],
            "created_at": NOW - 1, "expires_at": NOW + 60, "revoked_at": None}


class ProposalContracts(unittest.TestCase):
    def setUp(self):
        self.proposal = proposal_fixture()
        self.approval = approval_fixture(self.proposal)

    def check(self, proposal=None, approval=None, **overrides):
        args = dict(authenticated_owner=OWNER, configured_owner=OWNER,
                    current_head=self.proposal["base_commit"],
                    current_contract=self.proposal["contract_digest"], now=NOW)
        args.update(overrides)
        check_approval_binding(proposal or self.proposal, approval or self.approval, **args)

    def test_complete_envelope_and_exact_approval_pass(self):
        validate_proposal(self.proposal)
        self.check()

    def test_unknown_commands_and_non_content_paths_fail(self):
        for path in ("assets/site.js", ".github/workflows/check.yml", "CONTENT_STYLE_GUIDE.md",
                     "CONTENT_CHANGE_POLICY.md", "content/../secret.md",
                     "content/nested/secret.md", "/content/example.md", "content/example.md\n"):
            with self.subTest(path=path), self.assertRaises(ValidationError):
                proposal = copy.deepcopy(self.proposal)
                proposal["file_changes"][0]["path"] = path
                proposal["patch_digest"] = proposal_digest(proposal)
                validate_proposal(proposal)
        self.proposal["execute"] = "arbitrary command"
        with self.assertRaises(ValidationError):
            validate_proposal(self.proposal)

    def test_content_edit_without_new_digest_fails(self):
        self.proposal["file_changes"][0]["after_utf8"] += "changed"
        with self.assertRaisesRegex(ValueError, "digest"):
            validate_proposal(self.proposal)

    def test_resigning_a_changed_envelope_cannot_reuse_approval(self):
        variants = []
        for field, value in (("proposal_version", 2), ("base_commit", "c" * 40),
                             ("contract_digest", "d" * 64), ("summary", "Changed public rationale")):
            proposal = copy.deepcopy(self.proposal)
            proposal[field] = value
            variants.append(proposal)
        proposal = copy.deepcopy(self.proposal)
        proposal["publication"]["release_scope"] = "merge_and_deploy"
        variants.append(proposal)
        proposal = copy.deepcopy(self.proposal)
        proposal["file_changes"][0]["after_utf8"] += "changed"
        variants.append(proposal)
        for proposal in variants:
            proposal["patch_digest"] = proposal_digest(proposal)
            with self.subTest(digest=proposal["patch_digest"]), self.assertRaises(ValueError):
                self.check(proposal=proposal)

    def test_current_repository_and_contract_must_match(self):
        for field, value in (("current_head", "f" * 40), ("current_contract", "f" * 64)):
            with self.subTest(field=field), self.assertRaisesRegex(ValueError, "reconfirm"):
                self.check(**{field: value})

    def test_identity_scope_expiration_and_revocation_fail_closed(self):
        for override in ({"configured_owner": ""}, {"authenticated_owner": "other-owner"}):
            with self.subTest(override=override), self.assertRaises(ValueError):
                self.check(**override)
        for field, value in (("owner_id", "other-owner"), ("release_scope", "merge_and_deploy"),
                             ("expires_at", NOW), ("created_at", NOW + 1), ("created_at", True),
                             ("revoked_at", NOW)):
            approval = {**self.approval, field: value}
            with self.subTest(field=field), self.assertRaises(ValueError):
                self.check(approval=approval)

    def test_unverified_evidence_and_invalid_dates_remain_private(self):
        for edits in ({"verification": "unverified"}, {"kind": "inference"},
                      {"kind": "official"}, {"checked_at": "2026-02-30T00:00:00Z"}):
            proposal = copy.deepcopy(self.proposal)
            proposal["evidence"][0].update(edits)
            proposal["patch_digest"] = proposal_digest(proposal)
            with self.subTest(edits=edits), self.assertRaises(ValueError):
                validate_proposal(proposal)

    def test_duplicate_targets_and_sources_fail(self):
        for field in ("file_changes", "evidence"):
            proposal = copy.deepcopy(self.proposal)
            proposal[field].append(copy.deepcopy(proposal[field][0]))
            proposal["patch_digest"] = proposal_digest(proposal)
            with self.subTest(field=field), self.assertRaisesRegex(ValueError, "Duplicate"):
                validate_proposal(proposal)

    def test_canonical_encoding_is_independent_of_key_order(self):
        expected = '{"a":"机器人","z":1}'.encode("utf-8")
        self.assertEqual(canonical_bytes({"z": 1, "a": "机器人"}), expected)
        reordered = dict(reversed(list(self.proposal.items())))
        self.assertEqual(proposal_digest(reordered), self.proposal["patch_digest"])
        self.proposal["proposal_version"] = 1.0
        self.proposal["patch_digest"] = proposal_digest(self.proposal)
        with self.assertRaisesRegex(ValueError, "integer"):
            validate_proposal(self.proposal)

    def test_changed_contract_bytes_invalidate_digest(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            for name in CONTRACT_FILES:
                target = root / name
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes((ROOT / name).read_bytes())
            before = contract_digest(root)
            self.assertEqual(before, contract_digest())
            path = root / "ARCHITECTURE.md"
            path.write_bytes(path.read_bytes() + b"\nChanged contract\n")
            self.assertNotEqual(before, contract_digest(root))

    def test_editorial_and_operation_rules_invalidate_old_approvals(self):
        rules = ('CONTENT_STYLE_GUIDE.md', 'CONTENT_CHANGE_POLICY.md')
        self.assertTrue(set(rules) <= set(CONTRACT_FILES))
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            for name in CONTRACT_FILES:
                target = root / name
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes((ROOT / name).read_bytes())
            for name in rules:
                with self.subTest(rule=name):
                    path = root / name
                    original = path.read_bytes()
                    path.write_bytes(original + b'\nChanged normative rule\n')
                    with self.assertRaisesRegex(ValueError, 'reconfirm'):
                        self.check(current_contract=contract_digest(root))
                    path.write_bytes(original)
            self.assertEqual(contract_digest(root), self.proposal['contract_digest'])

    def test_delete_or_migration_intent_cannot_expand_v1_permissions(self):
        variants = []
        for kind in ('delete_article', 'merge_topics', 'split_topic', 'retire_article'):
            proposal = copy.deepcopy(self.proposal)
            proposal['intents'][0]['kind'] = kind
            variants.append(proposal)
        for update in ({'after_utf8': None}, {'operation': 'delete'}, {'after_utf8': ''}):
            proposal = copy.deepcopy(self.proposal)
            proposal['file_changes'][0].update(update)
            variants.append(proposal)
        for proposal in variants:
            proposal['patch_digest'] = proposal_digest(proposal)
            with self.subTest(proposal=proposal), self.assertRaises(ValidationError):
                validate_proposal(proposal)


class DatabaseContracts(unittest.TestCase):
    def insert(self, table, **values):
        # Table/column names are hardcoded test inputs; values are parameterized.
        columns = ",".join(values)
        params = ",".join("?" for _ in values)
        self.db.execute(f"INSERT INTO {table} ({columns}) VALUES ({params})", tuple(values.values()))

    def setUp(self):
        self.db = sqlite3.connect(":memory:")
        self.db.execute("PRAGMA foreign_keys = ON")
        for migration in sorted((ROOT / "agent/db/migrations").glob("*.sql")):
            self.db.executescript(migration.read_text())
        self.proposal = proposal_fixture()
        self.insert("sessions", id="session", owner_id=OWNER, created_at=1, updated_at=1)
        self.insert("source_records", id="fixture-source", owner_id=OWNER, kind="experience",
                    reference="Synthetic", visibility="private", checked_at=1)
        self.insert("knowledge_candidates", id="fixture-candidate", owner_id=OWNER, session_id="session",
                    title="Fixture", dedup_key="fixture", status="ready", evidence_status="owner_experience",
                    created_at=1, updated_at=1)
        self.insert("candidate_sources", candidate_id="fixture-candidate", source_id="fixture-source",
                    owner_id=OWNER, supports="Fixture only")
        self.insert("change_proposals", id=self.proposal["proposal_id"], owner_id=OWNER,
                    status="ready", created_at=1, updated_at=1)
        self.insert("proposal_versions", **{k: self.proposal[k] for k in BINDING_FIELDS},
                    owner_id=OWNER, schema_version=1, release_scope="open_pr",
                    envelope_json=json.dumps(self.proposal), created_at=1)
        self.insert("proposal_candidates", proposal_id=self.proposal["proposal_id"], proposal_version=1,
                    candidate_id="fixture-candidate", owner_id=OWNER)
        self.db.commit()

    def tearDown(self):
        self.db.close()

    def approve(self, **overrides):
        values = {"id": "approval", **approval_fixture(self.proposal), **overrides}
        self.insert("approvals", **values)

    def job(self, **overrides):
        values = dict(id="job", owner_id=OWNER, kind="publish", approval_id="approval",
                      idempotency_key="fixture-publish-v1", status="queued", created_at=1, updated_at=1)
        values.update(overrides)
        self.insert("jobs", **values)

    def test_foreign_keys_owner_boundaries_and_json_are_enforced(self):
        with self.assertRaises(sqlite3.IntegrityError):
            self.insert("messages", id="m", session_id="absent", sequence=1, role="user",
                        body="fixture", status="complete", created_at=1)
        self.insert("source_records", id="foreign-source", owner_id="other-owner", kind="experience",
                    reference="Synthetic other owner", visibility="private", checked_at=1)
        with self.assertRaises(sqlite3.IntegrityError):
            self.insert("candidate_sources", candidate_id="fixture-candidate", source_id="foreign-source",
                        owner_id=OWNER, supports="wrong owner")
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute("UPDATE sessions SET summary_json = 'not json'")
        self.assertEqual(self.db.execute("PRAGMA foreign_key_check").fetchall(), [])

    def test_message_order_and_candidate_dedup_constraints(self):
        values = dict(session_id="session", sequence=1, role="user", body="fixture", status="complete", created_at=1)
        self.insert("messages", id="message-1", **values)
        with self.assertRaises(sqlite3.IntegrityError):
            self.insert("messages", id="message-2", **values)
        with self.assertRaises(sqlite3.IntegrityError):
            self.insert("knowledge_candidates", id="duplicate", owner_id=OWNER, session_id="session",
                        title="Duplicate", dedup_key="fixture", status="captured", evidence_status="insufficient",
                        created_at=1, updated_at=1)

    def test_proposal_versions_are_immutable_and_approval_matches_exactly(self):
        with self.assertRaisesRegex(sqlite3.IntegrityError, "new proposal version"):
            self.db.execute("UPDATE proposal_versions SET base_commit = ?", ("c" * 40,))
        for overrides in ({"patch_digest": "f" * 64}, {"proposal_version": 2}, {"owner_id": "other-owner"},
                          {"release_scope": "merge_and_deploy"}, {"expires_at": NOW - 1}):
            with self.subTest(overrides=overrides), self.assertRaises(sqlite3.IntegrityError):
                self.approve(**overrides)
        self.approve()
        with self.assertRaises(sqlite3.IntegrityError):
            self.approve(id="duplicate-approval")
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute("UPDATE approvals SET expires_at = expires_at + 100")
        self.db.execute("UPDATE approvals SET revoked_at = ?", (NOW,))
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute("UPDATE approvals SET revoked_at = NULL")
        self.approve(id="replacement-approval")

    def test_publish_job_requires_approval_and_is_idempotent(self):
        with self.assertRaises(sqlite3.IntegrityError):
            self.job(approval_id=None)
        with self.assertRaises(sqlite3.IntegrityError):
            self.job()
        self.approve()
        self.job()
        with self.assertRaises(sqlite3.IntegrityError):
            self.job(id="duplicate-job")
        with self.assertRaises(sqlite3.IntegrityError):
            self.job(id="wrong-owner-job", idempotency_key="another", owner_id="other-owner")

    def test_snapshot_uniqueness_and_failed_activation_rollback(self):
        for revision, status, activated in (("a" * 40, "active", 1), ("b" * 40, "staging", None)):
            self.insert("knowledge_snapshots", revision=revision, manifest_digest="c" * 64,
                        contract_digest="d" * 64, status=status, imported_at=1, activated_at=activated)
        self.db.commit()
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute("UPDATE knowledge_snapshots SET status = 'active', activated_at = 2 WHERE status = 'staging'")
        with self.assertRaises(sqlite3.IntegrityError), self.db:
            self.db.execute("UPDATE knowledge_snapshots SET status = 'retired' WHERE status = 'active'")
            self.db.execute("UPDATE knowledge_snapshots SET status = 'active', activated_at = 0 WHERE status = 'staging'")
        active = self.db.execute("SELECT revision FROM knowledge_snapshots WHERE status = 'active'").fetchone()[0]
        self.assertEqual(active, "a" * 40)
        with self.db:
            self.db.execute("UPDATE knowledge_snapshots SET status = 'retired' WHERE status = 'active'")
            self.db.execute("UPDATE knowledge_snapshots SET status = 'active', activated_at = 2 WHERE status = 'staging'")
        self.assertEqual(self.db.execute("SELECT revision FROM knowledge_snapshots WHERE status = 'active'").fetchone()[0], "b" * 40)

    def test_session_deletion_and_full_purge_are_distinct(self):
        self.approve()
        self.job()
        self.insert("messages", id="message", session_id="session", sequence=1, role="user",
                    body="fixture", status="complete", created_at=1)
        self.db.execute("DELETE FROM sessions WHERE id = 'session'")
        for table in ("messages", "knowledge_candidates", "candidate_sources", "proposal_candidates"):
            self.assertEqual(self.db.execute(f"SELECT count(*) FROM {table}").fetchone()[0], 0)
        self.assertEqual(self.db.execute("SELECT count(*) FROM proposal_versions").fetchone()[0], 1)
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute("DELETE FROM change_proposals")
        self.db.execute("DELETE FROM jobs")
        self.db.execute("DELETE FROM change_proposals")
        self.db.execute("DELETE FROM source_records")
        self.assertEqual(self.db.execute("SELECT count(*) FROM approvals").fetchone()[0], 0)
        self.assertEqual(self.db.execute("PRAGMA foreign_key_check").fetchall(), [])

    def test_local_export_restore_preserves_history_and_constraints(self):
        self.approve()
        self.job()
        exported = "\n".join(self.db.iterdump())
        restored = sqlite3.connect(":memory:")
        try:
            # SQLite dump order is not FK-topological; enable/check after restoring.
            restored.executescript(exported)
            restored.execute("PRAGMA foreign_keys = ON")
            self.assertEqual(restored.execute("PRAGMA foreign_key_check").fetchall(), [])
            envelope = restored.execute("SELECT envelope_json FROM proposal_versions").fetchone()[0]
            validate_proposal(json.loads(envelope))
            self.assertEqual(restored.execute("SELECT count(*) FROM jobs").fetchone()[0], 1)
            with self.assertRaises(sqlite3.IntegrityError):
                restored.execute("UPDATE proposal_versions SET base_commit = ?", ("f" * 40,))
        finally:
            restored.close()


if __name__ == "__main__":
    unittest.main()
