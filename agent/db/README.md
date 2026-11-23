# Private process database v1

`migrations/0001_initial.sql` defines the D1-compatible SQLite baseline, tested
locally with foreign keys enabled. The Owner-only production Worker and D1 are in
use; this file describes schema and service obligations, not a cloud migration
receipt. See the deployment evidence in [AGENT_ROADMAP.md](../../AGENT_ROADMAP.md).
No production/preview credentials or account settings are included here.

`0002_private_runtime.sql` adds request idempotency, per-session execution leases,
transaction guards, usage reservations and derived snapshot/sync state. Both migrations
are exercised in a local workerd/D1 instance by `agent/runtime/` tests. Actual
migration records must be checked in the selected deployment. Runtime HTTP calls are bounded requests,
not durable publishing Workflows. Retention and cloud recovery still need real settings.

## Data ownership and normalization

| Table | Owns |
| --- | --- |
| `sessions` | Owner-scoped conversations, reading context, rebuildable summary |
| `messages` | Ordered messages and historical citation snapshots |
| `source_records` | Owner-scoped evidence pointers and checked versions |
| `knowledge_candidates` | Private drafts, maturity, dedup identity within a session |
| `candidate_sources` | Evidence support scope; no copied evidence bodies |
| `change_proposals` | Logical proposal identity and process status |
| `proposal_versions` | Immutable reviewed envelopes and matching digest columns |
| `proposal_candidates` | Candidate membership for each proposal version |
| `approvals` | Exact version/digest/base/contract/scope approved by authenticated Owner |
| `jobs` | Durable execution pointers, idempotency and publication milestones |
| `knowledge_snapshots` | Imported retrieval snapshot metadata, at most one active |

Session presentation names use the optional `sessions.summary_json.title` key (1–80
Unicode code points after whitespace normalization). A metadata update uses `json_patch`, keeps
other object keys, and replaces non-object legacy summary values with an object.
Missing titles are derived from the first user message at read time. This metadata
is not used as model memory; future context summaries must preserve the `title` and
`pinned` keys. The optional `summary_json.pinned` is a strict boolean; missing or
legacy non-boolean values count as unpinned. Sorting and pagination prioritize pins.
No schema migration or production database reset is needed for this addition.

Splitting proposal identity from versions prevents approved history being overwritten.
Composite foreign keys keep related Owner-scoped records consistent. This is not a
multiuser product or row-level authorization implementation: every service query must
still enforce the configured single Owner. `owner_id` is a stable server-derived
identifier, not an email accepted from a client.

GitHub remains the only editable source of published knowledge. These tables do not
store a second authoritative encyclopedia. Snapshot metadata is global to the one
public Atlas; private sessions and drafts never enter its retrieval artifact.

## Validation and service obligations

- IDs are opaque strings; timestamps are integer UTC Unix seconds. Use application
  generation and explicit timestamp updates, not implicit DB clock assumptions.
- SQL enforces foreign keys, uniqueness, JSON syntax, status values, immutable
  proposal updates and approval bindings. JSON structure/schema, hex digests and
  envelope-to-column consistency are checked by trusted service code. Inserting an
  envelope must derive its indexed fields from one validated object.
- State transitions, monotonic versions, lease/CAS updates and external GitHub
  semantics remain service responsibilities. CHECK enums do not enforce transitions.
- An unrevoked approval may still be expired. The publisher checks identity,
  expiration, revocation and current revisions before each external action. Revoke
  an expired row before issuing a replacement; never extend its expiry in place.
- A publish job requires an approval FK. It cannot infer authorization from a
  proposal status or from a chat message. A non-publish job cannot carry an approval.
- Activation of a complete validated snapshot retires the old row and activates
  the new row atomically. The unique index prevents two active rows, but the service
  must ensure a failed swap rolls back instead of leaving no active snapshot.
- Use parameterized queries and D1's supported atomic batch/transaction facilities
  when implemented. Do not assume Python transaction code is the deployed D1 API.

## Migrations and verification

Only append new numbered migrations after this baseline is accepted/applied. Before
production migration, export the actual database, apply migrations to a preview copy,
check row counts/foreign keys and run service smoke tests. Wrangler should track
applied migration filenames; do not build a second competing migration registry.

```sh
python -m pip install -r requirements-dev.txt
python scripts/test_agent.py
```

Tests create temporary SQLite databases, apply migrations in filename order, test
constraints and export/restore with `iterdump`. This is a local portability check;
Wrangler/D1 migration and recovery drills remain deployment prerequisites.

Official references: [D1 migrations](https://developers.cloudflare.com/d1/reference/migrations/),
[D1 foreign keys](https://developers.cloudflare.com/d1/sql-api/foreign-keys/).

## Privacy, retention, export and deletion

The runtime provides authenticated per-session export and deletion, documented in
`agent/runtime/README.md`. A general account purge, independent source/candidate
deletion and backup cleanup are not implemented. Their scope and authorization
follow [CONTENT_CHANGE_POLICY.md](../../CONTENT_CHANGE_POLICY.md). Explicit
retention periods for chats, candidates, evidence and audit metadata still require
a separate decision; no scheduled deletion is silently enabled by this migration.

Export is Owner-scoped and includes schema version, source provenance, proposals,
approvals and job results. Never export API keys, Access cookies or App secrets.
Secrets belong in deployment secret storage, not these tables or log fields.

Deleting a session cascades messages, its candidates and candidate evidence joins;
unreferenced sources need explicit cleanup. Reviewed proposals remain until separately
deleted: deleting a learning session must not silently erase a publication audit.
For a complete private purge, stop active jobs, remove jobs, proposals (cascading
versions/approvals/membership), sessions and then sources. The service must present
this scope, verify Owner and handle in-flight work atomically; SQL alone is not a
deletion UI. Existing public GitHub history is outside private DB deletion.

Backups can retain deleted records until their retention window expires. Document
the actual D1 recovery window and post-restore deletion/reconciliation procedure
after selecting deployment settings. Test restoration in an isolated database and
disable publish jobs during recovery so restored approvals cannot replay actions.
Private responses use `Cache-Control: private, no-store`; logs record IDs, timing,
stage and sanitized error codes rather than raw prompts/drafts/secrets.
