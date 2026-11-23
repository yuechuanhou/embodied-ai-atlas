import {ApiError, canonical, epoch, exactKeys, requireValue, sha256, text, uid} from './common.js';
import {modelConfiguration, modelInput, callModel, validateModelResult} from './model.js';
import {readingContext, search} from './knowledge.js';

export async function sendMessage({body, sessionId, ownerId, env, snapshot, fresh, fetchImpl}) {
  requireValue(exactKeys(body, ['request_id', 'message', 'reading_context', 'selected_text']) &&
    typeof body.request_id === 'string' && body.request_id.length === 36 && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(body.request_id) && text(body.message, 4000) &&
    (body.selected_text === undefined || typeof body.selected_text === 'string' && body.selected_text.length <= 2000), 400, 'invalid_message');
  const db = env.DB, requestId = body.request_id, now = epoch(), inputDigest = await sha256(canonical(body));
  const session = await db.prepare('SELECT * FROM sessions WHERE id=? AND owner_id=?').bind(sessionId, ownerId).first();
  requireValue(session, 404, 'session_not_found'); requireValue(session.status === 'active', 409, 'session_archived');
  const existing = await db.prepare('SELECT * FROM runtime_requests WHERE id=? AND owner_id=? AND session_id=?')
    .bind(requestId, ownerId, sessionId).first();
  if (existing) {
    requireValue(existing.input_digest === inputDigest, 409, 'request_id_reused');
    if (existing.status === 'completed') return JSON.parse(existing.response_json);
    throw new ApiError(409, existing.status === 'failed' ? existing.error_code : 'request_in_progress');
  }
  const context = readingContext(body.reading_context, snapshot), selected = body.selected_text || '';
  let claim;
  try {
    claim = await db.batch([
      db.prepare("INSERT INTO runtime_requests(id,owner_id,session_id,input_digest,status,created_at,updated_at) VALUES(?,?,?,?,'pending',?,?)")
        .bind(requestId, ownerId, sessionId, inputDigest, now, now),
      db.prepare('UPDATE sessions SET active_request_id=?,lease_until=?,updated_at=?,reading_context_json=? WHERE id=? AND owner_id=? AND (active_request_id IS NULL OR lease_until<=?) RETURNING id')
        .bind(requestId, now + 90, now, canonical(context), sessionId, ownerId, now),
    ]);
  } catch { throw new ApiError(409, 'request_in_progress'); }
  if (!claim[1].results.length) {
    await db.prepare("UPDATE runtime_requests SET status='failed',error_code='session_busy' WHERE id=? AND owner_id=?").bind(requestId, ownerId).run();
    throw new ApiError(409, 'session_busy');
  }
  try {
    const max = await db.prepare('SELECT COALESCE(MAX(sequence),0) AS value FROM messages WHERE session_id=?').bind(sessionId).first();
    const sequence = max.value + 1;
    await db.batch([
      db.prepare("UPDATE runtime_requests SET status='processing' WHERE id=? AND owner_id=?").bind(requestId, ownerId),
      db.prepare("INSERT INTO messages(id,session_id,sequence,role,body,status,metadata_json,created_at) VALUES(?,?,?,'user',?,'complete',?,?)")
        .bind(requestId + ':user', sessionId, sequence, body.message, canonical({reading_context: context, selected_text: selected, revision: snapshot.revision}), now),
    ]);
    const sources = search(snapshot, body.message, 6, context), config = modelConfiguration(env);
    const catalog = (await db.prepare("SELECT id,title,placement_json FROM knowledge_candidates WHERE session_id=? AND owner_id=? AND status!='dismissed' ORDER BY updated_at DESC LIMIT 12")
      .bind(sessionId, ownerId).all()).results;
    let result, mode = 'retrieval';
    if (config.ready && fresh) {
      const history = (await db.prepare("SELECT role,body,metadata_json FROM messages WHERE session_id=? AND sequence<? AND status='complete' ORDER BY sequence DESC LIMIT 8")
        .bind(sessionId, sequence).all()).results.reverse().map(message => ({role: message.role, body: message.body.slice(0, 800), revision: JSON.parse(message.metadata_json).revision || null}));
      const input = modelInput({question: body.message, selectedText: selected, context, history,
        sources: sources.map(s => ({source_id: s.source_id, article_id: s.article_id, topic_id: s.topic_id,
          primary_domain: s.primary_domain, anchor: s.anchor, title: s.title, excerpt: s.excerpt.slice(0, 1000)})), candidates: catalog, snapshot});
      const reservation = new TextEncoder().encode(input.instructions + input.input).length + config.outputTokens + 1024;
      requireValue(reservation <= config.tokenLimit, 429, 'daily_model_budget_exceeded');
      const day = new Date(now * 1000).toISOString().slice(0, 10);
      const budget = await db.prepare('INSERT INTO usage_daily(owner_id,day,calls,reserved_tokens) VALUES(?,?,1,?) ON CONFLICT(owner_id,day) DO UPDATE SET calls=calls+1,reserved_tokens=reserved_tokens+excluded.reserved_tokens WHERE calls<? AND reserved_tokens+excluded.reserved_tokens<=? RETURNING calls')
        .bind(ownerId, day, reservation, config.callLimit, config.tokenLimit).first();
      requireValue(budget, 429, 'daily_model_budget_exceeded');
      const response = await callModel(env, config, input, fetchImpl);
      result = validateModelResult(response.value, snapshot, sources, catalog); mode = 'model';
      if (Number.isSafeInteger(response.tokens) && response.tokens > 0 && response.tokens <= 100_000_000) {
        await db.prepare('UPDATE usage_daily SET reserved_tokens=reserved_tokens+? WHERE owner_id=? AND day=?')
          .bind(response.tokens - reservation, ownerId, day).run();
      }
    } else {
      result = {answer: (fresh ? '模型尚未配置，当前提供站内检索。' : '暂时无法核对最新部署；以下引用来自最近可用快照。') +
        (sources.length ? '已找到相关原文，可从下方入口继续阅读。' : '尚未找到直接内容，已把问题保留为需要查证的私人候选。'),
      cited_source_ids: sources.map(s => s.source_id), candidate: sources.length ? null : {
        candidate_id: null, title: body.message.slice(0, 120), markdown: '待学习的问题：' + body.message,
        article_id: context.article_id || null,
        primary_domain: context.article_id ? snapshot.articles.find(a => a.id === context.article_id).primary_domain : null,
      }};
    }
    const citations = sources.filter(source => result.cited_source_ids.includes(source.source_id));
    const statements = [], candidate = result.candidate;
    let candidateId = null;
    if (candidate) {
      const dedup = await sha256(candidate.title.normalize('NFKC').toLowerCase().trim().replace(/\s+/g, ' '));
      const prior = candidate.candidate_id ? await db.prepare('SELECT * FROM knowledge_candidates WHERE id=? AND owner_id=? AND session_id=?').bind(candidate.candidate_id, ownerId, sessionId).first() :
        await db.prepare('SELECT * FROM knowledge_candidates WHERE session_id=? AND owner_id=? AND dedup_key=?').bind(sessionId, ownerId, dedup).first();
      candidateId = prior?.id || uid();
      // Owner edits and reviews are never silently rewritten by later learning
      // turns. The original draft remains available for explicit Owner review.
      if (!prior || JSON.parse(prior.placement_json).owner_edited !== true && !['ready', 'dismissed'].includes(prior.status)) {
      statements.push(db.prepare("INSERT INTO knowledge_candidates(id,owner_id,session_id,title,dedup_key,status,evidence_status,draft_markdown,placement_json,source_revision,created_at,updated_at) VALUES(?,?,?,?,?,'researching','insufficient',?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET title=excluded.title,draft_markdown=excluded.draft_markdown,placement_json=excluded.placement_json,source_revision=excluded.source_revision,version=version+1,updated_at=excluded.updated_at")
        .bind(candidateId, ownerId, sessionId, candidate.title, prior?.dedup_key || dedup, candidate.markdown,
          canonical({article_id: candidate.article_id, primary_domain: candidate.primary_domain, unverified: true}), snapshot.revision, now, now));
      const sourceId = await sha256(ownerId + ':' + requestId + ':inference');
      statements.push(db.prepare("INSERT INTO source_records(id,owner_id,kind,reference,revision,visibility,checked_at,metadata_json) VALUES(?,?,'inference',?,?,'private',?,?)")
        .bind(sourceId, ownerId, 'session:' + sessionId + '/message:' + requestId, snapshot.revision, now, canonical({verification: 'unverified', mode})));
      statements.push(db.prepare('INSERT INTO candidate_sources(candidate_id,source_id,owner_id,supports) VALUES(?,?,?,?)')
        .bind(candidateId, sourceId, ownerId, 'Conversation provenance only; new technical claims require verification'));
      }
    }
    const output = {request_id: requestId, answer: result.answer, citations, candidate_id: candidateId,
      mode, revision: snapshot.revision, freshness: fresh ? 'current' : 'stale'};
    statements.unshift(db.prepare('INSERT INTO runtime_commit_guards(request_id,valid) SELECT ?,CASE WHEN active_request_id=? AND lease_until>=? THEN 1 ELSE 0 END FROM sessions WHERE id=? AND owner_id=?')
      .bind(requestId, requestId, epoch(), sessionId, ownerId));
    statements.push(db.prepare("INSERT INTO messages(id,session_id,sequence,role,body,status,citations_json,metadata_json,created_at) VALUES(?,?,?,'assistant',?,'complete',?,?,?)")
      .bind(requestId + ':assistant', sessionId, sequence + 1, result.answer, canonical(citations), canonical({revision: snapshot.revision, mode, candidate_id: candidateId}), epoch()));
    statements.push(db.prepare("UPDATE runtime_requests SET status='completed',response_json=?,updated_at=? WHERE id=? AND owner_id=?").bind(canonical(output), epoch(), requestId, ownerId));
    statements.push(db.prepare('UPDATE sessions SET active_request_id=NULL,lease_until=NULL,updated_at=? WHERE id=? AND owner_id=? AND active_request_id=?').bind(epoch(), sessionId, ownerId, requestId));
    statements.push(db.prepare('DELETE FROM runtime_commit_guards WHERE request_id=?').bind(requestId));
    await db.batch(statements); return output;
  } catch (error) {
    const code = error instanceof ApiError ? error.code : 'request_failed';
    await db.batch([
      db.prepare("UPDATE runtime_requests SET status='failed',error_code=?,updated_at=? WHERE id=? AND owner_id=?").bind(code, epoch(), requestId, ownerId),
      db.prepare('UPDATE sessions SET active_request_id=NULL,lease_until=NULL WHERE id=? AND owner_id=? AND active_request_id=?').bind(sessionId, ownerId, requestId),
    ]);
    if (error instanceof ApiError) throw error;
    throw new ApiError(502, code);
  }
}
