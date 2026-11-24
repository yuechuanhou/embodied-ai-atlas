import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {exportJWK, exportPKCS8, generateKeyPair, SignJWT} from 'jose';
import {harness} from './helpers.js';

const {privateKey, publicKey} = await generateKeyPair('RS256', {extractable: true});
const appKey = await exportPKCS8(privateKey), jwk = {...await exportJWK(publicKey), kid: 'validation-test', alg: 'RS256', use: 'sig'};
export const config = {enabled: true, repository: 'yuechuanhou/atlas-test-validator', repository_id: '1001', owner_id: '2001',
  workflow_id: '3001', workflow_sha: 'd'.repeat(40), validator_revision: 'e'.repeat(40), origin: 'https://validation.example.workers.dev', app_id: '4001', installation_id: '5001'};

export async function validationFixture(t, overrides = {}, initial = {}) {
  const h = await harness({MODEL_PROVIDER: 'anthropic', MODEL_NAME: 'synthetic-model', MODEL_API_KEY: 'synthetic-model-key', DAILY_CALL_LIMIT: '10', DAILY_TOKEN_LIMIT: '1000000',
    VALIDATION_CONFIG: JSON.stringify(config), VALIDATION_APP_PRIVATE_KEY: appKey, ...overrides}, (mock, world) => {
    world.validation = {dispatches: [], reads: [], run: null, id: '6001', jobId: null, dispatchUnknown: false, reject: false, private: true, conclusion: null, status: 'in_progress', ...initial};
    const v = world.validation;
    const repo = () => ({private: v.private, id: 1001, owner: {id: 2001}, full_name: config.repository, default_branch: 'main'});
    mock.get('https://token.actions.githubusercontent.com').intercept({method: 'GET', path: '/.well-known/jwks'}).reply(200, JSON.stringify({keys: [jwk]})).persist();
    mock.get('https://api.github.com').intercept({method: 'POST', path: '/app/installations/5001/access_tokens'}).reply(options => {
      v.reads.push(options); return {statusCode: 201, data: JSON.stringify({token: 'synthetic-installation-token', expires_at: new Date(Date.now() + 3600000).toISOString()})};
    }).persist();
    mock.get('https://api.github.com').intercept({method: 'POST', path: '/repos/' + config.repository + '/actions/workflows/3001/dispatches'}).reply(options => {
      v.dispatches.push(options);
      v.id = String(6000 + v.dispatches.length);
      return {statusCode: v.reject ? 403 : 200, data: v.dispatchUnknown ? '{}' : JSON.stringify({workflow_run_id: Number(v.id)})};
    }).persist();
    mock.get('https://api.github.com').intercept({method: 'GET', path: new RegExp('^/repos/' + config.repository + '(?:/|$)')}).reply(options => {
      v.reads.push(options);
      const run = {id: Number(v.id), workflow_id: 3001, head_sha: config.workflow_sha, head_branch: 'main', event: 'workflow_dispatch',
        display_title: 'Atlas validation ' + v.jobId, run_attempt: 1, repository: repo(), status: v.status, conclusion: v.conclusion,
        created_at: new Date().toISOString(), ...v.run};
      const data = options.path === '/repos/' + config.repository ? repo() : options.path.endsWith('/branches/main') ? {commit: {sha: config.workflow_sha}} :
        options.path.endsWith('/actions/workflows/3001') ? {id: 3001, path: '.github/workflows/validate.yml', state: 'active'} :
        options.path.includes('/runs?') ? {workflow_runs: v.noRuns ? [] : [run]} : run;
      return {statusCode: 200, data: JSON.stringify(data)};
    }).persist();
  });
  t.after(h.dispose); await h.sync(); const session = await h.session();
  const owner = (await h.db.prepare('SELECT owner_id FROM sessions WHERE id=?').bind(session).first()).owner_id;
  const candidate = randomUUID(), article = h.world.snapshot.articles.find(a => a.id === 'sensors-and-estimation');
  await h.db.prepare("INSERT INTO knowledge_candidates(id,owner_id,session_id,title,dedup_key,status,evidence_status,draft_markdown,placement_json,source_revision,created_at,updated_at) VALUES(?,?,?,?,?,'researching','insufficient',?,'{}',?,1,1)")
    .bind(candidate, owner, session, 'Synthetic check fixture', randomUUID(), 'A synthetic observation only.', h.world.snapshot.revision).run();
  const save = await h.request('/api/candidates/' + candidate, {method: 'PATCH', body: {version: 1, snapshot_revision: h.world.snapshot.revision,
    title: 'Synthetic check fixture', draft_markdown: 'A synthetic observation only.', primary_domain: article.primary_domain, article_id: article.id, status: 'ready',
    evidence: {kind: 'experience', reference: 'Synthetic private fixture record', supports: 'Fixture conditions only.', owner_confirmed: true}}});
  assert.equal(save.status, 200);
  h.world.modelResponse = {decision: 'extend', narrative: 'concept', addition_markdown: '## Synthetic isolated check\n\nA synthetic bounded observation only.',
    reason: 'New synthetic observation.', editorial_notes: 'Owner review pending.'};
  const generated = await h.request('/api/candidates/' + candidate + '/proposals', {method: 'POST', body: {request_id: randomUUID(), candidate_version: 2, snapshot_revision: h.world.snapshot.revision}});
  assert.equal(generated.status, 200, JSON.stringify(generated.data));
  const v = h.world.validation;
  let row = await h.db.prepare('SELECT * FROM proposal_validations WHERE proposal_id=? ORDER BY attempt DESC LIMIT 1').bind(candidate).first();
  v.jobId = row?.id;
  const broker = (await h.mf.getBindings()).TEST_VALIDATION;
  async function machine(action, body = {}, claims = {}, rawToken) {
    row = await h.db.prepare('SELECT * FROM proposal_validations WHERE id=?').bind(v.jobId).first();
    const now = Math.floor(Date.now() / 1000);
    const token = rawToken ?? await new SignJWT({iss: 'https://token.actions.githubusercontent.com', aud: config.origin + '/validation/' + v.jobId,
      sub: 'repo:' + config.repository + ':ref:refs/heads/main', repository: config.repository, repository_id: config.repository_id,
      repository_owner_id: config.owner_id, repository_visibility: 'private', workflow_ref: config.repository + '/.github/workflows/validate.yml@refs/heads/main',
      workflow_sha: config.workflow_sha, ref: 'refs/heads/main', event_name: 'workflow_dispatch', runner_environment: 'github-hosted',
      run_id: String(row?.run_id), run_attempt: '1', iat: now, nbf: now - 5, exp: now + 300, ...claims}).setProtectedHeader({alg: 'RS256', kid: jwk.kid}).sign(privateKey);
    const response = await broker.fetch(config.origin + '/validation/' + v.jobId + '/' + action, {method: 'POST',
      headers: {Authorization: 'Bearer ' + token, 'Content-Type': 'application/json'}, body: JSON.stringify(body)});
    return {status: response.status, data: await response.json()};
  }
  const path = '/api/proposals/' + candidate;
  const binding = () => ({proposal_id: candidate, proposal_version: 1, patch_digest: row.patch_digest, base_commit: row.base_commit, contract_digest: row.contract_digest});
  const report = () => ({binding: binding(), validator_revision: config.validator_revision, status: 'passed',
    checks: {envelope: 'passed', semantic_validation: 'passed', content_validation: 'passed', repository_build: 'passed', render_regression: 'passed'},
    counts: {articles: 26, topics: 41}, error_code: null});
  return Object.assign(h, {generated, candidate, owner, sessionId: session, path, machine, report, row,
    status: () => h.request(path + '/validation?version=1')});
}
