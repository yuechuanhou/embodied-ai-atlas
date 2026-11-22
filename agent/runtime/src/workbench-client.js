function client() {
  'use strict';
  const get = id => document.getElementById(id), node = (tag, value, cls) => {const el = document.createElement(tag); if (value) el.textContent = value; if (cls) el.className = cls; return el;};
  let active = null, offset = 0, sessions = [], busy = false, context = {}, retry = null, loadToken = 0;
  const hints = {authentication_required: '请重新登录私人工作台。', invalid_identity: '登录已失效，请刷新并重新登录。', owner_required: '此工作台仅允许 Owner 使用。',
    knowledge_not_ready: '知识快照尚未就绪，请同步内容后再试。', daily_model_budget_exceeded: '已达到今天配置的模型调用上限。', model_request_incomplete: '模型请求未完成；请先刷新会话确认结果，避免重复提交。',
    model_output_truncated: '模型输出达到上限，本次回答和草稿未保存。请核对结果；重新发起会再次调用模型。',
    model_refused: '模型未接受本次问题，本次未保存回答或草稿。可以调整问题后发起新的请求。',
    model_context_limit: '模型上下文达到上限，本次未保存回答或草稿。可以缩短问题或开始新会话。',
    model_output_incomplete: '模型未正常完成输出，本次未保存回答或草稿。请核对结果后再决定是否重新发起。',
    request_in_progress: '此请求仍在处理中，请稍后刷新会话。', request_outcome_unknown: '上次请求已中断，结果和用量可能未能返回；请核对会话，再决定是否重新调用。', session_busy: '当前会话仍有请求处理中。', service_unavailable: '私人服务暂不可用，请稍后重试。'};
  async function api(path, method = 'GET', body) {
    const response = await fetch(path, {method, credentials: 'same-origin', headers: method === 'GET' ? {} : {'Content-Type': 'application/json', 'X-Atlas-Request': '1'}, body: body === undefined ? undefined : JSON.stringify(body)});
    if (!response.headers.get('content-type')?.includes('application/json')) throw new Error('authentication_required');
    const value = await response.json(); if (!response.ok) throw new Error(value.error || 'service_unavailable'); return value;
  }
  function report(error) {get('error').textContent = hints[error.message] || '操作未完成：' + error.message;}
  function handle(fn) {return async event => {try {await fn(event);} catch (error) {report(error);}};}
  async function status() {
    const data = await api('/api/status'), sync = data.sync;
    get('status').textContent = (sync.error_code ? '内容核对失败 · 使用最近快照' : sync.stale && sync.index_revision ? '知识快照待核对' : sync.index_revision ? '已载入知识快照' : '尚未同步知识内容') +
      (data.model.ready ? ' · 模型已配置' : ' · 模型尚未配置，提供站内检索');
    get('status').title = 'main: ' + sync.repo_head + '\npublished: ' + sync.published_revision + '\nindex: ' + sync.index_revision;
    if (sync.repo_head && sync.published_revision && sync.repo_head !== sync.published_revision) get('status').textContent += ' · 仓库与线上版本不同';
  }
  async function list(more = false) {
    const data = await api('/api/sessions?offset=' + (more ? offset : 0));
    sessions = more ? [...sessions, ...data.sessions] : data.sessions; offset = data.next_offset;
    get('sessions').replaceChildren(); get('more').hidden = offset === null;
    for (const session of sessions) {
      const button = node('button', new Date(session.created_at * 1000).toLocaleString(), 'session-item');
      button.dataset.sessionId = session.id; button.setAttribute('aria-current', String(session.id === active)); button.onclick = handle(() => load(session.id)); get('sessions').append(button);
    }
  }
  async function load(id) {
    if (busy) return;
    const currentLoad = ++loadToken, data = await api('/api/sessions/' + id);
    if (currentLoad !== loadToken) return;
    active = id;
    const request = retry?.session === id ? data.requests.find(item => item.id === retry.body.request_id) : null;
    get('check-result').hidden = !retry;
    get('new-attempt').hidden = request?.status !== 'failed';
    if (request?.status === 'completed') {retry = null; get('question').value = ''; get('check-result').hidden = true; get('new-attempt').hidden = true;}
    get('messages').replaceChildren(); get('candidates').replaceChildren(); get('error').textContent = '';
    for (const message of data.messages) {
      const el = node('section', '', 'message ' + message.role); el.append(node('b', message.role === 'user' ? '你' : 'Atlas'), node('p', message.body));
      for (const source of JSON.parse(message.citations_json)) {
        const link = node('a', source.title, 'source'); link.href = source.url; link.target = '_blank'; link.rel = 'noopener noreferrer';
        link.append(node('small', '站内原文 · ' + source.revision.slice(0, 8))); el.append(link);
      }
      get('messages').append(el);
    }
    for (const candidate of data.candidates) {
      const el = node('section', '', 'candidate'); el.append(node('h3', candidate.title), node('small', '私人候选 · 待查证 · v' + candidate.version, 'muted'), node('pre', candidate.draft_markdown));
      get('candidates').append(el);
    }
    if (!data.candidates.length) get('candidates').append(node('p', '有价值的新理解会自动成为私人候选。', 'muted'));
    for (const button of get('sessions').children) button.setAttribute('aria-current', String(button.dataset.sessionId === active));
    get('messages').scrollTop = get('messages').scrollHeight;
  }
  get('form').onsubmit = handle(async event => {
    event.preventDefault(); const message = get('question').value.trim(); if (!message || busy) return;
    busy = true; get('send').disabled = true; get('error').textContent = '';
    try {
      if (!active) {active = (await api('/api/sessions', 'POST', {})).id; await list();}
      const request = retry && retry.message === message && retry.session === active ? retry.body : {request_id: crypto.randomUUID(), message, reading_context: context};
      retry = {message, session: active, body: request};
      await api('/api/sessions/' + active + '/messages', 'POST', request); get('question').value = ''; retry = null;
    } finally {busy = false; get('send').disabled = false; if (active) await load(active); await status();}
  });
  get('question').onkeydown = event => {if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {event.preventDefault(); get('form').requestSubmit();}};
  get('new-session').onclick = handle(async () => {if (busy) return; active = (await api('/api/sessions', 'POST', {})).id; retry = null; await list(); await load(active);});
  get('more').onclick = handle(() => list(true));
  get('check-result').onclick = handle(() => active && load(active));
  get('new-attempt').onclick = () => {if (!busy && confirm('重新调用模型可能再次计入用量。确认开始新的尝试？')) {retry = null; get('new-attempt').hidden = true; get('check-result').hidden = true; get('form').requestSubmit();}};
  get('refresh').onclick = handle(async () => {await api('/api/sync', 'POST', {}); await status();});
  get('export').onclick = handle(async () => {
    if (!active) return; const data = await api('/api/sessions/' + active + '/export');
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], {type: 'application/json'})), link = node('a');
    link.href = url; link.download = 'atlas-session-' + active + '.json'; link.click(); URL.revokeObjectURL(url);
  });
  get('delete-session').onclick = handle(async () => {
    if (!active || busy || !confirm('删除本次会话、消息和未入库候选？独立提案审计与来源元数据会保留。')) return;
    await api('/api/sessions/' + active, 'DELETE'); active = null; retry = null; get('messages').replaceChildren(); get('candidates').replaceChildren(); await list();
  });
  get('theme').onclick = () => document.documentElement.dataset.theme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  try {
    const data = JSON.parse(decodeURIComponent(location.hash.slice(1)) || '{}');
    for (const key of ['article_id', 'topic_id', 'anchor', 'view']) if (typeof data[key] === 'string' && data[key].length <= 300) context[key] = data[key];
  } catch {}
  get('private-context').textContent = context.article_id ? '阅读上下文 · ' + context.article_id : '从一个概念或实际问题开始。';
  get('send').disabled = true; get('new-session').disabled = true;
  (async () => {try {await status(); await list(); if (sessions.length) await load(sessions[0].id); get('send').disabled = false; get('new-session').disabled = false;} catch (error) {report(error); get('send').disabled = true;}})();
}

client();
