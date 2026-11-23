import {renderMarkdown} from './markdown.js';

export function createCandidateEditor({get, api, announce, onSaved, isBusy}) {
  let detail = null, saving = false, loading = false, trigger = null;
  const dialog = get('candidate-dialog'), form = get('candidate-form');
  const error = e => {get('candidate-error').textContent = ({candidate_version_changed: '候选已在其他页面更新。你的输入仍保留；请先复制需要的内容，再关闭并重新打开最新版本。',
    candidate_review_conflict: '候选或会话状态已变化，未保存。你的输入仍保留，请稍后重新打开核对。',
    candidate_snapshot_changed: '网站知识已更新，未保存。请保留输入，重新打开并对照最新内容。',
    candidate_sync_required: '暂时无法确认网站最新版本，可以先保存为「整理中」，稍后核对。',
    candidate_evidence_required: '请填写来源或个人经验、支持的结论，并确认已核对本版草稿。',
    invalid_evidence_reference: '官方文档和论文请使用完整 HTTPS 链接，不包含账号凭据。',
    invalid_candidate_placement: '归属与当前知识结构不一致，请重新选择。',
    authentication_required: '请重新登录私人工作台。',
  })[e.message] || '暂时无法保存，请保留输入，稍后重试。';};
  const option = (value, label) => {const el = document.createElement('option'); el.value = value; el.textContent = label; return el;};
  function articleOptions(selected = '') {
    const domain = get('candidate-domain').value, select = get('candidate-article');
    select.replaceChildren(option('', '尚未指定 · 正式提案时决定'));
    for (const article of detail.articles.filter(a => a.primary_domain === domain)) select.append(option(article.id, article.title));
    select.value = [...select.options].some(o => o.value === selected) ? selected : '';
  }
  function evidenceFields() {
    const enabled = !!get('candidate-evidence-kind').value;
    get('candidate-evidence-fields').hidden = !enabled;
    for (const id of ['candidate-reference', 'candidate-supports', 'candidate-confirm']) get(id).disabled = !enabled || saving;
    get('candidate-reference').required = enabled; get('candidate-supports').required = enabled; get('candidate-confirm').required = enabled;
    get('candidate-reference-label').textContent = get('candidate-evidence-kind').value === 'experience' ? '工程观察、条件与记录位置' : '已阅读来源的 HTTPS 链接';
  }
  function controls() {
    for (const field of form.querySelectorAll('input,textarea,select,button')) field.disabled = saving || loading;
    evidenceFields(); get('candidate-save').textContent = saving ? '正在保存…' : '保存私人候选';
    get('candidate-save').disabled = saving || loading || !detail; get('candidate-export').hidden = !detail || loading;
  }
  function preview() {get('candidate-preview').replaceChildren(renderMarkdown(get('candidate-body').value || '尚无正文。', document));}
  async function open(id, source) {
    if (isBusy() || loading || saving) return;
    trigger = source; detail = null; loading = true; get('candidate-error').textContent = '';
    get('candidate-fields').hidden = true; get('candidate-loading').hidden = false;
    dialog.showModal(); controls();
    try {
      detail = await api('/api/candidates/' + id);
      const c = detail.candidate, placement = JSON.parse(c.placement_json);
      get('candidate-title').value = c.title; get('candidate-body').value = c.draft_markdown;
      get('candidate-domain').replaceChildren(option('', '尚未归类'), ...detail.domains.map(d => option(d.id, d.title)));
      get('candidate-domain').value = placement.primary_domain || ''; articleOptions(placement.article_id || '');
      get('candidate-state').value = c.status; get('candidate-evidence-kind').value = detail.evidence?.kind || '';
      get('candidate-reference').value = detail.evidence?.reference || ''; get('candidate-supports').value = detail.evidence?.metadata.supports || '';
      get('candidate-confirm').checked = false;
      get('candidate-version').textContent = '私人候选 v' + c.version + ' · 当前知识 ' + (detail.snapshot_revision?.slice(0, 8) || '尚未同步') +
        (c.placement_view.source_is_current ? '' : ' · 原始依据已变化，请对照原文核对');
      get('candidate-export').href = '/api/candidates/' + c.id + '/export?version=' + c.version;
      get('candidate-fields').hidden = false; preview();
    } catch (e) {error(e);}
    finally {loading = false; get('candidate-loading').hidden = true; controls(); get(detail ? 'candidate-title' : 'candidate-cancel').focus();}
  }
  get('candidate-domain').onchange = () => articleOptions();
  get('candidate-evidence-kind').onchange = evidenceFields;
  get('candidate-body').oninput = preview;
  form.addEventListener('input', e => {if (e.target.id !== 'candidate-confirm') get('candidate-confirm').checked = false;});
  get('candidate-cancel').onclick = () => {if (!saving) dialog.close();};
  dialog.addEventListener('cancel', e => {if (saving) e.preventDefault();});
  dialog.addEventListener('close', () => {
    const replacement = detail && [...get('candidates').querySelectorAll('button[data-candidate-id]')].find(b => b.dataset.candidateId === detail.candidate.id);
    (trigger?.isConnected ? trigger : replacement || get('close-candidates')).focus();
  });
  form.onsubmit = async event => {
    event.preventDefault(); if (saving || !detail || isBusy()) return;
    const kind = get('candidate-evidence-kind').value;
    const body = {version: detail.candidate.version, snapshot_revision: detail.snapshot_revision,
      title: get('candidate-title').value, draft_markdown: get('candidate-body').value,
      primary_domain: get('candidate-domain').value || null, article_id: get('candidate-article').value || null,
      status: get('candidate-state').value, evidence: kind ? {kind, reference: get('candidate-reference').value,
        supports: get('candidate-supports').value, owner_confirmed: get('candidate-confirm').checked} : null};
    saving = true; controls(); get('candidate-error').textContent = '';
    try {const saved = await api('/api/candidates/' + detail.candidate.id, 'PATCH', body); onSaved(saved.candidate);
      announce('私人候选已保存，尚未创建公开提案。'); dialog.close();}
    catch (e) {error(e);}
    finally {saving = false; controls();}
  };
  return {open};
}
