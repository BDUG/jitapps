"""Real stdio/HTTP interoperability with the independently maintained MCP SDK."""
import asyncio
from datetime import timedelta
from importlib.metadata import version
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import threading

import httpx
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client
from mcp.client.streamable_http import streamable_http_client

ROOT = Path(__file__).resolve().parents[2]


async def exercise(session, workspace):
    initialized = await session.initialize()
    assert initialized.protocolVersion in ('2025-06-18', '2025-11-25')
    tools = await session.list_tools()
    assert any(tool.name == 'read_file' for tool in tools.tools)
    read = await session.call_tool('read_file', {'path': 'sample.txt'})
    assert not read.isError
    assert read.structuredContent['result']['text'] == 'independent MCP peer 😀'
    denied = await session.call_tool('write_file', {'path': 'sample.txt', 'content': 'forbidden', 'expectedHash': read.structuredContent['result']['hash']})
    assert denied.isError
    assert (workspace / 'sample.txt').read_text() == 'independent MCP peer 😀'
    await session.send_notification(__import__('mcp').types.ClientNotification(__import__('mcp').types.CancelledNotification(
        method='notifications/cancelled', params=__import__('mcp').types.CancelledNotificationParams(requestId=999, reason='qualification'))))
    return initialized.protocolVersion


async def main():
    results = []
    with tempfile.TemporaryDirectory(prefix='mcp-independent-') as temporary:
        folder = Path(temporary)
        (folder / 'sample.txt').write_text('independent MCP peer 😀')
        parameters = StdioServerParameters(command=sys.executable, args=['-m', 'codingagentlib.rpc', '--workspace', str(folder)],
                                           env={**os.environ, 'PYTHONPATH': str(ROOT)})
        async with stdio_client(parameters) as (read, write):
            async with ClientSession(read, write, read_timeout_seconds=timedelta(seconds=5)) as session:
                protocol = await exercise(session, folder)
                results.append({'transport': 'stdio', 'protocolVersion': protocol, 'passed': True})
        child = subprocess.Popen([sys.executable, '-u', 'server/server.py', '--port', '0', '--skills-offline',
            '--config', str(folder / 'providers.json'), '--search-config', str(folder / 'search.json'),
            '--agent-workspace', str(folder), '--agent-state-dir', str(folder / 'state')],
            cwd=ROOT, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True)
        try:
            startup = await asyncio.wait_for(asyncio.to_thread(child.stdout.readline), timeout=20)
            assert 'listening on ' in startup, startup
            base = 'http://' + startup.split('listening on ', 1)[1].strip()
            async with httpx.AsyncClient(headers={'X-Architex-Request': '1', 'Origin': base}, timeout=10) as http:
                for attempt in range(2):
                    async with streamable_http_client(base + '/api/mcp', http_client=http) as (read, write, identity):
                        async with ClientSession(read, write, read_timeout_seconds=timedelta(seconds=5)) as session:
                            protocol = await exercise(session, folder)
                            assert identity()
                            results.append({'transport': 'streamable-http', 'connection': attempt + 1,
                                            'protocolVersion': protocol, 'passed': True})
                rejected = await http.post(base + '/api/mcp', json={'jsonrpc': '2.0', 'id': 1, 'method': 'tools/list'})
                assert rejected.status_code == 400
                wrong_session = await http.post(base + '/api/mcp', headers={'Mcp-Session-Id': 'unknown'},
                    json={'jsonrpc': '2.0', 'id': 1, 'method': 'tools/list'})
                assert wrong_session.status_code == 404
            async with httpx.AsyncClient() as unauthorized:
                rejected = await unauthorized.post(base + '/api/mcp', json={'jsonrpc': '2.0', 'id': 1, 'method': 'initialize'})
                assert rejected.status_code == 403
            results.append({'transport': 'streamable-http', 'checks': ['fresh-session reconnect', 'missing/invalid session rejection',
                'origin authorization', 'read-only tools', 'cancellation notification'], 'passed': True})
        finally:
            child.terminate()
            await asyncio.to_thread(child.wait, 5)
    report = {'format': 'independent-protocol-qualification/v1', 'protocol': 'MCP',
              'peer': {'name': 'modelcontextprotocol/python-sdk', 'version': version('mcp')}, 'passed': True, 'results': results}
    if len(sys.argv) > 1:
        Path(sys.argv[1]).write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps(report))


if __name__ == '__main__':
    asyncio.run(main())
