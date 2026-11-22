import {test} from 'node:test';
import assert from 'node:assert/strict';
import {callModel, modelConfiguration, validateModelResult} from '../src/model.js';

const env = {MODEL_PROVIDER: 'anthropic', MODEL_NAME: 'claude-sonnet-5-5', MODEL_API_KEY: 'synthetic-private-key',
  DAILY_CALL_LIMIT: '10', DAILY_TOKEN_LIMIT: '100000'};
const value = {answer: 'Synthetic complete explanation', cited_source_ids: [], candidate: null};
const input = {instructions: 'Synthetic instructions', input: '{}'};

test('Sonnet learning requests reserve a bounded JSON output budget without up-front thinking', async () => {
  const config = modelConfiguration(env); let calls = 0;
  assert.equal(config.ready, true);
  await callModel(env, config, input, async (url, options) => {
    calls++;
    assert.equal(url, 'https://api.anthropic.com/v1/messages');
    assert.equal(options.headers['anthropic-version'], '2026-10-21');
    assert.equal(options.redirect, 'manual');
    const body = JSON.parse(options.body);
    assert.equal(body.max_tokens, 4096);
    assert.deepEqual(body.thinking, {type: 'between_tools'});
    assert.equal(body.output_config.effort, 'medium');
    assert.equal(body.output_config.format.type, 'json_schema');
    assert.equal(body.output_config.format.schema.additionalProperties, false);
    assert.deepEqual(body.output_config.format.schema.required, ['answer', 'cited_source_ids', 'candidate']);
    assert.equal(body.tools, undefined);
    return Response.json({stop_reason: 'end_turn', content: [{type: 'thinking', thinking: 'not persisted'},
      {type: 'text', text: JSON.stringify(value)}], usage: {input_tokens: 100, output_tokens: 50}});
  });
  assert.equal(calls, 1);
});

test('other Claude models do not inherit a Sonnet-specific thinking setting', async () => {
  await callModel({...env, MODEL_NAME: 'other-synthetic-model'}, modelConfiguration(env), input, async (_url, options) => {
    const body = JSON.parse(options.body);
    assert.equal(body.thinking, undefined); assert.equal(body.output_config.effort, undefined);
    assert.equal(body.output_config.format.type, 'json_schema');
    return Response.json({stop_reason: 'end_turn', content: [{type: 'text', text: JSON.stringify(value)}]});
  });
});

test('non-complete Claude results are classified before parsing and never automatically retried', async () => {
  for (const [reason, code] of [['max_tokens', 'model_output_truncated'], ['refusal', 'model_refused'],
    ['model_context_window_exceeded', 'model_context_limit'], ['pause_turn', 'model_output_incomplete']]) {
    let calls = 0;
    await assert.rejects(callModel(env, modelConfiguration(env), input, async () => {
      calls++;
      return Response.json({stop_reason: reason, content: [{type: 'text', text: '{partial synthetic private output'}]});
    }), error => error.status === 502 && error.code === code && !error.message.includes('private'));
    assert.equal(calls, 1);
  }
});

test('structured output still needs local source and placement validation', async () => {
  const result = await callModel(env, modelConfiguration(env), input, async () => Response.json({stop_reason: 'end_turn',
    content: [{type: 'text', text: JSON.stringify({...value, cited_source_ids: ['invented-source']})}]}));
  assert.throws(() => validateModelResult(result.value, {domains: [], articles: []}, [], []), /invalid_model_result/);
});

test('OpenAI output budget and storage policy remain explicit', async () => {
  const openaiEnv = {...env, MODEL_PROVIDER: 'openai'}, config = modelConfiguration(openaiEnv);
  assert.equal(config.outputTokens, 1536);
  await callModel(openaiEnv, config, input, async (_url, options) => {
    const body = JSON.parse(options.body);
    assert.equal(body.max_output_tokens, 1536); assert.equal(body.store, false);
    return Response.json({status: 'completed', output: [{content: [{type: 'output_text', text: JSON.stringify(value)}]}]});
  });
  await assert.rejects(callModel(openaiEnv, config, input, async () => Response.json({status: 'incomplete',
    incomplete_details: {reason: 'max_output_tokens'}})), /model_output_truncated/);
});
