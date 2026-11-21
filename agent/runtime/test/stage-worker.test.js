import {test} from 'node:test';
import assert from 'node:assert/strict';
import {stageWorker, stagingConfig, WORKER_NAME} from '../scripts/stage-worker.js';

const account = 'b'.repeat(32), databaseId = '12345678-1234-4234-8234-123456789abc';
const env = {CLOUDFLARE_ACCOUNT_ID: account, CLOUDFLARE_API_TOKEN: 'synthetic-worker-token', ATLAS_D1_DATABASE_ID: databaseId};
function harness({existing = false, database = {}, settings = {}, subdomain = {}, schedules = [], failure = 0, deployFailure = false} = {}) {
  const calls = [], deployments = [], masked = [];
  let created = existing;
  const fetchImpl = async (url, init) => {
    calls.push({url, init});
    assert.equal(init.method, 'GET'); assert.equal(init.redirect, 'error');
    assert.equal(init.body, undefined); assert.equal(init.headers.Authorization, 'Bearer synthetic-worker-token');
    const base = 'https://api.cloudflare.com/client/v4/accounts/' + account;
    assert(url.startsWith(base));
    if (failure) return Response.json({message: 'private upstream data'}, {status: failure});
    let result;
    if (url === base + '/d1/database/' + databaseId) result = {uuid: databaseId, name: WORKER_NAME, ...database};
    else if (url === base + '/workers/scripts/' + WORKER_NAME + '/settings') {
      if (!created) return Response.json({success: false}, {status: 404});
      result = {bindings: [{name: 'DB', type: 'd1', id: databaseId},
        {name: 'MODEL_PROVIDER', type: 'plain_text', text: 'disabled'}], ...settings};
    } else if (url === base + '/workers/scripts/' + WORKER_NAME + '/subdomain') result = {enabled: false, previews_enabled: false, ...subdomain};
    else if (url === base + '/workers/scripts/' + WORKER_NAME + '/schedules') result = {schedules};
    else assert.fail('unexpected endpoint');
    return Response.json({success: true, result});
  };
  return {calls, deployments, masked, options: {env, fetchImpl, mask: value => masked.push(value), deploy: async id => {
    deployments.push(id); if (deployFailure) throw Error('sensitive deployment details'); created = true;
  }}};
}

test('worker plan only reads fixed resource metadata and never deploys or exposes private IDs', async () => {
  const h = harness(), result = await stageWorker(h.options);
  assert.deepEqual(result, {worker: WORKER_NAME, status: 'would_create_closed_worker', mutations: false});
  assert.equal(h.calls.length, 2); assert.equal(h.deployments.length, 0); assert.deepEqual(h.masked, [databaseId]);
  for (const value of [account, databaseId, env.CLOUDFLARE_API_TOKEN]) assert(!JSON.stringify(result).includes(value));
});

test('worker staging rejects invalid credentials, missing database and wrong confirmation before network use', async () => {
  for (const change of [{mode: 'activate'}, {mode: 'stage'}, {mode: 'stage', confirmation: WORKER_NAME + ' '},
    {env: {...env, CLOUDFLARE_ACCOUNT_ID: '../other'}}, {env: {...env, CLOUDFLARE_API_TOKEN: ''}},
    {env: {...env, ATLAS_D1_DATABASE_ID: ''}}, {env: {...env, ATLAS_D1_DATABASE_ID: '00000000-0000-0000-0000-000000000000'}}]) {
    const h = harness(); await assert.rejects(stageWorker({...h.options, ...change}));
    assert.equal(h.calls.length, 0); assert.equal(h.deployments.length, 0);
  }
});

test('worker staging checks database identity and does not read or migrate its contents', async () => {
  for (const database of [{name: 'another-project'}, {uuid: '87654321-4321-4321-8321-cba987654321'}]) {
    const h = harness({database}); await assert.rejects(stageWorker({...h.options, mode: 'stage', confirmation: WORKER_NAME}), /database_identity_mismatch/);
    assert.equal(h.calls.length, 1); assert.equal(h.deployments.length, 0);
  }
});

