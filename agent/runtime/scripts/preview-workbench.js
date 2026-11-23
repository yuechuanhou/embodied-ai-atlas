// Development-only fixture: synthetic conversations and local mock APIs, no model calls.
import {cp, mkdir, readFile, writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {harness, ROOT} from '../test/helpers.js';
import {candidateView} from '../src/session-view.js';

const h = await harness();
try {
  const html = (await h.request('/')).data;
  const article = h.world.snapshot.articles.find(a => a.id === 'sensors-and-estimation');
  const fixture = {
    revision: h.world.snapshot.revision,
    domains: h.world.snapshot.domains.filter(d => !d.auxiliary).map(d => ({id:d.id,title:d.name || d.title || d.id})),
    articles: h.world.snapshot.articles.map(a => ({id:a.id,title:a.title,primary_domain:a.primary_domain})),
    session: {id: '11111111-1111-4111-8111-111111111111', title: 'VIO 与传感器时间同步', pinned: true, created_at: 1795309200, updated_at: 1795309200},
    messages: [
      {id: 'example:user', role: 'user', body: '帮我找到关于 VIO 的已有知识，并整理值得继续探索的问题。', citations_json: '[]'},
      {id: 'example:assistant', role: 'assistant', body: '可以从 **《传感器、相机与状态估计》** 中的 VIO 章节开始，再结合 IMU 与相机标定相关知识一起阅读。\n\n### 建议的探索路径\n\n1. **理解输入与输出**：先建立系统整体认识。\n2. **连接相关概念**：回到文章中的 IMU、相机与状态估计。\n3. **保留新的问题**：将值得深入的理解整理为私人候选。\n\n> 这是一份界面演示。候选保留在私人工作台，经过核验后再决定如何入库。', citations_json: JSON.stringify([{title: article.title, url: 'https://www.yuechuanhou.com/embodied-ai-atlas/?page=' + article.id, revision: h.world.snapshot.revision}])},
    ],
    candidates: [candidateView({id: '44444444-4444-4444-8444-444444444444', session_id: '11111111-1111-4111-8111-111111111111', status: 'researching', title: '传感器时间同步 · 待探索的问题', version: 1, evidence_status: 'insufficient', source_revision: h.world.snapshot.revision,
      placement_json: JSON.stringify({article_id: article.id, primary_domain: article.primary_domain}),
      draft_markdown: '### 待核验与补充\n\n- 梳理时间戳与传感器时间同步的概念。\n- 关联已有 VIO 章节，避免重复归档。\n- 确认来源后，再决定补充到哪个 Topic。\n\n**当前状态**：私人候选，尚未发布。'}, h.world.snapshot)],
  };
  function mock(f) {
    const clone = value => JSON.parse(JSON.stringify(value));
    let sessions = [clone(f.session),
      {...clone(f.session), id: '22222222-2222-4222-8222-222222222222', title: '相机标定与坐标系', pinned: false, updated_at: f.session.updated_at - 60},
      {...clone(f.session), id: '33333333-3333-4333-8333-333333333333', title: '模型训练的数据闭环', pinned: false, updated_at: f.session.updated_at - 120}];
    const store = Object.fromEntries(sessions.map(session => [session.id, {session, messages: session.id === f.session.id ? clone(f.messages) : [], candidates: session.id === f.session.id ? clone(f.candidates) : []}])), requests = {};
    window.fetch = async (path, init = {}) => {
      const method = init.method || 'GET', body = init.body ? JSON.parse(init.body) : {}, id = path.split('/')[3]; let value = {};
      if (path === '/api/status') value = {sync: {index_revision: f.revision, published_revision: f.revision, repo_head: f.revision, stale: false}, model: {ready: true}};
      else if (path.startsWith('/api/sessions?')) value = {sessions: [...sessions].sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updated_at - a.updated_at || a.id.localeCompare(b.id)), next_offset: null};
      else if (path === '/api/sessions' && method === 'POST') {value = {id: crypto.randomUUID()}; const session = {...f.session, ...value, title: '新对话', pinned: false}; sessions.unshift(session); store[value.id] = {session, messages: [], candidates: []};}
      else if (path === '/api/sync') value = {};
      else if (path.startsWith('/api/candidates/')) {
        const candidateId = path.split('/')[3], c = Object.values(store).flatMap(s => s.candidates).find(c => c.id === candidateId);
        if (path.includes('/export?')) return new Response('# ' + c.title + '\n\n> 私人界面演示，未发布\n\n' + c.draft_markdown,{headers:{'Content-Type':'text/markdown'}});
        if (method === 'PATCH') {
          if (body.status === 'ready' && (!body.primary_domain || !body.evidence?.owner_confirmed)) return new Response(JSON.stringify({error:'candidate_evidence_required'}),{status:400,headers:{'Content-Type':'application/json'}});
          const placement = {...JSON.parse(c.placement_json),article_id:body.article_id,primary_domain:body.primary_domain,owner_edited:true};
          Object.assign(c,{title:body.title,draft_markdown:body.draft_markdown,status:body.status,version:c.version+1,placement_json:JSON.stringify(placement),
            evidence_status:body.evidence ? body.evidence.kind==='experience' ? 'owner_experience' : 'checked' : 'insufficient'});
          const article = f.articles.find(a => a.id===body.article_id), domain=f.domains.find(d => d.id===body.primary_domain);
          c.placement_view={...c.placement_view,owner_edited:true,review_is_current:!!body.evidence,domain:domain || null,
            article:article ? {...article,url:'https://www.yuechuanhou.com/embodied-ai-atlas/?page='+article.id} : null};
        }
        if (method==='PATCH') c.fixture_evidence=body.evidence ? {kind:body.evidence.kind,reference:body.evidence.reference,metadata:{supports:body.evidence.supports}} : null;
        value={candidate:clone(c),evidence:c.fixture_evidence || null,snapshot_revision:f.revision,domains:f.domains,articles:f.articles};
      }
      else if (path.endsWith('/messages') && method === 'POST') {
        const data = store[id]; data.messages.push({id: body.request_id + ':user', role: 'user', body: body.message, citations_json: '[]'});
        if (data.session.title === '新对话') data.session.title = body.message.slice(0, 30);
        requests[id] = [{id: body.request_id, status: 'processing'}];
        await new Promise(r => setTimeout(r, 6500));
        data.messages.push({...clone(f.messages[1]), id: body.request_id + ':assistant', body: '**已收到你的问题。**\n\n这是本地界面预览，演示发送反馈与双环流星动画。没有调用真实模型。\n\n- 提问已立即出现在对话里。\n- 输入框可以继续撰写下一条问题。\n- 回答结束后，动画会自动收起。'});
        data.candidates = clone(f.candidates); requests[id] = [{id: body.request_id, status: 'completed'}];
      } else if (method === 'PATCH') {Object.assign(store[id].session, body, {updated_at: Math.floor(Date.now()/1000)}); value = {id, ...body, pinned: store[id].session.pinned === true};}
      else if (method === 'DELETE') {delete store[id]; sessions = sessions.filter(s => s.id !== id);}
      else value = {...clone(store[id]), requests: requests[id] || []};
      return new Response(JSON.stringify(value), {status: 200, headers: {'Content-Type': 'application/json'}});
    };
  }
  const script = '<script>(' + mock.toString() + ')(' + JSON.stringify(fixture).replace(/</g, '\\u003c') + ');</script>';
  const folder = fileURLToPath(new URL('../../../.preview/workbench-ui/', import.meta.url));
  const previewOrigin = 'http://127.0.0.1:4173';
  // Local synthetic fixtures only: production still uses separate fixed origins.
  // Relocate the public reader so visual QA never needs an Owner login or a model.
  await mkdir(folder + 'embodied-ai-atlas/', {recursive: true});
  await cp(ROOT + 'dist/', folder + 'embodied-ai-atlas/', {recursive:true});
  const publicHTML = (await readFile(ROOT + 'dist/index.html', 'utf8')).replace(/(<script id="atlas-data" type="application\/json">)([\s\S]*?)(<\/script>)/,
    (_, start, data, end) => start + JSON.stringify({...JSON.parse(data), private_agent_origin:previewOrigin}) + end);
  await writeFile(folder + 'embodied-ai-atlas/index.html', publicHTML);
  await writeFile(folder + 'index.html', html.replace('<script nonce=', () => script + '<script nonce=').replaceAll('https://www.yuechuanhou.com/embodied-ai-atlas/', previewOrigin + '/embodied-ai-atlas/'));
  await mkdir(ROOT + '.openai', {recursive: true});
  await writeFile(ROOT + '.openai/hosting.json', JSON.stringify({static: {directory: '.preview/workbench-ui'}}));
  console.log('Synthetic workbench preview built; all API calls are local fixtures.');
} finally {await h.dispose();}
