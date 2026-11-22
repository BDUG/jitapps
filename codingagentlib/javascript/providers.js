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

function schemaFromArguments(args) {
  if (!args || typeof args !== 'object') return { type: 'object', properties: {} };
  const properties = {};
  for (const [key, desc] of Object.entries(args)) {
    if (desc && typeof desc === 'object' && desc.type) { properties[key] = JSON.parse(JSON.stringify(desc)); continue; }
    const text = String(desc || ''), low = text.toLowerCase();
    let prop;
    if (low.startsWith('array') || low.includes('array of')) prop = { type: 'array', items: {} };
    else if (low.startsWith('boolean') || low.startsWith('optional boolean')) prop = { type: 'boolean' };
    else if (low.startsWith('integer') || low.startsWith('optional integer') || low.startsWith('one-based integer')) prop = { type: 'integer' };
    else if (low.startsWith('json') || low.startsWith('optional {') || low.split(',')[0].includes('object')) prop = { type: 'object' };
    else prop = { type: 'string' };
    if (text) prop.description = text;
    properties[key] = prop;
  }
  return { type: 'object', properties };
}

function toolSchemas(tools, { provider = 'openai' } = {}) {
  const formatted = [];
  for (const tool of tools || []) {
    const name = tool.name, description = tool.description || '';
    const parameters = tool.parameters || schemaFromArguments(tool.arguments);
    if (provider === 'openai') formatted.push({ type: 'function', function: { name, description, parameters } });
    else if (provider === 'anthropic') formatted.push({ name, description, input_schema: parameters });
    else if (provider === 'gemini') formatted.push({ name, description, parameters });
    else throw Error('Unsupported tool schema provider: ' + provider);
  }
  if (provider === 'gemini' && formatted.length) return [{ functionDeclarations: formatted }];
  return formatted;
}

const STOP_REASON_MAP = {
  tool_calls: 'tool_use', tool_use: 'tool_use', stop: 'end_turn', end_turn: 'end_turn',
  STOP: 'end_turn', length: 'max_tokens', max_tokens: 'max_tokens', MAX_TOKENS: 'max_tokens',
  content_filter: 'content_filter', SAFETY: 'content_filter',
};

function parseProviderResponse(provider, result) {
  const textParts = [], reasoningParts = [], toolCalls = [];
  let rawStop = null, usage = { input_tokens: 0, output_tokens: 0 };
  if (provider === 'openai') {
    const choice = (result?.choices || [{}])[0] || {}, msg = choice.message || {};
    rawStop = choice.finish_reason ?? null;
    if (typeof msg.content === 'string' && msg.content) textParts.push(msg.content);
    for (const key of ['reasoning_content', 'reasoning']) if (typeof msg[key] === 'string' && msg[key]) reasoningParts.push(msg[key]);
    for (const tc of msg.tool_calls || []) {
      const fn = tc.function || {}, rawArgs = fn.arguments ?? '{}';
      const args = typeof rawArgs === 'string' ? JSON.parse(rawArgs) : (rawArgs || {});
      toolCalls.push({ id: tc.id || `call_${toolCalls.length + 1}`, name: fn.name || '', arguments: args });
    }
    const u = result?.usage || {};
    usage = { input_tokens: Number(u.prompt_tokens || 0), output_tokens: Number(u.completion_tokens || 0) };
  } else if (provider === 'anthropic') {
    rawStop = result?.stop_reason ?? null;
    for (const block of result?.content || []) {
      if (!block || typeof block !== 'object') continue;
      if (block.type === 'text' && block.text) textParts.push(block.text);
      else if (block.type === 'thinking' && block.thinking) reasoningParts.push(block.thinking);
      else if (block.type === 'tool_use') toolCalls.push({ id: block.id || `toolu_${toolCalls.length + 1}`, name: block.name || '', arguments: block.input || {} });
    }
    const u = result?.usage || {};
    usage = { input_tokens: Number(u.input_tokens || 0), output_tokens: Number(u.output_tokens || 0) };
  } else if (provider === 'gemini') {
    const cand = (result?.candidates || [{}])[0] || {};
    rawStop = cand.finishReason ?? null;
    for (const part of cand.content?.parts || []) {
      if (!part || typeof part !== 'object') continue;
      if (part.thought && part.text) reasoningParts.push(part.text);
      else if (typeof part.text === 'string' && part.text) textParts.push(part.text);
      else if (part.functionCall) {
        const fc = part.functionCall;
        toolCalls.push({ id: fc.id || `gem_${toolCalls.length + 1}`, name: fc.name || '', arguments: fc.args || {} });
      }
    }
    if (toolCalls.length && rawStop === 'STOP') rawStop = 'tool_use';
    const u = result?.usageMetadata || {};
    usage = { input_tokens: Number(u.promptTokenCount || 0), output_tokens: Number(u.candidatesTokenCount || 0) };
  } else {
    throw Error('Unsupported provider: ' + provider);
  }
  const stop_reason = STOP_REASON_MAP[rawStop] || (toolCalls.length ? 'tool_use' : 'end_turn');
  return { provider, text: textParts.join(''), reasoning: reasoningParts.join(''), tool_calls: toolCalls, stop_reason, raw_stop_reason: rawStop, usage };
}

