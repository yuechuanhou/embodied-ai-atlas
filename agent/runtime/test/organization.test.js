import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {harness} from './helpers.js';
import {validateModelResult, modelInput} from '../src/model.js';

const enabled = {MODEL_PROVIDER: 'anthropic', MODEL_NAME: 'synthetic-test-model', MODEL_API_KEY: 'synthetic-secret', DAILY_CALL_LIMIT: '10', DAILY_TOKEN_LIMIT: '200000'};
const advice = {problem: 'Synthetic knowledge has no reliable current placement.', suggestion: 'Discuss whether an existing view can express it.', impact: 'Review existing IDs and links before any independent architecture change.'};
const candidate = {candidate_id: null, title: 'Synthetic unknown concept', markdown: 'A private unverified observation.', article_id: null, primary_domain: null,
  organization: {status: 'unclassified', reason: 'No reliable current Domain is established.', advice: null}};
const evidence = {kind: 'experience', reference: 'Synthetic limited laboratory observation', supports: 'Supports this synthetic observation only.', owner_confirmed: true};
async function learning(t, value = candidate) {
  const h = await harness(enabled); t.after(h.dispose); await h.sync(); h.sessionId = await h.session();
  h.world.modelResponse = {answer: 'Learning continues with a private explanation.', cited_source_ids: [], candidate: structuredClone(value)};
  h.send = () => h.request('/api/sessions/' + h.sessionId + '/messages', {method: 'POST', body: {request_id: randomUUID(), message: 'Explain this synthetic concept', reading_context: {}}});
  assert.equal((await h.send()).status, 200);
  h.read = async () => (await h.request('/api/sessions/' + h.sessionId)).data.candidates[0];
  h.candidate = await h.read(); h.path = '/api/candidates/' + h.candidate.id;
  h.review = overrides => h.request(h.path, {method: 'PATCH', body: {version: 1, snapshot_revision: h.world.snapshot.revision,
    title: h.candidate.title, draft_markdown: h.candidate.draft_markdown, primary_domain: 'foundations', article_id: null, status: 'ready', evidence, ...overrides}});
  return h;
}

test('one learning call preserves an unclassified candidate and later turns can find an existing placement without an architecture write', async t => {
  const h = await learning(t);
  assert.equal(h.candidate.placement_view.organization.status, 'unclassified'); assert.equal(h.candidate.placement_view.domain, null);
  assert.equal(h.world.modelCalls.length, 1);
  const session = (await h.request('/api/sessions/' + h.sessionId)).data; assert.equal(session.messages.length, 2);
  assert.equal((await h.request(h.path + '/proposals', {method: 'POST', body: {request_id: randomUUID(), candidate_version: 1, snapshot_revision: h.world.snapshot.revision}})).data.error, 'proposal_placement_review_required');
  assert.equal(h.world.modelCalls.length, 1);
  h.world.modelResponse.candidate = {...candidate, candidate_id: h.candidate.id, primary_domain: 'foundations',
    organization: {status: 'fits', reason: 'An existing Domain now appears suitable; no architecture change.', advice: null}};
  assert.equal((await h.send()).status, 200); const updated = await h.read();
  assert.equal(updated.id, h.candidate.id); assert.equal(updated.version, 2); assert.equal(updated.placement_view.organization.status, 'fits');
  assert.equal((await h.db.prepare('SELECT COUNT(*) n FROM change_proposals').first()).n, 0);
  assert.equal((await h.db.prepare('SELECT COUNT(*) n FROM approvals').first()).n, 0);
  assert.equal((await h.db.prepare('SELECT COUNT(*) n FROM jobs').first()).n, 0);
  const input = JSON.parse(h.world.modelCalls[0].request.messages[0].content);
  assert.equal(input.article_catalog.length, h.world.snapshot.articles.length); assert.equal(input.article_catalog_complete, true);
  assert.equal(h.world.modelCalls[0].request.tools, undefined);
});

