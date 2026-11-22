import json
import tempfile
import unittest
from pathlib import Path

from codingagentlib import (
    ACPServer,
    A2AClient,
    A2AServer,
    GenAITracer,
    HttpMCPTransport,
    HybridPlanReflexionAgent,
    ReactAgent,
    SSEStreamBridge,
    TraceContext,
    a2a_delegation_tool,
    agent_card,
    ag_ui_events,
    create_agent,
)
from codingagentlib.python.providers import (
    anthropic_tool_model,
    gemini_tool_model,
    openai_tool_model,
    tool_schemas,
    tool_use_to_react_model,
)
from codingagentlib.rpc import MCPService


class ReactProtocolsTests(unittest.TestCase):
    def test_provider_tool_use_apis_and_json_schema(self):
        tools = [{'name': 'read_file', 'description': 'Read a file', 'parameters': {'type': 'object', 'required': ['path'], 'properties': {'path': {'type': 'string'}}}}]
        self.assertEqual(tool_schemas(tools, provider='openai')[0]['type'], 'function')
        self.assertIn('input_schema', tool_schemas(tools, provider='anthropic')[0])
        self.assertIn('functionDeclarations', tool_schemas(tools, provider='gemini')[0])

        oa = openai_tool_model(
            endpoint='https://api.openai.com/v1/chat/completions',
            model_id='gpt-5',
            tools=tools,
            request=lambda url, body, headers: {
                'choices': [{'finish_reason': 'tool_calls', 'message': {'reasoning_content': 'Inspect file first', 'tool_calls': [{'id': 'call_1', 'function': {'name': 'read_file', 'arguments': '{"path":"a.txt"}'}}]}}],
                'usage': {'prompt_tokens': 10, 'completion_tokens': 5},
            },
        )
        turn_oa = oa([{'role': 'user', 'content': 'hi'}])
        self.assertEqual(turn_oa['stop_reason'], 'tool_use')
        self.assertEqual(turn_oa['reasoning'], 'Inspect file first')
        self.assertEqual(turn_oa['tool_calls'][0]['arguments'], {'path': 'a.txt'})
        self.assertEqual(turn_oa['usage'], {'input_tokens': 10, 'output_tokens': 5})

        ant = anthropic_tool_model(
            model_id='claude-sonnet',
            tools=tools,
            request=lambda url, body, headers: {
                'stop_reason': 'tool_use',
                'content': [
                    {'type': 'thinking', 'thinking': 'Need to read a.txt'},
                    {'type': 'tool_use', 'id': 'toolu_1', 'name': 'read_file', 'input': {'path': 'a.txt'}},
                ],
                'usage': {'input_tokens': 12, 'output_tokens': 7},
            },
        )
        turn_ant = ant([{'role': 'user', 'content': 'hi'}])
        self.assertEqual(turn_ant['stop_reason'], 'tool_use')
        self.assertEqual(turn_ant['reasoning'], 'Need to read a.txt')
        self.assertEqual(turn_ant['tool_calls'][0]['name'], 'read_file')

        gem = gemini_tool_model(
            model_id='gemini-2.5-pro',
            tools=tools,
            request=lambda url, body, headers: {
                'candidates': [{'finishReason': 'STOP', 'content': {'parts': [{'thought': True, 'text': 'Checking file'}, {'functionCall': {'name': 'read_file', 'args': {'path': 'a.txt'}}}]}}],
                'usageMetadata': {'promptTokenCount': 9, 'candidatesTokenCount': 4},
            },
        )
        turn_gem = gem([{'role': 'user', 'parts': [{'text': 'hi'}]}])
        self.assertEqual(turn_gem['stop_reason'], 'tool_use')
        self.assertEqual(turn_gem['reasoning'], 'Checking file')
        self.assertEqual(turn_gem['tool_calls'][0]['arguments'], {'path': 'a.txt'})

    def test_http_mcp_transport_with_mcp_service(self):
        with tempfile.TemporaryDirectory() as tmp:
            Path(tmp, 'hello.txt').write_text('world', encoding='utf-8')
            from codingagentlib import Runtime
            rt = Runtime(tmp)
            svc = MCPService(rt)

            def mock_http(url, frame, headers):
                return svc.frame(frame)

            transport = HttpMCPTransport('http://127.0.0.1:8000/api/mcp', request=mock_http)
            tools_res = transport.request('tools/list')
            self.assertTrue(any(t['name'] == 'read_file' for t in tools_res['tools']))
            call_res = transport.request('tools/call', {'name': 'read_file', 'arguments': {'path': 'hello.txt'}})
            self.assertFalse(call_res['isError'])
            rt.close()

    def test_a2a_nested_react_delegation(self):
        with tempfile.TemporaryDirectory() as tmp:
            Path(tmp, 'note.txt').write_text('subagent ok', encoding='utf-8')

            def run_subagent(goal, params):
                with ReactAgent(tmp) as sub:
                    calls = {'n': 0}

                    def sub_model(req):
                        calls['n'] += 1
                        if calls['n'] == 1:
                            return json.dumps({'sessionId': req['sessionId'], 'step': req['step'], 'status': 'act', 'plan': 'Read note', 'action': {'tool': 'read_file', 'args': {'path': 'note.txt'}}})
                        return json.dumps({'sessionId': req['sessionId'], 'step': req['step'], 'status': 'done', 'plan': 'Done', 'action': None, 'summary': 'Read note.txt successfully', 'outcome': 'complete'})

                    return sub.run(goal, sub_model)

            card = agent_card(name='HelperAgent', url='http://127.0.0.1:8000/api/a2a')
            srv = A2AServer(card=card, handler=run_subagent)
            client = A2AClient('http://127.0.0.1:8000/api/a2a', request=lambda url, body, headers: srv.handle(body))
            tool = a2a_delegation_tool(client=client)

            parent = create_agent(
                model=lambda req: (
                    {'sessionId': req['sessionId'], 'step': req['step'], 'status': 'done', 'plan': 'Finish', 'action': None, 'summary': 'Delegated ok'}
                    if any(e.get('kind') == 'tool_result' for e in req['events'])
                    else {'sessionId': req['sessionId'], 'step': req['step'], 'status': 'act', 'plan': 'Delegate over A2A', 'action': {'tool': 'delegate_a2a', 'args': {'goal': 'Check note.txt'}}}
                ),
                tools=[tool],
            )
            res = parent.run('Delegate check')
            self.assertEqual(res['status'], 'complete')
            self.assertEqual(len(srv.tasks), 1)
            fetched = client.get_task(next(iter(srv.tasks)))
            self.assertEqual(fetched['status']['state'], 'completed')
            self.assertTrue(len(fetched['artifacts']) >= 1)

    def test_acp_agui_sse_and_otel_genai_with_react_agent(self):
        with tempfile.TemporaryDirectory() as tmp:
            Path(tmp, 'app.py').write_text('x = 1\n', encoding='utf-8')
            tracer = GenAITracer(trace_context=TraceContext.parse('00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01'))
            bridge = SSEStreamBridge(fmt='ag-ui', run_id='run-42', thread_id='thread-42')

            step_counter = {'n': 0}

            def fake_openai(url, body, headers):
                step_counter['n'] += 1
                if step_counter['n'] == 1:
                    return {
                        'choices': [{'finish_reason': 'tool_calls', 'message': {'reasoning_content': 'Read app.py', 'tool_calls': [{'id': 'c1', 'function': {'name': 'read_file', 'arguments': '{"path":"app.py"}'}}]}}],
                        'usage': {'prompt_tokens': 20, 'completion_tokens': 8},
                    }
                return {
                    'choices': [{'finish_reason': 'stop', 'message': {'content': 'Verified app.py'}}],
                    'usage': {'prompt_tokens': 25, 'completion_tokens': 6},
                }

            oa_tool = openai_tool_model(endpoint='https://api.openai.com/v1/chat/completions', model_id='gpt-5', request=fake_openai)
            react_model = tool_use_to_react_model(oa_tool)

            with ReactAgent(tmp) as agent:
                result = agent.run('Inspect app.py', react_model, otel_tracer=tracer, stream_sink=bridge)

            self.assertEqual(result['status'], 'complete')
            sse_text = ''.join(bridge.frames)
            self.assertIn('event: RUN_STARTED', sse_text)
            self.assertIn('event: TOOL_CALL_START', sse_text)
            self.assertIn('event: TOOL_CALL_RESULT', sse_text)
            self.assertIn('event: RUN_FINISHED', sse_text)

            otlp = tracer.export_otlp_json()
            spans = otlp['resourceSpans'][0]['scopeSpans'][0]['spans']
            names = [s['name'] for s in spans]
            self.assertTrue(any(n.startswith('invoke_agent') for n in names))
            self.assertTrue(any(n.startswith('chat') for n in names))
            self.assertTrue(any(n.startswith('execute_tool') for n in names))

            # ACP (Zed) lifecycle check
            acp = ACPServer(prompt_handler=lambda sid, text, srv: (
                srv.emit_update(sid, {'sessionUpdate': 'agent_thought_chunk', 'content': {'type': 'text', 'text': 'Thinking...'}}),
                srv.request_permission(sid, tool_call_id='tc-1', title='Edit app.py'),
                {'stopReason': 'end_turn'},
            )[-1])
            init_res = acp.handle({'jsonrpc': '2.0', 'id': 1, 'method': 'initialize', 'params': {'protocolVersion': 1}})
            self.assertEqual(init_res['result']['protocolVersion'], 1)
            sid = acp.handle({'jsonrpc': '2.0', 'id': 2, 'method': 'session/new', 'params': {'cwd': tmp}})['result']['sessionId']
            prompt_res = acp.handle({'jsonrpc': '2.0', 'id': 3, 'method': 'session/prompt', 'params': {'sessionId': sid, 'prompt': [{'type': 'text', 'text': 'Fix app.py'}]}})
            self.assertEqual(prompt_res['result']['stopReason'], 'end_turn')
            self.assertEqual(acp.notifications[0]['method'], 'session/update')
            self.assertEqual(acp.notifications[1]['method'], 'session/request_permission')

    def test_hybrid_plan_execute_reflexion_react(self):
        with tempfile.TemporaryDirectory() as tmp:
            Path(tmp, 'real.txt').write_text('hello hybrid', encoding='utf-8')
            tracer = GenAITracer()
            bridge = SSEStreamBridge(fmt='ag-ui', run_id='hybrid-1', thread_id='t-1')

            def planner(goal):
                return [
                    {'id': 't1', 'title': 'Inspect file', 'goal': 'Read real.txt'},
                    {'id': 't2', 'title': 'Summarize', 'goal': 'Summarize findings', 'dependsOn': ['t1']},
                ]

            def executor(req):
                task_id = req['hybridContext']['taskId']
                sid, step = req['sessionId'], req['step']
                if task_id == 't1':
                    if step == 1:
                        return json.dumps({'sessionId': sid, 'step': step, 'status': 'act', 'plan': 'Try missing.txt', 'action': {'tool': 'read_file', 'args': {'path': 'missing.txt'}}})
                    if req.get('reflexionRequired'):
                        return json.dumps({
                            'sessionId': sid,
                            'step': step,
                            'status': 'act',
                            'plan': 'Retry with real.txt',
                            'reflection': {
                                'observation': 'missing.txt does not exist',
                                'adjustment': 'Read real.txt instead',
                                'evidenceIds': [req['reflexionRequired']['failedCallId']],
                            },
                            'action': {'tool': 'read_file', 'args': {'path': 'real.txt'}},
                        })
                    return json.dumps({'sessionId': sid, 'step': step, 'status': 'done', 'plan': 'Done t1', 'action': None, 'summary': 'Read real.txt', 'outcome': 'complete'})
                if task_id == 't2':
                    return json.dumps({'sessionId': sid, 'step': step, 'status': 'done', 'plan': 'Done t2', 'action': None, 'summary': 'Summarized', 'outcome': 'complete'})
                return json.dumps({'sessionId': sid, 'step': step, 'status': 'done', 'plan': 'Done t3', 'action': None, 'summary': 'Replanned ok', 'outcome': 'complete'})

            hybrid = HybridPlanReflexionAgent(tmp)
            res = hybrid.run('Hybrid goal', planner=planner, executor=executor, otel_tracer=tracer, stream_sink=bridge)
            self.assertEqual(res['status'], 'complete')
            self.assertEqual([t['taskId'] for t in res['tasks']], ['t1', 't2'])
            self.assertEqual(len(res['reflections']), 1)
            self.assertEqual(res['reflections'][0]['adjustment'], 'Read real.txt instead')
            self.assertTrue(len(tracer.spans) >= 3)
            self.assertTrue(any('TOOL_CALL_RESULT' in f for f in bridge.frames))

    def test_hybrid_adaptive_replanner(self):
        with tempfile.TemporaryDirectory() as tmp:
            def planner(goal):
                return [{'id': 't1', 'title': 'Failing step', 'goal': 'Try missing'}, {'id': 't2', 'title': 'Followup', 'dependsOn': ['t1']}]

            def executor(req):
                tid = req['hybridContext']['taskId']
                sid, step = req['sessionId'], req['step']
                if tid == 't1':
                    return json.dumps({'sessionId': sid, 'step': step, 'status': 'done', 'plan': 'Blocked', 'action': None, 'summary': 'Blocked on t1', 'outcome': 'blocked'})
                return json.dumps({'sessionId': sid, 'step': step, 'status': 'done', 'plan': 'Recovered', 'action': None, 'summary': 'Recovered via replan', 'outcome': 'complete'})

            def replanner(ctx):
                return {
                    'reflection': {'observation': 't1 blocked', 'adjustment': 'Switch to fallback task t_alt'},
                    'tasks': [{'id': 't_alt', 'title': 'Fallback task', 'goal': 'Run fallback'}],
                }

            res = HybridPlanReflexionAgent(tmp).run('Goal', planner=planner, executor=executor, replanner=replanner)
            self.assertEqual(res['status'], 'complete')
            self.assertEqual(res['replans'], 1)
            self.assertEqual([t['taskId'] for t in res['tasks']], ['t_alt'])
            self.assertTrue(any(r.get('replan') for r in res['reflections']))

    def test_server_protocol_endpoints_http(self):
        from functools import partial
        from http.server import ThreadingHTTPServer
        import threading
        import urllib.request
        from codingagentlib import Runtime
        from server.server import Handler

        with tempfile.TemporaryDirectory() as tmp:
            Path(tmp, 'sample.txt').write_text('server ok', encoding='utf-8')
            rt = Runtime(tmp)
            sid = rt.dispatch({'op': 'start', 'goal': 'Test stream and otel'})['id']
            rt.dispatch({'op': 'tool', 'session': sid, 'tool': 'read_file', 'args': {'path': 'sample.txt'}, 'callId': 'c1'})

            handler = partial(Handler, directory=tmp)
            httpd = ThreadingHTTPServer(('127.0.0.1', 0), handler)
            httpd.agent_runtime = rt
            port = httpd.server_address[1]
            t = threading.Thread(target=httpd.serve_forever, daemon=True)
            t.start()
            try:
                base = f'http://127.0.0.1:{port}'
                with urllib.request.urlopen(f'{base}/.well-known/agent.json', timeout=5) as resp:
                    card = json.loads(resp.read().decode('utf-8'))
                    self.assertIn('skills', card)

                mcp_identity = None
                def post_json(path, body):
                    nonlocal mcp_identity
                    req = urllib.request.Request(
                        base + path,
                        data=json.dumps(body).encode('utf-8'),
                        headers={'Content-Type': 'application/json', 'X-Architex-Request': '1', **({'Mcp-Session-Id': mcp_identity} if path == '/api/mcp' and mcp_identity else {})},
                        method='POST',
                    )
                    with urllib.request.urlopen(req, timeout=5) as resp:
                        if path == '/api/mcp': mcp_identity = resp.headers.get('Mcp-Session-Id', mcp_identity)
                        return resp.headers.get('Content-Type', ''), resp.read().decode('utf-8')

                _, a2a_raw = post_json('/api/a2a', {'jsonrpc': '2.0', 'id': 1, 'method': 'tasks/send', 'params': {'message': {'role': 'user', 'parts': [{'kind': 'text', 'text': 'hello a2a'}]}}})
                self.assertEqual(json.loads(a2a_raw)['result']['status']['state'], 'completed')

                post_json('/api/mcp', {'jsonrpc': '2.0', 'id': 1, 'method': 'initialize', 'params': {'protocolVersion': '2025-03-26'}})
                _, mcp_raw = post_json('/api/mcp', {'jsonrpc': '2.0', 'id': 2, 'method': 'tools/list', 'params': {}})
                self.assertTrue(any(tl['name'] == 'read_file' for tl in json.loads(mcp_raw)['result']['tools']))

                ctype, sse_raw = post_json('/api/agent/stream', {'session': sid, 'format': 'ag-ui'})
                self.assertIn('text/event-stream', ctype)
                self.assertIn('event: RUN_STARTED', sse_raw)
                self.assertIn('event: RUN_FINISHED', sse_raw)

                otel_req = urllib.request.Request(f'{base}/api/agent/otel?session={sid}', headers={'X-Architex-Request': '1'})
                with urllib.request.urlopen(otel_req, timeout=5) as resp:
                    otlp = json.loads(resp.read().decode('utf-8'))
                    self.assertTrue(len(otlp['resourceSpans'][0]['scopeSpans'][0]['spans']) >= 1)
            finally:
                httpd.shutdown()
                httpd.server_close()
                rt.close()


if __name__ == '__main__':
    unittest.main()
