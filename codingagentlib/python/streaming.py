"""Loop -> Editor / UI streaming protocols: SSE Data Streams, AG-UI events, and ACP (Zed)."""
from __future__ import annotations

import json
import time
import uuid


def format_sse(event, data, *, event_id=None):
    """Format a single Server-Sent Events (SSE) frame."""
    lines = []
    if event_id is not None:
        lines.append(f'id: {event_id}')
    if event:
        lines.append(f'event: {event}')
    payload = data if isinstance(data, str) else json.dumps(data, ensure_ascii=False)
    for line in payload.splitlines() or ('',):
        lines.append(f'data: {line}')
    return '\n'.join(lines) + '\n\n'


def ag_ui_events(event, *, run_id='run-1', thread_id='thread-1', message_id=None):
    """Translate a ReAct loop lifecycle event into standard AG-UI protocol events."""
    ts = int(time.time() * 1000)
    kind = event.get('kind') or event.get('type') or ''
    val = event.get('value') if isinstance(event.get('value'), dict) else event
    mid = message_id or f"msg-{event.get('step', 0)}"
    out = []

    if kind == 'start':
        out.append({'type': 'RUN_STARTED', 'threadId': thread_id, 'runId': run_id, 'timestamp': ts})
    elif kind == 'step_start':
        out.append({'type': 'STEP_STARTED', 'stepName': f"step-{event.get('step', 0)}", 'timestamp': ts})
    elif kind in ('thought', 'plan'):
        text = str(val.get('plan') or val.get('text') or val.get('thought') or '')
        if text:
            out.append({'type': 'THINKING_TEXT_MESSAGE_CONTENT', 'messageId': mid, 'delta': text, 'timestamp': ts})
    elif kind == 'action':
        call_id = str(val.get('id') or f'call-{uuid.uuid4().hex[:8]}')
        tool = str(val.get('tool') or '')
        args = json.dumps(val.get('args') or {}, ensure_ascii=False)
        out.append({'type': 'TOOL_CALL_START', 'toolCallId': call_id, 'toolCallName': tool, 'parentMessageId': mid, 'timestamp': ts})
        out.append({'type': 'TOOL_CALL_ARGS', 'toolCallId': call_id, 'delta': args, 'timestamp': ts})
        out.append({'type': 'TOOL_CALL_END', 'toolCallId': call_id, 'timestamp': ts})
    elif kind == 'observation':
        call_id = str(val.get('id') or '')
        out.append({'type': 'TOOL_CALL_RESULT', 'toolCallId': call_id, 'content': json.dumps(val.get('result', val), ensure_ascii=False), 'role': 'tool', 'timestamp': ts})
    elif kind in ('diff', 'state', 'tasks'):
        out.append({'type': 'STATE_SNAPSHOT', 'snapshot': val, 'timestamp': ts})
    elif kind == 'permission_request':
        out.append({'type': 'CUSTOM', 'name': 'permission_request', 'value': val, 'timestamp': ts})
    elif kind == 'step_end':
        out.append({'type': 'STEP_FINISHED', 'stepName': f"step-{event.get('step', 0)}", 'timestamp': ts})
    elif kind in ('done', 'complete', 'assistant'):
        summary = str(val.get('summary') or val.get('text') or '')
        if summary:
            out.append({'type': 'TEXT_MESSAGE_START', 'messageId': mid, 'role': 'assistant', 'timestamp': ts})
            out.append({'type': 'TEXT_MESSAGE_CONTENT', 'messageId': mid, 'delta': summary, 'timestamp': ts})
            out.append({'type': 'TEXT_MESSAGE_END', 'messageId': mid, 'timestamp': ts})
        if kind != 'assistant':
            out.append({'type': 'RUN_FINISHED', 'threadId': thread_id, 'runId': run_id, 'result': val, 'timestamp': ts})
    elif kind == 'error':
        out.append({'type': 'RUN_ERROR', 'message': str(val.get('error') or val.get('message') or 'Run error'), 'timestamp': ts})
    return out


