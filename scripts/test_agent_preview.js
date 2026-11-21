'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {execFileSync}=require('node:child_process');
const {webcrypto}=require('node:crypto');
const {TextEncoder}=require('node:util');
const {JSDOM,VirtualConsole}=require('jsdom');
const html=fs.readFileSync('.preview/agent-demo/index.html','utf8');

function boot(path='?page=home',narrow=false){
  const errors=[],requests=[];
  const vc=new VirtualConsole();vc.on('jsdomError',error=>errors.push(error.message));
  const dom=new JSDOM(html,{url:'https://atlas.example/embodied-ai-atlas/'+path,runScripts:'dangerously',virtualConsole:vc,beforeParse(w){
    w.TextEncoder=TextEncoder;Object.defineProperty(w.crypto,'subtle',{value:webcrypto.subtle});
    w.scrollTo=()=>{};w.requestAnimationFrame=fn=>fn();
    w.HTMLElement.prototype.scrollIntoView=function(){w.lastScrolled=this.id;};
    w.matchMedia=()=>({matches:narrow,addEventListener(){}});
    w.fetch=(...args)=>{requests.push(args);throw new Error('Demo must never call a service');};
  }});
  const w=dom.window,d=w.document,engine=w.atlasAgentPreview;
  assert(engine);assert.deepEqual(errors,[]);
  const click=selector=>{const node=d.querySelector(selector);assert(node,selector);node.click();};
  const key=(node,value,extra={})=>node.dispatchEvent(new w.KeyboardEvent('keydown',{key:value,bubbles:true,cancelable:true,...extra}));
  async function settle(){
    for(let i=0;engine.state.busy&&i<200;i++)await new Promise(resolve=>setTimeout(resolve,5));
    assert.equal(engine.state.busy,false);
    assert.deepEqual(errors,[]);
  }
  async function ask(value){
    const input=d.getElementById('agent-input');input.value=value;input.focus();key(input,'Enter');await settle();
  }
  return {dom,w,d,engine,click,key,ask,settle,requests,errors};
}

test('normal production build excludes the Agent demo and embedded draft sources',()=>{
  const production=fs.readFileSync('dist/index.html','utf8');
  const payload=JSON.parse(production.match(/<script id="atlas-data" type="application\/json">([\s\S]*?)<\/script>/)[1]);
  assert(!payload.agent_preview);
  assert(!production.includes('source_files'));
  assert(!production.includes('agent-launch'));
  assert(!production.includes('AtlasDemoConcept'));
});

test('real topic retrieval navigates to its canonical section without losing chat',async()=>{
  const t=boot();t.click('#agent-launch');await t.ask('VIO 如何结合 IMU？');
  assert(t.engine.state.messages.at(-1).citations.some(c=>c.topic_id==='vio'));
  const citation=t.engine.state.messages.at(-1).citations.findIndex(c=>c.topic_id==='vio');
  t.click('[data-agent-citation="1:'+citation+'"]');
  assert.equal(new URLSearchParams(t.w.location.search).get('page'),'sensors-and-estimation');
  assert(t.w.location.hash.includes('vio'));
  assert.equal(t.engine.state.messages.length,2);
  assert.equal(t.engine.state.context.id,'sensors-and-estimation');
  assert.equal(t.engine.state.context.topic_id,'vio');
  assert.equal(t.engine.state.candidates.length,0,'Known content is not duplicated');
  const paragraph=t.d.querySelector('.content-body p'),range=t.d.createRange();
  range.selectNodeContents(paragraph);t.w.getSelection().removeAllRanges();t.w.getSelection().addRange(range);
  t.d.dispatchEvent(new t.w.Event('selectionchange'));
  assert.equal(t.engine.state.messages[0].selection,'','Selection is never attached implicitly');
  t.click('#agent-selection');await t.ask('VIO');
  assert(t.engine.state.messages[2].selection.includes(paragraph.textContent.trim()));
  t.dom.window.close();
});

test('all unregistered TOC headings and full text participate in retrieval',()=>{
  const t=boot();
  const data=JSON.parse(t.d.getElementById('atlas-data').textContent);
  const registered=new Set(data.topics.filter(x=>x.anchor).map(x=>x.article+':'+x.anchor));
  const page=data.pages.find(p=>p.toc.some(h=>!registered.has(p.id+':'+h.id)&&/[a-z]{4,}/i.test(h.title)));
  const heading=page.toc.find(h=>!registered.has(page.id+':'+h.id)&&/[a-z]{4,}/i.test(h.title));
  assert(t.engine.search(heading.title).some(hit=>hit.article===page.id&&hit.anchor===heading.id));
  t.dom.window.close();
});

test('unknown question automatically creates one draft; followups revise the same proposal',async()=>{
  const t=boot('?page=data-recipe&context=stage%3A04');t.click('#agent-launch');
  t.d.getElementById('agent-input').value='中文输入法还在组合';
  t.key(t.d.getElementById('agent-input'),'Enter',{isComposing:true});
  assert.equal(t.engine.state.messages.length,0,'IME confirmation must not submit a message');
  await t.ask('AtlasDemoConcept：一个新概念');
  assert.equal(t.engine.state.candidates.length,1);
  const first=t.engine.state.proposal;
  assert.equal(first.intents[0].kind,'add_section_topic');
  assert(t.d.getElementById('agent-review-open'));
  await t.ask('补充一个工程例子');
  assert.equal(t.engine.state.candidates.length,1);
  assert.equal(t.engine.state.proposal.proposal_id,first.proposal_id);
  assert.equal(t.engine.state.proposal.proposal_version,2);
  assert.notEqual(t.engine.state.proposal.patch_digest,first.patch_digest);
  assert(t.engine.state.proposal.file_changes[0].after_utf8.includes('补充一个工程例子'));
  t.click('#agent-review-open');
  assert(t.d.getElementById('agent-panel').classList.contains('agent-expanded'));
  assert(t.d.querySelector('.agent-diff').textContent.includes('Agent 交互演示草稿'));
  t.dom.window.close();
});

