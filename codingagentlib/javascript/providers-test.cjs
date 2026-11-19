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
  console.log('PASS JavaScript provider adapters (OpenAI, Anthropic, Gemini, Ollama) and withRetry.');
})().catch(e => { console.error(e); process.exitCode = 1; });
