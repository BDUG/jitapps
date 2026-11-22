const assert = require('node:assert/strict');
const { providers } = require('./index.js');

(async () => {
  const mk = data => async () => ({ ok: true, json: async () => data });
  assert.equal(await providers.openAIModel({ endpoint: 'https://api.example.com/v1', modelId: 'm', fetch: mk({ choices: [{ message: { content: 'a' } }] }) })({}), 'a');
  assert.equal(await providers.anthropicModel({ modelId: 'm', fetch: mk({ content: [{ type: 'text', text: 'b' }] }) })({}), 'b');
  assert.equal(await providers.geminiModel({ modelId: 'm', fetch: mk({ candidates: [{ content: { parts: [{ text: 'c' }] } }] }) })({}), 'c');
  assert.equal(await providers.ollamaModel({ modelId: 'm', fetch: mk({ message: { content: 'd' } }) })({}), 'd');
  let n = 0;
  assert.equal(await providers.withRetry(async () => { if (++n < 2) throw Error('503'); return 'ok'; }, { baseDelayMs: 1 })({}), 'ok');
  assert.throws(() => providers.openAIModel({ endpoint: 'http://remote.invalid/v1', modelId: 'm', fetch: mk({}) }), /Invalid provider/);
  const tools = [{ name: 'script_run', description: 'Run script', arguments: { source: 'inline source', args: 'array of strings' } }];
  const oaiSchemas = providers.toolSchemas(tools, { provider: 'openai' });
  assert.equal(oaiSchemas[0].function.parameters.properties.args.type, 'array');
  const gemSchemas = providers.toolSchemas(tools, { provider: 'gemini' });
  assert.equal(gemSchemas[0].functionDeclarations[0].name, 'script_run');
  const oaiTool = providers.openAIToolModel({ endpoint: 'https://api.example.com/v1', modelId: 'm', tools, fetch: mk({ choices: [{ finish_reason: 'tool_calls', message: { reasoning_content: 'Need script', tool_calls: [{ id: 'c1', function: { name: 'script_run', arguments: '{"source":"print(1)"}' } }] } }], usage: { prompt_tokens: 10, completion_tokens: 5 } }) });
  const reactReply = JSON.parse(await providers.toolUseToReactModel(oaiTool)({ sessionId: 's1', step: 1 }));
  assert.equal(reactReply.status, 'act');
  assert.equal(reactReply.action.tool, 'script_run');
  assert.equal(reactReply.action.args.source, 'print(1)');
  console.log('PASS JavaScript provider adapters (OpenAI, Anthropic, Gemini, Ollama, tool-use) and withRetry.');
})().catch(e => { console.error(e); process.exitCode = 1; });
