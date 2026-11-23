/* Runtime DOM smoke test for browser-independent navigation and contextual focus. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const html = fs.readFileSync('dist/index.html', 'utf8');
const data = html.match(/<script id="atlas-data" type="application\/json">([\s\S]*?)<\/script>/);
assert(data, 'Atlas payload not present');
const source = fs.readFileSync('assets/site.js', 'utf8');

function render(search) {
  const app = {innerHTML: '', addEventListener(){}, querySelectorAll(){return [];}};
  const url = new URL('https://atlas.example/embodied-ai-atlas/' + search);
  const doc = {
    title: '',
    documentElement: {setAttribute(){}},
    getElementById(id) {
      if (id === 'atlas-data') return {textContent: data[1]};
      if (id === 'app') return app;
      return null;
    },
    addEventListener(){}
  };
  const sandbox = {
    document: doc,
    location: {search: url.search, hash: url.hash, origin: url.origin, pathname: url.pathname, href: url.href},
    window: {addEventListener(){}, scrollTo(){}},
    history: {pushState(){}},
    localStorage: {getItem(){return null}, setItem(){}},
    URL, URLSearchParams, encodeURIComponent, decodeURIComponent,
    requestAnimationFrame(){},
    console
  };
  vm.runInNewContext(source, sandbox, {filename: 'assets/site.js'});
  return app.innerHTML;
}
const home = render('?page=home');
assert(home.includes('The Embodied Intelligence Lifecycle'));
assert(home.includes('Robot Execution Loop'));
assert(home.includes('Data &amp; Learning'));
const stage = render('?view=stage&id=04');
assert(stage.includes('Five Second-Level Topics'));
assert(stage.includes('Data Recipe'));
const loop = render('?view=loop&id=learning');
assert(loop.includes('Deploy &amp; Learn'));
assert(loop.includes('Robot Learning Loop'));
const domain = render('?view=domain&id=data');
assert(domain.includes('具身数据工程'));
assert(domain.includes('Data Recipe'));
const context = render('?view=context&id=robot-integration');
assert(context.includes('Robot Systems &amp; Integration'));
const focused = render('?page=data-recipe&context=stage%3A06');
assert(focused.includes('Viewing from'));
assert(focused.includes('一个成熟的判断框架'));
assert(focused.includes('一个可理解的三阶段结构'), 'Context must not hide complete content');
const defaultArticle = render('?page=data-recipe');
assert(!defaultArticle.includes('Viewing from'));
assert(defaultArticle.includes('Data Recipe'));
const concept = render('?page=sensors-and-estimation');
assert(concept.includes('VIO'));
assert(concept.includes('id="section-1"'));
assert(concept.includes('Inertial Measurement Unit (IMU)'), 'Same-article dependencies must be visible');
assert(render('?page=model-architecture').includes('Compare with'), 'Same-article comparisons must be visible');
assert(render('?page=geometry-and-frames').includes('Forward Kinematics (FK)'));
assert(render('?view=stage&id=03').includes('Engineering Improvement Loop'));
assert(render('?view=stage&id=05').includes('Robot Learning Loop'));
console.log('Browser runtime smoke OK: homepage, stages, loops, domains, contexts, focus and canonical articles.');