test('demo proposals match Python schema/digest/semantic gates for both placement paths',async()=>{
  for(const path of ['?page=home','?page=data-recipe']){
    const t=boot(path);await t.engine.ask('AtlasDemoConcept：测试');
    const script='import json,sys; from pathlib import Path; from agent.change_validation import validate_change_set; p=json.load(sys.stdin); print(json.dumps(validate_change_set(p,root=Path.cwd(),current_head=p["base_commit"])))';
    const result=JSON.parse(execFileSync('python',['-c',script],{input:JSON.stringify(t.engine.state.proposal),encoding:'utf8'}));
    assert(result.articles>=26);assert(result.topics>=41);t.dom.window.close();
  }
});

test('stale base invalidates confirmation and a refreshed proposal needs new approval',async()=>{
  const t=boot();t.click('#agent-launch');await t.ask('AtlasDemoConcept：版本测试');t.click('#agent-review-open');
  const version=t.engine.state.proposal.proposal_version;
  await t.engine.simulateConflict();
  assert.equal(t.d.getElementById('agent-confirm'),null);
  await t.engine.confirm();assert.equal(t.engine.state.approval,null);
  await t.engine.revalidate();
  assert.equal(t.engine.state.proposal.proposal_version,version+1);
  assert.equal(t.engine.state.approval,null);
  assert(t.d.getElementById('agent-confirm'));t.dom.window.close();
});

test('failed mock execution resumes the same idempotent job, with no real PR or request',async()=>{
  const t=boot();await t.engine.ask('AtlasDemoConcept：恢复测试');
  t.engine.simulateFailure();await t.engine.confirm();
  assert.equal(t.engine.state.job.status,'retryable');const id=t.engine.state.job.id;
  await t.engine.retry();assert.equal(t.engine.state.job.id,id);assert.equal(t.engine.state.job.status,'succeeded');
  await t.engine.confirm();assert.equal(t.engine.state.job.id,id);
  assert.equal(t.requests.length,0);assert(!t.d.querySelector('.agent-job a'));
  assert(!Object.values(t.w.localStorage).some(value=>String(value).includes('恢复测试')));
  t.dom.window.close();
});

test('mobile panel traps focus, returns focus, and retains chat after citation navigation',async()=>{
  const t=boot('?page=home',true);t.click('#agent-launch');
  assert(t.d.getElementById('app').hasAttribute('inert'));
  assert.equal(t.d.getElementById('agent-panel').getAttribute('aria-modal'),'true');
  const first=t.d.getElementById('agent-expand');first.focus();t.key(first,'Tab',{shiftKey:true});
  assert(t.d.getElementById('agent-panel').contains(t.d.activeElement));
  t.key(t.d.activeElement,'Escape');assert(t.d.getElementById('agent-panel').hidden);
  assert.equal(t.d.activeElement.id,'agent-launch');
  t.click('#agent-launch');await t.ask('VIO');t.click('[data-agent-citation="1:0"]');
  assert(t.d.getElementById('agent-panel').hidden);
  assert(!t.d.getElementById('app').hasAttribute('inert'));
  t.click('#agent-launch');assert.equal(t.engine.state.messages.length,2);t.dom.window.close();
});

test('mobile review can return to conversation; clearing destroys only preview memory',async()=>{
  const t=boot('?page=home',true);t.click('#agent-launch');await t.ask('AtlasDemoConcept：移动审阅');t.click('#agent-review-open');
  assert(t.d.getElementById('agent-chat').hidden);assert(!t.d.getElementById('agent-review').hidden);
  t.click('[data-agent-back]');assert(!t.d.getElementById('agent-chat').hidden);
  t.click('#agent-reset');assert.equal(t.engine.state.messages.length,0);assert.equal(t.engine.state.proposal,null);
  assert.equal(t.d.querySelector('.content-body'),null,'Homepage remains usable');t.dom.window.close();
});

test('untrusted input is text, typed navigation rejects arbitrary URLs, and search stays accessible',async()=>{
  const t=boot();t.click('#agent-launch');await t.ask('AtlasDemoConcept <img src=x onerror=alert(1)>');
  assert(!t.d.querySelector('#agent-messages img'));assert(t.d.getElementById('agent-messages').textContent.includes('<img'));
  const before=t.w.location.href;
  t.d.dispatchEvent(new t.w.CustomEvent('atlas:agent-navigate',{detail:{type:'open_article',article_id:'absent',url:'javascript:alert(1)'}}));
  assert.equal(t.w.location.href,before);
  t.click('#agent-close');t.click('#open-search');t.w.dispatchEvent(new t.w.Event('resize'));
  assert(t.d.getElementById('app').hasAttribute('inert'),'Agent resize cannot undo search modality');
  t.click('#close-search');assert(!t.d.getElementById('app').hasAttribute('inert'));t.dom.window.close();
});
