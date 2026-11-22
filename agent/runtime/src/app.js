import {ApiError, epoch, json, readJSONRequest, record, requireValue, uid} from './common.js';
import {createAuthenticator, mutationGuard} from './auth.js';
import {activeSnapshot, createKnowledgeSync, search} from './knowledge.js';
import {modelConfiguration} from './model.js';
import {sendMessage} from './chat.js';
import {candidateView, sessionTitle, validatedTitle} from './session-view.js';

export function createApplication({fetchImpl = fetch, renderWorkbench = null} = {}) {
  const authenticate = createAuthenticator(fetchImpl), synchronize = createKnowledgeSync(fetchImpl);
  const sessionFor = async (db, id, owner) => {
    const session = await db.prepare('SELECT * FROM sessions WHERE id=? AND owner_id=?').bind(id, owner).first();
    requireValue(session, 404, 'session_not_found'); return session;
  };
  async function fetchHandler(request, env) {
    try {
      const identity = await authenticate(request, env), owner = identity.ownerId;
      const {pathname, searchParams} = new URL(request.url), method = request.method;
      if (pathname.startsWith('/api/')) requireValue((!request.headers.get('Origin') || request.headers.get('Origin') === env.PRIVATE_ORIGIN) &&
        request.headers.get('Sec-Fetch-Site') !== 'cross-site', 403, 'request_origin_required');
      if (!['GET', 'HEAD'].includes(method)) mutationGuard(request, env);
      if (pathname === '/' && method === 'GET') {
        requireValue(renderWorkbench, 503, 'workbench_unavailable');
        const nonce = uid().replace(/-/g, '');
        return new Response(renderWorkbench(nonce), {headers: {'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer',
          'Content-Security-Policy': "default-src 'none'; script-src 'nonce-" + nonce + "'; style-src 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; base-uri 'none'; frame-ancestors 'none'; form-action 'self'"}});
      }
      requireValue(env.DB, 503, 'database_not_configured');
      const db = env.DB;
      if (pathname === '/api/status' && method === 'GET') {
        const sync = await db.prepare('SELECT repo_head,published_revision,checked_at,error_code FROM runtime_sync WHERE id=1').first();
        const snapshot = await activeSnapshot(db), config = modelConfiguration(env);
        const day = new Date().toISOString().slice(0, 10);
        const usage = await db.prepare('SELECT calls,reserved_tokens FROM usage_daily WHERE owner_id=? AND day=?').bind(owner, day).first();
        return json({signed_in: true, sync: {...sync, index_revision: snapshot?.revision || null,
          stale: !!sync.error_code || sync.checked_at < epoch() - 60},
          model: {ready: config.ready, provider: config.provider}, usage: usage || {calls: 0, reserved_tokens: 0}});
      }
      if (pathname === '/api/sync' && method === 'POST') {
        await synchronize(env, true);
        const sync = await db.prepare('SELECT repo_head,published_revision,checked_at,error_code FROM runtime_sync WHERE id=1').first();
        return json(sync, sync.error_code ? 503 : 200);
      }
      if (pathname === '/api/sessions' && method === 'GET') {
        const offset = Number(searchParams.get('offset') || 0);
        requireValue(Number.isSafeInteger(offset) && offset >= 0 && offset <= 10000, 400, 'invalid_offset');
        const rows = (await db.prepare("SELECT s.id,s.status,s.created_at,s.updated_at,s.reading_context_json,s.summary_json,(SELECT body FROM messages WHERE session_id=s.id AND role='user' ORDER BY sequence LIMIT 1) AS first_question FROM sessions s WHERE s.owner_id=? ORDER BY s.updated_at DESC,s.id LIMIT 51 OFFSET ?").bind(owner, offset).all()).results;
        return json({sessions: rows.slice(0, 50).map(({summary_json, first_question, ...s}) => ({...s, title: sessionTitle({summary_json}, first_question || '')})), next_offset: rows.length > 50 ? offset + 50 : null});
      }
      if (pathname === '/api/sessions' && method === 'POST') {
        const body = await readJSONRequest(request); requireValue(record(body) && Object.keys(body).length === 0, 400, 'empty_body_required');
        const id = uid(), now = epoch();
        await db.prepare('INSERT INTO sessions(id,owner_id,created_at,updated_at) VALUES(?,?,?,?)').bind(id, owner, now, now).run();
        return json({id}, 201);
      }
      const route = pathname.match(/^\/api\/sessions\/([a-f0-9-]{36})(?:\/(messages|export))?$/);
      if (route) {
        const [, id, action] = route, session = await sessionFor(db, id, owner);
        if (method === 'GET' && (!action || action === 'export')) {
          // A terminated Worker may never finish its catch handler. Reconcile the
          // expired attempt without replaying a possibly billed model request.
          await db.prepare("UPDATE runtime_requests SET status='failed',error_code='request_outcome_unknown',updated_at=? WHERE session_id=? AND owner_id=? AND status IN ('pending','processing') AND NOT EXISTS(SELECT 1 FROM sessions WHERE id=runtime_requests.session_id AND active_request_id=runtime_requests.id AND lease_until>=?)")
            .bind(epoch(), id, owner, epoch()).run();
          const messages = (await db.prepare('SELECT id,sequence,role,body,status,citations_json,metadata_json,created_at FROM messages WHERE session_id=? ORDER BY sequence').bind(id).all()).results;
          const candidates = (await db.prepare('SELECT * FROM knowledge_candidates WHERE session_id=? AND owner_id=? ORDER BY created_at').bind(id, owner).all()).results;
          const requests = (await db.prepare('SELECT id,status,error_code,updated_at FROM runtime_requests WHERE session_id=? AND owner_id=? ORDER BY created_at').bind(id, owner).all()).results;
          const sources = action === 'export' ? (await db.prepare('SELECT DISTINCT s.* FROM source_records s JOIN candidate_sources c ON c.source_id=s.id JOIN knowledge_candidates k ON k.id=c.candidate_id WHERE k.session_id=? AND s.owner_id=?').bind(id, owner).all()).results : undefined;
          const snapshot = await activeSnapshot(db);
          return json({schema_version: 1, session: {...session, title: sessionTitle(session, messages.find(m => m.role === 'user')?.body || '')}, messages,
            candidates: candidates.map(c => candidateView(c, snapshot)), requests, ...(sources ? {sources} : {})}, 200,
            action === 'export' ? {'Content-Disposition': 'attachment; filename="atlas-session-' + id + '.json"'} : {});
        }
        if (method === 'PATCH' && !action) {
          const title = validatedTitle(await readJSONRequest(request));
          const renamed = await db.prepare("UPDATE sessions SET summary_json=json_set(CASE WHEN json_type(summary_json)='object' THEN summary_json ELSE '{}' END,'$.title',?),updated_at=? WHERE id=? AND owner_id=? RETURNING id")
            .bind(title, epoch(), id, owner).first();
          requireValue(renamed, 404, 'session_not_found');
          return json({id, title});
        }
        if (method === 'DELETE' && !action) {
          requireValue(!session.active_request_id || session.lease_until <= epoch(), 409, 'session_busy');
          const deleted = await db.prepare('DELETE FROM sessions WHERE id=? AND owner_id=? AND (active_request_id IS NULL OR lease_until<=?) RETURNING id').bind(id, owner, epoch()).first();
          requireValue(deleted, 409, 'session_busy');
          return json({deleted: true, scope: 'session_messages_candidates_requests', retained: 'separate_proposal_audit_and_source_metadata'});
        }
        if (method === 'POST' && action === 'messages') {
          const body = await readJSONRequest(request), snapshot = await synchronize(env);
          requireValue(snapshot, 503, 'knowledge_not_ready');
          const sync = await db.prepare('SELECT * FROM runtime_sync WHERE id=1').first();
          const fresh = !sync.error_code && sync.checked_at >= epoch() - 60 && sync.published_revision === snapshot.revision;
          return json(await sendMessage({body, sessionId: id, ownerId: owner, env, snapshot, fresh, fetchImpl}));
        }
      }
      if (pathname === '/api/search' && method === 'POST') {
        const body = await readJSONRequest(request); requireValue(record(body) && typeof body.query === 'string' && body.query.length <= 4000, 400, 'invalid_query');
        const snapshot = await synchronize(env); requireValue(snapshot, 503, 'knowledge_not_ready');
        return json({revision: snapshot.revision, results: search(snapshot, body.query)});
      }
      throw new ApiError(404, 'not_found');
    } catch (error) {
      return json({error: error instanceof ApiError ? error.code : 'service_unavailable'}, error instanceof ApiError ? error.status : 503);
    }
  }
  return {fetch: fetchHandler, scheduled: async (_event, env) => { await synchronize(env); }};
}
