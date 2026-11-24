import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {setupValidation, gatewayConfig, CONFIRMATION, DATABASE, GATEWAY, READS, MIGRATION_HASHES} from '../scripts/setup-validation.js';

const account = 'b'.repeat(32), databaseId = '12345678-1234-4234-8234-123456789abc';
const env = {PATH: process.env.PATH, CLOUDFLARE_ACCOUNT_ID: account, ATLAS_D1_DATABASE_ID: databaseId,
  CLOUDFLARE_API_TOKEN: 'synthetic-d1-token', CLOUDFLARE_WORKER_API_TOKEN: 'synthetic-worker-token', UNRELATED_SECRET: 'must-not-inherit'};
const definitions = Object.fromEntries(await Promise.all(Object.keys(MIGRATION_HASHES).map(async name =>
  [name, await readFile(new URL('../../db/migrations/' + name, import.meta.url), 'utf8')])));
function harness(change = {}) {
  const calls = [], migrations = [], deployments = [], checkpoints = [];
  let applied = Object.keys(MIGRATION_HASHES).slice(0, change.alreadyMigrated ? 3 : 2), created = change.existing || false;
  const schema = () => applied.flatMap(name => [...definitions[name].matchAll(/^CREATE (TABLE|TRIGGER|(?:UNIQUE )?INDEX) (\w+)/gm)]
    .map(match => ({type: match[1].replace('UNIQUE ', '').toLowerCase(), name: match[2]})));
  const settings = {bindings: [{type: 'service', name: 'BROKER', service: DATABASE, entrypoint: 'ValidationBroker'}], ...change.gateway};
  const fetchImpl = async (url, init) => {
    calls.push({url, init});
    const base = 'https://api.cloudflare.com/client/v4/accounts/' + account;
    assert(url.startsWith(base)); assert.equal(init.redirect, 'error');
    const worker = url.includes('/workers/');
    assert.equal(init.headers.Authorization, 'Bearer ' + (worker ? env.CLOUDFLARE_WORKER_API_TOKEN : env.CLOUDFLARE_API_TOKEN));
    if (change.httpError) return Response.json({secret: 'private Cloudflare diagnostic'}, {status: change.httpError});
    let result;
    if (url.endsWith('/d1/database/' + databaseId)) result = {uuid: databaseId, name: DATABASE, version: 'production', ...change.database};
    else if (url.endsWith('/query')) {
      assert.equal(init.method, 'POST');
      const body = JSON.parse(init.body); assert.deepEqual(body.params, []); assert(Object.values(READS).includes(body.sql));
      let rows;
      if (body.sql === READS.migrations) rows = (change.applied || applied).map(name => ({name}));
      else if (body.sql === READS.schema) rows = change.schema || schema();
      else if (body.sql === READS.foreignKeys) rows = change.foreignKeys || [];
      else rows = change.integrity || [{quick_check: 'ok'}];
      result = [{success: true, results: rows}];
    } else if (url.endsWith('/time_travel/bookmark')) result = {bookmark: change.noBookmark ? '' : 'private-recovery-bookmark'};
    else if (url.endsWith('/workers/scripts/' + DATABASE + '/settings')) result = {bindings: change.brokerBindings || [{type: 'd1', name: 'DB', id: databaseId}]};
    else if (url.endsWith('/workers/scripts/' + GATEWAY + '/settings')) {
      if (change.gatewayAppears && calls.filter(call => call.url === url).length > 1) created = true;
      if (!created) return Response.json({success: false}, {status: 404});
      result = settings;
    } else if (url.endsWith('/subdomain')) result = {enabled: false, previews_enabled: false, ...change.entry};
    else if (url.endsWith('/schedules')) result = {schedules: change.schedules || []};
    else assert.fail('unexpected endpoint ' + url);
    if (!url.endsWith('/query')) {assert.equal(init.method, 'GET'); assert.equal(init.body, undefined);}
    return Response.json({success: true, result});
  };
  return {calls, migrations, deployments, checkpoints, options: {env, fetchImpl,
    checkpoint: value => checkpoints.push(value),
    migrate: async (id, childEnv) => {migrations.push({id, env: childEnv}); if (change.migrationFailure) throw Error('private database details'); applied = Object.keys(MIGRATION_HASHES);},
    deploy: async childEnv => {deployments.push(childEnv); if (change.deployFailure) throw Error('private deployment details'); created = true;}}};
}
const prepare = options => setupValidation({...options, mode: 'prepare', confirmation: CONFIRMATION});

