import {renderMarkdown} from './markdown.js';
import {AGENT_NAME, createReadingView} from './reading-view.js';
import {createCandidateEditor} from './candidate-editor.js';

const get = id => document.getElementById(id);
const node = (tag, text = '', cls = '') => {const el = document.createElement(tag); el.textContent = text; if (cls) el.className = cls; return el;};
let active = null, activeTitle = '新对话', offset = 0, sessions = [], busy = false, ready = false, context = {}, retry = null, loadToken = 0;
let drawer = null, drawerReturn = null;
let deleting = false, deleteTarget = null, deleteReturn = null;
let savingSession = false, renameTarget = null, renameReturn = null, menuTarget = null, menuTrigger = null;
let listToken = 0;
let currentCandidates = [];
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
  const locked = busy || deleting || savingSession;
  if (locked) closeSessionMenu(false);
  get('send').disabled = !ready || locked;
  get('more').disabled = !ready || locked;
  for (const id of ['new-session', 'rename', 'delete-session']) get(id).disabled = !ready || locked || (id !== 'new-session' && !active);
  get('export').disabled = !active || deleting;
  for (const item of get('sessions').querySelectorAll('button')) item.disabled = locked;
  for (const item of get('candidates').querySelectorAll('button')) item.disabled = locked;
  get('composer-hint').textContent = deleting ? '正在删除对话…' : savingSession ? '正在保存对话设置…' : busy ? '回答生成中，可以先写下一条问题' : 'Enter 发送 · Shift + Enter 换行';
}
function title(text) {activeTitle = text; get('conversation-title').textContent = text; document.title = text + ' · ' + AGENT_NAME;}
function scrollBottom() {const el = get('chat-scroll'); el.scrollTop = el.scrollHeight;}
function avatar() {return get('avatar').content.cloneNode(true);}
function appendMessage(message, optimistic = false) {
  const el = node('section', '', 'message ' + message.role + (optimistic ? ' just-sent' : ''));
  el.setAttribute('aria-label', message.role === 'user' ? '你的提问' : AGENT_NAME + ' 的回答');
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
    const link = node('a', text, cls); link.href = url.href; link.target = '_blank'; link.rel = 'noopener noreferrer';
    link.addEventListener('click', event => {if (!event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey && reading.navigate(url.href)) event.preventDefault();}); return link;
  } catch {return node('span', text, cls);}
}
function candidates(items) {
  currentCandidates = items;
  const target = get('candidates'); target.replaceChildren();
  get('candidate-count').textContent = String(items.length); get('panel-count').textContent = String(items.length);
  if (!items.length) {
    const empty = node('div', '', 'candidate-empty'); empty.append(avatar(), node('h3', '让新理解慢慢沉淀'), node('p', '对话中值得保留的内容会整理在这里。候选保持私有，你可以先专注学习。')); target.append(empty); return;
  }
  for (const candidate of items) {
    const view = candidate.placement_view || {}, card = node('section', '', 'candidate');
    const evidence = {insufficient: '待查证', checked: '已核验来源', owner_experience: '个人经验'}[candidate.evidence_status] || '待查证';
    const state = {captured: '已记录', researching: '待查证', drafting: '整理中', ready: '已整理 · 待正式提案', dismissed: '暂不采用'}[candidate.status] || '待查证';
    card.append(node('h3', candidate.title), node('p', state + ' · ' + (view.review_is_current ? '本人已核对本版' : view.owner_edited && candidate.evidence_status !== 'insufficient' ? '需重新核对' : evidence) + ' · v' + candidate.version, 'candidate-state'));
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
    if (view.owner_edited) card.append(node('p', '已保留你的整理；后续模型草稿不会自动覆盖。', 'candidate-warning'));
    const actions = node('div', '', 'candidate-actions'), review = node('button', '审阅整理'); review.type = 'button'; review.dataset.candidateId = candidate.id;
    review.onclick = () => candidateEditor.open(candidate.id, review);
    const download = node('a', '导出 Markdown'); download.href = '/api/candidates/' + candidate.id + '/export?version=' + candidate.version; download.download = '';
    actions.append(review, download); card.append(actions);
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
  const token = ++listToken;
  const data = await api('/api/sessions?offset=' + (more ? offset : 0));
  if (token !== listToken) return;
  sessions = more ? [...new Map([...sessions, ...data.sessions].map(s => [s.id, s])).values()] : data.sessions; offset = data.next_offset;
  renderSessions();
}
function renderSessions() {
  closeSessionMenu(false);
  get('sessions').replaceChildren(); get('more').hidden = offset === null;
  const ordered = [...sessions.filter(s => s.pinned), ...sessions.filter(s => !s.pinned)];
  let group = null;
  for (const session of ordered) {
    const label = session.pinned ? '置顶' : '最近对话';
    if (label !== group) {get('sessions').append(node('h2', label, 'session-group-label')); group = label;}
    const button = node('button', '', 'session-item'); button.type = 'button';
    if (session.pinned) {const pin = node('span', '', 'pinned-mark'); pin.setAttribute('aria-hidden', 'true'); pin.append(get('pin-icon').content.cloneNode(true)); button.append(pin);}
    button.append(node('strong', session.title));
    button.setAttribute('aria-label', session.title + (session.pinned ? '，已置顶' : ''));
    button.dataset.sessionId = session.id; button.title = session.title; button.setAttribute('aria-current', String(session.id === active));
    button.onclick = handle(async () => {await load(session.id); if (innerWidth <= 760 || document.documentElement.dataset.readingMode !== 'research') setPanel('history', false);});
    const row = node('div', '', 'session-row'), trigger = node('button', '', 'session-actions-trigger icon-button');
    trigger.type = 'button'; trigger.dataset.sessionId = session.id;
    trigger.setAttribute('aria-label', '对话操作：' + session.title); trigger.title = '对话操作';
    trigger.setAttribute('aria-haspopup', 'menu'); trigger.setAttribute('aria-expanded', 'false'); trigger.setAttribute('aria-controls', 'session-menu');
    trigger.append(get('more-icon').content.cloneNode(true));
    trigger.onclick = () => openSessionMenu(session, trigger);
    row.append(button, trigger); get('sessions').append(row);
  }
  controls();
}
async function load(id, duringSend = false) {
  if ((busy || deleting || savingSession) && !duringSend) return;
  if (!duringSend) reading.remember(active);
  closeSessionMenu(false);
  const token = ++loadToken, data = await api('/api/sessions/' + id);
  if (token !== loadToken) return;
  active = id; title(data.session.title); get('messages').replaceChildren(); get('error').textContent = ''; get('empty-state').hidden = !!data.messages.length;
  if (!duringSend) {reading.restore(id); autosize();}
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
  for (const button of get('sessions').querySelectorAll('.session-item')) button.setAttribute('aria-current', String(button.dataset.sessionId === active));
  controls(); reading.save(); scrollBottom(); return data;
}
function autosize() {const input = get('question'); input.style.height = 'auto'; input.style.height = Math.min(input.scrollHeight || 52, 160) + 'px';}
get('question').addEventListener('input', autosize);
get('form').onsubmit = handle(async event => {
  event.preventDefault(); const message = get('question').value.trim(); if (!message || busy || deleting || savingSession || !ready) return;
  if (retry?.session === active && retry.message !== message) {
    report(new Error('request_in_progress')); get('check-result').hidden = false; return;
  }
  const submittedContext = reading.current();
  busy = true; ++loadToken; controls(); get('error').textContent = ''; get('check-result').hidden = true; get('new-attempt').hidden = true;
  // Render and clear before the first await, including creation of a new session.
  appendMessage({role: 'user', body: message}, true); get('question').value = ''; reading.submitted(); autosize(); get('waiting').hidden = false;
  announce('提问已发送，正在等待回答。'); scrollBottom(); let failure = null;
  try {
    if (!active) {active = (await api('/api/sessions', 'POST', {})).id;}
    const body = retry && retry.message === message && retry.session === active ? retry.body : {request_id: crypto.randomUUID(), message, reading_context: submittedContext};
    retry = {message, session: active, body};
    await api('/api/sessions/' + active + '/messages', 'POST', body);
    retry = null;
  } catch (error) {failure = error;}
  finally {
    let restored = false, data;
    try {if (active) {data = await load(active, true); restored = true;} await list();} catch (error) {failure ||= error;}
    busy = false; get('waiting').hidden = true; controls();
    if (failure) {
      if (!get('question').value && (retry || !restored)) {reading.draft(message, submittedContext); autosize();}
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
function clearConversation() {
  reading.forget(active);
  ++loadToken; active = null; retry = null; title('新对话'); get('messages').replaceChildren(); candidates([]); get('empty-state').hidden = false;
  get('question').value = ''; reading.fresh(); autosize(); get('error').textContent = ''; get('check-result').hidden = true; get('new-attempt').hidden = true;
  for (const button of get('sessions').querySelectorAll('.session-item')) button.setAttribute('aria-current', 'false'); controls(); reading.save();
}
get('new-session').onclick = () => {
  if (busy || deleting || savingSession) return; closeSessionMenu(false); const previous = active; reading.remember(previous); active = null; clearConversation();
  if (innerWidth <= 760 || document.documentElement.dataset.readingMode !== 'research') setPanel('history', false); get('question').focus();
};
get('more').onclick = handle(() => list(true));
get('check-result').onclick = handle(async () => {if (active) await load(active);});
get('new-attempt').onclick = () => {
  if (busy || !retry || !confirm('重新调用模型可能再次计入用量。确认开始新的尝试？')) return;
  // Preserve a different next-question draft instead of silently overwriting it.
  if (get('question').value.trim() && get('question').value.trim() !== retry.message) {get('error').textContent = '输入框中有新的问题，请先保留或清空，再重新发起上次请求。'; return;}
  reading.draft(retry.message, retry.body.reading_context); retry = null; get('form').requestSubmit();
};
get('refresh').onclick = handle(async () => {get('refresh').disabled = true; try {await api('/api/sync', 'POST', {}); await status(); announce('知识内容已同步。');} finally {get('refresh').disabled = false;}});
get('export').onclick = handle(async () => {
  if (!active) return; const data = await api('/api/sessions/' + active + '/export');
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], {type: 'application/json'})), link = node('a');
  link.href = url; link.download = 'atlas-session-' + active + '.json'; link.click(); URL.revokeObjectURL(url);
});
function askDelete(id, name, opener) {
  if (!id || !ready || busy || deleting || savingSession) return;
  closeSessionMenu(false);
  deleteTarget = id; deleteReturn = opener;
  get('delete-name').textContent = name; get('delete-error').textContent = '';
  get('delete-dialog').showModal(); get('delete-cancel').focus();
}
get('delete-session').onclick = () => askDelete(active, activeTitle, get('delete-session'));
get('delete-cancel').onclick = () => {if (!deleting) get('delete-dialog').close();};
get('delete-dialog').addEventListener('cancel', event => {if (deleting) event.preventDefault();});
get('delete-dialog').addEventListener('close', () => {
  deleteTarget = null;
  if (deleteReturn?.isConnected && !deleteReturn.disabled) deleteReturn.focus(); else get('new-session').focus();
});
get('delete-confirm').onclick = async () => {
  if (!deleteTarget || busy || deleting) return;
  const id = deleteTarget; deleting = true; ++loadToken; ++listToken; controls();
  get('delete-confirm').disabled = true; get('delete-cancel').disabled = true; get('delete-confirm').textContent = '正在删除…';
  get('delete-error').textContent = '';
  try {
    await api('/api/sessions/' + id, 'DELETE');
    sessions = sessions.filter(session => session.id !== id);
    reading.forget(id);
    if (active === id) clearConversation();
    renderSessions();
    deleting = false; controls(); get('delete-dialog').close(); announce('对话及关联的未入库候选已删除。');
    try {await list();} catch {get('error').textContent = '对话已删除，但列表刷新未完成，请刷新页面核对。';}
  } catch (error) {
    get('delete-error').textContent = error.message === 'session_busy' ? '这条对话仍在处理中，请等请求结束后再删除。' : '删除结果尚未确认，请刷新页面核对后再操作。';
  } finally {
    deleting = false; controls(); get('delete-confirm').disabled = false; get('delete-cancel').disabled = false; get('delete-confirm').textContent = '删除对话';
  }
};
function askRename(id, name, opener) {
  if (!id || !ready || busy || deleting || savingSession) return;
  closeSessionMenu(false); renameTarget = id; renameReturn = opener;
  get('session-title').value = name; get('rename-error').textContent = '';
  get('rename-dialog').showModal(); get('session-title').focus(); get('session-title').select();
}
get('rename').onclick = () => askRename(active, activeTitle, get('rename'));
get('rename-cancel').onclick = () => {if (!savingSession) get('rename-dialog').close();};
get('rename-dialog').addEventListener('cancel', event => {if (savingSession) event.preventDefault();});
get('rename-form').onsubmit = async event => {
  event.preventDefault(); if (!renameTarget || savingSession) return;
  const id = renameTarget, value = get('session-title').value.trim();
  if (!value || Array.from(value).length > 80 || /[\u0000-\u001f\u007f]/u.test(value)) {get('rename-error').textContent = hints.invalid_session_title; return;}
  savingSession = true; ++listToken; controls(); get('rename-save').disabled = true; get('rename-cancel').disabled = true;
  try {
    const data = await api('/api/sessions/' + id, 'PATCH', {title: value});
    if (active === id) title(data.title);
    const session = sessions.find(s => s.id === id); if (session) session.title = data.title;
    renderSessions();
    try {await list();} catch {get('error').textContent = '名称已保存，但列表刷新未完成，请刷新页面核对。';}
    savingSession = false; controls(); get('rename-dialog').close(); announce('对话名称已保存。');
  }
  catch (error) {get('rename-error').textContent = hints[error.message] || '名称未保存，请重试。';}
  finally {savingSession = false; controls(); get('rename-save').disabled = false; get('rename-cancel').disabled = false;}
};
get('rename-dialog').addEventListener('close', () => {
  const id = renameTarget; renameTarget = null;
  if (renameReturn?.isConnected && !renameReturn.disabled) renameReturn.focus(); else focusSessionActions(id);
});

function focusSessionActions(id) {
  if (get('app').classList.contains('history-closed')) {(document.documentElement.dataset.readingMode === 'research' ? get('toggle-history') : get('conversation-picker')).focus(); return;}
  const trigger = [...get('sessions').querySelectorAll('.session-actions-trigger')].find(el => el.dataset.sessionId === id);
  (trigger || get('new-session')).focus();
}
function closeSessionMenu(restore = true) {
  if (!menuTarget) return;
  const trigger = menuTrigger; get('session-menu').hidden = true;
  trigger?.setAttribute('aria-expanded', 'false'); menuTarget = null; menuTrigger = null;
  if (restore && trigger?.isConnected) trigger.focus();
}
function openSessionMenu(session, trigger) {
  if (busy || deleting || savingSession || !ready) return;
  const same = menuTarget?.id === session.id; closeSessionMenu(false);
  if (same) {trigger.focus(); return;}
  menuTarget = session; menuTrigger = trigger; trigger.setAttribute('aria-expanded', 'true');
  get('menu-pin-label').textContent = session.pinned ? '取消置顶' : '置顶';
  const menu = get('session-menu'); menu.hidden = false;
  const rect = trigger.getBoundingClientRect(), box = menu.getBoundingClientRect();
  menu.style.left = Math.max(8, Math.min(rect.right - box.width, innerWidth - box.width - 8)) + 'px';
  menu.style.top = Math.max(8, rect.bottom + box.height + 8 <= innerHeight ? rect.bottom + 4 : rect.top - box.height - 4) + 'px';
  get('menu-pin').focus();
}
get('menu-rename').onclick = () => {if (menuTarget) askRename(menuTarget.id, menuTarget.title, menuTrigger);};
get('menu-delete').onclick = () => {if (menuTarget) askDelete(menuTarget.id, menuTarget.title, menuTrigger);};
get('menu-pin').onclick = async () => {
  if (!menuTarget || busy || deleting || savingSession) return;
  const {id, pinned} = menuTarget; closeSessionMenu(false); savingSession = true; ++listToken; controls();
  get('error').textContent = '';
  try {
    const data = await api('/api/sessions/' + id, 'PATCH', {pinned: !pinned});
    const session = sessions.find(s => s.id === id); if (session) session.pinned = data.pinned;
    renderSessions(); announce(data.pinned ? '对话已置顶。' : '已取消置顶。');
    try {await list();} catch {get('error').textContent = '置顶设置已保存，但列表刷新未完成，请刷新页面核对。';}
  } catch {get('error').textContent = '未能确认置顶状态，请刷新列表核对。';}
  finally {savingSession = false; controls(); focusSessionActions(id);}
};
document.addEventListener('pointerdown', event => {if (menuTarget && !get('session-menu').contains(event.target) && !menuTrigger.contains(event.target)) closeSessionMenu(false);});
document.addEventListener('focusin', event => {if (menuTarget && !get('session-menu').contains(event.target) && !menuTrigger.contains(event.target)) closeSessionMenu(false);});
get('sessions').addEventListener('scroll', () => closeSessionMenu(false));
get('theme').onclick = () => {const theme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'; document.documentElement.dataset.theme = theme; try {localStorage.setItem('atlas-workbench-theme', theme);} catch {} reading.theme();};
try {document.documentElement.dataset.theme = localStorage.getItem('atlas-workbench-theme') || (window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');} catch {}
function setPanel(kind, open) {
  const panel = get(kind === 'history' ? 'history-panel' : 'candidate-panel');
  const returnFocus = !open && panel.contains(document.activeElement);
  const app = get('app'); app.classList.toggle(kind + '-closed', !open);
  if (open && document.documentElement.dataset.readingMode !== 'research') app.classList.add((kind === 'history' ? 'candidates' : 'history') + '-closed');
  if (open && innerWidth <= 1250 && kind === 'candidates') app.classList.add('history-closed');
  if (open && innerWidth <= 760 && kind === 'history') app.classList.add('candidates-closed');
  updatePanels();
  if (returnFocus) (kind === 'history' && document.documentElement.dataset.readingMode !== 'research' ? get('conversation-picker') : get('toggle-' + kind)).focus();
}
function updatePanels() {
  closeSessionMenu(false);
  if (innerWidth <= 1250 && !get('app').classList.contains('candidates-closed')) get('app').classList.add('history-closed');
  const historyOpen = !get('app').classList.contains('history-closed'), candidatesOpen = !get('app').classList.contains('candidates-closed');
  get('toggle-history').setAttribute('aria-controls', 'history-panel'); get('toggle-history').setAttribute('aria-expanded', String(historyOpen));
  get('conversation-picker').setAttribute('aria-expanded', String(historyOpen));
  get('toggle-candidates').setAttribute('aria-expanded', String(candidatesOpen));
  get('history-panel').inert = !historyOpen; get('candidate-panel').inert = !candidatesOpen;
  const inReading = document.documentElement.dataset.readingMode !== 'research';
  for (const panel of [get('history-panel'),get('candidate-panel')]) {
    if (inReading) {const rect = get('conversation-picker').getBoundingClientRect(); panel.style.top = Math.max(16,Math.min(rect.bottom + 10,innerHeight - 360)) + 'px';}
    else panel.style.removeProperty('top');
  }
  const overlay = candidatesOpen && (innerWidth <= 1250 || inReading) ? get('candidate-panel') : historyOpen && (innerWidth <= 760 || inReading) ? get('history-panel') : null;
  get('chat-panel').inert = !!overlay;
  get('atlas-reader').inert = !!overlay;
  for (const panel of [get('history-panel'), get('candidate-panel')]) {if (panel === overlay) {panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-modal', 'true');} else {panel.removeAttribute('role'); panel.removeAttribute('aria-modal');}}
  if (overlay && drawer !== overlay) {drawerReturn = document.activeElement; overlay.querySelector('button').focus();}
  if (!overlay && drawer) drawerReturn?.focus(); drawer = overlay;
}
get('toggle-history').onclick = () => setPanel('history', get('app').classList.contains('history-closed'));
get('conversation-picker').onclick = () => setPanel('history', get('app').classList.contains('history-closed'));
get('toggle-candidates').onclick = () => setPanel('candidates', get('app').classList.contains('candidates-closed'));
get('close-history').onclick = () => setPanel('history', false); get('close-candidates').onclick = () => setPanel('candidates', false);
get('scrim').onclick = () => {setPanel('history', false); setPanel('candidates', false);};
document.addEventListener('keydown', event => {
  if (get('delete-dialog').open || get('rename-dialog').open || get('candidate-dialog').open) return;
  if (menuTarget) {
    const items = [...get('session-menu').querySelectorAll('[role=menuitem]')], index = items.indexOf(document.activeElement);
    if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      event.preventDefault();
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
      items[next].focus(); return;
    }
    if (event.key === 'Escape') {event.preventDefault(); closeSessionMenu(); return;}
    if (event.key === 'Tab') {closeSessionMenu(); return;}
  }
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
const reading = createReadingView({get, onContext: value => {context = value;}, onLayout: updatePanels, getActive: () => active});
const candidateEditor = createCandidateEditor({get, api, announce, isBusy: () => busy || deleting || savingSession,
  onSaved: saved => {if (saved.session_id === active) {candidates(currentCandidates.map(c => c.id === saved.id ? saved : c)); controls();}}});
get('private-context').textContent = context.article_id ? '阅读上下文 · ' + context.article_id : '';
candidates([]); controls();
(async () => {try {
  await status(); await list();
  if (reading.initialSession) {try {await load(reading.initialSession);} catch (error) {if (error.message !== 'session_not_found') throw error; if (sessions.length) await load(sessions[0].id);}}
  else if (sessions.length) await load(sessions[0].id);
  ready = true; controls();
} catch (error) {report(error);}})();
