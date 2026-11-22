import {Miniflare, createFetchMock} from 'miniflare';
import {exportJWK, generateKeyPair, SignJWT} from 'jose';
import {createHash} from 'node:crypto';
import {readFile, readdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {unstable_splitSqlQuery} from 'wrangler';

export const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
export const ORIGIN = 'https://agent.example.test';
export const ISSUER = 'https://atlas-test.cloudflareaccess.com';
export const OWNER = 'owner@example.test';
export const hash = value => createHash('sha256').update(value).digest('hex');
const {privateKey, publicKey} = await generateKeyPair('RS256', {extractable: true});
const jwk = {...await exportJWK(publicKey), kid: 'test-key', alg: 'RS256', use: 'sig'};
export async function token(overrides = {}) {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({email: OWNER, iss: ISSUER, aud: 'atlas-test-audience', sub: 'owner-subject', iat: now, exp: now + 300, ...overrides})
    .setProtectedHeader({alg: 'RS256', kid: 'test-key'}).sign(privateKey);
}

export async function harness(bindings = {}) {
  const buildManifest = JSON.parse(await readFile(path.join(ROOT, 'dist/knowledge-manifest.json'), 'utf8'));
  const initial = JSON.parse(await readFile(path.join(ROOT, 'dist', buildManifest.index_path), 'utf8'));
  const world = {snapshot: {...initial, revision: 'a'.repeat(40)}, main: 'a'.repeat(40), failed: false,
    deployment: 'success', modelCalls: [], modelReads: [], modelResponse: null, modelFail: false, modelStop: 'end_turn', mismatch: false};
  function artifact() {
    const body = JSON.stringify(world.snapshot), digest = hash(body);
    return {body, manifest: JSON.stringify({schema_version: 1, revision: world.snapshot.revision,
      contract_digest: world.snapshot.contract_digest, index_path: 'knowledge-index.' + digest + '.json',
      index_sha256: digest, articles: world.snapshot.articles.length, topics: world.snapshot.topics.length})};
  }
  const mock = createFetchMock(); mock.disableNetConnect();
  mock.get(ISSUER).intercept({method: 'GET', path: '/cdn-cgi/access/certs'}).reply(200, JSON.stringify({keys: [jwk]})).persist();
  mock.get('https://api.github.com').intercept({method: 'GET', path: /^\/repos\/yuechuanhou\/embodied-ai-atlas\//}).reply(options => {
    if (world.failed) return {statusCode: 503, data: '{}'};
    if (options.path.includes('/branches/main')) return {statusCode: 200, data: JSON.stringify({commit: {sha: world.main}})};
    if (options.path.includes('/jobs?')) return {statusCode: 200, data: JSON.stringify({jobs: [{name: 'deploy', conclusion: world.deployment}]})};
    return {statusCode: 200, data: JSON.stringify({workflow_runs: [{id: 123, head_sha: world.snapshot.revision, head_branch: 'main', path: '.github/workflows/deploy-pages.yml', event: 'push', conclusion: 'success'}]})};
  }).persist();
  mock.get('https://www.yuechuanhou.com').intercept({method: 'GET', path: /^\/embodied-ai-atlas\//}).reply(options => ({
    statusCode: world.failed ? 503 : 200,
    data: options.path.endsWith('knowledge-manifest.json') ? artifact().manifest : world.mismatch ? '{}' : artifact().body,
  })).persist();
  for (const [origin, endpoint] of [['https://api.openai.com', '/v1/responses'], ['https://api.anthropic.com', '/v1/messages']]) {
    mock.get(origin).intercept({method: 'POST', path: endpoint}).reply(options => {
      const call = {origin, headers: options.headers}; world.modelCalls.push(call);
      world.modelReads.push(new Response(options.body).json().then(request => {call.request = request;}));
      if (world.modelFail) return {statusCode: 503, data: '{}'};
      const value = world.modelResponse || {answer: 'Synthetic model explanation; new material needs verification.', cited_source_ids: [], candidate: null};
      const data = origin.includes('openai') ? {status: 'completed', output: [{type: 'message', content: [{type: 'output_text', text: JSON.stringify(value)}]}], usage: {total_tokens: 100}} :
        {stop_reason: world.modelStop, content: [{type: 'text', text: JSON.stringify(value)}], usage: {input_tokens: 60, output_tokens: 40}};
      return {statusCode: 200, data: JSON.stringify(data)};
    }).delay(100).persist();
  }
  const mf = new Miniflare({modules: true, modulesRoot: ROOT, scriptPath: path.join(ROOT, '.preview/private-worker/index.js'),
    modulesRules: [{type: 'Text', include: ['**/*workbench-client.js', '**/*.css', '**/*.svg']}, {type: 'ESModule', include: ['**/*.js'], fallthrough: true}],
    compatibilityDate: '2026-07-30', fetchMock: mock, d1Databases: {DB: 'atlas-runtime-test'},
    bindings: {ACCESS_ISSUER: ISSUER, ACCESS_AUD: 'atlas-test-audience', PRIVATE_ORIGIN: ORIGIN,
      OWNER_EMAIL: OWNER, MODEL_PROVIDER: 'disabled', ...bindings}});
  let db;
  try {
    db = await mf.getD1Database('DB');
    const migrations = path.join(ROOT, 'agent/db/migrations');
    for (const file of (await readdir(migrations)).filter(f => f.endsWith('.sql')).sort()) {
      const statements = unstable_splitSqlQuery(await readFile(path.join(migrations, file), 'utf8'));
      await db.batch(statements.map(sql => db.prepare(sql)));
    }
  } catch (error) {await mf.dispose(); throw error;}
  const jwt = await token();
  async function request(url, {method = 'GET', body, jwtOverride = jwt, headers = {}} = {}) {
    const h = {...(jwtOverride ? {'Cf-Access-Jwt-Assertion': jwtOverride} : {}),
      ...(method === 'GET' ? {} : {'Origin': ORIGIN, 'X-Atlas-Request': '1', 'Content-Type': 'application/json'}), ...headers};
    const response = await mf.dispatchFetch(ORIGIN + url, {method, headers: h, body: body === undefined ? undefined : JSON.stringify(body)});
    await Promise.all(world.modelReads);
    const content = response.headers.get('content-type') || '';
    return {status: response.status, headers: response.headers, data: content.includes('json') ? await response.json() : await response.text()};
  }
  async function sync() {return request('/api/sync', {method: 'POST', body: {}});}
  async function session() {return (await request('/api/sessions', {method: 'POST', body: {}})).data.id;}
  async function expireSync() {await db.prepare('UPDATE runtime_sync SET checked_at=0').run();}
  return {world, db, mf, jwt, request, sync, session, expireSync, dispose: () => mf.dispose()};
}
