import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {harness, ROOT} from './helpers.js';

const enabled = {MODEL_PROVIDER: 'anthropic', MODEL_NAME: 'synthetic-test-model', MODEL_API_KEY: 'synthetic-secret', DAILY_CALL_LIMIT: '10', DAILY_TOKEN_LIMIT: '1000000'};
const generated = {decision: 'extend', narrative: 'concept', addition_markdown: '## Synthetic recovery-safe addition\n\nA synthetic bounded observation for automated tests only.\n',
  reason: 'The synthetic addition is absent from the target article.', editorial_notes: 'Owner must review the new wording, supporting conditions and public scope.'};
const evidence = {kind: 'experience', reference: 'Synthetic private laboratory record', supports: 'This synthetic observation applies only to the stated fixture.', owner_confirmed: true};
async function prepared(t, bindings = {}) {
  const h = await harness({...enabled, ...bindings}); t.after(h.dispose); await h.sync(); h.sessionId = await h.session();
  const session = await h.db.prepare('SELECT * FROM sessions WHERE id=?').bind(h.sessionId).first();
  h.candidateId = randomUUID(); h.article = h.world.snapshot.articles.find(a => a.id === 'sensors-and-estimation');
  await h.db.prepare("INSERT INTO knowledge_candidates(id,owner_id,session_id,title,dedup_key,status,evidence_status,draft_markdown,placement_json,source_revision,created_at,updated_at) VALUES(?,?,?,?,?,'researching','insufficient',?,'{}',?,1,1)")
    .bind(h.candidateId, session.owner_id, h.sessionId, 'Synthetic article addition', randomUUID(), 'A synthetic bounded observation.', h.world.snapshot.revision).run();
  const saved = await h.request('/api/candidates/' + h.candidateId, {method: 'PATCH', body: {version: 1, snapshot_revision: h.world.snapshot.revision,
    title: 'Synthetic article addition', draft_markdown: 'A synthetic bounded observation.', primary_domain: h.article.primary_domain, article_id: h.article.id, status: 'ready', evidence}});
  assert.equal(saved.status, 200);
  h.body = {request_id: randomUUID(), candidate_version: 2, snapshot_revision: h.world.snapshot.revision};
  h.path = '/api/candidates/' + h.candidateId + '/proposals';
  h.generate = (body = h.body, options = {}) => h.request(h.path, {method: 'POST', body, ...options});
  h.world.modelResponse = structuredClone(generated);
  return h;
}

test('a real Worker prepares private exact append-only v1 envelopes compatible with the Python semantic gate', async t => {
  const h = await prepared(t);
  const result = await h.generate(); assert.equal(result.status, 200); assert.equal(result.data.proposal_version, 1);
  const detail = await h.request('/api/proposals/' + h.candidateId + '?version=1'); assert.equal(detail.status, 200);
  assert.equal(detail.headers.get('cache-control'), 'private, no-store');
  const {proposal, files, review, checks} = detail.data;
  assert.equal(files[0].before_utf8, h.article.markdown); assert(files[0].after_utf8.startsWith(h.article.markdown));
  assert.equal(review.narrative, 'concept'); assert.equal(review.source_verification, 'owner_attested');
  assert.equal(detail.data.publishable, false); assert.equal(detail.data.stale, false); assert.equal(checks.repository_build, 'not_run');
  assert.equal(proposal.publication.release_scope, 'open_pr');
  const exported = await h.request('/api/proposals/' + h.candidateId + '/export?version=1');
  assert.equal(exported.status, 200); assert.deepEqual(exported.data, proposal); assert.match(exported.headers.get('content-disposition'), /attachment/);
  assert(!JSON.stringify(exported.data).includes('synthetic-secret'));
  const gate = spawnSync('python', ['-c', 'import json,sys; from agent.change_validation import validate_change_set; p=json.load(sys.stdin); print(validate_change_set(p,root=".",current_head=p["base_commit"]))'],
    {cwd: ROOT, input: JSON.stringify(proposal), encoding: 'utf8'});
  assert.equal(gate.status, 0, gate.stdout + gate.stderr);
  assert.equal((await h.db.prepare('SELECT COUNT(*) n FROM approvals').first()).n, 0);
  assert.equal((await h.db.prepare('SELECT COUNT(*) n FROM jobs').first()).n, 0);
  const request = h.world.modelCalls[0].request;
  assert(request.system.includes('CONTENT_STYLE_GUIDE.md')); assert(request.system.includes('八类叙事'));
  const input = JSON.parse(request.messages[0].content); assert.equal(input.target_article.markdown, h.article.markdown);
  assert.equal(input.evidence.fetched_by_agent, false); assert.equal(input.evidence.verification, 'owner_attested');
  assert.equal((await h.db.prepare('SELECT draft_markdown FROM knowledge_candidates WHERE id=?').bind(h.candidateId).first()).draft_markdown, 'A synthetic bounded observation.');
});

