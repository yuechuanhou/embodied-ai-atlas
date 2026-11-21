-- Private process data only. Not applied to any Cloudflare database.
-- D1 enables foreign keys. Local runners must set PRAGMA foreign_keys = ON.
-- Timestamps are UTC Unix seconds; JSON fields are validated by the service too.
CREATE TABLE sessions (
    id TEXT PRIMARY KEY NOT NULL,
    owner_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
    reading_context_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(reading_context_json)),
    summary_json TEXT CHECK (summary_json IS NULL OR json_valid(summary_json)),
    created_at INTEGER NOT NULL CHECK (created_at >= 0),
    updated_at INTEGER NOT NULL CHECK (updated_at >= created_at),
    UNIQUE (id, owner_id)
);

CREATE TABLE messages (
    id TEXT PRIMARY KEY NOT NULL,
    session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    sequence INTEGER NOT NULL CHECK (sequence >= 1),
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'tool')),
    body TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('streaming', 'complete', 'failed')),
    citations_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(citations_json)),
    created_at INTEGER NOT NULL CHECK (created_at >= 0),
    UNIQUE (session_id, sequence)
);

CREATE TABLE source_records (
    id TEXT PRIMARY KEY NOT NULL,
    owner_id TEXT NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('atlas', 'official', 'paper', 'experience', 'inference')),
    reference TEXT NOT NULL,
    content_digest TEXT,
    revision TEXT,
    visibility TEXT NOT NULL CHECK (visibility IN ('private', 'public')),
    checked_at INTEGER NOT NULL CHECK (checked_at >= 0),
    metadata_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(metadata_json)),
    UNIQUE (id, owner_id)
);

CREATE TABLE knowledge_candidates (
    id TEXT PRIMARY KEY NOT NULL,
    owner_id TEXT NOT NULL,
    session_id TEXT NOT NULL,
    title TEXT NOT NULL,
    dedup_key TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('captured', 'researching', 'drafting', 'ready', 'dismissed')),
    evidence_status TEXT NOT NULL CHECK (evidence_status IN ('insufficient', 'checked', 'owner_experience')),
    draft_markdown TEXT NOT NULL DEFAULT '',
    placement_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(placement_json)),
    source_revision TEXT,
    version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
    created_at INTEGER NOT NULL CHECK (created_at >= 0),
    updated_at INTEGER NOT NULL CHECK (updated_at >= created_at),
    UNIQUE (id, owner_id),
    UNIQUE (session_id, dedup_key),
    FOREIGN KEY (session_id, owner_id) REFERENCES sessions(id, owner_id) ON DELETE CASCADE
);

CREATE TABLE candidate_sources (
    candidate_id TEXT NOT NULL,
    source_id TEXT NOT NULL,
    owner_id TEXT NOT NULL,
    supports TEXT NOT NULL,
    PRIMARY KEY (candidate_id, source_id),
    FOREIGN KEY (candidate_id, owner_id) REFERENCES knowledge_candidates(id, owner_id) ON DELETE CASCADE,
    FOREIGN KEY (source_id, owner_id) REFERENCES source_records(id, owner_id) ON DELETE RESTRICT
);

CREATE TABLE change_proposals (
    id TEXT PRIMARY KEY NOT NULL,
    owner_id TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('draft', 'ready', 'executing', 'completed', 'blocked', 'cancelled')),
    created_at INTEGER NOT NULL CHECK (created_at >= 0),
    updated_at INTEGER NOT NULL CHECK (updated_at >= created_at),
    UNIQUE (id, owner_id)
);

CREATE TABLE proposal_versions (
    proposal_id TEXT NOT NULL,
    proposal_version INTEGER NOT NULL CHECK (proposal_version >= 1),
    owner_id TEXT NOT NULL,
    schema_version INTEGER NOT NULL CHECK (schema_version = 1),
    patch_digest TEXT NOT NULL CHECK (length(patch_digest) = 64),
    base_commit TEXT NOT NULL CHECK (length(base_commit) = 40),
    contract_digest TEXT NOT NULL CHECK (length(contract_digest) = 64),
    release_scope TEXT NOT NULL CHECK (release_scope IN ('open_pr', 'merge_and_deploy')),
    envelope_json TEXT NOT NULL CHECK (json_valid(envelope_json)),
    created_at INTEGER NOT NULL CHECK (created_at >= 0),
    PRIMARY KEY (proposal_id, proposal_version),
    UNIQUE (proposal_id, proposal_version, owner_id),
    UNIQUE (proposal_id, proposal_version, owner_id, patch_digest, base_commit, contract_digest, release_scope),
    FOREIGN KEY (proposal_id, owner_id) REFERENCES change_proposals(id, owner_id) ON DELETE CASCADE
);

CREATE TRIGGER immutable_proposal_version
BEFORE UPDATE ON proposal_versions
BEGIN
    SELECT RAISE(ABORT, 'Insert a new proposal version instead');
END;

