export function createPublicationPanel({api, onBusy, announce}) {
  let root = null, detail = null, state = null, timer = null, serial = 0, busy = false, uncertain = false;
  const node = (tag, text = '', cls = '') => {const el = document.createElement(tag); el.textContent = text; if (cls) el.className = cls; return el;};
  const labels = {not_configured: '公开 PR 身份尚未接入 · 可先审阅', private_review: '私人审阅 · 尚未公开', creating: '正在创建已确认的公开 PR',
    awaiting_resume: '已核对完成的阶段 · 可继续原任务', pending: '公开 PR 已创建 · CI 检查中', passed: 'CI 检查通过 · 待独立确认合并',
    failed: 'CI 未通过 · PR 内容已经公开，尚未上线', outcome_unknown: '执行结果待核对 · 暂不重复创建',
    closed: '公开 PR 已关闭', base_changed: 'main 已变化 · 需要重新核对', merged_externally: 'PR 已在外部合并 · 部署与索引尚需核对'};
  const errors = {publication_review_required: '请先核对技术依据、行文和全部公开内容。', publication_basis_changed: '依据已变化，请同步并重新准备提案。',
    publication_scope_changed: '拟公开内容已变化，请重新打开审阅。', publication_reconcile_required: '请先核对已有任务，避免重复创建。',
    publication_not_configured: '创建 PR 的服务身份尚未接入。', publication_approval_expired: '原批准已到期，请保留已完成阶段并重新核对。',
    publication_github_unavailable: '暂时无法读取 GitHub 状态。', publication_head_changed: '公开分支已被修改，请核对准确差异。'};
  function stop() {clearTimeout(timer); serial++; root?.remove(); root = null; detail = null; state = null; busy = false; uncertain = false;}
  const path = () => '/api/proposals/' + detail.proposal.proposal_id + '/publication';
  function render() {
    if (!root) return;
    const oldChecked = root.querySelector('input')?.checked || false;
    root.replaceChildren(node('h3', '公开 PR 审阅'), node('p', labels[state?.status] || errors[state?.status] || '任务需要核对，请查看状态。', 'publication-status'));
    root.setAttribute('aria-busy', String(busy));
    if (state?.stale) root.append(node('p', '候选、基线或规范已变化；当前版本不可继续创建 PR。', 'dialog-error'));
    const p = state?.preview;
    if (p) {
      const meta = node('details'); meta.append(node('summary', '拟公开的 PR 与提交信息'));
      meta.append(node('p', '仓库：' + p.repository), node('p', '分支：' + p.branch), node('p', 'PR 标题：' + p.title),
        node('pre', p.body, 'proposal-diff'), node('pre', p.commit_message, 'proposal-diff'));
      root.append(meta, node('p', '上方「完整修改后文件」就是拟公开的正文。创建公开分支或提交时正文即可能被访问；CI 失败也不意味着仍然私有。', 'publication-disclosure'));
    }
    const pr = state?.pr;
    if (pr && /^https:\/\/github\.com\/yuechuanhou\/embodied-ai-atlas\/pull\/[1-9]\d*$/.test(pr.url)) {
      const link = node('a', '查看公开 PR #' + pr.number); link.href = pr.url; link.target = '_blank'; link.rel = 'noopener noreferrer'; root.append(link);
    }
    const canCreate = !!p && state.enabled && !state.stale && !state.job_id && !uncertain;
    let check;
    if (canCreate) {
      const label = node('label', '', 'publication-confirm'); check = node('input'); check.type = 'checkbox'; check.checked = oldChecked;
      check.disabled = busy; label.append(check, document.createTextNode('我已核对技术依据与行文，并确认以上正文及 PR 信息可以公开。')); root.append(label);
    }
    const actions = node('div', '', 'dialog-actions');
    const refresh = node('button', '核对任务与 CI 状态'); refresh.type = 'button'; refresh.disabled = busy; refresh.onclick = () => refreshState(serial);
    actions.append(refresh);
    if (canCreate || state?.resume_available) {
      const resume = !!state.resume_available, create = node('button', resume ? '继续已确认任务' : '确认公开并创建 PR', 'send'); create.type = 'button';
      create.disabled = busy || (!resume && !check?.checked);
      if (check) check.onchange = () => {create.disabled = busy || !check.checked;};
      create.onclick = () => submit(resume, serial); actions.append(create);
    }
    root.append(actions, node('p', '正文经你确认后才发送 GitHub；私人证据清单、聊天和编辑备注留在工作台。确认公开后，由 PR CI 完成整仓语义校验、构建与渲染检查；通过后仍需另行确认合并发布。', 'muted'));
    if (state?.error_code) root.append(node('p', errors[state.error_code] || '阶段尚未完成：' + state.error_code, 'dialog-error'));
  }
  function schedule(ticket) {
    clearTimeout(timer);
    if (['creating','pending','outcome_unknown'].includes(state?.status)) timer = setTimeout(() => refreshState(ticket), 6000);
  }
  function accept(next) {
    const p = next.preview;
    if (next.binding?.patch_digest !== detail.proposal.patch_digest || (p && (p.file.path !== detail.files[0].path || p.file.after_utf8 !== detail.files[0].after_utf8)))
      throw Error('publication_scope_changed');
    state = next; uncertain = false;
  }
  async function refreshState(ticket) {
    if (!root || busy || ticket !== serial) return;
    busy = true; render();
    try {const next = await api(path() + '?version=' + detail.proposal.proposal_version); if (ticket === serial) accept(next);}
    catch (e) {if (ticket === serial) state = {...state, status: e.message, error_code: e.message};}
    finally {if (ticket === serial) {busy = false; render(); schedule(ticket);}}
  }
  async function submit(resume, ticket) {
    if (busy || !state?.preview || ticket !== serial) return;
    if (!resume && !root.querySelector('input')?.checked) return;
    busy = true; onBusy(true); render();
    try {
      const next = await api(path(), 'POST', {...state.binding, public_digest: state.preview.public_digest,
        technical_reviewed: true, editorial_reviewed: true, public_scope_confirmed: true, ...(resume ? {resume: true} : {})});
      if (ticket === serial) {accept(next); announce(next.pr ? '公开 PR 已创建，等待检查和后续合并确认。' : '任务已保存，请核对执行阶段。');}
    } catch (e) {if (ticket === serial) {uncertain = true; state = {...state, status: 'outcome_unknown', error_code: e.message};}}
    finally {if (ticket === serial) {busy = false; onBusy(false); render(); schedule(ticket);}}
  }
  return {stop, async show(value, container) {
    stop(); detail = value; root = node('section', '', 'proposal-review publication-review'); root.setAttribute('aria-label', '公开 PR 审阅');
    container.append(root); state = {status: 'private_review'}; await refreshState(serial);
  }};
}