function openAIToolModel({ endpoint, modelId, apiKey = '', tools = [], fetch: request = globalThis.fetch } = {}) {
  const url = validateConfig(endpoint, modelId, apiKey, request);
  return async (messages, { system = SYSTEM_PROMPT, toolChoice = 'auto', signal } = {}) => {
    const body = { model: modelId, messages: [...(system ? [{ role: 'system', content: system }] : []), ...messages] };
    const schemas = toolSchemas(tools, { provider: 'openai' });
    if (schemas.length) { body.tools = schemas; body.tool_choice = toolChoice; }
    const reply = await request(url.href, { method: 'POST', signal, headers: { 'Content-Type': 'application/json', ...(apiKey ? { Authorization: 'Bearer ' + apiKey } : {}) }, body: JSON.stringify(body) });
    if (!reply.ok) throw Error('Provider request failed (HTTP ' + reply.status + ')');
    return parseProviderResponse('openai', await reply.json());
  };
}

function anthropicToolModel({ endpoint = 'https://api.anthropic.com/v1/messages', modelId, apiKey = '', tools = [], maxTokens = 4096, anthropicVersion = '2023-06-01', fetch: request = globalThis.fetch } = {}) {
  const url = validateConfig(endpoint, modelId, apiKey, request);
  return async (messages, { system = SYSTEM_PROMPT, signal } = {}) => {
    const body = { model: modelId, max_tokens: maxTokens, system, messages: [...messages] };
    const schemas = toolSchemas(tools, { provider: 'anthropic' });
    if (schemas.length) body.tools = schemas;
    const reply = await request(url.href, { method: 'POST', signal, headers: { 'Content-Type': 'application/json', 'anthropic-version': anthropicVersion, ...(apiKey ? { 'x-api-key': apiKey } : {}) }, body: JSON.stringify(body) });
    if (!reply.ok) throw Error('Provider request failed (HTTP ' + reply.status + ')');
    return parseProviderResponse('anthropic', await reply.json());
  };
}

function geminiToolModel({ endpoint, modelId, apiKey = '', tools = [], fetch: request = globalThis.fetch } = {}) {
  const target = endpoint || `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelId || '')}:generateContent`;
  const url = validateConfig(target, modelId, apiKey, request);
  return async (contents, { system = SYSTEM_PROMPT, signal } = {}) => {
    const body = { systemInstruction: { parts: [{ text: system }] }, contents: [...contents] };
    const schemas = toolSchemas(tools, { provider: 'gemini' });
    if (schemas.length) body.tools = schemas;
    const reply = await request(url.href, { method: 'POST', signal, headers: { 'Content-Type': 'application/json', ...(apiKey ? { 'x-goog-api-key': apiKey } : {}) }, body: JSON.stringify(body) });
    if (!reply.ok) throw Error('Provider request failed (HTTP ' + reply.status + ')');
    return parseProviderResponse('gemini', await reply.json());
  };
}

function toolUseToReactModel(toolModel) {
  return async (payload, signal) => {
    const turn = await toolModel([{ role: 'user', content: JSON.stringify(payload) }], { signal });
    const plan = (turn.reasoning || turn.text || 'Execute next tool step').slice(0, 500);
    if (turn.tool_calls?.length) {
      const first = turn.tool_calls[0];
      return JSON.stringify({ sessionId: payload.sessionId, step: payload.step, status: 'act', plan, action: { tool: first.name, args: first.arguments || {} }, toolCalls: turn.tool_calls, stopReason: turn.stop_reason, usage: turn.usage });
    }
    return JSON.stringify({ sessionId: payload.sessionId, step: payload.step, status: 'done', plan, action: null, summary: turn.text || 'Completed', outcome: 'complete', stopReason: turn.stop_reason, usage: turn.usage });
  };
}

module.exports = { openAIModel, anthropicModel, geminiModel, ollamaModel, withRetry, toolSchemas, parseProviderResponse, openAIToolModel, anthropicToolModel, geminiToolModel, toolUseToReactModel };
