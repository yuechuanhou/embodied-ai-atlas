import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readBundle, updateWorker, WORKER_NAME} from '../scripts/update-worker.js';

const account = 'b'.repeat(32), databaseId = '12345678-1234-4234-8234-123456789abc';
const env = {CLOUDFLARE_ACCOUNT_ID: account, CLOUDFLARE_API_TOKEN: 'synthetic-worker-token',
  ATLAS_D1_DATABASE_ID: databaseId, GITHUB_SHA: 'a'.repeat(40)};
const modules = [{name: 'index.js', type: 'application/javascript+module', content: 'export default {};'},
  ...['workbench-client.js', 'site.css', 'mark.svg'].map((name, i) => ({
    name: String(i).repeat(40) + '-' + name, type: 'text/plain', content: 'synthetic module'}))];
function harness({failure = 0, database = {}, change = {}, driftBefore = false, driftAfter = false} = {}) {
  const calls = [], uploads = [], masked = []; let reads = 0;
  const bindings = [{name: 'DB', type: 'd1', id: databaseId},
    {name: 'MODEL_PROVIDER', type: 'plain_text', text: 'anthropic'},
    {name: 'MODEL_NAME', type: 'plain_text', text: 'claude-sonnet-5-5'},
    {name: 'DAILY_CALL_LIMIT', type: 'plain_text', text: '10'},
    {name: 'DAILY_TOKEN_LIMIT', type: 'plain_text', text: '100000'},
    ...['OWNER_EMAIL', 'ACCESS_ISSUER', 'ACCESS_AUD', 'PRIVATE_ORIGIN', 'MODEL_API_KEY', 'GITHUB_READ_TOKEN'].map(name => ({name, type: 'secret_text'}))];
  const fetchImpl = async (url, init) => {
    calls.push({url, init});
    assert.equal(init.redirect, 'error'); assert.equal(init.headers.Authorization, 'Bearer synthetic-worker-token');
    const base = 'https://api.cloudflare.com/client/v4/accounts/' + account;
    assert(url.startsWith(base));
    if (failure) return Response.json({success: false, errors: [{message: 'synthetic private details'}]}, {status: failure});
    let result;
    if (init.method === 'PUT') {
      assert.equal(url, base + '/workers/scripts/' + WORKER_NAME);
      uploads.push(init.body); result = {id: WORKER_NAME};
    } else {
      assert.equal(init.method, 'GET'); assert.equal(init.body, undefined);
      if (url === base + '/d1/database/' + databaseId) result = {uuid: databaseId, name: WORKER_NAME, ...database};
      else if (url.endsWith('/settings')) {
        reads++;
        result = {compatibility_date: '2026-07-30', compatibility_flags: [], bindings: structuredClone(bindings),
          observability: {enabled: false}, logpush: false, ...change};
        if (driftBefore && reads === 2 || driftAfter && uploads.length) result.bindings[1].text = 'disabled';
      } else if (url.endsWith('/subdomain')) result = {enabled: true, previews_enabled: false};
      else if (url.endsWith('/schedules')) result = {schedules: []};
      else assert.fail('unexpected endpoint');
    }
    return Response.json({success: true, result});
  };
  return {calls, uploads, masked, options: {env, fetchImpl, bundle: async () => modules, mask: id => masked.push(id)}};
}

test('update plan validates an existing Worker and never exposes configuration or writes', async () => {
  const h = harness(), result = await updateWorker(h.options);
  assert.equal(result.status, 'existing_worker_update_ready'); assert.equal(result.mutations, false);
  assert.equal(h.uploads.length, 0); assert.deepEqual(h.masked, [databaseId]);
  for (const value of [databaseId, account, env.CLOUDFLARE_API_TOKEN, 'MODEL_API_KEY', 'anthropic']) assert(!JSON.stringify(result).includes(value));
  assert(h.calls.every(c => c.init.method === 'GET'));
});

test('code upload keeps binding types rather than reading or rewriting Secret values', async () => {
  const h = harness(), result = await updateWorker({...h.options, mode: 'deploy', confirmation: WORKER_NAME});
  assert.equal(result.status, 'worker_code_updated_configuration_verified'); assert.equal(h.uploads.length, 1);
  const form = h.uploads[0], metadata = JSON.parse(form.get('metadata'));
  assert.deepEqual(metadata.keep_bindings, ['secret_text', 'plain_text', 'd1']);
  assert.equal(metadata.bindings, undefined); assert.equal(metadata.vars, undefined);
  assert.equal(metadata.main_module, 'index.js'); assert.equal(metadata.observability.enabled, false);
  assert.equal(form.get('index.js').type, 'application/javascript+module');
  assert.equal([...form.keys()].length, 5);
  assert.equal(h.calls.filter(c => c.init.method !== 'GET').length, 1);
  assert(!h.calls.some(c => /query|secrets|access|zones|routes|billing/.test(c.url)));
});

test('wrong confirmation, resource identity or unexpected configuration stops before upload', async () => {
  const noConfirmation = harness();
  await assert.rejects(updateWorker({...noConfirmation.options, mode: 'deploy'}), /explicit_confirmation_required/);
  assert.equal(noConfirmation.calls.length, 0);
  for (const options of [{database: {name: 'another-project'}}, {failure: 404},
    {change: {compatibility_date: '2027-01-01'}}, {change: {logpush: true}},
    {change: {bindings: [{name: 'DB', type: 'd1', id: databaseId}]}},
    {change: {tail_consumers: [{service: 'another-worker'}]}}]) {
    const h = harness(options);
    await assert.rejects(updateWorker({...h.options, mode: 'deploy', confirmation: WORKER_NAME}));
    assert.equal(h.uploads.length, 0); assert(h.calls.every(c => c.init.method === 'GET'));
  }
});

test('configuration drift and uncertain upload failures never trigger rollback, recreation or retry', async () => {
  const before = harness({driftBefore: true});
  await assert.rejects(updateWorker({...before.options, mode: 'deploy', confirmation: WORKER_NAME}), /changed_before_upload/);
  assert.equal(before.uploads.length, 0);
  const after = harness({driftAfter: true});
  await assert.rejects(updateWorker({...after.options, mode: 'deploy', confirmation: WORKER_NAME}), /configuration_changed_review_before_retry/);
  assert.equal(after.uploads.length, 1);
  const uncertain = harness(); let puts = 0;
  await assert.rejects(updateWorker({...uncertain.options, mode: 'deploy', confirmation: WORKER_NAME,
    fetchImpl: async (url, init) => {if (init.method === 'PUT') {puts++; throw Error('synthetic private token');} return uncertain.options.fetchImpl(url, init);}}),
  /^Error: deployment_outcome_unknown_review_before_retry$/);
  assert.equal(puts, 1);
});

test('update validates the actual dry-run modules, excluding stale assets and source maps', async () => {
  const files = await readBundle();
  assert.equal(files.length, 4); assert.equal(files[0].name, 'index.js');
  assert(files.every(f => !f.name.endsWith('.map') && f.name !== 'README.md'));
  assert.equal(files.filter(f => f.name.endsWith('-workbench-client.js')).length, 1);
});
