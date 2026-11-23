import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {harness} from './helpers.js';

const enabled = {MODEL_PROVIDER: 'anthropic', MODEL_NAME: 'synthetic-test-model', MODEL_API_KEY: 'synthetic-secret', DAILY_CALL_LIMIT: '10', DAILY_TOKEN_LIMIT: '200000'};
async function prepared(t, model = false) {
  const h = await harness(model ? enabled : {}); t.after(h.dispose); await h.sync(); h.sessionId = await h.session();
  h.world.modelResponse = {answer: 'Synthetic explanation', cited_source_ids: [], candidate: {candidate_id: null, title: 'Synthetic candidate', markdown: 'Unverified draft', article_id: null, primary_domain: 'foundations'}};
  await h.request('/api/sessions/' + h.sessionId + '/messages', {method: 'POST', body: {request_id: randomUUID(), message: 'zzzzUniqueUncoveredConcept', reading_context: {}}});
  h.candidate = (await h.request('/api/sessions/' + h.sessionId)).data.candidates[0];
  h.path = '/api/candidates/' + h.candidate.id;
  h.body = {version: 1, snapshot_revision: h.world.snapshot.revision, title: 'Owner draft', draft_markdown: '## Scope\n\nA bounded synthetic observation.',
    primary_domain: 'foundations', article_id: null, status: 'drafting', evidence: null};
  h.save = body => h.request(h.path, {method: 'PATCH', body: {...h.body, ...body}}); return h;
}
const evidence = {kind: 'official', reference: 'https://docs.example.test/observed', supports: 'Supports only the bounded observation under the stated conditions.', owner_confirmed: true};

test('candidate editing and Markdown export preserve original provenance and remain private without model calls', async t => {
  const h = await prepared(t);
  const detail = await h.request(h.path); assert.equal(detail.status, 200); assert.equal(detail.data.domains.length, 9); assert(detail.data.articles.length);
  const result = await h.save({}); assert.equal(result.status, 200); const c = result.data.candidate;
  assert.equal(c.version, 2); assert.equal(c.title, 'Owner draft'); assert.equal(c.placement_view.owner_edited, true); assert.equal(c.source_revision, h.candidate.source_revision);
  const restored = (await h.request('/api/sessions/' + h.sessionId)).data.candidates[0]; assert.equal(restored.draft_markdown, h.body.draft_markdown);
  const exported = await h.request(h.path + '/export?version=2'); assert.equal(exported.status, 200); assert(exported.data.includes(h.body.draft_markdown));
  assert(exported.data.includes('尚未入库或发布')); assert(!exported.data.includes('synthetic-secret'));
  assert.equal(exported.headers.get('cache-control'), 'private, no-store'); assert.match(exported.headers.get('content-type'), /^text\/markdown/);
  assert.equal((await h.request(h.path + '/export?version=1')).status, 409); assert.equal((await h.request(h.path + '/export')).status, 409);
  assert.equal(h.world.modelCalls.length, 0);
});

test('Owner attestation is bound to a draft version and is not represented as Agent web research', async t => {
  const h = await prepared(t);
  const result = await h.save({status: 'ready', evidence}); assert.equal(result.status, 200);
  assert.equal(result.data.candidate.evidence_status, 'checked'); assert.equal(result.data.candidate.placement_view.review_is_current, true);
  assert.equal(result.data.evidence.metadata.verification, 'owner_attested'); assert.equal(result.data.evidence.metadata.fetched_by_agent, false);
  assert.equal(result.data.evidence.visibility, 'private'); assert.equal(result.data.evidence.metadata.candidate_version, 2);
  assert.equal((await h.save({status: 'ready', evidence})).status, 409);
  assert.equal((await h.db.prepare("SELECT COUNT(*) n FROM source_records WHERE kind='official'").first()).n, 1);
  const edited = await h.save({version: 2, draft_markdown: 'Changed after review', evidence: null});
  assert.equal(edited.status, 200); assert.equal(edited.data.candidate.evidence_status, 'insufficient'); assert.equal(edited.data.evidence, null);
  const sources = (await h.request('/api/sessions/' + h.sessionId + '/export')).data.sources;
  assert(sources.some(s => s.kind === 'official')); // Earlier review remains provenance, not current verification.
});

test('ready requires a valid primary domain, bounded evidence, explicit Owner confirmation and current deployment', async t => {
  const h = await prepared(t);
  for (const patch of [{evidence: null}, {evidence: {...evidence, owner_confirmed: false}}, {evidence: {...evidence, kind: 'inference'}},
    {evidence: {...evidence, supports: ''}}, {evidence, primary_domain: null}]) {
    assert.equal((await h.save({status: 'ready', ...patch})).status, 400);
  }
  for (const reference of ['javascript:alert(1)', 'http://example.test/', 'https://user:password@example.test/', 'https://example.test/\nunsafe']) {
    assert.equal((await h.save({status: 'ready', evidence: {...evidence, reference}})).status, 400);
  }
  h.world.failed = true; assert.equal((await h.save({status: 'ready', evidence})).data.error, 'candidate_sync_required');
  assert.equal((await h.save({status: 'drafting'})).status, 200);
});

