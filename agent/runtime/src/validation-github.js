import {importPKCS8, SignJWT} from 'jose';
import {ApiError, canonical, epoch, exactKeys, hex40, readText, requireValue, sha256} from './common.js';

const numeric = v => typeof v === 'string' && /^[1-9][0-9]{0,15}$/.test(v) && Number.isSafeInteger(Number(v));
export function validationConfiguration(env) {
  if (!env.VALIDATION_CONFIG) return null;
  let c; try {c = JSON.parse(env.VALIDATION_CONFIG);} catch {throw new ApiError(503, 'validation_configuration_invalid');}
  if (c.enabled === false) return null;
  const keys = ['enabled','repository','repository_id','owner_id','workflow_id','workflow_sha','validator_revision','origin','app_id','installation_id'];
  requireValue(exactKeys(c, keys) && Object.keys(c).length === keys.length && c.enabled === true &&
    /^yuechuanhou\/[a-z0-9][a-z0-9-]{0,80}$/.test(c.repository || '') && c.repository !== 'yuechuanhou/embodied-ai-atlas' &&
    ['repository_id','owner_id','workflow_id','app_id','installation_id'].every(k => numeric(c[k])) && hex40(c.workflow_sha) && hex40(c.validator_revision) &&
    /^https:\/\/[a-z0-9-]+\.[a-z0-9-]+\.workers\.dev$/.test(c.origin || '') &&
    typeof env.VALIDATION_APP_PRIVATE_KEY === 'string' && env.VALIDATION_APP_PRIVATE_KEY.startsWith('-----BEGIN PRIVATE KEY-----'),
  503, 'validation_configuration_invalid');
  return c;
}
export const executorDigest = c => sha256(canonical(c));

// This client has no Contents/PR mutation methods. Installation tokens are narrowed
// to one private repository, Actions:write and Contents:read; never to the runner/model.
export function createValidationGitHub(fetchImpl) {
  const tokens = new Map();
  async function raw(path, token, method = 'GET', body) {
    let response;
    try {response = await fetchImpl('https://api.github.com' + path, {method, redirect: 'manual', signal: AbortSignal.timeout(12000),
      headers: {Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2026-03-10',
        'User-Agent': 'Atlas-private-validation', ...(body ? {'Content-Type': 'application/json'} : {})},
      ...(body ? {body: JSON.stringify(body)} : {})});}
    catch {throw new ApiError(503, method === 'POST' && path.endsWith('/dispatches') ? 'validation_dispatch_unknown' : 'validation_github_unavailable');}
    requireValue(response.ok, 503, method === 'POST' && path.endsWith('/dispatches') ? 'validation_dispatch_rejected' : 'validation_github_unavailable');
    try {return JSON.parse(await readText(response, 1000000));}
    catch {throw new ApiError(503, method === 'POST' && path.endsWith('/dispatches') ? 'validation_dispatch_unknown' : 'validation_github_unavailable');}
  }
  async function client(env, c) {
    const key = await sha256(canonical(c) + env.VALIDATION_APP_PRIVATE_KEY);
    let saved = tokens.get(key);
    if (!saved || saved.until < epoch() + 60) {
      const signing = await importPKCS8(env.VALIDATION_APP_PRIVATE_KEY, 'RS256');
      const jwt = await new SignJWT({}).setProtectedHeader({alg: 'RS256'}).setIssuer(c.app_id).setIssuedAt(epoch() - 30).setExpirationTime(epoch() + 480).sign(signing);
      const value = await raw('/app/installations/' + c.installation_id + '/access_tokens', jwt, 'POST',
        {repository_ids: [Number(c.repository_id)], permissions: {actions: 'write', contents: 'read'}});
      requireValue(typeof value.token === 'string' && value.token.length >= 10 && Date.parse(value.expires_at) > Date.now() + 60000,
        503, 'validation_github_unavailable');
      saved = {token: value.token, until: Math.floor(Date.parse(value.expires_at) / 1000)};
      if (tokens.size > 2) tokens.clear(); tokens.set(key, saved);
    }
    const prefix = '/repos/' + c.repository;
    return (suffix, method = 'GET', body) => raw(prefix + suffix, saved.token, method, body);
  }
  async function repository(api, c) {
    const repo = await api('');
    requireValue(repo.private === true && String(repo.id) === c.repository_id && String(repo.owner?.id) === c.owner_id &&
      repo.full_name === c.repository && repo.default_branch === 'main', 503, 'validation_repository_mismatch');
  }
  return {
    async dispatch(env, c, id) {
      const api = await client(env, c);
      const [, branch, workflow] = await Promise.all([repository(api, c), api('/branches/main'), api('/actions/workflows/' + c.workflow_id)]);
      requireValue(branch.commit?.sha === c.workflow_sha && String(workflow.id) === c.workflow_id && workflow.path === '.github/workflows/validate.yml' && workflow.state === 'active',
        503, 'validation_executor_changed');
      const result = await api('/actions/workflows/' + c.workflow_id + '/dispatches', 'POST',
        {ref: 'main', inputs: {job_id: id}, return_run_details: true});
      requireValue(numeric(String(result.workflow_run_id)), 503, 'validation_dispatch_unknown');
      return String(result.workflow_run_id);
    },
    async run(env, c, id) {const api = await client(env, c); const [, run] = await Promise.all([repository(api, c), api('/actions/runs/' + id)]); return run;},
    async find(env, c, row) {
      const api = await client(env, c);
      const [, data] = await Promise.all([repository(api, c), api('/actions/workflows/' + c.workflow_id + '/runs?event=workflow_dispatch&head_sha=' + c.workflow_sha + '&per_page=100')]);
      requireValue(Array.isArray(data.workflow_runs), 503, 'validation_github_unavailable');
      const matches = data.workflow_runs.filter(run => run.display_title === 'Atlas validation ' + row.id &&
        Date.parse(run.created_at) >= (row.created_at - 30) * 1000);
      requireValue(matches.length <= 1, 409, 'validation_dispatch_ambiguous');
      return matches[0] || null;
    },
  };
}

export function verifyRun(run, c, row) {
  requireValue(String(run.id) === row.run_id && String(run.workflow_id) === c.workflow_id && run.head_sha === c.workflow_sha &&
    run.head_branch === 'main' && run.event === 'workflow_dispatch' && run.display_title === 'Atlas validation ' + row.id &&
    run.run_attempt === 1 && run.repository?.private === true && String(run.repository.id) === c.repository_id &&
    String(run.repository.owner?.id) === c.owner_id, 403, 'validation_run_mismatch');
}
