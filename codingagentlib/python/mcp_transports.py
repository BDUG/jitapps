"""Optional literal-argv MCP shell and injected JSON-RPC transports."""
import json
import math
import queue
import subprocess
import threading
import time
from pathlib import Path
import os
import shutil


def json_data(value):
    if value is None or isinstance(value, (str, bool, int)):
        return True
    if isinstance(value, float):
        return math.isfinite(value)
    if isinstance(value, list):
        return all(json_data(item) for item in value)
    return isinstance(value, dict) and all(isinstance(key, str) and json_data(item) for key, item in value.items())


def frame_kind(frame):
    def integer(value):
        return type(value) in (int, float) and abs(value) <= 2**53-1 and math.isfinite(value) and value == int(value)
    def identity(value):
        return value is None or isinstance(value, str) or integer(value)
    if not isinstance(frame, dict) or frame.get('jsonrpc') != '2.0' or not json_data(frame):
        raise ValueError('Invalid MCP JSON-RPC frame')
    if 'method' in frame:
        if (not isinstance(frame['method'], str) or not frame['method']
                or 'result' in frame or 'error' in frame
                or 'id' in frame and not identity(frame['id'])
                or 'params' in frame and not isinstance(frame['params'], (dict, list))):
            raise ValueError('Invalid MCP JSON-RPC request')
        return 'request' if 'id' in frame else 'notification'
    if ('id' not in frame or not identity(frame['id'])
            or ('result' in frame) == ('error' in frame) or 'params' in frame):
        raise ValueError('Invalid MCP JSON-RPC response')
    if 'error' in frame:
        error = frame['error']
        if (not isinstance(error, dict) or not integer(error.get('code'))
                or not isinstance(error.get('message'), str)):
            raise ValueError('Invalid MCP JSON-RPC error')
    return 'response'


def result(frame, identity):
    if (not isinstance(frame, dict) or frame.get('jsonrpc') != '2.0'
            or frame.get('id') != identity):
        raise ValueError('RPC response identity mismatch')
    if frame_kind(frame) != 'response':
        raise ValueError('Expected an MCP JSON-RPC response')
    if 'error' in frame:
        raise RuntimeError(frame['error']['message'] or 'RPC failed')
    return frame['result']


class RPCTransport:
    def __init__(self, send):
        if not callable(send):
            raise ValueError('Provide an RPC sender')
        self.send, self.sequence, self.lock = send, 0, threading.Lock()

    def request(self, method, params):
        with self.lock:
            self.sequence += 1
            identity = self.sequence
        request = dict(jsonrpc='2.0', id=identity, method=method, params=params)
        frame_kind(request)
        return result(self.send(request), identity)

    def notify(self, method, params):
        request = dict(jsonrpc='2.0', method=method, params=params)
        frame_kind(request)
        self.send(request)


