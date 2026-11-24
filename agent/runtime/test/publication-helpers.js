import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {exportPKCS8, generateKeyPair} from 'jose';
import {harness} from './helpers.js';

const keys = await generateKeyPair('RS256', {extractable: true});
const privateKey = await exportPKCS8(keys.privateKey);
export const config = {enabled: true, repository: 'yuechuanhou/embodied-ai-atlas', repository_id: '1464728578', owner_id: '115120514', app_id: '4001', installation_id: '4002'};
export async function publicationFixture(t, bindings = {}, change = {}) {
  const prefix = '/repos/' + config.repository, base = 'a'.repeat(40), head = 'c'.repeat(40), blob = 'd'.repeat(40);
  const writes = [], reads = [];
  let branch = null, file = null, message = null, pr = null;
  const h = await harness({MODEL_PROVIDER: 'anthropic', MODEL_NAME: 'synthetic-test-model', MODEL_API_KEY: 'synthetic-model-secret',
    DAILY_CALL_LIMIT: '10', DAILY_TOKEN_LIMIT: '1000000', PUBLICATION_CONFIG: JSON.stringify(config), PUBLICATION_APP_PRIVATE_KEY: privateKey, ...bindings}, (mock, world) => {
    world.publication = {writes, reads, checks: 'pending', ...change};
    const value = result => ({statusCode: 200, data: JSON.stringify(result)});
    mock.get('https://api.github.com').intercept({method: 'POST', path: '/app/installations/4002/access_tokens'}).reply(options => {
      reads.push({path: options.path, body: options.body, body_type: typeof options.body, body_class: options.body?.constructor?.name}); return value({token: 'synthetic-publication-token', expires_at: new Date(Date.now() + 3600000).toISOString()});
    }).persist();
    mock.get('https://api.github.com').intercept({method: 'GET', path: prefix}).reply(() => value({full_name: config.repository, private: false, id: Number(config.repository_id), owner: {id: Number(config.owner_id)}, default_branch: 'main', ...world.publication.repository})).persist();
    const pull = () => ({number: 41, html_url: 'https://github.com/' + config.repository + '/pull/41', state: 'open', merged: false,
      head: {sha: head, ref: branch, repo: {id: Number(config.repository_id)}}, base: {ref: 'main', sha: world.main, repo: {id: Number(config.repository_id)}}, ...pr, ...world.publication.pull});
    world.githubRead = options => {
      const path = options.path.slice(prefix.length); reads.push({path});
      if (path.startsWith('/git/ref/heads/')) return branch ? value({object: {sha: file ? head : base}}) : {statusCode: 404, data: '{}'};
      if (path.startsWith('/contents/')) {
        const name = path.split('?')[0].slice('/contents/'.length), revision = new URL('https://fixture.test' + path).searchParams.get('ref');
        const article = world.snapshot.articles.find(a => 'content/' + a.file === name);
        return value({type: 'file', path: name, sha: blob, encoding: 'base64', content: Buffer.from(revision === head ? file : article.markdown).toString('base64')});
      }
      if (path === '/commits/' + head) return value({sha: head, parents: [{sha: base}], commit: {message}, files: [{filename: world.publication.filePath, status: 'modified'}], ...world.publication.commit});
      if (path.startsWith('/pulls?')) return value(pr ? [pull()] : []);
      if (path === '/pulls/41') return value(pull());
      if (path.startsWith('/actions/runs?event=pull_request')) return value({total_count: 1, workflow_runs: [{id: 9001, event: 'pull_request', path: '.github/workflows/check.yml',
        head_sha: head, head_branch: branch, head_repository: {id: Number(config.repository_id)}, pull_requests: [{number: 41}],
        status: world.publication.checks === 'pending' ? 'in_progress' : 'completed', conclusion: world.publication.checks === 'failed' ? 'failure' : 'success', ...world.publication.run}]});
      if (path === '/actions/runs/9001/jobs?filter=latest&per_page=100') return value({total_count: 3, jobs: ['check', 'Validate private runtime from a clean checkout', 'Validate Orbit knowledge change'].map(name =>
        ({name, status: 'completed', conclusion: 'success', head_sha: head, ...(name === 'Validate Orbit knowledge change' ? world.publication.job : {})}))});
      return null;
    };
    for (const method of ['POST','PUT']) mock.get('https://api.github.com').intercept({method, path: new RegExp('^' + prefix + '/')}).reply(options => ({
      statusCode: world.publication.rejectAt === options.path.slice(prefix.length) ? 403 : 200,
      data: async () => {
        const body = await new Response(options.body).json(), path = options.path.slice(prefix.length); writes.push({method, path, body});
        const s = world.publication;
        if (s.rejectAt === path) return JSON.stringify({message: 'private upstream diagnostic'});
        let result;
        if (path === '/git/refs') {assert.equal(body.sha, world.main); branch = body.ref.slice('refs/heads/'.length); result = {ref: body.ref, object: {sha: base}};}
        else if (path.startsWith('/contents/')) {assert.equal(body.branch, branch); assert.equal(body.sha, blob); file = Buffer.from(body.content, 'base64').toString(); message = body.message;
          world.publication.filePath = path.slice('/contents/'.length); result = {commit: {sha: head}};}
        else if (path === '/pulls') {assert.equal(body.head, branch); assert.equal(body.base, 'main'); pr = {title: body.title, body: body.body}; result = pull();}
        else assert.fail('unexpected GitHub mutation');
        if (s.loseAt === path) return '{';
        if (s.changeMainAt === path) world.main = 'e'.repeat(40);
        return JSON.stringify(result);
      },
    })).persist();
  });
  t.after(h.dispose); await h.sync();
  const session = await h.session(), owner = (await h.db.prepare('SELECT owner_id FROM sessions WHERE id=?').bind(session).first()).owner_id;
  const candidate = randomUUID(), article = h.world.snapshot.articles.find(a => a.id === 'sensors-and-estimation');
  await h.db.prepare("INSERT INTO knowledge_candidates(id,owner_id,session_id,title,dedup_key,status,evidence_status,draft_markdown,placement_json,source_revision,created_at,updated_at) VALUES(?,?,?,?,?,'researching','insufficient',?,'{}',?,1,1)")
    .bind(candidate, owner, session, 'Synthetic private title', randomUUID(), 'Synthetic private draft.', h.world.snapshot.revision).run();
  const saved = await h.request('/api/candidates/' + candidate, {method: 'PATCH', body: {version: 1, snapshot_revision: h.world.snapshot.revision,
    title: 'Synthetic private title', draft_markdown: 'Synthetic private draft.', primary_domain: article.primary_domain, article_id: article.id, status: 'ready',
    evidence: {kind: 'experience', reference: 'Private source record must not be published', supports: 'Synthetic private evidence scope', owner_confirmed: true}}});
  assert.equal(saved.status, 200, JSON.stringify(saved.data));
  h.world.modelResponse = {decision: 'extend', narrative: 'concept', addition_markdown: '## Synthetic publicly reviewed addition\n\nA bounded synthetic public observation.\n',
    reason: 'Private model reason must not be published', editorial_notes: 'Private editorial notes must not be published'};
  const generated = await h.request('/api/candidates/' + candidate + '/proposals', {method: 'POST', body: {request_id: randomUUID(), candidate_version: 2, snapshot_revision: h.world.snapshot.revision}});
  assert.equal(generated.status, 200, JSON.stringify(generated.data));
  const route = '/api/proposals/' + candidate + '/publication';
  const read = () => h.request(route + '?version=1');
  const preview = await read(); assert.equal(preview.status, 200, JSON.stringify(preview.data));
  const body = {...preview.data.binding, public_digest: preview.data.preview.public_digest, technical_reviewed: true, editorial_reviewed: true, public_scope_confirmed: true};
  return {...h, candidate, sessionId: session, owner, article, path: route, preview: preview.data, body, read,
    start: (data = body, options = {}) => h.request(route, {method: 'POST', body: data, ...options})};
}
