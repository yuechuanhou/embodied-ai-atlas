import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validationFixture, config} from './validation-helpers.js';
import {randomUUID} from 'node:crypto';

test('a prepared proposal automatically dispatches once and only an authenticated matching run can return checks', async t => {
  const h = await validationFixture(t), v = h.world.validation;
  assert.equal(h.generated.data.validation.status, 'queued', JSON.stringify({validation: h.generated.data.validation, paths: v.reads.map(x => x.path), dispatches: v.dispatches.length})); assert.equal(v.dispatches.length, 1);
  assert.equal((await h.request(h.path + '/validation', {method: 'POST', body: {version: 1}})).status, 200);
  assert.equal(v.dispatches.length, 1);
  const dispatched = await new Response(v.dispatches[0].body).json();
  assert.deepEqual(dispatched.inputs, {job_id: h.row.id}); assert.equal(dispatched.return_run_details, true);
  const tokenRequest = await new Response(v.reads[0].body).json();
  assert.deepEqual(tokenRequest, {repository_ids: [1001], permissions: {actions: 'write', contents: 'read'}});
  assert.equal((await h.machine('claim')).status, 200);
  assert.equal((await h.machine('report', h.report())).status, 200);
  let result = await h.status(); assert.equal(result.data.status, 'reported');
  assert.equal((await h.request(h.path + '?version=1')).data.checks.repository_build, 'not_run');
  v.status = 'completed'; v.conclusion = 'success';
  await h.db.prepare('UPDATE proposal_validations SET checked_at=0').run();
  result = await h.status(); assert.equal(result.data.status, 'passed');
  const d = (await h.request(h.path + '?version=1')).data;
  assert.equal(d.checks.repository_build, 'passed'); assert.equal(d.checks.technical_review, 'pending'); assert.equal(d.publishable, false);
  assert.equal((await h.db.prepare('SELECT COUNT(*) n FROM approvals').first()).n, 0);
  assert.equal((await h.db.prepare('SELECT COUNT(*) n FROM jobs').first()).n, 0);
  assert.equal(h.world.modelCalls.length, 1);
});

test('machine identity is separate from Owner login and rejects wrong audience, repository, workflow, run and rerun attempts', async t => {
  const h = await validationFixture(t);
  for (const claims of [{aud: 'https://attacker.example'}, {repository_id: '1002'}, {repository_visibility: 'public'},
    {workflow_sha: 'f'.repeat(40)}, {event_name: 'pull_request'}, {run_id: '6002'}, {run_attempt: '2'}, {exp: 1}, {repository_owner_id: '2002'}]) {
    assert([401, 403].includes((await h.machine('claim', {}, claims)).status), JSON.stringify(claims));
  }
  assert.equal((await h.machine('claim', {}, {}, 'invalid')).status, 401);
  const direct = await h.mf.dispatchFetch(config.origin + '/validation/' + h.row.id + '/claim', {method: 'POST'});
  assert.equal(direct.status, 403); // normal fetch still requires the private Owner origin
  assert.equal((await h.request(h.path + '/validation?version=1', {jwtOverride: null})).status, 401);
});

test('reports are immutable, cannot assert extra review/approval checks and never pass on a failed workflow', async t => {
  const h = await validationFixture(t); await h.machine('claim');
  const extra = h.report(); extra.checks.public_scope_review = 'passed'; assert.equal((await h.machine('report', extra)).status, 400);
  const wrong = h.report(); wrong.binding.patch_digest = '0'.repeat(64); assert.equal((await h.machine('report', wrong)).status, 400);
  const partial = h.report(); partial.checks.repository_build = 'not_run'; assert.equal((await h.machine('report', partial)).status, 400);
  assert.equal((await h.machine('report', h.report())).status, 200);
  assert.equal((await h.machine('report', h.report())).status, 200);
  const changed = h.report(); changed.counts.topics++; assert.equal((await h.machine('report', changed)).status, 409);
  h.world.validation.status = 'completed'; h.world.validation.conclusion = 'failure';
  assert.equal((await h.status()).data.status, 'failed');
});

test('baseline, candidate and executor changes invalidate old checks and block late reports', async t => {
  const h = await validationFixture(t); await h.machine('claim');
  await h.db.prepare('UPDATE knowledge_candidates SET version=version+1 WHERE id=?').bind(h.candidate).run();
  assert.equal((await h.machine('report', h.report())).status, 409);
  const s = await h.status(); assert.equal(s.data.status, 'expired'); assert.equal(s.data.retryable, false);
  assert.equal((await h.request(h.path + '/validation', {method: 'POST', body: {version: 1}})).status, 409);
  await assert.rejects(h.db.prepare("UPDATE proposal_validations SET patch_digest=?").bind('0'.repeat(64)).run());
});

