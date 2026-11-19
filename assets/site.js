(() => {
  'use strict';
  const DATA = JSON.parse(document.getElementById('atlas-data').textContent);
  const PAGES = DATA.pages;
  const pageById = Object.fromEntries(PAGES.map(x => [x.id, x]));
  const secById = Object.fromEntries(DATA.sections.map(x => [x.id, x]));
  const app = document.getElementById('app');
  let currentId = null;
  let searchOpen = false;
  let searchSelected = 0;
  let searchResults = [];
  let sidebarOpen = false;
  let tocScrollHandler = null;
  const icons = {
    search:'<svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="11" cy="11" r="7.5"/><path d="m16.5 16.5 5 5"/></svg>',
    menu:'<svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 7h16M4 12h16M4 17h16"/></svg>',
    moon:'<svg aria-hidden="true" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M20.3 15.2A8 8 0 0 1 8.8 3.7 8 8 0 1 0 20.3 15.2Z"/></svg>',
    sun:'<svg aria-hidden="true" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42M17.65 6.35l1.42-1.42"/></svg>',
    home:'<svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="m3 10 9-7 9 7v10h-6v-7H9v7H3Z"/></svg>'
  };
  const escapeHtml = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const href = id => '?page=' + encodeURIComponent(id);
  const pageFromUrl = () => new URL(location.href).searchParams.get('page') || 'home';
  const getTheme = () => {try{return localStorage.getItem('atlasTheme') || 'light'}catch(e){return 'light'}};
  const setTheme = theme => {document.documentElement.setAttribute('data-theme',theme);try{localStorage.setItem('atlasTheme',theme)}catch(e){}; const button=document.getElementById('theme-button');if(button)button.innerHTML=(theme==='light'?icons.moon:icons.sun)};
  setTheme(getTheme());

  function sidebar() {
    const links = DATA.sections.map(section => {
      const items = PAGES.filter(page => page.section === section.id);
      return `<div class="nav-section"><div class="nav-section-label">${escapeHtml(section.eyebrow)}<small>${items.length}</small></div>${items.map(page=>`<a class="nav-link ${currentId===page.id?'active':''}" href="${href(page.id)}">${escapeHtml(page.title)}</a>`).join('')}</div>`;
    }).join('');
    return `<aside class="sidebar ${sidebarOpen?'open':''}" id="sidebar" aria-label="知识库导航">
      <a class="brand" href="?page=home"><span class="brand-glyph"><span class="brand-dot"></span></span><span><span class="brand-title">Embodied AI Atlas</span><span class="brand-sub">PERSONAL LEARNING STUDIO</span></span></a>
      <a class="nav-home ${currentId==='home'?'active':''}" href="?page=home">${icons.home}<span>知识图谱首页</span></a>
      <div class="nav-divider"></div>${links}
      <div class="sidebar-foot"><b>Open knowledge, built to evolve.</b>v${escapeHtml(DATA.site.version)} · Updated ${escapeHtml(DATA.site.asOf)}</div>
    </aside><div class="sidebar-scrim ${sidebarOpen?'open':''}" id="sidebar-scrim"></div>`;
  }
  function topbar() {
    const page=pageById[currentId];
    const section=page?secById[page.section]:null;
    return `<header class="topbar">
      <div style="display:flex;align-items:center;gap:13px;min-width:0"><button class="icon-btn mobile-menu" id="mobile-menu" aria-label="打开菜单">${icons.menu}</button>
      <nav class="breadcrumbs" aria-label="面包屑"><a href="?page=home" style="text-decoration:none;color:inherit">Atlas</a><span> / </span>${page?`<span>${escapeHtml(section.name)}</span><span> / </span><strong>${escapeHtml(page.title)}</strong>`:'<strong>知识总览</strong>'}</nav></div>
      <div class="top-actions"><button class="search-trigger" id="open-search" aria-label="搜索知识库">${icons.search}<span>搜索知识与术语</span><kbd>/</kbd></button>
      <button class="icon-btn" id="theme-button" aria-label="切换浅色或深色主题">${getTheme()==='light'?icons.moon:icons.sun}</button></div>
    </header>`;
  }
  const sectionsMeta = [
    {id:'start',title:'学习入口与全景',sub:'从完整系统问题进入任何知识分支'},
    {id:'data',title:'数据与数据工程',sub:'来源、标签、格式、处理与配方'},
    {id:'models',title:'模型架构与训练',sub:'把多模态数据变为可执行机器人行为'},
    {id:'evaluation',title:'评估、部署与闭环',sub:'用真实结果反过来检验数据和模型'},
    {id:'industry',title:'公司与研究案例',sub:'以具体模型版本追踪不同技术路线'},
    {id:'foundations',title:'机器人技术基础',sub:'传感器、坐标系、运动学和状态估计'},
    {id:'reference',title:'知识连接与参考资料',sub:'术语、论文来源与维护方式'}
  ];
  const focusDomains=[
    ['foundations','01','机器人与感知基础','Sensors · Coordinates · Kinematics','robotics-stack'],
    ['data','02','数据采集与处理','Teleop · UMI · MCAP · Dataset','data-taxonomy'],
    ['models','03','模型架构与训练','VLA · BC · RL · World Model','training-loop'],
    ['evaluation','04','评估与真实部署','Metrics · Generalization · Feedback','quality-evaluation'],
    ['industry','05','公司与技术路线','GR00T · π Series · Helix · Others','industry-landscape'],
    ['reference','06','知识连接与资源','Glossary · Papers · Cross-links','glossary']
  ];
  function home() {
    const featured = ['overview','data-taxonomy','data-comparison','data-recipe','industry-landscape','training-loop'];
    return `<div class="page-container">
      <section class="home-hero"><div class="eyebrow">AN EVOLVING KNOWLEDGE ATLAS</div>
        <h1>Embodied AI,<br><em>from data to intelligence.</em></h1>
        <div class="home-title-cn">具身智能知识图谱 · 从训练数据到真实机器人</div>
        <p class="home-description">以「Embodied AI 的训练数据：类型、作用、Data Recipe 与行业实践」为起点，把机器人基础、数据工程、模型学习、评估部署和行业研究连接成一个可持续迭代的知识体系。自由探索，没有固定的学习顺序。</p>
        <div class="hero-actions"><a class="btn-primary" href="${href('overview')}">开始阅读核心导读 <span>↗</span></a><a class="btn-secondary" href="${href('industry-landscape')}">查看行业 Data Recipe <span>↗</span></a></div>
        <div class="home-statline"><span><b>${PAGES.length}</b> 篇独立知识页面</span><span><b>${DATA.sections.length}</b> 个内容领域</span><span>研究资料截至 <b>${escapeHtml(DATA.site.asOf)}</b></span><span>Markdown 源码可编辑</span></div>
      </section>
      <div class="section-heading"><div><div class="section-kicker">THE SYSTEM LOOP</div><h2>整个领域的技术闭环</h2><p>每个环节都是独立知识领域，同时又会反过来约束其他环节</p></div></div>
      <div class="flowline">
        ${[['01','感知与采集','Sensors & Robot','robotics-stack'],['02','数据处理','Process & Align','data-pipeline'],['03','数据配方','Recipe & Mixing','data-recipe'],['04','模型训练','Policy & Learning','training-loop'],['05','验证部署','Evaluation & Reality','quality-evaluation'],['06','反馈改进','Flywheel & Recovery','data-flywheel']].map(([n,t,s,id])=>`<a class="flow-stage" href="${href(id)}"><span class="step">${n}</span><h3>${t}</h3><p>${s}</p></a>`).join('')}
      </div><div class="flow-caption">↺ 真实部署的结果会改变下一轮需要采集和训练的数据</div>
      <div class="section-heading"><div><div class="section-kicker">FEATURED EXPLORATION</div><h2>从数据问题进入具身智能</h2><p>从一个实际问题引出整套数据与模型体系</p></div></div>
      <div class="feature-panel"><div><div class="feature-overline">MAIN EXPLORATION · VERSION 0.1</div><h3>Embodied AI 的训练数据：<br>类型、作用、Data Recipe 与行业实践</h3><p>为什么真实遥操、第一人称视频、UMI、仿真与自主 rollout 不能互相简单替代？它们各自教给机器人什么能力？NVIDIA、Figure、PI、1X 又采用什么不同路径？</p><a href="${href('overview')}">探索完整专题 →</a></div><div class="feature-pattern"><div class="pattern-bar"><span>01</span> 数据来源与分类</div><div class="pattern-bar"><span>02</span> 横向比较与质量</div><div class="pattern-bar"><span>03</span> 模型训练与 Recipe</div><div class="pattern-bar"><span>04</span> 公司研究与验证</div></div></div>
      <div class="section-heading"><div><div class="section-kicker">KNOWLEDGE DOMAINS</div><h2>六个自由扩展的知识领域</h2><p>每个模块都可独立深入，并通过文内链接形成知识网络</p></div></div>
      <div class="domain-grid">${focusDomains.map(([section,num,name,desc,first])=>`<a class="domain-card" href="${href(first)}"><span class="domain-num">${num} / ${escapeHtml(section.toUpperCase())}</span><h3>${name}</h3><p>${desc}</p><div class="domain-bottom"><span>${PAGES.filter(x=>x.section===section).length} 个页面</span><b>探索 →</b></div></a>`).join('')}</div>
      <div class="section-heading"><div><div class="section-kicker">CURATED ENTRIES</div><h2>当前重点章节</h2><p>每个章节有自己的 Markdown 源文件，方便持续增量完善</p></div><a class="link-inline" href="${href('glossary')}">术语速查 →</a></div>
      <div class="article-grid">${featured.map(id=>{const x=pageById[id];return `<a class="article-tile" href="${href(id)}"><div class="tile-top"><span>${escapeHtml(secById[x.section].eyebrow)}</span><span class="pill">${escapeHtml(x.maturity)}</span></div><h3>${escapeHtml(x.title)}</h3><p>${escapeHtml(x.summary)}</p></a>`}).join('')}</div>
      <div class="footer-home">EMBODIED AI ATLAS · Personal Learning Studio · 这是可编辑的学习知识库，不是静态的最终结论。涉及公司的数据与实验以对应官方来源和报告日期为准。</div>
    </div>`;
  }
  function wrapTables(html) {return html.replace(/<table>([\s\S]*?)<\/table>/g, '<div class="table-wrap"><table>$1</table></div>')}
  function article(page) {
    const index=PAGES.findIndex(x=>x.id===page.id), previous=PAGES[index-1],next=PAGES[index+1];
    const related=(page.related||[]).map(id=>pageById[id]).filter(Boolean);
    const toc=page.toc.filter(item=>item.level===2||item.level===3);
    const section=secById[page.section];
    return `<div class="page-container article-layout"><main class="article-main"><div class="article-top">
      <div class="article-category">${escapeHtml(section.eyebrow)} / ${escapeHtml(section.name)}</div>
      <h1>${escapeHtml(page.title)}</h1><div class="article-summary">${escapeHtml(page.summary)}</div>
      <div class="article-meta"><span>${escapeHtml(page.maturity)}</span><span class="meta-dot"></span><span>${Math.max(2,Math.ceil(page.words/480))} 分钟左右阅读</span><span class="meta-dot"></span>${page.tags.map(t=>`<span class="article-tag">${escapeHtml(t)}</span>`).join('')}</div>
    </div>
    <article class="content-body">${wrapTables(page.html)}</article>
    <div class="related-block"><div class="related-title">相关知识 · RELATED TOPICS</div><div class="related-links">${related.map(x=>`<a class="related-link" href="${href(x.id)}">${escapeHtml(x.title)} →</a>`).join('')}</div></div>
    <nav class="article-pager" aria-label="相邻文档"><div>${previous?`<a class="pager-card" style="display:block" href="${href(previous.id)}"><small>← 上一篇</small><strong>${escapeHtml(previous.title)}</strong></a>`:''}</div><div>${next?`<a class="pager-card pager-next" style="display:block" href="${href(next.id)}"><small>下一篇 →</small><strong>${escapeHtml(next.title)}</strong></a>`:''}</div></nav></main>
    <aside class="toc-panel" aria-label="本文目录"><div class="toc-label">ON THIS PAGE</div>${toc.map(item=>`<a class="toc-link ${item.level===3?'sub':''}" href="#${item.id}" data-toc="${item.id}">${escapeHtml(item.title)}</a>`).join('')}<div class="toc-divider"></div><div class="toc-small">内容与界面分离 · 修改 Markdown 后重新构建即可更新全站。</div></aside>
    </div>`;
  }
  function attachToc() {
    if(tocScrollHandler)window.removeEventListener('scroll',tocScrollHandler);
    const links=[...document.querySelectorAll('[data-toc]')];
    if(!links.length)return;
    let pending=false;
    tocScrollHandler=()=>{if(pending)return;pending=true;requestAnimationFrame(()=>{const headings=links.map(x=>document.getElementById(x.dataset.toc)).filter(Boolean);let current=headings[0]?.id;headings.forEach(h=>{if(h.getBoundingClientRect().top<180)current=h.id});links.forEach(link=>link.classList.toggle('active',link.dataset.toc===current));pending=false})};
    window.addEventListener('scroll',tocScrollHandler,{passive:true});tocScrollHandler();
  }
  function render(id) {
    currentId=pageById[id]?id:'home';
    sidebarOpen=false;
    app.innerHTML=`<div class="app-shell">${sidebar()}<div class="workspace">${topbar()}${currentId==='home'?home():article(pageById[currentId])}</div></div>`;
    attachToc();
    document.title = (currentId==='home'?'知识图谱首页':pageById[currentId].title) + ' · Embodied AI Atlas';
  }
  function navigate(id) {
    if(!pageById[id] && id!=='home') id='home';
    const url=new URL(location.href);url.searchParams.set('page',id);url.hash='';
    try { history.pushState({page:id},'',url.href); } catch(e) { /* opaque origins such as embedded previews cannot update URL; navigation still works */ }
    render(id);window.scrollTo({top:0,behavior:'instant'});
  }

  function plainText(text) {return text.replace(/<[^>]*>/g,' ').replace(/&[a-z]+;/gi,' ').replace(/\s+/g,' ').trim()}
  const fullText = PAGES.map(p=>({page:p, content:plainText(p.html).toLowerCase(), title:p.title.toLowerCase(), desc:p.summary.toLowerCase(),tags:p.tags.join(' ').toLowerCase()}));
  function scored(query) {
    const terms=query.toLowerCase().trim().split(/\s+/).filter(Boolean);
    if(!terms.length)return PAGES.slice(0,8);
    return fullText.map(x=>{let score=0;for(const term of terms){let s=0;if(x.title.includes(term))s+=15;if(x.tags.includes(term))s+=12;if(x.desc.includes(term))s+=8;if(x.content.includes(term))s+=3;if(!s)return {page:x.page,score:0};score+=s}return {page:x.page,score}}).filter(x=>x.score>0).sort((a,b)=>b.score-a.score).slice(0,14).map(x=>x.page);
  }
  function openSearch() {
    if(searchOpen)return;
    searchOpen=true;searchSelected=0;
    const overlay=document.createElement('div');overlay.className='search-backdrop';overlay.id='search-overlay';overlay.setAttribute('role','dialog');overlay.setAttribute('aria-modal','true');overlay.setAttribute('aria-label','搜索知识库');
    overlay.innerHTML=`<div class="search-modal"><div class="search-box">${icons.search}<input id="search-input" type="search" autocomplete="off" placeholder="搜索 VIO、Data Recipe、π0、UMI..." aria-label="搜索术语与文章"><button class="search-close" id="close-search" aria-label="关闭搜索">×</button></div><div class="search-results" id="search-results"></div><div class="search-footer"><span>搜索标题、标签、正文与公司</span><span>↑ ↓ 选择 · Enter 打开 · Esc 退出</span></div></div>`;
    document.body.appendChild(overlay);
    const input=overlay.querySelector('input');input.addEventListener('input',()=>updateSearch(input.value));input.focus();updateSearch('');
  }
  function closeSearch() {const x=document.getElementById('search-overlay');if(x)x.remove();searchOpen=false;searchSelected=0}
  function updateSearch(query) {
    searchResults=scored(query);if(searchSelected>=searchResults.length)searchSelected=0;
    const target=document.getElementById('search-results');if(!target)return;
    if(!searchResults.length){target.innerHTML='<div class="search-no-results">没有找到匹配的内容。也可以试试英文技术术语。</div>';return}
    target.innerHTML=searchResults.map((p,i)=>`<a href="${href(p.id)}" class="search-row ${i===searchSelected?'selected':''}" data-search-index="${i}"><small>${escapeHtml(secById[p.section].name)}</small><strong>${escapeHtml(p.title)}</strong><p>${escapeHtml(p.summary)}</p></a>`).join('');
  }
  app.addEventListener('click',event=>{
    if(event.target.closest('#open-search')){openSearch();return}
    if(event.target.closest('#theme-button')){setTheme(getTheme()==='light'?'dark':'light');return}
    if(event.target.closest('#mobile-menu')){sidebarOpen=true;document.getElementById('sidebar').classList.add('open');document.getElementById('sidebar-scrim').classList.add('open');return}
    if(event.target.closest('#sidebar-scrim')){sidebarOpen=false;document.getElementById('sidebar').classList.remove('open');document.getElementById('sidebar-scrim').classList.remove('open');return}
    const toc=event.target.closest('[data-toc]');if(toc){event.preventDefault();const target=document.getElementById(toc.dataset.toc);target?.scrollIntoView({behavior:'smooth',block:'start'});return}
    const anchor=event.target.closest('a[href^="?page="]');
    if(anchor&&!event.metaKey&&!event.ctrlKey&&!event.shiftKey&&!event.altKey && (!anchor.target||anchor.target==='_self')){event.preventDefault();navigate(new URLSearchParams((anchor.getAttribute('href')||'').replace(/^\?/, '')).get('page'))}
  });
  document.addEventListener('click',event=>{
    if(!searchOpen)return;
    if(event.target.id==='search-overlay'||event.target.closest('#close-search')){closeSearch();return}
    const anchor=event.target.closest('#search-overlay a[href^="?page="]');
    if(anchor&&!event.metaKey&&!event.ctrlKey){event.preventDefault();const id=new URLSearchParams((anchor.getAttribute('href')||'').replace(/^\?/, '')).get('page');closeSearch();navigate(id)}
  });
  document.addEventListener('keydown',event=>{
    const inputLike=event.target instanceof HTMLElement && ['INPUT','TEXTAREA'].includes(event.target.tagName);
    if((event.key==='/'&&!inputLike&&!event.metaKey&&!event.ctrlKey)||(event.key.toLowerCase()==='k'&&(event.metaKey||event.ctrlKey))){event.preventDefault();openSearch();return}
    if(!searchOpen)return;
    if(event.key==='Escape'){event.preventDefault();closeSearch();return}
    if(event.key==='ArrowDown'||event.key==='ArrowUp'){event.preventDefault();if(searchResults.length){searchSelected=(searchSelected+(event.key==='ArrowDown'?1:-1)+searchResults.length)%searchResults.length;updateSearch(document.getElementById('search-input')?.value||'');document.querySelector('.search-row.selected')?.scrollIntoView({block:'nearest'})}return}
    if(event.key==='Enter'&&searchResults[searchSelected]){event.preventDefault();const id=searchResults[searchSelected].id;closeSearch();navigate(id)}
  });
  window.addEventListener('popstate',()=>{render(pageFromUrl());window.scrollTo({top:0,behavior:'instant'})});
  render(pageFromUrl());
})();
