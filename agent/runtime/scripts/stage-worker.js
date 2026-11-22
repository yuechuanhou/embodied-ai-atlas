import {spawn} from 'node:child_process';
import {mkdtemp, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

export const WORKER_NAME = 'atlas-agent-private';
const ROOT = fileURLToPath(new URL('../', import.meta.url));
const uuid = value => typeof value === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(value) && value !== '00000000-0000-0000-0000-000000000000';
class StagingError extends Error {}
const requireValue = (value, code) => {if (!value) throw new StagingError(code);};

export function stagingConfig(databaseId) {
  requireValue(uuid(databaseId), 'invalid_database_id');
  return {name: WORKER_NAME, main: path.join(ROOT, 'src/index.js'), compatibility_date: '2026-07-30',
    workers_dev: false, preview_urls: false, routes: [], triggers: {crons: []},
    observability: {enabled: false}, logpush: false,
    d1_databases: [{binding: 'DB', database_name: WORKER_NAME, database_id: databaseId,
      migrations_dir: path.resolve(ROOT, '../db/migrations')}],
    rules: [{type: 'Text', globs: ['**/*.css', '**/*.svg', '**/workbench-client.js'], fallthrough: true}],
    vars: {MODEL_PROVIDER: 'disabled'}};
}

// Only numeric API codes or fixed categories may leave the private subprocess buffer.
export function deploymentFailureMessage(output) {
  const text = String(output).slice(-65_536).replace(/\u001b\[[0-9;]*m/g, '');
  const codes = [...new Set([...text.matchAll(/\[code:\s*(\d{4,6})\]/g)].map(m => m[1]))].slice(0, 3);
  if (codes.length) return 'worker_deployment_failed_cf_' + codes.join('_') + '_review_before_retry';
  if (/authentication error|unauthorized|forbidden|not authorized|insufficient.*permission/i.test(text))
    return 'worker_deployment_failed_authorization_review_before_retry';
  if (/workers\.dev.{0,100}subdomain|register.{0,100}subdomain/i.test(text))
    return 'worker_deployment_failed_subdomain_setup_review_before_retry';
  if (/fetch failed|ENOTFOUND|ETIMEDOUT|ECONNRESET|UND_ERR/.test(text))
    return 'worker_deployment_failed_network_review_before_retry';
  return 'worker_deployment_incomplete_review_before_retry';
}

// Config and raw Wrangler logs stay private and ephemeral; no credentials in arguments.
export async function deployClosedWorker(databaseId, env, {dryRun = false, spawnImpl = spawn} = {}) {
  const temporary = await mkdtemp(path.join(tmpdir(), 'atlas-worker-'));
  try {
    const config = path.join(temporary, 'wrangler.json');
    await writeFile(config, JSON.stringify(stagingConfig(databaseId)), {mode: 0o600});
    const result = await new Promise((resolve, reject) => {
      let output = '';
      const remember = data => {output = (output + data.toString()).slice(-65_536);};
      const child = spawnImpl(process.execPath, [path.join(ROOT, 'node_modules/wrangler/bin/wrangler.js'),
        'deploy', '--config', config, ...(dryRun ? ['--dry-run', '--outdir', path.join(temporary, 'bundle')] : [])], {cwd: ROOT, env: {...env, CI: 'true',
          WRANGLER_SEND_METRICS: 'false', XDG_CONFIG_HOME: temporary,
          WRANGLER_LOG_PATH: path.join(temporary, 'logs')}, stdio: ['ignore', 'pipe', 'pipe']});
      child.stdout.on('data', remember);
      child.stderr.on('data', remember);
      child.on('error', () => reject(new StagingError('worker_process_failed_review_before_retry')));
      child.on('close', code => resolve({code, output}));
    });
    requireValue(result.code === 0, deploymentFailureMessage(result.output));
  } finally {await rm(temporary, {recursive: true, force: true});}
}

export async function stageWorker({mode = 'plan', confirmation = '', env = process.env,
  fetchImpl = fetch, deploy = deployClosedWorker, mask = () => {}} = {}) {
  requireValue(['plan', 'stage'].includes(mode), 'invalid_mode');
  requireValue(mode !== 'stage' || confirmation === WORKER_NAME, 'explicit_confirmation_required');
  requireValue(/^[a-f0-9]{32}$/.test(env.CLOUDFLARE_ACCOUNT_ID || ''), 'invalid_account_id');
  requireValue(typeof env.CLOUDFLARE_API_TOKEN === 'string' && env.CLOUDFLARE_API_TOKEN.length >= 16, 'worker_token_required');
  const databaseId = env.ATLAS_D1_DATABASE_ID;
  requireValue(uuid(databaseId), 'invalid_database_id');
  mask(databaseId);
  const base = 'https://api.cloudflare.com/client/v4/accounts/' + env.CLOUDFLARE_ACCOUNT_ID;
  async function read(suffix, allowMissing = false) {
    let response;
    try {response = await fetchImpl(base + suffix, {method: 'GET', redirect: 'error',
      headers: {Authorization: 'Bearer ' + env.CLOUDFLARE_API_TOKEN}, signal: AbortSignal.timeout(20_000)});}
    catch {throw new StagingError('cloudflare_request_incomplete');}
    if (allowMissing && response.status === 404) return null;
    requireValue(response.ok, 'cloudflare_http_' + response.status);
    let data; try {data = await response.json();} catch {throw new StagingError('invalid_cloudflare_response');}
    requireValue(data.success === true && data.result && typeof data.result === 'object', 'invalid_cloudflare_response');
    return data.result;
  }
  const database = await read('/d1/database/' + databaseId);
  requireValue(database.uuid === databaseId && database.name === WORKER_NAME, 'database_identity_mismatch');
  const script = '/workers/scripts/' + WORKER_NAME;
  let settings = await read(script + '/settings', true);
  const existing = settings !== null;
  // First-time staging cannot overwrite, reconfigure or activate an existing Worker.
  requireValue(mode !== 'stage' || !existing, 'worker_already_exists_review_before_retry');
  if (!existing && mode === 'plan') return {worker: WORKER_NAME, status: 'would_create_closed_worker', mutations: false};
  if (!existing) {
    await deploy(databaseId, env);
    settings = await read(script + '/settings');
  }
  const bindings = settings.bindings;
  requireValue(Array.isArray(bindings) && bindings.length === 2 &&
    bindings.some(b => b.name === 'DB' && b.type === 'd1' && b.id === databaseId) &&
    bindings.some(b => b.name === 'MODEL_PROVIDER' && b.type === 'plain_text' && b.text === 'disabled'),
  'worker_bindings_mismatch_review_before_retry');
  requireValue(settings.observability?.enabled !== true && settings.logpush !== true,
    'worker_logging_enabled_review_before_retry');
  const subdomain = await read(script + '/subdomain');
  requireValue(subdomain.enabled === false && subdomain.previews_enabled === false,
    'worker_entrypoint_enabled_review_before_retry');
  const schedules = await read(script + '/schedules');
  requireValue(Array.isArray(schedules.schedules) && schedules.schedules.length === 0,
    'worker_schedule_enabled_review_before_retry');
  return {worker: WORKER_NAME, status: existing ? 'existing_closed_worker_verified' : 'created_closed_worker',
    mutations: !existing, workers_dev: false, preview_urls: false, scheduled_tasks: false,
    model: 'disabled', access_binding: 'pending_owner_configuration'};
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  try {
    let result;
    if (process.argv[2] === '--dry-run') {
      // Synthetic UUID and no inherited credentials: only bundle the exact staging config.
      await deployClosedWorker('12345678-1234-4234-8234-123456789abc', {PATH: process.env.PATH}, {dryRun: true});
      result = {status: 'staging_bundle_verified', mutations: false};
    } else {
      requireValue(process.argv.length === 2, 'invalid_arguments');
      result = await stageWorker({mode: process.env.ATLAS_WORKER_MODE || 'plan',
        confirmation: process.env.ATLAS_WORKER_CONFIRMATION || '',
        mask: value => {if (process.env.GITHUB_ACTIONS === 'true') console.log('::add-mask::' + value);}});
    }
    console.log(JSON.stringify(result));
  } catch (error) {
    console.error(error instanceof StagingError ? error.message : 'worker_staging_failed_review_before_retry');
    process.exitCode = 1;
  }
}
