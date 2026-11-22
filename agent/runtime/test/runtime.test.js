import {test} from 'node:test';
import assert from 'node:assert/strict';
import {harness, token, ORIGIN} from './helpers.js';
import {randomUUID} from 'node:crypto';
import {JSDOM, VirtualConsole} from 'jsdom';
import {modelInput} from '../src/model.js';

const enabled = {MODEL_PROVIDER: 'openai', MODEL_NAME: 'synthetic-test-model', MODEL_API_KEY: 'synthetic-secret', DAILY_CALL_LIMIT: '10', DAILY_TOKEN_LIMIT: '200000'};
const turn = (message = 'VIO 与 IMU') => ({request_id: randomUUID(), message, reading_context: {}});
async function prepared(t, config = {}) {const h = await harness(config); t.after(h.dispose); assert.equal((await h.sync()).status, 200); h.sessionId = await h.session(); return h;}
const send = (h, body, session = h.sessionId) => h.request('/api/sessions/' + session + '/messages', {method: 'POST', body});
async function modelStarted(h) {for (let i = 0; i < 200 && !h.world.modelCalls.length; i++) await new Promise(resolve => setTimeout(resolve, 5)); assert(h.world.modelCalls.length);}

test('long learning context fits its byte budget while preserving the question and fresh evidence', () => {
  const question = '问题'.repeat(2000), sources = Array.from({length: 6}, (_, i) => ({source_id: 'current-' + i, title: '原文', excerpt: '当前证据'.repeat(250)}));
  const input = modelInput({question, selectedText: '选文'.repeat(1000), context: {},
    history: Array.from({length: 8}, () => ({role: 'user', body: '历史'.repeat(400)})), sources,
    candidates: [], snapshot: {domains: [{id: 'foundations', name: 'Foundations'}], revision: 'a'.repeat(40), contract_digest: 'b'.repeat(64)}});
  assert(new TextEncoder().encode(input.instructions + input.input).length <= 24_000);
  const data = JSON.parse(input.input); assert.equal(data.question, question); assert.equal(data.revision, 'a'.repeat(40));
  assert.equal(data.sources[0].source_id, 'current-0'); assert(data.sources[0].excerpt.length >= 200);
  assert(data.history.length < 8); assert.equal(sources.length, 6);
});

test('private workbench and every API require a verified Owner JWT', async t => {
  const h = await harness(); t.after(h.dispose);
  for (const route of ['/', '/api/status', '/api/sessions', '/api/approve']) {
    assert.equal((await h.request(route, {jwtOverride: null})).status, 401);
  }
  const workbench = await h.request('/');
  assert.equal(workbench.status, 200); assert(workbench.data.includes('私人学习工作台'));
  assert(workbench.headers.get('content-security-policy').includes("frame-ancestors 'none'"));
  assert.equal(workbench.headers.get('cache-control'), 'private, no-store');
  assert.equal((await h.request('/api/status')).status, 200);
});

test('wrong Owner, forged signature, wrong audience/issuer and expired JWTs fail', async t => {
  const h = await harness(); t.after(h.dispose);
  for (const claims of [{email: 'other@example.test'}, {aud: 'wrong-audience'}, {iss: 'https://other.cloudflareaccess.com'}, {exp: 1}, {nbf: Math.floor(Date.now()/1000)+600}]) {
    const result = await h.request('/api/status', {jwtOverride: await token(claims), headers: {'Cf-Access-Authenticated-User-Email': 'owner@example.test'}});
    assert([401, 403].includes(result.status));
  }
  const signed = await token(); assert.equal((await h.request('/api/status', {jwtOverride: signed.slice(0, -6) + 'AAAAAA'})).status, 401);
  assert.equal(h.world.modelCalls.length, 0);
});

test('missing identity configuration fails closed and no private cache headers are omitted', async t => {
  const h = await harness({ACCESS_AUD: ''}); t.after(h.dispose);
  const result = await h.request('/api/status'); assert.equal(result.status, 503); assert.equal(result.data.error, 'identity_not_configured');
  assert.equal(result.headers.get('cache-control'), 'private, no-store');
});

