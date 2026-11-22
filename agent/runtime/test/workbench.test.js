import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {JSDOM, VirtualConsole} from 'jsdom';
import {harness, ORIGIN} from './helpers.js';
import {renderMarkdown} from '../src/markdown.js';
import {candidateView} from '../src/session-view.js';

const enabled = {MODEL_PROVIDER: 'anthropic', MODEL_NAME: 'synthetic-test-model', MODEL_API_KEY: 'synthetic-secret', DAILY_CALL_LIMIT: '10', DAILY_TOKEN_LIMIT: '200000'};
async function until(check) {for (let i = 0; i < 400 && !check(); i++) await new Promise(r => setTimeout(r, 10)); assert(check());}
async function open(t, h, intercept = null) {
  const errors = [], vc = new VirtualConsole(); vc.on('jsdomError', e => errors.push(e.message));
  const dom = new JSDOM((await h.request('/')).data, {url: ORIGIN, runScripts: 'dangerously', virtualConsole: vc, beforeParse(w) {
    w.HTMLDialogElement.prototype.showModal = function () {this.open = true;};
    w.HTMLDialogElement.prototype.close = function () {this.open = false; this.dispatchEvent(new w.Event('close'));};
    w.fetch = async (url, init = {}) => {
      if (intercept) await intercept(url, init);
      return h.mf.dispatchFetch(ORIGIN + url, {...init, headers: {...(init.headers || {}), 'Cf-Access-Jwt-Assertion': h.jwt, ...(init.method && init.method !== 'GET' ? {Origin: ORIGIN} : {})}});
    };
  }});
  t.after(() => dom.window.close()); const d = dom.window.document;
  await until(() => !d.getElementById('send').disabled);
  return {dom, d, errors, submit: () => d.getElementById('form').dispatchEvent(new dom.window.Event('submit', {bubbles: true, cancelable: true}))};
}

test('session rename persists in lists, reads and exports while retaining other summary metadata', async t => {
  const h = await harness(); t.after(h.dispose); await h.sync(); const id = await h.session();
  await h.request('/api/sessions/' + id + '/messages', {method: 'POST', body: {request_id: randomUUID(), message: 'First question', reading_context: {}}});
  assert.equal((await h.request('/api/sessions')).data.sessions[0].title, 'First question');
  await h.db.prepare('UPDATE sessions SET summary_json=? WHERE id=?').bind(JSON.stringify({other: ['keep']}), id).run();
  const renamed = await h.request('/api/sessions/' + id, {method: 'PATCH', body: {title: '  VIO   学习 <安全>  '}});
  assert.equal(renamed.status, 200); assert.equal(renamed.data.title, 'VIO 学习 <安全>');
  assert.equal((await h.request('/api/sessions')).data.sessions[0].title, renamed.data.title);
  const detail = (await h.request('/api/sessions/' + id + '/export')).data.session;
  assert.equal(detail.title, renamed.data.title); assert.deepEqual(JSON.parse(detail.summary_json).other, ['keep']);
  await h.request('/api/sessions/' + id + '/messages', {method: 'POST', body: {request_id: randomUUID(), message: 'A later question', reading_context: {}}});
  assert.equal((await h.request('/api/sessions/' + id)).data.session.title, renamed.data.title);
  assert.equal(h.world.modelCalls.length, 0);
});

test('rename validates Unicode length and enforces Owner, origin and request marker', async t => {
  const h = await harness(); t.after(h.dispose); const id = await h.session(), path = '/api/sessions/' + id;
  for (const title of ['', '  ', 'a\nb', 'a\u0000b', '界'.repeat(81)]) assert.equal((await h.request(path, {method: 'PATCH', body: {title}})).status, 400);
  assert.equal((await h.request(path, {method: 'PATCH', body: {title: '😀'.repeat(80)}})).status, 200);
  assert.equal((await h.request(path, {method: 'PATCH', body: {title: 'ok', other: true}})).status, 400);
  assert.equal((await h.request(path, {method: 'PATCH', body: {title: 'ok'}, jwtOverride: null})).status, 401);
  for (const headers of [{Origin: 'https://foreign.test'}, {'X-Atlas-Request': ''}]) assert.equal((await h.request(path, {method: 'PATCH', body: {title: 'bad'}, headers})).status, 403);
  await h.db.prepare('UPDATE sessions SET owner_id=? WHERE id=?').bind('foreign-owner', id).run();
  assert.equal((await h.request(path, {method: 'PATCH', body: {title: 'bad'}})).status, 404);
});

