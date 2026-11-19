"""OpenTelemetry GenAI Semantic Conventions tracer and OTLP JSON exporter for ReAct loops."""
from __future__ import annotations

import os
import time


def _hex_id(nbytes):
    return os.urandom(nbytes).hex()


def _otlp_attr(key, value):
    if isinstance(value, bool):
        return {'key': key, 'value': {'boolValue': value}}
    if isinstance(value, int):
        return {'key': key, 'value': {'intValue': str(value)}}
    if isinstance(value, float):
        return {'key': key, 'value': {'doubleValue': value}}
    if isinstance(value, (list, tuple)):
        return {'key': key, 'value': {'arrayValue': {'values': [{'stringValue': str(v)} for v in value]}}}
    return {'key': key, 'value': {'stringValue': str(value)}}


class TraceContext:
    """W3C traceparent context."""

    def __init__(self, trace_id=None, span_id=None, flags='01'):
        self.trace_id = trace_id or _hex_id(16)
        self.span_id = span_id or _hex_id(8)
        self.flags = flags

    def traceparent(self):
        return f'00-{self.trace_id}-{self.span_id}-{self.flags}'

    @classmethod
    def parse(cls, header):
        parts = str(header or '').strip().split('-')
        if len(parts) != 4 or len(parts[1]) != 32 or len(parts[2]) != 16:
            raise ValueError('Invalid W3C traceparent header')
        return cls(trace_id=parts[1], span_id=parts[2], flags=parts[3])


class GenAISpan:
    """Single OpenTelemetry span following GenAI semantic conventions."""

    def __init__(self, name, *, trace_id, span_id=None, parent_span_id=None, kind=1, attributes=None):
        self.name = name
        self.trace_id = trace_id
        self.span_id = span_id or _hex_id(8)
        self.parent_span_id = parent_span_id
        self.kind = kind  # 1=INTERNAL, 3=CLIENT
        self.attributes = dict(attributes or {})
        self.start_time_ns = time.time_ns()
        self.end_time_ns = None
        self.status = {'code': 'OK'}
        self.events = []

    def set_attribute(self, key, value):
        self.attributes[key] = value

    def add_event(self, name, attributes=None):
        self.events.append({'name': name, 'timeUnixNano': str(time.time_ns()), 'attributes': [_otlp_attr(k, v) for k, v in (attributes or {}).items()]})

    def set_error(self, message, error_type='Error'):
        self.status = {'code': 'ERROR', 'message': str(message)}
        self.attributes['error.type'] = error_type

    def end(self):
        if self.end_time_ns is None:
            self.end_time_ns = time.time_ns()

    def to_otlp(self):
        end_ns = self.end_time_ns if self.end_time_ns is not None else time.time_ns()
        payload = {
            'traceId': self.trace_id,
            'spanId': self.span_id,
            'name': self.name,
            'kind': self.kind,
            'startTimeUnixNano': str(self.start_time_ns),
            'endTimeUnixNano': str(end_ns),
            'attributes': [_otlp_attr(k, v) for k, v in self.attributes.items()],
            'status': {'code': 2 if self.status.get('code') == 'ERROR' else 1, **({'message': self.status['message']} if self.status.get('message') else {})},
        }
        if self.parent_span_id:
            payload['parentSpanId'] = self.parent_span_id
        if self.events:
            payload['events'] = self.events
        return payload