class SSEStreamBridge:
    """Collects or streams ReAct events as SSE Data Streams (raw SSE or AG-UI format)."""

    def __init__(self, *, fmt='ag-ui', run_id='run-1', thread_id='thread-1', writer=None):
        if fmt not in ('ag-ui', 'sse'):
            raise ValueError('fmt must be "ag-ui" or "sse"')
        self.fmt = fmt
        self.run_id = run_id
        self.thread_id = thread_id
        self.writer = writer
        self.frames = []
        self._seq = 0

    def emit(self, event):
        if self.fmt == 'ag-ui':
            items = ag_ui_events(event, run_id=self.run_id, thread_id=self.thread_id)
            for item in items:
                self._seq += 1
                frame = format_sse(item['type'], item, event_id=self._seq)
                self.frames.append(frame)
                if self.writer:
                    self.writer(frame)
        else:
            self._seq += 1
            frame = format_sse(event.get('kind', 'event'), event, event_id=self._seq)
            self.frames.append(frame)
            if self.writer:
                self.writer(frame)


class ACPServer:
    """Zed ACP (Agent Client Protocol) JSON-RPC 2.0 adapter for editor <-> ReAct loop streaming."""

    PROTOCOL_VERSION = 1

    def __init__(self, *, agent_name='tlal-coding-agent', agent_version='1.0.0', prompt_handler=None, emit_notification=None):
        self.agent_name = agent_name
        self.agent_version = agent_version
        self.prompt_handler = prompt_handler
        self.emit_notification = emit_notification
        self.sessions = {}
        self.notifications = []

    def _notify(self, method, params):
        note = {'jsonrpc': '2.0', 'method': method, 'params': params}
        self.notifications.append(note)
        if self.emit_notification:
            self.emit_notification(note)
        return note

    def emit_update(self, session_id, update):
        return self._notify('session/update', {'sessionId': session_id, 'update': update})

    def request_permission(self, session_id, *, tool_call_id, title, kind='edit', options=None):
        return self._notify('session/request_permission', {
            'sessionId': session_id,
            'toolCall': {'toolCallId': tool_call_id, 'title': title, 'kind': kind},
            'options': options or [
                {'optionId': 'allow_once', 'name': 'Allow once', 'kind': 'allow_once'},
                {'optionId': 'reject_once', 'name': 'Reject', 'kind': 'reject_once'},
            ],
        })

    def handle(self, frame):
        if not isinstance(frame, dict) or frame.get('jsonrpc') != '2.0' or not isinstance(frame.get('method'), str):
            return {'jsonrpc': '2.0', 'id': (frame or {}).get('id') if isinstance(frame, dict) else None, 'error': {'code': -32600, 'message': 'Invalid ACP JSON-RPC request'}}
        req_id = frame.get('id')
        method = frame['method']
        params = frame.get('params') or {}

        if method == 'initialize':
            return {
                'jsonrpc': '2.0',
                'id': req_id,
                'result': {
                    'protocolVersion': self.PROTOCOL_VERSION,
                    'agentCapabilities': {'loadSession': False, 'promptCapabilities': {'image': False, 'embeddedContext': True}},
                    'agentInfo': {'name': self.agent_name, 'version': self.agent_version},
                },
            }

        if method == 'session/new':
            sid = params.get('sessionId') or f'acp-{uuid.uuid4().hex[:10]}'
            self.sessions[sid] = {'id': sid, 'cwd': params.get('cwd', '.'), 'cancelled': False}
            return {'jsonrpc': '2.0', 'id': req_id, 'result': {'sessionId': sid}}

        if method == 'session/cancel':
            sid = params.get('sessionId')
            if sid in self.sessions:
                self.sessions[sid]['cancelled'] = True
            return {'jsonrpc': '2.0', 'id': req_id, 'result': {'cancelled': sid in self.sessions}}

        if method == 'session/prompt':
            sid = params.get('sessionId')
            if sid not in self.sessions:
                return {'jsonrpc': '2.0', 'id': req_id, 'error': {'code': -32001, 'message': 'Unknown ACP session'}}
            prompt_blocks = params.get('prompt') or ()
            text = '\n'.join(b.get('text', '') for b in prompt_blocks if isinstance(b, dict) and b.get('type', 'text') == 'text').strip()
            if not self.prompt_handler:
                self.emit_update(sid, {'sessionUpdate': 'agent_message_chunk', 'content': {'type': 'text', 'text': text}})
                return {'jsonrpc': '2.0', 'id': req_id, 'result': {'stopReason': 'end_turn'}}
            res = self.prompt_handler(sid, text, self)
            stop_reason = 'cancelled' if self.sessions[sid].get('cancelled') else (res or {}).get('stopReason', 'end_turn')
            return {'jsonrpc': '2.0', 'id': req_id, 'result': {'stopReason': stop_reason}}

        return {'jsonrpc': '2.0', 'id': req_id, 'error': {'code': -32601, 'message': f'Unsupported ACP method: {method}'}}
