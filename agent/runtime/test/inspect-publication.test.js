import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {inspectPublication} from '../scripts/inspect-publication.js';
import {REPOSITORY, SITE} from '../src/knowledge.js';
import {sha256} from '../src/common.js';

const api = 'https://api.github.com/repos/' + REPOSITORY;
async function harness(change = () => {}) {
  const template = JSON.parse(await readFile(new URL('../../operations/main-ruleset.json', import.meta.url), 'utf8'));
  const snapshot = {schema_version: 1, revision: 'a'.repeat(40), contract_digest: 'b'.repeat(64),
    articles: [{id: 'test', title: 'Test', primary_domain: 'foundation', markdown: 'Synthetic public text.', text: 'Synthetic public text.',
      sections: [], content_digest: await sha256('Synthetic public text.')}],
    topics: [{id: 'test', article: 'test'}], domains: [{id: 'foundation'}], architecture: {}};
  const body = JSON.stringify(snapshot), digest = await sha256(body);
  const manifest = {schema_version: 1, revision: snapshot.revision, contract_digest: snapshot.contract_digest,
    index_sha256: digest, index_path: 'knowledge-index.' + digest + '.json', articles: 1, topics: 1};
  const responses = new Map([[api + '/rules/branches/main?per_page=100', JSON.stringify(template.rules)],
    [api + '/branches/main', JSON.stringify({commit: {sha: snapshot.revision}})],
    [SITE + 'knowledge-manifest.json', JSON.stringify(manifest)], [SITE + manifest.index_path, body]]);
  const calls = [];
  return {calls, responses, manifest, options: {fetchImpl: async (url, init) => {
    calls.push({url, init}); assert.equal(init.method, 'GET'); assert.equal(init.redirect, 'error');
    assert(!Object.keys(init.headers).some(name => name.toLowerCase() === 'authorization'));
    assert.equal(init.body, undefined); assert(responses.has(url));
    return change(url, responses, calls) || new Response(responses.get(url));
  }}};
}

test('publication readiness reads actual main rules and the current public index without any credentials or writes', async () => {
  const h = await harness(), result = await inspectPublication(h.options);
  assert.equal(h.calls.length, 6); assert.equal(result.status, 'publication_read_checks_passed');
  assert.equal(result.mutations, false); assert.equal(result.required_checks, 'present');
  assert.equal(result.main_and_public_index, 'consistent'); assert.equal(result.articles, 1);
  for (const key of ['bypass_configuration', 'publisher_identity', 'worker_revision']) assert.equal(result[key], 'not_inspected');
  assert(!JSON.stringify(result).includes('Synthetic public text'));
});

test('missing, wrong-source or non-strict required checks and missing PR protection fail before reading the site', async () => {
  const mutations = [
    rules => rules.filter(r => r.type !== 'pull_request'),
    rules => rules.filter(r => r.type !== 'non_fast_forward'),
    rules => rules.map(r => r.type === 'required_status_checks' ? {...r, parameters: {...r.parameters, strict_required_status_checks_policy: false}} : r),
    rules => rules.map(r => r.type === 'required_status_checks' ? {...r, parameters: {...r.parameters,
      required_status_checks: r.parameters.required_status_checks.slice(0, 2)}} : r),
    rules => rules.map(r => r.type === 'required_status_checks' ? {...r, parameters: {...r.parameters,
      required_status_checks: r.parameters.required_status_checks.map(c => ({...c, integration_id: null}))}} : r),
  ];
  for (const mutate of mutations) {
    const h = await harness(), url = api + '/rules/branches/main?per_page=100';
    h.responses.set(url, JSON.stringify(mutate(JSON.parse(h.responses.get(url)))));
    await assert.rejects(inspectPublication(h.options), /publication_main_rules_incomplete|publication_required_checks_incomplete/);
    assert.equal(h.calls.length, 1);
  }
});

test('stale or tampered public knowledge and a rollout during inspection cannot pass', async () => {
  for (const kind of ['stale', 'digest', 'rollout', 'main_changed', 'count', 'article']) {
    const h = await harness((url, responses, calls) => {
      if (kind === 'rollout' && url.endsWith('knowledge-manifest.json') && calls.length > 4) return new Response('{}');
      if (kind === 'main_changed' && url.endsWith('/branches/main') && calls.length > 4) return Response.json({commit: {sha: 'c'.repeat(40)}});
    });
    if (kind === 'stale') h.responses.set(api + '/branches/main', JSON.stringify({commit: {sha: 'c'.repeat(40)}}));
    if (kind === 'digest') h.responses.set(SITE + h.manifest.index_path, '{}');
    if (['count','article'].includes(kind)) {
      const snapshot = JSON.parse(h.responses.get(SITE + h.manifest.index_path));
      if (kind === 'count') snapshot.topics = [];
      else snapshot.articles[0].markdown = 'Changed';
      const body = JSON.stringify(snapshot), digest = await sha256(body), manifest = {...h.manifest, index_sha256: digest, index_path: 'knowledge-index.' + digest + '.json'};
      h.responses.set(SITE + 'knowledge-manifest.json', JSON.stringify(manifest)); h.responses.set(SITE + manifest.index_path, body);
    }
    await assert.rejects(inspectPublication(h.options), /publication_snapshot_not_current|publication_snapshot_digest_mismatch|publication_baseline_changed|publication_snapshot_invalid|publication_article_digest_mismatch/);
  }
});

test('public inspection rejects incomplete pagination, redirects, oversized metadata and provider details without retry', async () => {
  for (const response of [new Response('private provider text', {status: 403}), new Response('x'.repeat(1000001)),
    new Response('[]', {headers: {link: '<https://api.github.com/next>; rel="next"'}}), new Response('not JSON')]) {
    let calls = 0;
    await assert.rejects(inspectPublication({fetchImpl: async () => {calls++; return response;}}),
      /^Error: publication_(read_incomplete|metadata_incomplete|rules_invalid)$/);
    assert.equal(calls, 1);
  }
});

test('the existing manual workflow tests both inspectors before exposing D1 credentials', async () => {
  const workflow = await readFile(new URL('../../../.github/workflows/inspect-agent-storage.yml', import.meta.url), 'utf8');
  assert(workflow.indexOf('test/inspect-publication.test.js') < workflow.indexOf('scripts/inspect-publication.js'));
  assert(workflow.indexOf('scripts/inspect-publication.js') < workflow.indexOf('secrets.CLOUDFLARE_API_TOKEN'));
  assert(!/PUBLICATION_APP_PRIVATE_KEY|PUBLICATION_CONFIG|upload-artifact/.test(workflow));
});