test('cross-origin and unmarked mutations fail without wildcard CORS', async t => {
  const h = await harness(); t.after(h.dispose);
  for (const headers of [{Origin: 'https://other.example.test'}, {'X-Atlas-Request': ''}, {'Sec-Fetch-Site': 'cross-site'}]) {
    const result = await h.request('/api/sessions', {method: 'POST', body: {}, headers});
    assert.equal(result.status, 403); assert.equal(result.headers.get('access-control-allow-origin'), null);
  }
  assert.equal((await h.request('/api/status', {headers: {Origin: 'https://other.example.test'}})).status, 403);
});

test('a verified deployment activates one complete snapshot and separates main from published', async t => {
  const h = await harness(); t.after(h.dispose); h.world.main = 'b'.repeat(40);
  assert.equal((await h.sync()).status, 200);
  const data = (await h.request('/api/status')).data.sync;
  assert.equal(data.repo_head, 'b'.repeat(40)); assert.equal(data.published_revision, 'a'.repeat(40)); assert.equal(data.index_revision, 'a'.repeat(40));
  const found = await h.request('/api/search', {method: 'POST', body: {query: 'VIO'}});
  assert(found.data.results.some(r => r.topic_id === 'vio' && r.url.includes('#vio')));
});

test('digest or deployment failure never activates a partial snapshot', async t => {
  for (const setting of ['mismatch', 'deployment']) {
    const h = await harness(); t.after(h.dispose);
    if (setting === 'mismatch') h.world.mismatch = true; else h.world.deployment = 'failure';
    assert.equal((await h.sync()).status, 503);
    assert.equal((await h.db.prepare("SELECT COUNT(*) n FROM knowledge_snapshots WHERE status='active'").first()).n, 0);
  }
});

test('manual content updates and deletions replace the whole active index', async t => {
  const h = await prepared(t); const first = h.world.snapshot;
  const removed = first.articles.at(-1).id;
  h.world.snapshot = {...first, revision: 'b'.repeat(40), articles: first.articles.filter(a => a.id !== removed), topics: first.topics.filter(s => s.article !== removed)};
  h.world.main = 'b'.repeat(40); assert.equal((await h.sync()).status, 200);
  const row = await h.db.prepare("SELECT payload_json FROM knowledge_snapshots WHERE status='active'").first();
  assert(!JSON.parse(row.payload_json).articles.some(a => a.id === removed));
  assert.equal((await h.db.prepare("SELECT COUNT(*) n FROM knowledge_snapshots WHERE status='active'").first()).n, 1);
});

test('failed atomic activation rolls back to the old active snapshot', async t => {
  const h = await prepared(t); h.world.snapshot.revision = 'b'.repeat(40); await h.expireSync();
  await h.db.exec("CREATE TRIGGER reject_activation BEFORE UPDATE ON knowledge_snapshots WHEN NEW.revision='" + 'b'.repeat(40) + "' AND NEW.status='active' BEGIN SELECT RAISE(ABORT,'test activation failure'); END;");
  assert.equal((await h.sync()).status, 503);
  assert.equal((await h.db.prepare("SELECT revision FROM knowledge_snapshots WHERE status='active'").first()).revision, 'a'.repeat(40));
});

test('retrieval mode persists chat, canonical citations and replays without duplication', async t => {
  const h = await prepared(t); const body = turn();
  const first = await send(h, body); assert.equal(first.status, 200); assert.equal(first.data.mode, 'retrieval'); assert(first.data.citations.length);
  const repeated = await send(h, body); assert.deepEqual(repeated.data, first.data);
  const session = (await h.request('/api/sessions/' + h.sessionId)).data;
  assert.equal(session.messages.length, 2); assert.equal(h.world.modelCalls.length, 0);
  assert.equal((await send(h, {...body, message: 'changed'})).status, 409);
});