test('placement and snapshot changes are checked against current taxonomy, never client-supplied authority', async t => {
  const h = await prepared(t), article = h.world.snapshot.articles.find(a => a.primary_domain !== 'foundations');
  for (const patch of [{primary_domain: 'invented'}, {article_id: 'invented'}, {article_id: article.id}, {owner_id: 'pretend-owner'}, {evidence_status: 'checked'}])
    assert.equal((await h.save(patch)).status, 400);
  h.world.snapshot = {...h.world.snapshot, revision: 'b'.repeat(40)}; h.world.main = 'b'.repeat(40); await h.sync();
  assert.equal((await h.save({})).data.error, 'candidate_snapshot_changed');
  const saved = await h.save({snapshot_revision: h.world.snapshot.revision, status: 'ready', evidence}); assert.equal(saved.status, 200);
  assert.equal(saved.data.candidate.source_revision, 'a'.repeat(40)); assert.equal(saved.data.candidate.placement_view.review_is_current, true);
  h.world.snapshot = {...h.world.snapshot, revision: 'c'.repeat(40)}; h.world.main = 'c'.repeat(40); await h.sync();
  assert.equal((await h.request(h.path)).data.candidate.placement_view.review_is_current, false);
});

test('a main revision ahead of public deployment blocks ready but allows private draft organization', async t => {
  const h = await prepared(t); h.world.main = 'b'.repeat(40);
  assert.equal((await h.save({status: 'ready', evidence})).data.error, 'candidate_sync_required');
  assert.equal((await h.save({})).status, 200);
});

test('candidate routes enforce Owner identity, accurate origin and marked writes', async t => {
  const h = await prepared(t);
  for (const path of [h.path, h.path + '/export?version=1']) assert.equal((await h.request(path, {jwtOverride: null})).status, 401);
  assert.equal((await h.request(h.path, {method: 'PATCH', body: h.body, jwtOverride: null})).status, 401);
  for (const headers of [{Origin: 'https://foreign.example'}, {'X-Atlas-Request': ''}, {'Sec-Fetch-Site': 'cross-site'}])
    assert.equal((await h.request(h.path, {method: 'PATCH', body: h.body, headers})).status, 403);
  assert.equal((await h.request('/api/candidates/' + randomUUID())).status, 404);
});

test('optimistic concurrency and an active learning lease prevent lost updates or orphaned review records', async t => {
  const h = await prepared(t);
  const responses = await Promise.all([h.save({status: 'ready', evidence}), h.save({status: 'ready', evidence})]);
  assert.deepEqual(responses.map(r => r.status).sort(), [200, 409]);
  assert.equal((await h.db.prepare("SELECT COUNT(*) n FROM source_records WHERE kind='official'").first()).n, 1);
  await h.db.prepare('UPDATE sessions SET active_request_id=?,lease_until=? WHERE id=?').bind(randomUUID(), Math.floor(Date.now()/1000) + 100, h.sessionId).run();
  const result = await h.save({version: 2, status: 'ready', evidence}); assert.equal(result.status, 409);
  assert.equal((await h.request(h.path)).data.candidate.version, 2);
  assert.equal((await h.db.prepare("SELECT COUNT(*) n FROM source_records WHERE kind='official'").first()).n, 1);
});

test('evidence storage failure rolls back the draft edit and its verification together', async t => {
  const h = await prepared(t);
  await h.db.exec("CREATE TRIGGER reject_review BEFORE INSERT ON source_records WHEN NEW.kind='official' BEGIN SELECT RAISE(ABORT,'synthetic storage failure'); END;");
  assert.equal((await h.save({status: 'ready', evidence})).status, 503);
  const c = (await h.request(h.path)).data.candidate; assert.equal(c.version, 1); assert.equal(c.evidence_status, 'insufficient'); assert.equal(c.title, h.candidate.title);
});

test('later model replies cannot overwrite an Owner-edited or dismissed candidate', async t => {
  const h = await prepared(t, true); assert.equal((await h.save({})).status, 200);
  h.world.modelResponse.candidate = {...h.world.modelResponse.candidate, candidate_id: h.candidate.id, markdown: 'Do not overwrite the Owner draft'};
  const send = () => h.request('/api/sessions/' + h.sessionId + '/messages', {method: 'POST', body: {request_id: randomUUID(), message: 'Continue the concept', reading_context: {}}});
  assert.equal((await send()).status, 200); const saved = (await h.request(h.path)).data.candidate;
  assert.equal(saved.version, 2); assert.equal(saved.draft_markdown, h.body.draft_markdown);
  await h.save({version: 2, status: 'dismissed'}); h.world.modelResponse.candidate.candidate_id = null;
  assert.equal((await send()).status, 200); assert.equal((await h.request(h.path)).data.candidate.status, 'dismissed');
});
