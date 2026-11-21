import {spawn} from 'node:child_process';
import {mkdtemp, readdir, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

export const DATABASE_NAME = 'atlas-agent-private';
const ROOT = fileURLToPath(new URL('../', import.meta.url));
const MIGRATIONS = path.resolve(ROOT, '../db/migrations');
const uuid = value => typeof value === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(value);
class BootstrapError extends Error {}
const requireValue = (value, code) => {if (!value) throw new BootstrapError(code);};

export function migrationConfig(databaseId) {
  requireValue(uuid(databaseId), 'invalid_database_id');
  return {name: DATABASE_NAME, compatibility_date: '2026-07-30', workers_dev: false, preview_urls: false,
    d1_databases: [{binding: 'DB', database_name: DATABASE_NAME, database_id: databaseId, migrations_dir: MIGRATIONS}]};
}

export async function runMigrations(databaseId, env) {
  const temporary = await mkdtemp(path.join(tmpdir(), 'atlas-d1-'));
  try {
    const config = path.join(temporary, 'wrangler.json');
    await writeFile(config, JSON.stringify(migrationConfig(databaseId)), {mode: 0o600});
    // No shell interpolation and no token in arguments, config or public output.
    const code = await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [path.join(ROOT, 'node_modules/wrangler/bin/wrangler.js'),
        'd1', 'migrations', 'apply', DATABASE_NAME, '--remote', '--config', config],
      {cwd: ROOT, env: {...env, CI: 'true', WRANGLER_SEND_METRICS: 'false', XDG_CONFIG_HOME: temporary}, stdio: ['ignore', 'ignore', 'ignore']});
      child.on('error', () => reject(new BootstrapError('migration_process_failed')));
      child.on('close', resolve);
    });
    requireValue(code === 0, 'migration_failed_review_database_before_retry');
  } finally {await rm(temporary, {recursive: true, force: true});}
}

export async function bootstrap({mode = 'plan', confirmation = '', env = process.env,
  fetchImpl = fetch, migrate = runMigrations, mask = () => {}} = {}) {
  requireValue(['plan', 'apply'].includes(mode), 'invalid_mode');
  requireValue(mode !== 'apply' || confirmation === DATABASE_NAME, 'explicit_confirmation_required');
  requireValue(/^[a-f0-9]{32}$/.test(env.CLOUDFLARE_ACCOUNT_ID || ''), 'invalid_account_id');
  requireValue(typeof env.CLOUDFLARE_API_TOKEN === 'string' && env.CLOUDFLARE_API_TOKEN.length >= 16, 'token_required');
  const expected = env.ATLAS_D1_DATABASE_ID || '';
  requireValue(!expected || uuid(expected), 'invalid_expected_database_id');
  const migrations = (await readdir(MIGRATIONS)).filter(n => /^\d{4}_.+\.sql$/.test(n)).sort();
  requireValue(migrations.length > 0, 'missing_migrations');
  const base = 'https://api.cloudflare.com/client/v4/accounts/' + env.CLOUDFLARE_ACCOUNT_ID + '/d1/database';
  async function api(suffix, body) {
    let response;
    try {response = await fetchImpl(base + suffix, {method: body ? 'POST' : 'GET', redirect: 'error',
      headers: {Authorization: 'Bearer ' + env.CLOUDFLARE_API_TOKEN, 'Content-Type': 'application/json'},
      body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(20_000)});}
    catch {throw new BootstrapError('cloudflare_request_incomplete');}
    requireValue(response.ok, 'cloudflare_http_' + response.status);
    let data; try {data = await response.json();} catch {throw new BootstrapError('invalid_cloudflare_response');}
    requireValue(data.success === true, 'cloudflare_api_error'); return data;
  }
  const listed = await api('?name=' + DATABASE_NAME + '&per_page=100&page=1');
  requireValue(Array.isArray(listed.result) && listed.result_info?.total_count <= 100, 'incomplete_database_listing');
  const matches = listed.result.filter(d => d.name === DATABASE_NAME);
  requireValue(matches.length <= 1, 'ambiguous_database');
  let database = matches[0];
  if (database) {
    requireValue(uuid(database.uuid), 'invalid_database_id');
    mask(database.uuid);
    requireValue(!expected || database.uuid === expected, 'database_id_mismatch');
    if (!expected) {
      requireValue(mode === 'plan', 'existing_database_requires_explicit_id');
      return {database: DATABASE_NAME, status: 'existing_database_needs_owner_verification', mutations: false};
    }
  } else requireValue(!expected, 'expected_database_not_found');
  if (mode === 'plan' && !database) return {database: DATABASE_NAME, status: 'would_create_and_initialize', migration_count: migrations.length, mutations: false};
  const created = !database;
  if (created) {
    database = (await api('', {name: DATABASE_NAME})).result;
    requireValue(database?.name === DATABASE_NAME && uuid(database.uuid), 'invalid_created_database');
    mask(database.uuid);
    await migrate(database.uuid, env);
  }
  // Existing databases are never migrated or reset by this first-time bootstrap.
  const tables = await api('/' + database.uuid + '/query', {sql: "SELECT name FROM sqlite_master WHERE type='table'", params: []});
  const rows = tables.result?.[0];
  requireValue(rows?.success === true && Array.isArray(rows.results), 'invalid_schema_response');
  for (const table of ['d1_migrations', 'sessions', 'messages', 'approvals', 'knowledge_snapshots', 'runtime_requests', 'runtime_sync']) {
    requireValue(rows.results.some(r => r.name === table), 'database_not_initialized_review_before_retry');
  }
  const applied = await api('/' + database.uuid + '/query', {sql: 'SELECT name FROM d1_migrations ORDER BY name', params: []});
  requireValue(applied.result?.[0]?.success === true &&
    JSON.stringify(applied.result[0].results.map(r => r.name)) === JSON.stringify(migrations), 'migration_history_mismatch');
  return {database: DATABASE_NAME, status: created ? 'created_and_initialized' : 'existing_schema_verified',
    migration_count: migrations.length, mutations: created};
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  try {
    const result = await bootstrap({mode: process.env.ATLAS_BOOTSTRAP_MODE || 'plan',
      confirmation: process.env.ATLAS_BOOTSTRAP_CONFIRMATION || '',
      mask: value => {if (process.env.GITHUB_ACTIONS === 'true') console.log('::add-mask::' + value);}});
    console.log(JSON.stringify(result));
  } catch (error) {
    console.error(error instanceof BootstrapError ? error.message : 'bootstrap_failed'); process.exitCode = 1;
  }
}
