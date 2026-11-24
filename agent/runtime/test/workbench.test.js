import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {JSDOM, VirtualConsole} from 'jsdom';
import {harness, ORIGIN} from './helpers.js';
import {renderMarkdown} from '../src/markdown.js';
import {candidateView} from '../src/session-view.js';
import {readerURL, readingContext} from '../src/reading-view.js';
import {validationFixture} from './validation-helpers.js';
import {publicationFixture} from './publication-helpers.js';

test('public review requires an explicit unchecked confirmation, creates one PR and restores exact CI without rebilling', async t => {
  const h = await publicationFixture(t);
  let release, sends = 0; const gate = new Promise(resolve => {release = resolve;});
  const ui = await open(t, h, async (path, init) => {if (path.endsWith('/publication') && init.method === 'POST') {sends++; await gate;}}), d = ui.d;
  d.getElementById('question').value = 'Keep my next private learning question';
  d.querySelector('[data-proposal-candidate]').click();
  await until(() => !d.getElementById('proposal-close').disabled && d.querySelector('.publication-confirm input'));
  assert.equal(h.world.publication.writes.length, 0);
  const checkbox = d.querySelector('.publication-confirm input'), create = [...d.querySelectorAll('.publication-review button')].find(x => x.textContent.includes('创建 PR'));
  assert.equal(checkbox.checked, false); assert.equal(create.disabled, true);
  assert(d.querySelector('.publication-disclosure').textContent.includes('CI 失败'));
  checkbox.click(); assert.equal(create.disabled, false); create.click(); create.click();
  await until(() => sends === 1);
  assert.equal(d.getElementById('proposal-close').disabled, true); assert.equal(d.getElementById('proposal-version').disabled, true);
  release();
  await until(() => d.querySelector('.publication-status')?.textContent.includes('CI 检查中'));
  assert.equal(h.world.publication.writes.length, 3); assert.equal(sends, 1);
  d.getElementById('proposal-close').click();
  const restored = await open(t, h); restored.d.querySelector('[data-proposal-candidate]').click();
  await until(() => restored.d.querySelector('.publication-status')?.textContent.includes('CI 检查中'));
  h.world.publication.checks = 'success';
  [...restored.d.querySelectorAll('.publication-review button')].find(x => x.textContent.includes('核对任务')).click();
  await until(() => restored.d.querySelector('.publication-status')?.textContent.includes('检查通过'));
  assert(restored.d.querySelector('.publication-review a').href.endsWith('/pull/41'));
  assert(![...restored.d.querySelectorAll('.publication-review button')].some(x => x.textContent.includes('合并')));
  assert.equal(h.world.modelCalls.length, 1); assert.equal(h.world.publication.writes.length, 3);
  assert.equal(d.getElementById('question').value, 'Keep my next private learning question');
  assert.deepEqual(ui.errors, []); assert.deepEqual(restored.errors, []);
});

test('a lost public-submit response keeps creation disabled until the exact saved task is reconciled', async t => {
  const h = await publicationFixture(t), ui = await open(t, h, async (path, init) => {
    if (path.endsWith('/publication') && init.method === 'POST') {await h.start(JSON.parse(init.body)); throw Error('Synthetic lost response');}
  }), d = ui.d;
  d.querySelector('[data-proposal-candidate]').click();
  await until(() => d.querySelector('.publication-confirm input') && !d.getElementById('proposal-close').disabled);
  d.querySelector('.publication-confirm input').click();
  [...d.querySelectorAll('.publication-review button')].find(x => x.textContent.includes('创建 PR')).click();
  await until(() => d.querySelector('.publication-status')?.textContent.includes('结果待核对'));
  assert(![...d.querySelectorAll('.publication-review button')].some(x => x.textContent.includes('创建 PR')));
  [...d.querySelectorAll('.publication-review button')].find(x => x.textContent.includes('核对任务')).click();
  await until(() => d.querySelector('.publication-status')?.textContent.includes('CI 检查中'));
  assert.equal(h.world.publication.writes.length, 3); assert.equal(h.world.modelCalls.length, 1); assert.deepEqual(ui.errors, []);
});

test('unconfigured publication exposes a private preview but no enabled public-create action', async t => {
  const h = await publicationFixture(t, {PUBLICATION_CONFIG: JSON.stringify({enabled: false})}), ui = await open(t, h), d = ui.d;
  d.querySelector('[data-proposal-candidate]').click();
  await until(() => d.querySelector('.publication-status')?.textContent.includes('尚未接入'));
  assert(!d.querySelector('.publication-confirm input'));
  assert(![...d.querySelectorAll('.publication-review button')].some(x => x.textContent.includes('创建 PR')));
  assert.equal(h.world.publication.writes.length, 0); assert.equal(h.world.modelCalls.length, 1); assert.deepEqual(ui.errors, []);
});

test('private validation displays progress, restores after reopening and shows verified results without another model call', async t => {
  const h = await validationFixture(t), ui = await open(t, h), d = ui.d;
  d.getElementById('question').value = 'Keep learning while checks run';
  d.querySelector('[data-proposal-candidate]').click();
  await until(() => !d.getElementById('proposal-close').disabled && !d.getElementById('proposal-validation-progress').hidden);
  assert.equal(d.getElementById('proposal-validation').getAttribute('aria-busy'), 'true');
  d.getElementById('proposal-close').click();
  const restored = await open(t, h); restored.d.querySelector('[data-proposal-candidate]').click();
  await until(() => !restored.d.getElementById('proposal-close').disabled);
  assert.equal(h.world.validation.dispatches.length, 1); assert.equal(h.world.modelCalls.length, 1);
  assert.equal((await h.machine('claim')).status, 200); assert.equal((await h.machine('report', h.report())).status, 200);
  h.world.validation.status = 'completed'; h.world.validation.conclusion = 'success';
  await h.db.prepare('UPDATE proposal_validations SET checked_at=0').run();
  restored.d.getElementById('proposal-validation-refresh').click();
  await until(() => restored.d.getElementById('proposal-validation-status').textContent.includes('检查通过'));
  assert.equal(restored.d.getElementById('proposal-validation-progress').hidden, true);
  assert.equal(restored.d.querySelectorAll('#proposal-validation-checks li').length, 5);
  assert.equal(d.getElementById('question').value, 'Keep learning while checks run');
  assert.equal(h.world.modelCalls.length, 1); assert.equal(h.world.validation.dispatches.length, 1);
  assert.deepEqual(ui.errors, []); assert.deepEqual(restored.errors, []);
});

