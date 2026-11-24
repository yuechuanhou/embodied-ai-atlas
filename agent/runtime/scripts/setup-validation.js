import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {mkdtemp, readdir, readFile, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {runMigrations} from './bootstrap-d1.js';

export const DATABASE = 'atlas-agent-private';
export const GATEWAY = 'atlas-validation-gateway';
export const CONFIRMATION = DATABASE + ':0003+' + GATEWAY;
const ROOT = fileURLToPath(new URL('../', import.meta.url));
const MIGRATIONS = path.resolve(ROOT, '../db/migrations');
// This is a one-time upgrade, not a general migration/deployment dispatcher.
export const MIGRATION_HASHES = Object.freeze({
  '0001_initial.sql': '332ea17ecfb4263ac645a4613895b5b8ee6a693bd9fa382346295f1d3e12eea3',
  '0002_private_runtime.sql': '43651d195d558b3ad642b9c8ffe4983e89ac373d8f9458a9f5c0672c196a27fa',
  '0003_proposal_validation.sql': 'd462ebfc2cacc7767a78bcef637c24815825008ba88296d4c2a870a9d54788fc',
});
export const READS = Object.freeze({
  migrations: 'SELECT name FROM d1_migrations ORDER BY name',
  schema: "SELECT type,name FROM sqlite_master WHERE type IN ('table','trigger','index') ORDER BY type,name",
  foreignKeys: 'PRAGMA foreign_key_check',
  integrity: 'PRAGMA quick_check',
});
class SetupError extends Error {}
const requireValue = (value, code) => {if (!value) throw new SetupError(code);};
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

export function gatewayConfig() {
  return {name: GATEWAY, main: path.join(ROOT, 'src/validation-gateway.js'), compatibility_date: '2026-07-30',
    workers_dev: false, preview_urls: false, routes: [], triggers: {crons: []},
    observability: {enabled: false}, logpush: false,
    services: [{binding: 'BROKER', service: DATABASE, entrypoint: 'ValidationBroker'}]};
}

export async function deployGateway(env, {dryRun = false} = {}) {
  const temporary = await mkdtemp(path.join(tmpdir(), 'atlas-validation-setup-'));
  try {
    const config = path.join(temporary, 'wrangler.json');
    await writeFile(config, JSON.stringify(gatewayConfig()), {mode: 0o600});
    const code = await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [path.join(ROOT, 'node_modules/wrangler/bin/wrangler.js'),
        'deploy', '--config', config, ...(dryRun ? ['--dry-run', '--outdir', path.join(temporary, 'bundle')] : [])],
      {cwd: ROOT, env: {...env, CI: 'true', WRANGLER_SEND_METRICS: 'false', XDG_CONFIG_HOME: temporary,
        WRANGLER_LOG_PATH: path.join(temporary, 'logs')}, stdio: ['ignore', 'ignore', 'ignore']});
      child.on('error', () => reject(new SetupError('gateway_process_incomplete_run_plan_before_retry')));
      child.on('close', resolve);
    });
    requireValue(code === 0, 'gateway_deployment_incomplete_run_plan_before_retry');
  } finally {await rm(temporary, {recursive: true, force: true});}
}

