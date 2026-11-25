import {test} from 'node:test';
import assert from 'node:assert/strict';
import {bootstrap, DATABASE_NAME, migrationConfig} from '../scripts/bootstrap-d1.js';

const account = 'a'.repeat(32), databaseId = '12345678-1234-4234-8234-123456789abc';
const env = {CLOUDFLARE_ACCOUNT_ID: account, CLOUDFLARE_API_TOKEN: 'synthetic-test-token'};
function harness({existing = false, incomplete = false, failure = false, applied = ['0001_initial.sql', '0002_private_runtime.sql', '0003_proposal_validation.sql']} = {}) {
  const calls = [], migrations = [], masked = [];
  const fetchImpl = async (url, init) => {
    calls.push({url, init});
    assert(url.startsWith('https://api.cloudflare.com/client/v4/accounts/' + account + '/d1/database'));
    assert.equal(init.headers.Authorization, 'Bearer synthetic-test-token'); assert.equal(init.redirect, 'error');
    if (failure) return Response.json({message: 'sensitive upstream details'}, {status: 403});
    let result;
    if (init.method === 'GET') return Response.json({success: true, result: existing ? [{name: DATABASE_NAME, uuid: databaseId}] : [], result_info: {total_count: existing ? 1 : 0}});
    const body = JSON.parse(init.body);
    if (url.endsWith('/database')) {assert.deepEqual(body, {name: DATABASE_NAME}); result = {name: DATABASE_NAME, uuid: databaseId};}
    else if (body.sql.includes('sqlite_master')) result = [{success: true, results: (incomplete ? [] : ['d1_migrations', 'sessions', 'messages', 'approvals', 'knowledge_snapshots', 'runtime_requests', 'runtime_sync']).map(name => ({name}))}];
    else {assert.equal(body.sql, 'SELECT name FROM d1_migrations ORDER BY name'); result = [{success: true, results: applied.map(name => ({name}))}];}
    return Response.json({success: true, result});
  };
  return {calls, migrations, masked, options: {env, fetchImpl, migrate: async id => migrations.push(id), mask: id => masked.push(id)}};
}

test('bootstrap plan is read-only and emits no account, token or database ID', async () => {
  const h = harness(), result = await bootstrap(h.options);
  assert.equal(result.status, 'would_create_and_initialize'); assert.equal(result.mutations, false);
  assert.equal(h.calls.length, 1); assert.equal(h.calls[0].init.method, 'GET'); assert.equal(h.migrations.length, 0);
  assert(!JSON.stringify(result).includes(account)); assert(!JSON.stringify(result).includes(env.CLOUDFLARE_API_TOKEN));
});

test('apply needs exact confirmation and valid private configuration before any network request', async () => {
  for (const change of [{mode: 'apply'}, {env: {...env, CLOUDFLARE_ACCOUNT_ID: '../other'}}, {env: {...env, CLOUDFLARE_API_TOKEN: ''}}, {env: {...env, ATLAS_D1_DATABASE_ID: 'wrong'}}]) {
    const h = harness(); await assert.rejects(bootstrap({...h.options, ...change})); assert.equal(h.calls.length, 0);
  }
});

test('apply creates only the named D1, runs tracked migrations and verifies the resulting schema', async () => {
  const h = harness(), result = await bootstrap({...h.options, mode: 'apply', confirmation: DATABASE_NAME});
  assert.equal(result.status, 'created_and_initialized'); assert.deepEqual(h.migrations, [databaseId]); assert.deepEqual(h.masked, [databaseId]);
  assert.equal(h.calls.filter(c => c.url.endsWith('/database') && c.init.method === 'POST').length, 1);
  assert(!h.calls.some(c => /workers|access|zones|billing/.test(c.url))); assert(!JSON.stringify(result).includes(databaseId));
  const config = migrationConfig(databaseId); assert.equal(config.workers_dev, false); assert.equal(config.preview_urls, false);
  assert.equal(config.main, undefined); assert.equal(config.vars, undefined);
});

test('a same-name existing database cannot be taken over without its explicitly confirmed ID', async () => {
  const h = harness({existing: true});
  assert.equal((await bootstrap(h.options)).status, 'existing_database_needs_owner_verification');
  await assert.rejects(bootstrap({...h.options, mode: 'apply', confirmation: DATABASE_NAME}), /existing_database_requires_explicit_id/);
  await assert.rejects(bootstrap({...h.options, env: {...env, ATLAS_D1_DATABASE_ID: '87654321-4321-4321-8321-cba987654321'}}), /database_id_mismatch/);
  assert.equal(h.migrations.length, 0); assert(h.calls.every(c => c.init.method === 'GET'));
});

test('verified reruns inspect migration metadata and never alter an existing database', async () => {
  const h = harness({existing: true}), options = {...h.options, env: {...env, ATLAS_D1_DATABASE_ID: databaseId}};
  for (const mode of ['plan', 'apply']) {
    const result = await bootstrap({...options, mode, confirmation: DATABASE_NAME});
    assert.equal(result.status, 'existing_schema_verified'); assert.equal(result.mutations, false);
  }
  assert.equal(h.migrations.length, 0);
  assert(h.calls.filter(c => c.init.method === 'POST').every(c => JSON.parse(c.init.body).sql.startsWith('SELECT ')));
});

test('existing two-migration databases remain valid without applying the unused private validator', async () => {
  const h = harness({existing: true, applied: ['0001_initial.sql', '0002_private_runtime.sql']});
  const result = await bootstrap({...h.options, env: {...env, ATLAS_D1_DATABASE_ID: databaseId}});
  assert.equal(result.status, 'existing_schema_verified'); assert.equal(result.migration_count, 2);
  assert.equal(result.mutations, false); assert.deepEqual(h.migrations, []);
  for (const applied of [['0001_initial.sql'], ['0001_initial.sql', '0002_private_runtime.sql', 'unknown.sql']]) {
    const invalid = harness({existing: true, applied});
    await assert.rejects(bootstrap({...invalid.options, env: {...env, ATLAS_D1_DATABASE_ID: databaseId}}), /migration_history_mismatch/);
    assert.deepEqual(invalid.migrations, []);
  }
});

test('upstream failures and partial initialization fail closed without retry or deletion', async () => {
  const failed = harness({failure: true}); await assert.rejects(bootstrap(failed.options), /^Error: cloudflare_http_403$/); assert.equal(failed.calls.length, 1);
  const partial = harness({existing: true, incomplete: true});
  await assert.rejects(bootstrap({...partial.options, env: {...env, ATLAS_D1_DATABASE_ID: databaseId}}), /database_not_initialized/);
  assert.equal(partial.migrations.length, 0); assert(!partial.calls.some(c => c.init.method === 'DELETE'));
  const lost = harness(); await assert.rejects(bootstrap({...lost.options, env: {...env, ATLAS_D1_DATABASE_ID: databaseId}}), /expected_database_not_found/);
  assert.equal(lost.calls.length, 1);
});