class GenAITracer:
    """Records invoke_agent, chat (LLM), and execute_tool spans and exports OTLP JSON."""

    def __init__(self, *, service_name='codingagentlib', service_version='1.0.0', trace_context=None):
        self.service_name = service_name
        self.service_version = service_version
        self.context = trace_context or TraceContext()
        self.spans = []

    def start_span(self, name, *, parent=None, kind=1, attributes=None):
        parent_id = parent.span_id if isinstance(parent, GenAISpan) else parent
        span = GenAISpan(name, trace_id=self.context.trace_id, parent_span_id=parent_id, kind=kind, attributes=attributes)
        self.spans.append(span)
        return span

    def start_agent_span(self, agent_name='react-agent', *, conversation_id=None):
        attrs = {'gen_ai.operation.name': 'invoke_agent', 'gen_ai.agent.name': agent_name}
        if conversation_id:
            attrs['gen_ai.conversation.id'] = conversation_id
        return self.start_span(f'invoke_agent {agent_name}', kind=1, attributes=attrs)

    def start_chat_span(self, *, system='openai', model='unknown', parent=None):
        attrs = {'gen_ai.operation.name': 'chat', 'gen_ai.system': system, 'gen_ai.request.model': model}
        return self.start_span(f'chat {model}', parent=parent, kind=3, attributes=attrs)

    def start_tool_span(self, tool_name, *, call_id=None, parent=None):
        attrs = {'gen_ai.operation.name': 'execute_tool', 'gen_ai.tool.name': tool_name}
        if call_id:
            attrs['gen_ai.tool.call.id'] = call_id
        return self.start_span(f'execute_tool {tool_name}', parent=parent, kind=1, attributes=attrs)

    def export_otlp_json(self):
        return {
            'resourceSpans': [{
                'resource': {'attributes': [_otlp_attr('service.name', self.service_name), _otlp_attr('service.version', self.service_version)]},
                'scopeSpans': [{
                    'scope': {'name': 'codingagentlib.otel_genai', 'version': '1.0.0'},
                    'spans': [s.to_otlp() for s in self.spans],
                }],
            }],
        }


class ReactOtelObserver:
    """Attaches to ReAct lifecycle events to emit GenAI invoke_agent / chat / execute_tool spans."""

    def __init__(self, tracer=None, *, agent_name='react-agent', model_name='unknown', system='custom'):
        self.tracer = tracer or GenAITracer()
        self.agent_name = agent_name
        self.model_name = model_name
        self.system = system
        self.root_span = None
        self._tool_spans = {}
        self._chat_span = None

    def on_event(self, event):
        kind = event.get('kind') or ''
        val = event.get('value') if isinstance(event.get('value'), dict) else event
        if kind == 'start':
            self.root_span = self.tracer.start_agent_span(self.agent_name, conversation_id=event.get('sessionId'))
        elif kind == 'step_start':
            self._chat_span = self.tracer.start_chat_span(system=self.system, model=self.model_name, parent=self.root_span)
        elif kind in ('thought', 'plan'):
            if self._chat_span is None:
                self._chat_span = self.tracer.start_chat_span(system=self.system, model=self.model_name, parent=self.root_span)
            usage = val.get('usage') or {}
            if usage.get('input_tokens'):
                self._chat_span.set_attribute('gen_ai.usage.input_tokens', int(usage['input_tokens']))
            if usage.get('output_tokens'):
                self._chat_span.set_attribute('gen_ai.usage.output_tokens', int(usage['output_tokens']))
            if val.get('stopReason'):
                self._chat_span.set_attribute('gen_ai.response.finish_reasons', [val['stopReason']])
            self._chat_span.end()
            self._chat_span = None
        elif kind == 'action':
            if self._chat_span is not None:
                self._chat_span.end()
                self._chat_span = None
            cid = str(val.get('id') or '')
            span = self.tracer.start_tool_span(str(val.get('tool') or 'unknown'), call_id=cid or None, parent=self.root_span)
            self._tool_spans[cid] = span
        elif kind == 'observation':
            cid = str(val.get('id') or '')
            span = self._tool_spans.pop(cid, None)
            if span is not None:
                if val.get('ok') is False or val.get('error'):
                    span.set_error(val.get('error') or 'Tool failed', error_type='ToolExecutionError')
                span.end()
        elif kind in ('done', 'complete'):
            if self._chat_span is not None:
                self._chat_span.end()
                self._chat_span = None
            if self.root_span is not None:
                self.root_span.end()
        elif kind == 'error':
            if self.root_span is not None:
                self.root_span.set_error(val.get('error') or 'Agent error')
                self.root_span.end()