const enabled = {MODEL_PROVIDER: 'anthropic', MODEL_NAME: 'synthetic-test-model', MODEL_API_KEY: 'synthetic-secret', DAILY_CALL_LIMIT: '10', DAILY_TOKEN_LIMIT: '200000'};

test('manual sync immediately shows visible progress, refreshes candidate labels and preserves the conversation and next draft', async t => {
  const h = await harness(); t.after(h.dispose); await h.sync(); const id = await h.session();
  await h.request('/api/sessions/' + id + '/messages', {method: 'POST', body: {request_id: randomUUID(), message: 'zzzzSyncFixture', reading_context: {}}});
  const candidate = (await h.request('/api/sessions/' + id)).data.candidates[0], article = h.world.snapshot.articles.find(a => a.id === 'sensors-and-estimation');
  await h.request('/api/candidates/' + candidate.id, {method: 'PATCH', body: {version: 1, snapshot_revision: h.world.snapshot.revision,
    title: candidate.title, draft_markdown: candidate.draft_markdown, primary_domain: article.primary_domain, article_id: article.id, status: 'drafting', evidence: null}});
  let release, requests = 0; const gate = new Promise(resolve => {release = resolve;});
  const ui = await open(t, h, async (url, init) => {if (url === '/api/sync' && init.method === 'POST') {requests++; await gate;}}), d = ui.d;
  const title = d.getElementById('conversation-title').textContent, messages = d.getElementById('messages').textContent;
  d.getElementById('question').value = 'Keep my next learning question';
  h.world.main = 'b'.repeat(40); h.world.snapshot = {...h.world.snapshot, revision: h.world.main,
    articles: h.world.snapshot.articles.map(a => a.id === article.id ? {...a, title: 'Synced reference title'} : a)};
  d.getElementById('refresh').click(); d.getElementById('refresh').click();
  assert.equal(d.getElementById('sync-feedback').hidden, false); assert.match(d.getElementById('sync-button-label').textContent, /正在同步/);
  assert.equal(d.getElementById('refresh').getAttribute('aria-busy'), 'true'); assert.equal(d.getElementById('refresh').disabled, true);
  await until(() => requests === 1); release(); await until(() => !d.getElementById('refresh').disabled);
  assert.match(d.getElementById('sync-feedback').textContent, /知识内容已更新/);
  assert(d.getElementById('sync-feedback').textContent.includes(h.world.snapshot.articles.length + ' 篇文章'));
  assert(d.getElementById('sync-feedback').textContent.includes(h.world.snapshot.topics.length + ' 个知识点'));
  assert(d.querySelector('.metadata').textContent.includes('Synced reference title'));
  assert.equal(d.getElementById('conversation-title').textContent, title); assert.equal(d.getElementById('messages').textContent, messages);
  assert.equal(d.getElementById('question').value, 'Keep my next learning question');
  assert.equal(d.getElementById('refresh').getAttribute('aria-busy'), 'false');
  assert.equal(requests, 1); assert.equal(h.world.modelCalls.length, 0); assert.deepEqual(ui.errors, []);
});

test('manual sync visibly distinguishes already current, failure and another in-progress request without false success', async t => {
  const h = await harness(); t.after(h.dispose); await h.sync(); const ui = await open(t, h), d = ui.d;
  const click = async () => {d.getElementById('refresh').click(); await until(() => !d.getElementById('refresh').disabled); return d.getElementById('sync-feedback').textContent;};
  assert.match(await click(), /内容已是最新/);
  h.world.failed = true; assert.match(await click(), /暂时无法连接知识来源/);
  h.world.failed = false;
  await h.db.prepare('UPDATE runtime_sync SET lock_token=?,lock_until=? WHERE id=1').bind('synthetic-lock', Math.floor(Date.now()/1000)+120).run();
  assert.match(await click(), /另一个请求正在同步/);
  assert.equal(h.world.modelCalls.length, 0); assert.deepEqual(ui.errors, []);
});

test('automatic private architecture advice restores after refresh, stays safe text and can be copied without another model call', async t => {
  const h = await harness(enabled); t.after(h.dispose); await h.sync(); const id = await h.session();
  h.world.modelResponse = {answer: 'Continue learning while the placement remains private.', cited_source_ids: [], candidate: {
    candidate_id: null, title: 'Synthetic unclassified knowledge', markdown: 'A synthetic private observation.', primary_domain: null, article_id: null,
    organization: {status: 'architecture_review', reason: 'Synthetic placement needs discussion.', advice: {
      problem: 'Synthetic gap <img src=x onerror=bad()>', suggestion: 'Evaluate the existing views in the architecture conversation.', impact: 'Inspect Topic identities and links.'}}}};
  assert.equal((await h.request('/api/sessions/' + id + '/messages', {method: 'POST', body: {request_id: randomUUID(), message: 'Learn this synthetic concept', reading_context: {}}})).status, 200);
  const ui = await open(t, h), d = ui.d;
  assert(d.querySelector('.candidate-organization').textContent.includes('需先讨论架构'));
  assert.equal(d.querySelector('.candidate-organization img'), null);
  assert.equal(d.querySelector('[data-proposal-candidate]').hidden, true);
  d.querySelector('.copy-architecture-advice').click();
  await until(() => !d.querySelector('.candidate-organization textarea').hidden);
  const copied = d.querySelector('.candidate-organization textarea').value;
  assert(copied.includes('# Atlas 架构讨论建议')); assert(copied.includes('不作为修改指令'));
  assert(!copied.includes(id)); assert(!copied.includes('synthetic-secret'));
  const restored = await open(t, h); assert(restored.d.querySelector('.candidate-organization').textContent.includes('Evaluate the existing views'));
  assert.equal(h.world.modelCalls.length, 1); assert.deepEqual(ui.errors, []); assert.deepEqual(restored.errors, []);
});

