export default `
* {
  box-sizing:border-box
}
html,body {
  margin:0;
  height:100%;
  overflow:hidden
}
body {
  font-family:Inter,-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif;
  font-size:16px;
  line-height:1.65;
  background:var(--paper);
  color:var(--ink)
}
button,input,textarea {
  font:inherit
}
button {
  cursor:pointer
}
button:disabled {
  cursor:default;
  opacity:.45
}
button,a,input,textarea,summary {
  touch-action:manipulation
}
button:focus-visible,a:focus-visible,summary:focus-visible,input:focus-visible,textarea:focus-visible {
  outline:2px solid var(--accent);
  outline-offset:3px
}
button {
  border:0;
  background:transparent;
  color:inherit;
  border-radius:9px;
  padding:8px 11px;
  font-size:14px;
  line-height:1.4
}
button:hover:not(:disabled) {
  background:var(--paper-2)
}
button[hidden],[hidden] {
  display:none!important
}
svg {
  display:block
}
.icon-button {
  display:inline-flex;
  align-items:center;
  justify-content:center;
  width:40px;
  height:40px;
  padding:10px;
  flex:none
}
.icon-button svg {
  width:20px;
  height:20px;
  fill:none;
  stroke:currentColor;
  stroke-width:1.7;
  stroke-linecap:round;
  stroke-linejoin:round
}
.muted {
  color:var(--muted)
}
.visually-hidden {
  position:absolute;
  width:1px;
  height:1px;
  overflow:hidden;
  clip-path:inset(50%);
  white-space:nowrap
}
.app {
  height:100dvh;
  display:grid;
  grid-template-columns:240px minmax(0,1fr) 340px;
  transition:grid-template-columns .2s ease
}
.app.history-closed {
  grid-template-columns:0 minmax(0,1fr) 340px
}
.app.candidates-closed {
  grid-template-columns:240px minmax(0,1fr) 0
}
.app.history-closed.candidates-closed {
  grid-template-columns:0 minmax(0,1fr) 0
}
.history,.drafts {
  min-width:0;
  overflow:hidden;
  background:var(--bg);
  display:flex;
  flex-direction:column
}
.history {
  border-right:1px solid var(--line)
}
.drafts {
  border-left:1px solid var(--line)
}
.history-closed .history,.candidates-closed .drafts {
  visibility:hidden
}
.panel-header {
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:8px;
  padding:18px 18px 12px;
  min-height:76px;
  flex:none
}
.identity {
  display:flex;
  align-items:center;
  gap:10px;
  white-space:nowrap
}
.identity>svg {
  width:34px;
  height:34px;
  color:var(--accent)
}
.identity strong {
  font-size:16px;
  letter-spacing:-.35px
}
.identity small {
  font-size:12px;
  display:block;
  color:var(--muted);
  line-height:1.3
}
.new-session {
  margin:0 16px 24px;
  background:var(--accent-soft);
  color:var(--accent);
  text-align:left;
  padding:12px 14px;
  font-weight:600;
  white-space:nowrap
}
.new-session:hover:not(:disabled) {
  background:var(--line)
}
.session-group-label {
  font-size:12px;
  color:var(--muted);
  margin:20px 12px 7px;
  font-weight:500;
  letter-spacing:.06em
}
.session-list {
  overflow-y:auto;
  padding:0 12px;
  flex:1;
  min-height:0
}
.session-item {
  display:flex;
  align-items:center;
  gap:8px;
  min-height:42px;
  width:100%;
  text-align:left;
  margin:0;
  padding:9px 12px;
  overflow:hidden
}
.session-row {
  display:flex;
  align-items:center;
  border-radius:9px;
  margin:3px 0
}
.session-row:has(.session-item[aria-current=true]) {
  background:var(--accent-soft)
}
.session-row .session-item {
  min-width:0;
  flex:1
}
.session-actions-trigger {
  color:var(--muted);
  opacity:0;
  width:34px;
  height:38px;
  padding:9px;
  margin-right:3px
}
.session-row:hover .session-actions-trigger,.session-row:focus-within .session-actions-trigger,.session-actions-trigger[aria-expanded=true] {
  opacity:1
}
.session-actions-trigger:hover:not(:disabled) {
  color:var(--ink)
}
@media(hover:none) {
  .session-actions-trigger {
    opacity:1
  }
}
.delete-name {
  font-size:15px;
  font-weight:600;
  overflow-wrap:anywhere
}
#delete-scope {
  color:var(--muted);
  font-size:14px;
  line-height:1.8
}
.destructive {
  background:#b23b45;
  color:#fff;
  padding:10px 15px
}
.destructive:hover:not(:disabled) {
  background:#96313b
}
.session-group-label:first-child {
  margin-top:0
}
.pinned-mark {
  flex:none;
  color:var(--muted)
}
.pinned-mark svg {
  width:14px;
  height:14px;
  fill:none;
  stroke:currentColor;
  stroke-width:1.7;
  stroke-linecap:round;
  stroke-linejoin:round
}
.session-menu {
  position:fixed;
  z-index:50;
  width:184px;
  padding:6px;
  background:var(--paper);
  border:1px solid var(--line);
  border-radius:12px;
  box-shadow:0 8px 30px #102b3826
}
.session-menu button {
  display:flex;
  align-items:center;
  gap:11px;
  width:100%;
  min-height:40px;
  padding:9px 11px;
  text-align:left;
  border-radius:7px;
  font-size:14px
}
.session-menu svg {
  width:18px;
  height:18px;
  flex:none;
  fill:none;
  stroke:currentColor;
  stroke-width:1.7;
  stroke-linecap:round;
  stroke-linejoin:round
}
.menu-divider {
  height:1px;
  background:var(--line);
  margin:5px 5px
}
.session-menu .menu-delete {
  color:#b23b45
}
:root[data-theme=dark] .session-menu .menu-delete {
  color:#f3a4ac
}
.session-item strong {
  min-width:0;
  flex:1;
  font-size:14px;
  line-height:1.5;
  font-weight:450;
  white-space:nowrap;
  overflow:hidden;
  text-overflow:ellipsis;
  display:block
}
.session-item[aria-current=true] {
  background:var(--accent-soft)
}
.session-item[aria-current=true] strong {
  color:var(--accent);
  font-weight:600
}
.sidebar-footer {
  padding:14px 18px;
  border-top:1px solid var(--line)
}
.sidebar-footer button {
  display:flex;
  align-items:center;
  gap:9px;
  width:100%;
  text-align:left
}
.sidebar-footer svg {
  width:17px;
  height:17px;
  stroke:currentColor;
  fill:none;
  stroke-width:1.7
}
.private-chat {
  min-width:0;
  min-height:0;
  display:flex;
  flex-direction:column;
  background:var(--paper);
  position:relative
}
.chat-header {
  height:77px;
  display:flex;
  align-items:center;
  gap:12px;
  padding:12px 24px;
  border-bottom:1px solid var(--line);
  flex:none
}
.title-group {
  min-width:0;
  flex:1
}
.title-line {
  display:flex;
  align-items:center;
  gap:3px;
  min-width:0
}
.title-line h1 {
  font-size:16px;
  font-weight:600;
  line-height:1.4;
  margin:0;
  overflow:hidden;
  white-space:nowrap;
  text-overflow:ellipsis
}
.title-line .icon-button {
  width:30px;
  height:28px;
  padding:6px
}
.title-line .icon-button svg {
  width:15px;
  height:15px
}
.status-line {
  font-size:12px;
  color:var(--muted);
  overflow:hidden;
  text-overflow:ellipsis;
  white-space:nowrap;
  margin-top:2px
}
.status-line:before {
  content:'';
  display:inline-block;
  width:5px;
  height:5px;
  background:var(--accent);
  border-radius:50%;
  vertical-align:middle;
  margin-right:6px
}
.header-tools {
  display:flex;
  align-items:center;
  gap:6px
}
.candidate-toggle {
  display:flex;
  align-items:center;
  gap:8px;
  white-space:nowrap
}
.count {
  background:var(--accent-soft);
  color:var(--accent);
  border-radius:5px;
  min-width:20px;
  padding:0 5px;
  font-size:12px
}
.chat-scroll {
  flex:1;
  min-height:0;
  overflow-y:auto;
  overscroll-behavior:contain;
  scroll-behavior:smooth;
  padding:0 28px;
  scroll-padding-bottom:28px
}
.conversation {
  max-width:780px;
  margin:0 auto;
  padding:30px 0 20px
}
.context-line {
  font-size:13px;
  color:var(--muted);
  max-width:780px;
  margin:14px auto -14px;
  overflow-wrap:anywhere
}
.context-line:empty {
  display:none
}
.message {
  margin:0 0 32px;
  min-width:0;
  overflow-wrap:anywhere
}
.message.user {
  margin-left:auto;
  max-width:86%;
  width:fit-content;
  background:var(--paper-2);
  border-radius:18px 18px 4px 18px;
  padding:14px 18px;
  white-space:pre-wrap
}
.message.user p {
  margin:0
}
.message.assistant {
  position:relative;
  padding-left:42px
}
.message-avatar {
  position:absolute;
  left:0;
  top:2px;
  color:var(--accent)
}
.message-avatar svg {
  color:var(--accent);
  width:28px;
  height:28px
}
.message-content {
  line-height:1.85;
  font-size:16px
}
.message-content>:first-child {
  margin-top:0
}
.message-content>:last-child {
  margin-bottom:0
}
.message-content p {
  margin:.85em 0
}
.message-content h1,.message-content h2,.message-content h3,.message-content h4 {
  font-size:1.06em;
  font-weight:650;
  line-height:1.5;
  margin:1.5em 0 .6em
}
.message-content ul,.message-content ol {
  padding-left:1.45em;
  margin:.7em 0
}
.message-content li {
  margin:.35em 0
}
.message-content li>p {
  margin:.35em 0
}
.message-content a,.metadata a,.source {
  color:var(--accent);
  text-underline-offset:3px
}
.message-content code {
  font: .88em ui-monospace,SFMono-Regular,Consolas,monospace;
  background:var(--paper-2);
  padding:2px 5px;
  border-radius:4px
}
.message-content pre {
  background:var(--bg);
  border:1px solid var(--line);
  border-radius:10px;
  padding:16px;
  overflow:auto;
  max-width:100%
}
.message-content pre code {
  background:transparent;
  padding:0
}
.message-content blockquote {
  border-left:2px solid var(--accent);
  color:var(--muted);
  margin:1em 0;
  padding:0 0 0 16px
}
.message-content table {
  display:block;
  width:100%;
  overflow:auto;
  border-collapse:collapse;
  font-size:14px
}
.message-content th,.message-content td {
  border:1px solid var(--line);
  padding:7px 10px;
  min-width:100px
}
.message-content hr {
  border:0;
  border-top:1px solid var(--line);
  margin:24px 0
}
.sources {
  display:flex;
  flex-wrap:wrap;
  gap:8px;
  margin-top:16px
}
.source {
  display:block;
  max-width:100%;
  padding:7px 11px;
  border:1px solid var(--line);
  border-radius:8px;
  text-decoration:none;
  font-size:13px
}
.source:hover {
  background:var(--accent-soft)
}
.source small {
  display:block;
  font-size:11px;
  color:var(--muted);
  margin-top:1px
}
.empty-state {
  max-width:620px;
  margin:clamp(40px,14vh,145px) auto 28px
}
.empty-mark {
  color:var(--accent);
  margin-bottom:18px
}
.empty-mark svg {
  color:var(--accent);
  width:64px;
  height:64px
}
.empty-state h2 {
  font-size:27px;
  letter-spacing:-.8px;
  line-height:1.5;
  margin:0 0 9px;
  font-weight:600
}
.empty-state>p {
  color:var(--muted);
  font-size:15px;
  margin:0 0 29px
}
.suggestions {
  display:flex;
  flex-direction:column;
  align-items:flex-start;
  gap:6px
}
.suggestions button {
  font-size:14px;
  text-align:left;
  border:1px solid var(--line);
  padding:10px 14px;
  border-radius:10px
}
.suggestions button:hover {
  border-color:var(--accent)
}
.private-form {
  flex:none;
  max-width:836px;
  width:100%;
  margin:0 auto;
  padding:12px 28px 14px;
  background:var(--paper)
}
.composer {
  border:1px solid var(--line);
  border-radius:16px;
  background:var(--paper);
  box-shadow:0 3px 16px #132c3406;
  padding:14px 14px 10px;
  transition:border-color .15s
}
.composer:focus-within {
  border-color:var(--accent)
}
textarea {
  display:block;
  width:100%;
  border:0;
  outline:none!important;
  background:transparent;
  color:var(--ink);
  font-size:16px;
  line-height:1.6;
  min-height:51px;
  max-height:160px;
  resize:none;
  padding:0 2px
}
.form-actions {
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:10px;
  margin-top:7px
}
.form-actions span {
  font-size:12px;
  color:var(--muted)
}
.send {
  border-radius:9px;
  background:var(--accent);
  color:var(--paper);
  font-weight:600;
  font-size:14px;
  min-width:62px;
  padding:9px 14px
}
.send:hover:not(:disabled) {
  background:var(--accent);
  filter:brightness(1.08)
}
:root[data-theme=dark] .send {
  color:#133337
}
.form-note {
  text-align:center;
  color:var(--muted);
  font-size:11px;
  margin:8px 0 0
}
.feedback {
  max-width:780px;
  width:100%;
  margin:0 auto;
  padding:0 28px
}
.feedback p {
  margin:5px 0;
  font-size:14px;
  color:var(--accent);
  overflow-wrap:anywhere
}
.retry-actions {
  display:flex;
  gap:8px;
  flex-wrap:wrap;
  margin:8px 0
}
.retry-actions button {
  border:1px solid var(--line)
}
.waiting {
  display:flex;
  align-items:center;
  gap:12px;
  color:var(--muted);
  font-size:14px;
  min-height:64px;
  padding:8px 0;
  margin-bottom:24px
}
.orbit-icon {
  width:46px;
  height:46px;
  color:var(--accent);
  flex:none
}
.orbit-icon .orbit-base {
  opacity:.2
}
.orbit-icon .comet {
  fill:none;
  stroke:currentColor;
  stroke-linecap:round;
  animation:orbit-travel 2.4s linear infinite
}
.orbit-icon .orbit-second {
  animation-duration:3.1s;
  animation-direction:reverse
}
.orbit-icon .tail-1 {
  animation-name:orbit-tail-one;
  opacity:.35;
  stroke-width:2.1;
  stroke-dasharray:5 95;
  stroke-dashoffset:8
}
.orbit-icon .tail-2 {
  animation-name:orbit-tail-two;
  opacity:.13;
  stroke-width:1.6;
  stroke-dasharray:7 93;
  stroke-dashoffset:16
}
.orbit-icon .head {
  stroke-width:3.1;
  stroke-dasharray:5 95;
  filter:drop-shadow(0 0 2px #81d8d055)
}
@keyframes orbit-travel {
  to {
    stroke-dashoffset:-100
  }
}
.just-sent {
  animation:message-enter .22s ease-out
}
@keyframes orbit-tail-one {
  from {
    stroke-dashoffset:8
  }
  to {
    stroke-dashoffset:-92
  }
}
@keyframes orbit-tail-two {
  from {
    stroke-dashoffset:16
  }
  to {
    stroke-dashoffset:-84
  }
}
@keyframes message-enter {
  from {
    opacity:.2;
    transform:translateY(12px)
  }
  to {
    opacity:1;
    transform:none
  }
}
.drafts .panel-header h2 {
  font-size:15px;
  font-weight:600;
  margin:0;
  white-space:nowrap
}
.panel-description {
  font-size:13px;
  color:var(--muted);
  padding:0 22px;
  margin:0 0 20px
}
.candidate-list {
  min-height:0;
  overflow:auto;
  flex:1;
  padding:0 20px
}
.candidate {
  border:1px solid var(--line);
  background:var(--paper);
  border-radius:12px;
  padding:16px;
  margin-bottom:14px;
  overflow-wrap:anywhere
}
.candidate h3 {
  font-size:15px;
  line-height:1.7;
  margin:0 0 8px;
  font-weight:600
}
.candidate-state {
  font-size:12px;
  color:var(--accent);
  margin:0 0 18px
}
.metadata {
  font-size:13px;
  line-height:1.7;
  margin:0 0 15px
}
.metadata dt {
  color:var(--muted);
  margin-top:10px;
  font-size:12px
}
.metadata dd {
  margin:2px 0 0
}
.metadata code {
  font-size:11px;
  display:block;
  color:var(--muted);
  overflow-wrap:anywhere
}
.metadata a {
  display:inline-block
}
.candidate details {
  border-top:1px solid var(--line);
  padding-top:12px
}
.candidate summary {
  cursor:pointer;
  font-size:13px;
  color:var(--muted)
}
.candidate .message-content {
  font-size:14px;
  margin-top:14px
}
.candidate-warning {
  color:var(--muted);
  font-size:12px;
  line-height:1.7;
  margin:12px 0 0
}
.reference-topics {
  display:flex;
  gap:5px;
  flex-wrap:wrap;
  margin-top:6px
}
.reference-topics a {
  font-size:12px;
  border:1px solid var(--line);
  border-radius:5px;
  padding:2px 6px;
  text-decoration:none
}
.candidate-empty {
  padding:28px 4px;
  max-width:260px
}
.candidate-empty svg {
  width:34px;
  height:34px;
  color:var(--accent);
  opacity:.6;
  margin-bottom:18px
}
.candidate-empty h3 {
  font-size:15px;
  font-weight:500;
  margin:0 0 8px
}
.candidate-empty p {
  font-size:13px;
  color:var(--muted);
  line-height:1.85;
  margin:0
}
.draft-footer {
  padding:14px 22px 18px;
  border-top:1px solid var(--line);
  font-size:12px;
  color:var(--muted)
}
.dialog {
  width:min(440px,calc(100% - 32px));
  padding:26px;
  border:1px solid var(--line);
  border-radius:16px;
  background:var(--paper);
  color:var(--ink);
  box-shadow:0 16px 80px #0002
}
.dialog::backdrop {
  background:#10242b66;
  backdrop-filter:blur(3px)
}
.dialog h2 {
  font-size:19px;
  margin:0 0 20px
}
.dialog label {
  font-size:14px;
  display:block;
  margin-bottom:8px
}
.dialog input {
  width:100%;
  padding:10px 12px;
  border:1px solid var(--line);
  border-radius:8px;
  background:var(--paper);
  color:var(--ink);
  font-size:16px
}
.dialog-error {
  font-size:13px;
  color:var(--accent);
  min-height:22px;
  margin:7px 0
}
.dialog-actions {
  display:flex;
  gap:9px;
  justify-content:flex-end;
  margin-top:16px
}
.danger {
  color:var(--muted)
}
.scrim {
  display:none
}
.mobile-close {
  display:none
}
@media(min-width:1600px) {
  .app {
    grid-template-columns:260px minmax(0,1fr) 360px
  }
  .app.history-closed {
    grid-template-columns:0 minmax(0,1fr) 360px
  }
  .app.candidates-closed {
    grid-template-columns:260px minmax(0,1fr) 0
  }
}
@media(max-width:1250px) {
  .app {
    grid-template-columns:220px minmax(0,1fr) 0
  }
  .app.history-closed {
    grid-template-columns:0 minmax(0,1fr) 0
  }
  .app.candidates-closed {
    grid-template-columns:220px minmax(0,1fr) 0
  }
  .drafts {
    position:fixed;
    right:0;
    top:0;
    bottom:0;
    width:min(380px,90vw);
    z-index:5;
    box-shadow:-12px 0 50px #12262d0d
  }
  .drafts .mobile-close {
    display:flex
  }
  .app:not(.candidates-closed) .scrim {
    display:block
  }
  .scrim {
    position:fixed;
    inset:0;
    z-index:4;
    background:#0b212a55;
    border-radius:0;
    width:100%;
    height:100%;
    padding:0
  }
  .scrim:hover:not(:disabled) {
    background:#0b212a55
  }
}
@media(max-width:760px) {
  .session-actions-trigger {
    opacity:1
  }
  .app,.app.history-closed,.app.candidates-closed,.app.history-closed.candidates-closed {
    display:flex
  }
  .private-chat {
    width:100%;
    height:100%
  }
  .history {
    position:fixed;
    left:0;
    top:0;
    bottom:0;
    width:min(290px,86vw);
    z-index:5;
    box-shadow:12px 0 50px #12262d0d
  }
  .history .mobile-close {
    display:flex
  }
  .app:not(.history-closed) .scrim {
    display:block
  }
  .chat-header {
    padding:10px 12px;
    height:69px;
    gap:6px
  }
  .header-tools {
    gap:0
  }
  .candidate-toggle {
    font-size:13px;
    padding:8px
  }
  .title-line h1 {
    font-size:15px
  }
  .status-line {
    font-size:11px;
    max-width:48vw
  }
  .chat-scroll {
    padding:0 18px
  }
  .conversation {
    padding-top:24px
  }
  .message.user {
    max-width:92%;
    font-size:15px;
    padding:12px 15px
  }
  .message.assistant {
    padding-left:0
  }
  .message.assistant>.message-avatar {
    position:static;
    margin-bottom:10px
  }
  .message-avatar svg {
    width:24px;
    height:24px
  }
  .message-content {
    font-size:15px;
    line-height:1.85
  }
  .private-form {
    padding:8px 12px 10px
  }
  .form-actions span {
    font-size:11px
  }
  .form-note {
    font-size:10px
  }
  .composer {
    padding:12px 12px 9px
  }
  .empty-state {
    margin-top:clamp(34px,10vh,100px)
  }
  .empty-state h2 {
    font-size:24px
  }
  .empty-state>p {
    font-size:14px
  }
  .empty-mark svg {
    width:55px;
    height:55px
  }
  .feedback {
    padding:0 16px
  }
  .panel-header {
    min-height:69px
  }
  .candidate-list {
    padding:0 16px
  }
  .orbit-icon {
    width:42px;
    height:42px
  }
  .title-line .icon-button {
    flex:none
  }
  .candidate-toggle .count {
    display:none
  }
}
/* The same private chat DOM survives every layout change. */
#reader-shell {position:fixed;inset:0;background:var(--bg)}
#atlas-reader {width:100%;height:100%;border:0;display:block;background:var(--bg)}
#reader-loading {position:absolute;inset:80px 24px auto;max-width:560px;margin:auto;padding:18px;background:var(--paper);border:1px solid var(--line);border-radius:12px;z-index:2}
#reader-loading p {margin:0 0 10px}
#reader-loading a {margin-left:12px;font-size:14px}
#reader-launch {position:fixed;right:24px;bottom:24px;z-index:5;display:flex;align-items:center;gap:9px;border:1px solid var(--line);box-shadow:var(--shadow);background:var(--paper);padding:11px 16px;color:var(--accent)}
#reader-launch svg {width:30px;height:30px}
.orbit-toolbar {min-height:48px;display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:8px 15px;border-bottom:1px solid var(--line);flex:none}
.orbit-toolbar>strong {font-size:14px;color:var(--accent);font-weight:600;margin-right:auto}
.orbit-toolbar nav {display:flex;gap:3px}
.orbit-toolbar nav button {font-size:13px;padding:5px 9px}
.orbit-toolbar button[aria-pressed=true] {background:var(--accent-soft);color:var(--accent)}
.orbit-toolbar .icon-button {height:30px;width:30px;padding:6px}
#return-reading {font-size:12px;padding:5px}
#conversation-picker {display:flex;gap:7px;padding:0;min-width:0;text-align:left;max-width:100%;font-size:16px;font-weight:600}
#conversation-picker>span:first-child {overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.reading-scope {padding:8px 24px;display:flex;align-items:center;gap:10px;flex-wrap:wrap;border-bottom:1px solid var(--line);font-size:12px;color:var(--muted);flex:none}
.reading-scope>span {max-width:100%;overflow-wrap:anywhere}
.reading-scope button {color:var(--accent);font-size:12px;padding:2px 5px}
html[data-reading-mode=research] #reader-shell {display:none}
html[data-reading-mode=off] #app {visibility:hidden;pointer-events:none}
html[data-reading-mode=companion] #app,html[data-reading-mode=sidebar] #app {position:fixed;right:0;z-index:10;display:grid;grid-template-columns:minmax(0,1fr)!important;width:min(450px,47vw);height:100dvh;background:var(--paper);border-left:1px solid var(--line);transition:width .18s ease}
html[data-reading-mode=companion] #app {right:24px;top:var(--companion-top,110px);width:min(420px,calc(100vw - 48px));height:min(560px,calc(100dvh - var(--companion-top,110px) - 16px));min-height:320px;border:1px solid var(--line);border-radius:14px;box-shadow:0 14px 50px #102b3824}
html[data-reading-mode=companion] .private-chat {border-radius:inherit;overflow:hidden}
html[data-reading-mode=sidebar] #reader-shell {right:min(450px,47vw)}
html[data-reading-mode=companion] .chat-header,html[data-reading-mode=sidebar] .chat-header {padding:10px 13px;min-height:70px;height:auto;gap:6px}
html:not([data-reading-mode=research]) .title-line h1 {font-size:14px}
html:not([data-reading-mode=research]) #conversation-picker {font-size:14px}
html:not([data-reading-mode=research]) .status-line {font-size:11px}
html:not([data-reading-mode=research]) .header-tools {gap:2px}
html:not([data-reading-mode=research]) #toggle-history {display:none}
html:not([data-reading-mode=research]) .history,html:not([data-reading-mode=research]) .drafts {position:fixed;top:74px;bottom:24px;right:16px;width:min(340px,calc(100vw - 32px));height:auto;max-height:calc(100dvh - 98px);z-index:45;border:1px solid var(--line);border-radius:12px;box-shadow:var(--shadow);visibility:visible}
html:not([data-reading-mode=research]) .history-closed .history,html:not([data-reading-mode=research]) .candidates-closed .drafts {visibility:hidden}
html:not([data-reading-mode=research]) .history .mobile-close {display:inline-flex}
html:not([data-reading-mode=research]) .scrim {position:fixed;inset:0;background:#10232c24;z-index:40;width:100vw;height:100dvh;border-radius:0;display:block}
html:not([data-reading-mode=research]) .history-closed.candidates-closed .scrim {display:none}
html:not([data-reading-mode=research]) .chat-scroll {padding-inline:16px}
html:not([data-reading-mode=research]) .private-form {padding:9px 12px 10px}
html:not([data-reading-mode=research]) .feedback {padding-inline:16px}
html:not([data-reading-mode=research]) .conversation {padding-top:15px}
html:not([data-reading-mode=research]) .empty-state {margin:22px 0}
html:not([data-reading-mode=research]) .empty-state h2 {font-size:22px}
html:not([data-reading-mode=research]) .empty-mark {display:none}
html:not([data-reading-mode=research]) .message-content {font-size:15px;line-height:1.8}
html:not([data-reading-mode=research]) .message.assistant>.message-avatar {position:static;margin-bottom:8px}
@media(max-width:760px) {
  html[data-reading-mode=sidebar] #app {width:100vw;border:0}
  html[data-reading-mode=sidebar] #reader-shell {right:0}
  html[data-reading-mode=companion] #app {right:8px;top:auto;bottom:8px;width:calc(100vw - 16px);height:min(72dvh,640px);min-height:280px}
  .orbit-toolbar {padding:7px 11px;gap:5px}
  .orbit-toolbar nav button {min-height:36px;padding:5px 8px}
  .reading-scope {padding:7px 13px;gap:6px}
  #reader-launch {right:16px;bottom:16px}
}
.candidate-actions {
  display:flex;flex-wrap:wrap;gap:6px 12px;align-items:center;margin-top:16px
}
.candidate-actions button {background:var(--paper-2);color:var(--accent)}
.candidate-actions a,.candidate-dialog .dialog-actions a {font-size:14px;color:var(--accent);text-decoration:none;padding:8px 0}
.candidate-dialog {
  width:min(800px,calc(100vw - 32px));max-width:800px;max-height:calc(100dvh - 32px);overflow:auto;padding:28px
}
.candidate-dialog header h2 {margin:0}
.candidate-dialog label {display:block;margin:18px 0 6px;font-size:14px;font-weight:600}
.candidate-dialog input:not([type=checkbox]),.candidate-dialog textarea,.candidate-dialog select {
  display:block;width:100%;max-width:100%;border:1px solid var(--line);border-radius:9px;background:var(--paper);color:var(--ink);padding:10px 12px;font:inherit;font-size:16px
}
.candidate-dialog select {white-space:normal}
.candidate-dialog textarea {resize:vertical;line-height:1.65}
.candidate-field-grid {display:grid;grid-template-columns:1fr 1fr;gap:16px;min-width:0}
.candidate-field-grid>div {min-width:0}
.candidate-preview {margin-top:12px;border:1px solid var(--line);border-radius:9px;padding:10px 14px}
.candidate-preview summary {cursor:pointer;font-size:14px;color:var(--muted)}
.candidate-preview .message-content {margin-top:16px;overflow-wrap:anywhere}
.candidate-dialog .candidate-confirm {display:flex;gap:10px;align-items:flex-start;font-weight:400}
.candidate-confirm input {width:18px;height:18px;padding:0;margin-top:4px;accent-color:var(--accent);flex:none}
.candidate-dialog .muted,.candidate-private-note {font-size:14px;line-height:1.65}
.candidate-private-note {margin-top:20px;padding:12px 14px;border-radius:9px;background:var(--paper-2);color:var(--muted)}
.candidate-dialog .dialog-actions {display:flex;gap:12px;flex-wrap:wrap;align-items:center}
.candidate-dialog .dialog-actions a {margin-right:auto}
.proposal-dialog {width:min(1040px,calc(100vw - 32px));max-width:1040px;max-height:calc(100dvh - 32px);overflow:auto;padding:28px}
.candidate-organization {padding:12px 14px;background:var(--paper-2);border-radius:9px;margin:14px 0;overflow-wrap:anywhere}
.sync-feedback {margin:0 8px 10px;color:var(--muted);font-size:12px;line-height:1.6;overflow-wrap:anywhere}
#refresh[aria-busy=true] svg {animation:knowledge-sync-spin 1s linear infinite;transform-origin:center}
@keyframes knowledge-sync-spin {to {transform:rotate(360deg)}}
.candidate-organization>p {margin:0;font-weight:600}.candidate-organization details {margin-top:8px}
.candidate-organization summary {cursor:pointer;color:var(--accent)}.candidate-organization textarea {width:100%;min-height:160px;font:inherit}
.proposal-dialog header h2 {margin:0}.proposal-dialog p {overflow-wrap:anywhere;line-height:1.7}
.proposal-tools {display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin:18px 0}
.proposal-tools select {font:inherit;background:var(--paper);color:var(--ink);border:1px solid var(--line);padding:8px;border-radius:8px}
.proposal-tools a {color:var(--accent);margin-left:auto}
#proposal-progress {display:flex;align-items:center;gap:12px;color:var(--accent);padding:14px 0}
#proposal-progress[hidden] {display:none}#proposal-progress .orbit-icon {width:36px;height:36px;flex:none}
.proposal-review,.proposal-limits {padding:14px 18px;background:var(--paper-2);border-radius:10px;margin:18px 0}
.proposal-addition {border-left:3px solid var(--accent);padding:6px 18px;margin:18px 0;overflow-wrap:anywhere}
.proposal-dialog details {margin:16px 0}.proposal-dialog summary {cursor:pointer;color:var(--accent)}
.proposal-diff {white-space:pre-wrap;overflow-wrap:anywhere;max-height:65dvh;overflow:auto;padding:14px;background:var(--paper-2);border:1px solid var(--line);border-radius:8px;font-size:13px;line-height:1.6}
#proposal-error {white-space:pre-wrap}.proposal-dialog .dialog-actions {display:flex;gap:12px;flex-wrap:wrap}
@media(max-width:600px) {
  .candidate-dialog {width:calc(100vw - 20px);max-height:calc(100dvh - 20px);padding:18px}
  .candidate-field-grid {grid-template-columns:1fr;gap:0}
  .proposal-dialog {width:calc(100vw - 20px);max-height:calc(100dvh - 20px);padding:18px}
}
@media(prefers-reduced-motion:reduce) {
  *,*::before,*::after {
    animation:none!important;
    transition:none!important;
    scroll-behavior:auto!important
  }
}

.publication-confirm {display:flex;gap:10px;align-items:flex-start;margin:18px 0;line-height:1.7}
.publication-confirm input {width:18px;height:18px;flex:0 0 18px;margin-top:5px;accent-color:var(--accent)}
.publication-disclosure {padding:14px 16px;border-left:3px solid var(--accent);background:var(--paper-2)}
.publication-status {font-weight:600}
`;