test('plan uses only fixed reads, redacts identifiers, and does not invoke cloud mutations', async () => {
  const h = harness(), result = await setupValidation(h.options);
  assert.equal(result.migration, '0003_pending'); assert.equal(result.gateway, 'would_create_closed'); assert.equal(result.mutations, false);
  assert.equal(h.migrations.length, 0); assert.equal(h.deployments.length, 0); assert.equal(h.checkpoints.length, 0);
  for (const secret of [account, databaseId, env.CLOUDFLARE_API_TOKEN, env.CLOUDFLARE_WORKER_API_TOKEN, 'private-recovery-bookmark'])
    assert(!JSON.stringify(result).includes(secret));
});

test('prepare only migrates the verified existing DB and creates an isolated, closed gateway', async () => {
  const h = harness(), result = await prepare(h.options);
  assert.equal(result.status, 'validation_storage_and_closed_gateway_prepared');
  assert.equal(result.migration, '0003_applied'); assert.equal(result.workers_dev, false); assert.equal(result.preview_urls, false);
  assert.equal(h.migrations.length, 1); assert.equal(h.deployments.length, 1); assert.equal(h.checkpoints.length, 1);
  assert.equal(h.migrations[0].id, databaseId);
  assert.deepEqual(Object.keys(h.migrations[0].env).sort(), ['CLOUDFLARE_ACCOUNT_ID', 'CLOUDFLARE_API_TOKEN', 'PATH']);
  assert.equal(h.migrations[0].env.CLOUDFLARE_API_TOKEN, env.CLOUDFLARE_API_TOKEN);
  assert.deepEqual(Object.keys(h.deployments[0]).sort(), ['CLOUDFLARE_ACCOUNT_ID', 'CLOUDFLARE_API_TOKEN', 'PATH']);
  assert.equal(h.deployments[0].CLOUDFLARE_API_TOKEN, env.CLOUDFLARE_WORKER_API_TOKEN);
  assert.equal(result.executor_activation, 'pending_identity_configuration');
});

test('an already-applied migration is verified and skipped, never reset or reapplied', async () => {
  const h = harness({alreadyMigrated: true}), result = await prepare(h.options);
  assert.equal(result.migration, '0003_already_applied'); assert.equal(h.migrations.length, 0); assert.equal(h.deployments.length, 1);
});

test('configuration and exact confirmation are required before network or mutation', async () => {
  for (const change of [{mode: 'activate'}, {mode: 'prepare'}, {mode: 'prepare', confirmation: CONFIRMATION + ' '},
    {env: {...env, CLOUDFLARE_ACCOUNT_ID: 'other'}}, {env: {...env, ATLAS_D1_DATABASE_ID: ''}},
    {env: {...env, CLOUDFLARE_API_TOKEN: ''}}, {env: {...env, CLOUDFLARE_WORKER_API_TOKEN: ''}}]) {
    const h = harness(); await assert.rejects(setupValidation({...h.options, ...change}));
    assert.equal(h.calls.length, 0); assert.equal(h.migrations.length, 0); assert.equal(h.deployments.length, 0);
  }
});

test('only the three approved migration files and their exact contents can be applied', async () => {
  for (const value of [{...definitions, '0004_future.sql': 'CREATE TABLE surprise (id);'},
    {...definitions, '0003_proposal_validation.sql': definitions['0003_proposal_validation.sql'] + '\n-- modified'}]) {
    const h = harness(); await assert.rejects(prepare({...h.options, loadMigrations: async () => value}), /approved_migration_set_changed/);
    assert.equal(h.calls.length, 0); assert.equal(h.migrations.length, 0);
  }
});

test('identity, migration history, schema, health, recovery and broker mismatches stop before writes', async () => {
  for (const change of [{database: {name: 'other-project'}}, {database: {uuid: 'other-id'}}, {database: {version: 'alpha'}},
    {applied: ['0001_initial.sql']}, {applied: [...Object.keys(MIGRATION_HASHES), '0004_future.sql']},
    {schema: []}, {foreignKeys: [{table: 'private-row'}]}, {integrity: [{quick_check: 'corrupt private data'}]},
    {noBookmark: true}, {brokerBindings: [{type: 'd1', name: 'DB', id: 'another-database'}]}, {httpError: 403}]) {
    const h = harness(change); await assert.rejects(prepare(h.options));
    assert.equal(h.migrations.length, 0); assert.equal(h.deployments.length, 0);
  }
});