test('one explicit review-and-prepare action saves the candidate then prepares a proposal without losing the learning draft or bypassing evidence', async t => {
  const h = await harness(enabled); t.after(h.dispose); await h.sync(); const id = await h.session();
  const article = h.world.snapshot.articles.find(a => a.id === 'sensors-and-estimation');
  h.world.modelResponse = {answer: 'Synthetic learning answer.', cited_source_ids: [], candidate: {candidate_id: null, title: 'Synthetic combined flow',
    markdown: 'A limited synthetic observation.', article_id: article.id, primary_domain: article.primary_domain,
    organization: {status: 'fits', reason: 'The existing article is suitable.', advice: null}}};
  await h.request('/api/sessions/' + id + '/messages', {method: 'POST', body: {request_id: randomUUID(), message: 'Learn the synthetic observation', reading_context: {}}});
  const ui = await open(t, h), d = ui.d; d.getElementById('question').value = 'Keep this next learning question';
  d.querySelector('[data-proposal-candidate]').click(); await until(() => !d.getElementById('candidate-prepare').disabled);
  d.getElementById('candidate-prepare').click(); await until(() => d.getElementById('candidate-error').textContent.length > 0);
  assert.equal(h.world.modelCalls.length, 1); assert.equal(d.getElementById('candidate-dialog').open, true);
  d.getElementById('candidate-evidence-kind').value = 'experience'; d.getElementById('candidate-evidence-kind').dispatchEvent(new ui.dom.window.Event('change'));
  d.getElementById('candidate-reference').value = 'Synthetic limited lab observation'; d.getElementById('candidate-supports').value = 'Supports this synthetic observation only.';
  d.getElementById('candidate-confirm').checked = true;
  h.world.modelResponse = {decision: 'extend', narrative: 'concept', addition_markdown: '## Synthetic combined addition\n\nA limited observation.',
    reason: 'Adds a bounded synthetic case.', editorial_notes: 'Review wording and public scope.'};
  d.getElementById('candidate-prepare').click(); d.getElementById('candidate-prepare').click();
  await until(() => d.getElementById('proposal-content').querySelector('.proposal-diff'));
  assert.equal(h.world.modelCalls.length, 2); assert.equal(d.getElementById('candidate-dialog').open, false);
  assert.equal(d.getElementById('question').value, 'Keep this next learning question');
  assert.equal((await h.db.prepare('SELECT COUNT(*) n FROM proposal_versions').first()).n, 1);
  assert.equal((await h.db.prepare('SELECT COUNT(*) n FROM approvals').first()).n, 0);
  assert.deepEqual(ui.errors, []);
});

async function proposalFixture(t) {
  const h = await harness(enabled); t.after(h.dispose); await h.sync(); const id = await h.session();
  const article = h.world.snapshot.articles.find(a => a.id === 'sensors-and-estimation');
  h.world.modelResponse = {answer: 'Synthetic response', cited_source_ids: [], candidate: {candidate_id: null, title: 'Synthetic addition', markdown: 'A bounded synthetic observation.', article_id: article.id, primary_domain: article.primary_domain}};
  await h.request('/api/sessions/' + id + '/messages', {method: 'POST', body: {request_id: randomUUID(), message: 'Synthetic addition', reading_context: {}}});
  const candidate = (await h.request('/api/sessions/' + id)).data.candidates[0];
  assert.equal((await h.request('/api/candidates/' + candidate.id, {method: 'PATCH', body: {version: 1, snapshot_revision: h.world.snapshot.revision,
    title: candidate.title, draft_markdown: candidate.draft_markdown, primary_domain: article.primary_domain, article_id: article.id, status: 'ready',
    evidence: {kind: 'experience', reference: 'Synthetic lab record', supports: 'Supports the synthetic observation only.', owner_confirmed: true}}})).status, 200);
  h.world.modelResponse = {decision: 'extend', narrative: 'concept', addition_markdown: '## Synthetic addition\n\nA **bounded** synthetic observation.',
    reason: 'Adds a synthetic condition.', editorial_notes: 'Check technical meaning and public scope. <img src=x onerror=bad()>'};
  return {h, id, candidate};
}

test('proposal preparation shows complete private differences and immutable versions after reload without a second model call', async t => {
  const {h, candidate} = await proposalFixture(t), ui = await open(t, h), d = ui.d;
  d.querySelector('[data-proposal-candidate]').click();
  await until(() => !d.getElementById('proposal-generate').disabled);
  assert.equal(d.getElementById('proposal-dialog').open, true);
  d.getElementById('proposal-generate').click();
  await until(() => d.getElementById('proposal-content').querySelector('.proposal-diff'));
  assert.equal(d.querySelectorAll('#proposal-content .proposal-diff').length, 2);
  assert.match(d.getElementById('proposal-status').textContent, /私人提案 v1/);
  assert(d.getElementById('proposal-content').textContent.includes('整仓语义校验'));
  assert.equal(d.querySelector('#proposal-content img'), null);
  assert.match(d.getElementById('proposal-export').href, /export\?version=1$/);
  await until(() => !d.getElementById('proposal-close').disabled);
  d.getElementById('proposal-close').click(); assert.equal(d.activeElement.dataset.proposalCandidate, candidate.id);
  const calls = h.world.modelCalls.length, restored = await open(t, h);
  restored.d.querySelector('[data-proposal-candidate]').click();
  await until(() => restored.d.getElementById('proposal-content').querySelector('.proposal-diff'));
  assert.equal(h.world.modelCalls.length, calls); assert.deepEqual(ui.errors, []); assert.deepEqual(restored.errors, []);
});

