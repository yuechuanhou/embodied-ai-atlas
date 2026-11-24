"""Regression checks for content growth, invalid metadata and heading migrations."""
import json
import os
import hashlib
import pathlib
import re
import shutil
import subprocess
import sys
import tempfile
import unittest

ROOT = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from agent.revisions import CONTRACT_FILES, canonical_bytes, copy_contract_files


class ContentContracts(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = pathlib.Path(self.temp.name) / "atlas"
        self.root.mkdir()
        for folder in ("content", "assets", "scripts"):
            shutil.copytree(ROOT / folder, self.root / folder, ignore=shutil.ignore_patterns("__pycache__"))
        shutil.copy(ROOT / "build.py", self.root)
        copy_contract_files(ROOT, self.root)

    def tearDown(self):
        self.temp.cleanup()

    def read(self, name):
        return json.loads((self.root / name).read_text())

    def write(self, name, value):
        (self.root / name).write_text(json.dumps(value, ensure_ascii=False))

    def run_script(self, name, succeeds=True):
        result = subprocess.run([sys.executable, name], cwd=self.root, capture_output=True, text=True)
        self.assertEqual(result.returncode == 0, succeeds, result.stdout + result.stderr)
        return result.stdout

    def test_new_article_does_not_break_historical_contract(self):
        manifest = self.read("content/manifest.json")
        article = {**manifest["pages"][0], "id": "growth-fixture", "file": "growth-fixture.md", "related": []}
        manifest["pages"].append(article)
        self.write("content/manifest.json", manifest)
        (self.root / "content/growth-fixture.md").write_text("## Growth fixture\n\nNew article.\n")
        self.run_script("scripts/validate_content.py")
        self.run_script("build.py")
        self.run_script("scripts/smoke_test.py")

    def test_public_agent_entry_handles_empty_pages_variable_override_and_disable(self):
        default = self.read('content/manifest.json')['site']['private_agent_origin']
        for override, expected in [('', default), ('https://agent.example.test', 'https://agent.example.test'), ('disabled', None)]:
            with self.subTest(override=override):
                result = subprocess.run([sys.executable, 'build.py'], cwd=self.root,
                                        env={**os.environ, 'ATLAS_AGENT_ORIGIN': override}, capture_output=True, text=True)
                self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
                built = (self.root / 'dist/index.html').read_text()
                payload = json.loads(re.search(r'<script id="atlas-data" type="application/json">(.+?)</script>', built, re.S)[1])
                self.assertEqual(payload.get('private_agent_origin'), expected)

    def test_heading_rename_keeps_topic_link(self):
        old = "VIO（Visual-Inertial Odometry）"
        new = "Visual Inertial Odometry overview"
        article = self.root / "content/sensors-and-estimation.md"
        article.write_text(article.read_text().replace(old, new))
        for name in ("content/topics.json", "content/anchors.json"):
            path = self.root / name
            path.write_text(path.read_text().replace(old, new))
        self.run_script("scripts/validate_content.py")
        self.run_script("build.py")
        built = (self.root / "dist/index.html").read_text()
        payload = json.loads(re.search(r'<script id="atlas-data" type="application/json">(.+?)</script>', built, re.S)[1])
        topic = next(t for t in payload["topics"] if t["id"] == "vio")
        self.assertEqual(topic["anchor"], "vio-visual-inertial-odometry")
        html = next(p["html"] for p in payload["pages"] if p["id"] == topic["article"])
        self.assertIn('id="visual-inertial-odometry-overview"', html)

    def test_retrieval_snapshot_contains_exact_markdown_and_unregistered_headings(self):
        article = self.root / 'content/sensors-and-estimation.md'
        article.write_text(article.read_text() + '\n#### A deeper unregistered heading\n\nSnapshot fixture body.\n')
        self.run_script('build.py')
        manifest = self.read('dist/knowledge-manifest.json')
        snapshot_path = self.root / 'dist' / manifest['index_path']
        self.assertEqual(hashlib.sha256(snapshot_path.read_bytes()).hexdigest(), manifest['index_sha256'])
        snapshot = json.loads(snapshot_path.read_bytes())
        page = next(p for p in snapshot['articles'] if p['id'] == 'sensors-and-estimation')
        self.assertEqual(page['markdown'], article.read_text())
        self.assertTrue(any(s['level'] == 4 and s['text'] == 'Snapshot fixture body.' for s in page['sections']))
        self.assertNotIn('messages', snapshot)
        self.assertNotIn('source_files', snapshot)
        rules = snapshot['proposal_context']
        self.assertEqual(set(rules), set(CONTRACT_FILES))
        for name in CONTRACT_FILES:
            self.assertEqual(rules[name], (self.root / name).read_text(encoding='utf-8'))
        hashes = {name: hashlib.sha256(body.encode('utf-8')).hexdigest()
                  for name, body in rules.items()}
        self.assertEqual(hashlib.sha256(canonical_bytes(hashes)).hexdigest(), snapshot['contract_digest'])

    def test_duplicate_relation_is_rejected(self):
        registry = self.read("content/topics.json")
        registry["relations"].append(registry["relations"][0])
        self.write("content/topics.json", registry)
        self.assertIn("Duplicate knowledge relations", self.run_script("scripts/validate_content.py", False))

    def test_focus_outside_view_is_rejected(self):
        registry = self.read("content/topics.json")
        registry["focus"][0]["view"] = "context:robot-integration"
        self.write("content/topics.json", registry)
        self.assertIn("not referenced by view", self.run_script("scripts/validate_content.py", False))

    def test_duplicate_membership_is_rejected(self):
        architecture = self.read("content/architecture.json")
        architecture["loops"][0]["stages"].append(architecture["loops"][0]["stages"][0])
        self.write("content/architecture.json", architecture)
        self.assertIn("stage membership", self.run_script("scripts/validate_content.py", False))


if __name__ == "__main__":
    unittest.main()
