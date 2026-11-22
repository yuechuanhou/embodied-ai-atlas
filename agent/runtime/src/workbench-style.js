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
.section-label {
  font-size:12px;
  color:var(--muted);
  margin:0 24px 8px;
  letter-spacing:.06em
}
.session-list {
  overflow-y:auto;
  padding:0 12px;
  flex:1;
  min-height:0
}
.session-item {
  display:block;
  width:100%;
  text-align:left;
  margin:0;
  padding:11px 12px;
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
.session-delete {
  color:var(--muted);
  opacity:0;
  width:34px;
  height:38px;
  padding:9px;
  margin-right:3px
}
.session-row:hover .session-delete,.session-row:focus-within .session-delete {
  opacity:1
}
.session-delete:hover:not(:disabled) {
  color:#b23b45
}
:root[data-theme=dark] .session-delete:hover:not(:disabled) {
  color:#f3a4ac
}
@media(hover:none) {
  .session-delete {opacity:1}
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
.session-item strong {
  font-size:14px;
  line-height:1.5;
  font-weight:450;
  white-space:nowrap;
  overflow:hidden;
  text-overflow:ellipsis;
  display:block
}
.session-item small {
  display:block;
  font-size:12px;
  color:var(--muted);
  margin-top:3px
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
  from {stroke-dashoffset:8}
  to {stroke-dashoffset:-92}
}
@keyframes orbit-tail-two {
  from {stroke-dashoffset:16}
  to {stroke-dashoffset:-84}
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
  .session-delete {opacity:1}
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
@media(prefers-reduced-motion:reduce) {
  *,*::before,*::after {
    animation:none!important;
    transition:none!important;
    scroll-behavior:auto!important
  }
}
`;
