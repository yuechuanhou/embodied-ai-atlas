// The public reader receives navigation/theme commands only. Private messages,
// drafts, session identifiers, candidates and credentials never cross this bridge.
export const READING_SITE = 'https://www.yuechuanhou.com/embodied-ai-atlas/';
export const AGENT_NAME = 'Orbit';
const SITE = new URL(READING_SITE);
const fields = ['article_id', 'topic_id', 'anchor', 'view'];
export function readingContext(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(fields.filter(key => typeof value[key] === 'string' && value[key].length <= 300 && !/[\u0000-\u001f\u007f]/.test(value[key])).map(key => [key, value[key]]));
}
export function readerURL(value) {
  try {
    const url = new URL(value || '', READING_SITE);
    if (url.origin !== SITE.origin || url.pathname !== SITE.pathname || url.username || url.password || url.search.length > 1600 || url.hash.length > 1200) return null;
    const allowed = ['page', 'view', 'id', 'context', 'atlas_reader'];
    if ([...url.searchParams.keys()].some(key => !allowed.includes(key))) return null;
    url.searchParams.set('atlas_reader', '1'); return url;
  } catch {return null;}
}
export function createReadingView({get, onContext, onLayout, getActive}) {
  const frame = get('atlas-reader'), input = get('question'), app = get('app');
  let initial = {};
  try {initial = JSON.parse(decodeURIComponent(location.hash.slice(1)) || '{}');} catch {}
  let reading = readingContext(initial), draftScope = null, pinned = false, connected = false;
  let lastMode = 'companion', lastReadingMode = ['companion','sidebar'].includes(initial.return_mode) ? initial.return_mode : 'companion', loaded = false, timer;
  const drafts = new Map();
  const labels = new Map();
  let desiredURL = readerURL(initial.reader_url || (reading.article_id ? '?page=' + encodeURIComponent(reading.article_id) + (reading.anchor ? '#' + encodeURIComponent(reading.anchor) : '') : ''));
  desiredURL ||= readerURL('');
  const announce = text => {get('announcer').textContent = text;};
  const copy = value => ({...value});
  const current = () => copy(draftScope || reading);
  function save() {
    const state = {...reading, mode:document.documentElement.dataset.readingMode || 'research', reader_url:desiredURL.href, return_mode:lastReadingMode};
    const active = getActive(); if (active) state.session_id = active;
    // Private URL state contains stable IDs and public routes only, never drafts.
    try {history.replaceState(null, '', '/#' + encodeURIComponent(JSON.stringify(state)));} catch {}
  }
  function scope() {
    onContext(current());
    get('reading-scope-name').textContent = '本次引用 · ' + (labels.get(JSON.stringify(current())) || (current().article_id ? current().article_id + (current().anchor ? ' / ' + current().anchor : '') : '全站知识'));
    get('reading-scope-pin').textContent = pinned ? '范围已固定' : input.value ? '撰写时固定' : '跟随阅读';
    get('reading-scope-pin').setAttribute('aria-pressed', String(pinned));
    get('use-current-reading').hidden = JSON.stringify(current()) === JSON.stringify(reading);
    save();
  }
  function send(type, data = {}) {
    if (connected) frame.contentWindow?.postMessage({channel:'atlas-reader', version:1, type, ...data}, SITE.origin);
  }
  function start() {
    if (loaded) return;
    loaded = true; frame.src = desiredURL.href;
    get('reader-loading').hidden = false;
    timer = setTimeout(() => {if (!connected) {get('reader-loading').hidden = false; get('reader-loading-text').textContent = '阅读页面尚未接入。可重试或继续使用研究工作台。';}}, 12000);
  }
  function mode(next, focus = false) {
    if (!['off', 'companion', 'sidebar', 'research'].includes(next)) return;
    const previous = document.documentElement.dataset.readingMode || 'research';
    if (next !== 'research') start();
    if (next === 'research' && previous !== 'research' && previous !== 'off') lastReadingMode = previous;
    if (next !== 'off') lastMode = next;
    document.documentElement.dataset.readingMode = next;
    app.classList.toggle('history-closed', next !== 'research' || innerWidth <= 760); app.classList.add('candidates-closed');
    for (const button of document.querySelectorAll('[data-reading-mode]')) button.setAttribute('aria-pressed', String(button.dataset.readingMode === next));
    get('reader-launch').hidden = next !== 'off'; get('return-reading').hidden = next !== 'research';
    frame.hidden = next === 'research'; app.inert = next === 'off';
    onLayout();
    save();
    if (focus && next !== 'off') input.focus();
    if (next === 'off') get('reader-launch').focus();
    announce(next === 'off' ? '已收起 Orbit，对话和草稿保留。' : '显示方式已切换，当前对话保持不变。');
  }
  function navigate(href) {
    const url = readerURL(href); if (!url) return false;
    desiredURL = url;
    if (document.documentElement.dataset.readingMode === 'research') mode('sidebar');
    if (connected) send('navigate', {url: url.href}); else start();
    if (innerWidth <= 760) mode('off');
    return true;
  }
  function receive(event) {
    if (event.origin !== SITE.origin || event.source !== frame.contentWindow) return;
    const data = event.data;
    if (!data || data.channel !== 'atlas-reader' || data.version !== 1 || !['ready','context','ask','theme'].includes(data.type)) return;
    if (data.type === 'theme') {
      if (['light','dark'].includes(data.theme)) {document.documentElement.dataset.theme = data.theme; try {localStorage.setItem('atlas-workbench-theme', data.theme);} catch {}}
      return;
    }
    if (typeof data.url !== 'string') return;
    const url = readerURL(data.url); if (!url) return;
    connected = true; clearTimeout(timer); get('reader-loading').hidden = true;
    if (data.type === 'ready') {
      send('theme', {theme: document.documentElement.dataset.theme || 'light'});
      if (url.href !== desiredURL.href) {send('navigate', {url: desiredURL.href}); return;}
    }
    desiredURL = url;
    if (input.value && !draftScope) draftScope = copy(reading);
    reading = readingContext(data.context);
    if (typeof data.label === 'string' && data.label.length <= 300 && !/[\u0000-\u001f\u007f]/.test(data.label)) labels.set(JSON.stringify(reading),data.label);
    scope();
    if (data.type === 'ask') {
      if (!input.value && !pinned) {draftScope = null; scope();}
      const position = Number(data.top);
      if (Number.isFinite(position)) app.style.setProperty('--companion-top', Math.max(16, Math.min(innerHeight - 360, position + 32)) + 'px');
      if (document.documentElement.dataset.readingMode === 'off') mode('companion', true); else input.focus();
    }
  }
  window.addEventListener('message', receive);
  for (const button of document.querySelectorAll('[data-reading-mode]')) button.onclick = () => mode(button.dataset.readingMode);
  get('reader-launch').onclick = () => mode(lastMode === 'research' ? 'companion' : lastMode, true);
  get('hide-orbit').onclick = () => mode('off');
  get('return-reading').onclick = () => mode(lastReadingMode);
  get('reading-scope-pin').onclick = () => {pinned = !pinned; draftScope = pinned ? current() : input.value ? draftScope : null; scope();};
  get('use-current-reading').onclick = () => {draftScope = copy(reading); scope();};
  get('reader-retry').onclick = () => {connected = false; loaded = false; frame.removeAttribute('src'); start();};
  get('public-atlas').href = READING_SITE;
  input.addEventListener('input', () => {if (input.value && !draftScope) draftScope = copy(reading); if (!input.value && !pinned) draftScope = null; scope();});
  scope(); mode(['companion','sidebar','off'].includes(initial.mode) ? initial.mode : 'research');
  return {
    current, navigate, mode, save,
    initialSession: typeof initial.session_id === 'string' && /^[a-f0-9-]{36}$/.test(initial.session_id) ? initial.session_id : null,
    theme: () => send('theme', {theme: document.documentElement.dataset.theme}),
    submitted() {if (!pinned) draftScope = null; scope();},
    draft(text, context) {input.value = text; draftScope = copy(readingContext(context)); scope();},
    remember(key) {drafts.set(key || 'new', {text:input.value, context:current(), pinned});},
    restore(key) {const draft = drafts.get(key || 'new'); input.value = draft?.text || ''; pinned = !!draft?.pinned; draftScope = draft && (draft.text || pinned) ? copy(draft.context) : null; scope();},
    forget(key) {drafts.delete(key || 'new');},
    fresh() {draftScope = null; pinned = false; scope();},
  };
}