test('idempotency survives lost responses and immutable historical proposal versions remain readable', async t => {
  const h = await prepared(t);
  const first = await h.generate(); assert.equal(first.status, 200);
  assert.deepEqual((await h.generate()).data, first.data); assert.equal(h.world.modelCalls.length, 1);
  const checked = await h.request(h.path + '?request_id=' + h.body.request_id); assert.equal(checked.data.request.status, 'completed');
  assert.equal(checked.data.request.result.proposal_version, 1);
  h.world.modelResponse.addition_markdown += '\nAnother synthetic condition.\n';
  const second = await h.generate({...h.body, request_id: randomUUID()}); assert.equal(second.data.proposal_version, 2);
  const v1 = (await h.request('/api/proposals/' + h.candidateId + '?version=1')).data;
  const v2 = (await h.request('/api/proposals/' + h.candidateId + '?version=2')).data;
  assert.notEqual(v1.proposal.patch_digest, v2.proposal.patch_digest); assert(!v1.files[0].after_utf8.includes('Another synthetic condition.'));
  await assert.rejects(h.db.prepare("UPDATE proposal_versions SET envelope_json='{}' WHERE proposal_id=?").bind(h.candidateId).run());
  assert.equal((await h.request(h.path)).data.latest, 2);
});

test('unreviewed evidence, changed candidate, stale main and altered rules fail before model calls', async t => {
  const h = await prepared(t);
  assert.equal((await h.generate({...h.body, candidate_version: 1})).status, 409);
  await h.db.prepare("UPDATE knowledge_candidates SET status='researching' WHERE id=?").bind(h.candidateId).run();
  assert.equal((await h.generate()).data.error, 'proposal_evidence_required');
  await h.db.prepare("UPDATE knowledge_candidates SET status='ready' WHERE id=?").bind(h.candidateId).run();
  h.world.main = 'b'.repeat(40); assert.equal((await h.generate()).data.error, 'proposal_sync_required'); h.world.main = 'a'.repeat(40);
  h.world.snapshot.proposal_context['CONTENT_STYLE_GUIDE.md'] += '\nChanged rule';
  // Activate the changed synthetic artifact under another revision before testing it.
  h.world.snapshot.revision = 'c'.repeat(40); h.world.main = 'c'.repeat(40);
  const response = await h.generate({...h.body, snapshot_revision: 'c'.repeat(40)});
  assert([409, 503].includes(response.status)); assert.equal(h.world.modelCalls.length, 0);
});

test('Owner authentication and same-origin marked writes also protect proposal reads and exports', async t => {
  const h = await prepared(t); await h.generate();
  for (const route of [h.path, '/api/proposals/' + h.candidateId, '/api/proposals/' + h.candidateId + '/export?version=1']) {
    assert.equal((await h.request(route, {jwtOverride: null})).status, 401);
    assert.equal((await h.request(route, {headers: {'Sec-Fetch-Site': 'cross-site'}})).status, 403);
  }
  assert.equal((await h.generate({...h.body, request_id: randomUUID()}, {headers: {'Origin': 'https://evil.example.test'}})).status, 403);
  assert.equal((await h.generate({...h.body, request_id: randomUUID()}, {headers: {'X-Atlas-Request': ''}})).status, 403);
  assert.equal((await h.request('/api/proposals/' + randomUUID())).status, 404);
  assert.equal((await h.generate({...h.body, owner_id: 'forged'})).status, 400);
  assert.equal(h.world.modelCalls.length, 1);
});

test('duplication and insufficient evidence decisions preserve the candidate without creating pretend proposals', async t => {
  const h = await prepared(t);
  for (const decision of ['duplicate', 'needs_review']) {
    h.world.modelResponse = {...generated, decision, addition_markdown: ''};
    assert.equal((await h.generate({...h.body, request_id: randomUUID()})).data.decision, decision);
  }
  assert.equal((await h.db.prepare('SELECT COUNT(*) n FROM proposal_versions').first()).n, 0);
  assert.equal((await h.request(h.path)).data.latest, null);
});

test('unsafe model additions, truncation and failed attempts never create a proposal or replay billing automatically', async t => {
  const h = await prepared(t);
  for (const addition_markdown of ['<script>bad()</script>', '[bad](javascript:alert(1))', '# Replaced article identity', 'Leaked ' + h.sessionId]) {
    h.world.modelResponse = {...generated, addition_markdown};
    const body = {...h.body, request_id: randomUUID()};
    assert.equal((await h.generate(body)).status, 502);
    const calls = h.world.modelCalls.length;
    assert.equal((await h.generate(body)).status, 409); assert.equal(h.world.modelCalls.length, calls);
  }
  h.world.modelStop = 'max_tokens'; h.world.modelResponse = generated;
  assert.equal((await h.generate({...h.body, request_id: randomUUID()})).data.error, 'model_output_truncated');
  assert.equal((await h.db.prepare('SELECT COUNT(*) n FROM proposal_versions').first()).n, 0);
});