test('a lost proposal response is reconciled from its persisted request without replaying the model', async t => {
  const {h} = await proposalFixture(t); let lost = false;
  const ui = await open(t, h, async (url, init) => {
    if (!lost && url.endsWith('/proposals') && init.method === 'POST') {
      lost = true; const result = await h.request(url, {method: 'POST', body: JSON.parse(init.body)}); assert.equal(result.status, 200);
      throw new Error('Synthetic dropped response');
    }
  });
  const d = ui.d; d.querySelector('[data-proposal-candidate]').click(); await until(() => !d.getElementById('proposal-generate').disabled);
  d.getElementById('proposal-generate').click(); await until(() => !d.getElementById('proposal-check').hidden);
  const calls = h.world.modelCalls.length; d.getElementById('proposal-check').click();
  await until(() => d.getElementById('proposal-content').querySelector('.proposal-diff'));
  assert.equal(h.world.modelCalls.length, calls); assert.equal((await h.db.prepare('SELECT COUNT(*) n FROM proposal_versions').first()).n, 1);
  assert.deepEqual(ui.errors, []);
});

test('a failed preview read after successful generation retains reconciliation instead of enabling another paid generation', async t => {
  const {h} = await proposalFixture(t); let lost = false;
  const ui = await open(t, h, async (url, init) => {
    if (!lost && url.startsWith('/api/proposals/') && init.method === 'GET') {lost = true; throw new Error('Synthetic failed preview read');}
  });
  const d = ui.d; d.querySelector('[data-proposal-candidate]').click(); await until(() => !d.getElementById('proposal-generate').disabled);
  d.getElementById('proposal-generate').click(); await until(() => !d.getElementById('proposal-check').hidden);
  assert.equal(d.getElementById('proposal-generate').disabled, true);
  const calls = h.world.modelCalls.length; d.getElementById('proposal-check').click();
  await until(() => d.getElementById('proposal-content').querySelector('.proposal-diff'));
  assert.equal(h.world.modelCalls.length, calls); assert.deepEqual(ui.errors, []);
});

async function reviewFixture(t, intercept = null) {
  const h = await harness(); t.after(h.dispose); await h.sync(); const id = await h.session();
  await h.request('/api/sessions/' + id + '/messages', {method: 'POST', body: {request_id: randomUUID(), message: 'zzzzPrivateReviewConcept', reading_context: {}}});
  const ui = await open(t, h, intercept); ui.d.querySelector('.candidate-actions button').click();
  await until(() => !ui.d.getElementById('candidate-fields').hidden);
  return {h, id, ...ui, save: () => ui.d.getElementById('candidate-form').dispatchEvent(new ui.dom.window.Event('submit', {bubbles: true, cancelable: true}))};
}

test('private candidate editor saves structured placement, renders safe preview and restores it after reload', async t => {
  const ui = await reviewFixture(t), d = ui.d;
  assert.equal(d.getElementById('candidate-dialog').open, true); assert.equal(d.getElementById('candidate-domain').options.length, 10);
  d.getElementById('candidate-title').value = 'Owner <draft>'; d.getElementById('candidate-body').value = '**Private revision**\n\n<script>alert(1)</script>';
  d.getElementById('candidate-body').dispatchEvent(new ui.dom.window.Event('input', {bubbles: true}));
  assert(d.querySelector('#candidate-preview strong')); assert.equal(d.querySelector('#candidate-preview script'), null);
  d.getElementById('candidate-domain').value = 'foundations'; d.getElementById('candidate-domain').dispatchEvent(new ui.dom.window.Event('change'));
  d.getElementById('candidate-state').value = 'drafting'; ui.save();
  await until(() => !d.getElementById('candidate-dialog').open);
  assert.equal(d.querySelector('.candidate h3').textContent, 'Owner <draft>'); assert.match(d.querySelector('.candidate-state').textContent, /整理中.*v2/);
  assert.match(d.querySelector('.candidate-actions a').href, /export\?version=2$/);
  assert.equal(d.activeElement.dataset.candidateId, d.querySelector('.candidate-actions button').dataset.candidateId);
  assert.equal(d.querySelector('.candidate h3 img'), null); assert.equal(ui.h.world.modelCalls.length, 0);
  const restored = await open(t, ui.h); assert.equal(restored.d.querySelector('.candidate h3').textContent, 'Owner <draft>');
  assert.match(restored.d.querySelector('.candidate').textContent, /后续模型草稿不会自动覆盖/); assert.deepEqual(ui.errors, []);
});

test('candidate review requires explicit source attestation and retains input when validation fails', async t => {
  const ui = await reviewFixture(t), d = ui.d;
  d.getElementById('candidate-state').value = 'ready'; d.getElementById('candidate-title').value = 'Keep this draft'; ui.save();
  await until(() => d.getElementById('candidate-error').textContent.length > 0);
  assert.equal(d.getElementById('candidate-dialog').open, true); assert.equal(d.getElementById('candidate-title').value, 'Keep this draft');
  d.getElementById('candidate-domain').value = 'foundations';
  d.getElementById('candidate-evidence-kind').value = 'experience'; d.getElementById('candidate-evidence-kind').dispatchEvent(new ui.dom.window.Event('change'));
  d.getElementById('candidate-reference').value = 'Synthetic lab observation, limited conditions';
  d.getElementById('candidate-supports').value = 'Supports only this synthetic draft, not a general technical conclusion.';
  d.getElementById('candidate-confirm').checked = true; ui.save();
  await until(() => !d.getElementById('candidate-dialog').open);
  assert.match(d.querySelector('.candidate-state').textContent, /已整理.*待正式提案.*本人已核对/);
  assert.equal(ui.h.world.modelCalls.length, 0);
});