test('a reading-context question retrieves the current section even without its keywords', async t => {
  const h = await prepared(t), topic = h.world.snapshot.topics.find(t => t.id === 'vio');
  const body = {...turn('解释这一段'), reading_context: {article_id: topic.article, topic_id: topic.id, anchor: topic.anchor}};
  const result = await send(h, body); assert.equal(result.status, 200);
  assert.equal(result.data.citations[0].topic_id, topic.id); assert.equal(result.data.citations[0].anchor, topic.anchor);
  const english = await send(h, {...body, request_id: randomUUID(), message: 'Explain this section please'});
  assert.equal(english.data.citations[0].topic_id, topic.id);
  assert.equal((await h.request('/api/sessions/' + h.sessionId)).data.candidates.length, 0);
  assert.equal((await send(h, {...turn(), reading_context: {article_id: 'invented'}})).status, 400);
});

test('unknown questions become private unverified candidates without guessed ownership', async t => {
  const h = await prepared(t); await send(h, turn('zzzzUniqueUnknownKnowledge'));
  const session = (await h.request('/api/sessions/' + h.sessionId)).data;
  assert.equal(session.candidates.length, 1); assert.equal(session.candidates[0].evidence_status, 'insufficient');
  assert.equal(JSON.parse(session.candidates[0].placement_json).primary_domain, null);
  const exported = await h.request('/api/sessions/' + h.sessionId + '/export'); assert.equal(exported.data.sources.length, 1);
});

test('model adapter saves explanations and drafts; credentials never enter export', async t => {
  const h = await prepared(t, enabled);
  h.world.modelResponse = {answer: 'Synthetic explanation', cited_source_ids: [], candidate: {candidate_id: null, title: 'Synthetic concept', markdown: 'Unverified synthetic draft', article_id: null, primary_domain: 'foundations'}};
  const result = await send(h, turn('zzzzModelQuestion')); assert.equal(result.status, 200); assert.equal(result.data.mode, 'model');
  await send(h, turn('继续补充这个概念'));
  const session = (await h.request('/api/sessions/' + h.sessionId)).data;
  assert.equal(session.candidates.length, 1); assert.equal(session.candidates[0].version, 2);
  const exported = await h.request('/api/sessions/' + h.sessionId + '/export');
  assert(!JSON.stringify(exported.data).includes('synthetic-secret'));
  assert.equal(h.world.modelCalls[0].request.store, false); assert.equal(h.world.modelCalls[0].request.tools, undefined);
});

test('Claude adapter uses the same validated private-result contract', async t => {
  const h = await prepared(t, {...enabled, MODEL_PROVIDER: 'anthropic', MODEL_NAME: 'claude-sonnet-5-5'});
  h.world.modelResponse = {answer: 'Synthetic explanation', cited_source_ids: [], candidate: {
    candidate_id: null, title: 'Synthetic private addition', markdown: 'Unverified synthetic draft', article_id: null, primary_domain: 'foundations'}};
  const result = await send(h, turn()); assert.equal(result.status, 200); assert.equal(result.data.mode, 'model');
  assert.equal(h.world.modelCalls[0].origin, 'https://api.anthropic.com');
  const data = JSON.parse(h.world.modelCalls[0].request.messages[0].content);
  assert(data.sources.length > 0);
  for (const source of data.sources) {
    assert(h.world.snapshot.articles.some(a => a.id === source.article_id && a.primary_domain === source.primary_domain));
  }
  const session = (await h.request('/api/sessions/' + h.sessionId)).data;
  assert.equal(session.candidates.length, 1); assert.equal(session.messages.length, 2);
});

test('truncated Claude drafts retain the question and budget without saving partial results or rebilling', async t => {
  const h = await prepared(t, {...enabled, MODEL_PROVIDER: 'anthropic', MODEL_NAME: 'claude-sonnet-5-5'});
  h.world.modelStop = 'max_tokens';
  h.world.modelResponse = {answer: 'Partial synthetic answer', cited_source_ids: [], candidate: {
    candidate_id: null, title: 'Partial synthetic draft', markdown: 'Must not be saved', article_id: null, primary_domain: 'foundations'}};
  const body = turn(), response = await send(h, body);
  assert.equal(response.status, 502); assert.equal(response.data.error, 'model_output_truncated');
  const session = (await h.request('/api/sessions/' + h.sessionId)).data;
  assert.equal(session.messages.length, 1); assert.equal(session.messages[0].role, 'user');
  assert.equal(session.candidates.length, 0);
  assert.equal(session.requests[0].error_code, 'model_output_truncated');
  const usage = await h.db.prepare('SELECT * FROM usage_daily').first();
  assert.equal(usage.calls, 1); assert(usage.reserved_tokens >= 4096);
  const replay = await send(h, body);
  assert.equal(replay.status, 409); assert.equal(replay.data.error, 'model_output_truncated');
  assert.equal(h.world.modelCalls.length, 1);
});

