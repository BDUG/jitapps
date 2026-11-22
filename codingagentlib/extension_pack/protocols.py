"""MCP filtering and authenticated A2A discovery using the host protocol clients."""
import json
import re
import urllib.request
from urllib.parse import urlsplit

from ..python.a2a import A2AClient
from ..python.extensions import expose_mcp
from .audit import redact


class DomainMCP:
    def __init__(self, namespace, tools, *, authorize, audit, max_bytes=16000, fields=None, secrets=()):
        if not re.fullmatch(r'[A-Za-z][A-Za-z0-9_-]{0,30}', namespace) or not 256 <= max_bytes <= 1000000:
            raise ValueError('Invalid MCP namespace/payload limit')
        self.audit = audit
        wrapped = []
        for tool in tools:
            name = namespace + '.' + tool['name']
            if len(name) > 100:
                raise ValueError('Namespaced tool name is too long')
            def execute(args, context, tool=tool, name=name):
                result = redact(tool['execute'](args, context), secrets)
                if fields is not None and isinstance(result, dict):
                    result = {key: result[key] for key in fields if key in result}
                encoded = json.dumps(result, ensure_ascii=False).encode()
                if len(encoded) > max_bytes:
                    preview = encoded[:max_bytes - 128].decode('utf-8', errors='ignore')
                    result = dict(truncated=True, preview=preview)
                    while len(json.dumps(result, ensure_ascii=False).encode()) > max_bytes:
                        preview = preview[:len(preview) // 2]
                        result['preview'] = preview
                self.audit('mcp.filtered', dict(sessionId=context.get('sessionId', 'unbound'),
                                                tool=name, originalBytes=len(encoded),
                                                filteredBytes=len(json.dumps(result).encode())))
                return result
            wrapped.append({**tool, 'name': name, 'execute': execute})
        self.dispatch = expose_mcp(tools=wrapped, authorize=authorize)

    def request(self, method, params=None, context=None):
        return self.dispatch(method, params, context)


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise PermissionError('Authenticated A2A redirects are forbidden')


class TrustedA2A:
    """Exact-card allowlist, Bearer credentials and host-verified peer identity.

    Token acquisition/refresh/validation is the host OAuth provider's job. The
    explicit verifier must bind authenticated identity to the expected Agent Card.
    This class refuses to silently equate possessing a bearer token with peer trust.
    """
    def __init__(self, registry, *, token_provider, verify_identity, audit):
        if not callable(token_provider) or not callable(verify_identity):
            raise ValueError('A2A requires OAuth/Bearer credentials and identity verification')
        self.registry, self.tokens, self.verify_identity, self.audit = registry, token_provider, verify_identity, audit
        self.opener = urllib.request.build_opener(NoRedirect())
        self.clients = {}

    @staticmethod
    def _origin(url):
        parsed = urlsplit(url)
        if parsed.username or parsed.password or parsed.fragment or parsed.query or not parsed.hostname:
            raise ValueError('Invalid trusted A2A URL')
        local = parsed.scheme == 'http' and parsed.hostname in ('localhost', '127.0.0.1', '::1')
        if parsed.scheme != 'https' and not local:
            raise ValueError('A2A requires HTTPS except on loopback')
        return parsed.scheme, parsed.hostname, parsed.port

    def _headers(self, name):
        token = self.tokens(name)
        if not isinstance(token, str) or not token or any(c.isspace() for c in token):
            raise PermissionError('A2A Bearer token required')
        return {'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json'}

    def discover(self, name, *, session_id='unbound'):
        entry = self.registry[name]
        card_url = entry['cardUrl']
        origin = self._origin(card_url)
        headers = self._headers(name)
        with self.opener.open(urllib.request.Request(card_url, headers=headers), timeout=15) as response:
            raw = response.read(100001)
        if len(raw) > 100000:
            raise ValueError('A2A card too large')
        card = json.loads(raw)
        if card.get('name') != entry['identity'] or self._origin(card['url']) != origin:
            raise PermissionError('Agent Card identity or endpoint origin mismatch')
        if self.verify_identity(name, card, headers['Authorization']) is not True:
            raise PermissionError('Authenticated A2A identity verification failed')
        def request(url, frame, _headers):
            fresh_headers = self._headers(name)
            if self.verify_identity(name, card, fresh_headers['Authorization']) is not True:
                raise PermissionError('A2A identity verification revoked')
            with self.opener.open(urllib.request.Request(url, data=json.dumps(frame).encode(),
                                                         headers=fresh_headers), timeout=30) as response:
                raw = response.read(1000001)
            if len(raw) > 1000000:
                raise ValueError('A2A task payload too large')
            reply = json.loads(raw)
            if reply.get('jsonrpc') != '2.0' or reply.get('id') != frame['id']:
                raise ValueError('A2A response identity mismatch')
            self.audit('a2a.transition', dict(sessionId=session_id, peer=name, method=frame['method'],
                                             taskState=reply.get('result', {}).get('status', {}).get('state')))
            return reply
        self.clients[name] = A2AClient(card['url'], request=request)
        self.audit('a2a.discovered', dict(sessionId=session_id, peer=name, skills=card.get('skills', [])))
        return card

    def delegate(self, name, goal, *, session_id, task_id=None):
        self.discover(name, session_id=session_id)
        return self.clients[name].send_task(goal, task_id=task_id, session_id=session_id)

    def task(self, name, task_id):
        return self.clients[name].get_task(task_id)

    def cancel(self, name, task_id):
        return self.clients[name].cancel_task(task_id)
