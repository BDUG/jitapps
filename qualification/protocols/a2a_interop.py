"""Bidirectional A2A v0.3 interoperability through the official SDK's compat transport."""
import asyncio
from importlib.metadata import version
import json
from pathlib import Path
import socket
import subprocess
import sys
import tempfile
import uuid

import httpx
from a2a.client import ClientConfig
from a2a.compat.v0_3.jsonrpc_transport import CompatJsonRpcTransport
from a2a.compat.v0_3.types import AgentCard as Card03
from a2a.server.agent_execution import AgentExecutor
from a2a.server.request_handlers import DefaultRequestHandler
from a2a.server.routes.jsonrpc_routes import create_jsonrpc_routes
from a2a.server.tasks import InMemoryTaskStore
from a2a.types import AgentCard, AgentCapabilities, AgentSkill, AgentInterface, Message, Part, Role, SendMessageRequest, GetTaskRequest, CancelTaskRequest
from starlette.applications import Starlette
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse
import uvicorn

from codingagentlib.python.a2a import A2AClient

ROOT = Path(__file__).resolve().parents[2]


class Echo(AgentExecutor):
    async def execute(self, context, event_queue):
        await event_queue.enqueue_event(Message(message_id=uuid.uuid4().hex, context_id=context.context_id,
            role=Role.ROLE_AGENT, parts=[Part(text='official peer: ' + context.get_user_input())]))

    async def cancel(self, context, event_queue):
        pass


class Auth(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        if request.headers.get('Authorization') != 'Bearer qualification-only':
            return JSONResponse({'error': 'Unauthorized'}, status_code=403)
        return await call_next(request)


async def main():
    results = []
    with tempfile.TemporaryDirectory(prefix='a2a-peer-') as temporary:
        folder = Path(temporary)
        child = subprocess.Popen([sys.executable, '-u', 'server/server.py', '--port', '0', '--skills-offline',
            '--config', str(folder / 'providers.json'), '--search-config', str(folder / 'search.json'),
            '--agent-workspace', str(folder), '--agent-state-dir', str(folder / 'state')], cwd=ROOT,
            stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True)
        try:
            line = await asyncio.wait_for(asyncio.to_thread(child.stdout.readline), timeout=20)
            base = 'http://' + line.split('listening on ', 1)[1].strip()
            async with httpx.AsyncClient(headers={'X-Architex-Request': '1', 'Origin': base}, timeout=10) as http:
                card = Card03.model_validate((await http.get(base + '/.well-known/agent-card.json')).json())
                assert card.protocol_version == '0.3.0' and not card.capabilities.streaming
                transport = CompatJsonRpcTransport(http, None, base + '/api/a2a', is_shared_httpx=True)
                response = await transport.send_message(SendMessageRequest(message=Message(message_id=uuid.uuid4().hex,
                    role=Role.ROLE_USER, parts=[Part(text='independent SDK message')])) )
                assert response.task.id and response.task.context_id
                retrieved = await transport.get_task(GetTaskRequest(id=response.task.id))
                assert retrieved.id == response.task.id
                try:
                    await transport.cancel_task(CancelTaskRequest(id=response.task.id))
                except Exception:
                    pass
                else:
                    raise AssertionError('Completed task cancellation was accepted')
                invalid = await http.post(base + '/api/a2a', json={'jsonrpc': '2.0', 'id': 7, 'method': 'message/send', 'params': []})
                assert invalid.json()['error']['code'] == -32602
                results.append({'direction': 'official client -> TLAL Python server', 'transport': 'HTTP JSON-RPC',
                    'checks': ['typed card/task/message validation', 'send/get', 'terminal cancellation rejection', 'malformed params'], 'passed': True})
        finally:
            child.terminate(); await asyncio.to_thread(child.wait, 5)
    sock = socket.socket(); sock.bind(('127.0.0.1', 0)); sock.listen(20)
    port = sock.getsockname()[1]
    card = AgentCard(name='Independent SDK peer', description='Qualification fixture', version='1.0.0',
        supported_interfaces=[AgentInterface(url=f'http://127.0.0.1:{port}/rpc', protocol_binding='JSONRPC', protocol_version='1.0')],
        default_input_modes=['text/plain'], default_output_modes=['text/plain'], capabilities=AgentCapabilities(streaming=True), skills=[AgentSkill(id='echo',name='Echo',description='Echo synthetic qualification text',tags=['qualification'])])
    handler = DefaultRequestHandler(Echo(), InMemoryTaskStore(), card)
    app = Starlette(routes=create_jsonrpc_routes(handler, '/rpc', enable_v0_3_compat=True))
    app.add_middleware(Auth)
    server = uvicorn.Server(uvicorn.Config(app, log_level='error', lifespan='off'))
    task = asyncio.create_task(server.serve(sockets=[sock]))
    try:
        while not server.started: await asyncio.sleep(.02)
        url = f'http://127.0.0.1:{port}/rpc'
        client = A2AClient(url, headers={'Authorization': 'Bearer qualification-only'})
        response = await asyncio.to_thread(client.send_task, 'reverse Python message')
        assert response['parts'][0]['text'] == 'official peer: reverse Python message'
        results.append({'direction': 'TLAL Python client -> official server', 'transport': 'HTTP JSON-RPC', 'passed': True})
        program = "const {A2AClient}=require('./codingagentlib/javascript/a2a.js');new A2AClient({endpoint:process.argv[1],headers:{Authorization:'Bearer qualification-only'}}).sendTask('reverse JavaScript message').then(r=>{require('node:assert/strict').equal(r.parts[0].text,'official peer: reverse JavaScript message');console.log('PASS JS reverse A2A');}).catch(e=>{console.error(e);process.exitCode=1});"
        node = await asyncio.create_subprocess_exec('node', '-e', program, url, cwd=ROOT,
            stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE)
        out, error = await node.communicate()
        assert node.returncode == 0, error.decode()
        async with httpx.AsyncClient() as unauthorized:
            denied = await unauthorized.post(url, json={'jsonrpc': '2.0', 'id': 1, 'method': 'message/send'})
            assert denied.status_code == 403
        results.append({'direction': 'TLAL JavaScript client -> official server', 'transport': 'HTTP JSON-RPC',
                        'checks': ['send', 'authenticated peer', 'unauthenticated rejection'], 'passed': True})
    finally:
        server.should_exit = True
        await task
    report = {'format': 'independent-protocol-qualification/v1', 'protocol': 'A2A', 'wireVersion': '0.3.0',
        'peer': {'name': 'a2aproject/a2a-python', 'version': version('a2a-sdk'), 'mode': 'official v0.3 compatibility transport'},
        'passed': True, 'results': results,
        'limitations': ['No A2A v1.0 wire claim.', 'A2A streaming is not advertised by the default TLAL server.']}
    if len(sys.argv) > 1: Path(sys.argv[1]).write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps(report))


if __name__ == '__main__': asyncio.run(main())
