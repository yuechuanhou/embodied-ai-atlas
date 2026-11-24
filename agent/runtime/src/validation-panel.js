// Checks run in the background. Closing the preview does not cancel the durable
// task, and reopening resumes reads rather than repeating a paid generation.
export function createValidationPanel({get, api}) {
  let detail = null, state = null, timer = null, serial = 0, busy = false;
  const labels = {not_configured: '自动校验尚未接入 · 提案已私有保存', not_run: '等待启动自动校验', dispatching: '正在启动私有校验',
    queued: '已排队 · 等待执行', running: '正在校验内容并构建网站', reported: '检查已回传 · 正在核对任务结果',
    passed: '结构与构建检查通过 · 待内容和公开范围审阅', failed: '校验未通过 · 提案保持私有', unknown: '任务结果待核对 · 不会重复启动',
    expired: '依据已变化或任务超时 · 需要重新核对', unavailable: '暂时无法读取校验状态 · 提案仍已保存'};
  const stages = {envelope: '版本与摘要', semantic_validation: '知识身份与关系', content_validation: '内容规范', repository_build: '整站构建', render_regression: '渲染与历史锚点回归'};
  function stop() {clearTimeout(timer); timer = null; serial++; get('proposal-validation').hidden = true;}
  function render() {
    get('proposal-validation-status').textContent = labels[state?.status] || labels.unavailable;
    const active = ['dispatching','queued','running','reported'].includes(state?.status);
    get('proposal-validation-progress').hidden = !active;
    get('proposal-validation').setAttribute('aria-busy', String(active));
    get('proposal-validation-refresh').hidden = !state?.enabled;
    get('proposal-validation-refresh').disabled = busy;
    get('proposal-validation-retry').hidden = !state?.retryable || !!detail?.stale;
    get('proposal-validation-retry').disabled = busy;
    const list = get('proposal-validation-checks'); list.replaceChildren();
    for (const [key, label] of Object.entries(stages)) {
      const item = document.createElement('li');
      item.textContent = label + '：' + ({passed: '通过', failed: '未通过', not_run: '未运行'}[state?.checks?.[key]] || '等待检查');
      list.append(item);
    }
    get('proposal-validation-note').textContent = state?.error_code === 'daily_validation_budget_exceeded' ? '今天的校验次数已达上限，可稍后再试。' :
      state?.status === 'unknown' ? '启动结果尚不明确，先核对已有任务，避免重复执行。' :
      '这些检查不证明技术结论正确，也不代表已批准公开。技术、行文与公开范围仍需审阅。';
  }
  const path = () => '/api/proposals/' + detail.proposal.proposal_id + '/validation';
  async function refresh(ticket = serial) {
    if (!detail || ticket !== serial || busy) return;
    busy = true; render();
    try {
      const next = await api(path() + '?version=' + detail.proposal.proposal_version);
      if (ticket === serial) state = next;
    } catch {if (ticket === serial) state = {...state, status: 'unavailable'};}
    finally {if (ticket === serial) {busy = false; render(); schedule(ticket);}}
  }
  function schedule(ticket) {
    clearTimeout(timer);
    if (['dispatching','queued','running','reported','unknown'].includes(state?.status)) timer = setTimeout(() => refresh(ticket), 6000);
  }
  async function start(retryOf, ticket) {
    if (!detail || busy || ticket !== serial) return;
    busy = true; render();
    try {
      const next = await api(path(), 'POST', {version: detail.proposal.proposal_version, ...(retryOf ? {retry_of: retryOf} : {})});
      if (ticket === serial) state = next;
    } catch (e) {if (ticket === serial) state = {...state, enabled: true, status: 'unavailable', error_code: e.message};}
    finally {if (ticket === serial) {busy = false; render(); schedule(ticket);}}
  }
  get('proposal-validation-refresh').onclick = () => refresh();
  get('proposal-validation-retry').onclick = () => start(state?.id || null, serial);
  return {stop, async show(value) {
    stop(); busy = false; detail = value; state = value.validation || {enabled: false, status: 'not_configured'};
    get('proposal-validation').hidden = false;
    const ticket = serial; render();
    if (state.enabled && state.status === 'not_run' && !value.stale) await start(null, ticket);
    else schedule(ticket);
  }};
}
