import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {inspectStorage, DATABASE_NAME, READS} from '../scripts/inspect-storage.js';

const account = 'a'.repeat(32), databaseId = '12345678-1234-4234-8234-123456789abc';
const env = {CLOUDFLARE_ACCOUNT_ID: account, CLOUDFLARE_API_TOKEN: 'synthetic-private-token', ATLAS_D1_DATABASE_ID: databaseId};
const tableNames = ['sessions', 'messages', 'source_records', 'knowledge_candidates', 'candidate_sources',
  'change_proposals', 'proposal_versions', 'proposal_candidates', 'approvals', 'jobs', 'knowledge_snapshots',
  'runtime_requests', 'runtime_commit_guards', 'usage_daily', 'runtime_sync', 'd1_migrations', 'proposal_validations'];
function harness(change = () => {}) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({url, init});
    const base = 'https://api.cloudflare.com/client/v4/accounts/' + account + '/d1/database/' + databaseId;
    assert.equal(init.redirect, 'error'); assert.equal(init.headers.Authorization, 'Bearer ' + env.CLOUDFLARE_API_TOKEN);
    let result;
    if (url === base) {assert.equal(init.method, 'GET'); result = {uuid: databaseId, name: DATABASE_NAME, version: 'production'};}
    else if (url === base + '/time_travel/bookmark') {assert.equal(init.method, 'GET'); result = {bookmark: 'synthetic-private-bookmark'};}
    else {
      assert.equal(url, base + '/query'); assert.equal(init.method, 'POST');
      const body = JSON.parse(init.body); assert.deepEqual(Object.keys(body).sort(), ['params','sql']); assert.deepEqual(body.params, []);
      assert(Object.values(READS).includes(body.sql));
      const rows = body.sql === READS.schema ? [...tableNames.map(name => ({name, type: 'table'})),
        ...['immutable_proposal_version','immutable_approval','immutable_validation_binding'].map(name => ({name, type: 'trigger'}))] :
        body.sql === READS.migrations ? [{name: '0001_initial.sql'},{name: '0002_private_runtime.sql'},{name: '0003_proposal_validation.sql'}] :
        body.sql === READS.foreignKeys ? [] : [{quick_check: 'ok'}];
      result = [{success: true, results: rows}];
    }
    const response = {success: true, result}; change(response, url, init);
    return Response.json(response);
  };
  return {calls, options: {env, fetchImpl}};
}

test('storage inspection issues only fixed reads for the exact existing database, without exporting data or claiming recovery', async () => {
  const h = harness(), result = await inspectStorage(h.options);
  assert.equal(h.calls.length, 6); assert.equal(result.mutations, false); assert.equal(result.migration_count, 3);
  assert.equal(result.status, 'storage_read_checks_passed'); assert.equal(result.required_schema_objects, 'present');
  assert.equal(result.optional_private_validator_schema, 'present');
  assert.equal(result.retention_window, 'not_inspected'); assert.equal(result.restore_drill, 'pending');
  const output = JSON.stringify(result);
  for (const secret of [account, databaseId, env.CLOUDFLARE_API_TOKEN, 'synthetic-private-bookmark']) assert(!output.includes(secret));
  assert(!h.calls.some(c => /restore|export|workers|access|billing/.test(c.url)));
  assert(h.calls.filter(c => c.init.method === 'POST').every(c => /^(SELECT |PRAGMA (foreign_key_check|quick_check)$)/.test(JSON.parse(c.init.body).sql)));
});

test('the active single-repository route accepts the original two migrations without optional validator objects', async () => {
  const h = harness((response, url, init) => {
    if (!url.endsWith('/query')) return;
    const sql = JSON.parse(init.body).sql;
    if (sql === READS.migrations) response.result[0].results.pop();
    if (sql === READS.schema) response.result[0].results = response.result[0].results.filter(r =>
      !['proposal_validations', 'immutable_validation_binding'].includes(r.name));
  });
  const result = await inspectStorage(h.options);
  assert.equal(result.status, 'storage_read_checks_passed'); assert.equal(result.migration_count, 2);
  assert.equal(result.optional_private_validator_schema, 'not_applied'); assert.equal(h.calls.length, 6);
});

test('an optional migration must be complete and recorded; required, duplicate and unknown history cannot pass', async () => {
  for (const [sql, mutate, code] of [
    [READS.migrations, rows => rows.slice(0, 2), 'storage_optional_schema_mismatch'],
    [READS.schema, rows => rows.filter(r => r.name !== 'immutable_validation_binding'), 'storage_schema_incomplete'],
    [READS.migrations, rows => rows.slice(1), 'migration_history_mismatch'],
    [READS.migrations, rows => [...rows, rows[0]], 'migration_history_mismatch'],
    [READS.migrations, () => [{name: null}], 'migration_history_mismatch'],
  ]) {
    const h = harness((response, url, init) => {
      if (url.endsWith('/query') && JSON.parse(init.body).sql === sql) response.result[0].results = mutate(response.result[0].results);
    });
    await assert.rejects(inspectStorage(h.options), new RegExp('^Error: ' + code + '$'));
    assert(!h.calls.some(c => c.url.includes('bookmark')));
  }
});

test('invalid configuration, including placeholder database IDs, is rejected before any request', async () => {
  for (const update of [{CLOUDFLARE_ACCOUNT_ID: '../other'}, {CLOUDFLARE_API_TOKEN: ''}, {ATLAS_D1_DATABASE_ID: ''},
    {ATLAS_D1_DATABASE_ID: '00000000-0000-0000-0000-000000000000'}]) {
    const h = harness(); await assert.rejects(inspectStorage({...h.options, env: {...env, ...update}})); assert.equal(h.calls.length, 0);
  }
});