test('first-time stage creates one closed Worker then verifies bindings, entry points and schedules', async () => {
  const h = harness(), result = await stageWorker({...h.options, mode: 'stage', confirmation: WORKER_NAME});
  assert.deepEqual(h.deployments, [databaseId]); assert.equal(result.status, 'created_closed_worker');
  assert.equal(result.mutations, true); assert.equal(result.workers_dev, false); assert.equal(result.preview_urls, false);
  assert.equal(result.scheduled_tasks, false); assert.equal(result.access_binding, 'pending_owner_configuration');
  assert(!h.calls.some(c => /query|access|zones|billing/.test(c.url)));
});

test('an existing Worker can be inspected but can never be overwritten by stage', async () => {
  const h = harness({existing: true});
  assert.equal((await stageWorker(h.options)).status, 'existing_closed_worker_verified');
  await assert.rejects(stageWorker({...h.options, mode: 'stage', confirmation: WORKER_NAME}), /worker_already_exists/);
  assert.equal(h.deployments.length, 0);
});

test('inspection rejects active entry points, schedules, extra bindings, models and logs', async () => {
  for (const change of [{subdomain: {enabled: true}}, {subdomain: {previews_enabled: true}},
    {subdomain: {enabled: undefined}}, {schedules: [{cron: '* * * * *'}]},
    {settings: {bindings: [{name: 'DB', type: 'd1', id: databaseId}]}},
    {settings: {bindings: [{name: 'DB', type: 'd1', id: databaseId}, {name: 'MODEL_PROVIDER', type: 'plain_text', text: 'openai'}]}},
    {settings: {logpush: true}}, {settings: {observability: {enabled: true}}}]) {
    const h = harness({existing: true, ...change}); await assert.rejects(stageWorker(h.options)); assert.equal(h.deployments.length, 0);
  }
});

test('network and uncertain deployment failures stop without retries, deletion or secret-bearing results', async () => {
  const denied = harness({failure: 403}); await assert.rejects(stageWorker(denied.options), /^Error: cloudflare_http_403$/);
  assert.equal(denied.calls.length, 1); assert.equal(denied.deployments.length, 0);
  const broken = harness(); await assert.rejects(stageWorker({...broken.options, fetchImpl: async () => {throw Error('private network details');}}), /^Error: cloudflare_request_incomplete$/);
  const partial = harness({deployFailure: true}); await assert.rejects(stageWorker({...partial.options, mode: 'stage', confirmation: WORKER_NAME}));
  assert.equal(partial.deployments.length, 1); assert.equal(partial.calls.length, 2);
  const unsafe = harness({subdomain: {previews_enabled: true}});
  await assert.rejects(stageWorker({...unsafe.options, mode: 'stage', confirmation: WORKER_NAME}), /worker_entrypoint_enabled/);
  assert.equal(unsafe.deployments.length, 1);
  await assert.rejects(stageWorker({...unsafe.options, mode: 'stage', confirmation: WORKER_NAME}), /worker_already_exists/);
  assert.equal(unsafe.deployments.length, 1); assert(unsafe.calls.every(c => c.init.method === 'GET'));
});

test('generated staging config has no entry points, schedules, identities, models or other resources', () => {
  const config = stagingConfig(databaseId);
  assert.equal(config.name, WORKER_NAME); assert.equal(config.workers_dev, false); assert.equal(config.preview_urls, false);
  assert.deepEqual(config.routes, []); assert.deepEqual(config.triggers, {crons: []});
  assert.deepEqual(config.vars, {MODEL_PROVIDER: 'disabled'}); assert.deepEqual(config.observability, {enabled: false});
  assert.equal(config.d1_databases.length, 1); assert.equal(config.d1_databases[0].database_id, databaseId);
  assert.equal(config.account_id, undefined); assert.equal(config.assets, undefined); assert.equal(config.services, undefined);
  assert.throws(() => stagingConfig('00000000-0000-0000-0000-000000000000'));
});
