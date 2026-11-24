import {ApiError, canonical, epoch, exactKeys, json, readJSONRequest, requireValue, sha256, uid} from './common.js';
import {proposalDetail} from './proposal-preparation.js';
import {candidateDetail, candidateFor} from './candidate-review.js';
import {publicProjection} from './publication-projection.js';
import {createPublicationGitHub, publicationConfiguration} from './publication-github.js';

const binding = proposal => ({version: proposal.proposal_version, patch_digest: proposal.patch_digest});
const jobKey = (owner, p) => sha256('open_public_pr:' + owner + ':' + p.proposal_id + ':' + p.proposal_version + ':' + p.patch_digest);
const parse = row => ({...row, input: JSON.parse(row.input_json), result: JSON.parse(row.result_json)});

export function createPublication({fetchImpl = fetch, synchronize, github = createPublicationGitHub(fetchImpl)} = {}) {
  const syncRow = db => db.prepare('SELECT * FROM runtime_sync WHERE id=1').first();
  async function context(env, owner, id, version, force) {
    const snapshot = await synchronize(env, force), sync = await syncRow(env.DB);
    const detail = await proposalDetail(env.DB, owner, id, version, snapshot, sync);
    const latest = await env.DB.prepare('SELECT MAX(proposal_version) AS n FROM proposal_versions WHERE proposal_id=? AND owner_id=?').bind(id, owner).first();
    detail.stale ||= latest.n !== version;
    return {snapshot, detail};
  }
  async function rowFor(db, owner, proposal) {
    const row = await db.prepare("SELECT * FROM jobs WHERE owner_id=? AND kind='publish' AND idempotency_key=?").bind(owner, await jobKey(owner, proposal)).first();
    return row ? parse(row) : null;
  }
  async function save(db, row, result, {status = row.status, milestone = row.milestone, error = null} = {}) {
    const saved = await db.prepare('UPDATE jobs SET result_json=?,status=?,milestone=?,error_code=?,updated_at=? WHERE id=? AND owner_id=? AND version=? RETURNING *')
      .bind(canonical(result), status, milestone, error, epoch(), row.id, row.owner_id, row.version).first();
    requireValue(saved, 409, 'publication_task_changed'); return parse(saved);
  }
  async function allowed(env, owner, proposal, row, c) {
    const {detail} = await context(env, owner, proposal.proposal_id, proposal.proposal_version, false);
    requireValue(!detail.stale && detail.proposal.patch_digest === row.input.patch_digest &&
      row.input.configuration_digest === await sha256(canonical(c)), 409, 'publication_basis_changed');
    const approval = await env.DB.prepare('SELECT * FROM approvals WHERE id=? AND owner_id=?').bind(row.approval_id, owner).first();
    requireValue(approval && approval.revoked_at === null && approval.created_at <= epoch() && approval.expires_at > epoch() &&
      approval.proposal_id === proposal.proposal_id && approval.proposal_version === proposal.proposal_version &&
      approval.patch_digest === proposal.patch_digest && approval.base_commit === proposal.base_commit &&
      approval.contract_digest === proposal.contract_digest && approval.release_scope === 'open_pr', 409, 'publication_approval_expired');
    const current = await env.DB.prepare('SELECT version,status FROM jobs WHERE id=? AND owner_id=?').bind(row.id, owner).first();
    requireValue(current?.version === row.version && current.status === 'running', 409, 'publication_task_changed');
  }
  async function execute(env, c, owner, proposal, initial) {
    let row = initial;
    const claimed = await env.DB.prepare("UPDATE jobs SET status='running',version=version+1,attempts=attempts+1,updated_at=? WHERE id=? AND owner_id=? AND version=? AND status IN ('queued','waiting_owner','blocked') RETURNING *")
      .bind(epoch(), row.id, owner, row.version).first();
    if (!claimed) return;
    row = parse(claimed);
    try {
      const api = await github.connect(env, c), p = row.input.public;
      async function write(action, nextPhase, call) {
        await allowed(env, owner, proposal, row, c);
        requireValue(await api.main() === p.base_commit, 409, 'publication_basis_changed');
        row = await save(env.DB, row, {...row.result, pending_action: action});
        const value = await call();
        row = await save(env.DB, row, {...row.result, phase: nextPhase, pending_action: null,
          ...(nextPhase === 'commit_created' ? {head: value} : {}), ...(nextPhase === 'pr_open' ? {pr: value} : {})});
      }
      if (row.result.phase === 'approved') {
        requireValue(await api.branch(p.branch) === null, 409, 'publication_branch_exists');
        const beforeSha = await api.before(p);
        row = await save(env.DB, row, {...row.result, before_blob_sha: beforeSha});
        await write('branch', 'branch_created', () => api.createBranch(p));
      }
      if (row.result.phase === 'branch_created') {
        requireValue(await api.branch(p.branch) === p.base_commit, 409, 'publication_head_changed');
        await write('commit', 'commit_created', () => api.commit(p, row.result.before_blob_sha));
      }
      if (row.result.phase === 'commit_created') {
        requireValue(await api.branch(p.branch) === row.result.head, 409, 'publication_head_changed');
        await api.verifyHead(p, row.result.head);
        const existing = await api.find(p, row.result.head);
        if (existing) row = await save(env.DB, row, {...row.result, phase: 'pr_open', pending_action: null, pr: existing});
        else await write('pr', 'pr_open', () => api.open(p, row.result.head));
      }
      if (row.result.phase === 'pr_open') {
        await save(env.DB, row, row.result, {status: 'succeeded', milestone: 'pr_open'});
      }
    } catch (error) {
      const code = error instanceof ApiError ? error.code : 'publication_outcome_unknown';
      // Retain the pending action even after an HTTP rejection. Reconciliation
      // is read-only; absence alone cannot prove a remote write never happened.
      await save(env.DB, row, row.result, {status: 'blocked', error: code}).catch(() => {});
    }
  }
  async function refresh(env, c, row) {
    if (!c || row.input.configuration_digest !== await sha256(canonical(c))) return {row, state: 'configuration_changed'};
    if (row.status === 'running' && row.updated_at > epoch() - 120) return {row, state: 'creating'};
    try {
      const api = await github.connect(env, c), p = row.input.public;
      if (row.result.pending_action) {
        const head = await api.branch(p.branch); let result = row.result;
        if (result.pending_action === 'branch' && head === p.base_commit) result = {...result, phase: 'branch_created', pending_action: null};
        else if (result.pending_action === 'commit' && head && head !== p.base_commit) {
          await api.verifyHead(p, head); result = {...result, phase: 'commit_created', pending_action: null, head};
        } else if (result.pending_action === 'pr' && head === result.head) {
          await api.verifyHead(p, head); const pr = await api.find(p, head);
          if (pr) result = {...result, phase: 'pr_open', pending_action: null, pr};
        }
        if (result.pending_action) return {row, state: 'outcome_unknown'};
        // A version increment prevents a terminated/late writer resuming the old lease.
        const adopted = await env.DB.prepare("UPDATE jobs SET result_json=?,status=?,milestone=?,error_code=NULL,version=version+1,updated_at=? WHERE id=? AND owner_id=? AND version=? RETURNING *")
          .bind(canonical(result), result.pr ? 'succeeded' : 'waiting_owner', result.pr ? 'pr_open' : 'approved', epoch(), row.id, row.owner_id, row.version).first();
        requireValue(adopted, 409, 'publication_task_changed'); row = parse(adopted);
      }
      if (row.result.pr) {
        const pr = await api.status(p, row.result.pr);
        row = await save(env.DB, row, {...row.result, pr}, {status: 'succeeded', milestone: pr.checks === 'passed' ? 'checks_passed' : 'pr_open'});
        return {row, state: pr.checks};
      }
      return {row, state: row.error_code || (row.status === 'running' ? 'outcome_unknown' : 'awaiting_resume')};
    } catch (error) {return {row, state: error instanceof ApiError ? error.code : 'publication_github_unavailable'};}
  }
  async function read(env, owner, id, version, {force = false, refreshRemote = true} = {}) {
    const {snapshot, detail} = await context(env, owner, id, version, force);
    let config = null, configurationError = null;
    try {config = publicationConfiguration(env);} catch {configurationError = 'publication_configuration_invalid';}
    const preview = !detail.stale ? await publicProjection(detail, snapshot) : null;
    let row = await rowFor(env.DB, owner, detail.proposal), state = configurationError || (config ? 'private_review' : 'not_configured');
    if (row) {
      if (refreshRemote) ({row, state} = await refresh(env, config, row));
      else state = row.result.pr ? 'pending' : row.error_code || 'creating';
    }
    let resumable = false;
    if (row && !detail.stale && !row.result.pr && !row.result.pending_action && row.status !== 'running' && config &&
      row.input.configuration_digest === await sha256(canonical(config))) {
      const a = await env.DB.prepare('SELECT expires_at,revoked_at FROM approvals WHERE id=? AND owner_id=?').bind(row.approval_id, owner).first();
      resumable = !!a && a.revoked_at === null && a.expires_at > epoch();
    }
    return {enabled: !!config, status: state, stale: detail.stale, preview,
      binding: binding(detail.proposal), resume_available: resumable, merge_available: false,
      ...(row ? {job_id: row.id, phase: row.result.phase, pr: row.result.pr || null, error_code: row.error_code} : {})};
  }
  async function start(env, owner, id, body) {
    const fields = ['version','patch_digest','public_digest','technical_reviewed','editorial_reviewed','public_scope_confirmed','resume'];
    requireValue(exactKeys(body, fields) && Number.isSafeInteger(body.version) && body.version > 0 &&
      body.technical_reviewed === true && body.editorial_reviewed === true && body.public_scope_confirmed === true &&
      (body.resume === undefined || typeof body.resume === 'boolean'), 400, 'publication_review_required');
    const c = publicationConfiguration(env); requireValue(c, 409, 'publication_not_configured');
    const {snapshot, detail} = await context(env, owner, id, body.version, true), proposal = detail.proposal;
    requireValue(!detail.stale && proposal.patch_digest === body.patch_digest, 409, 'publication_basis_changed');
    const preview = await publicProjection(detail, snapshot);
    requireValue(preview.public_digest === body.public_digest, 409, 'publication_scope_changed');
    let row = await rowFor(env.DB, owner, proposal);
    if (row) {
      if (body.resume === true) {
        requireValue(!row.result.pending_action && !row.result.pr && row.status !== 'running', 409, 'publication_reconcile_required');
        await execute(env, c, owner, proposal, row);
      }
      return read(env, owner, id, body.version);
    }
    requireValue(!body.resume, 409, 'publication_task_not_found');
    const candidate = await candidateFor(env.DB, detail.review.candidate_id, owner);
    const reviewed = await candidateDetail(env.DB, candidate, snapshot);
    requireValue(reviewed.candidate.placement_view.review_is_current && reviewed.evidence && candidate.status === 'ready', 409, 'proposal_evidence_required');
    const now = epoch(), jobId = uid(), approvalId = uid(), key = await jobKey(owner, proposal);
    const input = {proposal_id: id, version: body.version, patch_digest: proposal.patch_digest,
      configuration_digest: await sha256(canonical(c)), public: preview};
    try {
      await env.DB.batch([
        // The existing assertion table is FK-bound to runtime_requests. Both
        // temporary rows are created and removed inside this same transaction.
        env.DB.prepare("INSERT INTO runtime_requests(id,owner_id,session_id,input_digest,status,created_at,updated_at) VALUES(?,?,?,?,'completed',?,?)")
          .bind(jobId, owner, candidate.session_id, key, now, now),
        env.DB.prepare("INSERT INTO runtime_commit_guards(request_id,valid) SELECT ?,CASE WHEN EXISTS(SELECT 1 FROM knowledge_candidates WHERE id=? AND owner_id=? AND version=? AND status='ready') AND NOT EXISTS(SELECT 1 FROM proposal_versions WHERE proposal_id=? AND owner_id=? AND proposal_version>?) AND EXISTS(SELECT 1 FROM runtime_sync WHERE id=1 AND repo_head=? AND published_revision=? AND error_code IS NULL AND lock_token IS NULL) AND (SELECT COUNT(*) FROM jobs WHERE owner_id=? AND kind='publish' AND created_at>=?)<10 THEN 1 ELSE 0 END")
          .bind(jobId, candidate.id, owner, detail.review.candidate_version, id, owner, body.version, proposal.base_commit, proposal.base_commit, owner, now - 86400),
        env.DB.prepare("INSERT INTO approvals(id,proposal_id,proposal_version,owner_id,patch_digest,base_commit,contract_digest,release_scope,created_at,expires_at) VALUES(?,?,?,?,?,?,?,'open_pr',?,?)")
          .bind(approvalId, id, body.version, owner, proposal.patch_digest, proposal.base_commit, proposal.contract_digest, now, now + 900),
        env.DB.prepare("INSERT INTO jobs(id,owner_id,kind,approval_id,idempotency_key,execution_id,status,milestone,input_json,result_json,created_at,updated_at) VALUES(?,?,'publish',?,?,?,'queued','approved',?,?,?,?)")
          .bind(jobId, owner, approvalId, key, preview.branch, canonical(input), canonical({phase: 'approved', pending_action: null}), now, now),
        env.DB.prepare('DELETE FROM runtime_commit_guards WHERE request_id=?').bind(jobId),
        env.DB.prepare('DELETE FROM runtime_requests WHERE id=? AND owner_id=?').bind(jobId, owner),
      ]);
    } catch {
      row = await rowFor(env.DB, owner, proposal);
      requireValue(row, 409, 'publication_task_not_created');
      return read(env, owner, id, body.version);
    }
    row = await rowFor(env.DB, owner, proposal);
    await execute(env, c, owner, proposal, row);
    return read(env, owner, id, body.version);
  }
  return {read, start, async route({request, env, owner, pathname, searchParams}) {
    const match = pathname.match(/^\/api\/proposals\/([a-f0-9-]{36})\/publication$/);
    if (!match) return null;
    if (request.method === 'GET') {
      const version = Number(searchParams.get('version'));
      requireValue(Number.isSafeInteger(version) && version > 0 && version <= 1000000, 400, 'invalid_proposal_version');
      return json(await read(env, owner, match[1], version));
    }
    if (request.method === 'POST') return json(await start(env, owner, match[1], await readJSONRequest(request)));
    throw new ApiError(405, 'method_not_allowed');
  }};
}
