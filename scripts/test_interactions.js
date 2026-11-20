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
  const dom=new JSDOM(html,{url:'https://atlas.example/embodied-ai-atlas/'+path,runScripts:'dangerously',virtualConsole,beforeParse(w){
    let y=0;
    Object.defineProperty(w,'scrollY',{get:()=>y});
    w.scrollTo=(value,second)=>{y=typeof value==='object'?value.top:second;};
    w.requestAnimationFrame=callback=>callback();
    w.HTMLElement.prototype.scrollIntoView=function(){w.lastScrolled=this.id;};
    w.matchMedia=()=>({matches:!!options.narrow,addEventListener(){}});
    if(options.collapsed)w.localStorage.setItem('atlasSidebarCollapsed','true');
  }});
  const w=dom.window,d=w.document;
  assert.deepEqual(errors,[]);
  const click=selector=>{const node=d.querySelector(selector);assert(node,selector);node.click();};
  const key=(node,value,extra={})=>{const event=new w.KeyboardEvent('keydown',{key:value,bubbles:true,cancelable:true,...extra});node.dispatchEvent(event);return event;};
  const search=value=>{click('#open-search');const input=d.getElementById('search-input');input.value=value;input.dispatchEvent(new w.Event('input',{bubbles:true}));return input;};
  return {dom,w,d,click,key,search};
}

test('desktop sidebar hides, releases its column, persists and reopens',()=>{
  const {d,w,click}=boot();
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
