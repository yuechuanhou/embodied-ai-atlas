import {importPKCS8, SignJWT} from 'jose';
import {ApiError, canonical, epoch, exactKeys, hex40, record, readText, requireValue, sha256} from './common.js';
import {PUBLIC_REPOSITORY, REQUIRED_PUBLIC_CHECKS} from './publication-projection.js';

const numeric = value => typeof value === 'string' && /^[1-9][0-9]{0,15}$/.test(value) && Number.isSafeInteger(Number(value));
export function publicationConfiguration(env) {
  if (!env.PUBLICATION_CONFIG) return null;
  let c; try {c = JSON.parse(env.PUBLICATION_CONFIG);} catch {throw new ApiError(503, 'publication_configuration_invalid');}
  requireValue(record(c), 503, 'publication_configuration_invalid');
  if (c.enabled === false) return null;
  const keys = ['enabled', 'repository', 'repository_id', 'owner_id', 'app_id', 'installation_id'];
  requireValue(exactKeys(c, keys) && Object.keys(c).length === keys.length && c.enabled === true && c.repository === PUBLIC_REPOSITORY &&
    c.repository_id === '1464728578' && c.owner_id === '115120514' && ['app_id','installation_id'].every(key => numeric(c[key])) &&
    typeof env.PUBLICATION_APP_PRIVATE_KEY === 'string' && env.PUBLICATION_APP_PRIVATE_KEY.startsWith('-----BEGIN PRIVATE KEY-----'), 503, 'publication_configuration_invalid');
  return c;
}
const encode = value => btoa(Array.from(new TextEncoder().encode(value), byte => String.fromCharCode(byte)).join(''));
const decode = value => new TextDecoder('utf-8', {fatal: true}).decode(Uint8Array.from(atob(value.replace(/\s/g, '')), ch => ch.charCodeAt(0)));

