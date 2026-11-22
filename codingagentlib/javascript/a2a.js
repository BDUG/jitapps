'use strict';
const crypto = require('node:crypto');

function isoNow() {
  return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
}

function agentCard({
  name = 'CodingAgent',
  description = 'TLAL OS ReAct Coding Agent',
  url = 'http://127.0.0.1:8000/api/a2a',
  version = '1.0.0',
  skills = [],
  streaming = false,
} = {}) {
  const list = skills && skills.length
    ? skills
    : [{ id: 'coding-react', name: 'ReAct Coding', description: 'Plan, inspect, edit, and verify workspace tasks', tags: ['coding', 'react'] }];
  return {
    name,
    description,
    url,
    version,
    protocolVersion: '0.3.0',
    capabilities: {
      streaming: Boolean(streaming),
      pushNotifications: false,
      stateTransitionHistory: true,
    },
    defaultInputModes: ['text/plain', 'application/json'],
    defaultOutputModes: ['text/plain', 'application/json'],
    skills: list.map((s, idx) => ({
      id: s.id || `skill_${idx + 1}`,
      name: s.name || 'Skill',
      description: s.description || '',
      tags: Array.isArray(s.tags) ? [...s.tags] : [],
    })),
  };
}

function extractText(message) {
  if (typeof message === 'string') return message.trim();
  const parts = Array.isArray(message?.parts) ? message.parts : [];
  return parts
    .filter(p => p && typeof p === 'object' && (p.kind || p.type || 'text') === 'text')
    .map(p => String(p.text || ''))
    .filter(Boolean)
    .join('\n')
    .trim();
}

class A2AServer {
  constructor({ card = null, handler = null } = {}) {
    this.card = card || agentCard();
    this.handler = handler;
    this.tasks = new Map();
  }

  _makeTask(taskId, sessionId, userMessage) {
    return {
      id: taskId,
      sessionId,
      contextId: sessionId,
      kind: 'task',
      status: { state: 'submitted', timestamp: isoNow() },
      history: [userMessage],
      artifacts: [],
    };
  }

  async _runTask(task, goal, params) {
    task.status = { state: 'working', timestamp: isoNow() };
    if (typeof this.handler !== 'function') {
      task.status = {
        state: 'failed',
        timestamp: isoNow(),
        message: { role: 'agent', kind: 'message', messageId: crypto.randomUUID(), parts: [{ kind: 'text', text: 'No A2A task handler configured' }] },
      };
      return task;
    }
    try {
      const res = await this.handler(goal, params);
      const status = res?.status || 'complete';
      if (task.status.state === 'canceled') return task;
      const state = ['ask','waiting','paused'].includes(status) ? 'input-required' : (['complete','done'].includes(status) ? 'completed' : 'failed');
      const summary = res?.summary || res?.question || JSON.stringify(res);
      const agentMsg = { role: 'agent', kind: 'message', messageId: crypto.randomUUID(), parts: [{ kind: 'text', text: String(summary) }] };
      task.history.push(agentMsg);
      task.artifacts.push({
        artifactId: `art-${crypto.randomBytes(4).toString('hex')}`,
        name: 'react-result',
        parts: [
          { kind: 'text', text: String(summary) },
          { kind: 'data', data: res && typeof res === 'object' && !Array.isArray(res) ? res : { result: res } },
        ],
      });
      task.status = { state, timestamp: isoNow(), message: agentMsg };
    } catch (error) {
      const errMsg = { role: 'agent', kind: 'message', messageId: crypto.randomUUID(), parts: [{ kind: 'text', text: String(error?.message || error) }] };
      task.history.push(errMsg);
      task.status = { state: 'failed', timestamp: isoNow(), message: errMsg };
    }
    return task;
  }