test('model budget and unavailable models stop preparation without a model call', async t => {
  const h = await prepared(t, {DAILY_CALL_LIMIT: '1'});
  await h.generate();
  assert.equal((await h.generate({...h.body, request_id: randomUUID()})).status, 429);
  assert.equal(h.world.modelCalls.length, 1);
  const disabled = await prepared(t, {MODEL_PROVIDER: 'disabled'});
  assert.equal((await disabled.generate()).data.error, 'proposal_model_required'); assert.equal(disabled.world.modelCalls.length, 0);
});

test('a main change while the model is working prevents storing a proposal on the obsolete base', async t => {
  const h = await prepared(t), pending = h.generate();
  for (let i = 0; i < 200 && h.world.modelCalls.length === 0; i++) await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal(h.world.modelCalls.length, 1); h.world.main = 'b'.repeat(40);
  assert.equal((await pending).data.error, 'proposal_base_changed');
  assert.equal((await h.db.prepare('SELECT COUNT(*) n FROM proposal_versions').first()).n, 0);
});

test('candidate edits make a saved version stale while its exact historical contents stay exportable', async t => {
  const h = await prepared(t); await h.generate();
  await h.db.prepare('UPDATE knowledge_candidates SET version=version+1 WHERE id=?').bind(h.candidateId).run();
  const detail = await h.request('/api/proposals/' + h.candidateId + '?version=1'); assert.equal(detail.data.stale, true);
  assert.equal((await h.request('/api/proposals/' + h.candidateId + '/export?version=1')).status, 200);
  assert.equal(detail.data.publishable, false);
});

test('ready candidates without existing articles stop before billing, while the current 100000-token budget and OpenAI adapter can prepare drafts', async t => {
  const h = await prepared(t);
  assert.equal((await h.request('/api/candidates/' + h.candidateId, {method: 'PATCH', body: {version: 2,
    snapshot_revision: h.world.snapshot.revision, title: 'Synthetic article addition', draft_markdown: 'A synthetic bounded observation.',
    primary_domain: h.article.primary_domain, article_id: null, status: 'ready', evidence}})).status, 200);
  assert.equal((await h.generate({...h.body, candidate_version: 3})).data.error, 'proposal_existing_article_required');
  assert.equal(h.world.modelCalls.length, 0);
  const bounded = await prepared(t, {MODEL_PROVIDER: 'openai', DAILY_TOKEN_LIMIT: '100000'});
  assert.equal((await bounded.generate()).status, 200);
  const request = bounded.world.modelCalls[0].request;
  assert.equal(request.store, false); assert.equal(request.text.format.name, 'atlas_private_proposal');
  assert.deepEqual(request.text.format.schema.properties.decision.enum, ['extend', 'duplicate', 'needs_review']);
});

test('a learning lease prevents concurrent review or deletion and an expired lease cannot commit an obsolete proposal', async t => {
  const h = await prepared(t);
  await h.db.prepare('UPDATE sessions SET active_request_id=?,lease_until=? WHERE id=?').bind(randomUUID(), Math.floor(Date.now() / 1000) + 120, h.sessionId).run();
  assert.equal((await h.generate()).data.error, 'session_busy'); assert.equal(h.world.modelCalls.length, 0);
  await h.db.prepare('UPDATE sessions SET active_request_id=NULL,lease_until=NULL WHERE id=?').bind(h.sessionId).run();
  const pending = h.generate({...h.body, request_id: randomUUID()});
  for (let i = 0; i < 200 && !h.world.modelCalls.length; i++) await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal(h.world.modelCalls.length, 1);
  assert.equal((await h.request('/api/sessions/' + h.sessionId, {method: 'DELETE'})).data.error, 'session_busy');
  await h.db.prepare('UPDATE sessions SET lease_until=0 WHERE id=?').bind(h.sessionId).run();
  assert.equal((await pending).status, 502);
  assert.equal((await h.db.prepare('SELECT COUNT(*) n FROM proposal_versions').first()).n, 0);
  assert.equal((await h.db.prepare('SELECT COUNT(*) n FROM runtime_commit_guards').first()).n, 0);
});

test('conversation deletion retains independent proposal audit versions but marks their missing candidate basis stale', async t => {
  const h = await prepared(t); await h.generate();
  assert.equal((await h.request('/api/sessions/' + h.sessionId, {method: 'DELETE'})).status, 200);
  assert.equal((await h.request(h.path)).status, 404);
  const detail = await h.request('/api/proposals/' + h.candidateId + '?version=1');
  assert.equal(detail.status, 200); assert.equal(detail.data.stale, true); assert.equal(detail.data.publishable, false);
  assert.equal(detail.data.files[0].before_utf8, h.article.markdown);
  assert.equal((await h.request('/api/proposals/' + h.candidateId + '/export?version=1')).status, 200);
});
