import {renderMarkdown} from './markdown.js';

const get = id => document.getElementById(id);
const node = (tag, text = '', cls = '') => {const el = document.createElement(tag); el.textContent = text; if (cls) el.className = cls; return el;};
let active = null, activeTitle = '新对话', offset = 0, sessions = [], busy = false, ready = false, context = {}, retry = null, loadToken = 0;
let drawer = null, drawerReturn = null;
const hints = {authentication_required: '请重新登录私人工作台。', invalid_identity: '登录已失效，请刷新并重新登录。', owner_required: '此工作台仅允许 Owner 使用。',
  knowledge_not_ready: '知识快照尚未就绪，请同步内容后再试。', daily_model_budget_exceeded: '已达到今天配置的模型调用上限。', model_request_incomplete: '模型请求未完成；请先核对结果，避免重复提交。',
  model_output_truncated: '模型输出达到上限，本次回答和草稿未保存。请核对结果；重新发起会再次调用模型。',
  model_refused: '模型未接受本次问题，本次未保存回答或草稿。可以调整问题后发起新的请求。',
  model_context_limit: '模型上下文达到上限，本次未保存回答或草稿。可以缩短问题或开始新对话。',
  model_output_incomplete: '模型未正常完成输出，本次未保存回答或草稿。请核对结果后再决定是否重新发起。',
  request_in_progress: '此请求仍在处理中，请稍后核对结果。', request_outcome_unknown: '上次请求已中断，结果和用量可能未能返回；请核对会话，再决定是否重新调用。',
  session_busy: '当前会话仍有请求处理中。', invalid_session_title: '请输入 1–80 个字符的名称，不含换行或控制字符。', service_unavailable: '私人服务暂不可用，请稍后重试。'};
