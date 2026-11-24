import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

export const WORKER_NAME = 'atlas-agent-private';
const BUNDLE = fileURLToPath(new URL('../../../.preview/private-worker/', import.meta.url));
const uuid = value => typeof value === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(value) && value !== '00000000-0000-0000-0000-000000000000';
class UpdateError extends Error {}
const requireValue = (value, code) => {if (!value) throw new UpdateError(code);};
const preserved = ['compatibility_date', 'compatibility_flags', 'limits', 'usage_model', 'logpush',
  'observability', 'tail_consumers', 'tags', 'placement'];
const secretNames = ['OWNER_EMAIL', 'ACCESS_ISSUER', 'ACCESS_AUD', 'PRIVATE_ORIGIN', 'GITHUB_READ_TOKEN', 'MODEL_API_KEY', 'VALIDATION_CONFIG', 'VALIDATION_APP_PRIVATE_KEY', 'PUBLICATION_CONFIG', 'PUBLICATION_APP_PRIVATE_KEY'];
const variableNames = ['MODEL_PROVIDER', 'MODEL_NAME', 'DAILY_CALL_LIMIT', 'DAILY_TOKEN_LIMIT'];

function stable(value) {
  const order = v => Array.isArray(v) ? v.map(order) : v && typeof v === 'object'
    ? Object.fromEntries(Object.keys(v).sort().map(k => [k, order(v[k])])) : v;
  return JSON.stringify(order(value));
}
const digest = value => createHash('sha256').update(stable(value)).digest('hex');

