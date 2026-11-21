/* Isolated Agent UI prototype; loaded only by `build.py --agent-demo`. */
(() => {
  'use strict';
  const data=JSON.parse(document.getElementById('atlas-data').textContent);
  if(!data.agent_preview)return;
  const engine=window.AtlasAgentDemo.create(data),state=engine.state;
  const app=document.getElementById('app');
  const pages=Object.fromEntries(data.pages.map(p=>[p.id,p]));
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const icon='<svg viewBox="0 0 64 64" class="brand-glyph" aria-hidden="true"><use href="#atlas-brand-mark"></use></svg>';
  const root=document.createElement('div');root.id='atlas-agent';
  root.innerHTML='<button id="agent-launch" class="agent-launch" aria-controls="agent-panel" aria-expanded="false">'+icon+'<span>Atlas Agent</span><small>交互预览</small></button>'+
    '<div id="agent-scrim" hidden></div><section id="agent-panel" class="agent-panel" aria-labelledby="agent-title" tabindex="-1" hidden>'+
    '<header class="agent-header"><div class="agent-identity">'+icon+'<div><h2 id="agent-title">Atlas Agent <span>预览</span></h2><p>学习 · 连接 · 沉淀</p></div></div>'+
    '<div class="agent-header-actions"><button id="agent-expand" class="agent-icon" aria-label="展开工作台" title="展开工作台">▣</button><button id="agent-close" class="agent-icon" aria-label="关闭 Agent">×</button></div></header>'+
    '<div class="agent-simulation">模拟交互 · 不调用模型，不写入 GitHub</div>'+
    '<div class="agent-columns"><div class="agent-chat" id="agent-chat"><div class="agent-context"><span id="agent-context-label"></span><button id="agent-selection" disabled>引用选中文本</button></div>'+
    '<div id="agent-messages" class="agent-messages" aria-label="对话记录"></div><div id="agent-pending"></div>'+
    '<div id="agent-status" class="agent-live" role="status" aria-live="polite"></div>'+
    '<form id="agent-form" class="agent-composer"><label for="agent-input" class="screen-reader-only">向 Atlas Agent 提问</label>'+
    '<div id="agent-attached" hidden></div><textarea id="agent-input" rows="3" maxlength="2000" placeholder="想了解什么，或遇到了什么问题？"></textarea>'+
    '<div class="agent-composer-bottom"><span>Enter 发送 · Shift + Enter 换行</span><button id="agent-send" type="submit">发送</button></div></form>'+
    '<footer class="agent-chat-footer"><span>本次会话仅在内存中保留</span><button id="agent-reset">清空演示</button></footer></div>'+
    '<aside id="agent-review" class="agent-review" aria-label="知识整理与变更审阅" hidden></aside></div></section>';
  document.body.appendChild(root);
  const panel=document.getElementById('agent-panel'),chat=document.getElementById('agent-chat');
  const messages=document.getElementById('agent-messages'),review=document.getElementById('agent-review');
  const input=document.getElementById('agent-input'),launcher=document.getElementById('agent-launch');
  let opened=false,expanded=false,reviewOnly=false,opener=null,selection='',attached='',overflow='';
  let lastMessages='',lastReview='',ownsModal=false;
  const narrow=()=>matchMedia('(max-width: 800px)').matches;
  const modal=()=>opened&&(expanded||narrow());
  function syncLayout(){
    panel.hidden=!opened;launcher.hidden=opened;launcher.setAttribute('aria-expanded',String(opened));
    panel.classList.toggle('agent-expanded',expanded);root.classList.toggle('agent-open',opened);
    panel.setAttribute('role',modal()?'dialog':'complementary');
    if(modal())panel.setAttribute('aria-modal','true');else panel.removeAttribute('aria-modal');
    if(modal()){app.setAttribute('inert','');document.body.style.overflow='hidden';}
    else if(ownsModal){app.removeAttribute('inert');document.body.style.overflow=overflow;}
    ownsModal=modal();document.getElementById('agent-scrim').hidden=!modal();
    chat.hidden=narrow()&&reviewOnly;review.hidden=!opened||(!expanded&&!reviewOnly)||(narrow()&&!reviewOnly);
    const expand=document.getElementById('agent-expand');
    expand.setAttribute('aria-label',expanded?'收起工作台':'展开工作台');expand.title=expand.getAttribute('aria-label');
  }
  function open(full=false){
    if(document.getElementById('search-overlay'))document.getElementById('close-search')?.click();
    if(document.getElementById('sidebar')?.classList.contains('open'))document.getElementById('nav-toggle')?.click();
    if(!opened){opener=document.activeElement===document.body?launcher:document.activeElement;overflow=document.body.style.overflow;}
    opened=true;expanded=full;reviewOnly=full&&narrow();syncLayout();render();
    (reviewOnly?review:input).focus();
  }
  function close(restore=true){
    opened=false;reviewOnly=false;syncLayout();
    if(restore)(opener?.isConnected?opener:launcher).focus();
  }
  const contextLabel=()=>state.context.type==='article'?'正在阅读 · '+(pages[state.context.id]?.title||'文章'):
    state.context.type==='home'?'当前视角 · System Overview':'当前视角 · '+state.context.type+' '+state.context.id;
  function lineDiff(file){
    const before=(data.agent_preview.source_files[file.path]||'').split('\n'),after=file.after_utf8.split('\n');
    let start=0,end=0;while(start<before.length&&start<after.length&&before[start]===after[start])start++;
    while(end<before.length-start&&end<after.length-start&&before[before.length-1-end]===after[after.length-1-end])end++;
    return (start?'<span class="diff-context">未改动的前 '+start+' 行</span>':'')+
      before.slice(start,before.length-end).map(line=>'<span class="diff-remove">− '+esc(line)+'</span>').join('')+
      after.slice(start,after.length-end).map(line=>'<span class="diff-add">+ '+esc(line)+'</span>').join('')+
      (end?'<span class="diff-context">未改动的后 '+end+' 行</span>':'');
  }
  function renderReview(){
    const proposal=state.proposal,job=state.job;
    if(!proposal)return '<div class="agent-review-head"><h3>知识整理</h3><button data-agent-back>返回对话</button></div><div class="agent-review-empty">'+icon+
      '<h3>新的理解，会在这里沉淀。</h3><p>有价值的新问题会自动形成候选。已有内容会回到唯一位置，不重复创建文章。</p><p>选择“新概念演示”，体验完整整理流程。</p></div>';
    const candidate=state.candidates.find(c=>'demo-proposal-'+c.id===proposal.proposal_id);
    const domain=candidate.article?pages[candidate.article].primary_domain:JSON.parse(data.agent_preview.source_files['content/manifest.json']).sections.find(s=>!s.auxiliary).id;
    const domainName=data.sections.find(s=>s.id===domain)?.name;
    const status=state.stale?'依据已变化':job?.status==='succeeded'?'演示已完成':job?.status==='retryable'?'检查待恢复':'等待审阅';
    return '<div class="agent-review-head"><div><span class="agent-kicker">PRIVATE DRAFT · v'+proposal.proposal_version+'</span><h3>待确认的整理</h3></div><button data-agent-back>返回对话</button></div>'+
      '<div class="agent-review-body"><p class="agent-review-question">'+esc(candidate.question)+'</p><span class="agent-badge">'+status+'</span>'+
      '<dl class="agent-placement"><div><dt>处理方式</dt><dd>'+(candidate.article?'补充现有文章章节':'新增独立文章（模拟）')+'</dd></div><div><dt>归档</dt><dd>'+esc(domainName)+'</dd></div>'+
      (candidate.article?'<div><dt>唯一位置</dt><dd>'+esc(pages[candidate.article].title)+'</dd></div>':'')+'</dl>'+
      '<h4>正文与元数据差异</h4><p class="agent-muted">以下为准确的拟变更内容；只保存在演示会话中。</p>'+
      proposal.file_changes.map((file,i)=>'<details class="agent-file"'+(i===0?' open':'')+'><summary>'+esc(file.path)+'</summary><pre class="agent-diff">'+lineDiff(file)+'</pre><details class="agent-full-file"><summary>查看完整拟写入内容</summary><pre>'+esc(file.after_utf8)+'</pre></details></details>').join('')+
      '<details class="agent-sources"><summary>归属依据与来源</summary><p>'+esc(proposal.intents[0].reason)+'</p><p>一个 Primary Domain，保留唯一正文。视图只引用，不复制知识。</p><p>'+esc(proposal.evidence[0].reference)+'</p></details>'+
      '<details class="agent-technical"><summary>预览范围与版本</summary><p>当前构建 '+data.pages.length+' 篇文章 · '+data.topics.length+' 个知识实体。模拟适配器不访问线上仓库。</p><code>proposal '+proposal.proposal_version+' · '+proposal.patch_digest.slice(0,12)+'</code><p>真实流程需要 Owner 认证、来源核实和服务端校验。</p>'+
      '<button id="agent-conflict">模拟版本冲突</button><button id="agent-failure">下次模拟检查失败</button></details>'+
      (state.stale?'<p class="agent-notice">模拟基线已更新，旧确认已失效。重新整理后请审阅新版本。</p>':'')+
      (state.error?'<p class="agent-notice" role="alert">'+esc(state.error)+'</p>':'')+
      (job?'<div class="agent-job" role="status"><b>'+esc(job.status==='succeeded'?'模拟完成：PR 创建阶段':'模拟任务：'+job.status)+'</b><p>校验与后续操作均为演示，没有创建真实 PR。</p><code>'+esc(job.id)+'</code></div>':'')+'</div>'+
      '<div class="agent-review-footer"><small>确认只推进本次模拟，不授权真实发布。</small>'+
      (state.stale?'<button id="agent-revalidate" class="agent-primary"'+(state.busy?' disabled':'')+'>重新整理演示草稿</button>':
        job?.status==='retryable'?'<button id="agent-retry" class="agent-primary">重试同一演示任务</button>':
        '<button id="agent-confirm" class="agent-primary"'+(state.busy||job?' disabled':'')+'>'+(job?.status==='succeeded'?'已完成演示':'确认演示变更')+'</button>')+'</div>';
  }
  function render(){
    document.getElementById('agent-context-label').textContent=contextLabel();
    document.getElementById('agent-context-label').title=contextLabel();
    const nextMessages=JSON.stringify(state.messages);
    if(nextMessages!==lastMessages||!messages.innerHTML){
      lastMessages=nextMessages;
      messages.innerHTML=state.messages.length?state.messages.map((message,i)=>'<section class="agent-message agent-'+message.role+'"><div class="agent-message-label">'+(message.role==='user'?'你':'Atlas · 交互演示')+'</div><p>'+esc(message.body)+'</p>'+
        (message.selection?'<blockquote>引用：'+esc(message.selection)+'</blockquote>':'')+
        (message.citations||[]).map((citation,j)=>'<button class="agent-citation" data-agent-citation="'+i+':'+j+'"><small>站内依据 · '+esc(citation.anchor?'章节':'文章')+'</small><strong>'+esc(citation.title)+'</strong><span>'+esc(citation.excerpt)+'</span></button>').join('')+'</section>').join(''):
        '<div class="agent-welcome"><span class="agent-kicker">YOUR KNOWLEDGE COMPANION</span><h3>今天想弄清什么？</h3><p>从一个概念，或一个实际问题开始。先连接已有知识，再沉淀新的理解。</p><div class="agent-starters"><button data-agent-prompt="VIO 如何结合 IMU？">理解 VIO 与 IMU</button><button data-agent-prompt="时间同步与系统集成">从工程问题找线索</button><button data-agent-prompt="演示一个站内尚未收录的概念">新概念演示</button></div><div class="agent-welcome-note">此处检索真实站内内容；新知识整理使用明确标记的模拟资料。</div></div>';
      messages.scrollTop=messages.scrollHeight;
    }
    const nextReview=renderReview();
    if(nextReview!==lastReview){
      const hadFocus=review.contains(document.activeElement);
      lastReview=nextReview;review.innerHTML=nextReview;review.tabIndex=-1;
      if(hadFocus)review.focus();
    }
    document.getElementById('agent-pending').innerHTML=state.proposal?'<button id="agent-review-open" class="agent-pending"><span><b>'+state.candidates.length+' 个知识候选</b><small>已自动整理 · 私人草稿</small></span><span>审阅变更</span></button>':'';
    const live=document.getElementById('agent-status');
    live.textContent=state.busy?'正在检索与整理…':state.error||'';
    document.getElementById('agent-send').disabled=state.busy;
    document.getElementById('agent-selection').disabled=!selection;
    syncLayout();
  }
  function attach(){
    if(!selection)return;attached=selection;
    const element=document.getElementById('agent-attached');element.hidden=false;
    element.textContent='已引用：'+attached.slice(0,90);input.focus();
  }
  async function submit(value){
    if(state.busy||!value.trim())return;
    const quote=attached;attached='';document.getElementById('agent-attached').hidden=true;
    input.value='';await engine.ask(value,quote);input.focus();
  }
  root.addEventListener('click',event=>{
    const target=event.target.closest('button');
    if(event.target.id==='agent-scrim'){close();return;}
    if(!target)return;
    if(target.id==='agent-launch')open();
    if(target.id==='agent-close')close();
    if(target.id==='agent-expand'){
      if(expanded){expanded=false;reviewOnly=false;syncLayout();input.focus();}
      else open(true);
    }
    if(target.id==='agent-review-open')open(true);
    if(target.hasAttribute('data-agent-back')){reviewOnly=false;if(!narrow())expanded=false;syncLayout();input.focus();}
    if(target.dataset.agentPrompt)submit(target.dataset.agentPrompt);
    if(target.dataset.agentCitation){
      const [i,j]=target.dataset.agentCitation.split(':').map(Number),action=state.messages[i].citations[j].action;
      if(narrow()||expanded)close(false);
      document.dispatchEvent(new CustomEvent('atlas:agent-navigate',{detail:action}));
    }
    if(target.id==='agent-selection')attach();
    if(target.id==='agent-confirm')engine.confirm();
    if(target.id==='agent-conflict')engine.simulateConflict();
    if(target.id==='agent-revalidate')engine.revalidate();
    if(target.id==='agent-failure'){engine.simulateFailure();document.getElementById('agent-status').textContent='已安排一次模拟检查失败。';}
    if(target.id==='agent-retry')engine.retry();
    if(target.id==='agent-reset'){engine.reset();attached='';document.getElementById('agent-attached').hidden=true;render();input.focus();}
  });
  document.getElementById('agent-form').addEventListener('submit',event=>{event.preventDefault();submit(input.value);});
  input.addEventListener('keydown',event=>{
    if(event.key==='Enter'&&!event.shiftKey&&!event.isComposing){event.preventDefault();submit(input.value);}
  });
  document.addEventListener('keydown',event=>{
    if(!opened)return;
    if(event.key==='Escape'&&(modal()||root.contains(event.target))){event.preventDefault();event.stopImmediatePropagation();close();return;}
    if(modal()&&event.key==='Tab'){
      const items=[...panel.querySelectorAll('button,textarea,[tabindex="0"],summary')].filter(el=>{
        const closed=el.closest('details:not([open])');
        return !el.disabled&&!el.closest('[hidden]')&&(!closed||el===closed.querySelector('summary'));
      });
      const index=items.indexOf(document.activeElement);
      if(event.shiftKey&&index<=0){event.preventDefault();items.at(-1)?.focus();}
      else if(!event.shiftKey&&(index===items.length-1||index<0)){event.preventDefault();items[0]?.focus();}
    }
    if((modal()||root.contains(event.target))&&(event.key==='/'||(event.key.toLowerCase()==='k'&&(event.metaKey||event.ctrlKey)))){
      event.preventDefault();event.stopImmediatePropagation();
    }
  },true);
  document.addEventListener('selectionchange',()=>{
    const selected=window.getSelection();
    if(selected?.anchorNode?.parentElement?.closest('#app .content-body'))selection=selected.toString().trim().slice(0,1000);
    document.getElementById('agent-selection').disabled=!selection;
  });
  document.addEventListener('atlas:reading-context',event=>{selection='';engine.setContext(event.detail);});
  document.addEventListener('atlas:other-dialog',()=>{if(opened)close(false);});
  window.addEventListener('resize',syncLayout);
  engine.subscribe(render);render();document.dispatchEvent(new CustomEvent('atlas:context-request'));
  // Exposed only in the isolated demo for deterministic integration tests.
  window.atlasAgentPreview=engine;
})();
