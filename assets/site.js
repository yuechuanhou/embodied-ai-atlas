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
  const setTheme = t => { document.documentElement.setAttribute('data-theme',t); try {localStorage.setItem('atlasTheme',t);}catch (_){} };
  setTheme(getTheme());

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
    ' <span aria-hidden="true">↗</span></span><span class="atlas-card-body">' + esc(body || '') +
    '</span>' + (extra ? '<small>' + esc(extra) + '</small>' : '') + '</a>';
  const articleCards = (ids,ctx='',empty='此主题目前没有单独收录的文章；以后可随学习自然扩展。') => {
    const pages=unique(ids).map(id => byId[id]);
    if (!pages.length) return '<p class="empty-hint">' + esc(empty) + '</p>';
    return '<div class="atlas-card-grid">' + pages.map(p => card(p.title,p.summary,articleLink(p,ctx),sections[p.primary_domain].name)).join('') + '</div>';
  };
  const heading = (k,title,subtitle) =>
    '<div class="section-heading"><div><div class="section-kicker">' + esc(k) +
    '</div><h2>' + esc(title) + '</h2>' + (subtitle ? '<p>' + esc(subtitle) + '</p>' : '') + '</div></div>';
  const blocks = items => '<div class="atlas-card-grid">' + items.join('') + '</div>';
  const stat = (n,label) => '<span><b>' + esc(n) + '</b> ' + esc(label) + '</span>';

  function sidebar(r) {
    const grouped = [
      ['System Overview', ARCH.lifecycle.map(s => ['0' + Number(s.id) + '  ' + s.title,linkView('stage',s.id)]),r.type === 'stage'],
      ['Core Loops', ARCH.loops.map(l => [l.title,linkView('loop',l.id)]),r.type === 'loop'],
      ['Knowledge Domains', DATA.sections.filter(s => !s.auxiliary).map(s => [s.name,linkView('domain',s.id)]),r.type === 'domain'],
      ['Explore by Context', ARCH.contexts.map(c => [c.title,linkView('context',c.id)]),r.type === 'context'],
      ['Research & Reference',[
        ['Industry & Research',linkView('domain','industry')],
        ['Glossary',linkArticle('glossary')],
        ['Papers & Sources',linkArticle('reading-list')],
        ['Atlas Architecture','https://github.com/yuechuanhou/embodied-ai-atlas/blob/main/ARCHITECTURE.md']
      ],false]
    ];
    return '<aside class="sidebar' + (sidebarOpen ? ' open' : '') + '" id="sidebar" aria-label="Knowledge navigation">' +
      '<a class="brand" href="?page=home"><span class="brand-glyph"><span class="brand-dot"></span></span><span><span class="brand-title">Embodied AI Atlas</span><span class="brand-sub">SYSTEM · LEARNING · ENGINEERING</span></span></a>' +
      '<a class="nav-home" href="?page=home">⌂ &nbsp; System Map / Home</a><div class="nav-divider"></div>' +
      '<div class="v02-nav">' + grouped.map(([name,links,opened]) =>
        '<details class="nav-group"' + (opened ? ' open' : '') + '><summary>' + esc(name) + '</summary>' +
        links.map(([label,url]) => '<a href="' + eattr(url) + '" class="nav-link">' + esc(label) + '</a>').join('') +
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
    return '<header class="topbar"><div class="topbar-left">' +
      '<button class="icon-btn mobile-menu" id="mobile-menu" aria-label="Open navigation">☰</button>' +
      '<nav class="breadcrumbs"><a href="?page=home">Atlas</a><span>/</span><strong>' + esc(title) + '</strong></nav></div>' +
      '<div class="top-actions"><button class="search-trigger" id="open-search">' + glyph.search +
      '<span>Search knowledge</span><kbd>/</kbd></button><button class="icon-btn" id="theme-button" aria-label="Toggle theme">' +
      glyph.theme + '</button></div></header>';
  }

  function lifecycleDiagram() {
    const row = id => {
      const s=stageById[id];
      return '<a class="life-node" href="' + eattr(linkView('stage',id)) + '"><span class="life-num">' + id +
        '</span><div><strong>' + esc(s.title) + '</strong><small>' + esc(s.question) + '</small></div><span class="life-open">↗</span></a>';
    };
    return '<div class="lifecycle-map" aria-label="Embodied Intelligence Lifecycle">' +
      row('01') + '<div class="life-arrow">↓ <span>requirements guide system architecture</span></div>' +
      row('02') + '<div class="life-arrow">↓</div>' +
      '<div class="life-dual"><div>' + row('03') + '<span class="life-caption">Execution mechanism</span></div>' +
      '<span class="life-dual-link" aria-label="Execution and Learning exchange">↔</span>' +
      '<div>' + row('04') + '<span class="life-caption">Learning mechanism</span></div></div>' +
      '<div class="life-arrow">↓ <span>integrated into a working system</span></div>' +
      row('05') + '<div class="life-arrow">↓</div>' + row('06') +
      '<div class="life-feedback">↺ &nbsp; Evaluation feeds back to 01–05: requirements, hardware, execution, learning and integration</div>' +
      '<p class="atlas-note">这是系统关系地图，而不是必须按顺序执行的瀑布开发流程。感知与执行和数据学习相互作用，集成与验证贯穿整个过程。</p></div>';
  }
  function home() {
    const domains=DATA.sections.filter(s => !s.auxiliary);
    return '<main class="page-container atlas-home">' +
      '<section class="home-hero"><div class="eyebrow">A LIVING ROBOTICS KNOWLEDGE ATLAS</div>' +
      '<h1>Embodied AI,<br><em>from systems to intelligence.</em></h1>' +
      '<div class="home-title-cn">理解完整系统 · 探索核心机制 · 连接技术知识</div>' +
      '<p class="home-description">以机器人系统生命周期为主线，连接机器人本体、感知与控制、具身数据、机器人学习、系统集成及真实部署。每个知识点只有一份权威内容，从不同视角进入时突出不同的阅读重点。</p>' +
      '<div class="hero-actions"><a class="btn-primary" href="#lifecycle">Explore the lifecycle →</a>' +
      '<a class="btn-secondary" href="' + linkView('domain','data') + '">Browse knowledge domains ↗</a></div>' +
      '<div class="home-statline">' + stat(PAGES.length,'canonical articles') +
      stat(ARCH.lifecycle.length,'system stages') + stat(ARCH.loops.length,'core loops') +
      stat(domains.length,'knowledge domains') + '</div></section>' +
      '<section id="lifecycle">' + heading('01 / SYSTEM OVERVIEW','The Embodied Intelligence Lifecycle',
      '六阶段的完整系统认知：03 与 04 双向耦合，06 的反馈可以返回任何前置环节。') +
      lifecycleDiagram() + '</section>' +
      '<section>' + heading('02 / CORE MECHANISMS','Explore Core Loops','理解机器人怎样执行、学习以及通过工程验证持续改进。') +
      blocks(ARCH.loops.map(l => card(l.title,l.question,linkView('loop',l.id),'Feedback: ' + l.feedback))) + '</section>' +
      '<section>' + heading('03 / CANONICAL ORGANIZATION','Knowledge Domains','每篇文章只有一个主归档位置，其他视角只提供引用。') +
      '<div class="domain-grid">' + domains.map((s,i) =>
        '<a class="domain-card" href="' + eattr(linkView('domain',s.id)) +
        '"><span class="domain-num">' + String(i+1).padStart(2,'0') + ' / ' + esc(s.eyebrow) +
        '</span><h3>' + esc(s.name) + '</h3><p>' + PAGES.filter(p=>p.primary_domain===s.id).length +
        ' canonical articles</p><div class="domain-bottom"><span>Explore the domain</span><b>↗</b></div></a>').join('') + '</div></section>' +
      '<section>' + heading('04 / PRACTICE & APPLICATION','Explore by Context','专业视角是访问知识的入口，不随雇主或岗位名称改变知识的归属。') +
      blocks(ARCH.contexts.map(c => card(c.title,c.description,linkView('context',c.id),c.subtitle))) + '</section>' +
      '<section>' + heading('RESEARCH / REFERENCE','Research & Knowledge Connections',
      '行业研究、论文索引、术语与知识架构。') +
      blocks([card('Industry & Research','公司、模型版本与技术路线',linkView('domain','industry')),
        card('Glossary','中英文技术术语速查',linkArticle('glossary')),
        card('Papers & Official Sources','优先使用原始论文与技术报告',linkArticle('reading-list'))]) + '</section>' +
      '<div class="footer-home">Embodied AI Atlas · Markdown is the canonical source · Architecture v0.2 · No fixed curriculum</div></main>';
  }

  const pageShell = (label,title,summary,body) =>
    '<main class="page-container atlas-index-page"><div class="view-header"><div class="article-category">' +
    esc(label) + '</div><h1>' + esc(title) + '</h1><p>' + esc(summary) +
    '</p></div>' + body + '</main>';
  function stagePage(id) {
    const s=stageById[id],ctx='stage:'+id;
    let body = '<section>' + heading('SYSTEM ROLE','Five Second-Level Topics',
      '主题是长期稳定的知识位置；只有已存在的文章才会显示链接。') +
      '<div class="stage-topics">' + s.topics.map(t =>
        '<div class="stage-topic"><div class="stage-topic-title"><span>' + esc(t.id) + '</span><h3>' +
        esc(t.title) + '</h3></div>' + articleCards(t.articles,ctx) + '</div>').join('') +
      '</div></section><section>' + heading('CROSS-SYSTEM CONNECTIONS','How this stage connects') +
      blocks(s.connections.map(c => card(stageById[c.to].title,c.label,linkView('stage',c.to),'Stage '+c.to))) +
      '</section><section>' + heading('ASSOCIATED LOOPS','Participating mechanisms') +
      blocks(s.loops.map(l => card(loopById[l].title,loopById[l].question,linkView('loop',l)))) + '</section>';
    if(id==='06')body += '<p class="atlas-note">Evaluation 的反馈不只是返回 Data Collection：它还可能改变需求、硬件、控制器和 Runtime。</p>';
    return pageShell('LIFECYCLE / STAGE '+id,s.title,s.question,body);
  }
  function loopPage(id) {
    const l=loopById[id],ctx='loop:'+id;
    let body='<section>' + heading('MECHANISM','Process & Feedback','每个机制节点链接已有知识，且不复制原始文章。') +
      '<div class="loop-steps">' + l.steps.map((s,i) =>
        '<div class="loop-step"><div class="loop-step-title"><span>' + String(i+1).padStart(2,'0') +
        '</span><div><h3>' + esc(s.title) + '</h3><p>' + esc(s.detail) + '</p></div></div>' +
        articleCards(s.articles,ctx) + '</div>').join('') + '</div>' +
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
      '文章在此具有唯一主归档；其他视角仅作关联引用。') +
      articleCards(articles.map(p=>p.id)) + '</section>';
    const subtopics=DATA.topics.filter(t=>t.kind==='section' && t.primary_domain===id);
    if(subtopics.length) body += '<section>' + heading('SECTION-LEVEL TOPICS','Concepts within existing articles',
      '同一篇 Markdown 可包含多个有独立身份的知识点。') +
      blocks(subtopics.map(t => card(t.title,'Canonical section in '+byId[t.article].title,
        linkArticle(t.article,'',t.anchor),'Topic: '+t.id))) + '</section>';
    return pageShell('KNOWLEDGE DOMAIN / '+s.eyebrow,s.name,
      '权威归档：'+articles.length+' 篇文章。可通过 Lifecycle、Loop 和 Context 从不同视角访问。',body);
  }
  function contextPage(id) {
    const c=contextById[id];
    const body='<section>'+heading('CROSS-DOMAIN ENTRIES','Relevant Knowledge',
      '这些链接来自不同 Domain，但都指向各自唯一的原始文章。') +
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
    const index=PAGES.findIndex(x=>x.id===id),prev=PAGES[index-1],next=PAGES[index+1];
    const focusBlock=focus?'<div class="context-focus"><div class="context-head">◎ &nbsp; Viewing from <a href="' +
      eattr(viewHref(ctx))+'">'+esc(viewLabel(ctx))+'</a></div><p>'+esc(focus.reason)+'</p>' +
      (focus.anchor?'<a href="#'+eattr(focus.anchor)+'" data-toc="'+eattr(focus.anchor)+'">Read related section ↘</a>':'')+
      '<span class="focus-clear"><a href="'+eattr(linkArticle(id))+'">Default view</a></span></div>':'';
    const aside='<aside class="toc-panel"><div class="toc-label">ON THIS PAGE</div>' +
      p.toc.filter(t=>t.level===2||t.level===3).map(t=>'<a class="toc-link '+(t.id===(focus&&focus.anchor)?'focus-link':'')+
      (t.level===3?' sub':'')+'" href="#'+eattr(t.id)+'" data-toc="'+eattr(t.id)+'">'+esc(t.title)+'</a>').join('')+
      '<div class="toc-divider"></div><div class="toc-small">Same canonical article across all navigation views.</div></aside>';
    const technical=conn.length?'<section class="related-block"><div class="related-title">KNOWLEDGE RELATIONS / BACKLINKS</div><div class="relation-grid">'+
      conn.map(x=>'<div class="relation-chip"><a href="'+eattr(linkArticle(x.source.article,'',x.source.anchor))+'">'+esc(x.source.title)+
      '</a><small>'+esc(x.label)+'</small><a href="'+eattr(linkArticle(x.topic.article,'',x.topic.anchor))+'"><strong>'+esc(x.topic.title)+'</strong></a></div>').join('')+'</div></section>':'';
    const system=matches.length?'<section class="related-block"><div class="related-title">SYSTEM CONNECTIONS</div><div class="related-links">'+
      matches.map(x=>'<a class="related-link" href="'+eattr(x.url)+'">'+esc(x.name)+' ↗</a>').join('')+'</div></section>':'';
    const pager='<nav class="article-pager"><div>'+(prev?'<a class="pager-card" href="'+eattr(linkArticle(prev.id))+'"><small>← Previous</small><strong>'+esc(prev.title)+'</strong></a>':'')+
      '</div><div>'+(next?'<a class="pager-card pager-next" href="'+eattr(linkArticle(next.id))+'"><small>Next →</small><strong>'+esc(next.title)+'</strong></a>':'')+'</div></nav>';
    return '<main class="page-container article-layout"><div class="article-main"><div class="article-top">' +
      '<div class="article-category"><a href="'+eattr(linkView('domain',s.id))+'">'+esc(s.eyebrow)+'</a> / CANONICAL ARTICLE</div>' +
      '<h1>'+esc(p.title)+'</h1><div class="article-summary">'+esc(p.summary)+'</div>' +
      '<div class="article-meta"><span>'+esc(p.maturity)+'</span><span class="meta-dot"></span><span>'+
      Math.max(2,Math.ceil(p.words/480))+' min read</span><span class="meta-dot"></span>'+
      p.tags.map(t=>'<span class="article-tag">'+esc(t)+'</span>').join('')+'</div></div>' +
      focusBlock + '<article class="content-body">'+p.html.replace(/<table>([\s\S]*?)<\/table>/g,'<div class="table-wrap"><table>$1</table></div>')+
      '</article>'+technical+system+pager+'</div>'+aside+'</main>';
  }

  function render() {
    const r=route(); sidebarOpen=false;
    let content=r.type==='home'?home():r.type==='stage'?stagePage(r.id):r.type==='loop'?loopPage(r.id):
      r.type==='domain'?domainPage(r.id):r.type==='context'?contextPage(r.id):
      articlePage(r.id,r.context);
    app.innerHTML='<div class="app-shell">'+sidebar(r)+'<div class="workspace">'+topbar(r)+content+'</div></div>';
    const title=r.type==='article'?byId[r.id].title:r.type==='home'?'System Overview':r.type==='stage'?stageById[r.id].title:
      r.type==='loop'?loopById[r.id].title:r.type==='domain'?sections[r.id].name:contextById[r.id].title;
    document.title=title+' · Embodied AI Atlas';
    if(location.hash)requestAnimationFrame(()=>{const id=decodeURIComponent(location.hash.slice(1));document.getElementById(id)?.scrollIntoView();});
  }
  function navigate(url) {
    if(url.pathname!==location.pathname)return;
    history.pushState({},'',url.href);
    render();
    if(!url.hash)window.scrollTo(0,0);
  }

  const findResults=q=>{
    const query=q.trim().toLowerCase();
    if(!query)return PAGES.slice(0,9).map(p=>({p,topic:null}));
    const scored=PAGES.map(p=>{
      const aliases=DATA.topics.filter(t=>t.article===p.id).map(t=>t.title+' '+t.id).join(' ').toLowerCase();
      let score=0;
      for(const term of query.split(/\s+/)){
        if(p.title.toLowerCase().includes(term))score+=20;
        if(p.tags.join(' ').toLowerCase().includes(term))score+=12;
        if(aliases.includes(term))score+=13;
        if(p.summary.toLowerCase().includes(term))score+=8;
        if(p.html.toLowerCase().includes(term))score+=2;
      }
      const exact=DATA.topics.find(t=>t.article===p.id && t.kind==='section' &&
        (t.title.toLowerCase().includes(query)||t.id.toLowerCase()===query));
      return {p,score,topic:exact||null};
    }).filter(x=>x.score>0).sort((a,b)=>b.score-a.score);
    return scored.slice(0,15);
  };
  function updateSearch(q) {
    searchResults=findResults(q);searchSelected=0;
    const list=document.getElementById('search-results');if(!list)return;
    list.innerHTML=searchResults.length?searchResults.map((x,i)=>
      '<a class="search-row" href="'+eattr(linkArticle(x.p.id,'',x.topic?.anchor))+'" data-search-result="'+i+'"><small>'+
      esc(sections[x.p.primary_domain].name)+'</small><strong>'+esc(x.topic?.title||x.p.title)+
      '</strong><p>'+esc(x.p.summary)+'</p></a>').join(''):
      '<div class="search-no-results">No results. Try the English term or a broader concept.</div>';
  }
  function openSearch(){
    if(searchOpen)return;searchOpen=true;
    const overlay=document.createElement('div');overlay.id='search-overlay';overlay.className='search-backdrop';
    overlay.innerHTML='<div class="search-modal" role="dialog" aria-modal="true" aria-label="Search knowledge">'+
      '<div class="search-box">⌕ <input id="search-input" type="search" placeholder="Search VIO, Data Recipe, IK, World Model..."/>'+
      '<button class="search-close" id="close-search" aria-label="Close search">×</button></div>'+
      '<div class="search-results" id="search-results"></div><div class="search-footer">Search article titles, concepts and content · Esc to close</div></div>';
    document.body.appendChild(overlay);
    const input=document.getElementById('search-input');
    input.addEventListener('input',()=>updateSearch(input.value));input.focus();updateSearch('');
  }
  function closeSearch(){document.getElementById('search-overlay')?.remove();searchOpen=false;}
  app.addEventListener('click',event=>{
    if(event.target.closest('#open-search')){openSearch();return;}
    if(event.target.closest('#theme-button')){setTheme(getTheme()==='light'?'dark':'light');return;}
    if(event.target.closest('#mobile-menu')){sidebarOpen=true;document.getElementById('sidebar').classList.add('open');document.getElementById('sidebar-scrim').classList.add('open');return;}
    if(event.target.closest('#sidebar-scrim')){sidebarOpen=false;document.getElementById('sidebar').classList.remove('open');document.getElementById('sidebar-scrim').classList.remove('open');return;}
    const a=event.target.closest('a');
    if(!a || event.metaKey||event.ctrlKey||event.altKey||event.shiftKey||event.button!==0)return;
    const url=new URL(a.href,location.href);
    if(url.origin===location.origin && url.pathname===location.pathname &&
      (url.searchParams.has('view')||url.searchParams.has('page'))){
      event.preventDefault();navigate(url);
    }
  });
  document.addEventListener('click',event=>{
    if(!searchOpen)return;
    if(event.target.id==='search-overlay'||event.target.closest('#close-search')){closeSearch();return;}
    const a=event.target.closest('#search-overlay a');
    if(a && !event.metaKey&&!event.ctrlKey){event.preventDefault();const u=new URL(a.href,location.href);closeSearch();navigate(u);}
  });
  document.addEventListener('keydown',event=>{
    const editing=['INPUT','TEXTAREA'].includes(event.target.tagName);
    if((event.key==='/'&&!editing)||(event.key.toLowerCase()==='k'&&(event.metaKey||event.ctrlKey))){
      event.preventDefault();openSearch();return;
    }
    if(!searchOpen)return;
    if(event.key==='Escape'){event.preventDefault();closeSearch();return;}
    if(event.key==='Enter' && searchResults.length){
      event.preventDefault();
      const target=document.querySelectorAll('#search-results a')[Math.min(searchSelected,searchResults.length-1)];
      if(target){const url=new URL(target.href,location.href);closeSearch();navigate(url);}
    }
    if(event.key==='ArrowDown'||event.key==='ArrowUp'){
      event.preventDefault();searchSelected=(searchSelected+(event.key==='ArrowDown'?1:-1)+searchResults.length)%searchResults.length;
      document.querySelectorAll('#search-results a').forEach((el,i)=>el.classList.toggle('selected',i===searchSelected));
    }
  });
  window.addEventListener('popstate',()=>{render();window.scrollTo(0,0);});
  render();
})();
