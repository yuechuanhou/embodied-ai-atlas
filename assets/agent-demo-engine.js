/* Deterministic interaction simulator. No model, network, storage or GitHub access. */
(() => {
  'use strict';
  const copy=value=>JSON.parse(JSON.stringify(value));
  const canonical=value=>JSON.stringify(sort(value));
  function sort(value){
    if(Array.isArray(value))return value.map(sort);
    if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(k=>[k,sort(value[k])]));
    return value;
  }
  async function digest(value){
    const bytes=new TextEncoder().encode(typeof value==='string'?value:canonical(value));
    return [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(b=>b.toString(16).padStart(2,'0')).join('');
  }
  const normalize=text=>text.normalize('NFKC').toLowerCase().replace(/\s+/g,' ').trim();
  const markdownText=text=>text.replace(/[<>&]/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;'}[c])).replace(/[\r\n]+/g,' ');
  function termsFor(text){
    const ignored=new Set(['如何','什么','一个','学习','了解','知识','一下','当前','网站','关于','介绍','这个','可以','帮我','我想','想学','没有']);
    const terms=(normalize(text).match(/[a-z][a-z0-9_-]{1,}|[\u3400-\u9fff]{2,}/g)||[]).flatMap(term=>
      /^[a-z]/.test(term)?[term]:Array.from({length:term.length-1},(_,i)=>term.slice(i,i+2)));
    return [...new Set(terms)].filter(t=>!ignored.has(t));
  }
  const has=(text,term)=>/^[a-z0-9_-]{2,3}$/.test(term)
    ? new RegExp('(^|[^a-z0-9])'+term+'($|[^a-z0-9])').test(text):text.includes(term);

  function create(data){
    const config=data.agent_preview;
    if(config?.mode!=='simulation')throw new Error('Demo payload required');
    const pages=Object.fromEntries(data.pages.map(p=>[p.id,p]));
    const state={messages:[],candidates:[],proposal:null,approval:null,job:null,busy:false,
      context:{type:'home'},stale:false,currentBase:config.base_commit,error:null,failNext:false};
    let request=0;
    const listeners=new Set();
    const notify=()=>listeners.forEach(fn=>fn());
    const wait=()=>Promise.resolve();

    function search(query){
      if(/^AtlasDemoConcept/i.test(query)||query==='演示一个站内尚未收录的概念')return [];
      const terms=termsFor(query);if(!terms.length)return [];
      const results=[];
      for(const page of data.pages){
        const text=normalize(page.search_text),title=normalize(page.title+' '+page.tags.join(' '));
        const score=terms.reduce((sum,t)=>sum+(has(title,t)?10:0)+(has(text,t)?1:0),0);
        if(score)results.push({article:page.id,title:page.title,score,anchor:null,topic_id:page.id,
          excerpt:excerpt(page,terms),action:{type:'open_topic',topic_id:page.id}});
        for(const heading of page.toc){
          const topic=data.topics.find(t=>t.article===page.id&&t.anchor===heading.id);
          const aliases=normalize([heading.title,topic?.title,...(topic?.aliases||[])].join(' '));
          const weight=terms.reduce((sum,t,i)=>sum+(has(aliases,t)?25+terms.length-i:0),0);
          if(weight)results.push({article:page.id,title:topic?.title||heading.title,anchor:heading.id,
            topic_id:topic?.id||null,score:weight+score,excerpt:excerpt(page,terms,heading.title),
            action:topic?{type:'open_topic',topic_id:topic.id}:{type:'open_article',article_id:page.id,anchor:heading.id}});
        }
      }
      const sorted=results.sort((a,b)=>b.score-a.score),seen=new Set();
      return sorted.filter(item=>{const key=item.article+':'+(item.anchor||'');if(seen.has(key))return false;seen.add(key);return true;}).slice(0,3);
    }
    function excerpt(page,terms,heading){
      const text=page.search_text.replace(/\s+/g,' '),lower=normalize(text);
      let index=heading?text.indexOf(heading):-1;
      if(index<0)index=terms.map(t=>lower.indexOf(t)).find(i=>i>=0)??0;
      const start=heading?Math.max(0,index):Math.max(0,text.lastIndexOf('。',index)+1);
      return text.slice(start,start+210).trim()+(text.length>start+210?'…':'');
    }

    async function buildProposal(candidate){
      const sources=config.source_files,manifest=JSON.parse(sources['content/manifest.json']);
      const files=[],intents=[],id='demo-agent-note-'+candidate.id;
      const add=(path,after)=>files.push({path,before_sha256:config.file_digests[path]||null,
        after_utf8:typeof after==='string'?after:JSON.stringify(after,null,2)+'\n'});
      const body='本节仅为 Agent 交互流程的模拟资料，不作为技术结论，也不会写入仓库。\n\n'+
        '演示问题：'+markdownText(candidate.question)+'\n\n'+
        '整理范围：问题背景、已有知识关联、需要核实的依据与适用条件。\n\n'+
        (candidate.followups.length?'后续补充：'+candidate.followups.map(markdownText).join('；')+'\n\n':'')+
        '来源：本次模拟会话；真实入库前仍需真实证据与 Owner 审阅。\n';
      if(candidate.article){
        const article=pages[candidate.article],heading='Agent 交互演示草稿 '+candidate.id;
        add('content/'+article.file,sources['content/'+article.file]+'\n## '+heading+'\n\n'+body);
        const topics=JSON.parse(sources['content/topics.json']);
        topics.topics.push({id,title:'Agent 交互演示草稿',article:article.id,heading});
        add('content/topics.json',topics);
        const anchors=JSON.parse(sources['content/anchors.json']);
        anchors.push({article:article.id,heading,id,aliases:[]});add('content/anchors.json',anchors);
        intents.push({kind:'add_section_topic',target_id:id,reason:'演示：优先复用当前文章的唯一归属'});
      }else{
        const domain=manifest.sections.find(s=>!s.auxiliary).id;
        const file=id+'.md';
        manifest.pages.push({id,file,title:'Agent 交互演示条目',section:domain,primary_domain:domain,
          summary:'仅用于验证交互与提案流程的模拟条目。',tags:['交互预览'],related:[],maturity:'演示草稿',kind:'knowledge'});
        add('content/'+file,'# Agent 交互演示条目\n\n'+body);add('content/manifest.json',manifest);
        intents.push({kind:'new_article',target_id:id,reason:'演示独立条目；真实归属待模型与来源核实'});
      }
      const proposal={schema_version:1,proposal_id:'demo-proposal-'+candidate.id,proposal_version:candidate.version,
        base_commit:state.currentBase,published_revision:config.base_commit,index_revision:config.base_commit,
        contract_digest:config.contract_digest,candidate_ids:['demo-candidate-'+candidate.id],
        summary:'交互模拟：'+candidate.question,intents,
        evidence:[{source_id:'demo-source-'+candidate.id,kind:'experience',reference:'交互流程模拟资料，不构成真实知识来源',
          checked_at:'2026-11-20T00:00:00Z',verification:'owner_experience',visibility:'private',supports:['此条目的用途仅为验证提案与确认流程']}],
        file_changes:files,publication:{visibility:'public',release_scope:'open_pr',review_note:'仅模拟确认；没有公共 PR 或真实发布'}};
      proposal.patch_digest=await digest(proposal);return proposal;
    }

    async function ask(question,selection=''){
      question=question.trim().slice(0,2000);if(!question||state.busy)return;
      const token=++request;state.busy=true;state.error=null;
      const context=copy(state.context);
      state.messages.push({role:'user',body:question,context,selection:selection.slice(0,1000)});notify();
      try{
        await wait();
        const continuing=/^(补充|继续|再|完善)/.test(question)&&state.candidates.length>0;
        const hits=continuing?[]:search(question);
        if(hits.length){
          state.messages.push({role:'assistant',body:'Atlas 中已有相关内容。可以先阅读下面的文章与章节，再继续追问。以下摘录来自站内原文。',citations:hits});
        }else{
          const key=normalize(question),existing=state.candidates.find(c=>c.key===key);
          let candidate=continuing?state.candidates.at(-1):existing;
          if(!candidate){
            candidate={id:String(state.candidates.length+1),key,question,followups:[],version:1,
              article:context.type==='article'?context.id:null};state.candidates.push(candidate);
          }else if(continuing){candidate.followups.push(question);candidate.version++;}
          const proposal=await buildProposal(candidate);
          if(token!==request)return;
          state.proposal=proposal;state.approval=null;state.job=null;
          state.messages.push({role:'assistant',body:continuing?'已把补充内容合并到同一份演示草稿，保留归属并更新版本。':
            '当前检索没有足够直接的命中。我已自动保留这个问题，并准备了一份模拟草稿，展示后续整理、归类与确认的方式。真实模型接入后，这里会继续讲解并核实来源。',citations:[],candidate_id:candidate.id});
        }
      }catch(error){state.error='演示整理未完成，请重新尝试。';}
      finally{if(token===request){state.busy=false;notify();}}
    }
    async function confirm(){
      if(!state.proposal||state.stale||state.busy)return;
      if(state.job?.proposal_digest===state.proposal.patch_digest)return state.job;
      state.approval=Object.freeze({proposal_version:state.proposal.proposal_version,patch_digest:state.proposal.patch_digest,
        base_commit:state.proposal.base_commit,contract_digest:state.proposal.contract_digest});
      state.job={id:'demo-job-'+state.proposal.proposal_id+'-v'+state.proposal.proposal_version,
        proposal_digest:state.proposal.patch_digest,status:'running',milestone:'approved'};notify();
      return runJob();
    }
    async function runJob(){
      const job=state.job,token=request;if(!job)return;
      job.status='running';state.error=null;notify();await wait();
      if(token!==request||state.stale){if(state.job===job)job.status='blocked';notify();return;}
      if(state.failNext){state.failNext=false;job.status='retryable';state.error='模拟检查失败。可恢复同一任务，不会创建第二份提案。';}
      else{job.milestone='pr_open';job.status='succeeded';}notify();return job;
    }
    async function retry(){
      if(state.stale||state.job?.status!=='retryable')return;
      return runJob();
    }
    async function simulateConflict(){
      state.stale=true;state.approval=null;if(state.job)state.job.status='blocked';
      state.currentBase=state.currentBase==='f'.repeat(40)?config.base_commit:'f'.repeat(40);notify();
    }
    async function revalidate(){
      if(state.busy||!state.proposal)return;
      state.busy=true;notify();const token=request;
      try{
        const candidate=state.candidates.find(c=>'demo-proposal-'+c.id===state.proposal.proposal_id);
        candidate.version++;const proposal=await buildProposal(candidate);
        if(token!==request)return;
        state.proposal=proposal;state.approval=null;state.job=null;state.stale=false;state.error=null;
      }finally{if(token===request){state.busy=false;notify();}}
    }
    return {state,search,ask,confirm,retry,simulateConflict,revalidate,subscribe(fn){listeners.add(fn);return()=>listeners.delete(fn);},
      setContext(context){state.context=copy(context);notify();},
      simulateFailure(){state.failNext=true;notify();},
      reset(){request++;Object.assign(state,{messages:[],candidates:[],proposal:null,approval:null,job:null,busy:false,error:null,stale:false,failNext:false,currentBase:config.base_commit});notify();}};
  }
  window.AtlasAgentDemo={create,canonical,digest};
})();
