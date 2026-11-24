import {createRemoteJWKSet, customFetch, jwtVerify} from 'jose';
import {ApiError, canonical, epoch, exactKeys, json, readJSONRequest, requireValue, uid} from './common.js';
import {proposalDetail} from './proposal-preparation.js';
import {createValidationGitHub, executorDigest, validationConfiguration, verifyRun} from './validation-github.js';

const idPattern = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const stages = ['envelope','semantic_validation','content_validation','repository_build','render_regression'];
const terminal = ['passed','failed','expired'];
const binding = row => ({proposal_id: row.proposal_id, proposal_version: row.proposal_version, patch_digest: row.patch_digest,
  base_commit: row.base_commit, contract_digest: row.contract_digest});
export const validationDisabled = () => ({enabled: false, status: 'not_configured', checks: null, retryable: false});

export function createProposalValidation({fetchImpl = fetch, synchronize} = {}) {
  const github = createValidationGitHub(fetchImpl);
  const jwks = createRemoteJWKSet(new URL('https://token.actions.githubusercontent.com/.well-known/jwks'), {
    [customFetch]: (url, init) => fetchImpl(url, {...init, redirect: 'manual'}), timeoutDuration: 5000});
  async function detail(env, owner, id, version, force = false) {
    const snapshot = await synchronize(env, force);
    return proposalDetail(env.DB, owner, id, version, snapshot, await env.DB.prepare('SELECT * FROM runtime_sync WHERE id=1').first());
  }
  async function latest(env, owner, id, version, digest) {
    return env.DB.prepare('SELECT * FROM proposal_validations WHERE owner_id=? AND proposal_id=? AND proposal_version=? AND executor_digest=? ORDER BY attempt DESC LIMIT 1')
      .bind(owner, id, version, digest).first();
  }
  const saveError = (env, row, status, code) => env.DB.prepare('UPDATE proposal_validations SET status=?,error_code=?,updated_at=? WHERE id=? AND status NOT IN (\'passed\',\'failed\',\'expired\')')
    .bind(status, code, epoch(), row.id).run();

  async function reconcile(env, c, row) {
    if (terminal.includes(row.status) || row.checked_at > epoch() - 5) return row;
    try {
      if (!row.run_id) {
        const found = await github.find(env, c, row);
        if (found) {
          row.run_id = String(found.id); verifyRun(found, c, row);
          await env.DB.prepare("UPDATE proposal_validations SET run_id=?,status='queued',error_code=NULL,updated_at=? WHERE id=? AND run_id IS NULL")
            .bind(row.run_id, epoch(), row.id).run();
        } else {
          // Absence in a paginated/temporarily delayed API response is not proof
          // that dispatch never happened. Do not automatically dispatch again.
          if (row.created_at < epoch() - 30) await saveError(env, row, 'unknown', 'validation_dispatch_unknown');
          return await env.DB.prepare('SELECT * FROM proposal_validations WHERE id=?').bind(row.id).first();
        }
      }
      const run = await github.run(env, c, row.run_id); verifyRun(run, c, row);
      let status = row.status, code = row.error_code;
      if (run.status === 'completed') {
        const report = row.report_json && JSON.parse(row.report_json);
        status = run.conclusion === 'success' && report?.status === 'passed' ? 'passed' : 'failed';
        code = status === 'passed' ? null : report?.error_code || (run.conclusion === 'success' ? 'validation_report_missing' : 'validation_workflow_failed');
      } else if (row.lease_until < epoch()) {status = 'expired'; code = 'validation_timed_out';}
      else if (row.status !== 'reported') status = run.status === 'in_progress' ? 'running' : 'queued';
      await env.DB.prepare('UPDATE proposal_validations SET status=?,error_code=?,checked_at=?,updated_at=? WHERE id=? AND status NOT IN (\'passed\',\'failed\',\'expired\')')
        .bind(status, code, epoch(), epoch(), row.id).run();
    } catch (error) {
      if (error instanceof ApiError && error.code === 'validation_run_mismatch') await saveError(env, row, 'failed', error.code);
      // Transient reads cannot turn an unconfirmed result into success or launch
      // another job. Keep the last persisted milestone for refresh recovery.
    }
    return await env.DB.prepare('SELECT * FROM proposal_validations WHERE id=?').bind(row.id).first();
  }

  async function view(env, owner, d, poll = true) {
    const c = validationConfiguration(env); if (!c) return validationDisabled();
    let row = await latest(env, owner, d.proposal.proposal_id, d.proposal.proposal_version, await executorDigest(c));
    if (!row) return {enabled: true, status: 'not_run', checks: null, retryable: !d.stale};
    if (poll) {row = await reconcile(env, c, row); d = await detail(env, owner, d.proposal.proposal_id, d.proposal.proposal_version);}
    const stale = d.stale || row.patch_digest !== d.proposal.patch_digest || row.base_commit !== d.proposal.base_commit || row.contract_digest !== d.proposal.contract_digest;
    const report = row.report_json && JSON.parse(row.report_json);
    return {enabled: true, id: row.id, status: stale ? 'expired' : row.status, error_code: stale ? 'validation_base_changed' : row.error_code,
      checks: report?.checks || null, counts: report?.counts || null, run_id: row.run_id, attempt: row.attempt,
      retryable: !stale && ['failed','expired'].includes(row.status) && row.attempt < 10,
      created_at: row.created_at, updated_at: row.updated_at, ...binding(row)};
  }

  async function start(env, owner, id, version, retryOf = null) {
    const c = validationConfiguration(env); if (!c) return validationDisabled();
    const d = await detail(env, owner, id, version, true); requireValue(!d.stale, 409, 'validation_base_changed');
    const digest = await executorDigest(c), prior = await latest(env, owner, id, version, digest);
    if (prior && !retryOf) return view(env, owner, d);
    if (retryOf) {
      if (prior && prior.id !== retryOf) {
        const previous = await env.DB.prepare('SELECT attempt FROM proposal_validations WHERE id=? AND owner_id=? AND proposal_id=? AND proposal_version=? AND executor_digest=?')
          .bind(retryOf, owner, id, version, digest).first();
        requireValue(previous && previous.attempt < prior.attempt, 409, 'validation_retry_not_allowed');
        return view(env, owner, d);
      }
      requireValue(prior && prior.id === retryOf && terminal.includes(prior.status) && prior.status !== 'passed' && prior.attempt < 10,
        409, 'validation_retry_not_allowed');
    }
    const now = epoch(), jobId = uid(), attempt = (prior?.attempt || 0) + 1, p = d.proposal;
    // A unique immutable version/executor/attempt prevents double dispatch when
    // the Owner loses a response or two tabs ask for the same check.
    const dayStart = now - now % 86400;
    let inserted;
    try {inserted = await env.DB.prepare("INSERT INTO proposal_validations(id,owner_id,proposal_id,proposal_version,patch_digest,base_commit,contract_digest,executor_digest,attempt,status,lease_until,created_at,updated_at) SELECT ?,?,?,?,?,?,?,?,?,'dispatching',?,?,? WHERE (SELECT COUNT(*) FROM proposal_validations WHERE owner_id=? AND created_at>=?)<10 RETURNING id")
      .bind(jobId, owner, id, version, p.patch_digest, p.base_commit, p.contract_digest, digest, attempt, now + 1800, now, now, owner, dayStart).first();}
    catch {return view(env, owner, d);}
    requireValue(inserted, 429, 'daily_validation_budget_exceeded');
    try {
      const runId = await github.dispatch(env, c, jobId);
      await env.DB.prepare("UPDATE proposal_validations SET run_id=?,status='queued',updated_at=? WHERE id=? AND run_id IS NULL")
        .bind(runId, epoch(), jobId).run();
    } catch (error) {
      const unknown = !(error instanceof ApiError) || error.code === 'validation_dispatch_unknown';
      await saveError(env, {id: jobId}, unknown ? 'unknown' : 'failed', unknown ? 'validation_dispatch_unknown' : error.code);
    }
    return view(env, owner, d, false);
  }

  async function authenticateMachine(request, c, jobId) {
    requireValue(new URL(request.url).origin === c.origin, 403, 'validation_wrong_origin');
    const token = request.headers.get('Authorization')?.match(/^Bearer ([A-Za-z0-9._-]{100,16000})$/)?.[1];
    requireValue(token, 401, 'validation_identity_required');
    let p;
    try {({payload: p} = await jwtVerify(token, jwks, {issuer: 'https://token.actions.githubusercontent.com',
      audience: c.origin + '/validation/' + jobId, algorithms: ['RS256'], maxTokenAge: '10m', requiredClaims: [
        'exp','iat','nbf','sub','repository_id','repository_owner_id','repository_visibility','workflow_ref','workflow_sha',
        'run_id','run_attempt','event_name','ref','runner_environment']}));}
    catch {throw new ApiError(401, 'validation_identity_invalid');}
    requireValue(typeof p.sub === 'string' && p.repository === c.repository && p.repository_id === c.repository_id &&
      p.repository_owner_id === c.owner_id && p.repository_visibility === 'private' && p.workflow_sha === c.workflow_sha &&
      p.workflow_ref === c.repository + '/.github/workflows/validate.yml@refs/heads/main' && p.ref === 'refs/heads/main' &&
      p.event_name === 'workflow_dispatch' && p.runner_environment === 'github-hosted' && typeof p.run_id === 'string' && /^[1-9][0-9]{0,15}$/.test(p.run_id) && p.run_attempt === '1' &&
      p.iat <= epoch() + 30 && p.exp - p.iat <= 600, 403, 'validation_identity_mismatch');
    return p;
  }

  // Only a named service-binding entrypoint exposes this handler. The normal
  // workbench/API fetch handler retains its existing Owner Access JWT checks.
  async function machine(request, env) {
    try {
      const match = new URL(request.url).pathname.match(/^\/validation\/([a-f0-9-]{36})\/(claim|report)$/);
      requireValue(match && idPattern.test(match[1]) && request.method === 'POST', 404, 'not_found');
      const c = validationConfiguration(env); requireValue(c, 503, 'validation_not_configured');
      const identity = await authenticateMachine(request, c, match[1]);
      const row = await env.DB.prepare('SELECT * FROM proposal_validations WHERE id=?').bind(match[1]).first();
      requireValue(row && row.run_id, 409, 'validation_job_not_ready');
      requireValue(identity.run_id === row.run_id, 403, 'validation_identity_mismatch');
      requireValue(row.executor_digest === await executorDigest(c), 409, 'validation_executor_changed');
      const body = await readJSONRequest(request, 10000);
      const run = await github.run(env, c, row.run_id); verifyRun(run, c, row);
      const d = await detail(env, row.owner_id, row.proposal_id, row.proposal_version, true);
      requireValue(!d.stale && d.proposal.patch_digest === row.patch_digest, 409, 'validation_base_changed');
      if (match[2] === 'claim') {
        requireValue(exactKeys(body, []) && run.status === 'in_progress' && row.lease_until >= epoch() && ['queued','running'].includes(row.status),
          409, 'validation_job_closed');
        await env.DB.prepare("UPDATE proposal_validations SET status='running',updated_at=? WHERE id=? AND status IN ('queued','running')")
          .bind(epoch(), row.id).run();
        return json({job_id: row.id, binding: binding(row), validator_revision: c.validator_revision, proposal: d.proposal});
      }
      const reportKeys = ['binding','validator_revision','status','checks','counts','error_code'];
      requireValue(exactKeys(body, reportKeys) && Object.keys(body).length === reportKeys.length && canonical(body.binding) === canonical(binding(row)) &&
        body.validator_revision === c.validator_revision && ['passed','failed'].includes(body.status) &&
        exactKeys(body.checks, stages) && Object.keys(body.checks).length === stages.length && Object.values(body.checks).every(x => ['passed','failed','not_run'].includes(x)) &&
        exactKeys(body.counts, ['articles','topics']) && Object.keys(body.counts).length === 2 &&
        Object.values(body.counts).every(x => Number.isSafeInteger(x) && x >= 0 && x <= 100000) &&
        (body.status === 'passed' ? Object.values(body.checks).every(x => x === 'passed') && body.counts.articles > 0 && body.counts.topics > 0 && body.error_code === null :
          ['validation_check_failed','validation_environment_failed'].includes(body.error_code)), 400, 'invalid_validation_report');
      const encoded = canonical(body);
      if (row.report_json) {requireValue(row.report_json === encoded, 409, 'validation_report_conflict'); return json({recorded: true});}
      requireValue(row.status === 'running' && row.lease_until >= epoch() && run.status === 'in_progress', 409, 'validation_job_closed');
      const saved = await env.DB.prepare("UPDATE proposal_validations SET status='reported',report_json=?,updated_at=? WHERE id=? AND status='running' AND report_json IS NULL RETURNING id")
        .bind(encoded, epoch(), row.id).first();
      requireValue(saved, 409, 'validation_report_conflict');
      return json({recorded: true});
    } catch (error) {return json({error: error instanceof ApiError ? error.code : 'validation_unavailable'}, error instanceof ApiError ? error.status : 503);}
  }
  async function safeView(env, owner, d) {
    try {return await view(env, owner, d);}
    catch {return {enabled: false, status: 'unavailable', checks: null, retryable: false};}
  }
  return {start, view, machine, async read(env, owner, id, version) {return safeView(env, owner, await detail(env, owner, id, version));}, async decorate(env, owner, d) {
    const validation = await safeView(env, owner, d);
    return {...d, validation, checks: {...d.checks, ...(validation.status === 'passed' ? {
      repository_build: 'passed', semantic_validation: 'passed'} : {})}};
  }};
}