test('partial schema and an existing gateway are never overwritten or treated as a completed deployment', async () => {
  const partial = harness({schema: [...Object.keys(MIGRATION_HASHES).slice(0, 2).flatMap(name =>
    [...definitions[name].matchAll(/^CREATE (TABLE|TRIGGER|(?:UNIQUE )?INDEX) (\w+)/gm)].map(m => ({type: m[1].replace('UNIQUE ', '').toLowerCase(), name: m[2]}))),
  {type: 'table', name: 'proposal_validations'}]});
  await assert.rejects(prepare(partial.options), /partial_validation_migration/); assert.equal(partial.migrations.length, 0);
  const existing = harness({existing: true, alreadyMigrated: true});
  assert.equal((await setupValidation(existing.options)).gateway, 'existing_closed_review_required');
  await assert.rejects(prepare(existing.options), /gateway_already_exists/);
  assert.equal(existing.migrations.length, 0); assert.equal(existing.deployments.length, 0);
});

test('gateway checks reject extra privileges, logging, schedules or an active entry point', async () => {
  for (const change of [{gateway: {bindings: []}}, {gateway: {bindings: [{type: 'd1', name: 'DB', id: databaseId}]}},
    {gateway: {observability: {enabled: true}}}, {gateway: {logpush: true}},
    {entry: {enabled: true}}, {entry: {previews_enabled: true}}, {entry: {enabled: undefined}}, {schedules: [{cron: '* * * * *'}]}]) {
    const h = harness({existing: true, ...change}); await assert.rejects(setupValidation(h.options));
    assert.equal(h.migrations.length, 0); assert.equal(h.deployments.length, 0);
  }
});

test('uncertain mutations stop with a fixed error; neither automatic retry nor rollback is attempted', async () => {
  const migration = harness({migrationFailure: true});
  await assert.rejects(prepare(migration.options), /^Error: migration_incomplete_run_plan_before_retry$/);
  assert.equal(migration.migrations.length, 1); assert.equal(migration.deployments.length, 0);
  const deployment = harness({deployFailure: true});
  await assert.rejects(prepare(deployment.options), /^Error: gateway_deployment_incomplete_run_plan_before_retry$/);
  assert.equal(deployment.migrations.length, 1); assert.equal(deployment.deployments.length, 1);
  const race = harness({gatewayAppears: true});
  await assert.rejects(prepare(race.options), /gateway_appeared/);
  assert.equal(race.migrations.length, 0); assert.equal(race.deployments.length, 0);
});

test('generated deployment config contains only the closed service gateway', () => {
  const config = gatewayConfig();
  assert.equal(config.name, GATEWAY); assert.equal(config.workers_dev, false); assert.equal(config.preview_urls, false);
  assert.deepEqual(config.routes, []); assert.deepEqual(config.triggers, {crons: []});
  assert.deepEqual(config.services, [{binding: 'BROKER', service: DATABASE, entrypoint: 'ValidationBroker'}]);
  assert.deepEqual(config.observability, {enabled: false}); assert.equal(config.logpush, false);
  for (const key of ['assets', 'd1_databases', 'vars', 'kv_namespaces', 'unsafe']) assert.equal(config[key], undefined);
});

test('setup workflow is manual, main-only, Environment-protected and tests before injecting Secrets', async () => {
  const workflow = await readFile(new URL('../../../.github/workflows/setup-agent-validation.yml', import.meta.url), 'utf8');
  assert(workflow.includes('workflow_dispatch:')); assert(!workflow.includes('pull_request_target:')); assert(!workflow.includes('push:'));
  assert(workflow.includes("github.ref == 'refs/heads/main'")); assert(workflow.includes('environment: atlas-agent-bootstrap'));
  assert(workflow.includes('group: atlas-agent-worker-setup')); assert(workflow.includes('options: [plan, prepare]'));
  assert(workflow.indexOf('./.github/actions/validate-private-runtime') < workflow.indexOf('${{ secrets.CLOUDFLARE_API_TOKEN }}'));
  assert(!workflow.includes('upload-artifact')); assert(!workflow.includes('secrets: inherit'));
});
