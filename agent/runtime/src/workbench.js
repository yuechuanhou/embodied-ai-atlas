import clientSource from '../../../.preview/private-client/workbench-client.js';
import baseCSS from '../../../assets/site.css';
import mark from '../../../assets/icons/mark.svg';
import style from './workbench-style.js';

const icons = {
  panel: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  edit: '<path d="m14 5 5 5M4 20l5-1L20 8a2 2 0 0 0-5-5L4 14v6Z"/>',
  theme: '<path d="M20 14.2A8.5 8.5 0 0 1 9.8 4 8.5 8.5 0 1 0 20 14.2Z"/>',
  sync: '<path d="M20 7v5h-5M4 17v-5h5M19 12a7 7 0 0 0-12-5l-3 3m1 2a7 7 0 0 0 12 5l3-3"/>',
  export: '<path d="M12 3v12m-4-4 4 4 4-4M4 16v4h16v-4"/>',
  trash: '<path d="M3 6h18M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7m4-7v7"/>',
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
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="color-scheme" content="light dark"><title>Atlas · 私人工作台</title><style>${baseCSS}${style}</style></head><body>
<div class="app candidates-closed" id="app">
  <aside class="history" id="history-panel" aria-label="会话历史"><div class="panel-header"><div class="identity">${mark}<div><strong>Atlas</strong><small>私人学习工作台</small></div></div>${button('close-history', 'close', '收起会话列表', 'mobile-close')}</div>
    <button id="new-session" class="new-session" type="button">＋ 新对话</button><p class="section-label">最近对话</p><nav id="sessions" class="session-list" aria-label="选择会话"></nav><button id="more" hidden type="button">加载更多</button>
    <div class="sidebar-footer"><button id="refresh" type="button">${icon('sync')}同步知识内容</button><button id="export" type="button">${icon('export')}导出当前会话</button><button id="delete-session" type="button" class="danger">${icon('trash')}删除当前会话</button></div>
  </aside>
  <main class="private-chat" id="chat-panel"><header class="chat-header">${button('toggle-history', 'panel', '展开或收起会话列表')}<div class="title-group"><div class="title-line"><h1 id="conversation-title">新对话</h1>${button('rename', 'edit', '修改对话名称')}</div><div id="status" class="status-line" role="status">正在核验私人环境…</div></div><div class="header-tools">${button('theme', 'theme', '切换深浅主题')}<button id="toggle-candidates" class="candidate-toggle" type="button" aria-controls="candidate-panel" aria-expanded="false">知识候选 <span id="candidate-count" class="count">0</span></button></div></header>
    <div class="chat-scroll" id="chat-scroll"><div id="private-context" class="context-line"></div><div class="conversation"><section id="empty-state" class="empty-state"><div class="empty-mark">${mark}</div><h2>从一个问题，连接已有知识。</h2><p>一起理解概念、梳理问题，让新的认识慢慢沉淀。</p><div class="suggestions"><button type="button" data-prompt="帮我找到站内关于 VIO 的知识和原文入口。">找一找已有知识</button><button type="button" data-prompt="我遇到了一个系统集成问题，想一起分析可能的原因。">讨论一个实际问题</button><button type="button" data-prompt="请帮我梳理当前对话中值得保留的知识，整理为私人候选，暂不发布。">整理值得保留的理解</button></div></section><div id="messages" aria-label="对话记录"></div><div id="waiting" class="waiting" hidden>${waitingMark()}<span>正在检索并生成回答…</span></div></div></div>
    <div class="feedback"><p id="error" role="alert"></p><div class="retry-actions"><button id="check-result" hidden type="button">核对请求结果</button><button id="new-attempt" hidden type="button">重新发起请求</button></div></div>
    <form id="form" class="private-form"><div class="composer"><label for="question" class="visually-hidden">向 Atlas 提问</label><textarea id="question" rows="2" maxlength="4000" placeholder="想了解什么，或遇到了什么问题？"></textarea><div class="form-actions"><span id="composer-hint">Enter 发送 · Shift + Enter 换行</span><button id="send" class="send" type="submit">发送</button></div></div><p class="form-note">对话与候选仅自己可见 · 模型补充需要核验，正式入库需审阅</p></form>
  </main>
  <aside class="drafts" id="candidate-panel" aria-label="私人知识候选"><div class="panel-header"><h2>知识候选 <span id="panel-count" class="muted">0</span></h2>${button('close-candidates', 'close', '收起知识候选')}</div><p class="panel-description">从对话中沉淀，经过核验后再入库。</p><div id="candidates" class="candidate-list"></div><div class="draft-footer">此阶段仅保存私人候选，不创建公共 PR。</div></aside>
  <button id="scrim" class="scrim" type="button" aria-label="关闭侧栏" tabindex="-1"></button>
</div>
<dialog id="rename-dialog" class="dialog" aria-labelledby="rename-heading"><form id="rename-form"><h2 id="rename-heading">修改对话名称</h2><label for="session-title">对话名称</label><input id="session-title" name="title" maxlength="160" autocomplete="off" required><p id="rename-error" class="dialog-error" role="alert"></p><div class="dialog-actions"><button id="rename-cancel" type="button">取消</button><button id="rename-save" class="send" type="submit">保存</button></div></form></dialog>
<template id="avatar">${mark}</template><div id="announcer" class="visually-hidden" role="status" aria-live="polite"></div>
<script nonce="${nonce}">${clientSource.replace(/<\/(script|body|html|head)/gi, '<\\/$1')}</script></body></html>`;
}