export async function setupValidation({mode = 'plan', confirmation = '', env = process.env,
  fetchImpl = fetch, migrate = runMigrations, deploy = deployGateway, checkpoint = () => {},
  loadMigrations = async () => {
    const names = (await readdir(MIGRATIONS)).filter(name => name.endsWith('.sql')).sort();
    return Object.fromEntries(await Promise.all(names.map(async name => [name, await readFile(path.join(MIGRATIONS, name), 'utf8')])));
  }} = {}) {
  requireValue(['plan', 'prepare'].includes(mode), 'invalid_mode');
  requireValue(mode !== 'prepare' || confirmation === CONFIRMATION, 'explicit_confirmation_required');
  requireValue(/^[a-f0-9]{32}$/.test(env.CLOUDFLARE_ACCOUNT_ID || ''), 'invalid_account_id');
  const databaseId = env.ATLAS_D1_DATABASE_ID;
  requireValue(typeof databaseId === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(databaseId) &&
    databaseId !== '00000000-0000-0000-0000-000000000000', 'invalid_database_id');
  for (const key of ['CLOUDFLARE_API_TOKEN', 'CLOUDFLARE_WORKER_API_TOKEN'])
    requireValue(typeof env[key] === 'string' && env[key].length >= 16, 'cloudflare_tokens_required');
  const definitions = await loadMigrations(), names = Object.keys(MIGRATION_HASHES);
  requireValue(same(Object.keys(definitions).sort(), names) && names.every(name =>
    createHash('sha256').update(definitions[name]).digest('hex') === MIGRATION_HASHES[name]), 'approved_migration_set_changed');
  const base = 'https://api.cloudflare.com/client/v4/accounts/' + env.CLOUDFLARE_ACCOUNT_ID;
  // Only fixed metadata and schema/health reads. Never export or print private rows.
  async function read(suffix, {worker = false, sql, allowMissing = false} = {}) {
    let response;
    try {response = await fetchImpl(base + suffix, {method: sql ? 'POST' : 'GET', redirect: 'error',
      headers: {Authorization: 'Bearer ' + env[worker ? 'CLOUDFLARE_WORKER_API_TOKEN' : 'CLOUDFLARE_API_TOKEN'], 'Content-Type': 'application/json'},
      ...(sql ? {body: JSON.stringify({sql, params: []})} : {}), signal: AbortSignal.timeout(20_000)});}
    catch {throw new SetupError('cloudflare_read_incomplete_run_plan_before_retry');}
    if (allowMissing && response.status === 404) return null;
    requireValue(response.ok, 'cloudflare_http_' + response.status);
    let data;
    try {
      const reader = response.body.getReader(), decoder = new TextDecoder(); let bytes = 0, body = '';
      try {for (;;) {const {value, done} = await reader.read(); if (done) break;
        bytes += value.byteLength; requireValue(bytes <= 100_000, 'metadata_response_too_large'); body += decoder.decode(value, {stream: true});}
      body += decoder.decode();} finally {await reader.cancel().catch(() => {});}
      data = JSON.parse(body);
    } catch (error) {if (error instanceof SetupError) throw error; throw new SetupError('invalid_cloudflare_response');}
    requireValue(data?.success === true && data.result && typeof data.result === 'object', 'invalid_cloudflare_response');
    return data.result;
  }
  const dbPath = '/d1/database/' + databaseId, gatewayPath = '/workers/scripts/' + GATEWAY;
  async function query(sql) {
    const result = await read(dbPath + '/query', {sql});
    requireValue(Array.isArray(result) && result.length === 1 && result[0]?.success === true && Array.isArray(result[0].results), 'invalid_query_response');
    return result[0].results;
  }
  async function storage() {
    const applied = (await query(READS.migrations)).map(row => row.name);
    requireValue(same(applied, names.slice(0, 2)) || same(applied, names), 'migration_history_mismatch');
    const schema = await query(READS.schema);
    for (const name of applied) {
      for (const match of definitions[name].matchAll(/^CREATE (TABLE|TRIGGER|(?:UNIQUE )?INDEX) (\w+)/gm))
        requireValue(schema.some(row => row.type === match[1].replace('UNIQUE ', '').toLowerCase() && row.name === match[2]), 'required_schema_object_missing');
    }
    if (applied.length === 2) requireValue(!schema.some(row => ['proposal_validations', 'proposal_validation_versions', 'immutable_validation_binding'].includes(row.name)), 'partial_validation_migration_review_required');
    requireValue((await query(READS.foreignKeys)).length === 0, 'foreign_key_check_failed');
    const integrity = await query(READS.integrity);
    requireValue(integrity.length === 1 && same(Object.values(integrity[0]), ['ok']), 'integrity_check_failed');
    return applied.length;
  }
  async function verifyGateway(settings) {
    requireValue(Array.isArray(settings.bindings) && settings.bindings.length === 1 && settings.bindings[0].name === 'BROKER' &&
      settings.bindings[0].type === 'service' && settings.bindings[0].service === DATABASE && settings.bindings[0].entrypoint === 'ValidationBroker', 'gateway_binding_mismatch');
    requireValue(settings.observability?.enabled !== true && settings.logpush !== true, 'gateway_logging_enabled');
    const entry = await read(gatewayPath + '/subdomain', {worker: true});
    requireValue(entry.enabled === false && entry.previews_enabled === false, 'gateway_entrypoint_already_enabled');
    const schedules = await read(gatewayPath + '/schedules', {worker: true});
    requireValue(Array.isArray(schedules.schedules) && schedules.schedules.length === 0, 'gateway_schedule_present');
  }
  const database = await read(dbPath);
  requireValue(database.uuid === databaseId && database.name === DATABASE, 'database_identity_mismatch');
  requireValue(database.version === 'production', 'time_travel_backend_unverified');
  let migrationCount = await storage();
  const broker = await read('/workers/scripts/' + DATABASE + '/settings', {worker: true});
  requireValue(Array.isArray(broker.bindings) && broker.bindings.some(binding => binding.name === 'DB' && binding.type === 'd1' && binding.id === databaseId), 'broker_database_binding_mismatch');
  const existing = await read(gatewayPath + '/settings', {worker: true, allowMissing: true});
  if (existing) await verifyGateway(existing);
  // Even a similar existing gateway is not evidence that it contains our code.
  requireValue(mode !== 'prepare' || !existing, 'gateway_already_exists_run_plan_and_review');
  const bookmark = await read(dbPath + '/time_travel/bookmark');
  requireValue(typeof bookmark.bookmark === 'string' && bookmark.bookmark.length >= 8 && bookmark.bookmark.length <= 200, 'recovery_bookmark_unavailable');
  const recoveryPoint = new Date().toISOString();
  if (mode === 'plan') return {status: 'validation_setup_plan_verified', mutations: false,
    migration: migrationCount === 2 ? '0003_pending' : '0003_applied', gateway: existing ? 'existing_closed_review_required' : 'would_create_closed',
    time_travel: 'current_bookmark_available', recovery_point_utc: recoveryPoint};
  checkpoint({status: 'validation_setup_preflight_passed', time_travel: 'current_bookmark_available', recovery_point_utc: recoveryPoint});
  // Recheck immediately before writes. No create/reset/restore, no automatic retry.
  requireValue(await read(gatewayPath + '/settings', {worker: true, allowMissing: true}) === null, 'gateway_appeared_run_plan_and_review');
  let migrated = false;
  if (migrationCount === 2) {
    try {await migrate(databaseId, {PATH: env.PATH, CLOUDFLARE_ACCOUNT_ID: env.CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN: env.CLOUDFLARE_API_TOKEN});}
    catch {throw new SetupError('migration_incomplete_run_plan_before_retry');}
    migrated = true; migrationCount = await storage();
    requireValue(migrationCount === 3, 'migration_not_verified_run_plan_before_retry');
  }
  requireValue(await read(gatewayPath + '/settings', {worker: true, allowMissing: true}) === null, 'gateway_appeared_run_plan_and_review');
  try {await deploy({PATH: env.PATH, CLOUDFLARE_ACCOUNT_ID: env.CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN: env.CLOUDFLARE_WORKER_API_TOKEN});}
  catch {throw new SetupError('gateway_deployment_incomplete_run_plan_before_retry');}
  await verifyGateway(await read(gatewayPath + '/settings', {worker: true}));
  return {status: 'validation_storage_and_closed_gateway_prepared', mutations: true,
    migration: migrated ? '0003_applied' : '0003_already_applied', workers_dev: false, preview_urls: false,
    recovery_point_utc: recoveryPoint, executor_activation: 'pending_identity_configuration'};
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  try {
    if (process.argv[2] === '--dry-run' && process.argv.length === 3) {
      await deployGateway({PATH: process.env.PATH}, {dryRun: true});
      console.log(JSON.stringify({status: 'closed_gateway_bundle_verified', mutations: false}));
    } else {
      requireValue(process.argv.length === 2, 'invalid_arguments');
      console.log(JSON.stringify(await setupValidation({mode: process.env.ATLAS_VALIDATION_SETUP_MODE || 'plan',
        confirmation: process.env.ATLAS_VALIDATION_SETUP_CONFIRMATION || '', checkpoint: value => console.log(JSON.stringify(value))})));
    }
  } catch (error) {console.error(error instanceof SetupError ? error.message : 'validation_setup_failed_run_plan_before_retry'); process.exitCode = 1;}
}
