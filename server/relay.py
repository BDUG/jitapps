#!/usr/bin/env python3
"""Static Architex server and same-origin, non-persistent AI request relay."""
from __future__ import annotations
import argparse
import ipaddress
import socket
import http.client
import json
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import ssl
import os
import sys
sys.dont_write_bytecode = True
from . import relay_config
import urllib.error
import urllib.parse
import urllib.request

MAX_REQUEST = 2 * 1024 * 1024
ALLOWED_HEADERS = {'content-type', 'authorization', 'x-goog-api-key', 'x-title'}

class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None

def validate_request(data):
    if not isinstance(data, dict) or set(data) != {'url', 'headers', 'body'}:
        raise ValueError('Expected a chat request with url, headers and body')
    if not isinstance(data['url'], str) or len(data['url']) > 2000:
        raise ValueError('Invalid provider URL')
    if any(c.isspace() or ord(c)<32 or ord(c)==127 for c in data['url']):
        raise ValueError('Provider URL must not contain spaces or control characters')
    url = urllib.parse.urlsplit(data['url'])
    hostname = url.hostname or ''
    try:
        loopback = hostname == 'localhost' or ipaddress.ip_address(hostname).is_loopback
    except ValueError:
        loopback = hostname == 'localhost'
    if url.scheme != 'https' and not (url.scheme == 'http' and loopback):
        raise ValueError('Provider URLs must use HTTPS, or loopback HTTP')
    if not hostname or url.username or url.password or url.fragment:
        raise ValueError('Provider URL must not contain credentials or fragments')
    if not (url.path.endswith('/chat/completions') or url.path.endswith(':generateContent') or url.path.endswith('/text/chat')):
        raise ValueError('Use a complete chat/completions, generateContent or text/chat endpoint')
    if not isinstance(data['headers'], dict) or not isinstance(data['body'], dict):
        raise ValueError('Invalid provider headers or chat body')
    headers = {}
    for key, value in data['headers'].items():
        if not isinstance(key, str) or key.lower() not in ALLOWED_HEADERS or not isinstance(value, str) or len(value) > 10000 or '\r' in value or '\n' in value:
            raise ValueError('Unsupported provider header')
        headers[key] = value
    if not any(key.lower() == 'content-type' and value == 'application/json' for key, value in headers.items()):
        raise ValueError('Chat requests require application/json')
    body = data['body']
    if not any(isinstance(body.get(field), (list, str)) for field in ('messages', 'contents', 'text')):
        raise ValueError('Chat request has no conversation')
    return data['url'], headers, json.dumps(body).encode('utf-8')

def validate_origin(value):
    url = urllib.parse.urlsplit(value)
    if url.scheme not in {'http', 'https'} or not url.hostname or url.username or url.password or url.path not in {'', '/'} or url.query or url.fragment:
        raise ValueError('Use an exact http(s) origin without a path, credentials or wildcards')
    if '*' in value:
        raise ValueError('Wildcard origins are not allowed')
    return f'{url.scheme}://{url.netloc}'

