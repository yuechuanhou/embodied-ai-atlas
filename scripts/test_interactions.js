'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {JSDOM,VirtualConsole}=require('jsdom');
const html=fs.readFileSync('dist/index.html','utf8');

function boot(path='?page=home',options={}){
  const errors=[];
  const virtualConsole=new VirtualConsole();
  virtualConsole.on('jsdomError',error=>errors.push(error.message));
  const dom=new JSDOM(html,{url:(options.file?'file:///tmp/atlas.html':'https://atlas.example/embodied-ai-atlas/')+path,runScripts:'dangerously',virtualConsole,beforeParse(w){
    let y=0;
    Object.defineProperty(w,'scrollY',{get:()=>y});
    w.scrollTo=(value,second)=>{y=typeof value==='object'?value.top:second;};
    w.requestAnimationFrame=callback=>callback();
    w.HTMLElement.prototype.scrollIntoView=function(){w.lastScrolled=this.id;};
    w.matchMedia=()=>({matches:!!options.narrow,addEventListener(){}});
    if(options.collapsed!==undefined)w.localStorage.setItem('atlasSidebarCollapsed',String(options.collapsed));
  }});
  const w=dom.window,d=w.document;
  assert.deepEqual(errors,[]);
  const click=selector=>{const node=d.querySelector(selector);assert(node,selector);node.click();};
  const key=(node,value,extra={})=>{const event=new w.KeyboardEvent('keydown',{key:value,bubbles:true,cancelable:true,...extra});node.dispatchEvent(event);return event;};
  const search=value=>{click('#open-search');const input=d.getElementById('search-input');input.value=value;input.dispatchEvent(new w.Event('input',{bubbles:true}));return input;};
  return {dom,w,d,click,key,search};
}

test('desktop sidebar hides, releases its column, persists and reopens',()=>{
  assert(boot().d.getElementById('sidebar').hidden,'First visit starts with navigation tucked away');
  const {d,w,click}=boot('?page=home',{collapsed:false});
  assert.equal(d.getElementById('sidebar').hidden,false);
  click('#nav-toggle');
  assert(d.getElementById('sidebar').hidden);
  assert(d.querySelector('.app-shell').classList.contains('sidebar-collapsed'));
  assert.equal(w.localStorage.getItem('atlasSidebarCollapsed'),'true');
  assert.equal(d.getElementById('nav-toggle').getAttribute('aria-expanded'),'false');
  click('#nav-toggle');assert.equal(d.getElementById('sidebar').hidden,false);
  const persisted=boot('?page=home',{collapsed:true});
  assert(persisted.d.getElementById('sidebar').hidden);
});

test('mobile drawer supports Escape, scrim, focus return and collapsed default',()=>{
  const {d,click,key}=boot('?page=home',{narrow:true});
  assert(d.getElementById('sidebar').hidden);
  click('#nav-toggle');
  assert.equal(d.getElementById('nav-toggle').getAttribute('aria-expanded'),'true');
  assert(d.querySelector('.workspace').hasAttribute('inert'));
  key(d.activeElement,'Escape');
  assert(d.getElementById('sidebar').hidden);
  assert.equal(d.activeElement.id,'nav-toggle');
  click('#nav-toggle');click('#sidebar-scrim');assert(d.getElementById('sidebar').hidden);
});

test('search traps focus, closes on button Enter and restores opener',()=>{
  const {d,w,key,search}=boot();
  const input=search('VIO');
  const trapped=key(input,'Tab',{shiftKey:true});
  assert(trapped.defaultPrevented);
  assert(d.activeElement.closest('#search-overlay'));
  assert(d.getElementById('app').hasAttribute('inert'));
  const before=w.location.href,close=d.getElementById('close-search');close.focus();
  const enter=key(close,'Enter');
  assert.equal(enter.defaultPrevented,false,'Close button Enter must not open a result');
  close.click();
  assert.equal(w.location.href,before);
  assert.equal(d.getElementById('search-overlay'),null);
  assert.equal(d.activeElement.id,'open-search');
});