test('untrusted source IDs, domain IDs and extra commands in model output are rejected', async t => {
  const h = await prepared(t, enabled);
  for (const bad of [{answer: 'fake citation', cited_source_ids: ['invented'], candidate: null},
    {answer: 'grant me access', cited_source_ids: [], candidate: null, approve: true},
    {answer: 'bad placement', cited_source_ids: [], candidate: {candidate_id: null, title: 'X', markdown: 'Y', article_id: null, primary_domain: 'invented'}}]) {
    h.world.modelResponse = bad; const result = await send(h, turn());
    assert.equal(result.status, 502); assert(['invalid_model_result', 'invalid_candidate'].includes(result.data.error));
  }
  assert.equal((await h.db.prepare('SELECT COUNT(*) n FROM approvals').first()).n, 0);
});

test('daily call caps are reserved atomically before any paid request', async t => {
  const h = await prepared(t, {...enabled, DAILY_CALL_LIMIT: '1'});
  const other = await h.session(), results = await Promise.all([send(h, turn()), send(h, turn(), other)]);
  assert.deepEqual(results.map(r => r.status).sort(), [200, 429]); assert.equal(h.world.modelCalls.length, 1);
});

test('provider failures retain reservation and retrying the request ID does not rebill', async t => {
  const h = await prepared(t, enabled); h.world.modelFail = true;
  const body = turn(); assert.equal((await send(h, body)).status, 502);
  const usage = await h.db.prepare('SELECT * FROM usage_daily').first(); assert(usage.reserved_tokens > 0);
  assert.equal((await send(h, body)).status, 409); assert.equal(h.world.modelCalls.length, 1);
});

test('a busy session cannot start another model call', async t => {
  const h = await prepared(t, enabled); const pending = send(h, turn()); await modelStarted(h);
  assert.equal((await send(h, turn())).status, 409); assert.equal((await pending).status, 200);
  assert.equal(h.world.modelCalls.length, 1);
});

test('an interrupted Worker attempt becomes reviewable without automatically rebilling', async t => {
  const h = await prepared(t, enabled), body = turn();
  await h.db.prepare("INSERT INTO runtime_requests(id,owner_id,session_id,input_digest,status,created_at,updated_at) SELECT ?,owner_id,id,'synthetic-digest','processing',1,1 FROM sessions WHERE id=?")
    .bind(body.request_id, h.sessionId).run();
  await h.db.prepare('UPDATE sessions SET active_request_id=?,lease_until=1 WHERE id=?').bind(body.request_id, h.sessionId).run();
  const result = (await h.request('/api/sessions/' + h.sessionId)).data.requests[0];
  assert.equal(result.status, 'failed'); assert.equal(result.error_code, 'request_outcome_unknown');
  assert.equal(h.world.modelCalls.length, 0);
  assert.equal((await send(h, turn())).status, 200); assert.equal(h.world.modelCalls.length, 1);
});

test('an expired/replaced lease cannot commit stale drafts or clear the newer lock', async t => {
  const h = await prepared(t, enabled);
  h.world.modelResponse = {answer: 'old response', cited_source_ids: [], candidate: {candidate_id: null, title: 'Old', markdown: 'old draft', article_id: null, primary_domain: 'foundations'}};
  const pending = send(h, turn()); await modelStarted(h);
  await h.db.prepare('UPDATE sessions SET active_request_id=?,lease_until=? WHERE id=?').bind('replacement', Math.floor(Date.now()/1000)+90, h.sessionId).run();
  assert.equal((await pending).status, 502);
  assert.equal((await h.db.prepare('SELECT active_request_id FROM sessions WHERE id=?').bind(h.sessionId).first()).active_request_id, 'replacement');
  assert.equal((await h.db.prepare('SELECT COUNT(*) n FROM knowledge_candidates').first()).n, 0);
});