class ShellMCP:
    def __init__(self, command, args=(), *, cwd=None, env=None, timeout=30):
        if (not isinstance(args, (list, tuple)) or any(not isinstance(v, str) for v in args)
                or type(timeout) not in (int, float) or not math.isfinite(timeout) or not 0 < timeout <= 600):
            raise ValueError('Use literal argv and a bounded timeout')
        search = env.get('PATH', os.defpath) if env is not None else None
        executable = shutil.which(command, path=search)
        if not executable and os.path.dirname(command) and not Path(command).exists():
            executable = shutil.which(Path(command).name, path=search)
        if not executable:
            raise FileNotFoundError('MCP executable not found')
        self.process = subprocess.Popen([executable, *args], cwd=cwd, env=env,
                                        stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                                        stderr=subprocess.DEVNULL, shell=False)
        self.timeout, self.queue, self.sequence = timeout, queue.Queue(maxsize=64), 0
        self.lock, self.closed, self.failure = threading.Lock(), False, None

        def read():
            try:
                while True:
                    line = self.process.stdout.readline(8000001)
                    if not line:
                        raise RuntimeError('MCP process exited; inspect uncertain calls')
                    if len(line) > 8000000:
                        raise ValueError('MCP response exceeds 8 MB')
                    def invalid_constant(value):
                        raise ValueError('Nonfinite JSON value: ' + value)
                    frame = json.loads(line.decode('utf-8'), parse_constant=invalid_constant)
                    if frame_kind(frame) != 'notification':
                        self.queue.put_nowait(frame)
            except Exception as error:
                if isinstance(error, queue.Full):
                    error = ValueError('MCP pending output exceeds 64 frames')
                self.failure = error
                try:
                    self.queue.put_nowait(error)
                except queue.Full:
                    pass
                if self.process.poll() is None:
                    try:
                        self.process.terminate()
                    except OSError:
                        pass
        threading.Thread(target=read, daemon=True).start()
        try:
            value = self.request('initialize', dict(protocolVersion='2025-03-26', capabilities={},
                                                  clientInfo=dict(name='codingagentlib', version='1.0.0')))
            if value.get('protocolVersion') != '2025-03-26':
                raise ValueError('MCP version mismatch')
            self.notify('notifications/initialized', {})
        except BaseException:
            self.close()
            raise

    def _send(self, frame):
        frame_kind(frame)
        self.process.stdin.write((json.dumps(frame, allow_nan=False) + '\n').encode('utf-8'))
        self.process.stdin.flush()

    def request(self, method, params):
        with self.lock:
            if self.closed:
                raise RuntimeError('MCP transport closed')
            if self.failure:
                error = self.failure
                self.close()
                raise error
            self.sequence += 1
            identity = self.sequence
            request = dict(jsonrpc='2.0', id=identity, method=method, params=params)
            frame_kind(request)
            try:
                self._send(request)
                deadline = time.monotonic() + self.timeout
                while True:
                    remaining = deadline - time.monotonic()
                    if remaining <= 0:
                        raise queue.Empty
                    frame = self.queue.get(timeout=remaining)
                    if isinstance(frame, Exception):
                        raise frame
                    if frame_kind(frame) == 'request':
                        self._send(dict(jsonrpc='2.0', id=frame['id'],
                                        error=dict(code=-32601, message='Client method not supported')))
                        continue
                    if frame.get('id') != identity:
                        raise ValueError('RPC response identity mismatch')
                    break
            except Exception as error:
                self.close()
                if isinstance(error, queue.Empty):
                    error = TimeoutError('MCP timeout; outcome may be uncertain')
                error.uncertain = True
                raise error
            return result(frame, identity)

    def notify(self, method, params):
        with self.lock:
            if self.closed:
                raise RuntimeError('MCP transport closed')
            if self.failure:
                error = self.failure
                self.close()
                raise error
            self._send(dict(jsonrpc='2.0', method=method, params=params))

    def close(self):
        if self.closed:
            return
        self.closed = True
        if self.process.poll() is None:
            self.process.terminate()
        try:
            self.process.wait(timeout=2)
        except subprocess.TimeoutExpired:
            self.process.kill()
            self.process.wait()
        for stream in (self.process.stdin, self.process.stdout):
            try:
                stream.close()
            except OSError:
                pass

    def __enter__(self):
        return self

    def __exit__(self, *args):
        self.close()


class HttpMCPTransport:
    """MCP Streamable HTTP / JSON-RPC transport using a host-provided or urllib HTTP requester."""

    def __init__(self, endpoint, *, request=None, headers=None, protocol_version='2025-06-18', timeout=15.0):
        from urllib.parse import urlsplit
        url = urlsplit(endpoint)
        local = url.scheme == 'http' and url.hostname in ('localhost', '127.0.0.1', '::1')
        if (url.scheme != 'https' and not local) or not url.hostname:
            raise ValueError('Invalid MCP HTTP endpoint')
        self.endpoint = endpoint
        self.headers = dict(headers or {})
        self.protocol_version = protocol_version
        self.timeout = timeout
        self.session_id = None
        self.initialized = False
        self.next_id = 0
        self._request = request or self._default_request

    def _default_request(self, url, body, headers):
        import urllib.request
        req = urllib.request.Request(url, data=json.dumps(body).encode('utf-8'), headers=headers, method='POST')
        with urllib.request.urlopen(req, timeout=self.timeout) as resp:
            raw = resp.read().decode('utf-8')
            sid = resp.headers.get('Mcp-Session-Id')
            if sid:
                self.session_id = sid
            return json.loads(raw) if raw.strip() else {}

    def initialize(self):
        res = self.request('initialize', {'protocolVersion': self.protocol_version, 'capabilities': {}, 'clientInfo': {'name': 'codingagentlib', 'version': '1.0.0'}})
        self.initialized = True
        return res

    def request(self, method, params=None):
        if not self.initialized and method != 'initialize':
            self.initialize()
        self.next_id += 1
        identity = self.next_id
        frame = {'jsonrpc': '2.0', 'id': identity, 'method': method, 'params': params or {}}
        headers = {'Content-Type': 'application/json', 'Accept': 'application/json, text/event-stream', 'MCP-Protocol-Version': self.protocol_version, **self.headers}
        if self.session_id:
            headers['Mcp-Session-Id'] = self.session_id
        reply = self._request(self.endpoint, frame, headers)
        return result(reply, identity)

    def notify(self, method, params=None):
        frame = {'jsonrpc': '2.0', 'method': method, 'params': params or {}}
        headers = {'Content-Type': 'application/json', 'MCP-Protocol-Version': self.protocol_version, **self.headers}
        if self.session_id:
            headers['Mcp-Session-Id'] = self.session_id
        self._request(self.endpoint, frame, headers)

    def close(self):
        self.initialized = False

    def __enter__(self):
        return self

    def __exit__(self, *args):
        self.close()