test('search lists multiple Topics from one article and Chinese heading aliases',()=>{
  const {d,key,search}=boot();
  const input=search('FK IK');
  const links=[...d.querySelectorAll('#search-results a')];
  assert(links.some(x=>x.textContent.includes('Forward Kinematics')));
  assert(links.some(x=>x.textContent.includes('Inverse Kinematics')));
  input.value='逆运动学';input.dispatchEvent(new d.defaultView.Event('input',{bubbles:true}));
  assert(d.querySelector('#search-results a').textContent.includes('Inverse Kinematics'));
  input.value='no-match-zzzzzz';input.dispatchEvent(new d.defaultView.Event('input',{bubbles:true}));
  key(input,'ArrowDown');key(input,'Enter');assert(d.getElementById('search-overlay'));
  key(input,'Escape');assert.equal(d.getElementById('search-overlay'),null);
});

test('Enter on the search input opens the selected Topic and closes the modal',()=>{
  const {d,w,key,search}=boot();
  const input=search('VIO');key(input,'Enter');
  assert.equal(w.location.search,'?page=sensors-and-estimation');
  assert.equal(w.location.hash,'#vio-visual-inertial-odometry');
  assert(d.querySelector('h2.reading-focus'));
  assert.equal(d.getElementById('search-overlay'),null);
});

test('context reading retains full article, canonical breadcrumb and heading emphasis',()=>{
  const {d}=boot('?page=data-recipe&context=stage%3A06');
  assert(d.querySelector('.breadcrumbs a[href="?view=domain&id=data"]'));
  assert(d.querySelector('.context-focus [data-return-source]'));
  assert(d.querySelector('.reading-focus').textContent.includes('一个成熟的判断框架'));
  assert(d.getElementById('一个可理解的三阶段结构'));
  assert(d.querySelector('.inline-toc summary'));
  assert.equal(d.querySelector('.article-pager'),null);
});

test('return to source restores its prior position',()=>{
  const {w,d,click}=boot('?view=stage&id=06');
  w.scrollTo({top:847});click('a[href="?page=data-recipe&context=stage%3A06"]');
  assert.equal(w.scrollY,0);
  click('.context-actions [data-return-source]');
  assert.equal(w.location.search,'?view=stage&id=06');assert.equal(w.scrollY,847);
  assert(d.querySelector('[aria-current="page"]'));
});

test('browser Back restores the previous view and scroll position',async()=>{
  const {w,click}=boot('?view=stage&id=06');
  w.scrollTo({top:503});click('a[href="?page=data-recipe&context=stage%3A06"]');
  await new Promise(resolve=>{w.addEventListener('popstate',()=>setTimeout(resolve,0),{once:true});w.history.back();});
  assert.equal(w.location.search,'?view=stage&id=06');assert.equal(w.scrollY,503);
});

test('same-article typed relations contain links to both endpoints',()=>{
  const {d}=boot('?page=geometry-and-frames');
  const relation=[...d.querySelectorAll('.relation-chip')].find(x=>x.textContent.includes('Inverse Kinematics')&&x.textContent.includes('Forward Kinematics'));
  assert(relation);assert.equal(relation.querySelectorAll('a').length,2);
  assert([...relation.querySelectorAll('a')].every(x=>x.hash));
});

test('home domain shortcut goes to all nine Domains',()=>{
  const {d,w,click}=boot();
  click('.hero-actions a[href="#domains"]');
  assert.equal(w.location.hash,'#domains');assert.equal(w.lastScrolled,'domains');
  assert.equal(d.querySelectorAll('#domains .domain-card').length,9);
});

test('all Loop overview links have real local targets',()=>{
  for(const id of ['execution','learning','engineering']){
    const {d}=boot('?view=loop&id='+id);
    const links=[...d.querySelectorAll('.loop-overview a')];assert.equal(links.length,5);
    for(const link of links)assert(d.getElementById(decodeURIComponent(link.hash.slice(1))),link.href);
  }
});

