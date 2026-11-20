(() => {
  'use strict';
  const DATA = JSON.parse(document.getElementById('atlas-data').textContent);
  const PAGES = DATA.pages, ARCH = DATA.architecture;
  const byId = Object.fromEntries(PAGES.map(p => [p.id, p]));
  const sections = Object.fromEntries(DATA.sections.map(s => [s.id, s]));
  const stageById = Object.fromEntries(ARCH.lifecycle.map(s => [s.id, s]));
  const loopById = Object.fromEntries(ARCH.loops.map(l => [l.id, l]));
  const contextById = Object.fromEntries(ARCH.contexts.map(c => [c.id, c]));
  const topicById = Object.fromEntries(DATA.topics.map(t => [t.id, t]));
  const app = document.getElementById('app');
  let sidebarOpen = false, searchOpen = false, searchResults = [], searchSelected = 0;
  const groupState = new Map(), positions = new Map();
  let searchOpener = null;
  const narrowScreen = () => typeof matchMedia === 'function' && matchMedia('(max-width: 800px)').matches;
  const readPreference = (key,fallback) => {try{return localStorage.getItem(key) ?? fallback;}catch(_){return fallback;}};
  let sidebarCollapsed = readPreference('atlasSidebarCollapsed','false') === 'true';
  const glyph = {
    search:'⌕',menu:'☰',theme:'◐',loop:'↻',arrow:'↗',left:'←',right:'→',swap:'↔'
  };
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const eattr = esc;
  const linkView = (view,id) => '?view=' + encodeURIComponent(view) + '&id=' + encodeURIComponent(id);
  const linkArticle = (id,context,anchor) =>
    '?page=' + encodeURIComponent(id) + (context ? '&context=' + encodeURIComponent(context) : '') +
    (anchor ? '#' + encodeURIComponent(anchor) : '');
  const getTheme = () => { try { return localStorage.getItem('atlasTheme') || 'light'; } catch (_) { return 'light'; } };
  let activeTheme=getTheme();
  const setTheme = t => { activeTheme=t;document.documentElement.setAttribute('data-theme',t); try {localStorage.setItem('atlasTheme',t);}catch (_){} };
  setTheme(activeTheme);

  function route() {
    const params = new URLSearchParams(location.search);
    const page = params.get('page');
    if (page && byId[page]) {
      const ctx = params.get('context') || '';
      const parts = ctx.split(':');
      const known = parts.length === 2 && (
        parts[0] === 'stage' && stageById[parts[1]] ||
        parts[0] === 'loop' && loopById[parts[1]] ||
        parts[0] === 'context' && contextById[parts[1]]);
      return {type:'article',id:page,context:known ? ctx : ''};
    }
    const view = params.get('view'), id = params.get('id');
    if (view === 'stage' && stageById[id]) return {type:'stage',id};
    if (view === 'loop' && loopById[id]) return {type:'loop',id};
    if (view === 'domain' && sections[id]) return {type:'domain',id};
    if (view === 'context' && contextById[id]) return {type:'context',id};
    return {type:'home'};
  }
  const unique = ids => [...new Set(ids)].filter(id => byId[id]);
  const stageArticleIds = stage => unique(stage.topics.flatMap(t => t.articles));
  const articlesForStage = id => stageArticleIds(stageById[id]);
  const articleInContext = (id, ctx) => {
    if (!ctx) return false;
    const [kind,v] = ctx.split(':');
    if (kind === 'stage' && stageById[v]) return articlesForStage(v).includes(id);
    if (kind === 'loop' && loopById[v]) return loopById[v].steps.some(step => step.articles.includes(id));
    if (kind === 'context' && contextById[v]) return contextById[v].articles.includes(id);
    return false;
  };
  const navContext = r => r.type === 'stage' || r.type === 'loop' || r.type === 'context' ? r.type + ':' + r.id : '';
  const articleLink = (p,ctx,anchor) => linkArticle(p.id,ctx && articleInContext(p.id,ctx) ? ctx : '',anchor);
  const viewLabel = ctx => {
    const [kind,id] = ctx.split(':');
    return kind === 'stage' && stageById[id] ? 'Lifecycle ' + id + ' · ' + stageById[id].title
      : kind === 'loop' && loopById[id] ? loopById[id].title
      : kind === 'context' && contextById[id] ? contextById[id].title : '';
  };
  const viewHref = ctx => {const [type,id] = ctx.split(':');return linkView(type,id);};
  const card = (title,body,url,extra='') =>
    '<a class="atlas-card" href="' + eattr(url) + '"><span class="atlas-card-title">' + esc(title) +
    '</span><span class="atlas-card-body">' + esc(body || '') +
    '</span>' + (extra ? '<small>' + esc(extra) + '</small>' : '') + '</a>';
  const articleCards = (ids,ctx='',empty='此主题目前没有单独收录的文章；以后可随学习自然扩展。') => {
    const pages=unique(ids).map(id => byId[id]);
    if (!pages.length) return '<p class="empty-hint">' + esc(empty) + '</p>';
    return '<div class="atlas-card-grid">' + pages.map(p => card(p.title,p.summary,articleLink(p,ctx),sections[p.primary_domain].name)).join('') + '</div>';
  };
  const knowledgeEntries=(entries,ctx='')=>{
    if(!entries?.length)return '<p class="empty-hint">保留主题位置 · 尚未收录专文</p>';
    return '<ul class="knowledge-rows">'+entries.map(entry=>{
      const p=byId[entry.article];
      return '<li><a href="'+eattr(articleLink(p,ctx,entry.anchor))+'">'+esc(entry.title)+'</a><p>'+esc(entry.reason||p.summary)+
        '</p><small>'+esc(sections[p.primary_domain].name)+(entry.anchor?' · Topic':'')+'</small></li>';
    }).join('')+'</ul>';
  };
  const heading = (k,title,subtitle) =>
    '<div class="section-heading"><div><div class="section-kicker">' + esc(k) +
    '</div><h2>' + esc(title) + '</h2>' + (subtitle ? '<p>' + esc(subtitle) + '</p>' : '') + '</div></div>';
  const blocks = items => '<div class="atlas-card-grid">' + items.join('') + '</div>';
  const stat = (n,label) => '<span><b>' + esc(n) + '</b> ' + esc(label) + '</span>';

  function sidebar(r) {
    const origin = r.type === 'article' ? r.context : navContext(r);
    const domain = r.type === 'article' ? byId[r.id].primary_domain : r.type === 'domain' ? r.id : '';
    const grouped = [
      ['System Overview', ARCH.lifecycle.map(s => [s.id + '  ' + s.title,linkView('stage',s.id)]),r.type === 'home' || origin.startsWith('stage:')],
      ['Core Loops', ARCH.loops.map(l => [l.title,linkView('loop',l.id)]),origin.startsWith('loop:')],
      ['Knowledge Domains', DATA.sections.filter(s => !s.auxiliary).map(s => [s.name,linkView('domain',s.id)]),!!domain],
      ['Explore by Context', ARCH.contexts.map(c => [c.title,linkView('context',c.id)]),origin.startsWith('context:')],
      ['Research & Reference',[
        ['Industry & Research',linkView('domain','industry')],
        ['Glossary',linkArticle('glossary')],
        ['Papers & Sources',linkArticle('reading-list')],
        ['Atlas Architecture','https://github.com/yuechuanhou/embodied-ai-atlas/blob/main/ARCHITECTURE.md']
      ],false]
    ];
    return '<aside class="sidebar" id="sidebar" aria-label="Knowledge navigation">' +
      '<button class="icon-btn sidebar-close" data-nav-toggle aria-label="Close navigation">×</button>' +
      '<a class="brand" href="?page=home"><span class="brand-glyph"><span class="brand-dot"></span></span><span><span class="brand-title">Embodied AI Atlas</span><span class="brand-sub">SYSTEM · LEARNING · ENGINEERING</span></span></a>' +
      '<a class="nav-home'+(r.type==='home'?' active':'')+'" href="?page=home"'+(r.type==='home'?' aria-current="page"':'')+'>System Map / Home</a><div class="nav-divider"></div>' +
      '<div class="v02-nav">' + grouped.map(([name,links,opened]) =>
        '<details class="nav-group" data-group="'+eattr(name)+'"' + ((groupState.get(name) ?? opened) ? ' open' : '') + '><summary>' + esc(name) + '</summary>' +
        links.map(([label,url]) => {
          const current = url === (r.type==='article' ? linkView('domain',domain) : linkView(r.type,r.id));
          const source = origin && url === viewHref(origin);
          return '<a href="' + eattr(url) + '" class="nav-link'+(current?' active':'')+(source?' nav-source':'')+'"'+
            (current?' aria-current="'+(r.type==='article'?'location':'page')+'"':'')+'>'+esc(label)+(source&&r.type==='article'?'<small>Reading from</small>':'')+'</a>';
        }).join('') +
        '</details>').join('') + '</div>' +
      '<div class="sidebar-foot"><b>One knowledge core. Many views.</b>v' + esc(DATA.site.version) + ' · ' + esc(DATA.site.asOf) + '</div></aside>' +
      '<div id="sidebar-scrim" class="sidebar-scrim' + (sidebarOpen ? ' open' : '') + '"></div>';
  }
  function topbar(r) {
    let title = r.type === 'home' ? 'System Overview'
      : r.type === 'article' ? byId[r.id].title
      : r.type === 'stage' ? stageById[r.id].title
      : r.type === 'loop' ? loopById[r.id].title
      : r.type === 'context' ? contextById[r.id].title
      : sections[r.id].name;
    const domain = r.type === 'article' ? sections[byId[r.id].primary_domain] : null;
    return '<header class="topbar"><div class="topbar-left">' +
      '<button class="icon-btn" id="nav-toggle" data-nav-toggle aria-controls="sidebar" aria-expanded="false" aria-label="Show navigation">☰</button>' +
      '<nav class="breadcrumbs" aria-label="Breadcrumb"><a href="?page=home">Atlas</a><span>/</span>'+
      (domain?'<a class="breadcrumb-domain" href="'+eattr(linkView('domain',domain.id))+'">'+esc(domain.name)+'</a><span>/</span>':'')+
      '<strong aria-current="page">' + esc(title) + '</strong></nav></div>' +
      '<div class="top-actions"><button class="search-trigger" id="open-search" aria-label="Search knowledge">' + glyph.search +
      '<span>Search knowledge</span><kbd>/</kbd></button><button class="icon-btn" id="theme-button" aria-label="Toggle theme">' +
      glyph.theme + '</button></div></header>';
  }

  function syncNavigation(focusDrawer=false) {
    const sidebar=document.getElementById('sidebar'),button=document.getElementById('nav-toggle');
    if(!sidebar||!button)return;
    const narrow=narrowScreen(),visible=narrow?sidebarOpen:!sidebarCollapsed;
    sidebar.hidden=!visible;
    sidebar.toggleAttribute('inert',!visible);
    sidebar.classList.toggle('open',narrow&&visible);
    app.querySelector('.app-shell').classList.toggle('sidebar-collapsed',!narrow&&sidebarCollapsed);
    document.getElementById('sidebar-scrim').classList.toggle('open',narrow&&visible);
    button.setAttribute('aria-expanded',String(visible));
    button.setAttribute('aria-label',visible?'Hide navigation':'Show navigation');
    document.body.style.overflow=(searchOpen||(narrow&&visible))?'hidden':'';
    document.querySelector('.workspace')?.toggleAttribute('inert',narrow&&visible);
    requestAnimationFrame(drawLifecycleEdges);
    if(focusDrawer&&narrow&&visible)sidebar.querySelector('button')?.focus();
  }
  function closeNavigation() {
    sidebarOpen=false;syncNavigation();document.getElementById('nav-toggle')?.focus();
  }
  function trapFocus(event,container) {
    if(event.key!=='Tab')return;
    const items=[...container.querySelectorAll('a[href],button,input,summary,[tabindex="0"]')].filter(x=>{
      const closed=x.closest('details:not([open])');
      return !x.disabled&&!x.closest('[inert],[hidden]')&&(!closed||x===closed.querySelector('summary'));
    });
    if(!items.length)return;
    const index=items.indexOf(document.activeElement);
    if(event.shiftKey&&(index<=0)){event.preventDefault();items.at(-1).focus();}
    else if(!event.shiftKey&&(index===items.length-1||index<0)){event.preventDefault();items[0].focus();}
  }

  function lifecycleDiagram() {
    const node=id=>{
      const s=stageById[id];
      return '<a class="life-node" data-stage="'+id+'" href="'+eattr(linkView('stage',id))+'"><span class="life-num">'+id+
        '</span><div><strong>'+esc(s.title)+'</strong><small>'+esc(s.question)+'</small></div></a>';
    };
    return '<div class="lifecycle-map" role="group" aria-label="Embodied Intelligence Lifecycle" aria-describedby="lifecycle-description">'+
      '<div class="crosscut-band"><span>贯穿全程</span><b>Systems Engineering</b><b>Verification &amp; Validation</b></div>'+
      '<div class="lifecycle-network" id="lifecycle-network"><svg class="lifecycle-edges" aria-hidden="true" focusable="false"></svg>'+
      '<div class="lifecycle-nodes">'+node('01')+node('02')+'<div class="life-pair">'+node('03')+node('04')+'</div>'+node('05')+node('06')+'</div></div>'+
      '<div class="map-legend"><span><i class="legend-line"></i>系统关系</span><span><i class="legend-line coupling"></i>执行 ↔ 学习</span><span><i class="legend-line feedback"></i>06 反馈至 01–05</span></div>'+
      '<p id="lifecycle-description" class="atlas-note">01 → 02 → {03 ↔ 04} → 05 → 06。反馈可修订需求、本体、执行、学习和集成；这些关系不规定开发顺序。</p></div>';
  }
  function drawLifecycleEdges(){
    const network=document.getElementById('lifecycle-network');if(!network)return;
    const svg=network.querySelector('svg'),box=network.getBoundingClientRect();if(!box.width)return;
    const pos={};
    for(const el of network.querySelectorAll('[data-stage]')){
      const b=el.getBoundingClientRect();pos[el.dataset.stage]={x:b.x-box.x,y:b.y-box.y,w:b.width,h:b.height};
    }
    if(Object.keys(pos).length!==6)return;
    const top=id=>[pos[id].x+pos[id].w/2,pos[id].y-3];
    const bottom=id=>[pos[id].x+pos[id].w/2,pos[id].y+pos[id].h+3];
    const path=(d,kind='system',both=false)=>'<path class="edge '+kind+'" d="'+d+'" marker-end="url(#arrow-'+kind+')"'+(both?' marker-start="url(#arrow-'+kind+')"':'')+'/>';
    let paths='';
    for(const [from,to] of [['01','02'],['02','03'],['02','04'],['03','05'],['04','05'],['05','06']]){
      const a=bottom(from),b=top(to),mid=(a[1]+b[1])/2;
      paths+=path('M '+a.join(' ')+' V '+mid+' H '+b[0]+' V '+b[1]);
    }
    const a=pos['03'],b=pos['04'];
    if(Math.abs(a.y-b.y)<20)paths+=path('M '+(a.x+a.w+6)+' '+(a.y+a.h/2)+' H '+(b.x-6),'coupling',true);
    else paths+=path('M '+(a.x+a.w/2)+' '+(a.y+a.h+6)+' V '+(b.y-6),'coupling',true);
    const last=bottom('06'),floor=box.height-4,left=8,right=box.width-8;
    paths+=path('M '+last.join(' ')+' V '+floor+' H '+left+' V '+(pos['01'].y+pos['01'].h/2)+' H '+(pos['01'].x-5),'feedback');
    for(const id of ['02','03','05']){
      const p=pos[id],y=p.y+p.h/2;
      paths+=path('M '+left+' '+y+' H '+(p.x-5),'feedback');
    }
    paths+=path('M '+last.join(' ')+' V '+floor+' H '+right+' V '+(b.y+b.h/2)+' H '+(b.x+b.w+5),'feedback');
    svg.setAttribute('viewBox','0 0 '+box.width+' '+box.height);
    svg.innerHTML='<defs>'+['system','coupling','feedback'].map(kind=>'<marker id="arrow-'+kind+'" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto-start-reverse"><path d="M0 0 L6 3 L0 6 Z" class="arrow-'+kind+'"/></marker>').join('')+'</defs>'+paths;
  }
  function home() {
    const domains=DATA.sections.filter(s=>!s.auxiliary);
    return '<main class="page-container atlas-home">'+
      '<section class="home-hero"><div><div class="eyebrow">A LIVING ROBOTICS KNOWLEDGE ATLAS</div>'+
      '<h1>Embodied AI, <em>connected.</em></h1><p class="home-description">理解完整系统，探索核心机制，连接技术知识。</p></div>'+
      '<div class="hero-actions"><a class="btn-primary" href="#lifecycle">探索系统地图</a><a class="btn-secondary" href="#domains">浏览知识领域</a></div></section>'+
      '<section id="lifecycle">'+heading('SYSTEM OVERVIEW','The Embodied Intelligence Lifecycle','六阶段系统地图 · 执行与学习耦合 · 真实反馈驱动改进')+lifecycleDiagram()+'</section>'+
      '<section>'+heading('CORE MECHANISMS','Explore Core Loops','从三个反馈机制理解机器人怎样执行、学习和持续改进。')+
      '<div class="loop-card-grid">'+ARCH.loops.map(l=>card(l.title,l.question,linkView('loop',l.id),l.steps.map(step=>step.title).join(' · '))).join('')+'</div></section>'+
      '<section id="domains">'+heading('KNOWLEDGE DOMAINS','Knowledge Domains','按技术机制归档，也可以从系统和应用视角探索。')+
      '<div class="domain-grid">'+domains.map(s=>'<a class="domain-card" href="'+eattr(linkView('domain',s.id))+'"><span class="domain-num">'+esc(s.eyebrow)+
        '</span><h3>'+esc(s.name)+'</h3><p>'+PAGES.filter(p=>p.primary_domain===s.id).length+' 篇文章</p></a>').join('')+'</div></section>'+
      '<section>'+heading('PRACTICE & APPLICATION','Explore by Context','围绕实际关注的问题连接不同领域。')+
      blocks(ARCH.contexts.map(c=>card(c.title,c.description,linkView('context',c.id))))+'</section>'+
      '<section class="reference-strip"><div><span class="section-kicker">RESEARCH & REFERENCE</span><p>'+PAGES.length+' 篇文章 · '+DATA.topics.length+' 个知识点</p></div>'+
      '<nav aria-label="Research and reference"><a href="'+linkView('domain','industry')+'">Industry & Research</a><a href="'+linkArticle('glossary')+'">Glossary</a><a href="'+linkArticle('reading-list')+'">Papers & Sources</a></nav></section>'+
      '<div class="footer-home">Embodied AI Atlas · A growing map of systems, mechanisms and knowledge</div></main>';
  }

  const pageShell = (label,title,summary,body) =>
    '<main class="page-container atlas-index-page"><div class="view-header"><div class="article-category">' +
    esc(label) + '</div><h1>' + esc(title) + '</h1><p>' + esc(summary) +
    '</p></div>' + body + '</main>';
  function stagePage(id) {
    const s=stageById[id],ctx='stage:'+id;
    let body = '<section>' + heading('SYSTEM ROLE','Five Second-Level Topics',
      '从主题进入相关知识；尚未收录的部分保留概念位置。') +
      '<div class="stage-topics">' + s.topics.map(t =>
        '<div class="stage-topic"><div class="stage-topic-title"><span>' + esc(t.id) + '</span><h3>' +
        esc(t.title) + '</h3></div>' + knowledgeEntries(t.entries,ctx) + '</div>').join('') +
      '</div></section><section>' + heading('CROSS-SYSTEM CONNECTIONS','How this stage connects') +
      blocks(s.connections.map(c => card(stageById[c.to].title,c.label,linkView('stage',c.to),'Stage '+c.to))) +
      '</section><section>' + heading('ASSOCIATED LOOPS','Participating mechanisms') +
      blocks(s.loops.map(l => card(loopById[l].title,loopById[l].question,linkView('loop',l)))) + '</section>';
    if(id==='06')body += '<p class="atlas-note">Evaluation 的反馈不只是返回 Data Collection：它还可能改变需求、硬件、控制器和 Runtime。</p>';
    return pageShell('LIFECYCLE / STAGE '+id,s.title,s.question,body);
  }
  function loopPage(id) {
    const l=loopById[id],ctx='loop:'+id;
    let body='<section>' + heading('MECHANISM','Process & Feedback','从任一步骤进入相关知识，再沿反馈关系理解完整机制。') +
      '<nav class="loop-overview" aria-label="Loop mechanism">'+l.steps.map((step,i)=>'<a href="#loop-step-'+esc(step.id)+'"><small>'+String(i+1).padStart(2,'0')+'</small>'+esc(step.title)+'</a>').join('')+'<span class="loop-overview-feedback">↺ '+esc(l.feedback)+'</span></nav><div class="loop-steps">' + l.steps.map((s,i) =>
        '<div class="loop-step" id="loop-step-'+eattr(s.id)+'"><div class="loop-step-title"><span>' + String(i+1).padStart(2,'0') +
        '</span><div><h3>' + esc(s.title) + '</h3><p>' + esc(s.detail) + '</p></div></div>' +
        knowledgeEntries(s.entries,ctx) + '</div>').join('') + '</div>' +
      '<div class="loop-return">↺ &nbsp; ' + esc(l.feedback) + '</div></section>' +
      '<section>' + heading('SYSTEM PARTICIPATION','Related Lifecycle Stages') +
      blocks(l.stages.map(sid => card('Stage '+sid+' · '+stageById[sid].title,stageById[sid].question,linkView('stage',sid)))) +
      '</section><section>' + heading('INTERACTIONS','Cross-Loop Connections') +
      blocks(l.interactions.map(c => card(loopById[c.to].title,c.label,linkView('loop',c.to)))) + '</section>';
    return pageShell('CORE LOOP / '+id.toUpperCase(),l.title,l.question,body);
  }
  function domainPage(id) {
    const s=sections[id],articles=PAGES.filter(p=>p.primary_domain===id);
    let body='<section>' + heading('CANONICAL ARTICLES','Knowledge in this domain',
      '浏览本领域已经收录的文章与技术主题。') +
      articleCards(articles.map(p=>p.id)) + '</section>';
    const subtopics=DATA.topics.filter(t=>t.kind==='section' && t.primary_domain===id);
    if(subtopics.length) body += '<section>' + heading('SECTION-LEVEL TOPICS','Concepts within existing articles',
      '直接进入文章中对应的技术章节。') +
      blocks(subtopics.map(t => card(t.title,'Canonical section in '+byId[t.article].title,
        linkArticle(t.article,'',t.anchor),'Topic: '+t.id))) + '</section>';
    return pageShell('KNOWLEDGE DOMAIN / '+s.eyebrow,s.name,
      articles.length+' 篇文章 · 按技术机制组织的领域目录',body);
  }
  function contextPage(id) {
    const c=contextById[id];
    const body='<section>'+heading('CROSS-DOMAIN ENTRIES','Relevant Knowledge',
      '选择与你当前问题相关的知识入口。') +
      articleCards(c.articles,'context:'+id)+'</section>';
    return pageShell('PROFESSIONAL CONTEXT',c.title,c.description,body);
  }

  const relationLabels = {
    depends_on:['Depends on','Foundation for'],
    part_of:['Part of','Contains'],
    enables:['Enables','Enabled by'],
    compares_with:['Compare with','Compare with'],
    illustrated_by:['Illustrated by','Illustrates'],
    related:['Related','Related']
  };
  function connectionsForArticle(articleId) {
    const ids=new Set(DATA.topics.filter(t=>t.article===articleId).map(t=>t.id));
    const links=[];
    for(const r of DATA.relations) {
      const source=topicById[r.from], target=topicById[r.to];
      if(!source||!target) continue;
      if(ids.has(r.from))
        links.push({source,topic:target,label:relationLabels[r.type]?.[0] || r.type});
      else if(ids.has(r.to))
        links.push({source:target,topic:source,label:relationLabels[r.type]?.[1] || r.type});
    }
    const seen=new Set();
    return links.filter(x=>{const key=x.source.id+'::'+x.topic.id+'::'+x.label;if(seen.has(key))return false;seen.add(key);return true;});
  }
  function focusForArticle(articleId,ctx) {
    if(!articleInContext(articleId,ctx))return null;
    let anchor='';try{anchor=decodeURIComponent(location.hash.slice(1));}catch(_){}
    const section=byId[articleId].toc.find(t=>t.id===anchor);
    if(section)return {view:ctx,reason:'当前阅读章节：'+section.title,anchor};
    const explicit=DATA.focus.find(f=>f.article===articleId && f.view===ctx);
    if(explicit)return explicit;
    return {view:ctx,reason:'这篇文章与当前视角相关。可以阅读完整原文，并探索相邻系统环节。',anchor:null};
  }
  function articlePage(id,ctx) {
    const p=byId[id],s=sections[p.primary_domain],focus=focusForArticle(id,ctx);
    const conn=connectionsForArticle(id);
    const matches=[
      ...ARCH.lifecycle.filter(stage=>stageArticleIds(stage).includes(id)).map(stage=>({name:'Stage '+stage.id+' · '+stage.title,url:linkView('stage',stage.id)})),
      ...ARCH.loops.filter(loop=>loop.steps.some(step=>step.articles.includes(id))).map(loop=>({name:loop.title,url:linkView('loop',loop.id)})),
      ...ARCH.contexts.filter(c=>c.articles.includes(id)).map(c=>({name:c.title,url:linkView('context',c.id)}))
    ];
    const returnLink=ctx?'<a data-return-source href="'+eattr(viewHref(ctx))+'">Return to '+esc(viewLabel(ctx))+'</a>':'';
    const focusBlock=focus?'<div class="context-focus"><div class="context-head">◎ &nbsp; Viewing from <a href="' +
      eattr(viewHref(ctx))+'" data-return-source>'+esc(viewLabel(ctx))+'</a></div><p>'+esc(focus.reason)+'</p>' +
      (focus.anchor?'<a href="#'+eattr(focus.anchor)+'" data-toc="'+eattr(focus.anchor)+'">Read related section ↘</a>':'')+
      '<div class="context-actions">'+returnLink+'<a href="'+eattr(linkArticle(id))+'">Default view</a></div></div>':'';
    const tocLinks=p.toc.filter(t=>t.level===2||t.level===3).map(t=>'<a class="toc-link '+(t.id===(focus&&focus.anchor)?'focus-link':'')+
      (t.level===3?' sub':'')+'" href="#'+eattr(t.id)+'" data-toc="'+eattr(t.id)+'">'+esc(t.title)+'</a>').join('')+
      '<div class="toc-divider"></div>';
    const aside='<aside class="toc-panel" aria-label="Article contents"><div class="toc-label">ON THIS PAGE</div>'+tocLinks+'</aside>';
    const mobileToc='<details class="inline-toc"><summary>On this page</summary><nav aria-label="Article contents">'+tocLinks+'</nav></details>';
    const technical=conn.length?'<section class="related-block"><div class="related-title">KNOWLEDGE RELATIONS / BACKLINKS</div><div class="relation-grid">'+
      conn.map(x=>'<div class="relation-chip"><a href="'+eattr(linkArticle(x.source.article,'',x.source.anchor))+'">'+esc(x.source.title)+
      '</a><small>'+esc(x.label)+'</small><a href="'+eattr(linkArticle(x.topic.article,'',x.topic.anchor))+'"><strong>'+esc(x.topic.title)+'</strong></a></div>').join('')+'</div></section>':'';
    const system=matches.length?'<section class="related-block"><div class="related-title">SYSTEM CONNECTIONS</div><div class="related-links">'+
      matches.map(x=>'<a class="related-link" href="'+eattr(x.url)+'">'+esc(x.name)+' ↗</a>').join('')+'</div></section>':'';
    const pager='<nav class="article-return" aria-label="Continue exploring">'+returnLink+'<a href="'+eattr(linkView('domain',s.id))+'">Browse '+esc(s.name)+'</a></nav>';
    return '<main class="page-container article-layout"><div class="article-main"><div class="article-top">' +
      '<div class="article-category"><a href="'+eattr(linkView('domain',s.id))+'">'+esc(s.eyebrow)+'</a> / CANONICAL ARTICLE</div>' +
      '<h1>'+esc(p.title)+'</h1><div class="article-summary">'+esc(p.summary)+'</div>' +
      '<div class="article-meta"><span>'+esc(p.maturity)+'</span><span class="meta-dot"></span><span>'+
      Math.max(2,Math.ceil(p.words/480))+' min read</span><span class="meta-dot"></span>'+
      p.tags.map(t=>'<span class="article-tag">'+esc(t)+'</span>').join('')+'</div></div>' +
      focusBlock + mobileToc + '<article class="content-body">'+p.html.replace(/<table>([\s\S]*?)<\/table>/g,'<div class="table-wrap"><table>$1</table></div>')+
      '</article>'+technical+system+pager+'</div>'+aside+'</main>';
  }

  function applyReadingFocus(r) {
    document.querySelectorAll?.('.reading-focus').forEach(el=>el.classList.remove('reading-focus'));
    if(r.type!=='article')return;
    let anchor='';
    try{anchor=decodeURIComponent(location.hash.slice(1));}catch(_){}
    const focus=focusForArticle(r.id,r.context);
    const target=document.getElementById(anchor || focus?.anchor || '');
    const heading=target?.matches?.('h2,h3,h4')?target:target?.closest?.('h2,h3,h4');
    if(heading)heading.classList.add('reading-focus');
  }
  function restoreReadingPosition(y) {
    requestAnimationFrame(()=>{
      if(typeof y==='number'){window.scrollTo({top:y,behavior:'instant'});return;}
      let anchor='';try{anchor=decodeURIComponent(location.hash.slice(1));}catch(_){}
      if(anchor)document.getElementById(anchor)?.scrollIntoView({behavior:'instant',block:'start'});
      else window.scrollTo({top:0,behavior:'instant'});
    });
  }
  function render(options={}) {
    const r=route(); sidebarOpen=false;
    const content=r.type==='home'?home():r.type==='stage'?stagePage(r.id):r.type==='loop'?loopPage(r.id):
      r.type==='domain'?domainPage(r.id):r.type==='context'?contextPage(r.id):articlePage(r.id,r.context);
    app.innerHTML='<div class="app-shell">'+sidebar(r)+'<div class="workspace">'+topbar(r)+content+'</div></div>';
    const title=r.type==='article'?byId[r.id].title:r.type==='home'?'System Overview':r.type==='stage'?stageById[r.id].title:
      r.type==='loop'?loopById[r.id].title:r.type==='domain'?sections[r.id].name:contextById[r.id].title;
    document.title=title+' · Embodied AI Atlas';
    syncNavigation();applyReadingFocus(r);
    if(options.moveFocus){const h=app.querySelector('main h1');h?.setAttribute('tabindex','-1');h?.focus({preventScroll:true});}
    restoreReadingPosition(options.scroll);
  }
  function rememberPosition() {
    if(location.protocol==='file:')return;
    positions.set(location.href,window.scrollY);
    history.replaceState({...history.state,atlasScroll:window.scrollY},'',location.href);
  }
  function navigate(url,restore=false) {
    if(url.pathname!==location.pathname)return;
    if(location.protocol==='file:'){location.href=url.href;return;}
    rememberPosition();
    const samePage=url.search===location.search;
    history.pushState({atlasScroll:restore?positions.get(url.href)||0:undefined},'',url.href);
    if(samePage&&url.hash){applyReadingFocus(route());restoreReadingPosition();}
    else render({moveFocus:true,scroll:restore?positions.get(url.href)||0:undefined});
  }

  const topicsByArticle=Object.fromEntries(PAGES.map(p=>[p.id,DATA.topics.filter(t=>t.article===p.id)]));
  const containsTerm=(text,term)=>/^[a-z0-9_-]{1,3}$/.test(term)
    ? new RegExp('(^|[^a-z0-9])'+term+'($|[^a-z0-9])').test(text)
    : text.includes(term);
  const findResults=q=>{
    const query=q.trim().toLowerCase();
    if(!query)return PAGES.slice(0,7).map(p=>({p,topic:null,score:0}));
    const terms=query.split(/\s+/),results=[];
    for(const p of PAGES){
      const plain=(p.search_text||p.summary).toLowerCase();
      const title=p.title.toLowerCase(),tags=p.tags.join(' ').toLowerCase();
      let score=0;
      for(const term of terms){
        if(containsTerm(title,term))score+=20;
        if(containsTerm(tags,term))score+=10;
        if(containsTerm(p.summary.toLowerCase(),term))score+=6;
        if(containsTerm(plain,term))score+=1;
      }
      for(const topic of topicsByArticle[p.id].filter(t=>t.kind==='section')){
        const aliases=[topic.title,topic.id,topic.heading,...(topic.aliases||[])].join(' ').toLowerCase();
        const matching=terms.filter(term=>containsTerm(aliases,term)).length;
        if(matching)results.push({p,topic,score:30*matching+(topic.id===query?30:0)});
      }
      if(score)results.push({p,topic:null,score});
    }
    return results.sort((a,b)=>b.score-a.score).slice(0,20);
  };
  function selectSearchResult(index){
    if(!searchResults.length)return;
    searchSelected=(index+searchResults.length)%searchResults.length;
    document.querySelectorAll('#search-results a').forEach((el,i)=>{
      el.classList.toggle('selected',i===searchSelected);
      if(i===searchSelected)el.setAttribute('aria-current','true');else el.removeAttribute('aria-current');
    });
    document.querySelectorAll('#search-results a')[searchSelected]?.scrollIntoView?.({block:'nearest'});
  }
  function updateSearch(q) {
    searchResults=findResults(q);searchSelected=0;
    const list=document.getElementById('search-results');if(!list)return;
    list.innerHTML=searchResults.length?searchResults.map((x,i)=>
      '<a class="search-row'+(i===0?' selected':'')+'" href="'+eattr(linkArticle(x.p.id,'',x.topic?.anchor))+'" data-search-result="'+i+'"'+(i===0?' aria-current="true"':'')+'><small>'+
      (x.topic?'TOPIC':'ARTICLE')+' · '+esc(sections[x.p.primary_domain].name)+'</small><strong>'+esc(x.topic?.title||x.p.title)+
      '</strong><p>'+esc(x.topic?x.p.title:x.p.summary)+'</p></a>').join(''):
      '<div class="search-no-results">No results. Try another term or a broader concept.</div>';
    document.getElementById('search-status').textContent=searchResults.length+' results';
  }
  function openSearch(){
    if(searchOpen)return;
    if(sidebarOpen)closeNavigation();
    searchOpen=true;searchOpener=document.activeElement===document.body?document.getElementById('open-search'):document.activeElement;
    const overlay=document.createElement('div');overlay.id='search-overlay';overlay.className='search-backdrop';
    overlay.innerHTML='<div class="search-modal" role="dialog" aria-modal="true" aria-label="Search knowledge">'+
      '<div class="search-box"><input id="search-input" type="search" aria-label="Search articles and topics" placeholder="Search VIO, Data Recipe, IK, World Model..."/>'+
      '<button class="search-close" id="close-search" aria-label="Close search">×</button></div>'+
      '<div class="search-results" id="search-results"></div><div class="search-footer"><span id="search-status" role="status" aria-live="polite"></span><span>↑ ↓ select · Enter open · Esc close</span></div></div>';
    document.body.appendChild(overlay);app.setAttribute('inert','');document.body.style.overflow='hidden';
    const input=document.getElementById('search-input');
    input.addEventListener('input',()=>updateSearch(input.value));input.focus();updateSearch('');
  }
  function closeSearch(restoreFocus=true){
    document.getElementById('search-overlay')?.remove();searchOpen=false;app.removeAttribute('inert');syncNavigation();
    if(restoreFocus)(searchOpener?.isConnected?searchOpener:document.getElementById('open-search'))?.focus();
  }
  app.addEventListener('toggle',event=>{
    if(event.target.matches?.('.nav-group'))groupState.set(event.target.dataset.group,event.target.open);
  },true);
  app.addEventListener('click',event=>{
    if(event.target.closest('#open-search')){openSearch();return;}
    if(event.target.closest('#theme-button')){setTheme(activeTheme==='light'?'dark':'light');return;}
    if(event.target.closest('[data-nav-toggle]')){
      if(narrowScreen()){
        if(sidebarOpen)closeNavigation();else{sidebarOpen=true;syncNavigation(true);}
      }else{
        sidebarCollapsed=!sidebarCollapsed;
        try{localStorage.setItem('atlasSidebarCollapsed',String(sidebarCollapsed));}catch(_){}
        syncNavigation();document.getElementById('nav-toggle')?.focus();
      }
      return;
    }
    if(event.target.closest('#sidebar-scrim')){closeNavigation();return;}
    const a=event.target.closest('a');
    if(!a||event.defaultPrevented||event.metaKey||event.ctrlKey||event.altKey||event.shiftKey||event.button!==0)return;
    const url=new URL(a.href,location.href);
    if(url.origin===location.origin&&url.pathname===location.pathname){
      if(location.protocol==='file:')return;
      event.preventDefault();navigate(url,a.hasAttribute('data-return-source'));
    }
  });
  document.addEventListener('click',event=>{
    if(!searchOpen)return;
    if(event.target.id==='search-overlay'||event.target.closest('#close-search')){closeSearch();return;}
    const a=event.target.closest('#search-overlay a');
    if(a&&!event.metaKey&&!event.ctrlKey&&!event.shiftKey&&!event.altKey&&event.button===0){
      if(location.protocol==='file:'){closeSearch(false);return;}
      event.preventDefault();const u=new URL(a.href,location.href);closeSearch(false);navigate(u);
    }
  });
  document.addEventListener('keydown',event=>{
    if(searchOpen){
      const overlay=document.getElementById('search-overlay');
      if(event.key==='Escape'){event.preventDefault();closeSearch();return;}
      trapFocus(event,overlay);
      if(event.target.id==='search-input'){
        if(event.key==='Enter'&&searchResults.length){
          event.preventDefault();const target=document.querySelectorAll('#search-results a')[searchSelected];
          if(target){const url=new URL(target.href,location.href);closeSearch(false);navigate(url);}
        }else if((event.key==='ArrowDown'||event.key==='ArrowUp')&&searchResults.length){
          event.preventDefault();selectSearchResult(searchSelected+(event.key==='ArrowDown'?1:-1));
        }
      }
      return;
    }
    if(sidebarOpen&&narrowScreen()){
      if(event.key==='Escape'){event.preventDefault();closeNavigation();return;}
      trapFocus(event,document.getElementById('sidebar'));return;
    }
    const editing=event.target.closest?.('input,textarea,select,[contenteditable="true"]');
    if(!editing&&((event.key==='/')||(event.key.toLowerCase()==='k'&&(event.metaKey||event.ctrlKey)))){
      event.preventDefault();openSearch();
    }
  });
  window.addEventListener('popstate',event=>render({scroll:event.state?.atlasScroll,moveFocus:true}));
  window.addEventListener('pagehide',rememberPosition);
  window.addEventListener('hashchange',()=>applyReadingFocus(route()));
  if(typeof matchMedia==='function')matchMedia('(max-width: 800px)').addEventListener('change',()=>{sidebarOpen=false;syncNavigation();});
  window.addEventListener('resize',()=>requestAnimationFrame(drawLifecycleEdges));
  history.scrollRestoration='manual';
  render();
})();
