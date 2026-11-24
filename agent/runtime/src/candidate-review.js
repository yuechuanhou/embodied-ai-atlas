import {canonical, epoch, exactKeys, hex40, requireValue, sha256, text, uid} from './common.js';
import {candidateView} from './session-view.js';
import {architectureDiscussion, organizationView} from './candidate-organization.js';

export const candidateStatuses = {captured: '已记录', researching: '待查证', drafting: '整理中', ready: '已整理 · 待正式提案', dismissed: '暂不采用'};
const fields = ['version', 'snapshot_revision', 'title', 'draft_markdown', 'primary_domain', 'article_id', 'status', 'evidence'];

export async function candidateFor(db, id, owner) {
  const candidate = await db.prepare('SELECT * FROM knowledge_candidates WHERE id=? AND owner_id=?').bind(id, owner).first();
  requireValue(candidate, 404, 'candidate_not_found'); return candidate;
}
export async function candidateDetail(db, candidate, snapshot) {
  const placement = JSON.parse(candidate.placement_json), review = placement.review;
  const source = review ? await db.prepare('SELECT s.* FROM source_records s JOIN candidate_sources c ON c.source_id=s.id AND c.owner_id=s.owner_id WHERE c.candidate_id=? AND s.id=? AND s.owner_id=?')
    .bind(candidate.id, review.source_id, candidate.owner_id).first() : null;
  return {candidate: candidateView(candidate, snapshot), evidence: source ? {...source, metadata: JSON.parse(source.metadata_json)} : null,
    snapshot_revision: snapshot?.revision || null,
    domains: (snapshot?.domains || []).filter(d => !d.auxiliary).map(d => ({id: d.id, title: d.name || d.title || d.id})),
    articles: (snapshot?.articles || []).map(a => ({id: a.id, title: a.title, primary_domain: a.primary_domain}))};
}
function validate(body, snapshot) {
  requireValue(exactKeys(body, [...fields, 'architecture_reviewed']) && fields.every(f => Object.hasOwn(body, f)) &&
    (body.architecture_reviewed === undefined || typeof body.architecture_reviewed === 'boolean') && Number.isSafeInteger(body.version) && body.version > 0 &&
    hex40(body.snapshot_revision) && text(body.title, 160) && !/[\u0000-\u001f\u007f]/u.test(body.title) && text(body.draft_markdown, 12000) &&
    Object.hasOwn(candidateStatuses, body.status), 400, 'invalid_candidate_review');
  requireValue(snapshot && body.snapshot_revision === snapshot.revision, 409, 'candidate_snapshot_changed');
  requireValue(body.primary_domain === null || snapshot.domains.some(d => !d.auxiliary && d.id === body.primary_domain), 400, 'invalid_candidate_placement');
  requireValue(body.article_id === null || snapshot.articles.some(a => a.id === body.article_id && a.primary_domain === body.primary_domain), 400, 'invalid_candidate_placement');
  if (body.architecture_reviewed) requireValue(body.primary_domain, 400, 'invalid_candidate_placement');
  if (body.evidence !== null) {
    const e = body.evidence;
    requireValue(exactKeys(e, ['kind', 'reference', 'supports', 'owner_confirmed']) && ['official', 'paper', 'experience'].includes(e.kind) &&
      text(e.reference, 2000) && text(e.supports, 3000) && e.owner_confirmed === true, 400, 'candidate_evidence_required');
    if (e.kind !== 'experience') {
      let url; try {url = new URL(e.reference);} catch {}
      // This is an Owner-supplied reference, never fetched by this endpoint.
      requireValue(url?.protocol === 'https:' && !url.username && !url.password && !/[\s<>]/u.test(e.reference), 400, 'invalid_evidence_reference');
    }
  }
  if (body.status === 'ready') requireValue(body.primary_domain && body.evidence, 400, 'candidate_evidence_required');
}
export async function saveCandidate({db, owner, candidate, body, snapshot, sync}) {
  validate(body, snapshot);
  requireValue(candidate.version === body.version, 409, 'candidate_version_changed');
  if (body.status === 'ready') requireValue(sync && !sync.error_code && sync.checked_at >= epoch() - 60 &&
    sync.repo_head === snapshot.revision && sync.published_revision === snapshot.revision, 409, 'candidate_sync_required');
  const now = epoch(), placement = {...JSON.parse(candidate.placement_json), article_id: body.article_id,
    primary_domain: body.primary_domain, owner_edited: true, unverified: !body.evidence};
  delete placement.review;
  delete placement.organization_resolution;
  if (body.architecture_reviewed) placement.organization_resolution = {snapshot_revision: snapshot.revision, candidate_version: body.version + 1,
    primary_domain: body.primary_domain, article_id: body.article_id};
  if (body.status === 'ready') requireValue(!organizationView(placement, snapshot, body.version + 1).blocks_proposal, 409, 'candidate_architecture_review_required');
  const statements = [], evidence = body.evidence, sourceId = evidence ? uid() : null;
  if (evidence) {
    const digest = await sha256(canonical({title: body.title.trim(), markdown: body.draft_markdown,
      article_id: body.article_id, primary_domain: body.primary_domain, snapshot_revision: snapshot.revision}));
    placement.review = {source_id: sourceId, draft_digest: digest, snapshot_revision: snapshot.revision, candidate_version: body.version + 1};
  }
  // Conditional evidence inserts follow the CAS update in the same transaction.
  // A failed CAS writes nothing; a lost response cannot duplicate a review.
  statements.push(db.prepare('UPDATE knowledge_candidates SET title=?,draft_markdown=?,placement_json=?,status=?,evidence_status=?,version=version+1,updated_at=? WHERE id=? AND owner_id=? AND version=? AND EXISTS(SELECT 1 FROM sessions s WHERE s.id=knowledge_candidates.session_id AND s.owner_id=? AND (s.active_request_id IS NULL OR s.lease_until<=?)) AND EXISTS(SELECT 1 FROM knowledge_snapshots WHERE status=\'active\' AND revision=?) RETURNING id')
    .bind(body.title.trim(), body.draft_markdown, canonical(placement), body.status, evidence ? evidence.kind === 'experience' ? 'owner_experience' : 'checked' : 'insufficient', now, candidate.id, owner, body.version, owner, now, snapshot.revision));
  if (evidence) {
    statements.push(db.prepare('INSERT INTO source_records(id,owner_id,kind,reference,content_digest,revision,visibility,checked_at,metadata_json) SELECT ?,?,?,?,?,?,\'private\',?,? WHERE changes()=1')
      .bind(sourceId, owner, evidence.kind, evidence.reference.trim(), placement.review.draft_digest, snapshot.revision, now,
        canonical({verification: 'owner_attested', supports: evidence.supports.trim(), candidate_version: body.version + 1, fetched_by_agent: false})));
    statements.push(db.prepare('INSERT INTO candidate_sources(candidate_id,source_id,owner_id,supports) SELECT ?,?,?,? WHERE changes()=1').bind(candidate.id, sourceId, owner, evidence.supports.trim()));
  }
  const results = await db.batch(statements);
  requireValue(results[0].meta.changes === 1, 409, 'candidate_review_conflict');
  return candidateDetail(db, await candidateFor(db, candidate.id, owner), snapshot);
}
export async function exportCandidate(db, candidate, snapshot, version) {
  requireValue(Number.isSafeInteger(version) && version === candidate.version, 409, 'candidate_version_changed');
  const {candidate: view, evidence} = await candidateDetail(db, candidate, snapshot), placement = view.placement_view;
  const checked = placement.review_is_current;
  const lines = ['# ' + candidate.title, '', '> 私人知识整理稿 · 尚未入库或发布', '',
    '- 状态：' + candidateStatuses[candidate.status], '- Primary Domain：' + (placement.domain?.title || '待归类'),
    '- 目标文章：' + (placement.article ? '[' + placement.article.title + '](' + placement.article.url + ')' : '待正式提案决定'),
    '- 候选版本：v' + candidate.version, '- 原始知识快照：' + (candidate.source_revision || '未知'),
    '- 本人核对：' + (checked ? '已对照 ' + placement.snapshot_revision + ' 核对本版草稿；不代表 Agent 已检索外部来源' : '尚未核对或依据版本已变化'), '',
    '## 整理正文', '', candidate.draft_markdown, '', '## 私人核对记录', '',
    ...(evidence ? ['- 类型：' + evidence.kind, '- 参考：' + evidence.reference, '- 支持结论与适用条件：' + evidence.metadata.supports] : ['尚无本人确认的来源或工程经验。']), '',
    ...(placement.organization.advice || placement.organization.status !== 'fits' ? [architectureDiscussion(candidate, placement.organization), ''] : []),
    '正式提案仍需检查 Topic、关系、完整文件差异及公开范围。此导出不会修改 GitHub。', ''];
  return new Response(lines.join('\n'), {headers: {'Content-Type': 'text/markdown; charset=utf-8', 'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer',
    'Content-Disposition': 'attachment; filename="atlas-candidate-' + candidate.id + '-v' + candidate.version + '.md"'}});
}