test('stale sync keeps prior citations and disables model calls until freshness is restored', async t => {
  const h = await prepared(t, enabled); h.world.failed = true; await h.expireSync();
  const result = await send(h, turn()); assert.equal(result.status, 200); assert.equal(result.data.freshness, 'stale');
  assert.equal(h.world.modelCalls.length, 0); assert.equal(result.data.mode, 'retrieval');
});

test('session reads, writes and deletes cannot cross stored owner boundaries', async t => {
  const h = await prepared(t); const other = randomUUID();
  await h.db.prepare('INSERT INTO sessions(id,owner_id,created_at,updated_at) VALUES(?,?,1,1)').bind(other, 'another-owner').run();
  for (const [path, options] of [['/api/sessions/' + other, {}], ['/api/sessions/' + other + '/export', {}],
    ['/api/sessions/' + other, {method: 'DELETE'}], ['/api/sessions/' + other + '/messages', {method: 'POST', body: turn()}]]) assert.equal((await h.request(path, options)).status, 404);
  assert(!(await h.request('/api/sessions')).data.sessions.some(s => s.id === other));
});

test('deleting a session removes its chat, candidates and requests, retaining separate audit', async t => {
  const h = await prepared(t); await send(h, turn('zzzzPrivateCandidate'));
  assert.equal((await h.request('/api/sessions/' + h.sessionId, {method: 'DELETE'})).status, 200);
  for (const table of ['messages', 'knowledge_candidates', 'candidate_sources', 'runtime_requests']) assert.equal((await h.db.prepare('SELECT COUNT(*) n FROM ' + table).first()).n, 0);
  assert.equal((await h.request('/api/sessions/' + h.sessionId)).status, 404);
});

test('private workbench UI restores D1 conversations and treats user text as text', async t => {
  const h = await harness(); t.after(h.dispose); assert.equal((await h.sync()).status, 200);
  const html = (await h.request('/')).data;
  function open() {
    const errors = [], vc = new VirtualConsole(); vc.on('jsdomError', error => errors.push(error.message));
    const dom = new JSDOM(html, {url: ORIGIN, runScripts: 'dangerously', virtualConsole: vc, beforeParse(w) {
      w.fetch = (url, init = {}) => h.mf.dispatchFetch(ORIGIN + url, {...init, headers: {...(init.headers || {}), 'Cf-Access-Jwt-Assertion': h.jwt, ...(init.method && init.method !== 'GET' ? {Origin: ORIGIN} : {})}});
    }});
    t.after(() => dom.window.close()); return {dom, errors, d: dom.window.document};
  }
  async function until(check) {for (let i = 0; i < 200 && !check(); i++) await new Promise(r => setTimeout(r, 10)); assert(check());}
  const first = open(); await until(() => !first.d.getElementById('send').disabled);
  await until(() => first.d.getElementById('status').textContent.includes('已载入'));
  first.d.getElementById('question').value = 'zzzzUnknown <img src=x onerror=alert(1)>';
  first.d.getElementById('form').dispatchEvent(new first.dom.window.Event('submit', {bubbles: true, cancelable: true}));
  first.d.getElementById('form').dispatchEvent(new first.dom.window.Event('submit', {bubbles: true, cancelable: true}));
  await until(() => first.d.querySelectorAll('.message').length === 2 && first.d.querySelector('.candidate'));
  assert.equal((await h.db.prepare('SELECT COUNT(*) n FROM sessions').first()).n, 1);
  assert.equal(first.d.querySelector('#messages img'), null); assert.deepEqual(first.errors, []);
  const restored = open(); await until(() => restored.d.querySelectorAll('.message').length === 2);
  assert(restored.d.getElementById('messages').textContent.includes('zzzzUnknown'));
});
