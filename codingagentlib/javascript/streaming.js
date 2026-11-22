'use strict';
const crypto = require('node:crypto');

function formatSse(event, data, { eventId = null } = {}) {
  const lines = [];
  if (eventId !== null && eventId !== undefined) lines.push(`id: ${eventId}`);
  if (event) lines.push(`event: ${event}`);
  const payload = typeof data === 'string' ? data : JSON.stringify(data);
  const split = payload.split(/\r?\n/);
  for (const line of split.length ? split : ['']) {
    lines.push(`data: ${line}`);
  }
  return lines.join('\n') + '\n\n';
}

function agUiEvents(event = {}, { runId = 'run-1', threadId = 'thread-1', messageId = null } = {}) {
  const ts = Date.now();
  const kind = event.kind || event.type || '';
  const val = event.value && typeof event.value === 'object' && !Array.isArray(event.value) ? event.value : event;
  const mid = messageId || `msg-${event.step ?? 0}`;
  const out = [];

  if (kind === 'start') {
    out.push({ type: 'RUN_STARTED', threadId, runId, timestamp: ts });
  } else if (kind === 'step_start') {
    out.push({ type: 'STEP_STARTED', stepName: `step-${event.step ?? 0}`, timestamp: ts });
  } else if (kind === 'thought' || kind === 'plan') {
    const text = String(val.plan || val.text || val.thought || '');
    if (text) out.push({ type: 'THINKING_TEXT_MESSAGE_CONTENT', messageId: mid, delta: text, timestamp: ts });
  } else if (kind === 'action') {
    const callId = String(val.id || `call-${crypto.randomBytes(4).toString('hex')}`);
    const tool = String(val.tool || '');
    const args = JSON.stringify(val.args || {});
    out.push({ type: 'TOOL_CALL_START', toolCallId: callId, toolCallName: tool, parentMessageId: mid, timestamp: ts });
    out.push({ type: 'TOOL_CALL_ARGS', toolCallId: callId, delta: args, timestamp: ts });
    out.push({ type: 'TOOL_CALL_END', toolCallId: callId, timestamp: ts });
  } else if (kind === 'observation') {
    const callId = String(val.id || '');
    out.push({ type: 'TOOL_CALL_RESULT', toolCallId: callId, content: JSON.stringify(val.result !== undefined ? val.result : val), role: 'tool', timestamp: ts });
  } else if (kind === 'diff' || kind === 'state' || kind === 'tasks') {
    out.push({ type: 'STATE_SNAPSHOT', snapshot: val, timestamp: ts });
  } else if (kind === 'permission_request') {
    out.push({ type: 'CUSTOM', name: 'permission_request', value: val, timestamp: ts });
  } else if (kind === 'step_end') {
    out.push({ type: 'STEP_FINISHED', stepName: `step-${event.step ?? 0}`, timestamp: ts });
  } else if (kind === 'done' || kind === 'complete' || kind === 'assistant') {
    const summary = String(val.summary || val.text || '');
    if (summary) {
      out.push({ type: 'TEXT_MESSAGE_START', messageId: mid, role: 'assistant', timestamp: ts });
      out.push({ type: 'TEXT_MESSAGE_CONTENT', messageId: mid, delta: summary, timestamp: ts });
      out.push({ type: 'TEXT_MESSAGE_END', messageId: mid, timestamp: ts });
    }
    if (kind !== 'assistant') {
      out.push({ type: 'RUN_FINISHED', threadId, runId, result: val, timestamp: ts });
    }
  } else if (kind === 'error') {
    out.push({ type: 'RUN_ERROR', message: String(val.error || val.message || 'Run error'), timestamp: ts });
  }
  return out;
}

class SSEStreamBridge {
  constructor({ fmt = 'ag-ui', runId = 'run-1', threadId = 'thread-1', writer = null } = {}) {
    if (fmt !== 'ag-ui' && fmt !== 'sse') throw Error('fmt must be "ag-ui" or "sse"');
    this.fmt = fmt;
    this.runId = runId;
    this.threadId = threadId;
    this.writer = writer;
    this.frames = [];
    this._seq = 0;
  }