test('architecture-dependent candidates require explicit existing-architecture resolution and do not authorize architecture changes', async t => {
  const h = await learning(t, {...candidate, organization: {status: 'architecture_review', reason: 'The proposed placement needs architecture discussion.', advice}});
  assert.equal((await h.review({})).data.error, 'candidate_architecture_review_required');
  const draft = await h.review({status: 'drafting', primary_domain: null, evidence: null}); assert.equal(draft.status, 200);
  assert.equal(draft.data.candidate.placement_view.organization.status, 'architecture_review');
  const resolved = await h.review({version: 2, architecture_reviewed: true}); assert.equal(resolved.status, 200);
  assert.equal(resolved.data.candidate.placement_view.organization.status, 'fits');
  assert.equal(resolved.data.candidate.placement_view.organization.architecture_resolved, true);
  assert.deepEqual(resolved.data.candidate.placement_view.organization.advice, advice);
  const changed = await h.review({version: 3, status: 'drafting', draft_markdown: 'A changed synthetic observation.', evidence: null}); assert.equal(changed.status, 200);
  assert.equal(changed.data.candidate.placement_view.organization.status, 'architecture_review');
  assert.equal(h.world.modelCalls.length, 1);
});

test('a refreshed knowledge snapshot invalidates an earlier architecture resolution while retaining its advice and private export', async t => {
  const h = await learning(t, {...candidate, organization: {status: 'architecture_review', reason: 'Discuss the synthetic classification.', advice}});
  assert.equal((await h.review({architecture_reviewed: true})).status, 200);
  h.world.main = 'b'.repeat(40); h.world.snapshot.revision = h.world.main; await h.sync();
  const restored = await h.read(); assert.equal(restored.placement_view.organization.status, 'architecture_review');
  const exported = await h.request(h.path + '/export?version=2'); assert.equal(exported.status, 200);
  assert(exported.data.includes('# Atlas 架构讨论建议')); assert(exported.data.includes(advice.problem));
  assert.equal(exported.headers.get('cache-control'), 'private, no-store'); assert(!exported.data.includes('synthetic-secret'));
  assert.equal((await h.request(h.path + '/export?version=2', {jwtOverride: null})).status, 401);
});

test('an optional architecture suggestion does not block a valid content placement or become publication authority', async t => {
  const h = await learning(t, {...candidate, primary_domain: 'foundations', organization: {status: 'fits', reason: 'Existing classification is sufficient.', advice}});
  assert.equal(h.candidate.placement_view.organization.blocks_proposal, false);
  assert.equal((await h.review({})).status, 200);
  assert.equal((await h.db.prepare('SELECT COUNT(*) n FROM approvals').first()).n, 0);
  assert.equal((await h.db.prepare('SELECT COUNT(*) n FROM proposal_versions').first()).n, 0);
});

test('model classification cannot invent domains, smuggle actions or contradict null placement, and legacy responses remain readable', () => {
  const snapshot = {domains: [{id: 'foundations'}], articles: []};
  const result = c => validateModelResult({answer: 'A synthetic explanation.', cited_source_ids: [], candidate: c}, snapshot, [], []);
  assert.doesNotThrow(() => result(candidate));
  const legacy = {...candidate}; delete legacy.organization; assert.doesNotThrow(() => result(legacy));
  for (const invalid of [{...candidate, primary_domain: 'new-domain'},
    {...candidate, organization: {status: 'fits', reason: 'Forced classification', advice: null}},
    {...candidate, organization: {status: 'architecture_review', reason: 'No concrete advice', advice: null}},
    {...candidate, organization: {...candidate.organization, execute: true}},
    {...candidate, organization: {...candidate.organization, advice: {...advice, file_changes: []}}},
    {...candidate, organization: {...candidate.organization, reason: 'x'.repeat(801)}}]) assert.throws(() => result(invalid));
  const input = modelInput({question: 'Keep learning', selectedText: '', context: {}, history: [], sources: [], candidates: [], snapshot});
  assert(input.instructions.includes('separate Owner architecture-design conversation')); assert(input.instructions.includes('do not infer learning is finished'));
});
