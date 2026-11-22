"""HTTP MCP reconnects must not share JSON-RPC identities or permissions."""
import tempfile
import unittest
from codingagentlib import Runtime
from server.mcp_http import Sessions


class MCPHTTPSessionsTests(unittest.TestCase):
    def test_identity_reuse_is_scoped_and_missing_sessions_fail_closed(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        runtime = Runtime(temporary.name)
        self.addCleanup(runtime.close)
        sessions = Sessions(runtime, maximum=2)
        initialize = {'jsonrpc': '2.0', 'id': 0, 'method': 'initialize', 'params': {'protocolVersion': '2099-01-01'}}
        first = sessions.handle(initialize)
        second = sessions.handle(initialize)
        self.assertEqual(first[0], 200)
        self.assertEqual(second[0], 200)
        self.assertNotEqual(first[2], second[2])
        self.assertEqual(first[1]['result']['protocolVersion'], '2025-11-25')
        request = {'jsonrpc': '2.0', 'id': 1, 'method': 'tools/list'}
        self.assertIn('result', sessions.handle(request, first[2])[1])
        self.assertIn('result', sessions.handle(request, second[2])[1])
        self.assertEqual(sessions.handle(request)[0], 400)
        self.assertEqual(sessions.handle(request, 'unknown')[0], 404)
        self.assertEqual(sessions.handle(initialize)[0], 503)
        self.assertTrue(sessions.close(first[2]))
        self.assertEqual(sessions.handle(request, first[2])[0], 404)
        self.assertEqual(sessions.handle(initialize)[0], 200)