  emit(event) {
    if (this.fmt === 'ag-ui') {
      for (const item of agUiEvents(event, { runId: this.runId, threadId: this.threadId })) {
        this._seq += 1;
        const frame = formatSse(item.type, item, { eventId: this._seq });
        this.frames.push(frame);
        if (this.writer) this.writer(frame);
      }
    } else {
      this._seq += 1;
      const frame = formatSse(event?.kind || 'event', event, { eventId: this._seq });
      this.frames.push(frame);
      if (this.writer) this.writer(frame);
    }
  }
}

class ACPServer {
  static PROTOCOL_VERSION = 1;

  constructor({ agentName = 'tlal-coding-agent', agentVersion = '1.0.0', promptHandler = null, emitNotification = null } = {}) {
    this.agentName = agentName;
    this.agentVersion = agentVersion;
    this.promptHandler = promptHandler;
    this.emitNotification = emitNotification;
    this.sessions = new Map();
    this.notifications = [];
  }

  _notify(method, params) {
    const note = { jsonrpc: '2.0', method, params };
    this.notifications.push(note);
    if (this.emitNotification) this.emitNotification(note);
    return note;
  }

  emitUpdate(sessionId, update) {
    return this._notify('session/update', { sessionId, update });
  }

  requestPermission(sessionId, { toolCallId, title, kind = 'edit', options = null } = {}) {
    return this._notify('session/request_permission', {
      sessionId,
      toolCall: { toolCallId, title, kind },
      options: options || [
        { optionId: 'allow_once', name: 'Allow once', kind: 'allow_once' },
        { optionId: 'reject_once', name: 'Reject', kind: 'reject_once' },
      ],
    });
  }

  async handle(frame) {
    if (!frame || typeof frame !== 'object' || Array.isArray(frame) || frame.jsonrpc !== '2.0' || typeof frame.method !== 'string') {
      return {
        jsonrpc: '2.0',
        id: frame && typeof frame === 'object' ? frame.id ?? null : null,
        error: { code: -32600, message: 'Invalid ACP JSON-RPC request' },
      };
    }
    const reqId = frame.id ?? null;
    const method = frame.method;
    const params = frame.params && typeof frame.params === 'object' ? frame.params : {};
    if (Array.isArray(params)) return {jsonrpc:'2.0',id:reqId,error:{code:-32602,message:'ACP params must be an object'}};

    if (method === 'initialize') {
      return {
        jsonrpc: '2.0',
        id: reqId,
        result: {
          protocolVersion: ACPServer.PROTOCOL_VERSION,
          agentCapabilities: { loadSession: false, promptCapabilities: { image: false, embeddedContext: true } },
          agentInfo: { name: this.agentName, version: this.agentVersion },
          authMethods: [],
        },
      };
    }

    if (method === 'session/new') {
      const sid = params.sessionId || `acp-${crypto.randomBytes(5).toString('hex')}`;
      this.sessions.set(sid, { id: sid, cwd: params.cwd || '.', cancelled: false });
      return { jsonrpc: '2.0', id: reqId, result: { sessionId: sid } };
    }

    if (method === 'session/cancel') {
      const sid = params.sessionId;
      if (this.sessions.has(sid)) this.sessions.get(sid).cancelled = true;
      return { jsonrpc: '2.0', id: reqId, result: { cancelled: this.sessions.has(sid) } };
    }

    if (method === 'session/prompt') {
      const sid = params.sessionId;
      if (!this.sessions.has(sid)) return { jsonrpc: '2.0', id: reqId, error: { code: -32001, message: 'Unknown ACP sessionId' } };
      this.sessions.get(sid).cancelled = false;
      if (typeof this.promptHandler !== 'function') return { jsonrpc: '2.0', id: reqId, result: { stopReason: 'end_turn' } };
      const res = await this.promptHandler(sid, params, this);
      return { jsonrpc: '2.0', id: reqId, result: this.sessions.get(sid).cancelled ? {stopReason:'cancelled'} : res || { stopReason: 'end_turn' } };
    }

    return { jsonrpc: '2.0', id: reqId, error: { code: -32601, message: `Unsupported ACP method: ${method}` } };
  }
}

module.exports = { formatSse, agUiEvents, SSEStreamBridge, ACPServer };