test('a lost dispatch response is reconciled to the existing private run without launching another job', async t => {
  const h = await validationFixture(t, {}, {dispatchUnknown: true});
  assert.equal(h.generated.data.validation.status, 'unknown');
  const result = await h.status(); assert.equal(result.data.status, 'running'); assert.equal(result.data.run_id, '6001');
  assert.equal((await h.request(h.path + '/validation', {method: 'POST', body: {version: 1}})).status, 200);
  assert.equal(h.world.validation.dispatches.length, 1); assert.equal(h.world.modelCalls.length, 1);
});

test('unconfigured validation preserves existing private proposals without dispatch or a migration requirement', async t => {
  const h = await validationFixture(t, {VALIDATION_CONFIG: JSON.stringify({...config, enabled: false})});
  assert.equal(h.generated.data.validation.status, 'not_configured');
  assert.equal(h.world.validation.dispatches.length, 0);
  await h.db.prepare('DROP TABLE proposal_validations').run();
  assert.equal((await h.request(h.path + '?version=1')).data.publishable, false);
  const broken = await validationFixture(t, {VALIDATION_CONFIG: '{"enabled":true}'});
  const preview = await broken.request(broken.path + '?version=1');
  assert.equal(preview.status, 200); assert.equal(preview.data.validation.status, 'unavailable');
  assert.equal(preview.data.checks.repository_build, 'not_run');
  assert.equal((await broken.request(broken.path + '/export?version=1')).status, 200);
});

test('expired leases block a runner from claiming private content', async t => {
  const h = await validationFixture(t);
  await h.db.prepare('UPDATE proposal_validations SET lease_until=0').run();
  assert.equal((await h.machine('claim')).status, 409);
  assert.equal((await h.status()).data.status, 'expired');
});

test('only failed or expired checks can be explicitly retried and a lost retry response cannot dispatch twice', async t => {
  const h = await validationFixture(t, {}, {reject: true}), first = h.row.id, v = h.world.validation;
  assert.equal(h.generated.data.validation.status, 'failed');
  v.reject = false;
  const body = {version: 1, retry_of: first};
  const retry = await h.request(h.path + '/validation', {method: 'POST', body});
  assert.equal(retry.data.attempt, 2); assert.equal(retry.data.status, 'queued'); v.jobId = retry.data.id;
  assert.equal((await h.request(h.path + '/validation', {method: 'POST', body})).status, 200);
  assert.equal(v.dispatches.length, 2); assert.equal(h.world.modelCalls.length, 1);
});

test('an unconfirmed dispatch is not retried and a public executor is rejected before it receives a draft', async t => {
  const unknown = await validationFixture(t, {}, {dispatchUnknown: true, noRuns: true});
  const result = await unknown.status(); assert.equal(result.data.status, 'unknown'); assert.equal(result.data.retryable, false);
  assert.equal((await unknown.request(unknown.path + '/validation', {method: 'POST', body: {version: 1, retry_of: unknown.row.id}})).status, 409);
  assert.equal(unknown.world.validation.dispatches.length, 1);
  const publicRepo = await validationFixture(t, {}, {private: false});
  assert.equal(publicRepo.generated.data.validation.error_code, 'validation_repository_mismatch');
  assert.equal(publicRepo.world.validation.dispatches.length, 0);
});

test('a GitHub main update or a different actual workflow commit blocks delivery and invalidates displayed checks', async t => {
  const h = await validationFixture(t);
  h.world.validation.run = {head_sha: 'f'.repeat(40)};
  assert.equal((await h.machine('claim')).status, 403);
  h.world.validation.run = null; h.world.main = 'b'.repeat(40);
  assert.equal((await h.machine('claim')).status, 409);
  assert.equal((await h.status()).data.status, 'expired');
});

test('the daily dispatch ceiling is enforced in the same database statement as task creation', async t => {
  const h = await validationFixture(t, {}, {reject: true});
  for (let i = 0; i < 9; i++) await h.db.prepare("INSERT INTO proposal_validations(id,owner_id,proposal_id,proposal_version,patch_digest,base_commit,contract_digest,executor_digest,attempt,status,lease_until,created_at,updated_at) SELECT ?,owner_id,proposal_id,proposal_version,patch_digest,base_commit,contract_digest,?,1,'failed',lease_until,created_at,updated_at FROM proposal_validations WHERE id=?")
    .bind(randomUUID(), String(i).repeat(64), h.row.id).run();
  const result = await h.request(h.path + '/validation', {method: 'POST', body: {version: 1, retry_of: h.row.id}});
  assert.equal(result.status, 429); assert.equal(result.data.error, 'daily_validation_budget_exceeded');
  assert.equal(h.world.validation.dispatches.length, 1);
});
