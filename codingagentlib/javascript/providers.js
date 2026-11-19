'use strict';
// Optional host-owned LLM provider adapters and bounded retry helper.
const SYSTEM_PROMPT = 'Return exactly one ModelResponse JSON object matching responseSchema. No tool side effects occur outside the host runtime.';

function validateConfig(endpoint, modelId, apiKey, request) {
  let url;
  try { url = new URL(endpoint); } catch { throw Error('Invalid provider endpoint'); }
  const local = url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if ((url.protocol !== 'https:' && !local) || url.username || url.password || url.hash || typeof modelId !== 'string' || !modelId.trim() || typeof apiKey !== 'string' || typeof request !== 'function') {
    throw Error('Invalid provider configuration');
  }
  return url;
}

function openAIModel({ endpoint, modelId, apiKey = '', fetch: request = globalThis.fetch } = {}) {
  const url = validateConfig(endpoint, modelId, apiKey, request);
  return async (payload, signal) => {
    const reply = await request(url.href, {
      method: 'POST', signal,
      headers: { 'Content-Type': 'application/json', ...(apiKey ? { Authorization: 'Bearer ' + apiKey } : {}) },
      body: JSON.stringify({ model: modelId, messages: [{ role: 'system', content: SYSTEM_PROMPT }, { role: 'user', content: JSON.stringify(payload) }], response_format: { type: 'json_object' } }),
    });
    if (!reply.ok) throw Error('Provider request failed (HTTP ' + reply.status + ')');
    const value = await reply.json();
    const content = value.choices?.[0]?.message?.content;
    if (typeof content !== 'string') throw Error('Provider did not return structured response text');
    return content;
  };
}

function anthropicModel({ endpoint = 'https://api.anthropic.com/v1/messages', modelId, apiKey = '', maxTokens = 4096, anthropicVersion = '2023-06-01', fetch: request = globalThis.fetch } = {}) {
  const url = validateConfig(endpoint, modelId, apiKey, request);
  return async (payload, signal) => {
    const reply = await request(url.href, {
      method: 'POST', signal,
      headers: { 'Content-Type': 'application/json', 'anthropic-version': anthropicVersion, ...(apiKey ? { 'x-api-key': apiKey } : {}) },
      body: JSON.stringify({ model: modelId, max_tokens: maxTokens, system: SYSTEM_PROMPT, messages: [{ role: 'user', content: JSON.stringify(payload) }] }),
    });
    if (!reply.ok) throw Error('Provider request failed (HTTP ' + reply.status + ')');
    const value = await reply.json();
    const text = (value.content || []).filter(b => b?.type === 'text' && typeof b.text === 'string').map(b => b.text).join('');
    if (!text) throw Error('Provider did not return structured response text');
    return text;
  };
}

function geminiModel({ endpoint, modelId, apiKey = '', fetch: request = globalThis.fetch } = {}) {
  const target = endpoint || `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelId || '')}:generateContent`;
  const url = validateConfig(target, modelId, apiKey, request);
  return async (payload, signal) => {
    const reply = await request(url.href, {
      method: 'POST', signal,
      headers: { 'Content-Type': 'application/json', ...(apiKey ? { 'x-goog-api-key': apiKey } : {}) },
      body: JSON.stringify({ systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] }, contents: [{ role: 'user', parts: [{ text: JSON.stringify(payload) }] }], generationConfig: { responseMimeType: 'application/json' } }),
    });
    if (!reply.ok) throw Error('Provider request failed (HTTP ' + reply.status + ')');
    const value = await reply.json();
    const text = (value.candidates?.[0]?.content?.parts || []).map(p => p?.text || '').join('');
    if (!text) throw Error('Provider did not return structured response text');
    return text;
  };
}

function ollamaModel({ endpoint = 'http://127.0.0.1:11434/api/chat', modelId, fetch: request = globalThis.fetch } = {}) {
  const url = validateConfig(endpoint, modelId, '', request);
  return async (payload, signal) => {
    const reply = await request(url.href, {
      method: 'POST', signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: modelId, stream: false, format: 'json', messages: [{ role: 'system', content: SYSTEM_PROMPT }, { role: 'user', content: JSON.stringify(payload) }] }),
    });
    if (!reply.ok) throw Error('Provider request failed (HTTP ' + reply.status + ')');
    const value = await reply.json();
    const content = value.message?.content;
    if (typeof content !== 'string') throw Error('Provider did not return structured response text');
    return content;
  };
}

function withRetry(model, { maxAttempts = 3, baseDelayMs = 250 } = {}) {
  if (typeof model !== 'function' || !Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 10) throw Error('Invalid retry configuration');
  return async (payload, signal) => {
    let lastError;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        return await model(payload, signal);
      } catch (error) {
        lastError = error;
        if (error?.name === 'AbortError' || attempt + 1 >= maxAttempts) throw error;
        await new Promise(resolve => setTimeout(resolve, baseDelayMs * (2 ** attempt)));
      }
    }
    throw lastError;
  };
}

module.exports = { openAIModel, anthropicModel, geminiModel, ollamaModel, withRetry };
