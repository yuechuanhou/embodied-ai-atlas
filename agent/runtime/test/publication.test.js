import {test} from 'node:test';
import assert from 'node:assert/strict';
import {publicationFixture, config} from './publication-helpers.js';

test('review is private and a confirmed exact projection creates one public append PR without private metadata or model calls', async t => {
  const h = await publicationFixture(t), {writes, reads} = h.world.publication;
  await h.db.prepare('DROP TABLE proposal_validations').run();
  assert.equal(writes.length, 0); assert.equal(h.preview.status, 'private_review');
  assert.equal((await h.db.prepare('SELECT COUNT(*) n FROM approvals').first()).n, 0);
  const result = await h.start(); assert.equal(result.status, 200, JSON.stringify(result.data));
  assert.equal(result.data.status, 'pending', JSON.stringify({reads: reads.map(x => ({path:x.path,type:x.body_type,cls:x.body_class})), writes: writes.map(x => x.path), phase: result.data.phase, error: result.data.error_code})); assert.equal(result.data.pr.number, 41); assert.equal(result.data.merge_available, false);
  assert.deepEqual(writes.map(x => x.path), ['/git/refs', '/contents/content/' + h.article.file, '/pulls']);
  assert.equal(Buffer.from(writes[1].body.content, 'base64').toString(), h.preview.preview.file.after_utf8);
  assert.equal(writes[1].body.message, h.preview.preview.commit_message);
  const publicText = JSON.stringify(writes.map(x => x.path.includes('/contents/') ? {...x, body: {...x.body, content: Buffer.from(x.body.content, 'base64').toString()}} : x));
  for (const value of [h.candidate, h.sessionId, h.owner, 'Synthetic private title', 'Synthetic private draft', 'Private source record', 'Synthetic private evidence scope', 'Private model reason', 'Private editorial notes', 'synthetic-model-secret']) assert(!publicText.includes(value), value);
  assert.equal(h.world.modelCalls.length, 1);
  assert.deepEqual(await new Response(reads.find(x => x.body)?.body).json(), {repository_ids: [Number(config.repository_id)], permissions: {contents: 'write', pull_requests: 'write', actions: 'read'}});
  const approval = await h.db.prepare('SELECT * FROM approvals').first(); assert.equal(approval.release_scope, 'open_pr');
  assert.equal(approval.expires_at - approval.created_at, 900);
  await h.start(); await h.read(); assert.equal(writes.length, 3);
  assert.equal((await h.db.prepare('SELECT COUNT(*) n FROM jobs').first()).n, 1);
});

test('explicit technical, editorial and disclosure confirmation plus exact digest and Owner guards precede every public write', async t => {
  const h = await publicationFixture(t);
  for (const body of [{...h.body, technical_reviewed: false}, {...h.body, editorial_reviewed: false}, {...h.body, public_scope_confirmed: false},
    {...h.body, public_digest: '0'.repeat(64)}, {...h.body, patch_digest: '0'.repeat(64)}, {...h.body, owner_id: 'forged'}, {...h.body, after_utf8: 'unreviewed'}])
    assert([400,409].includes((await h.start(body)).status));
  assert.equal((await h.start(h.body, {jwtOverride: null})).status, 401);
  assert.equal((await h.start(h.body, {headers: {'Origin': 'https://evil.test'}})).status, 403);
  assert.equal((await h.start(h.body, {headers: {'X-Atlas-Request': ''}})).status, 403);
  assert.equal(h.world.publication.writes.length, 0);
  assert.equal((await h.db.prepare('SELECT COUNT(*) n FROM approvals').first()).n, 0);
});

test('default-off publication still permits private preview and requires no new validation table', async t => {
  const h = await publicationFixture(t, {PUBLICATION_CONFIG: JSON.stringify({enabled: false})});
  await h.db.prepare('DROP TABLE proposal_validations').run();
  assert.equal((await h.read()).data.status, 'not_configured');
  assert.equal((await h.start()).data.error, 'publication_not_configured');
  assert.equal(h.world.publication.writes.length, 0); assert.equal(h.world.modelCalls.length, 1);
});

test('candidate, latest proposal, live main and contract changes block stale public confirmations', async t => {
  const h = await publicationFixture(t);
  await h.db.prepare('UPDATE knowledge_candidates SET version=version+1 WHERE id=?').bind(h.candidate).run();
  assert.equal((await h.start()).data.error, 'publication_basis_changed');
  assert.equal((await h.read()).data.preview, null);
  assert.equal(h.world.publication.writes.length, 0);
  const main = await publicationFixture(t); main.world.main = 'f'.repeat(40);
  assert.equal((await main.start()).data.error, 'publication_basis_changed'); assert.equal(main.world.publication.writes.length, 0);
});

test('exact GitHub Actions run and all three successful jobs are required; skipped, forged or stale checks never pass', async t => {
  const h = await publicationFixture(t); await h.start(); const p = h.world.publication;
  p.checks = 'success'; assert.equal((await h.read()).data.status, 'passed');
  p.job = {conclusion: 'skipped'}; assert.equal((await h.read()).data.status, 'failed');
  p.job = {head_sha: '0'.repeat(40)}; assert.equal((await h.read()).data.status, 'failed'); p.job = {};
  p.run = {path: '.github/workflows/untrusted.yml'}; assert.equal((await h.read()).data.status, 'pending'); p.run = {};
  p.run = {pull_requests: [{number: 99}]}; assert.equal((await h.read()).data.status, 'pending'); p.run = {};
  p.checks = 'failed'; assert.equal((await h.read()).data.status, 'failed');
  p.checks = 'success'; h.world.main = 'e'.repeat(40); assert.equal((await h.read()).data.status, 'base_changed');
  assert.equal(p.writes.length, 3); assert.equal(h.world.modelCalls.length, 1);
});

