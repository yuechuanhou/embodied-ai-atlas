-- Private structural checks are separate from Owner approvals and publication jobs.
CREATE TABLE proposal_validations (
    id TEXT PRIMARY KEY NOT NULL,
    owner_id TEXT NOT NULL,
    proposal_id TEXT NOT NULL,
    proposal_version INTEGER NOT NULL,
    patch_digest TEXT NOT NULL CHECK (length(patch_digest) = 64),
    base_commit TEXT NOT NULL CHECK (length(base_commit) = 40),
    contract_digest TEXT NOT NULL CHECK (length(contract_digest) = 64),
    executor_digest TEXT NOT NULL CHECK (length(executor_digest) = 64),
    attempt INTEGER NOT NULL CHECK (attempt >= 1 AND attempt <= 10),
    status TEXT NOT NULL CHECK (status IN ('dispatching','queued','running','reported','passed','failed','unknown','expired')),
    run_id TEXT UNIQUE,
    lease_until INTEGER NOT NULL,
    report_json TEXT CHECK (report_json IS NULL OR json_valid(report_json)),
    error_code TEXT,
    checked_at INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    UNIQUE (owner_id, proposal_id, proposal_version, executor_digest, attempt),
    FOREIGN KEY (proposal_id, proposal_version, owner_id) REFERENCES proposal_versions(proposal_id, proposal_version, owner_id) ON DELETE CASCADE
);
CREATE INDEX proposal_validation_versions ON proposal_validations(owner_id, proposal_id, proposal_version, created_at DESC);
CREATE TRIGGER immutable_validation_binding
BEFORE UPDATE OF owner_id, proposal_id, proposal_version, patch_digest, base_commit, contract_digest, executor_digest, attempt, created_at ON proposal_validations
BEGIN
    SELECT RAISE(ABORT, 'Validation bindings are immutable');
END;
