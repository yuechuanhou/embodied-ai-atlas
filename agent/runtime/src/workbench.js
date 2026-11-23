import clientSource from '../../../.preview/private-client/workbench-client.js';
import baseCSS from '../../../assets/site.css';
import mark from '../../../assets/icons/mark.svg';
import style from './workbench-style.js';
import {AGENT_NAME} from './reading-view.js';

const icons = {
  panel: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  edit: '<path d="m14 5 5 5M4 20l5-1L20 8a2 2 0 0 0-5-5L4 14v6Z"/>',
  theme: '<path d="M20 14.2A8.5 8.5 0 0 1 9.8 4 8.5 8.5 0 1 0 20 14.2Z"/>',
  sync: '<path d="M20 7v5h-5M4 17v-5h5M19 12a7 7 0 0 0-12-5l-3 3m1 2a7 7 0 0 0 12 5l3-3"/>',
  export: '<path d="M12 3v12m-4-4 4 4 4-4M4 16v4h16v-4"/>',
  trash: '<path d="M3 6h18M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7m4-7v7"/>',
  more: '<circle cx="5" cy="12" r="1.4" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="1.4" fill="currentColor" stroke="none"/>',
  pin: '<path d="m9 3 8 2-2 6 3 4-1 1-6-2-5 1 2-5 1-7ZM11 14l-4 7"/>',
};
const icon = name => '<svg viewBox="0 0 24 24" aria-hidden="true">' + icons[name] + '</svg>';
const button = (id, name, label, extra = '') => `<button id="${id}" type="button" class="icon-button ${extra}" aria-label="${label}" title="${label}">${icon(name)}</button>`;
export function waitingMark() {
  const ellipses = mark.match(/<ellipse[^>]+\/>/g);
  const tracks = ellipses.map((ellipse, i) => '<g>' + ellipse.replace('/>', ' class="orbit-base"/>') +
    ['tail-2', 'tail-1', 'head'].map(cls => ellipse.replace('/>', ` pathLength="100" class="comet ${cls} ${i ? 'orbit-second' : ''}"/>`)).join('') + '</g>').join('');
  return '<svg class="orbit-icon" viewBox="0 0 64 64" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="2">' + tracks + '</g><circle cx="32" cy="32" r="4.2" fill="currentColor"/></svg>';
}
export function renderWorkbench(nonce) {
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="color-scheme" content="light dark"><title>${AGENT_NAME} · Atlas 私人工作台</title><style>${baseCSS}${style}</style></head><body>
<section id="reader-shell" aria-label="Atlas 阅读区"><iframe id="atlas-reader" title="Embodied AI Atlas 原文与导航" sandbox="allow-scripts allow-same-origin allow-popups" referrerpolicy="no-referrer" hidden></iframe><div id="reader-loading" hidden role="status"><p id="reader-loading-text">正在打开 Atlas 阅读页面…</p><button type="button" id="reader-retry">重新载入</button><a id="public-atlas" target="_blank" rel="noopener noreferrer">打开公开 Atlas</a></div></section>
<button id="reader-launch" type="button" hidden>${mark}<span>问 ${AGENT_NAME}</span></button>
<div class="app candidates-closed" id="app">
  <aside class="history" id="history-panel" aria-label="会话历史"><div class="panel-header"><div class="identity">${mark}<div><strong>${AGENT_NAME}</strong><small>Atlas · 私人研究</small></div></div>${button('close-history', 'close', '收起会话列表', 'mobile-close')}</div>
    <button id="new-session" class="new-session" type="button">＋ 新对话</button><nav id="sessions" class="session-list" aria-label="选择会话"></nav><button id="more" hidden type="button">加载更多</button>
    <div id="session-menu" class="session-menu" role="menu" aria-label="对话操作" hidden><button id="menu-pin" type="button" role="menuitem">${icon('pin')}<span id="menu-pin-label">置顶</span></button><button id="menu-rename" type="button" role="menuitem">${icon('edit')}<span>重命名</span></button><div class="menu-divider" role="separator"></div><button id="menu-delete" class="menu-delete" type="button" role="menuitem">${icon('trash')}<span>删除</span></button></div>
    <div class="sidebar-footer"><button id="refresh" type="button">${icon('sync')}同步知识内容</button><button id="export" type="button">${icon('export')}导出当前会话</button><button id="delete-session" type="button" class="danger">${icon('trash')}删除当前会话</button></div>
  </aside>
  <main class="private-chat" id="chat-panel"><div class="orbit-toolbar"><strong>${AGENT_NAME}</strong><nav aria-label="阅读与研究显示方式"><button type="button" data-reading-mode="companion" aria-pressed="false">伴读</button><button type="button" data-reading-mode="sidebar" aria-pressed="false">对话</button><button type="button" data-reading-mode="research" aria-pressed="true">研究</button></nav><button id="return-reading" type="button">返回阅读</button>${button('hide-orbit', 'close', '收起 Orbit，继续阅读')}</div><header class="chat-header">${button('toggle-history', 'panel', '展开或收起会话列表')}<div class="title-group"><div class="title-line"><h1><button id="conversation-picker" type="button" aria-controls="history-panel" aria-expanded="false"><span id="conversation-title">新对话</span><span aria-hidden="true">⌄</span></button></h1>${button('rename', 'edit', '修改对话名称')}</div><div id="status" class="status-line" role="status">正在核验私人环境…</div></div><div class="header-tools">${button('theme', 'theme', '切换深浅主题')}<button id="toggle-candidates" class="candidate-toggle" type="button" aria-controls="candidate-panel" aria-expanded="false">知识候选 <span id="candidate-count" class="count">0</span></button></div></header>
    <div class="reading-scope"><span id="reading-scope-name">全站知识</span><button id="reading-scope-pin" type="button" aria-pressed="false">跟随阅读</button><button id="use-current-reading" type="button" hidden>使用当前章节</button></div>
    <div class="chat-scroll" id="chat-scroll"><div id="private-context" class="context-line" hidden></div><div class="conversation"><section id="empty-state" class="empty-state"><div class="empty-mark">${mark}</div><h2>从一个问题，连接已有知识。</h2><p>一起理解概念、梳理问题，让新的认识慢慢沉淀。</p><div class="suggestions"><button type="button" data-prompt="帮我找到站内关于 VIO 的知识和原文入口。">找一找已有知识</button><button type="button" data-prompt="我遇到了一个系统集成问题，想一起分析可能的原因。">讨论一个实际问题</button><button type="button" data-prompt="请帮我梳理当前对话中值得保留的知识，整理为私人候选，暂不发布。">整理值得保留的理解</button></div></section><div id="messages" aria-label="对话记录"></div><div id="waiting" class="waiting" hidden>${waitingMark()}<span>正在检索并生成回答…</span></div></div></div>
    <div class="feedback"><p id="error" role="alert"></p><div class="retry-actions"><button id="check-result" hidden type="button">核对请求结果</button><button id="new-attempt" hidden type="button">重新发起请求</button></div></div>
    <form id="form" class="private-form"><div class="composer"><label for="question" class="visually-hidden">向 ${AGENT_NAME} 提问</label><textarea id="question" rows="2" maxlength="4000" placeholder="想了解什么，或遇到了什么问题？"></textarea><div class="form-actions"><span id="composer-hint">Enter 发送 · Shift + Enter 换行</span><button id="send" class="send" type="submit">发送</button></div></div><p class="form-note">对话与候选仅自己可见 · 模型补充需要核验，正式入库需审阅</p></form>
  </main>
  <aside class="drafts" id="candidate-panel" aria-label="私人知识候选"><div class="panel-header"><h2>知识候选 <span id="panel-count" class="muted">0</span></h2>${button('close-candidates', 'close', '收起知识候选')}</div><p class="panel-description">审阅正文、归属与来源，准备值得保留的知识。</p><div id="candidates" class="candidate-list"></div><div class="draft-footer">整理与导出保持私有；正式提案及 GitHub 入库尚待接入。</div></aside>
  <button id="scrim" class="scrim" type="button" aria-label="关闭侧栏" tabindex="-1"></button>
</div>
<dialog id="candidate-dialog" class="dialog candidate-dialog" aria-labelledby="candidate-heading"><form id="candidate-form"><header><h2 id="candidate-heading">整理知识候选</h2><p id="candidate-version" class="muted"></p></header><p id="candidate-loading" role="status">正在读取候选与最新归属…</p>
<div id="candidate-fields" hidden><label for="candidate-title">标题</label><input id="candidate-title" maxlength="160" required>
<div class="candidate-field-grid"><div><label for="candidate-domain">Primary Domain</label><select id="candidate-domain"></select></div><div><label for="candidate-article">目标文章</label><select id="candidate-article"></select></div></div>
<label for="candidate-body">整理正文 · Markdown</label><textarea id="candidate-body" rows="9" maxlength="12000" required></textarea><details class="candidate-preview"><summary>预览正文</summary><div id="candidate-preview" class="message-content"></div></details>
<div class="candidate-field-grid"><div><label for="candidate-state">整理状态</label><select id="candidate-state"><option value="captured">已记录</option><option value="researching">待查证</option><option value="drafting">整理中</option><option value="ready">已整理 · 待正式提案</option><option value="dismissed">暂不采用</option></select></div><div><label for="candidate-evidence-kind">本次核对依据</label><select id="candidate-evidence-kind"><option value="">仍需查证</option><option value="official">已阅读的官方资料</option><option value="paper">已阅读的论文</option><option value="experience">本人提供的工程经验</option></select></div></div>
<div id="candidate-evidence-fields" hidden><label id="candidate-reference-label" for="candidate-reference">已阅读来源的 HTTPS 链接</label><textarea id="candidate-reference" rows="2" maxlength="2000"></textarea><label for="candidate-supports">支持的结论、适用条件与限制</label><textarea id="candidate-supports" rows="3" maxlength="3000"></textarea><label class="candidate-confirm"><input id="candidate-confirm" type="checkbox"><span>我已对照当前站内内容和上述依据，核对本次完整草稿。</span></label><p class="muted">此记录表示本人核对，不表示 Orbit 已检索外部网页。正文或依据变化后需要重新核对。</p></div>
<p class="candidate-private-note">保存与导出都保持私有。「已整理」仍需正式提案、完整差异和公开范围审阅后才能入库。</p></div>
<p id="candidate-error" class="dialog-error" role="alert"></p><div class="dialog-actions"><a id="candidate-export" download>导出已保存版本</a><button id="candidate-cancel" type="button">取消</button><button id="candidate-save" class="send" type="submit">保存私人候选</button></div></form></dialog>
<dialog id="rename-dialog" class="dialog" aria-labelledby="rename-heading"><form id="rename-form"><h2 id="rename-heading">修改对话名称</h2><label for="session-title">对话名称</label><input id="session-title" name="title" maxlength="160" autocomplete="off" required><p id="rename-error" class="dialog-error" role="alert"></p><div class="dialog-actions"><button id="rename-cancel" type="button">取消</button><button id="rename-save" class="send" type="submit">保存</button></div></form></dialog>
<dialog id="delete-dialog" class="dialog delete-dialog" aria-labelledby="delete-heading" aria-describedby="delete-name delete-scope"><h2 id="delete-heading">删除这条对话？</h2><p id="delete-name" class="delete-name"></p><div id="delete-scope"><p>对话消息和关联的未入库候选会从当前数据库中删除，无法在工作台恢复。</p><p>已发布的知识、独立审计和用量记录会保留。需要保留的内容请先导出。</p></div><p id="delete-error" class="dialog-error" role="alert"></p><div class="dialog-actions"><button id="delete-cancel" type="button">取消</button><button id="delete-confirm" class="destructive" type="button">删除对话</button></div></dialog>
<template id="more-icon">${icon('more')}</template><template id="pin-icon">${icon('pin')}</template>
<template id="avatar">${mark}</template><div id="announcer" class="visually-hidden" role="status" aria-live="polite"></div>
<script nonce="${nonce}">${clientSource.replace(/<\/(script|body|html|head)/gi, '<\\/$1')}</script></body></html>`;
}
