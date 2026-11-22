'use strict';
const crypto = require('node:crypto');

function hexId(bytes) {
  return crypto.randomBytes(bytes).toString('hex');
}

function nowNs() {
  return (BigInt(Date.now()) * 1000000n).toString();
}

function otlpAttr(key, value) {
  if (typeof value === 'boolean') return { key, value: { boolValue: value } };
  if (typeof value === 'number') {
    if (Number.isInteger(value)) return { key, value: { intValue: String(value) } };
    return { key, value: { doubleValue: value } };
  }
  if (Array.isArray(value)) return { key, value: { arrayValue: { values: value.map(v => ({ stringValue: String(v) })) } } };
  return { key, value: { stringValue: String(value) } };
}

class TraceContext {
  constructor({ traceId = null, spanId = null, flags = '01' } = {}) {
    this.traceId = traceId || hexId(16);
    this.spanId = spanId || hexId(8);
    this.flags = flags;
  }

  traceparent() {
    return `00-${this.traceId}-${this.spanId}-${this.flags}`;
  }

  static parse(header) {
    const parts = String(header || '').trim().split('-');
    if (parts.length !== 4 || parts[1].length !== 32 || parts[2].length !== 16) {
      throw Error('Invalid W3C traceparent header');
    }
    return new TraceContext({ traceId: parts[1], spanId: parts[2], flags: parts[3] });
  }
}

class GenAISpan {
  constructor(name, { traceId, spanId = null, parentSpanId = null, kind = 1, attributes = {} } = {}) {
    this.name = name;
    this.traceId = traceId;
    this.spanId = spanId || hexId(8);
    this.parentSpanId = parentSpanId;
    this.kind = kind;
    this.attributes = { ...attributes };
    this.startTimeUnixNano = nowNs();
    this.endTimeUnixNano = null;
    this.status = { code: 'OK' };
    this.events = [];
  }

  setAttribute(key, value) {
    this.attributes[key] = value;
  }

  addEvent(name, attributes = {}) {
    this.events.push({
      name,
      timeUnixNano: nowNs(),
      attributes: Object.entries(attributes).map(([k, v]) => otlpAttr(k, v)),
    });
  }

  setError(message, errorType = 'Error') {
    this.status = { code: 'ERROR', message: String(message) };
    this.attributes['error.type'] = errorType;
  }

  end() {
    if (this.endTimeUnixNano === null) this.endTimeUnixNano = nowNs();
  }

  toOtlp() {
    const endNs = this.endTimeUnixNano ?? nowNs();
    const payload = {
      traceId: this.traceId,
      spanId: this.spanId,
      name: this.name,
      kind: this.kind,
      startTimeUnixNano: this.startTimeUnixNano,
      endTimeUnixNano: endNs,
      attributes: Object.entries(this.attributes).map(([k, v]) => otlpAttr(k, v)),
      status: {
        code: this.status.code === 'ERROR' ? 2 : 1,
        ...(this.status.message ? { message: this.status.message } : {}),
      },
    };
    if (this.parentSpanId) payload.parentSpanId = this.parentSpanId;
    if (this.events.length) payload.events = this.events;
    return payload;
  }
}

class GenAITracer {
  constructor({ serviceName = 'codingagentlib', serviceVersion = '1.0.0', traceContext = null } = {}) {
    this.serviceName = serviceName;
    this.serviceVersion = serviceVersion;
    this.context = traceContext || new TraceContext();
    this.spans = [];
  }

  startSpan(name, { parent = null, kind = 1, attributes = {} } = {}) {
    const parentSpanId = parent instanceof GenAISpan ? parent.spanId : parent;
    const span = new GenAISpan(name, { traceId: this.context.traceId, parentSpanId, kind, attributes });
    this.spans.push(span);
    return span;
  }

  startAgentSpan(agentName = 'react-agent', { conversationId = null } = {}) {
    const attributes = { 'gen_ai.operation.name': 'invoke_agent', 'gen_ai.agent.name': agentName };
    if (conversationId) attributes['gen_ai.conversation.id'] = conversationId;
    return this.startSpan(`invoke_agent ${agentName}`, { kind: 1, attributes });
  }

  startChatSpan({ system = 'openai', model = 'unknown', parent = null } = {}) {
    return this.startSpan(`chat ${model}`, {
      parent,
      kind: 3,
      attributes: { 'gen_ai.operation.name': 'chat', 'gen_ai.system': system, 'gen_ai.request.model': model },
    });
  }

  startToolSpan(toolName, { callId = null, parent = null } = {}) {
    const attributes = { 'gen_ai.operation.name': 'execute_tool', 'gen_ai.tool.name': toolName };
    if (callId) attributes['gen_ai.tool.call.id'] = callId;
    return this.startSpan(`execute_tool ${toolName}`, { parent, kind: 1, attributes });
  }

  exportOtlpJson() {
    return {
      resourceSpans: [{
        resource: {
          attributes: [otlpAttr('service.name', this.serviceName), otlpAttr('service.version', this.serviceVersion)],
        },
        scopeSpans: [{
          scope: { name: 'codingagentlib.otel_genai', version: '1.0.0' },
          spans: this.spans.map(s => s.toOtlp()),
        }],
      }],
    };
  }
}

class ReactOtelObserver {
  constructor(tracer = null, { agentName = 'react-agent', modelName = 'unknown', system = 'custom' } = {}) {
    this.tracer = tracer || new GenAITracer();
    this.agentName = agentName;
    this.modelName = modelName;
    this.system = system;
    this.rootSpan = null;
    this._toolSpans = new Map();
    this._chatSpan = null;
  }

  onEvent(event = {}) {
    const kind = event.kind || '';
    const val = event.value && typeof event.value === 'object' && !Array.isArray(event.value) ? event.value : event;
    if (kind === 'start') {
      this.rootSpan = this.tracer.startAgentSpan(this.agentName, { conversationId: event.sessionId });
    } else if (kind === 'step_start') {
      this._chatSpan = this.tracer.startChatSpan({ system: this.system, model: this.modelName, parent: this.rootSpan });
    } else if (kind === 'action') {
      if (this._chatSpan) {
        this._chatSpan.end();
        this._chatSpan = null;
      }
      const callId = String(val.id || '');
      const span = this.tracer.startToolSpan(String(val.tool || 'unknown'), { callId: callId || null, parent: this.rootSpan });
      if (callId) this._toolSpans.set(callId, span);
    } else if (kind === 'observation') {
      const callId = String(val.id || '');
      const span = this._toolSpans.get(callId);
      if (span) {
        this._toolSpans.delete(callId);
        if (val.ok === false) span.setError(val.error || 'Tool execution failed');
        span.end();
      }
    } else if (kind === 'error') {
      if (this.rootSpan) this.rootSpan.setError(val.error || val.message || 'Agent error');
    } else if (kind === 'done' || kind === 'complete') {
      if (this._chatSpan) {
        this._chatSpan.end();
        this._chatSpan = null;
      }
      if (this.rootSpan) this.rootSpan.end();
    }
  }
}

module.exports = { TraceContext, GenAISpan, GenAITracer, ReactOtelObserver };
