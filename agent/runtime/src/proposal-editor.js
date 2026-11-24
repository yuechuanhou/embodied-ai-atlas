import {renderMarkdown} from './markdown.js';

export function createProposalEditor({get, api, isBusy, onBusy, announce}) {
  const dialog = get('proposal-dialog');
  let candidate = null, metadata = null, trigger = null, pending = null, working = false;
  const node = (tag, text = '', cls = '') => {const el = document.createElement(tag); el.textContent = text; if (cls) el.className = cls; return el;};
  const errors = {proposal_evidence_required: '请先审阅候选、核对来源，并保存为「已整理」。',
    proposal_placement_review_required: '归属尚未明确或需要架构讨论；候选已私有保存，不会强行入库。',
    proposal_existing_article_required: '本轮先支持已有文章的增补。请在候选审阅中选择目标文章；新文章与 Topic 注册后续接入。',
    proposal_rules_unavailable: '当前快照尚未包含完整入库规范，请同步最新网站内容。',
    proposal_contract_changed: '规范摘要不一致，请同步后重新核对。', proposal_sync_required: '暂时无法确认最新网站版本，请同步后重新打开。',
    proposal_base_changed: '生成期间网站已更新，本次未保存提案；请对照新版本重新准备。',
    candidate_version_changed: '候选已更新，请关闭并重新打开，读取已保存的最新版本。',
    proposal_model_required: '需要先配置模型，才能按行文标准整理提案。', daily_model_budget_exceeded: '今天的模型调用预算已用完。',
    proposal_context_too_large: '完整规范与文章超出当前请求或预算上限，未发起模型调用。',
    session_busy: '当前会话仍在处理请求，请稍后打开。', request_in_progress: '生成仍在进行，请稍后核对结果。',
    request_outcome_unknown: '上次生成结果不明，请先核对已保存版本；重新生成会再次调用模型。',
    model_output_truncated: '模型输出达到上限，本次未保存提案。', model_output_incomplete: '模型没有完整返回，本次未保存提案。',
    unsafe_proposal_content: '生成内容包含此通道不支持的 HTML 或链接，本次未保存提案。',
    authentication_required: '登录已失效，请重新登录工作台。'};
  function controls() {
    get('proposal-close').disabled = working; get('proposal-version').disabled = working;
    get('proposal-generate').disabled = working || !!pending || !metadata;
    get('proposal-check').hidden = !pending || working;
    get('proposal-progress').hidden = !working;
    onBusy(working);
  }
  const error = e => {get('proposal-error').textContent = errors[e.message] || '操作未完成，请先核对生成结果，避免重复调用。';};
  function clear() {get('proposal-content').replaceChildren(); get('proposal-export').hidden = true; get('proposal-version').replaceChildren();}
  async function show(version) {
    const detail = await api('/api/proposals/' + candidate.id + '?version=' + version);
    const {proposal, review, files} = detail;
    clear();
    get('proposal-version').replaceChildren(...detail.versions.map(v => {
      const option = node('option', 'v' + v.proposal_version); option.value = String(v.proposal_version); return option;
    }));
    get('proposal-version').value = String(proposal.proposal_version);
    get('proposal-export').hidden = false; get('proposal-export').href = '/api/proposals/' + candidate.id + '/export?version=' + proposal.proposal_version;
    get('proposal-status').textContent = '私人提案 v' + proposal.proposal_version + ' · ' + (detail.stale ? '依据已变化，需重新生成' : '待校验与审阅');
    const content = get('proposal-content');
    content.append(node('h3', proposal.summary), node('p', review.narrative_title + ' · ' + review.primary_domain + ' → ' + review.article_id),
      node('p', review.reason), node('p', '基线 ' + proposal.base_commit.slice(0, 8) + ' · 候选 v' + review.candidate_version + ' · 摘要 ' + proposal.patch_digest.slice(0, 12), 'muted'));
    const notes = node('section', '', 'proposal-review'); notes.append(node('h3', '编辑与证据审阅'), node('p', review.editorial_notes));
    for (const evidence of proposal.evidence) notes.append(node('p', evidence.kind + ' · 本人核对记录：' + evidence.reference), node('p', '支持范围：' + evidence.supports.join('；')));
    notes.append(node('p', '来源记录留在私有提案中。本人核对不代表 Orbit 已检索外部资料；新整理的正文仍需核对。', 'muted')); content.append(notes);
    for (const file of files) {
      content.append(node('h3', file.path));
      const addition = node('section', '', 'message-content proposal-addition'); addition.append(renderMarkdown(file.addition, document)); content.append(addition);
      const diff = node('details'); diff.append(node('summary', '完整差异 · 保留原文，仅新增'));
      const pre = node('pre', '--- ' + file.path + '\n+++ ' + file.path + '\n' +
        file.before_utf8.split('\n').map(line => ' ' + line).join('\n') + '\n' + file.addition.split('\n').map(line => '+' + line).join('\n'), 'proposal-diff');
      diff.append(pre); content.append(diff);
      const after = node('details'); after.append(node('summary', '完整修改后文件'));
      after.append(node('pre', file.after_utf8, 'proposal-diff')); content.append(after);
    }
    content.append(node('p', '已核对精确增补与版本摘要。整仓语义校验、构建、技术/行文审阅及公开范围确认尚未完成；没有分配新 Topic 或修改关系。', 'proposal-limits'));
    get('proposal-generate').textContent = '按当前候选生成新版本';
  }
  async function open(item, source, {prepare = false} = {}) {
    if (isBusy() || working) return;
    candidate = item; trigger = source; metadata = null; pending = null; clear(); get('proposal-error').textContent = '';
    get('proposal-status').textContent = '正在读取已保存的提案…'; get('proposal-generate').textContent = '准备私人提案';
    dialog.showModal(); working = true; controls();
    try {
      metadata = await api('/api/candidates/' + candidate.id + '/proposals');
      if (metadata.latest) await show(metadata.latest);
      else get('proposal-status').textContent = '尚无提案 · 先选择已核对的候选和已有目标文章';
    } catch (e) {error(e);}
    finally {working = false; controls(); get('proposal-close').focus();}
    if (prepare && metadata) await generate();
  }
  async function handleResult(result) {
    if (result.proposal_version) {await show(result.proposal_version); pending = null; announce('私人提案已准备，尚未批准或发布。');}
    else {pending = null; get('proposal-error').textContent = (result.decision === 'duplicate' ? '已有内容覆盖该知识，未创建重复提案。' : '仍需补充材料，未创建提案。') + ' ' + result.reason + '\n' + result.editorial_notes;}
  }
  async function generate() {
    if (working || pending || !metadata) return;
    pending = {request_id: crypto.randomUUID(), candidate_version: metadata.candidate_version, snapshot_revision: metadata.snapshot_revision};
    working = true; controls(); get('proposal-error').textContent = '';
    try {await handleResult(await api('/api/candidates/' + candidate.id + '/proposals', 'POST', pending));}
    catch (e) {
      if (['proposal_evidence_required', 'proposal_placement_review_required', 'proposal_existing_article_required', 'proposal_rules_unavailable', 'proposal_contract_changed',
        'proposal_sync_required', 'candidate_version_changed', 'proposal_model_required', 'proposal_context_too_large'].includes(e.message)) pending = null;
      error(e);
    } finally {working = false; controls();}
  }
  get('proposal-generate').onclick = generate;
  get('proposal-check').onclick = async () => {
    if (working || !pending) return; working = true; controls();
    try {
      const {request} = await api('/api/candidates/' + candidate.id + '/proposals?request_id=' + pending.request_id);
      if (request.status === 'completed') await handleResult(request.result);
      else if (request.status === 'failed') {pending = null; error(new Error(request.error_code));}
      else error(new Error('request_in_progress'));
    } catch (e) {if (e.message === 'request_not_found') {pending = null; get('proposal-error').textContent = '服务端未找到该请求，可明确发起一次新的生成。';} else error(e);}
    finally {working = false; controls();}
  };
  get('proposal-version').onchange = async () => {if (working) return; working = true; controls(); try {await show(Number(get('proposal-version').value));} catch (e) {error(e);} finally {working = false; controls();}};
  get('proposal-close').onclick = () => {if (!working) dialog.close();};
  dialog.addEventListener('cancel', event => {if (working) event.preventDefault();});
  dialog.addEventListener('close', () => {if (trigger?.isConnected) trigger.focus(); else get('close-candidates').focus();});
  return {open};
}