test('another database or an unverified storage backend stops inspection before SQL', async () => {
  for (const update of [{name: 'other'}, {uuid: '87654321-4321-4321-8321-cba987654321'}, {version: 'alpha'}, {version: undefined}]) {
    const h = harness((response, url) => {if (!url.endsWith('/query')) Object.assign(response.result, update);});
    await assert.rejects(inspectStorage(h.options), /database_identity_mismatch|time_travel_backend_unverified/);
    assert.equal(h.calls.length, 1);
  }
});

test('missing immutable guards, migration drift, damaged relations and failed integrity checks fail closed', async () => {
  const cases = [
    [READS.schema, rows => rows.filter(r => r.name !== 'immutable_approval'), 'storage_schema_incomplete'],
    [READS.schema, rows => rows.filter(r => r.name !== 'runtime_commit_guards'), 'storage_schema_incomplete'],
    [READS.migrations, rows => [...rows, {name: 'unknown.sql'}], 'migration_history_mismatch'],
    [READS.foreignKeys, () => [{table: 'private-table', rowid: 987654}], 'storage_foreign_key_check_failed'],
    [READS.integrity, () => [{quick_check: 'private upstream corruption detail'}], 'storage_integrity_check_failed'],
  ];
  for (const [sql, mutate, error] of cases) {
    const h = harness((response, url, init) => {if (url.endsWith('/query') && JSON.parse(init.body).sql === sql) response.result[0].results = mutate(response.result[0].results);});
    await assert.rejects(inspectStorage(h.options), new RegExp('^Error: ' + error + '$'));
    assert(!h.calls.some(c => c.url.includes('bookmark')));
  }
});

test('a missing bookmark or malformed query result cannot be reported as a successful inspection', async () => {
  for (const change of [
    (response, url) => {if (url.endsWith('/time_travel/bookmark')) response.result = {};},
    (response, url) => {if (url.endsWith('/query')) response.result[0].success = false;},
    (response, url) => {if (url.endsWith('/query')) response.result.push({success: true, results: []});},
  ]) await assert.rejects(inspectStorage(harness(change).options), /storage_bookmark_unavailable|invalid_storage_query_response/);
});

test('provider errors are sanitized, bounded and never retried', async () => {
  for (const [fetchImpl, error] of [
    [async () => {throw new Error('sensitive provider detail');}, 'storage_read_incomplete'],
    [async () => new Response('sensitive provider detail', {status: 403}), 'cloudflare_http_403'],
    [async () => new Response('not JSON'), 'invalid_cloudflare_response'],
    [async () => Response.json({success: false, errors: [{message: 'sensitive detail'}]}), 'invalid_cloudflare_response'],
    [async () => new Response('x'.repeat(100001)), 'storage_metadata_too_large'],
  ]) {
    let calls = 0;
    await assert.rejects(inspectStorage({env, fetchImpl: async (...args) => {calls++; return fetchImpl(...args);}}), new RegExp('^Error: ' + error + '$'));
    assert.equal(calls, 1);
  }
});

test('the manual inspection workflow gates secrets behind main, the existing Environment and synthetic tests', async () => {
  const text = await readFile(new URL('../../../.github/workflows/inspect-agent-storage.yml', import.meta.url), 'utf8');
  assert.match(text, /workflow_dispatch:/); assert(!/\n  (push|pull_request|schedule):/.test(text));
  assert.match(text, /github\.repository == 'yuechuanhou\/embodied-ai-atlas' && github\.ref == 'refs\/heads\/main'/);
  assert.match(text, /environment: atlas-agent-bootstrap/); assert.match(text, /persist-credentials: false/);
  assert.match(text, /contents: read/); assert.match(text, /group: atlas-agent-d1-bootstrap/);
  assert(text.indexOf('node --test') < text.indexOf('secrets.CLOUDFLARE_API_TOKEN'));
  assert(!/upload-artifact|d1 export|restore|secrets\.CLOUDFLARE_WORKER_API_TOKEN/.test(text));
});

test('main rules require PR, current CI from GitHub Actions and forbid bypass, deletion and force push without a solo-review deadlock', async () => {
  const ruleset = JSON.parse(await readFile(new URL('../../operations/main-ruleset.json', import.meta.url), 'utf8'));
  assert.equal(ruleset.enforcement, 'active'); assert.equal(ruleset.target, 'branch'); assert.deepEqual(ruleset.bypass_actors, []);
  assert.deepEqual(ruleset.conditions.ref_name, {include: ['refs/heads/main'], exclude: []});
  const byType = Object.fromEntries(ruleset.rules.map(rule => [rule.type, rule]));
  assert(byType.deletion); assert(byType.non_fast_forward);
  assert.equal(byType.pull_request.parameters.required_approving_review_count, 0);
  assert.equal(byType.pull_request.parameters.require_last_push_approval, false);
  assert.equal(byType.pull_request.parameters.required_review_thread_resolution, true);
  const checks = byType.required_status_checks.parameters;
  assert.equal(checks.strict_required_status_checks_policy, true);
  assert.deepEqual(checks.required_status_checks, [{context: 'check', integration_id: 15368}, {context: 'Validate private runtime from a clean checkout', integration_id: 15368}, {context: 'Validate Orbit knowledge change', integration_id: 15368}]);
  const workflow = await readFile(new URL('../../../.github/workflows/check.yml', import.meta.url), 'utf8');
  assert.match(workflow, /\n  check:\n/); assert.match(workflow, /name: Validate private runtime from a clean checkout/);
});