test('a stale candidate editor retains the local draft instead of overwriting a concurrent saved version', async t => {
  const ui = await reviewFixture(t), d = ui.d, detail = (await ui.h.request('/api/sessions/' + ui.id)).data.candidates[0];
  const remote = await ui.h.request('/api/candidates/' + detail.id, {method: 'PATCH', body: {version: 1, snapshot_revision: ui.h.world.snapshot.revision,
    title: 'Other saved version', draft_markdown: 'Other saved body', primary_domain: null, article_id: null, status: 'drafting', evidence: null}});
  assert.equal(remote.status, 200); d.getElementById('candidate-body').value = 'Keep my unsaved local revision'; ui.save();
  await until(() => d.getElementById('candidate-error').textContent.includes('其他页面更新'));
  assert.equal(d.getElementById('candidate-body').value, 'Keep my unsaved local revision'); assert.equal(d.getElementById('candidate-dialog').open, true);
  assert.equal((await ui.h.request('/api/candidates/' + detail.id)).data.candidate.draft_markdown, 'Other saved body');
  d.getElementById('candidate-cancel').click(); assert.equal(d.getElementById('candidate-dialog').open, false);
  assert.equal(d.activeElement.dataset.candidateId, detail.id);
});

test('an in-flight candidate save is submitted once and cannot be cancelled before its result', async t => {
  let release, requests = 0; const gate = new Promise(resolve => {release = resolve;});
  const ui = await reviewFixture(t, async (path, init) => {if (path.startsWith('/api/candidates/') && init.method === 'PATCH') {requests++; await gate;}});
  ui.save(); ui.save(); await until(() => requests === 1);
  assert.equal(ui.d.getElementById('candidate-save').disabled, true); assert.equal(ui.d.getElementById('candidate-cancel').disabled, true);
  const escape = new ui.dom.window.Event('cancel', {cancelable: true}); ui.d.getElementById('candidate-dialog').dispatchEvent(escape); assert.equal(escape.defaultPrevented, true);
  release(); await until(() => !ui.d.getElementById('candidate-dialog').open); assert.equal(requests, 1);
});

