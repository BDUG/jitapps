"""A2A (Agent2Agent) protocol server, client, AgentCard, and nested ReAct delegation tool."""
from __future__ import annotations

import json
import time
import urllib.request
from urllib.parse import urlsplit
import uuid


def agent_card(*, name='CodingAgent', description='TLAL OS ReAct Coding Agent', url='http://127.0.0.1:8000/api/a2a', version='1.0.0', skills=(), streaming=True):
    """Build an A2A AgentCard suitable for /.well-known/agent.json."""
    return {
        'name': name,
        'description': description,
        'url': url,
        'version': version,
        'capabilities': {
            'streaming': bool(streaming),
            'pushNotifications': False,
            'stateTransitionHistory': True,
        },
        'defaultInputModes': ['text/plain', 'application/json'],
        'defaultOutputModes': ['text/plain', 'application/json'],
        'skills': [
            {
                'id': s.get('id', f'skill_{idx + 1}'),
                'name': s.get('name', 'Skill'),
                'description': s.get('description', ''),
                'tags': list(s.get('tags') or ()),
            }
            for idx, s in enumerate(skills or ({'id': 'coding-react', 'name': 'ReAct Coding', 'description': 'Plan, inspect, edit, and verify workspace tasks', 'tags': ['coding', 'react']},))
        ],
    }


def _extract_text(message):
    if isinstance(message, str):
        return message
    parts = (message or {}).get('parts') or ()
    texts = [p.get('text', '') for p in parts if isinstance(p, dict) and p.get('kind', p.get('type', 'text')) == 'text']
    return '\n'.join(t for t in texts if t).strip()


class A2AServer:
    """In-process A2A JSON-RPC 2.0 server supporting tasks/send, tasks/get, tasks/cancel, and message/send."""

    def __init__(self, *, card=None, handler=None):
        self.card = card or agent_card()
        self.handler = handler
        self.tasks = {}

    def _make_task(self, task_id, session_id, user_message):
        now = time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())
        return {
            'id': task_id,
            'sessionId': session_id,
            'status': {'state': 'submitted', 'timestamp': now},
            'history': [user_message],
            'artifacts': [],
        }

    def _run_task(self, task, goal, params):
        task['status'] = {'state': 'working', 'timestamp': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())}
        if not self.handler:
            task['status'] = {'state': 'failed', 'timestamp': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()), 'message': {'role': 'agent', 'parts': [{'kind': 'text', 'text': 'No A2A task handler configured'}]}}
            return task
        try:
            res = self.handler(goal, params)
            status = (res or {}).get('status', 'complete')
            state = 'input-required' if status == 'ask' else ('failed' if status in ('failed', 'error', 'blocked') else 'completed')
            summary = (res or {}).get('summary') or (res or {}).get('question') or json.dumps(res)
            agent_msg = {'role': 'agent', 'parts': [{'kind': 'text', 'text': str(summary)}]}
            task['history'].append(agent_msg)
            task['artifacts'].append({
                'artifactId': f'art-{uuid.uuid4().hex[:8]}',
                'name': 'react-result',
                'parts': [
                    {'kind': 'text', 'text': str(summary)},
                    {'kind': 'data', 'data': res if isinstance(res, dict) else {'result': res}},
                ],
            })
            task['status'] = {'state': state, 'timestamp': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()), 'message': agent_msg}
        except Exception as exc:
            err_msg = {'role': 'agent', 'parts': [{'kind': 'text', 'text': str(exc)}]}
            task['history'].append(err_msg)
            task['status'] = {'state': 'failed', 'timestamp': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()), 'message': err_msg}
        return task

    def handle(self, frame):
        if not isinstance(frame, dict) or frame.get('jsonrpc') != '2.0' or not isinstance(frame.get('method'), str):
            return {'jsonrpc': '2.0', 'id': (frame or {}).get('id') if isinstance(frame, dict) else None, 'error': {'code': -32600, 'message': 'Invalid A2A JSON-RPC request'}}
        req_id = frame.get('id')
        method = frame['method']
        params = frame.get('params') or {}

        if method in ('tasks/send', 'message/send'):
            msg = params.get('message') or {'role': 'user', 'parts': [{'kind': 'text', 'text': str(params.get('goal', ''))}]}
            goal = _extract_text(msg)
            if not goal:
                return {'jsonrpc': '2.0', 'id': req_id, 'error': {'code': -32602, 'message': 'A2A message text is required'}}
            task_id = params.get('id') or f'task-{uuid.uuid4().hex[:12]}'
            session_id = params.get('sessionId') or f'ctx-{uuid.uuid4().hex[:8]}'
            task = self.tasks.get(task_id) or self._make_task(task_id, session_id, msg)
            if task not in self.tasks.values():
                self.tasks[task_id] = task
            else:
                task['history'].append(msg)
            return {'jsonrpc': '2.0', 'id': req_id, 'result': self._run_task(task, goal, params)}

        if method == 'tasks/get':
            task = self.tasks.get(params.get('id'))
            if not task:
                return {'jsonrpc': '2.0', 'id': req_id, 'error': {'code': -32001, 'message': 'Task not found'}}
            return {'jsonrpc': '2.0', 'id': req_id, 'result': task}

        if method == 'tasks/cancel':
            task = self.tasks.get(params.get('id'))
            if not task:
                return {'jsonrpc': '2.0', 'id': req_id, 'error': {'code': -32001, 'message': 'Task not found'}}
            task['status'] = {'state': 'canceled', 'timestamp': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())}
            return {'jsonrpc': '2.0', 'id': req_id, 'result': task}

        if method == 'agent/authenticatedExtendedCard':
            return {'jsonrpc': '2.0', 'id': req_id, 'result': self.card}

        return {'jsonrpc': '2.0', 'id': req_id, 'error': {'code': -32601, 'message': f'Unsupported A2A method: {method}'}}