async function api(path, method = 'GET', body) {
  const response = await fetch(path, {method, credentials: 'same-origin', headers: method === 'GET' ? {} : {'Content-Type': 'application/json', 'X-Atlas-Request': '1'}, body: body === undefined ? undefined : JSON.stringify(body)});
  if (!response.headers.get('content-type')?.includes('application/json')) throw new Error('authentication_required');
  const data = await response.json(); if (!response.ok) throw new Error(data.error || 'service_unavailable'); return data;
}
const report = error => {get('error').textContent = hints[error.message] || '操作未完成，请稍后重试。';};
const handle = fn => async event => {try {await fn(event);} catch (error) {report(error);}};
const announce = text => {get('announcer').textContent = text;};
function controls() {
  get('send').disabled = !ready || busy;
  for (const id of ['new-session', 'rename', 'delete-session']) get(id).disabled = !ready || busy || (id !== 'new-session' && !active);
  get('export').disabled = !active;
  for (const item of get('sessions').querySelectorAll('button')) item.disabled = busy;
  get('composer-hint').textContent = busy ? '回答生成中，可以先写下一条问题' : 'Enter 发送 · Shift + Enter 换行';
}
function title(text) {activeTitle = text; get('conversation-title').textContent = text; document.title = text + ' · Atlas';}
function scrollBottom() {const el = get('chat-scroll'); el.scrollTop = el.scrollHeight;}
function avatar() {return get('avatar').content.cloneNode(true);}
function appendMessage(message, optimistic = false) {
  const el = node('section', '', 'message ' + message.role + (optimistic ? ' just-sent' : ''));
  el.setAttribute('aria-label', message.role === 'user' ? '你的提问' : 'Atlas 的回答');
  if (message.role !== 'user') {const mark = node('div', '', 'message-avatar'); mark.setAttribute('aria-hidden', 'true'); mark.append(avatar()); el.append(mark);}
  const body = node('div', '', 'message-content');
  if (message.role === 'user') body.append(node('p', message.body)); else body.append(renderMarkdown(message.body, document));
  el.append(body);
  const sources = JSON.parse(message.citations_json || '[]');
  if (sources.length) {
    const group = node('div', '', 'sources'); group.setAttribute('aria-label', '引用的站内原文');
    for (const source of sources) {
      const link = safeLink(source.title, source.url, 'source');
      link.append(node('small', '站内原文 · ' + source.revision.slice(0, 8))); group.append(link);
    }
    el.append(group);
  }
  get('messages').append(el); get('empty-state').hidden = true;
}
function safeLink(text, href, cls = '') {
  try {const url = new URL(href); if (!['https:', 'http:'].includes(url.protocol)) throw new Error();
    const link = node('a', text, cls); link.href = url.href; link.target = '_blank'; link.rel = 'noopener noreferrer'; return link;
  } catch {return node('span', text, cls);}
}
function candidates(items) {
  const target = get('candidates'); target.replaceChildren();
  get('candidate-count').textContent = String(items.length); get('panel-count').textContent = String(items.length);
  if (!items.length) {
    const empty = node('div', '', 'candidate-empty'); empty.append(avatar(), node('h3', '让新理解慢慢沉淀'), node('p', '对话中值得保留的内容会整理在这里。候选保持私有，你可以先专注学习。')); target.append(empty); return;
  }
  for (const candidate of items) {
    const view = candidate.placement_view || {}, card = node('section', '', 'candidate');
    const evidence = {insufficient: '待查证', checked: '已核验来源', owner_experience: '个人经验'}[candidate.evidence_status] || '待查证';
    card.append(node('h3', candidate.title), node('p', '私人候选 · ' + evidence + ' · v' + candidate.version, 'candidate-state'));
    const metadata = node('dl', '', 'metadata');
    function row(label, value) {metadata.append(node('dt', label)); const dd = node('dd'); dd.append(typeof value === 'string' ? document.createTextNode(value) : value); metadata.append(dd); return dd;}
    const domain = row('Primary Domain', view.domain?.title || '尚未归类'); if (view.domain) domain.append(node('code', view.domain.id));
    const article = row('目标文章', view.article ? safeLink(view.article.title, view.article.url) : '尚未指定'); if (view.article) article.append(node('code', view.article.id));
    row('Topic 归属', '尚未指定');
    card.append(metadata);
    if (view.unresolved || view.domain_mismatch) card.append(node('p', '归属信息与当前知识快照不一致，需要重新核对。', 'candidate-warning'));
    if (view.article_topics?.length) {
      const refs = node('details'); refs.append(node('summary', '文章已有 Topic · 归类参考'));
      const list = node('div', '', 'reference-topics'); for (const topic of view.article_topics) list.append(safeLink(topic.title, topic.url)); refs.append(list, node('p', '仅供参考，尚未分配给此候选。', 'candidate-warning')); card.append(refs);
    }
    const details = node('details'); details.open = items.length === 1; details.append(node('summary', '查看候选正文'));
    const body = node('div', '', 'message-content'); body.append(renderMarkdown(candidate.draft_markdown, document)); details.append(body); card.append(details);
    card.append(node('p', '来源版本 ' + candidate.source_revision.slice(0, 8) + (view.source_is_current ? ' · 当前快照' : ' · 与当前快照不同，入库前需核对'), 'candidate-warning'));
    target.append(card);
  }
}
async function status() {
  const {sync, model} = await api('/api/status');
  get('status').textContent = (sync.error_code ? '内容核对失败 · 使用最近快照' : sync.stale && sync.index_revision ? '知识快照待核对' : sync.index_revision ? '已载入知识快照' : '尚未同步知识内容') +
    (model.ready ? ' · 模型已配置' : ' · 站内检索模式');
  get('status').title = 'main: ' + sync.repo_head + '\npublished: ' + sync.published_revision + '\nindex: ' + sync.index_revision;
  if (sync.repo_head && sync.published_revision && sync.repo_head !== sync.published_revision) get('status').textContent += ' · 线上版本待更新';
}
async function list(more = false) {
  const data = await api('/api/sessions?offset=' + (more ? offset : 0));
  sessions = more ? [...sessions, ...data.sessions] : data.sessions; offset = data.next_offset;
  get('sessions').replaceChildren(); get('more').hidden = offset === null;
  for (const session of sessions) {
    const button = node('button', '', 'session-item'); button.type = 'button'; button.append(node('strong', session.title), node('small', new Date(session.updated_at * 1000).toLocaleDateString()));
    button.dataset.sessionId = session.id; button.title = session.title; button.setAttribute('aria-current', String(session.id === active));
    button.onclick = handle(async () => {await load(session.id); if (innerWidth <= 760) setPanel('history', false);}); get('sessions').append(button);
  }
  controls();
}
async function load(id, duringSend = false) {
  if (busy && !duringSend) return;
  const token = ++loadToken, data = await api('/api/sessions/' + id);
  if (token !== loadToken) return;
  active = id; title(data.session.title); get('messages').replaceChildren(); get('error').textContent = ''; get('empty-state').hidden = !!data.messages.length;
  for (const message of data.messages) appendMessage(message);
  candidates(data.candidates);
  const request = retry?.session === id ? data.requests.find(r => r.id === retry.body.request_id) : null;
  if (request?.status === 'completed') retry = null;
  {
    const lastMessage = data.messages.at(-1);
    if (!retry && lastMessage?.role === 'user') {
      const requestId = lastMessage.id.split(':')[0];
      const pending = data.requests.find(r => r.id === requestId);
      if (pending && pending.status !== 'completed') retry = {message: lastMessage.body, session: id, body: {request_id: pending.id, message: lastMessage.body, reading_context: context}};
    }
    const pending = retry?.session === id ? data.requests.find(r => r.id === retry.body.request_id) : null;
    get('check-result').hidden = !pending || busy;
    get('new-attempt').hidden = pending?.status !== 'failed' || busy;
    if (pending && !busy) report(new Error(pending.error_code || 'request_in_progress'));
  }
  for (const button of get('sessions').querySelectorAll('button')) button.setAttribute('aria-current', String(button.dataset.sessionId === active));
  controls(); scrollBottom(); return data;
}
function autosize() {const input = get('question'); input.style.height = 'auto'; input.style.height = Math.min(input.scrollHeight || 52, 160) + 'px';}
get('question').addEventListener('input', autosize);
get('form').onsubmit = handle(async event => {
  event.preventDefault(); const message = get('question').value.trim(); if (!message || busy || !ready) return;
  if (retry?.session === active && retry.message !== message) {
    report(new Error('request_in_progress')); get('check-result').hidden = false; return;
  }
  busy = true; ++loadToken; controls(); get('error').textContent = ''; get('check-result').hidden = true; get('new-attempt').hidden = true;
  // Render and clear before the first await, including creation of a new session.
  appendMessage({role: 'user', body: message}, true); get('question').value = ''; autosize(); get('waiting').hidden = false;
  announce('提问已发送，正在等待回答。'); scrollBottom(); let failure = null;
  try {
    if (!active) {active = (await api('/api/sessions', 'POST', {})).id;}
    const body = retry && retry.message === message && retry.session === active ? retry.body : {request_id: crypto.randomUUID(), message, reading_context: context};
    retry = {message, session: active, body};
    await api('/api/sessions/' + active + '/messages', 'POST', body);
    retry = null;
  } catch (error) {failure = error;}
  finally {
    let restored = false, data;
    try {if (active) {data = await load(active, true); restored = true;} await list();} catch (error) {failure ||= error;}
    busy = false; get('waiting').hidden = true; controls();
    if (failure) {
      if (!get('question').value && (retry || !restored)) {get('question').value = message; autosize();}
      // A read after a lost response may prove the request completed.
      if (retry || !restored) {
        report(failure); get('check-result').hidden = !active;
        const pending = data?.requests.find(r => r.id === retry?.body.request_id);
        get('new-attempt').hidden = !retry || !data || (pending && pending.status !== 'failed');
        announce('请求未能完成，请核对结果。');
      }
    } else {announce('回答已保存。');}
    try {await status();} catch (error) {if (!failure) report(error);}
    scrollBottom();
  }
});
get('question').onkeydown = event => {if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {event.preventDefault(); get('form').requestSubmit();}};
get('new-session').onclick = handle(async () => {
  if (busy) return; ++loadToken; active = null; retry = null; title('新对话'); get('messages').replaceChildren(); candidates([]); get('empty-state').hidden = false;
  get('question').value = ''; autosize(); get('error').textContent = ''; get('check-result').hidden = true; get('new-attempt').hidden = true;
  for (const button of get('sessions').querySelectorAll('button')) button.setAttribute('aria-current', 'false'); controls();
  if (innerWidth <= 760) setPanel('history', false); get('question').focus();
});
get('more').onclick = handle(() => list(true));
get('check-result').onclick = handle(async () => {if (active) await load(active);});
get('new-attempt').onclick = () => {
  if (busy || !retry || !confirm('重新调用模型可能再次计入用量。确认开始新的尝试？')) return;
  // Preserve a different next-question draft instead of silently overwriting it.
  if (get('question').value.trim() && get('question').value.trim() !== retry.message) {get('error').textContent = '输入框中有新的问题，请先保留或清空，再重新发起上次请求。'; return;}
  get('question').value = retry.message; retry = null; get('form').requestSubmit();
};
get('refresh').onclick = handle(async () => {get('refresh').disabled = true; try {await api('/api/sync', 'POST', {}); await status(); announce('知识内容已同步。');} finally {get('refresh').disabled = false;}});
get('export').onclick = handle(async () => {
  if (!active) return; const data = await api('/api/sessions/' + active + '/export');
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], {type: 'application/json'})), link = node('a');
  link.href = url; link.download = 'atlas-session-' + active + '.json'; link.click(); URL.revokeObjectURL(url);
});
get('delete-session').onclick = handle(async () => {
  if (!active || busy || !confirm('删除当前会话、消息和未入库候选？独立提案审计与来源元数据会保留。')) return;
  const id = active; await api('/api/sessions/' + id, 'DELETE'); get('new-session').click(); await list(); announce('会话已删除。');
});
get('rename').onclick = () => {
  if (!active || busy) return; get('session-title').value = activeTitle; get('rename-error').textContent = '';
  get('rename-dialog').showModal(); get('session-title').focus(); get('session-title').select();
};
get('rename-cancel').onclick = () => get('rename-dialog').close();
get('rename-form').onsubmit = async event => {
  event.preventDefault(); const value = get('session-title').value.trim();
  if (!value || Array.from(value).length > 80 || /[\u0000-\u001f\u007f]/u.test(value)) {get('rename-error').textContent = hints.invalid_session_title; return;}
  get('rename-save').disabled = true;
  try {const data = await api('/api/sessions/' + active, 'PATCH', {title: value}); title(data.title); await list(); get('rename-dialog').close(); announce('对话名称已保存。');}
  catch (error) {get('rename-error').textContent = hints[error.message] || '名称未保存，请重试。';}
  finally {get('rename-save').disabled = false;}
};
get('rename-dialog').addEventListener('close', () => get('rename').focus());
get('theme').onclick = () => {const theme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'; document.documentElement.dataset.theme = theme; try {localStorage.setItem('atlas-workbench-theme', theme);} catch {}};
try {document.documentElement.dataset.theme = localStorage.getItem('atlas-workbench-theme') || (window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');} catch {}
function setPanel(kind, open) {
  const panel = get(kind === 'history' ? 'history-panel' : 'candidate-panel');
  const returnFocus = !open && panel.contains(document.activeElement);
  const app = get('app'); app.classList.toggle(kind + '-closed', !open);
  if (open && innerWidth <= 1250 && kind === 'candidates') app.classList.add('history-closed');
  if (open && innerWidth <= 760 && kind === 'history') app.classList.add('candidates-closed');
  updatePanels();
  if (returnFocus) get('toggle-' + kind).focus();
}
function updatePanels() {
  if (innerWidth <= 1250 && !get('app').classList.contains('candidates-closed')) get('app').classList.add('history-closed');
  const historyOpen = !get('app').classList.contains('history-closed'), candidatesOpen = !get('app').classList.contains('candidates-closed');
  get('toggle-history').setAttribute('aria-controls', 'history-panel'); get('toggle-history').setAttribute('aria-expanded', String(historyOpen));
  get('toggle-candidates').setAttribute('aria-expanded', String(candidatesOpen));
  get('history-panel').inert = !historyOpen; get('candidate-panel').inert = !candidatesOpen;
  const overlay = candidatesOpen && innerWidth <= 1250 ? get('candidate-panel') : historyOpen && innerWidth <= 760 ? get('history-panel') : null;
  get('chat-panel').inert = !!overlay;
  for (const panel of [get('history-panel'), get('candidate-panel')]) {if (panel === overlay) {panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-modal', 'true');} else {panel.removeAttribute('role'); panel.removeAttribute('aria-modal');}}
  if (overlay && drawer !== overlay) {drawerReturn = document.activeElement; overlay.querySelector('button').focus();}
  if (!overlay && drawer) drawerReturn?.focus(); drawer = overlay;
}
get('toggle-history').onclick = () => setPanel('history', get('app').classList.contains('history-closed'));
get('toggle-candidates').onclick = () => setPanel('candidates', get('app').classList.contains('candidates-closed'));
get('close-history').onclick = () => setPanel('history', false); get('close-candidates').onclick = () => setPanel('candidates', false);
get('scrim').onclick = () => {setPanel('history', false); setPanel('candidates', false);};
document.addEventListener('keydown', event => {
  if (!drawer) return;
  if (event.key === 'Escape') {event.preventDefault(); setPanel('history', false); setPanel('candidates', false);}
  if (event.key === 'Tab') {
    const focusable = [...drawer.querySelectorAll('button:not(:disabled):not([hidden]),a[href],summary')].filter(el => el.getClientRects().length);
    const first = focusable[0], last = focusable.at(-1);
    if (event.shiftKey && document.activeElement === first) {last?.focus(); event.preventDefault();}
    else if (!event.shiftKey && document.activeElement === last) {first?.focus(); event.preventDefault();}
  }
});
window.addEventListener('resize', updatePanels);
if (innerWidth <= 760) get('app').classList.add('history-closed'); updatePanels();
for (const button of document.querySelectorAll('[data-prompt]')) button.onclick = () => {get('question').value = button.dataset.prompt; autosize(); get('question').focus();};
try {
  const data = JSON.parse(decodeURIComponent(location.hash.slice(1)) || '{}');
  for (const key of ['article_id', 'topic_id', 'anchor', 'view']) if (typeof data[key] === 'string' && data[key].length <= 300) context[key] = data[key];
} catch {}
get('private-context').textContent = context.article_id ? '阅读上下文 · ' + context.article_id : '';
candidates([]); controls();
(async () => {try {await status(); await list(); if (sessions.length) await load(sessions[0].id); ready = true; controls();} catch (error) {report(error);}})();