export function createPublicationGitHub(fetchImpl = fetch) {
  const tokens = new Map();
  async function raw(path, token, method = 'GET', body, missing = false) {
    let response;
    try {response = await fetchImpl('https://api.github.com' + path, {method, redirect: 'manual', signal: AbortSignal.timeout(12000),
      headers: {Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2026-03-10',
        'User-Agent': 'Orbit-Atlas-publication', ...(body ? {'Content-Type': 'application/json'} : {})}, ...(body ? {body: JSON.stringify(body)} : {})});}
    catch {throw new ApiError(503, method === 'GET' ? 'publication_github_unavailable' : 'publication_outcome_unknown');}
    if (missing && response.status === 404) return null;
    requireValue(response.ok, 503, method === 'GET' ? 'publication_github_unavailable' : 'publication_write_rejected');
    try {return JSON.parse(await readText(response, 1000000));}
    catch {throw new ApiError(503, method === 'GET' ? 'publication_github_unavailable' : 'publication_outcome_unknown');}
  }
  async function client(env, c) {
    const key = await sha256(canonical(c) + env.PUBLICATION_APP_PRIVATE_KEY);
    let saved = tokens.get(key);
    if (!saved || saved.until < epoch() + 60) {
      const signing = await importPKCS8(env.PUBLICATION_APP_PRIVATE_KEY, 'RS256');
      const jwt = await new SignJWT({}).setProtectedHeader({alg: 'RS256'}).setIssuer(c.app_id).setIssuedAt(epoch() - 30).setExpirationTime(epoch() + 480).sign(signing);
      const value = await raw('/app/installations/' + c.installation_id + '/access_tokens', jwt, 'POST',
        {repository_ids: [Number(c.repository_id)], permissions: {contents: 'write', pull_requests: 'write', actions: 'read'}});
      requireValue(typeof value.token === 'string' && value.token.length >= 10 && Date.parse(value.expires_at) > Date.now() + 60000, 503, 'publication_github_unavailable');
      saved = {token: value.token, until: Date.parse(value.expires_at) / 1000};
      if (tokens.size > 2) tokens.clear(); tokens.set(key, saved);
    }
    const api = (suffix, method = 'GET', body, missing = false) => raw('/repos/' + PUBLIC_REPOSITORY + suffix, saved.token, method, body, missing);
    const repo = await api('');
    requireValue(repo.full_name === PUBLIC_REPOSITORY && repo.private === false && String(repo.id) === c.repository_id &&
      String(repo.owner?.id) === c.owner_id && repo.default_branch === 'main', 503, 'publication_repository_mismatch');
    return api;
  }
  return {
    async connect(env, c) {
      const api = await client(env, c);
      async function branch(name) {const r = await api('/git/ref/heads/' + name, 'GET', undefined, true); return r?.object?.sha || null;}
      async function verifyHead(p, head) {
        requireValue(hex40(head) && head !== p.base_commit, 409, 'publication_head_mismatch');
        const commit = await api('/commits/' + head);
        requireValue(commit.sha === head && commit.parents?.length === 1 && commit.parents[0].sha === p.base_commit &&
          commit.commit?.message === p.commit_message && Array.isArray(commit.files) && commit.files.length === 1 &&
          commit.files[0].filename === p.file.path && commit.files[0].status === 'modified', 409, 'publication_head_mismatch');
        const file = await api('/contents/' + p.file.path + '?ref=' + head);
        requireValue(file.type === 'file' && file.path === p.file.path && file.encoding === 'base64' && typeof file.content === 'string' &&
          await sha256(decode(file.content)) === p.file.after_sha256, 409, 'publication_head_mismatch');
      }
      function verifyPR(pr, p, head) {
        requireValue(Number.isSafeInteger(pr.number) && pr.number > 0 && pr.head?.sha === head && pr.head.ref === p.branch &&
          String(pr.head.repo?.id) === c.repository_id && pr.base?.ref === 'main' && String(pr.base.repo?.id) === c.repository_id &&
          pr.title === p.title && pr.body === p.body && pr.html_url === 'https://github.com/' + PUBLIC_REPOSITORY + '/pull/' + pr.number,
        409, 'publication_pr_mismatch');
        return {number: pr.number, url: pr.html_url, state: pr.state, merged: !!pr.merged, head};
      }
      return {
        async main() {const r = await api('/branches/main'); requireValue(hex40(r.commit?.sha), 503, 'publication_github_unavailable'); return r.commit.sha;},
        branch,
        async before(p) {
          const file = await api('/contents/' + p.file.path + '?ref=' + p.base_commit);
          requireValue(file.type === 'file' && file.path === p.file.path && hex40(file.sha) && file.encoding === 'base64' &&
            typeof file.content === 'string' && await sha256(decode(file.content)) === p.file.before_sha256, 409, 'publication_before_changed');
          return file.sha;
        },
        async createBranch(p) {const r = await api('/git/refs', 'POST', {ref: 'refs/heads/' + p.branch, sha: p.base_commit});
          requireValue(r.ref === 'refs/heads/' + p.branch && r.object?.sha === p.base_commit, 503, 'publication_outcome_unknown');},
        async commit(p, beforeSha) {
          const r = await api('/contents/' + p.file.path, 'PUT', {branch: p.branch, sha: beforeSha, content: encode(p.file.after_utf8), message: p.commit_message});
          requireValue(hex40(r.commit?.sha), 503, 'publication_outcome_unknown'); await verifyHead(p, r.commit.sha); return r.commit.sha;
        },
        verifyHead,
        async open(p, head) {return verifyPR(await api('/pulls', 'POST', {head: p.branch, base: 'main', title: p.title, body: p.body, draft: false}), p, head);},
        async find(p, head) {const list = await api('/pulls?state=all&head=' + encodeURIComponent('yuechuanhou:' + p.branch) + '&per_page=100');
          requireValue(Array.isArray(list) && list.length <= 1, 409, 'publication_pr_ambiguous');
          return list.length ? verifyPR(list[0], p, head) : null;},
        async status(p, saved) {
          const currentHead = await branch(p.branch); requireValue(currentHead === saved.head, 409, 'publication_head_changed');
          await verifyHead(p, saved.head);
          const pr = await api('/pulls/' + saved.number), view = verifyPR(pr, p, saved.head);
          if (view.merged) return {...view, checks: 'merged_externally', merge_allowed: false};
          if (view.state !== 'open') return {...view, checks: 'closed', merge_allowed: false};
          if (await this.main() !== p.base_commit) return {...view, checks: 'base_changed', merge_allowed: false};
          const runs = await api('/actions/runs?event=pull_request&head_sha=' + saved.head + '&per_page=100');
          requireValue(Array.isArray(runs.workflow_runs) && runs.total_count <= 100, 503, 'publication_github_unavailable');
          const matches = runs.workflow_runs.filter(run => run.path === '.github/workflows/check.yml' && run.event === 'pull_request' &&
            run.head_sha === saved.head && run.head_branch === p.branch && String(run.head_repository?.id) === c.repository_id &&
            run.pull_requests?.some(item => item.number === saved.number));
          matches.sort((a, b) => b.id - a.id); const run = matches[0];
          if (!run || run.status !== 'completed') return {...view, checks: 'pending', merge_allowed: false};
          if (run.conclusion !== 'success') return {...view, checks: 'failed', merge_allowed: false};
          const jobs = await api('/actions/runs/' + run.id + '/jobs?filter=latest&per_page=100');
          requireValue(Array.isArray(jobs.jobs) && jobs.total_count <= 100, 503, 'publication_github_unavailable');
          const passed = REQUIRED_PUBLIC_CHECKS.every(name => {const found = jobs.jobs.filter(job => job.name === name);
            return found.length === 1 && found[0].status === 'completed' && found[0].conclusion === 'success' && found[0].head_sha === saved.head;});
          return {...view, checks: passed ? 'passed' : 'failed', run_id: String(run.id), merge_allowed: false};
        },
      };
    },
  };
}
