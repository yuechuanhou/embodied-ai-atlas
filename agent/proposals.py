"""Offline proposal integrity checks, not authentication or a GitHub writer.

The future API must construct approvals from verified identity and enforce semantic
file changes, repository checks and GitHub policy separately. Never accept an
approval object, owner configuration or current revisions from a model/client.
"""
import hashlib
import json
from datetime import datetime
from pathlib import Path

from jsonschema import Draft202012Validator

ROOT = Path(__file__).resolve().parent.parent
CONTRACT_FILES = (
    "ARCHITECTURE.md", "AGENT_ARCHITECTURE.md", "CONTENT_WORKFLOW.md",
    "agent/contracts/knowledge-change.schema.json", "agent/proposals.py",
    "scripts/validate_content.py", "scripts/legacy_articles.json",
    "content/manifest.json", "content/architecture.json", "content/topics.json",
    "content/anchors.json",
)
BINDING_FIELDS = (
    "proposal_id", "proposal_version", "patch_digest", "base_commit", "contract_digest",
)


def canonical_bytes(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True,
                      separators=(",", ":"), allow_nan=False).encode("utf-8")


def digest(value):
    return hashlib.sha256(canonical_bytes(value)).hexdigest()


def proposal_digest(proposal):
    """Bind the entire reviewed envelope, not only its content files."""
    return digest({k: v for k, v in proposal.items() if k != "patch_digest"})


def contract_digest(root=ROOT):
    """Conservative invalidation: any listed rule/metadata byte change matters."""
    return digest({name: hashlib.sha256((root / name).read_bytes()).hexdigest()
                   for name in CONTRACT_FILES})


def validate_proposal(proposal):
    schema = json.loads((ROOT / "agent/contracts/knowledge-change.schema.json").read_text())
    Draft202012Validator.check_schema(schema)
    Draft202012Validator(schema).validate(proposal)
    # JSON Schema accepts mathematically integral floats; avoid cross-runtime
    # JSON serialization differences (Python 1.0 versus JavaScript 1).
    if any(type(proposal[k]) is not int for k in ("schema_version", "proposal_version")):
        raise ValueError("Version fields must use integer JSON values")
    if proposal["patch_digest"] != proposal_digest(proposal):
        raise ValueError("Proposal digest does not match reviewed content")
    paths = [f["path"] for f in proposal["file_changes"]]
    sources = [s["source_id"] for s in proposal["evidence"]]
    if len(paths) != len(set(paths)) or len(sources) != len(set(sources)):
        raise ValueError("Duplicate file path or evidence source")
    for source in proposal["evidence"]:
        datetime.strptime(source["checked_at"], "%Y-%m-%dT%H:%M:%SZ")
        if source["kind"] == "inference" or source["verification"] == "unverified":
            raise ValueError("Unverified knowledge must remain a private candidate")
        expected = "owner_experience" if source["kind"] == "experience" else "verified"
        if source["verification"] != expected:
            raise ValueError("Evidence type and verification disagree")


def check_approval_binding(proposal, approval, *, authenticated_owner,
                           configured_owner, current_head, current_contract, now):
    """Reference precondition check using trusted server inputs; raises on failure.

    A passing result alone does not authorize publication. There is deliberately
    no network, mutation, JWT decoder, state transition or publish implementation.
    """
    validate_proposal(proposal)
    if not configured_owner or authenticated_owner != configured_owner:
        raise ValueError("Owner identity mismatch")
    if approval.get("owner_id") != authenticated_owner:
        raise ValueError("Approval owner mismatch")
    if any(approval.get(k) != proposal[k] for k in BINDING_FIELDS):
        raise ValueError("Approval does not bind this proposal version")
    if approval.get("release_scope") != proposal["publication"]["release_scope"]:
        raise ValueError("Release scope mismatch")
    if approval.get("revoked_at") is not None:
        raise ValueError("Approval revoked")
    created, expires = approval.get("created_at"), approval.get("expires_at")
    if type(created) is not int or type(expires) is not int or not 0 <= created <= now < expires:
        raise ValueError("Approval expired or invalid")
    if current_head != proposal["base_commit"]:
        raise ValueError("Repository changed; revalidate and reconfirm")
    if current_contract != proposal["contract_digest"]:
        raise ValueError("Contract changed; revalidate and reconfirm")
