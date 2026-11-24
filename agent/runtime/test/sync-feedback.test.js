import {test} from 'node:test';
import assert from 'node:assert/strict';
import {harness} from './helpers.js';

test('manual sync distinguishes updated, already current and unpublished main without a model call', async t => {
  const h = await harness(); t.after(h.dispose);
  const first = await h.sync(); assert.equal(first.status, 200); assert.equal(first.data.outcome, 'updated');
  assert.equal(first.data.index_revision, h.world.main); assert.equal(first.data.articles, h.world.snapshot.articles.length);
  assert.equal(first.data.topics, h.world.snapshot.topics.length); assert.equal(first.headers.get('cache-control'), 'private, no-store');
  assert.equal((await h.sync()).data.outcome, 'current');
  h.world.main = 'b'.repeat(40);
  const pending = await h.sync(); assert.equal(pending.status, 200); assert.equal(pending.data.outcome, 'publishing');
  assert.equal(pending.data.index_revision, 'a'.repeat(40));
  h.world.snapshot.revision = h.world.main;
  assert.equal((await h.sync()).data.outcome, 'updated'); assert.equal(h.world.modelCalls.length, 0);
});

test('another active sync lease is not reported as success and does not expose its lock token', async t => {
  const h = await harness(); t.after(h.dispose); await h.sync();
  const secret = 'synthetic-private-lock';
  await h.db.prepare('UPDATE runtime_sync SET lock_token=?,lock_until=? WHERE id=1').bind(secret, Math.floor(Date.now()/1000)+120).run();
  const result = await h.sync(); assert.equal(result.status, 409); assert.equal(result.data.error, 'knowledge_sync_in_progress');
  assert(!JSON.stringify(result.data).includes(secret)); assert.equal(result.data.outcome, undefined);
  assert.equal((await h.db.prepare('SELECT lock_token FROM runtime_sync WHERE id=1').first()).lock_token, secret);
});

test('sync failure exposes a safe error code, preserves the last snapshot and keeps the existing Owner boundary', async t => {
  const h = await harness(); t.after(h.dispose); await h.sync(); h.world.failed = true;
  const failed = await h.sync(); assert.equal(failed.status, 503); assert.equal(failed.data.error, 'upstream_unavailable');
  assert.equal(failed.data.index_revision, 'a'.repeat(40)); assert.equal(failed.data.outcome, undefined);
  assert.equal((await h.request('/api/sync', {method: 'POST', body: {}, jwtOverride: null})).status, 401);
  assert.equal((await h.request('/api/sync', {method: 'POST', body: {}, headers: {Origin: 'https://foreign.example'}})).status, 403);
  assert.equal(h.world.modelCalls.length, 0);
});