class A2AClient:
    """A2A JSON-RPC client for delegating tasks to remote or in-process A2A agents."""

    def __init__(self, endpoint, *, request=None, headers=None):
        url = urlsplit(endpoint)
        local = url.scheme == 'http' and url.hostname in ('localhost', '127.0.0.1', '::1')
        if (url.scheme != 'https' and not local) or not url.hostname:
            raise ValueError('Invalid A2A endpoint')
        self.endpoint = endpoint
        self.headers = dict(headers or {})
        self._request = request or self._default_request
        self._next_id = 0

    def _default_request(self, url, body, headers):
        req = urllib.request.Request(url, data=json.dumps(body).encode('utf-8'), headers=headers, method='POST')
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.loads(resp.read().decode('utf-8'))

    def call(self, method, params):
        self._next_id += 1
        frame = {'jsonrpc': '2.0', 'id': self._next_id, 'method': method, 'params': params}
        reply = self._request(self.endpoint, frame, {'Content-Type': 'application/json', **self.headers})
        if 'error' in reply:
            raise RuntimeError(f"A2A error {reply['error'].get('code')}: {reply['error'].get('message')}")
        return reply.get('result')

    def send_task(self, goal, *, task_id=None, session_id=None, metadata=None):
        params = {'message': {'role': 'user', 'parts': [{'kind': 'text', 'text': goal}]}}
        if task_id:
            params['id'] = task_id
        if session_id:
            params['sessionId'] = session_id
        if metadata:
            params['metadata'] = metadata
        return self.call('tasks/send', params)

    def get_task(self, task_id):
        return self.call('tasks/get', {'id': task_id})

    def cancel_task(self, task_id):
        return self.call('tasks/cancel', {'id': task_id})


def a2a_delegation_tool(*, name='delegate_a2a', client, max_depth=2, description='Delegate a subtask to a nested A2A agent running its own ReAct loop.'):
    """Create a read-scoped Agent tool that delegates subtasks over A2A."""
    if type(max_depth) is not int or not 1 <= max_depth <= 8:
        raise ValueError('Delegation depth must be 1..8')

    def execute(args, parent):
        depth = parent.get('delegationDepth', 0) + 1
        if depth > max_depth:
            raise ValueError('A2A delegation depth exhausted')
        task = client.send_task(
            args['goal'],
            session_id=parent.get('sessionId'),
            metadata={'delegationDepth': depth, 'parentCallId': parent.get('callId')},
        )
        return {
            'format': 'a2a/task-v1',
            'taskId': task.get('id'),
            'state': (task.get('status') or {}).get('state'),
            'artifacts': task.get('artifacts', []),
            'status': task.get('status'),
        }

    return {
        'name': name,
        'version': 1,
        'description': description,
        'permission': 'read',
        'parameters': {
            'type': 'object',
            'required': ['goal'],
            'properties': {'goal': {'type': 'string', 'minLength': 1}},
            'additionalProperties': False,
        },
        'execute': execute,
    }