test('a lost PR response is reconciled read-only to the same exact public PR, without replaying any write', async t => {
  const h = await publicationFixture(t, {}, {loseAt: '/pulls'});
  const result = await h.start(); assert.equal(result.status, 200); assert.equal(result.data.pr.number, 41);
  await h.read(); await h.start(); assert.equal(h.world.publication.writes.length, 3);
  assert.equal((await h.db.prepare('SELECT COUNT(*) n FROM approvals').first()).n, 1);
});

test('a lost commit response adopts the exact head and requires explicit resume within the original approval', async t => {
  const h = await publicationFixture(t, {}, {loseAt: '/contents/content/sensors-and-estimation.md'});
  // The canonical fixture filename may differ; select it from the reviewed preview.
  h.world.publication.loseAt = '/contents/' + h.preview.preview.file.path;
  const result = await h.start(); assert.equal(result.status, 200); assert.equal(result.data.phase, 'commit_created');
  assert.equal(result.data.resume_available, true); assert.equal(h.world.publication.writes.length, 2);
  await h.start(); assert.equal(h.world.publication.writes.length, 2);
  h.world.publication.loseAt = null;
  const resumed = await h.start({...h.body, resume: true}); assert.equal(resumed.data.pr.number, 41);
  assert.equal(h.world.publication.writes.length, 3); assert.equal(h.world.modelCalls.length, 1);
});

test('absence after a rejected write remains unknown and cannot be blindly retried', async t => {
  const h = await publicationFixture(t, {}, {rejectAt: '/git/refs'});
  const result = await h.start(); assert.equal(result.data.status, 'outcome_unknown'); assert.equal(result.data.resume_available, false);
  await h.read(); assert.equal((await h.start({...h.body, resume: true})).data.error, 'publication_reconcile_required');
  assert.equal(h.world.publication.writes.length, 1);
  assert(!JSON.stringify(result.data).includes('private upstream diagnostic'));
});

test('approval revocation prevents continuation and concurrent confirmations share one durable task', async t => {
  const h = await publicationFixture(t, {}, {loseAt: '/git/refs'}); await h.start();
  await h.db.prepare('UPDATE approvals SET revoked_at=created_at').run();
  assert.equal((await h.start({...h.body, resume: true})).data.error_code, 'publication_approval_expired');
  assert.equal(h.world.publication.writes.length, 1);
  const concurrent = await publicationFixture(t);
  const results = await Promise.all([concurrent.start(), concurrent.start()]);
  assert(results.every(r => [200,409].includes(r.status))); assert.equal(concurrent.world.publication.writes.length, 3);
  assert.equal((await concurrent.db.prepare('SELECT COUNT(*) n FROM jobs').first()).n, 1);
});

test('configuration and actual GitHub repository identity cannot redirect the publisher to another resource', async t => {
  const malformed = await publicationFixture(t, {PUBLICATION_CONFIG: JSON.stringify({...config, repository_id: '1001'})});
  assert.equal((await malformed.start()).data.error, 'publication_configuration_invalid');
  assert.equal(malformed.world.publication.writes.length, 0);
  const mismatch = await publicationFixture(t, {}, {repository: {private: true}});
  assert.equal((await mismatch.start()).data.error_code, 'publication_repository_mismatch');
  assert.equal(mismatch.world.publication.writes.length, 0);
});

test('a failed durable task transaction leaves no approval or temporary request and makes no public write', async t => {
  const h = await publicationFixture(t);
  await h.db.prepare("CREATE TRIGGER reject_publication_job BEFORE INSERT ON jobs BEGIN SELECT RAISE(ABORT,'synthetic rollback'); END").run();
  const before = await h.db.prepare('SELECT COUNT(*) n FROM runtime_requests').first();
  assert.equal((await h.start()).data.error, 'publication_task_not_created');
  assert.equal((await h.db.prepare('SELECT COUNT(*) n FROM approvals').first()).n, 0);
  assert.equal((await h.db.prepare('SELECT COUNT(*) n FROM runtime_commit_guards').first()).n, 0);
  assert.equal((await h.db.prepare('SELECT COUNT(*) n FROM runtime_requests').first()).n, before.n);
  assert.equal(h.world.publication.writes.length, 0);
});

test('a mutated public head is rejected before PR creation or a successful CI claim', async t => {
  const h = await publicationFixture(t, {}, {commit: {parents: [{sha: 'f'.repeat(40)}]}});
  const result = await h.start();
  assert.equal(result.data.status, 'publication_head_mismatch'); assert.equal(result.data.pr, null);
  assert.equal(h.world.publication.writes.length, 2);
  assert(!h.world.publication.writes.some(x => x.path === '/pulls'));
});

test('a main update during execution stops subsequent public mutations and never rebases or merges', async t => {
  const h = await publicationFixture(t, {}, {changeMainAt: '/git/refs'});
  const result = await h.start(); assert.equal(result.data.error_code, 'publication_basis_changed');
  assert.equal(h.world.publication.writes.length, 1);
  assert(!h.world.publication.writes.some(x => /merge|dispatch|\/main/.test(x.path)));
});
