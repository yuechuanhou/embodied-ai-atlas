-- Additive runtime state; no credentials, and no changes to immutable approval rules.
ALTER TABLE sessions ADD COLUMN active_request_id TEXT;
ALTER TABLE sessions ADD COLUMN lease_until INTEGER;
ALTER TABLE messages ADD COLUMN metadata_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(metadata_json));
ALTER TABLE knowledge_snapshots ADD COLUMN payload_json TEXT CHECK (payload_json IS NULL OR json_valid(payload_json));

CREATE TABLE runtime_requests (
    id TEXT PRIMARY KEY NOT NULL,
    owner_id TEXT NOT NULL,
    session_id TEXT NOT NULL,
    input_digest TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
    response_json TEXT CHECK (response_json IS NULL OR json_valid(response_json)),
    error_code TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    FOREIGN KEY (session_id, owner_id) REFERENCES sessions(id, owner_id) ON DELETE CASCADE
);
CREATE INDEX requests_by_session ON runtime_requests(session_id, created_at);

-- Transient transaction assertion: stale completions roll back their whole batch.
CREATE TABLE runtime_commit_guards (
    request_id TEXT PRIMARY KEY REFERENCES runtime_requests(id) ON DELETE CASCADE,
    valid INTEGER NOT NULL CHECK (valid = 1)
);

CREATE TABLE usage_daily (
    owner_id TEXT NOT NULL,
    day TEXT NOT NULL,
    calls INTEGER NOT NULL CHECK (calls >= 0),
    reserved_tokens INTEGER NOT NULL CHECK (reserved_tokens >= 0),
    PRIMARY KEY (owner_id, day)
);

CREATE TABLE runtime_sync (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    repo_head TEXT,
    published_revision TEXT,
    checked_at INTEGER NOT NULL DEFAULT 0,
    error_code TEXT,
    lock_token TEXT,
    lock_until INTEGER NOT NULL DEFAULT 0
);
INSERT INTO runtime_sync (id) VALUES (1);