CREATE TABLE proposal_candidates (
    proposal_id TEXT NOT NULL,
    proposal_version INTEGER NOT NULL,
    candidate_id TEXT NOT NULL,
    owner_id TEXT NOT NULL,
    PRIMARY KEY (proposal_id, proposal_version, candidate_id),
    FOREIGN KEY (proposal_id, proposal_version, owner_id) REFERENCES proposal_versions(proposal_id, proposal_version, owner_id) ON DELETE CASCADE,
    FOREIGN KEY (candidate_id, owner_id) REFERENCES knowledge_candidates(id, owner_id) ON DELETE CASCADE
);

CREATE TABLE approvals (
    id TEXT PRIMARY KEY NOT NULL,
    proposal_id TEXT NOT NULL,
    proposal_version INTEGER NOT NULL,
    owner_id TEXT NOT NULL,
    patch_digest TEXT NOT NULL,
    base_commit TEXT NOT NULL,
    contract_digest TEXT NOT NULL,
    release_scope TEXT NOT NULL,
    created_at INTEGER NOT NULL CHECK (created_at >= 0),
    expires_at INTEGER NOT NULL CHECK (expires_at > created_at),
    revoked_at INTEGER CHECK (revoked_at IS NULL OR revoked_at >= created_at),
    UNIQUE (id, owner_id),
    FOREIGN KEY (proposal_id, proposal_version, owner_id, patch_digest, base_commit, contract_digest, release_scope)
        REFERENCES proposal_versions(proposal_id, proposal_version, owner_id, patch_digest, base_commit, contract_digest, release_scope) ON DELETE CASCADE
);

CREATE UNIQUE INDEX one_unrevoked_approval ON approvals(proposal_id, proposal_version) WHERE revoked_at IS NULL;

-- An approval can only be revoked, never reassigned or rewritten.
CREATE TRIGGER immutable_approval
BEFORE UPDATE ON approvals
WHEN NEW.id IS NOT OLD.id OR NEW.proposal_id IS NOT OLD.proposal_id
    OR NEW.proposal_version IS NOT OLD.proposal_version OR NEW.owner_id IS NOT OLD.owner_id
    OR NEW.patch_digest IS NOT OLD.patch_digest OR NEW.base_commit IS NOT OLD.base_commit
    OR NEW.contract_digest IS NOT OLD.contract_digest OR NEW.release_scope IS NOT OLD.release_scope
    OR NEW.created_at IS NOT OLD.created_at OR NEW.expires_at IS NOT OLD.expires_at
    OR OLD.revoked_at IS NOT NULL
BEGIN
    SELECT RAISE(ABORT, 'Approval is immutable; revoke and create another');
END;

CREATE TABLE jobs (
    id TEXT PRIMARY KEY NOT NULL,
    owner_id TEXT NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('organize', 'sync', 'publish')),
    approval_id TEXT,
    idempotency_key TEXT NOT NULL UNIQUE,
    execution_id TEXT UNIQUE,
    status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'waiting_owner', 'blocked', 'retryable', 'failed', 'succeeded', 'cancelled')),
    milestone TEXT NOT NULL DEFAULT 'private' CHECK (milestone IN ('private', 'approved', 'pr_open', 'checks_passed', 'merged', 'deployed', 'indexed')),
    attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
    version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
    input_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(input_json)),
    result_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(result_json)),
    error_code TEXT,
    created_at INTEGER NOT NULL CHECK (created_at >= 0),
    updated_at INTEGER NOT NULL CHECK (updated_at >= created_at),
    CHECK ((kind = 'publish' AND approval_id IS NOT NULL) OR (kind != 'publish' AND approval_id IS NULL)),
    FOREIGN KEY (approval_id, owner_id) REFERENCES approvals(id, owner_id) ON DELETE RESTRICT
);

CREATE TABLE knowledge_snapshots (
    revision TEXT PRIMARY KEY NOT NULL CHECK (length(revision) = 40),
    manifest_digest TEXT NOT NULL CHECK (length(manifest_digest) = 64),
    contract_digest TEXT NOT NULL CHECK (length(contract_digest) = 64),
    status TEXT NOT NULL CHECK (status IN ('staging', 'active', 'retired', 'failed')),
    imported_at INTEGER NOT NULL CHECK (imported_at >= 0),
    activated_at INTEGER CHECK (activated_at IS NULL OR activated_at >= imported_at),
    CHECK (status != 'active' OR activated_at IS NOT NULL)
);

CREATE UNIQUE INDEX one_active_snapshot ON knowledge_snapshots(status) WHERE status = 'active';
CREATE INDEX sessions_by_owner ON sessions(owner_id, updated_at);
CREATE INDEX candidates_by_owner_status ON knowledge_candidates(owner_id, status, updated_at);
CREATE INDEX jobs_by_owner_status ON jobs(owner_id, status, updated_at);
CREATE INDEX sources_by_owner ON source_records(owner_id, checked_at);
