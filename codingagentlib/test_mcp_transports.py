import json
from pathlib import Path
import sys
import time
import unittest
from .python.mcp_transports import frame_kind, RPCTransport, ShellMCP
from .python.extensions import mcp_tools

ROOT = Path(__file__).parent
PEER = ROOT / 'conformance' / 'fixtures' / 'mcp_server.py'


class MCPTransportTests(unittest.TestCase):
    def test_shared_tool_result_conformance(self):
        for case in json.loads((ROOT/'conformance'/'mcp-frames-v1.json').read_text())['toolResults']:
            class Transport:
                def request(self, method, params):
                    return dict(tools=[dict(name='echo', inputSchema=dict(type='object'))]) if method == 'tools/list' else case['result']
            with self.subTest(name=case['name']):
                tool=mcp_tools(transport=Transport(),trust=lambda *args: True)[0]
                if case['valid']:
                    self.assertEqual(tool['execute']({}, {}),case['result'])
                else:
                    with self.assertRaises(ValueError) as raised:
                        tool['execute']({}, {})
                    self.assertTrue(raised.exception.uncertain)

    def test_shared_frame_conformance(self):
        for case in json.loads((ROOT/'conformance'/'mcp-frames-v1.json').read_text())['cases']:
            with self.subTest(name=case['name']):
                if case['valid']:
                    self.assertEqual(frame_kind(case['frame']), case['kind'])
                else:
                    with self.assertRaises(ValueError):
                        frame_kind(case['frame'])

    def test_injected_rpc_rejects_malformed_envelopes_and_accepts_null(self):
        for frame in [dict(jsonrpc='2.0', id=1), dict(jsonrpc='2.0', id=1, method='roots/list'),
                      dict(jsonrpc='2.0', id=1, error=None)]:
            with self.subTest(frame=frame), self.assertRaises(ValueError):
                RPCTransport(lambda _: frame).request('ping', {})
        self.assertIsNone(RPCTransport(lambda _: dict(jsonrpc='2.0', id=1, result=None)).request('ping', {}))
        for value in (float('nan'), float('inf'), object(), {1: 'invalid-key'}):
            with self.subTest(value=value), self.assertRaises(ValueError):
                RPCTransport(lambda _: dict(jsonrpc='2.0',id=1,result=value)).request('ping',{})

    def test_shell_interleaves_notifications_and_declines_client_requests(self):
        with ShellMCP(sys.executable, [str(PEER)], timeout=2) as transport:
            self.assertEqual(transport.request('tools/list', {}), dict(tools=[]))
            self.assertEqual(transport.request('ping', {}), dict(alive=True))
        self.assertIsNotNone(transport.process.poll())

    def test_shell_rejects_and_closes_invalid_peers(self):
        for mode in ('missing-result', 'both-results', 'wrong-id', 'invalid-notification', 'invalid-error', 'unicode-overflow'):
            with self.subTest(mode=mode), ShellMCP(sys.executable, [str(PEER), mode], timeout=2) as transport:
                with self.assertRaises((ValueError, RuntimeError)) as raised:
                    transport.request('tools/list', {})
                self.assertTrue(raised.exception.uncertain)
                self.assertTrue(transport.closed)
                self.assertIsNotNone(transport.process.poll())
                with self.assertRaises(RuntimeError):
                    transport.request('ping', {})

    def test_remote_error_keeps_transport_open_and_integral_ids_correlate(self):
        with ShellMCP(sys.executable, [str(PEER), 'tool-error'], timeout=2) as transport:
            with self.assertRaisesRegex(RuntimeError, 'Rejected arguments'):
                transport.request('tools/list', {})
            self.assertEqual(transport.request('ping', {}), dict(alive=True))
        with ShellMCP(sys.executable, [str(PEER), 'numeric-id'], timeout=2) as transport:
            self.assertEqual(transport.request('tools/list', {}), dict(tools=[]))

    def test_notifications_do_not_extend_request_deadline(self):
        with ShellMCP(sys.executable, [str(PEER), 'notification-timeout'], timeout=.3) as transport:
            started = time.monotonic()
            with self.assertRaises(TimeoutError) as raised:
                transport.request('tools/list', {})
            self.assertTrue(raised.exception.uncertain)
            self.assertLess(time.monotonic()-started, 2)
            self.assertTrue(transport.closed)
