import {record, requireValue} from './common.js';
import {SITE} from './knowledge.js';

// Presentation metadata belongs to the session, never to the model's context.
export function sessionTitle(session, firstQuestion = '') {
  const summary = session.summary_json ? JSON.parse(session.summary_json) : null;
  if (record(summary) && typeof summary.title === 'string' && summary.title.trim()) return summary.title;
  const text = firstQuestion.replace(/\s+/gu, ' ').trim();
  return text ? Array.from(text).slice(0, 40).join('') + (Array.from(text).length > 40 ? '…' : '') : '新对话';
}

export function validatedTitle(body) {
  requireValue(record(body) && Object.keys(body).length === 1 && typeof body.title === 'string' &&
    !/[\u0000-\u001f\u007f]/u.test(body.title), 400, 'invalid_session_title');
  const title = body.title.trim().replace(/\s+/gu, ' ');
  requireValue(title.length > 0 && Array.from(title).length <= 80, 400, 'invalid_session_title');
  return title;
}

export function candidateView(candidate, snapshot) {
  const placement = JSON.parse(candidate.placement_json);
  const article = snapshot?.articles.find(a => a.id === placement.article_id);
  const domain = snapshot?.domains.find(d => d.id === placement.primary_domain);
  const articleLink = (a, anchor) => SITE + '?page=' + encodeURIComponent(a.id) + (anchor ? '#' + encodeURIComponent(anchor) : '');
  return {...candidate, placement_view: {
    domain: domain ? {id: domain.id, title: domain.name || domain.title || domain.id} : null,
    article: article ? {id: article.id, title: article.title, url: articleLink(article)} : null,
    // These are reference topics in the target article, not assigned candidate topics.
    article_topics: article ? snapshot.topics.filter(t => t.article === article.id).map(t => ({
      id: t.id, title: t.title, url: articleLink(article, t.anchor),
    })) : [],
    topics_assigned: false,
    unresolved: !!((placement.article_id && !article) || (placement.primary_domain && !domain)),
    domain_mismatch: !!(article && domain && article.primary_domain !== domain.id),
    snapshot_revision: snapshot?.revision || null,
    source_is_current: !!snapshot && candidate.source_revision === snapshot.revision,
  }};
}
