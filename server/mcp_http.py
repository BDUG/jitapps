"""Bounded MCP Streamable HTTP sessions; authentication stays in the relay."""
import json
import secrets
import threading
import time

from codingagentlib.rpc import MCPService


class Sessions:
    def __init__(self, runtime, *, maximum=64, ttl=600):
        self.runtime, self.maximum, self.ttl = runtime, maximum, ttl
        self.sessions = {}
        self.lock = threading.RLock()

    def handle(self, data, identity=None):
        with self.lock:
            now = time.monotonic()
            for key, value in list(self.sessions.items()):
                if now - value['used'] > self.ttl:
                    self.close(key)
            if data.get('method') == 'initialize':
                if identity or data.get('id') is None:
                    return 400, self.error(data, 'Initialize a new MCP session without a session header'), None
                if len(self.sessions) >= self.maximum:
                    return 503, self.error(data, 'MCP session capacity reached'), None
                service = MCPService(self.runtime)
                result = service.frame(data)
                if 'error' in result:
                    self.runtime.dispatch({'op': 'cancel', 'session': service.session})
                    return 400, result, None
                identity = secrets.token_hex(24)
                self.sessions[identity] = {'service': service, 'used': now}
                return 200, result, identity
            entry = self.sessions.get(identity)
            if entry is None:
                return (404 if identity else 400), self.error(data, 'Initialize MCP and send its Mcp-Session-Id header'), None
            entry['used'] = now
            result = entry['service'].frame(data)
            return (202 if result is None else 200), result, identity

    @staticmethod
    def error(data, message):
        return {'jsonrpc': '2.0', 'id': data.get('id'), 'error': {'code': -32000, 'message': message}}

    def close(self, identity):
        with self.lock:
            entry = self.sessions.pop(identity, None)
            if entry:
                self.runtime.dispatch({'op': 'cancel', 'session': entry['service'].session})
            return entry is not None


def send(handler, status, value, identity=None):
    body = b'' if value is None else json.dumps(value, ensure_ascii=False).encode('utf-8')
    handler.send_response(status)
    handler.send_header('Content-Type', 'application/json')
    handler.send_header('Content-Length', str(len(body)))
    handler.send_header('Cache-Control', 'no-store')
    if identity:
        handler.send_header('Mcp-Session-Id', identity)
    if status == 405:
        handler.send_header('Allow', 'POST, DELETE')
    handler.end_headers()
    handler.wfile.write(body)