export async function readBundle() {
  const main = (await readFile(path.join(BUNDLE, 'index.js'), 'utf8')).replace(/^\/\/# sourceMappingURL=.*$/gm, '');
  const imports = [...main.matchAll(/^import\s.+?\sfrom\s["']([^"']+)["'];?$/gm)].map(m => m[1]).filter(name => name !== 'cloudflare:workers');
  requireValue(main.length > 1000 && imports.length === 3 && new Set(imports).size === 3, 'invalid_worker_bundle');
  const modules = [{name: 'index.js', type: 'application/javascript+module', content: main}];
  for (const dependency of imports) {
    requireValue(/^\.\/[a-f0-9]{40}-(workbench-client\.js|site\.css|mark\.svg)$/.test(dependency), 'unexpected_worker_module');
    modules.push({name: dependency.slice(2), type: 'text/plain', content: await readFile(path.join(BUNDLE, dependency), 'utf8')});
  }
  return modules;
}

export async function updateWorker({mode = 'plan', confirmation = '', env = process.env,
  fetchImpl = fetch, bundle = readBundle, mask = () => {}} = {}) {
  requireValue(['plan', 'deploy'].includes(mode), 'invalid_mode');
  requireValue(mode !== 'deploy' || confirmation === WORKER_NAME, 'explicit_confirmation_required');
  requireValue(/^[a-f0-9]{32}$/.test(env.CLOUDFLARE_ACCOUNT_ID || ''), 'invalid_account_id');
  requireValue(typeof env.CLOUDFLARE_API_TOKEN === 'string' && env.CLOUDFLARE_API_TOKEN.length >= 16, 'worker_token_required');
  requireValue(uuid(env.ATLAS_D1_DATABASE_ID), 'invalid_database_id');
  requireValue(/^[a-f0-9]{40}$/.test(env.GITHUB_SHA || ''), 'invalid_source_revision');
  mask(env.ATLAS_D1_DATABASE_ID);
  const base = 'https://api.cloudflare.com/client/v4/accounts/' + env.CLOUDFLARE_ACCOUNT_ID;
  const script = '/workers/scripts/' + WORKER_NAME;
  async function request(suffix, method = 'GET', body) {
    let response;
    try {response = await fetchImpl(base + suffix, {method, body, redirect: 'error',
      headers: {Authorization: 'Bearer ' + env.CLOUDFLARE_API_TOKEN}, signal: AbortSignal.timeout(method === 'PUT' ? 60_000 : 20_000)});}
    catch {throw new UpdateError(method === 'PUT' ? 'deployment_outcome_unknown_review_before_retry' : 'cloudflare_read_failed');}
    requireValue(response.ok, method === 'PUT' ? 'deployment_not_verified_review_before_retry' : 'cloudflare_http_' + response.status);
    let data; try {data = await response.json();} catch {throw new UpdateError('invalid_cloudflare_response_review_before_retry');}
    requireValue(data.success === true && data.result && typeof data.result === 'object', 'invalid_cloudflare_response_review_before_retry');
    return data.result;
  }
  const database = await request('/d1/database/' + env.ATLAS_D1_DATABASE_ID);
  requireValue(database.uuid === env.ATLAS_D1_DATABASE_ID && database.name === WORKER_NAME, 'database_identity_mismatch');
  async function state() {
    const settings = await request(script + '/settings');
    requireValue(settings.compatibility_date === '2026-07-30', 'compatibility_changed_review_before_update');
    const bindings = settings.bindings;
    requireValue(Array.isArray(bindings) && new Set(bindings.map(b => b.name)).size === bindings.length &&
      bindings.some(b => b.name === 'DB' && b.type === 'd1' && b.id === env.ATLAS_D1_DATABASE_ID) &&
      bindings.some(b => b.name === 'MODEL_PROVIDER' && b.type === 'plain_text' && ['disabled', 'openai', 'anthropic'].includes(b.text)) &&
      secretNames.slice(0, 4).every(name => bindings.some(b => b.name === name && b.type === 'secret_text')) &&
      bindings.every(b => b.name === 'DB' && b.type === 'd1' || secretNames.includes(b.name) && b.type === 'secret_text' ||
        variableNames.includes(b.name) && b.type === 'plain_text'), 'worker_bindings_mismatch_review_before_update');
    requireValue(settings.logpush !== true && settings.observability?.enabled !== true &&
      !settings.tail_consumers?.length && !settings.assets, 'worker_configuration_changed_review_before_update');
    const subdomain = await request(script + '/subdomain'), schedules = await request(script + '/schedules');
    requireValue(typeof subdomain.enabled === 'boolean' && subdomain.previews_enabled === false &&
      Array.isArray(schedules.schedules) && !schedules.schedules.length, 'worker_entrypoints_changed_review_before_update');
    return {settings: Object.fromEntries(preserved.filter(k => settings[k] !== undefined).map(k => [k, settings[k]])),
      bindings: [...bindings].sort((a, b) => a.name.localeCompare(b.name)),
      subdomain: {enabled: subdomain.enabled, previews_enabled: subdomain.previews_enabled}, schedules: schedules.schedules};
  }
  const before = await state(), modules = await bundle();
  requireValue(Array.isArray(modules) && modules.length === 4 && modules[0].name === 'index.js' &&
    new Set(modules.map(m => m.name)).size === modules.length && modules.every(m =>
      typeof m.content === 'string' && m.content.length > 0 && m.content.length <= 2_000_000 &&
      (m.name === 'index.js' && m.type === 'application/javascript+module' ||
        /^[a-f0-9]{40}-(workbench-client\.js|site\.css|mark\.svg)$/.test(m.name) && m.type === 'text/plain')), 'invalid_worker_bundle');
  const source = env.GITHUB_SHA;
  if (mode === 'plan') return {worker: WORKER_NAME, status: 'existing_worker_update_ready', source_revision: source, mutations: false};
  const form = new FormData();
  // Keep existing bindings by TYPE. Secret values are never read or rewritten.
  form.set('metadata', JSON.stringify({...before.settings, main_module: 'index.js',
    keep_bindings: ['secret_text', 'plain_text', 'd1'],
    annotations: {'workers/message': 'Atlas private runtime ' + source}}));
  for (const module of modules) form.set(module.name, new Blob([module.content], {type: module.type}), module.name);
  requireValue(digest(before) === digest(await state()), 'worker_configuration_changed_before_upload');
  await request(script, 'PUT', form);
  requireValue(digest(before) === digest(await state()), 'deployment_configuration_changed_review_before_retry');
  return {worker: WORKER_NAME, status: 'worker_code_updated_configuration_verified', source_revision: source, mutations: true,
    preserved: ['bindings', 'model_settings', 'entrypoints', 'schedules'], private_functional_acceptance: 'pending_owner_check'};
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  try {
    requireValue(process.argv.length === 2, 'invalid_arguments');
    const result = await updateWorker({mode: process.env.ATLAS_WORKER_MODE || 'plan',
      confirmation: process.env.ATLAS_WORKER_CONFIRMATION || '',
      mask: value => {if (process.env.GITHUB_ACTIONS === 'true') console.log('::add-mask::' + value);}});
    console.log(JSON.stringify(result));
  } catch (error) {
    console.error(error instanceof UpdateError ? error.message : 'worker_update_failed_review_before_retry');
    process.exitCode = 1;
  }
}