test('Stage Topic entries use the chosen section rather than the general Stage focus',()=>{
  const {d,click}=boot('?view=stage&id=03');
  click('.knowledge-rows a[href*="%E7%9B%B8%E6%9C%BA"]');
  assert(d.querySelector('.reading-focus').textContent.includes('相机内参和外参'));
  assert(d.querySelector('.context-focus').textContent.includes('当前阅读章节：相机内参和外参'));
  assert(d.getElementById('vio-visual-inertial-odometry'),'Complete article remains available');
});

test('short Latin abbreviations do not match inside unrelated words',()=>{
  const {d,search}=boot();search('VIO');
  assert.equal(d.querySelector('#search-results a[href="?page=company-pi"]'),null,'Behavior must not match VIO');
});

test('light and dark text colors retain 4.5:1 contrast on both reading surfaces',()=>{
  const css=fs.readFileSync('assets/site.css','utf8');
  const luminance=hex=>{
    const rgb=[0,2,4].map(i=>parseInt(hex.slice(i,i+2),16)/255).map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4);
    return rgb.reduce((sum,x,i)=>sum+x*[.2126,.7152,.0722][i],0);
  };
  for(const block of css.split('}').slice(0,2)){
    const colors=Object.fromEntries([...block.matchAll(/--([a-z-]+):#([0-9a-f]{6})/g)].map(m=>[m[1],m[2]]));
    for(const text of ['ink','muted','faint','accent'])for(const surface of ['bg','paper']){
      const a=luminance(colors[text]),b=luminance(colors[surface]);
      assert((Math.max(a,b)+.05)/(Math.min(a,b)+.05)>=4.5,text+' on '+surface);
    }
  }
});

test('offline file links retain native navigation and theme toggles without storage',()=>{
  const {d,w,click}=boot('?page=home',{file:true});
  const link=d.querySelector('[data-stage="03"]');let intercepted;
  d.addEventListener('click',event=>{intercepted=event.defaultPrevented;event.preventDefault();},{once:true});
  link.dispatchEvent(new w.MouseEvent('click',{bubbles:true,cancelable:true,button:0}));
  assert.equal(intercepted,false,'File links must bypass restricted History API');
  assert.equal(link.search,'?view=stage&id=03');
  click('#theme-button');assert.equal(d.documentElement.getAttribute('data-theme'),'dark');
  click('#theme-button');assert.equal(d.documentElement.getAttribute('data-theme'),'light');
});

test('minimal map groups feedback targets 01–05 and retains all six Stage links',()=>{
  const {d}=boot();
  assert.deepEqual([...d.querySelectorAll('#feedback-stages [data-stage]')].map(x=>x.dataset.stage),['01','02','03','04','05']);
  assert.equal(d.querySelectorAll('.lifecycle-map [data-stage]').length,6);
  assert.equal(d.querySelector('[data-stage="06"]').closest('#feedback-stages'),null);
  assert(d.getElementById('feedback-caption').textContent.includes('01–05'));
  assert.equal(d.querySelector('[data-stage="03"]').search,'?view=stage&id=03');
});

test('transparent shared brand mark changes to light Tiffany in dark reading mode',()=>{
  const {d,w,click}=boot('?page=home',{collapsed:false});
  const mark=()=>d.querySelector('svg.brand-glyph');
  assert.equal(mark().querySelector('use').getAttribute('href'),'#atlas-brand-mark');
  assert(d.getElementById('atlas-brand-mark'));
  assert.equal(d.querySelector('.brand-dot'),null);
  assert.equal(w.getComputedStyle(mark()).backgroundColor,'rgba(0, 0, 0, 0)');
  assert.equal(w.getComputedStyle(mark()).color,'rgb(8, 120, 126)');
  click('#theme-button');
  assert.equal(w.getComputedStyle(mark()).color,'rgb(157, 225, 217)');
  assert.equal(w.getComputedStyle(mark()).backgroundColor,'rgba(0, 0, 0, 0)');
  click('#theme-button');
  assert.equal(w.getComputedStyle(mark()).color,'rgb(8, 120, 126)');
});