  async handle(frame) {
    if (!frame || typeof frame !== 'object' || Array.isArray(frame) || frame.jsonrpc !== '2.0' || typeof frame.method !== 'string') {
      return {
        jsonrpc: '2.0',
        id: frame && typeof frame === 'object' ? frame.id ?? null : null,
        error: { code: -32600, message: 'Invalid A2A JSON-RPC request' },
      };
    }
    const reqId = frame.id ?? null;
    const method = frame.method;
    const params = frame.params ?? {};
    if (typeof params !== 'object' || Array.isArray(params)) return {jsonrpc:'2.0',id:reqId,error:{code:-32602,message:'A2A params must be an object'}};

    if (method === 'tasks/send' || method === 'message/send') {
      let msg = params.message || { role: 'user', parts: [{ kind: 'text', text: String(params.goal || '') }] };
      if (typeof msg === 'string') msg={role:'user',parts:[{kind:'text',text:msg}]};
      if (!msg || typeof msg !== 'object' || Array.isArray(msg)) return {jsonrpc:'2.0',id:reqId,error:{code:-32602,message:'Invalid A2A message'}};
      msg={...msg,kind:'message',messageId:msg.messageId||crypto.randomUUID()};
      const goal = extractText(msg);
      if (!goal) {
        return { jsonrpc: '2.0', id: reqId, error: { code: -32602, message: 'A2A message text is required' } };
      }
      const taskId = params.id || msg.taskId || `task-${crypto.randomBytes(6).toString('hex')}`;
      const sessionId = params.sessionId || msg.contextId || `ctx-${crypto.randomBytes(4).toString('hex')}`;
      let task = this.tasks.get(taskId);
      if (!task) {
        task = this._makeTask(taskId, sessionId, msg);
        this.tasks.set(taskId, task);
      } else {
        task.history.push(msg);
      }
      return { jsonrpc: '2.0', id: reqId, result: await this._runTask(task, goal, params) };
    }

    if (method === 'tasks/get') {
      const task = this.tasks.get(params.id);
      if (!task) return { jsonrpc: '2.0', id: reqId, error: { code: -32001, message: 'Task not found' } };
      return { jsonrpc: '2.0', id: reqId, result: task };
    }

    if (method === 'tasks/cancel') {
      const task = this.tasks.get(params.id);
      if (!task) return { jsonrpc: '2.0', id: reqId, error: { code: -32001, message: 'Task not found' } };
      if (['completed','failed','rejected','canceled'].includes(task.status.state)) return {jsonrpc:'2.0',id:reqId,error:{code:-32002,message:'Task is already terminal and cannot be canceled'}};
      task.status = { state: 'canceled', timestamp: isoNow() };
      return { jsonrpc: '2.0', id: reqId, result: task };
    }

    if (method === 'agent/authenticatedExtendedCard') {
      return { jsonrpc: '2.0', id: reqId, result: this.card };
    }

    return { jsonrpc: '2.0', id: reqId, error: { code: -32601, message: `Unsupported A2A method: ${method}` } };
  }
}

class A2AClient {
  constructor({ endpoint, fetch: request = globalThis.fetch, headers = {} } = {}) {
    let url;
    try { url = new URL(endpoint); } catch { throw Error('Invalid A2A endpoint'); }
    const local = url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    if ((url.protocol !== 'https:' && !local) || !url.hostname || url.username || url.password || url.hash) {
      throw Error('Invalid A2A endpoint');
    }
    if (typeof request !== 'function') throw Error('Provide a fetch function for A2AClient');
    this.endpoint = url.href;
    this.headers = { ...headers };
    this._request = request;
    this._nextId = 0;
  }

  async call(method, params = {}, { signal } = {}) {
    const id = ++this._nextId;
    const frame = { jsonrpc: '2.0', id, method, params };
    const resp = await this._request(this.endpoint, {
      method: 'POST',
      signal,
      headers: { 'Content-Type': 'application/json', 'A2A-Version':'0.3', ...this.headers },
      body: JSON.stringify(frame),
    });
    if (!resp.ok) throw Error(`A2A HTTP request failed (HTTP ${resp.status})`);
    const reply = await resp.json();
    if (reply?.id !== id) throw Error('A2A response identity mismatch');
    if (reply.error) throw Error(reply.error.message || 'A2A call failed');
    return reply.result;
  }

  sendTask(goal, { taskId, sessionId, metadata, signal } = {}) {
    const params = { message: { role: 'user', kind:'message',messageId:crypto.randomUUID(), parts: [{ kind: 'text', text: String(goal) }] } };
    if (taskId) params.message.taskId = taskId;
    if (sessionId) params.message.contextId = sessionId;
    if (metadata) params.metadata = metadata;
    return this.call('message/send', params, { signal });
  }

  getTask(taskId, options) {
    return this.call('tasks/get', { id: taskId }, options);
  }

  cancelTask(taskId, options) {
    return this.call('tasks/cancel', { id: taskId }, options);
  }
}

function a2aDelegationTool(client, { name = 'delegate_a2a', description = 'Delegate a sub-goal to a remote or local A2A agent.' } = {}) {
  return {
    name,
    description,
    parameters: {
      type: 'object',
      properties: {
        goal: { type: 'string', description: 'Goal to delegate to the A2A agent' },
        sessionId: { type: 'string', description: 'Optional A2A session/context ID' },
      },
      required: ['goal'],
    },
    async execute(args = {}, context = {}) {
      const goal = String(args.goal || '').trim();
      if (!goal) throw Error('goal is required');
      if (client instanceof A2AServer) {
        const res = await client.handle({
          jsonrpc: '2.0',
          id: 1,
          method: 'tasks/send',
          params: { sessionId: args.sessionId || context.sessionId, message: { role: 'user', kind:'message',messageId:crypto.randomUUID(), parts: [{ kind: 'text', text: goal }] } },
        });
        if (res.error) throw Error(res.error.message || 'A2A delegation failed');
        return res.result;
      }
      return client.sendTask(goal, { sessionId: args.sessionId || context.sessionId, signal: context.signal });
    },
  };
}

module.exports = { agentCard, A2AServer, A2AClient, a2aDelegationTool };