test('reader destinations and reading metadata are bounded canonical public values', () => {
  assert.equal(readerURL('https://evil.example/embodied-ai-atlas/'),null);
  assert.equal(readerURL('https://www.yuechuanhou.com/other/'),null);
  assert.equal(readerURL('?page=valid&session_id=private'),null);
  assert.equal(readerURL('javascript:alert(1)'),null);
  assert(readerURL('?page=sensors-and-estimation#vio').href.includes('atlas_reader=1'));
  assert.deepEqual(readingContext({article_id:'a',session_id:'private',secret:'private',anchor:'bad\nvalue'}),{article_id:'a'});
});
async function until(check) {for (let i = 0; i < 400 && !check(); i++) await new Promise(r => setTimeout(r, 10)); assert(check());}
async function open(t, h, intercept = null, url = ORIGIN) {
  const errors = [], vc = new VirtualConsole(); vc.on('jsdomError', e => errors.push(e.message));
  const dom = new JSDOM((await h.request('/')).data, {url, runScripts: 'dangerously', virtualConsole: vc, beforeParse(w) {
    // dispatchFetch uses Node's Request, so its abort signal must share that realm.
    w.AbortController = AbortController;
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

async function seededConversations(t) {
  const h = await harness(); t.after(h.dispose); await h.sync();
  for (const message of ['UnknownPrivateAlpha', 'UnknownPrivateBeta']) {
    const id = await h.session();
    await h.request('/api/sessions/' + id + '/messages', {method: 'POST', body: {request_id: randomUUID(), message, reading_context: {}}});
  }
  return h;
}

test('per-conversation delete can cancel safely and deletes only the selected inactive conversation', async t => {
  const h = await seededConversations(t); let calls = 0;
  const ui = await open(t, h, (path, init) => {if (init.method === 'DELETE') calls++;});
  const activeId = ui.d.querySelector('.session-item[aria-current=true]').dataset.sessionId;
  const remove = [...ui.d.querySelectorAll('.session-actions-trigger')].find(el => el.dataset.sessionId !== activeId);
  const removedId = remove.dataset.sessionId, before = ui.d.getElementById('messages').textContent;
  ui.d.getElementById('question').value = 'Keep the active draft';
  remove.click(); ui.d.getElementById('menu-delete').click(); assert.equal(ui.d.getElementById('delete-dialog').open, true);
  assert(ui.d.getElementById('delete-scope').textContent.includes('未入库候选')); assert.equal(ui.d.activeElement.id, 'delete-cancel');
  ui.d.getElementById('delete-cancel').click(); assert.equal(calls, 0); assert.equal(ui.d.activeElement, remove);
  assert.equal((await h.request('/api/sessions/' + removedId)).status, 200);
  remove.click(); ui.d.getElementById('menu-delete').click(); ui.d.getElementById('delete-confirm').click(); ui.d.getElementById('delete-confirm').click();
  await until(() => !ui.d.getElementById('delete-dialog').open);
  await until(() => ui.d.querySelectorAll('.session-row').length === 1);
  assert.equal(calls, 1); assert.equal((await h.request('/api/sessions/' + removedId)).status, 404);
  for (const table of ['messages', 'knowledge_candidates', 'runtime_requests']) assert.equal((await h.db.prepare('SELECT COUNT(*) n FROM ' + table + ' WHERE session_id=?').bind(removedId).first()).n, 0);
  assert.equal((await h.request('/api/sessions/' + activeId)).status, 200);
  assert.equal(ui.d.getElementById('messages').textContent, before); assert.equal(ui.d.getElementById('question').value, 'Keep the active draft');
  assert.equal(ui.d.querySelector('.session-item[aria-current=true]').dataset.sessionId, activeId); assert.equal(h.world.modelCalls.length, 0);
  const restored = await open(t, h); assert.equal(restored.d.querySelectorAll('.session-row').length, 1); assert.deepEqual(ui.errors, []);
});

test('deleting the current conversation clears its messages and candidates, retaining the other conversation', async t => {
  const h = await seededConversations(t), ui = await open(t, h);
  const activeId = ui.d.querySelector('.session-item[aria-current=true]').dataset.sessionId;
  assert(ui.d.querySelector('.candidate'));
  ui.d.getElementById('delete-session').click(); ui.d.getElementById('delete-confirm').click();
  await until(() => !ui.d.getElementById('delete-dialog').open);
  assert.equal(ui.d.getElementById('conversation-title').textContent, '新对话'); assert.equal(ui.d.querySelectorAll('.message').length, 0);
  assert.equal(ui.d.querySelectorAll('.candidate').length, 0); assert.equal(ui.d.getElementById('empty-state').hidden, false);
  assert.equal((await h.request('/api/sessions/' + activeId)).status, 404); assert.equal((await h.request('/api/sessions')).data.sessions.length, 1);
  assert.equal(ui.d.getElementById('delete-session').disabled, true); assert.equal(ui.d.activeElement.id, 'new-session');
});

test('server rejection of deletion retains the conversation and candidate without pretending success', async t => {
  const h = await seededConversations(t), ui = await open(t, h);
  const id = ui.d.querySelector('.session-item[aria-current=true]').dataset.sessionId;
  await h.db.prepare('UPDATE sessions SET active_request_id=?,lease_until=? WHERE id=?').bind(randomUUID(), Math.floor(Date.now()/1000) + 300, id).run();
  ui.d.getElementById('delete-session').click(); ui.d.getElementById('delete-confirm').click();
  await until(() => ui.d.getElementById('delete-error').textContent.length > 0);
  assert.equal(ui.d.getElementById('delete-dialog').open, true); assert(ui.d.getElementById('delete-error').textContent.includes('仍在处理中'));
  assert(ui.d.querySelector('.message')); assert(ui.d.querySelector('.candidate')); assert.equal((await h.request('/api/sessions/' + id)).status, 200);
  assert.equal(ui.d.getElementById('delete-confirm').disabled, false); assert.equal(h.world.modelCalls.length, 0);
});

test('pin metadata survives renaming, later messages and exports without replacing other summary keys', async t => {
  const h = await harness(); t.after(h.dispose); await h.sync(); const id = await h.session(), path = '/api/sessions/' + id;
  assert.equal((await h.request(path)).data.session.pinned, false);
  await h.db.prepare('UPDATE sessions SET summary_json=? WHERE id=?').bind(JSON.stringify({title: 'Keep this title', memory: {other: true}}), id).run();
  const pin = await h.request(path, {method: 'PATCH', body: {pinned: true}}); assert.equal(pin.status, 200); assert.equal(pin.data.pinned, true);
  await h.request(path, {method: 'PATCH', body: {title: 'Changed title'}});
  await h.request(path + '/messages', {method: 'POST', body: {request_id: randomUUID(), message: 'Known VIO question', reading_context: {}}});
  const exported = (await h.request(path + '/export')).data.session;
  assert.equal(exported.title, 'Changed title'); assert.equal(exported.pinned, true);
  assert.deepEqual(JSON.parse(exported.summary_json).memory, {other: true});
  const unpin = await h.request(path, {method: 'PATCH', body: {pinned: false}}); assert.equal(unpin.data.pinned, false);
  assert.equal((await h.request(path)).data.session.title, 'Changed title'); assert.equal(h.world.modelCalls.length, 0);
});

test('pin patch accepts only booleans and retains the same Owner and origin boundary as rename', async t => {
  const h = await harness(); t.after(h.dispose); const id = await h.session(), path = '/api/sessions/' + id;
  for (const body of [{}, {pinned: 'true'}, {pinned: 1}, {pinned: null}, {pinned: false, owner_id: 'foreign'}, {pinned: true, title: ''}]) {
    assert.equal((await h.request(path, {method: 'PATCH', body})).status, 400);
  }
  assert.equal((await h.request(path, {method: 'PATCH', body: {pinned: true}, jwtOverride: null})).status, 401);
  assert.equal((await h.request(path, {method: 'PATCH', body: {pinned: true}, headers: {Origin: 'https://foreign.test'}})).status, 403);
  await h.db.prepare('UPDATE sessions SET owner_id=? WHERE id=?').bind('foreign-owner', id).run();
  assert.equal((await h.request(path, {method: 'PATCH', body: {pinned: true}})).status, 404);
});

test('pinned conversations are ordered before recent ones across pagination and missing flags stay unpinned', async t => {
  const h = await harness(); t.after(h.dispose); const seed = await h.session();
  const owner = (await h.db.prepare('SELECT owner_id FROM sessions WHERE id=?').bind(seed).first()).owner_id;
  const ids = Array.from({length: 55}, () => randomUUID());
  await h.db.batch(ids.map((id, i) => h.db.prepare('INSERT INTO sessions(id,owner_id,created_at,updated_at) VALUES(?,?,1,?)').bind(id, owner, i + 2)));
  await h.request('/api/sessions/' + ids[0], {method: 'PATCH', body: {pinned: true}});
  await h.db.prepare('UPDATE sessions SET updated_at=2 WHERE id=?').bind(ids[0]).run();
  const first = (await h.request('/api/sessions')).data, second = (await h.request('/api/sessions?offset=' + first.next_offset)).data;
  assert.equal(first.sessions[0].id, ids[0]); assert.equal(first.sessions[0].pinned, true);
  assert(first.sessions.slice(1).every(s => s.pinned === false));
  const all = [...first.sessions, ...second.sessions].map(s => s.id); assert.equal(new Set(all).size, 56); assert.equal(all.length, 56);
  await h.request('/api/sessions/' + ids[0], {method: 'PATCH', body: {pinned: false}});
  assert((await h.request('/api/sessions')).data.sessions.every(s => s.pinned === false));
});

test('conversation menu pins and renames another session while preserving the active conversation and draft', async t => {
  const h = await seededConversations(t), ui = await open(t, h);
  const activeId = ui.d.querySelector('.session-item[aria-current=true]').dataset.sessionId;
  const triggerFor = id => [...ui.d.querySelectorAll('.session-actions-trigger')].find(b => b.dataset.sessionId === id);
  const target = [...ui.d.querySelectorAll('.session-actions-trigger')].find(b => b.dataset.sessionId !== activeId), id = target.dataset.sessionId;
  const before = ui.d.getElementById('messages').textContent, heading = ui.d.getElementById('conversation-title').textContent;
  ui.d.getElementById('question').value = 'Keep my next question'; target.click();
  assert.equal(target.getAttribute('aria-expanded'), 'true'); assert.equal(ui.d.activeElement.id, 'menu-pin');
  ui.d.dispatchEvent(new ui.dom.window.KeyboardEvent('keydown', {key: 'ArrowDown', bubbles: true})); assert.equal(ui.d.activeElement.id, 'menu-rename');
  ui.d.dispatchEvent(new ui.dom.window.KeyboardEvent('keydown', {key: 'Escape', bubbles: true}));
  assert.equal(ui.d.getElementById('session-menu').hidden, true); assert.equal(ui.d.activeElement, target);
  target.click(); ui.d.getElementById('menu-pin').click();
  await until(() => !ui.d.getElementById('send').disabled && ui.d.querySelector('.pinned-mark'));
  assert.equal(ui.d.querySelector('.session-item').dataset.sessionId, id);
  assert.equal((await h.request('/api/sessions')).data.sessions[0].pinned, true);
  assert.equal(ui.d.getElementById('messages').textContent, before); assert.equal(ui.d.getElementById('question').value, 'Keep my next question');
  triggerFor(id).click(); assert.equal(ui.d.getElementById('menu-pin-label').textContent, '取消置顶'); ui.d.getElementById('menu-rename').click();
  ui.d.getElementById('session-title').value = 'Renamed <img src=x>';
  ui.d.getElementById('rename-form').dispatchEvent(new ui.dom.window.Event('submit', {bubbles: true, cancelable: true}));
  await until(() => !ui.d.getElementById('rename-dialog').open);
  assert.equal(ui.d.getElementById('conversation-title').textContent, heading); assert.equal(ui.d.getElementById('question').value, 'Keep my next question');
  assert.equal(ui.d.activeElement.dataset.sessionId, id);
  assert.equal((await h.request('/api/sessions/' + id)).data.session.pinned, true); assert.equal(ui.d.querySelector('.session-item img'), null);
  const restored = await open(t, h); assert.equal(restored.d.querySelector('.session-item').dataset.sessionId, id);
  assert(restored.d.querySelector('.session-item').textContent.includes('Renamed <img src=x>'));
  restored.d.querySelector('.session-actions-trigger').click(); restored.d.getElementById('menu-pin').click();
  await until(() => !restored.d.getElementById('send').disabled && !restored.d.querySelector('.pinned-mark'));
  assert.equal((await h.request('/api/sessions/' + id)).data.session.pinned, false); assert.equal(h.world.modelCalls.length, 0);
  assert.deepEqual(ui.errors, []); assert.deepEqual(restored.errors, []);
});

test('failed pin writes keep the list and current draft intact and never claim a successful pin', async t => {
  const h = await seededConversations(t);
  const ui = await open(t, h, (path, init) => {if (init.method === 'PATCH' && JSON.parse(init.body).pinned === true) throw new Error('Synthetic offline write');});
  ui.d.getElementById('question').value = 'Retain this draft'; ui.d.querySelector('.session-actions-trigger').click(); ui.d.getElementById('menu-pin').click();
  await until(() => !ui.d.getElementById('send').disabled && ui.d.getElementById('error').textContent.length > 0);
  assert.equal(ui.d.querySelector('.pinned-mark'), null); assert.equal(ui.d.getElementById('question').value, 'Retain this draft');
  assert((await h.request('/api/sessions')).data.sessions.every(s => s.pinned === false));
});

function readerEvent(ui, context, options = {}) {
  const frame=ui.d.getElementById('atlas-reader');
  ui.dom.window.dispatchEvent(new ui.dom.window.MessageEvent('message', {origin: options.origin || 'https://www.yuechuanhou.com',
    source: options.source === undefined ? frame.contentWindow : options.source,
    data:{channel:'atlas-reader',version:1,type:'context',url:'https://www.yuechuanhou.com/embodied-ai-atlas/?page='+encodeURIComponent(context.article_id || 'home'),context,...options.data}}));
}

test('reading modes keep one conversation and frozen drafts while only trusted reader context changes', async t => {
  const h=await seededConversations(t),ui=await open(t,h),d=ui.d;
  const title=d.getElementById('conversation-title').textContent;
  d.querySelector('[data-reading-mode=companion]').click();
  const original={article_id:'sensors-and-estimation',anchor:'vio-visual-inertial-odometry',topic_id:'vio'};
  readerEvent(ui,original);assert(d.getElementById('reading-scope-name').textContent.includes('sensors-and-estimation'));
  d.getElementById('question').value='Keep this draft';d.getElementById('question').dispatchEvent(new ui.dom.window.Event('input',{bubbles:true}));
  readerEvent(ui,{article_id:'data-recipe'});assert(d.getElementById('reading-scope-name').textContent.includes('sensors-and-estimation'));
  assert.equal(d.getElementById('use-current-reading').hidden,false);
  for(const mode of ['sidebar','research','companion'])d.querySelector('[data-reading-mode='+mode+']').click();
  assert.equal(d.getElementById('conversation-title').textContent,title);assert.equal(d.getElementById('question').value,'Keep this draft');
  d.getElementById('hide-orbit').click();assert.equal(ui.dom.window.document.documentElement.dataset.readingMode,'off');
  d.getElementById('reader-launch').click();assert.equal(d.getElementById('question').value,'Keep this draft');
  readerEvent(ui,{article_id:'untrusted'},{origin:'https://evil.example'});
  readerEvent(ui,{article_id:'untrusted'},{source:null});
  assert(!d.getElementById('reading-scope-name').textContent.includes('untrusted'));
  d.getElementById('use-current-reading').click();assert(d.getElementById('reading-scope-name').textContent.includes('data-recipe'));
  assert.equal(h.world.modelCalls.length,0);assert.deepEqual(ui.errors,[]);
});

test('manual conversation switching restores each draft without navigating the reader, with menu actions in all modes', async t => {
  const h=await seededConversations(t),ui=await open(t,h),d=ui.d;
  d.querySelector('[data-reading-mode=sidebar]').click();
  const first=d.querySelector('.session-item[aria-current=true]').dataset.sessionId;
  const other=[...d.querySelectorAll('.session-item')].find(b=>b.dataset.sessionId!==first).dataset.sessionId;
  d.getElementById('question').value='My first draft';d.getElementById('question').dispatchEvent(new ui.dom.window.Event('input',{bubbles:true}));
  const reader=d.getElementById('atlas-reader').src;
  d.getElementById('conversation-picker').click();d.querySelector('.session-item[data-session-id="'+other+'"]').click();
  await until(()=>d.querySelector('.session-item[aria-current=true]')?.dataset.sessionId===other);
  assert.equal(d.getElementById('question').value,'');assert.equal(d.getElementById('atlas-reader').src,reader);
  d.getElementById('conversation-picker').click();d.querySelector('.session-item[data-session-id="'+first+'"]').click();
  await until(()=>d.querySelector('.session-item[aria-current=true]')?.dataset.sessionId===first);
  assert.equal(d.getElementById('question').value,'My first draft');
  for(const mode of ['companion','sidebar','research']) {
    d.querySelector('[data-reading-mode='+mode+']').click();
    if(d.getElementById('toggle-history').getAttribute('aria-expanded')==='false')d.getElementById('conversation-picker').click();
    d.querySelector('.session-actions-trigger[data-session-id="'+other+'"]').click();
    assert.equal(d.getElementById('session-menu').hidden,false);
    assert(d.getElementById('menu-rename'));assert(d.getElementById('menu-pin'));
    d.getElementById('menu-delete').click();assert.equal(d.getElementById('delete-dialog').open,true);
    d.getElementById('delete-cancel').click();assert.equal((await h.request('/api/sessions/'+other)).status,200);
  }
  assert.equal(d.getElementById('question').value,'My first draft');assert.deepEqual(ui.errors,[]);
});

test('request reading context is captured before session creation and survives subsequent reader navigation', async t => {
  const h=await harness();t.after(h.dispose);await h.sync();
  let release;const gate=new Promise(resolve=>release=resolve),bodies=[];
  const ui=await open(t,h,async(path,init)=>{if(path==='/api/sessions'&&init.method==='POST')await gate;if(path.endsWith('/messages'))bodies.push(JSON.parse(init.body));});
  const d=ui.d;d.querySelector('[data-reading-mode=companion]').click();
  readerEvent(ui,{article_id:'sensors-and-estimation',anchor:'vio-visual-inertial-odometry',topic_id:'vio'});
  d.getElementById('question').value='VIO';ui.submit();
  readerEvent(ui,{article_id:'data-recipe'});d.querySelector('[data-reading-mode=research]').click();release();
  await until(()=>!d.getElementById('send').disabled);
  assert.equal(bodies.length,1);assert.equal(bodies[0].reading_context.article_id,'sensors-and-estimation');
  assert.equal(bodies[0].reading_context.topic_id,'vio');assert.deepEqual(ui.errors,[]);
});

test('refresh restores the selected conversation and layout using private IDs without storing draft text in the URL', async t => {
  const h=await seededConversations(t),sessions=(await h.request('/api/sessions')).data.sessions;
  const saved={mode:'sidebar',reader_url:'https://www.yuechuanhou.com/embodied-ai-atlas/?page=sensors-and-estimation',article_id:'sensors-and-estimation',session_id:sessions[1].id};
  const ui=await open(t,h,null,ORIGIN+'/#'+encodeURIComponent(JSON.stringify(saved))),d=ui.d;
  assert.equal(d.getElementById('conversation-title').textContent,sessions[1].title);
  assert.equal(ui.dom.window.document.documentElement.dataset.readingMode,'sidebar');
  d.getElementById('question').value='UnsubmittedPrivateText';d.getElementById('question').dispatchEvent(new ui.dom.window.Event('input'));
  d.querySelector('[data-reading-mode=research]').click();
  const href=ui.dom.window.location.href;assert(!href.includes('UnsubmittedPrivateText'));
  const restored=await open(t,h,null,href);
  assert.equal(restored.d.getElementById('conversation-title').textContent,sessions[1].title);
  assert.equal(restored.dom.window.document.documentElement.dataset.readingMode,'research');
  restored.d.getElementById('return-reading').click();assert.equal(restored.dom.window.document.documentElement.dataset.readingMode,'sidebar');
  assert.deepEqual(ui.errors,[]);assert.deepEqual(restored.errors,[]);
});

test('malformed entry fragments fall back to the research workspace without breaking session access', async t => {
  const h=await harness();t.after(h.dispose);await h.sync();
  for(const value of [null,[],true,'unexpected']) {
    const ui=await open(t,h,null,ORIGIN+'/#'+encodeURIComponent(JSON.stringify(value)));
    assert.equal(ui.dom.window.document.documentElement.dataset.readingMode,'research');
    assert.equal(ui.d.getElementById('send').disabled,false);assert.deepEqual(ui.errors,[]);
  }
});
