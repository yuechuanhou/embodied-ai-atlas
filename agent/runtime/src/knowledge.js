import {ApiError, epoch, hex40, hex64, readText, record, requireValue, sha256, uid} from './common.js';

export const REPOSITORY = 'yuechuanhou/embodied-ai-atlas';
export const SITE = 'https://www.yuechuanhou.com/embodied-ai-atlas/';
const id = value => typeof value === 'string' && /^[a-z0-9][a-z0-9_.:-]{0,127}$/.test(value) && !/\s/.test(value);
export function validateSnapshot(snapshot, manifest) {
  requireValue(snapshot?.schema_version === 1 && hex40(snapshot.revision) && snapshot.revision === manifest.revision &&
    hex64(snapshot.contract_digest) && snapshot.contract_digest === manifest.contract_digest &&
    Array.isArray(snapshot.articles) && snapshot.articles.length > 0 && snapshot.articles.length <= 1000 &&
    Array.isArray(snapshot.topics) && Array.isArray(snapshot.domains) && record(snapshot.architecture), 503, 'invalid_snapshot');
  const articles = new Set(), topics = new Set(), domains = new Set(snapshot.domains.map(d => d.id));
  for (const article of snapshot.articles) {
    requireValue(id(article.id) && !articles.has(article.id) && domains.has(article.primary_domain) &&
      typeof article.markdown === 'string' && typeof article.text === 'string' && typeof article.title === 'string' &&
      Array.isArray(article.sections) && hex64(article.content_digest), 503, 'invalid_article');
    articles.add(article.id);
    const anchors = new Set();
    for (const section of article.sections) {
      requireValue(typeof section.anchor === 'string' && section.anchor.length <= 300 && !anchors.has(section.anchor) &&
        typeof section.title === 'string' && typeof section.text === 'string', 503, 'invalid_section');
      anchors.add(section.anchor);
    }
  }
  for (const topic of snapshot.topics) {
    requireValue(id(topic.id) && !topics.has(topic.id) && articles.has(topic.article) &&
      (!topic.anchor || snapshot.articles.find(a => a.id === topic.article).sections.some(s => s.anchor === topic.anchor)), 503, 'invalid_topic');
    topics.add(topic.id);
  }
  requireValue(snapshot.articles.length === manifest.articles && snapshot.topics.length === manifest.topics, 503, 'snapshot_count_mismatch');
}

export async function activeSnapshot(db) {
  const active = await db.prepare("SELECT revision,payload_json FROM knowledge_snapshots WHERE status='active'").first();
  return active?.payload_json ? JSON.parse(active.payload_json) : null;
}