class Handler(SimpleHTTPRequestHandler):
    def cors_origin(self):
        origin = self.headers.get('Origin')
        return origin if origin and origin in (getattr(self.server, 'allowed_origins', set()) | set(self.server.store.snapshot().get('allowedOrigins',[]) if hasattr(self.server,'store') else [])) else None

    def do_OPTIONS(self):
        origin = self.cors_origin()
        requested = {h.strip().lower() for h in self.headers.get('Access-Control-Request-Headers', '').split(',') if h.strip()}
        method = self.headers.get('Access-Control-Request-Method')
        if not origin or self.path not in {'/api/chat', '/api/health'} or method not in ({'POST'} if self.path == '/api/chat' else {'GET'}) or not requested.issubset({'content-type', 'x-architex-request'}):
            self.send_json(403, {'error': 'Origin, route, method or headers not allowed for CORS'})
            return
        self.send_response(204)
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, X-Architex-Request')
        self.send_header('Access-Control-Max-Age', '600')
        if self.headers.get('Access-Control-Request-Private-Network') == 'true':
            self.send_header('Access-Control-Allow-Private-Network', 'true')
        self.send_header('Content-Length', '0')
        self.end_headers()

    def end_headers(self):
        self.send_header('X-Content-Type-Options', 'nosniff')
        if self.path.startswith('/api/'):
            self.send_header('Cache-Control', 'no-store')
            self.send_header('Vary', 'Origin')
            if self.path in {'/api/chat','/api/health'} and self.cors_origin():
                self.send_header('Access-Control-Allow-Origin', self.cors_origin())
        super().end_headers()

    def send_json(self, status, body):
        payload = json.dumps(body).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def local_admin(self):
        host=self.headers.get('Host','')
        return urllib.parse.urlsplit('http://'+host).hostname in {'localhost','127.0.0.1','::1'} and self.headers.get('Origin','http://'+host)=='http://'+host and self.headers.get('Sec-Fetch-Site')!='cross-site'

    def send_head(self):
        # A custom --config file must never be exposed by the static file server.
        if hasattr(self.server,'store') and Path(self.translate_path(self.path)).resolve()==self.server.store.path.resolve():
            self.send_error(404)
            return None
        return super().send_head()

    def do_GET(self):
        if self.path == '/api/health':
            profile = self.server.store.active() if hasattr(self.server, 'store') else {}
            self.send_json(200, {'service':'architex','chatRelay':True,'protocolVersion':2,'providerDiagnosticsVersion':1,'providerConfigured':bool(profile.get('apiKey')) or profile.get('provider')=='litellm'})
        elif self.path.startswith('/api/admin/'):
            if not self.local_admin() or self.headers.get('X-Architex-Admin')!='1':
                self.send_json(403,{'error':'Provider administration is available only from the relay UI on its own local origin'})
                return
            if self.path in {'/api/admin/config','/api/admin/export'}:
                self.send_json(200,self.server.store.snapshot())
            else: self.send_json(404,{'error':'Unknown administration route'})
        elif self.path.startswith('/api/'):
            self.send_json(404, {'error':'Unknown API route'})
        elif self.path in {'/relay','/relay/'}:
            self.path='/architex/relay.html'
            super().do_GET()
        else: super().do_GET()

    def do_POST(self):
        admin=self.path.startswith('/api/admin/')
        if self.path not in {'/api/chat','/api/admin/config','/api/admin/import','/api/admin/export','/api/admin/test'}:
            self.send_json(404, {'error':'Unknown API route'})
            return
        if admin:
            if not self.local_admin() or self.headers.get('X-Architex-Admin')!='1':
                self.send_json(403,{'error':'Use the relay settings UI on its own local origin'})
                return
        else:
            host=self.headers.get('Host','')
            origin=self.headers.get('Origin')
            local=urllib.parse.urlsplit('http://'+host).hostname in {'localhost','127.0.0.1','::1'}
            if not local or self.headers.get('X-Architex-Request')!='1' or (origin and origin!='http://'+host and not self.cors_origin()) or (self.headers.get('Sec-Fetch-Site')=='cross-site' and not self.cors_origin()):
                self.send_json(403,{'error':'Use the local relay or configure its exact allowed app origin in relay settings'})
                return
        if self.headers.get_content_type()!='application/json':
            self.send_json(415,{'error':'Use application/json'})
            return
        try:
            size=int(self.headers.get('Content-Length','0'))
            if size<=0 or (admin and size>MAX_REQUEST): raise ValueError('Invalid request size')
            data=json.loads(self.rfile.read(size))
            if admin and self.path in {'/api/admin/config','/api/admin/import'}:
                if not isinstance(data,dict): raise ValueError('Invalid configuration')
                data['allowedOrigins']=[validate_origin(o) for o in data.get('allowedOrigins',[])]
                self.server.store.save(data,keep_keys=self.path!='/api/admin/import')
                self.send_json(200,self.server.store.snapshot())
                return
            if admin and self.path=='/api/admin/export':
                self.send_json(200,self.server.store.snapshot(secrets=data.get('includeKeys') is True))
                return
            if admin:
                profile=self.server.store.active()
                messages=[{'role':'user','content':'Reply with OK.'}]
            else:
                if not isinstance(data,dict) or set(data)!={'messages'}: raise ValueError('Send only messages; provider configuration belongs to the relay')
                profile=self.server.store.active()
                messages=data['messages']
            url,headers,body=validate_request(relay_config.build(profile,messages))
        except (ValueError,TypeError,UnicodeDecodeError,KeyError,OSError) as error:
            self.send_json(400,{'error':str(error) if isinstance(error,ValueError) else 'Invalid relay request or configuration storage unavailable'})
            return
        try:
            opener = urllib.request.build_opener(NoRedirect(), urllib.request.HTTPSHandler(context=ssl.create_default_context()))
            req = urllib.request.Request(url, data=body, headers=headers, method='POST')
            with opener.open(req, timeout=None) as response:
                payload = response.read()
            parsed = json.loads(payload)
            if not isinstance(parsed, dict):
                raise ValueError('Provider response is not an object')
            self.send_json(200,{'text':relay_config.response_text(profile,parsed)})
        except urllib.error.HTTPError as error:
            hints = {
                400: 'Check the model, protocol, token limit and context size in relay settings.',
                401: 'Check the API key in relay provider settings.',
                403: 'Check provider access, account permissions and the relay server network policy.',
                404: 'Check the complete endpoint URL and model name in relay settings.',
                408: 'Provider timed out. Try a smaller request or retry later.',
                429: 'Provider rate limit or quota exceeded. Check billing or retry later.',
            }
            self.send_json(502, {'error': f'Provider request failed (HTTP {error.code}). '+hints.get(error.code, 'Check provider availability and relay settings.'), 'code':'provider_http_error', 'providerStatus':error.code})
        except relay_config.ProviderResponseError as error:
            self.send_json(502, {'error':str(error), 'code':error.code})
        except (json.JSONDecodeError, UnicodeDecodeError):
            self.send_json(502, {'error':'Provider returned invalid JSON. Check that the relay endpoint is a non-streaming chat API, not a website or login page.', 'code':'provider_invalid_json'})
        except (urllib.error.URLError, TimeoutError, OSError, http.client.HTTPException) as error:
            reason = error.reason if isinstance(error, urllib.error.URLError) else error
            if isinstance(reason, ssl.SSLError):
                code, message = 'provider_tls_error', 'TLS verification failed between the relay and provider. Install the required trusted CA certificates on the relay server; keep certificate verification enabled.'
            elif isinstance(reason, (TimeoutError, socket.timeout)):
                code, message = 'provider_timeout', 'Provider request timed out. Try a smaller app or request, or retry when the provider is available.'
            elif isinstance(reason, socket.gaierror):
                code, message = 'provider_dns_error', 'Relay could not resolve the provider hostname. Check the endpoint hostname, server DNS and outbound network policy.'
            elif isinstance(reason, ConnectionRefusedError):
                code, message = 'provider_connection_refused', 'Provider connection was refused. Check that the configured provider or local gateway is running and reachable from the relay server.'
            elif 'Tunnel connection failed: 403' in str(reason):
                code, message = 'provider_proxy_denied', 'The relay network proxy denied access to the provider. Allow the provider hostname in the relay server outbound network policy.'
            else:
                code, message = 'provider_connection_error', 'Relay could not complete the provider connection. Check the endpoint, proxy, outbound network policy and provider availability.'
            self.send_json(502, {'error':message, 'code':code})
        except (ValueError, IndexError, KeyError, TypeError, AttributeError):
            self.send_json(502, {'error':'Provider returned an unexpected response shape. Check the endpoint and protocol in relay settings.', 'code':'provider_response_invalid'})

