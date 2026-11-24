import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import gateway from '../src/validation-gateway.js';

test('the machine gateway cannot proxy workbench, Owner APIs, arbitrary paths or methods', async () => {
  let calls = 0;
  const env = {BROKER: {fetch: async () => {calls++; return new Response('synthetic broker');}}};
  for (const path of ['/', '/api/sessions', '/api/proposals/a', '/validation/not-a-job/claim', '/validation/' + 'a'.repeat(36) + '/delete']) {
    assert.equal((await gateway.fetch(new Request('https://validation.example.workers.dev' + path, {method: 'POST'}), env)).status, 404);
  }
  const url = 'https://validation.example.workers.dev/validation/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/claim';
  assert.equal((await gateway.fetch(new Request(url), env)).status, 404);
  assert.equal(calls, 0);
  assert.equal((await gateway.fetch(new Request(url, {method: 'POST'}), env)).status, 200); assert.equal(calls, 1);
  assert.equal((await gateway.fetch(new Request(url, {method: 'POST'}), {})).status, 503);
  const config = JSON.parse(await readFile(new URL('../wrangler.validation-gateway.jsonc', import.meta.url), 'utf8'));
  assert.equal(config.workers_dev, false); assert.equal(config.preview_urls, false); assert.equal(config.observability.enabled, false);
  assert.deepEqual(config.services, [{binding: 'BROKER', service: 'atlas-agent-private', entrypoint: 'ValidationBroker'}]);
  assert.equal(config.d1_databases, undefined); assert.equal(config.vars, undefined);
});