export function createKnowledgeSync(fetchImpl) {
  async function github(path, env) {
    const headers = {'User-Agent': 'Atlas-private-agent', 'Accept': 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28'};
    if (env.GITHUB_READ_TOKEN) headers.Authorization = 'Bearer ' + env.GITHUB_READ_TOKEN;
    const response = await fetchImpl('https://api.github.com/repos/' + REPOSITORY + path,
      {headers, redirect: 'manual', signal: AbortSignal.timeout(8000)});
    return JSON.parse(await readText(response, 300_000));
  }
  async function publicText(path) {
    return readText(await fetchImpl(SITE + path, {headers: {'Cache-Control': 'no-cache'},
      redirect: 'manual', signal: AbortSignal.timeout(8000), cf: {cacheTtl: 0}}));
  }
  return async function synchronize(env, force = false) {
    const db = env.DB, now = epoch(), token = uid();
    const prior = await db.prepare('SELECT * FROM runtime_sync WHERE id=1').first();
    if (!force && prior.checked_at > now - 60) return activeSnapshot(db);
    const lease = await db.prepare('UPDATE runtime_sync SET lock_token=?,lock_until=? WHERE id=1 AND lock_until<=? RETURNING id')
      .bind(token, now + 120, now).first();
    if (!lease) return activeSnapshot(db);
    let repoHead = null;
    try {
      const branch = await github('/branches/main', env); repoHead = branch.commit?.sha;
      requireValue(hex40(repoHead), 503, 'invalid_repository_head');
      const manifestText = await publicText('knowledge-manifest.json');
      const manifest = JSON.parse(manifestText), manifestHash = await sha256(manifestText);
      requireValue(manifest.schema_version === 1 && hex40(manifest.revision) && hex64(manifest.index_sha256) &&
        hex64(manifest.contract_digest) && manifest.index_path === 'knowledge-index.' + manifest.index_sha256 + '.json', 503, 'invalid_manifest');
      const known = await db.prepare('SELECT * FROM knowledge_snapshots WHERE revision=?').bind(manifest.revision).first();
      if (known) requireValue(known.manifest_digest === manifestHash, 503, 'revision_collision');
      if (!known?.payload_json) {
        // The artifact's self-reported SHA alone is not deployment evidence.
        const runs = await github('/actions/runs?head_sha=' + manifest.revision + '&branch=main&status=success&per_page=10', env);
        const run = runs.workflow_runs.find(r => r.head_sha === manifest.revision && r.head_branch === 'main' &&
          r.path === '.github/workflows/deploy-pages.yml' && r.conclusion === 'success' && ['push', 'workflow_dispatch'].includes(r.event));
        requireValue(run && Number.isSafeInteger(run.id), 503, 'deployment_not_verified');
        const jobs = await github('/actions/runs/' + run.id + '/jobs?per_page=100', env);
        requireValue(jobs.jobs.some(job => job.name === 'deploy' && job.conclusion === 'success'), 503, 'deployment_not_successful');
        const body = await publicText(manifest.index_path);
        requireValue(await sha256(body) === manifest.index_sha256, 503, 'index_digest_mismatch');
        const snapshot = JSON.parse(body); validateSnapshot(snapshot, manifest);
        for (const article of snapshot.articles) requireValue(await sha256(article.markdown) === article.content_digest, 503, 'article_digest_mismatch');
        // Catch a Pages rollout between fetching its manifest and its index.
        requireValue(await publicText('knowledge-manifest.json') === manifestText, 503, 'deployment_changed_during_sync');
        await db.prepare("INSERT INTO knowledge_snapshots(revision,manifest_digest,contract_digest,status,imported_at,payload_json) VALUES(?,?,?,'staging',?,?) ON CONFLICT(revision) DO UPDATE SET payload_json=excluded.payload_json")
          .bind(manifest.revision, manifestHash, manifest.contract_digest, now, body).run();
      }
      const activationTime = epoch();
      const guard = 'EXISTS(SELECT 1 FROM runtime_sync WHERE id=1 AND lock_token=? AND lock_until>=?)';
      const results = await db.batch([
        db.prepare('UPDATE runtime_sync SET lock_until=? WHERE id=1 AND lock_token=? AND lock_until>=? RETURNING id').bind(activationTime + 120, token, activationTime),
        db.prepare("UPDATE knowledge_snapshots SET status='retired' WHERE status='active' AND revision!=? AND " + guard).bind(manifest.revision, token, activationTime),
        db.prepare("UPDATE knowledge_snapshots SET status='active',activated_at=? WHERE revision=? AND " + guard).bind(now, manifest.revision, token, activationTime),
        db.prepare('UPDATE runtime_sync SET repo_head=?,published_revision=?,checked_at=?,error_code=NULL,lock_token=NULL,lock_until=0 WHERE id=1 AND lock_token=? AND lock_until>=?')
          .bind(repoHead, manifest.revision, now, token, activationTime),
      ]);
      requireValue(results[0].results.length === 1 && results[2].meta.changes === 1, 503, 'sync_lease_lost');
    } catch (error) {
      await db.prepare('UPDATE runtime_sync SET repo_head=COALESCE(?,repo_head),checked_at=?,error_code=?,lock_token=NULL,lock_until=0 WHERE id=1 AND lock_token=?')
        .bind(repoHead, epoch(), error instanceof ApiError ? error.code : 'sync_unavailable', token).run();
    }
    return activeSnapshot(db);
  };
}

const normalized = text => text.normalize('NFKC').toLowerCase();
export function search(snapshot, query, limit = 6) {
  const ignored = new Set(['如何', '什么', '一个', '学习', '知识', '了解', '帮我', '这个', '当前', '网站', '介绍']);
  const terms = [...new Set((normalized(query).match(/[a-z][a-z0-9_-]{1,}|[\u3400-\u9fff]{2,}/g) || []).flatMap(t =>
    /^[a-z]/.test(t) ? [t] : Array.from({length: t.length - 1}, (_, i) => t.slice(i, i + 2))))].filter(t => !ignored.has(t));
  const has = (text, term) => /^[a-z0-9_-]{2,3}$/.test(term) ? new RegExp('(^|[^a-z0-9])' + term + '($|[^a-z0-9])').test(text) : text.includes(term);
  const hits = [];
  for (const article of snapshot.articles) {
    for (const section of [{anchor: null, title: article.title, text: article.text}, ...article.sections]) {
      const topic = snapshot.topics.find(t => t.article === article.id && t.anchor === section.anchor);
      const title = normalized([section.title, topic?.title, ...(topic?.aliases || [])].join(' '));
      const body = normalized(section.text);
      const score = terms.reduce((sum, term, i) => sum + (has(title, term) ? 20 + terms.length - i : 0) + (has(body, term) ? 1 : 0), 0);
      if (!score) continue;
      const anchor = section.anchor;
      hits.push({source_id: article.id + (anchor ? ':' + anchor : ''), article_id: article.id, topic_id: topic?.id || article.id,
        anchor, title: section.title, primary_domain: article.primary_domain, revision: snapshot.revision,
        excerpt: section.text.slice(0, 1800), content_digest: article.content_digest, score,
        url: SITE + '?page=' + encodeURIComponent(article.id) + (anchor ? '#' + encodeURIComponent(anchor) : '')});
    }
  }
  return hits.sort((a, b) => b.score - a.score).slice(0, limit);
}

export function readingContext(value, snapshot) {
  if (value === undefined || value === null) return {};
  requireValue(record(value) && Object.keys(value).every(k => ['article_id', 'topic_id', 'anchor', 'view'].includes(k)), 400, 'invalid_reading_context');
  const result = {};
  if (value.article_id) {
    const article = snapshot.articles.find(a => a.id === value.article_id); requireValue(article, 400, 'unknown_article');
    result.article_id = article.id;
    if (value.anchor) { requireValue(article.sections.some(s => s.anchor === value.anchor), 400, 'unknown_anchor'); result.anchor = value.anchor; }
  }
  if (value.topic_id) {
    const topic = snapshot.topics.find(t => t.id === value.topic_id);
    requireValue(topic && (!result.article_id || topic.article === result.article_id), 400, 'unknown_topic'); result.topic_id = topic.id;
  }
  if (value.view) {
    const [kind, key] = String(value.view).split(':');
    const views = {stage: snapshot.architecture.lifecycle, loop: snapshot.architecture.loops,
      context: snapshot.architecture.contexts, domain: snapshot.domains};
    requireValue(Object.hasOwn(views, kind) && views[kind]?.some(v => v.id === key) && value.view === kind + ':' + key, 400, 'unknown_view'); result.view = value.view;
  }
  return result;
}