test('candidate placement resolves canonical labels, flags drift and never assigns article topics', () => {
  const snapshot = {revision: 'a'.repeat(40), domains: [{id: 'perception', name: 'Perception'}], articles: [{id: 'sensors', title: 'Sensors', primary_domain: 'perception'}], topics: [{id: 'vio', title: 'VIO', article: 'sensors', anchor: 'vio'}]};
  const candidate = {placement_json: JSON.stringify({article_id: 'sensors', primary_domain: 'perception'}), source_revision: snapshot.revision};
  const view = candidateView(candidate, snapshot).placement_view;
  assert.equal(view.domain.title, 'Perception'); assert.equal(view.article.title, 'Sensors'); assert.match(view.article_topics[0].url, /page=sensors#vio$/);
  assert.equal(view.topics_assigned, false); assert.equal(view.source_is_current, true);
  const drift = candidateView({...candidate, placement_json: '{"article_id":"missing"}', source_revision: 'b'.repeat(40)}, snapshot).placement_view;
  assert.equal(drift.unresolved, true); assert.equal(drift.source_is_current, false); assert.equal(drift.article, null);
});

test('Markdown renders reading structures without executable HTML, unsafe URLs or image requests', () => {
  const dom = new JSDOM('<main></main>', {url: ORIGIN}); const target = dom.window.document.querySelector('main');
  target.append(renderMarkdown('# Title\n\n**bold** and `code`\n\n- item\n\n> note\n\n| A | B |\n| - | - |\n| 1 | 2 |\n\n```js\nalert("example")\n```\n\n[good](https://example.test/) [bad](javascript:alert%281%29) ![alt](https://exfil.test/a)\n\n<img src=x onerror=alert(1)><svg onload=alert(2)></svg><script>alert(3)</script>', dom.window.document));
  for (const tag of ['h1', 'strong', 'code', 'ul', 'blockquote', 'table', 'pre']) assert(target.querySelector(tag), tag);
  assert.equal(target.querySelector('script,svg,img,iframe,form'), null);
  for (const a of target.querySelectorAll('a')) {assert.match(a.href, /^https?:/); assert.equal(a.rel, 'noopener noreferrer');}
  assert(target.textContent.includes('<img')); assert(target.textContent.includes('alt')); dom.window.close();
});

test('workbench immediately lifts a prompt, prevents duplicates, preserves next draft and restores renamed conversations', async t => {
  const h = await harness(enabled); t.after(h.dispose); await h.sync();
  const article = h.world.snapshot.articles.find(a => a.id === 'sensors-and-estimation');
  h.world.modelResponse = {answer: '**Synthetic answer**\n\n- One\n- Two', cited_source_ids: [], candidate: {candidate_id: null, title: 'Synthetic candidate', markdown: '## A private draft\n\n**Needs verification**', article_id: article.id, primary_domain: article.primary_domain}};
  let release, blocked = 0; const gate = new Promise(r => {release = r;});
  const first = await open(t, h, async (url, init) => {if (url.endsWith('/messages') && init.method === 'POST') {blocked++; await gate;}});
  const q = first.d.getElementById('question'); q.value = 'VIO <img src=x onerror=alert(1)>'; first.submit();
  assert.equal(q.value, ''); assert.equal(first.d.querySelectorAll('.message.user').length, 1); assert.equal(first.d.getElementById('waiting').hidden, false);
  first.submit(); await until(() => blocked === 1); q.value = 'My next draft'; release();
  await until(() => !first.d.getElementById('send').disabled && first.d.querySelector('.candidate'));
  assert.equal(h.world.modelCalls.length, 1); assert.equal(first.d.querySelectorAll('.message').length, 2); assert.equal(q.value, 'My next draft');
  assert(first.d.querySelector('.assistant strong')); assert.equal(first.d.querySelector('#messages img'), null); assert.equal(first.d.getElementById('waiting').hidden, true);
  assert(first.d.querySelector('.metadata').textContent.includes(article.title)); assert(first.d.querySelector('.metadata').textContent.includes('尚未指定'));
  first.d.getElementById('rename').click(); first.d.getElementById('session-title').value = 'My VIO notes';
  first.d.getElementById('rename-form').dispatchEvent(new first.dom.window.Event('submit', {bubbles: true, cancelable: true}));
  await until(() => !first.d.getElementById('rename-dialog').open);
  assert.equal(first.d.getElementById('conversation-title').textContent, 'My VIO notes');
  const restored = await open(t, h); assert.equal(restored.d.querySelectorAll('.message').length, 2); assert.equal(restored.d.querySelectorAll('.candidate').length, 1);
  assert.equal(restored.d.getElementById('conversation-title').textContent, 'My VIO notes');
  assert(restored.d.querySelector('.session-item strong').textContent.includes('My VIO notes'));
  restored.d.getElementById('toggle-history').click(); assert.equal(restored.d.getElementById('toggle-history').getAttribute('aria-expanded'), 'false');
  restored.d.getElementById('toggle-candidates').click(); assert.equal(restored.d.getElementById('toggle-candidates').getAttribute('aria-expanded'), 'true');
  restored.d.dispatchEvent(new restored.dom.window.KeyboardEvent('keydown', {key: 'Escape', bubbles: true}));
  assert.equal(restored.d.getElementById('toggle-candidates').getAttribute('aria-expanded'), 'false'); assert.deepEqual(first.errors, []); assert.deepEqual(restored.errors, []);
});

test('a failed model request restores the question and failure controls after refresh, without automatic paid retries', async t => {
  const h = await harness(enabled); t.after(h.dispose); await h.sync(); h.world.modelFail = true;
  const first = await open(t, h); first.d.getElementById('question').value = 'Synthetic failed question'; first.submit();
  await until(() => !first.d.getElementById('send').disabled && first.d.getElementById('error').textContent.length > 0);
  assert.equal(first.d.getElementById('question').value, 'Synthetic failed question'); assert.equal(h.world.modelCalls.length, 1);
  const restored = await open(t, h); assert.equal(restored.d.querySelectorAll('.message.user').length, 1);
  assert.equal(restored.d.getElementById('check-result').hidden, false); assert.equal(restored.d.getElementById('new-attempt').hidden, false);
  restored.d.getElementById('check-result').click(); await new Promise(r => setTimeout(r, 100)); assert.equal(h.world.modelCalls.length, 1);
});

test('failed session creation restores a submitted question and exposes a recoverable error', async t => {
  const h = await harness(); t.after(h.dispose); await h.sync();
  const ui = await open(t, h, async (path, init) => {if (path === '/api/sessions' && init.method === 'POST') throw new Error('Synthetic network failure');});
  ui.d.getElementById('question').value = 'Do not lose this question'; ui.submit();
  await until(() => !ui.d.getElementById('send').disabled && ui.d.getElementById('error').textContent.length > 0);
  assert.equal(ui.d.getElementById('question').value, 'Do not lose this question'); assert.equal(h.world.modelCalls.length, 0);
});
