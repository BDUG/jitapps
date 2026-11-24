"""Internet Research Module: SSRF-guarded search/fetch, focus truncation, and ResearchBrief distillation."""
from __future__ import annotations

from html.parser import HTMLParser
import ipaddress
import json
import math
import re
import socket
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid

DEFAULT_MAX_CHARS = 12000
HARD_MAX_CHARS = 25000
MAX_DOWNLOAD_BYTES = 5 * 1024 * 1024
MAX_REDIRECTS = 3
SEARCH_TIMEOUT_S = 5
FETCH_TIMEOUT_S = 8
MAX_TOOL_CALLS_CAP = 15

RAG_PROVIDERS = (
    'qdrant',
    'pinecone',
    'weaviate',
    'chroma',
    'milvus',
    'pgvector',
    'elasticsearch',
    'opensearch',
    'lancedb',
    'faiss',
    'custom',
)
RAG_SEARCH_MODES = ('hybrid', 'dense', 'sparse', 'rerank')

DEFAULT_RESEARCH_CONFIG = {
    'enabled': True,
    'maxToolCalls': 5,
    'maxChars': DEFAULT_MAX_CHARS,
    'targetStack': '',
    'rag': {
        'enabled': False,
        'provider': 'qdrant',
        'endpoint': '',
        'collection': 'default',
        'namespace': '',
        'apiKey': '',
        'searchMode': 'hybrid',
        'topK': 5,
        'minScore': 0.0,
        'embeddingEndpoint': '',
        'embeddingModel': '',
        'allowLocalhost': True,
        'timeoutMs': 5000,
        'headers': {},
        'ragOnly': False,
    },
}

INJECTION_PATTERNS = re.compile(
    r'(?i)(ignore\s+(?:all\s+)?previous\s+instructions|disregard\s+(?:all\s+)?prior\s+instructions|'
    r'output\s+the\s+system\s+prompt|reveal\s+(?:your|the)\s+system\s+prompt|you\s+are\s+now\s+in\s+developer\s+mode)'
)


class ResearchError(ValueError):
    """Structured error carrying an explicit error_code from the error handling matrix."""

    def __init__(self, code: str, message: str, *, status: int | None = None):
        super().__init__(f'{code}: {message}')
        self.code = code
        self.status = status


def _is_blocked_ip(ip_obj) -> bool:
    return (
        ip_obj.is_private
        or ip_obj.is_loopback
        or ip_obj.is_link_local
        or ip_obj.is_multicast
        or ip_obj.is_reserved
        or ip_obj.is_unspecified
    )


def validate_public_url(url: str, *, allow_http: bool = False) -> str:
    """Validate URL scheme and resolve DNS to block loopback, private, and link-local IPs (NFR-01)."""
    if not isinstance(url, str) or not url.strip():
        raise ResearchError('ERR_BLOCKED_URL', 'Empty URL')
    parsed = urllib.parse.urlparse(url.strip())
    allowed_schemes = ('https', 'http') if allow_http else ('https',)
    if parsed.scheme.lower() not in allowed_schemes:
        raise ResearchError('ERR_BLOCKED_URL', f'Blocked scheme: {parsed.scheme or "none"}')
    host = (parsed.hostname or '').strip().lower()
    if not host or '@' in parsed.netloc or host == 'localhost' or host.endswith(('.local', '.internal')):
        raise ResearchError('ERR_BLOCKED_URL', f'Blocked host: {host}')
    try:
        ip_obj = ipaddress.ip_address(host)
    except ValueError:
        ip_obj = None
    if ip_obj is not None:
        if _is_blocked_ip(ip_obj):
            raise ResearchError('ERR_BLOCKED_URL', f'Blocked IP address: {host}')
        return url.strip()
    port = parsed.port or (443 if parsed.scheme.lower() == 'https' else 80)
    try:
        infos = socket.getaddrinfo(host, port, type=socket.SOCK_STREAM)
    except socket.gaierror:
        return url.strip()
    for info in infos:
        addr_ip = info[4][0].split('%')[0]
        try:
            if _is_blocked_ip(ipaddress.ip_address(addr_ip)):
                raise ResearchError('ERR_BLOCKED_URL', f'Host {host} resolved to blocked IP {addr_ip}')
        except ValueError:
            continue
    return url.strip()


class _SafeRedirectHandler(urllib.request.HTTPRedirectHandler):
    def __init__(self, *, allow_http: bool = False):
        super().__init__()
        self.redirects = 0
        self.allow_http = allow_http

    def redirect_request(self, req, fp, code, msg, headers, newurl):
        self.redirects += 1
        if self.redirects > MAX_REDIRECTS:
            raise ResearchError('ERR_BLOCKED_URL', f'Exceeded max {MAX_REDIRECTS} redirects')
        resolved = urllib.parse.urljoin(req.full_url, newurl)
        validate_public_url(resolved, allow_http=self.allow_http)
        return super().redirect_request(req, fp, code, msg, headers, resolved)


class _HtmlMarkdownParser(HTMLParser):
    SKIP_TAGS = {'script', 'style', 'nav', 'footer', 'aside', 'noscript', 'svg'}

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.skip_depth = 0
        self.in_pre = False
        self.in_code = False
        self.heading_level = 0
        self.parts: list[str] = []
        self.code_blocks: list[str] = []
        self._cur_code: list[str] = []

    def handle_starttag(self, tag, attrs):
        t = tag.lower()
        if t in self.SKIP_TAGS:
            self.skip_depth += 1
            return
        if self.skip_depth:
            return
        if t in ('h1', 'h2', 'h3', 'h4', 'h5', 'h6'):
            self.heading_level = min(3, int(t[1]))
            self.parts.append('\n' + '#' * self.heading_level + ' ')
        elif t == 'pre':
            self.in_pre = True
            self._cur_code = []
            self.parts.append('\n```\n')
        elif t == 'code' and not self.in_pre:
            self.in_code = True
            self.parts.append('`')
        elif t in ('p', 'div', 'section', 'article', 'li', 'tr', 'br'):
            self.parts.append('\n- ' if t == 'li' else '\n')

    def handle_endtag(self, tag):
        t = tag.lower()
        if t in self.SKIP_TAGS:
            self.skip_depth = max(0, self.skip_depth - 1)
            return
        if self.skip_depth:
            return
        if t in ('h1', 'h2', 'h3', 'h4', 'h5', 'h6'):
            self.heading_level = 0
            self.parts.append('\n')
        elif t == 'pre':
            self.in_pre = False
            block = ''.join(self._cur_code).strip()
            if block:
                self.code_blocks.append(block)
            self.parts.append('\n```\n')
        elif t == 'code' and not self.in_pre:
            self.in_code = False
            self.parts.append('`')
        elif t in ('p', 'li', 'tr'):
            self.parts.append('\n')

    def handle_data(self, data):
        if self.skip_depth:
            return
        if self.in_pre:
            self._cur_code.append(data)
            self.parts.append(data)
        else:
            cleaned = re.sub(r'[ \t\r\n]+', ' ', data)
            if cleaned.strip():
                self.parts.append(cleaned)


def html_to_clean(raw: str, fmt: str = 'markdown') -> str:
    """Convert raw HTML (or Markdown/text) to clean markdown, code_only, or text (FR-03)."""
    if fmt not in ('markdown', 'code_only', 'text'):
        raise ValueError('format must be markdown, code_only, or text')
    stripped = raw.lstrip()
    is_html = stripped.startswith('<') and ('<html' in raw[:500].lower() or '<body' in raw[:1000].lower() or '<div' in raw[:1000].lower() or '<p>' in raw[:1000].lower() or '<script' in raw[:1000].lower())
    if is_html:
        parser = _HtmlMarkdownParser()
        parser.feed(raw)
        parser.close()
        md = re.sub(r'\n{3,}', '\n\n', ''.join(parser.parts)).strip()
        if fmt == 'code_only':
            return '\n\n'.join(f'```\n{b}\n```' for b in parser.code_blocks)
    else:
        md = raw.strip()
        if fmt == 'code_only':
            blocks = re.findall(r'```[\w-]*\n([\s\S]*?)```', md)
            return '\n\n'.join(f'```\n{b.strip()}\n```' for b in blocks if b.strip())
    if fmt == 'text':
        text = re.sub(r'```[\w-]*\n?', '', md)
        text = re.sub(r'^#{1,6}\s+', '', text, flags=re.M)
        return re.sub(r'[ \t]+', ' ', text).strip()
    return md


def focus_truncate(text: str, focus_query: str | None = None, max_chars: int = DEFAULT_MAX_CHARS) -> tuple[str, bool]:
    """Chunk by #..### headings and rank by keyword/BM25 relevance when exceeding max_chars (FR-04)."""
    ceiling = max(100, min(HARD_MAX_CHARS, int(max_chars)))
    if len(text) <= ceiling:
        return text, False
    if not focus_query or not focus_query.strip():
        return text[:ceiling], True
    # Split into heading sections
    sections = re.split(r'(?m)(?=^#{1,3}\s+)', text)
    sections = [s.strip() for s in sections if s.strip()]
    if len(sections) <= 1:
        return text[:ceiling], True
    terms = [t for t in re.findall(r'[a-z0-9_]+', focus_query.lower()) if len(t) > 1]
    if not terms:
        return text[:ceiling], True
    avg_len = sum(len(s.split()) for s in sections) / max(1, len(sections))
    n_docs = len(sections)
    df = {term: sum(1 for s in sections if term in s.lower()) for term in set(terms)}
    scored = []
    k1, b = 1.5, 0.75
    for idx, sec in enumerate(sections):
        low = sec.lower()
        words = re.findall(r'[a-z0-9_]+', low)
        dl = max(1, len(words))
        score = 0.0
        first_line = sec.splitlines()[0].lower()
        for term in terms:
            tf = words.count(term)
            if tf == 0:
                continue
            idf = math.log(1.0 + (n_docs - df[term] + 0.5) / (df[term] + 0.5))
            denom = tf + k1 * (1.0 - b + b * (dl / max(1.0, avg_len)))
            score += idf * ((tf * (k1 + 1.0)) / denom)
            if term in first_line:
                score += 2.0
        scored.append((score, idx, sec))
    scored.sort(key=lambda item: (-item[0], item[1]))
    chosen = []
    used = 0
    for score, idx, sec in scored:
        sep = 2 if chosen else 0
        if used + sep + len(sec) <= ceiling:
            chosen.append((idx, sec))
            used += sep + len(sec)
        elif not chosen:
            chosen.append((idx, sec[:ceiling]))
            used = ceiling
            break
    chosen.sort(key=lambda item: item[0])
    return '\n\n'.join(sec for _, sec in chosen), True


def wrap_untrusted(url: str, content: str) -> str:
    """Wrap fetched web content in explicit untrusted delimiters (NFR-02)."""
    safe_url = str(url).replace('"', '&quot;')
    return f'<untrusted_web_content url="{safe_url}">\n{content}\n</untrusted_web_content>'


def wrap_untrusted_rag(provider: str, source: str, content: str) -> str:
    """Wrap retrieved RAG content in explicit untrusted delimiters (NFR-02)."""
    safe_provider = str(provider).replace('"', '&quot;')
    safe_source = str(source).replace('"', '&quot;')
    return f'<untrusted_rag_content provider="{safe_provider}" source="{safe_source}">\n{content}\n</untrusted_rag_content>'


def normalize_research_config(config: dict | None = None) -> dict:
    """Normalize research and nested RAG configuration into a canonical dict."""
    raw = config if isinstance(config, dict) else {}
    raw_rag = raw.get('rag') if isinstance(raw.get('rag'), dict) else {}
    # Allow passing a flat rag_config directly
    if not raw_rag and any(k in raw for k in ('provider', 'endpoint', 'collection', 'searchMode', 'search_mode', 'topK', 'top_k')):
        raw_rag = raw
    provider = str(raw_rag.get('provider') or 'qdrant').strip().lower()
    if provider not in RAG_PROVIDERS:
        raise ValueError(f'Unsupported RAG provider {provider!r}; expected one of {", ".join(RAG_PROVIDERS)}')
    search_mode = str(raw_rag.get('searchMode') or raw_rag.get('search_mode') or 'hybrid').strip().lower()
    if search_mode not in RAG_SEARCH_MODES:
        raise ValueError(f'Unsupported RAG searchMode {search_mode!r}; expected one of {", ".join(RAG_SEARCH_MODES)}')
    max_calls = max(1, min(MAX_TOOL_CALLS_CAP, int(raw.get('maxToolCalls') or raw.get('max_tool_calls') or 5)))
    max_chars = max(100, min(HARD_MAX_CHARS, int(raw.get('maxChars') or raw.get('max_chars') or DEFAULT_MAX_CHARS)))
    top_k = max(1, min(50, int(raw_rag.get('topK') or raw_rag.get('top_k') or 5)))
    min_score = max(0.0, min(1.0, float(raw_rag.get('minScore') if raw_rag.get('minScore') is not None else raw_rag.get('min_score') or 0.0)))
    timeout_ms = max(500, min(30000, int(raw_rag.get('timeoutMs') or raw_rag.get('timeout_ms') or 5000)))
    headers = raw_rag.get('headers') if isinstance(raw_rag.get('headers'), dict) else {}
    return {
        'enabled': raw.get('enabled', True) is not False,
        'maxToolCalls': max_calls,
        'maxChars': max_chars,
        'targetStack': str(raw.get('targetStack') or raw.get('target_stack') or '').strip(),
        'rag': {
            'enabled': bool(raw_rag.get('enabled', False)),
            'provider': provider,
            'endpoint': str(raw_rag.get('endpoint') or '').strip(),
            'collection': str(raw_rag.get('collection') or raw_rag.get('index') or 'default').strip() or 'default',
            'namespace': str(raw_rag.get('namespace') or '').strip(),
            'apiKey': str(raw_rag.get('apiKey') or raw_rag.get('api_key') or '').strip(),
            'searchMode': search_mode,
            'topK': top_k,
            'minScore': min_score,
            'embeddingEndpoint': str(raw_rag.get('embeddingEndpoint') or raw_rag.get('embedding_endpoint') or '').strip(),
            'embeddingModel': str(raw_rag.get('embeddingModel') or raw_rag.get('embedding_model') or '').strip(),
            'allowLocalhost': raw_rag.get('allowLocalhost', raw_rag.get('allow_localhost', True)) is not False,
            'timeoutMs': timeout_ms,
            'headers': {str(k): str(v) for k, v in headers.items()},
            'ragOnly': bool(raw_rag.get('ragOnly', raw_rag.get('rag_only', False))),
        },
    }


def redact_research_config(config: dict | None = None) -> dict:
    """Return normalized research config with secret apiKey redacted."""
    cfg = normalize_research_config(config)
    if cfg['rag']['apiKey']:
        cfg['rag']['apiKey'] = '***'
    return cfg


def validate_rag_url(url: str, *, allow_localhost: bool = True) -> str:
    """Validate a configured RAG endpoint URL, always blocking cloud metadata and non-HTTP(S) schemes."""
    if not isinstance(url, str) or not url.strip():
        raise ResearchError('ERR_BLOCKED_URL', 'Empty RAG endpoint URL')
    parsed = urllib.parse.urlparse(url.strip())
    if parsed.scheme.lower() not in ('https', 'http'):
        raise ResearchError('ERR_BLOCKED_URL', f'Blocked RAG scheme: {parsed.scheme or "none"}')
    host = (parsed.hostname or '').strip().lower()
    if not host or '@' in parsed.netloc:
        raise ResearchError('ERR_BLOCKED_URL', f'Blocked RAG host: {host}')
    if not allow_localhost and (host == 'localhost' or host.endswith(('.local', '.internal'))):
        raise ResearchError('ERR_BLOCKED_URL', f'Blocked local RAG host: {host}')

    def _is_always_blocked(ip_obj) -> bool:
        return ip_obj.is_link_local or ip_obj.is_multicast or ip_obj.is_reserved or ip_obj.is_unspecified

    try:
        ip_obj = ipaddress.ip_address(host)
    except ValueError:
        ip_obj = None
    if ip_obj is not None:
        if _is_always_blocked(ip_obj) or (not allow_localhost and _is_blocked_ip(ip_obj)):
            raise ResearchError('ERR_BLOCKED_URL', f'Blocked RAG IP address: {host}')
        return url.strip().rstrip('/')
    port = parsed.port or (443 if parsed.scheme.lower() == 'https' else 80)
    try:
        infos = socket.getaddrinfo(host, port, type=socket.SOCK_STREAM)
    except socket.gaierror:
        return url.strip().rstrip('/')
    for info in infos:
        addr_ip = info[4][0].split('%')[0]
        try:
            resolved = ipaddress.ip_address(addr_ip)
            if _is_always_blocked(resolved) or (not allow_localhost and _is_blocked_ip(resolved)):
                raise ResearchError('ERR_BLOCKED_URL', f'RAG host {host} resolved to blocked IP {addr_ip}')
        except ValueError:
            continue
    return url.strip().rstrip('/')


def _http_post_json(url: str, payload: dict, *, headers: dict | None = None, timeout: float = 5.0, allow_localhost: bool = True) -> dict:
    validate_rag_url(url, allow_localhost=allow_localhost)
    req_headers = {'Content-Type': 'application/json', 'Accept': 'application/json', 'User-Agent': 'codingagentlib/1.0'}
    if headers:
        req_headers.update(headers)
    body = json.dumps(payload).encode('utf-8')
    req = urllib.request.Request(url, data=body, headers=req_headers, method='POST')
    attempts = 0
    while True:
        attempts += 1
        try:
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                raw = resp.read(MAX_DOWNLOAD_BYTES + 1)
                if len(raw) > MAX_DOWNLOAD_BYTES:
                    raw = raw[:MAX_DOWNLOAD_BYTES]
                return json.loads(raw.decode('utf-8', 'replace'))
        except urllib.error.HTTPError as err:
            if err.code in (401, 403, 429):
                raise ResearchError('ERR_ACCESS_DENIED', f'RAG HTTP {err.code}', status=err.code) from err
            if 500 <= err.code < 600 and attempts == 1:
                time.sleep(0.5)
                continue
            raise ResearchError('ERR_FETCH_TIMEOUT', f'RAG HTTP {err.code}', status=err.code) from err
        except ResearchError:
            raise
        except (TimeoutError, socket.timeout, urllib.error.URLError) as err:
            if attempts == 1:
                time.sleep(0.5)
                continue
            raise ResearchError('ERR_FETCH_TIMEOUT', str(err)) from err


def _resolve_query_embedding(query: str, embedding_endpoint: str, embedding_model: str, *, api_key: str = '', timeout: float = 5.0, allow_localhost: bool = True, fetcher=None) -> list[float] | None:
    if not embedding_endpoint:
        return None
    headers = {'Authorization': f'Bearer {api_key}'} if api_key else {}
    payload = {'input': query, **({'model': embedding_model} if embedding_model else {})}
    data = fetcher(embedding_endpoint, payload, headers) if fetcher else _http_post_json(embedding_endpoint, payload, headers=headers, timeout=timeout, allow_localhost=allow_localhost)
    items = data.get('data') if isinstance(data, dict) else None
    if isinstance(items, list) and items and isinstance(items[0], dict) and isinstance(items[0].get('embedding'), list):
        return items[0]['embedding']
    if isinstance(data, dict) and isinstance(data.get('embedding'), list):
        return data['embedding']
    return None


def _build_rag_request(provider: str, endpoint: str, query: str, *, collection: str, namespace: str, top_k: int, min_score: float, search_mode: str, api_key: str, vector: list[float] | None, filter_obj: dict | None, extra_headers: dict | None) -> tuple[str, dict, dict]:
    base = endpoint.rstrip('/')
    headers = dict(extra_headers or {})
    if provider == 'qdrant':
        if api_key:
            headers.setdefault('api-key', api_key)
        url = f'{base}/collections/{urllib.parse.quote(collection)}/points/query'
        payload = {'limit': top_k, 'with_payload': True, **({'score_threshold': min_score} if min_score > 0 else {}), **({'filter': filter_obj} if filter_obj else {})}
        payload['query'] = vector if vector is not None else query
        return url, payload, headers
    if provider == 'pinecone':
        if api_key:
            headers.setdefault('Api-Key', api_key)
        url = f'{base}/query' if not base.endswith('/query') else base
        payload = {'topK': top_k, 'includeMetadata': True, **({'namespace': namespace} if namespace else {}), **({'filter': filter_obj} if filter_obj else {})}
        if vector is not None:
            payload['vector'] = vector
        else:
            payload['query'] = query
        return url, payload, headers
    if provider == 'weaviate':
        if api_key:
            headers.setdefault('Authorization', f'Bearer {api_key}')
        url = f'{base}/v1/graphql' if not base.endswith('/v1/graphql') else base
        escaped_q = json.dumps(query)
        cls_name = re.sub(r'[^A-Za-z0-9_]', '', collection) or 'Document'
        if search_mode == 'sparse':
            clause = f'bm25: {{ query: {escaped_q} }}'
        elif search_mode == 'dense' and vector is not None:
            clause = f'nearVector: {{ vector: {json.dumps(vector)} }}'
        elif search_mode == 'dense':
            clause = f'nearText: {{ concepts: [{escaped_q}] }}'
        else:
            vec_part = f', vector: {json.dumps(vector)}' if vector is not None else ''
            clause = f'hybrid: {{ query: {escaped_q}{vec_part} }}'
        gql = f'{{ Get {{ {cls_name}({clause}, limit: {top_k}) {{ text content title source url _additional {{ id score distance certainty }} }} }} }}'
        return url, {'query': gql}, headers
    if provider == 'chroma':
        if api_key:
            headers.setdefault('Authorization', f'Bearer {api_key}')
        url = f'{base}/api/v1/collections/{urllib.parse.quote(collection)}/query'
        payload = {'n_results': top_k, 'include': ['documents', 'metadatas', 'distances'], **({'where': filter_obj} if filter_obj else {})}
        if vector is not None:
            payload['query_embeddings'] = [vector]
        else:
            payload['query_texts'] = [query]
        return url, payload, headers
    if provider == 'milvus':
        if api_key:
            headers.setdefault('Authorization', f'Bearer {api_key}')
        url = f'{base}/v2/vectordb/entities/search' if '/entities/search' not in base else base
        payload = {'collectionName': collection, 'limit': top_k, 'outputFields': ['*'], **({'partitionNames': [namespace]} if namespace else {}), **({'filter': filter_obj} if isinstance(filter_obj, str) else {})}
        payload['data'] = [vector] if vector is not None else [query]
        return url, payload, headers
    if provider in ('elasticsearch', 'opensearch'):
        if api_key:
            headers.setdefault('Authorization', f'ApiKey {api_key}' if provider == 'elasticsearch' else f'Bearer {api_key}')
        url = f'{base}/{urllib.parse.quote(collection)}/_search' if not base.endswith('/_search') else base
        payload: dict = {'size': top_k}
        if vector is not None and search_mode in ('dense', 'hybrid', 'rerank'):
            payload['knn'] = {'field': 'embedding', 'query_vector': vector, 'k': top_k, 'num_candidates': max(top_k * 4, 20)}
        if search_mode in ('sparse', 'hybrid', 'rerank') or vector is None:
            payload['query'] = {'match': {'content': query}}
        return url, payload, headers
    if provider == 'lancedb':
        if api_key:
            headers.setdefault('Authorization', f'Bearer {api_key}')
        url = f'{base}/v1/table/{urllib.parse.quote(collection)}/query'
        payload = {'query': query, 'k': top_k, 'search_mode': search_mode, **({'vector': vector} if vector is not None else {}), **({'filter': filter_obj} if filter_obj else {})}
        return url, payload, headers
    # pgvector, faiss, custom
    if api_key:
        headers.setdefault('Authorization', f'Bearer {api_key}')
    url = base
    payload = {
        'provider': provider,
        'query': query,
        'collection': collection,
        'top_k': top_k,
        'min_score': min_score,
        'search_mode': search_mode,
        **({'namespace': namespace} if namespace else {}),
        **({'vector': vector} if vector is not None else {}),
        **({'filter': filter_obj} if filter_obj else {}),
    }
    return url, payload, headers


def _parse_rag_response(provider: str, data: dict, *, collection: str, top_k: int, min_score: float) -> list[dict]:
    items: list[dict] = []
    if not isinstance(data, dict):
        return items
    if provider == 'qdrant':
        raw_hits = data.get('result')
        if isinstance(raw_hits, dict):
            raw_hits = raw_hits.get('points') or []
        for hit in raw_hits or []:
            if not isinstance(hit, dict):
                continue
            pl = hit.get('payload') if isinstance(hit.get('payload'), dict) else {}
            items.append({
                'id': str(hit.get('id') or ''),
                'title': str(pl.get('title') or pl.get('name') or ''),
                'source': str(pl.get('source') or pl.get('url') or f'rag://qdrant/{collection}/{hit.get("id", "")}'),
                'content': str(pl.get('text') or pl.get('content') or pl.get('page_content') or ''),
                'score': float(hit.get('score') or 0.0),
                'metadata': pl,
            })
    elif provider == 'pinecone':
        for match in data.get('matches') or []:
            if not isinstance(match, dict):
                continue
            md = match.get('metadata') if isinstance(match.get('metadata'), dict) else {}
            items.append({
                'id': str(match.get('id') or ''),
                'title': str(md.get('title') or ''),
                'source': str(md.get('source') or md.get('url') or f'rag://pinecone/{collection}/{match.get("id", "")}'),
                'content': str(md.get('text') or md.get('content') or md.get('chunk') or ''),
                'score': float(match.get('score') or 0.0),
                'metadata': md,
            })
    elif provider == 'weaviate':
        get_map = (data.get('data') or {}).get('Get') if isinstance(data.get('data'), dict) else {}
        if isinstance(get_map, dict):
            for cls_hits in get_map.values():
                if not isinstance(cls_hits, list):
                    continue
                for hit in cls_hits:
                    if not isinstance(hit, dict):
                        continue
                    add = hit.get('_additional') if isinstance(hit.get('_additional'), dict) else {}
                    score = add.get('score') if add.get('score') is not None else add.get('certainty')
                    if score is None and add.get('distance') is not None:
                        score = max(0.0, 1.0 - float(add['distance']))
                    items.append({
                        'id': str(add.get('id') or ''),
                        'title': str(hit.get('title') or ''),
                        'source': str(hit.get('source') or hit.get('url') or f'rag://weaviate/{collection}/{add.get("id", "")}'),
                        'content': str(hit.get('text') or hit.get('content') or ''),
                        'score': float(score or 0.0),
                        'metadata': {k: v for k, v in hit.items() if k not in ('text', 'content', '_additional')},
                    })
    elif provider == 'chroma':
        docs = (data.get('documents') or [[]])[0] or []
        metas = (data.get('metadatas') or [[]])[0] or []
        dists = (data.get('distances') or [[]])[0] or []
        ids = (data.get('ids') or [[]])[0] or []
        for idx, doc in enumerate(docs):
            md = metas[idx] if idx < len(metas) and isinstance(metas[idx], dict) else {}
            dist = dists[idx] if idx < len(dists) and dists[idx] is not None else None
            score = max(0.0, 1.0 - float(dist)) if dist is not None else 1.0
            hid = str(ids[idx]) if idx < len(ids) else str(idx)
            items.append({
                'id': hid,
                'title': str(md.get('title') or ''),
                'source': str(md.get('source') or md.get('url') or f'rag://chroma/{collection}/{hid}'),
                'content': str(doc or ''),
                'score': score,
                'metadata': md,
            })
    elif provider == 'milvus':
        for hit in data.get('data') or []:
            if not isinstance(hit, dict):
                continue
            score = hit.get('score') if hit.get('score') is not None else (max(0.0, 1.0 - float(hit['distance'])) if hit.get('distance') is not None else 0.0)
            items.append({
                'id': str(hit.get('id') or ''),
                'title': str(hit.get('title') or ''),
                'source': str(hit.get('source') or hit.get('url') or f'rag://milvus/{collection}/{hit.get("id", "")}'),
                'content': str(hit.get('text') or hit.get('content') or ''),
                'score': float(score),
                'metadata': hit,
            })
    elif provider in ('elasticsearch', 'opensearch'):
        hits = ((data.get('hits') or {}).get('hits')) or []
        for hit in hits:
            if not isinstance(hit, dict):
                continue
            src = hit.get('_source') if isinstance(hit.get('_source'), dict) else {}
            items.append({
                'id': str(hit.get('_id') or ''),
                'title': str(src.get('title') or ''),
                'source': str(src.get('source') or src.get('url') or f'rag://{provider}/{collection}/{hit.get("_id", "")}'),
                'content': str(src.get('text') or src.get('content') or ''),
                'score': float(hit.get('_score') or 0.0),
                'metadata': src,
            })
    if not items:
        raw_list = data.get('results') or data.get('matches') or data.get('data') or data.get('hits') or []
        for idx, hit in enumerate(raw_list if isinstance(raw_list, list) else []):
            if not isinstance(hit, dict):
                continue
            md = hit.get('metadata') if isinstance(hit.get('metadata'), dict) else {}
            hid = str(hit.get('id') or idx)
            items.append({
                'id': hid,
                'title': str(hit.get('title') or md.get('title') or ''),
                'source': str(hit.get('source') or hit.get('url') or md.get('source') or f'rag://{provider}/{collection}/{hid}'),
                'content': str(hit.get('content') or hit.get('text') or hit.get('document') or ''),
                'score': float(hit.get('score') if hit.get('score') is not None else 1.0),
                'metadata': md,
            })
    filtered = [it for it in items if it['content'].strip() and it['score'] >= min_score]
    filtered.sort(key=lambda x: -x['score'])
    return filtered[:top_k]


def rag_search(
    query: str,
    *,
    config: dict | None = None,
    provider: str | None = None,
    endpoint: str | None = None,
    collection: str | None = None,
    namespace: str | None = None,
    api_key: str | None = None,
    top_k: int | None = None,
    min_score: float | None = None,
    search_mode: str | None = None,
    vector: list[float] | None = None,
    filter_obj: dict | None = None,
    target_stack: str | None = None,
    max_chars: int | None = None,
    rag_fn=None,
    fetcher=None,
) -> dict:
    """Query a configured state-of-the-art RAG database with SSRF checks, focus truncation, and untrusted wrapping."""
    t0 = time.monotonic()
    trace_id = uuid.uuid4().hex[:12]
    if not isinstance(query, str) or not query.strip():
        raise ValueError('Provide a nonempty RAG search query')
    norm = normalize_research_config(config)
    rag_cfg = norm['rag']
    eff_provider = (provider or rag_cfg['provider']).strip().lower()
    if eff_provider not in RAG_PROVIDERS:
        raise ValueError(f'Unsupported RAG provider {eff_provider!r}')
    eff_endpoint = (endpoint if endpoint is not None else rag_cfg['endpoint']).strip()
    eff_collection = (collection or rag_cfg['collection']).strip() or 'default'
    eff_namespace = (namespace if namespace is not None else rag_cfg['namespace']).strip()
    eff_api_key = api_key if api_key is not None else rag_cfg['apiKey']
    eff_mode = (search_mode or rag_cfg['searchMode']).strip().lower()
    if eff_mode not in RAG_SEARCH_MODES:
        raise ValueError(f'Unsupported RAG searchMode {eff_mode!r}')
    eff_top_k = max(1, min(50, int(top_k if top_k is not None else rag_cfg['topK'])))
    eff_min_score = max(0.0, min(1.0, float(min_score if min_score is not None else rag_cfg['minScore'])))
    eff_max_chars = max(100, min(HARD_MAX_CHARS, int(max_chars if max_chars is not None else norm['maxChars'])))
    eff_stack = (target_stack if target_stack is not None else norm['targetStack']).strip()
    anchored = f'{query.strip()} {eff_stack}'.strip() if eff_stack else query.strip()

    err_code = None
    try:
        if rag_fn is not None:
            raw_data = rag_fn(
                anchored,
                {
                    'provider': eff_provider,
                    'endpoint': eff_endpoint,
                    'collection': eff_collection,
                    'namespace': eff_namespace,
                    'top_k': eff_top_k,
                    'min_score': eff_min_score,
                    'search_mode': eff_mode,
                    'filter': filter_obj,
                },
            )
            hits = _parse_rag_response(eff_provider, raw_data if isinstance(raw_data, dict) else {'results': raw_data}, collection=eff_collection, top_k=eff_top_k, min_score=eff_min_score)
        else:
            if not eff_endpoint:
                raise ResearchError('ERR_RAG_UNCONFIGURED', 'RAG endpoint is not configured')
            validate_rag_url(eff_endpoint, allow_localhost=rag_cfg['allowLocalhost'])
            eff_vec = vector
            if eff_vec is None and rag_cfg['embeddingEndpoint']:
                eff_vec = _resolve_query_embedding(
                    anchored,
                    rag_cfg['embeddingEndpoint'],
                    rag_cfg['embeddingModel'],
                    api_key=eff_api_key,
                    timeout=rag_cfg['timeoutMs'] / 1000.0,
                    allow_localhost=rag_cfg['allowLocalhost'],
                    fetcher=fetcher,
                )
            url, payload, req_headers = _build_rag_request(
                eff_provider,
                eff_endpoint,
                anchored,
                collection=eff_collection,
                namespace=eff_namespace,
                top_k=eff_top_k,
                min_score=eff_min_score,
                search_mode=eff_mode,
                api_key=eff_api_key,
                vector=eff_vec,
                filter_obj=filter_obj,
                extra_headers=rag_cfg['headers'],
            )
            raw_data = fetcher(url, payload, req_headers) if fetcher else _http_post_json(
                url,
                payload,
                headers=req_headers,
                timeout=rag_cfg['timeoutMs'] / 1000.0,
                allow_localhost=rag_cfg['allowLocalhost'],
            )
            hits = _parse_rag_response(eff_provider, raw_data, collection=eff_collection, top_k=eff_top_k, min_score=eff_min_score)

        any_truncated = False
        per_hit_cap = max(200, eff_max_chars // max(1, len(hits) or 1))
        results = []
        total_chars = 0
        for hit in hits:
            bounded, trunc = focus_truncate(hit['content'], focus_query=query, max_chars=per_hit_cap)
            any_truncated = any_truncated or trunc
            wrapped = wrap_untrusted_rag(eff_provider, hit['source'], bounded)
            total_chars += len(wrapped)
            results.append({
                'id': hit['id'],
                'title': hit['title'],
                'source': hit['source'],
                'url': hit['source'],
                'content': wrapped,
                'text': wrapped,
                'score': round(hit['score'], 6),
                'truncated': trunc,
                'metadata': hit['metadata'],
            })
        return {
            'provider': eff_provider,
            'collection': eff_collection,
            'search_mode': eff_mode,
            'query': anchored,
            'results': results,
            'total': len(results),
            'trace': {
                'trace_id': trace_id,
                'tool_name': 'rag_search',
                'provider': eff_provider,
                'collection': eff_collection,
                'search_mode': eff_mode,
                'latency_ms': int((time.monotonic() - t0) * 1000),
                'char_count': total_chars,
                'truncated': any_truncated,
                'error_code': err_code,
            },
        }
    except ResearchError as err:
        err_code = err.code
        raise


def _http_get(url: str, *, timeout: float, allow_http: bool = False) -> tuple[str, str]:
    validate_public_url(url, allow_http=allow_http)
    opener = urllib.request.build_opener(_SafeRedirectHandler(allow_http=allow_http))
    req = urllib.request.Request(url, headers={'User-Agent': 'codingagentlib/1.0'})
    attempts = 0
    while True:
        attempts += 1
        try:
            with opener.open(req, timeout=timeout) as resp:
                ctype = resp.headers.get('Content-Type', 'text/plain')
                raw = resp.read(MAX_DOWNLOAD_BYTES + 1)
                if len(raw) > MAX_DOWNLOAD_BYTES:
                    raw = raw[:MAX_DOWNLOAD_BYTES]
                return raw.decode('utf-8', 'replace'), ctype
        except urllib.error.HTTPError as err:
            if err.code in (401, 403, 429):
                raise ResearchError('ERR_ACCESS_DENIED', f'HTTP {err.code}', status=err.code) from err
            if 500 <= err.code < 600 and attempts == 1:
                time.sleep(0.5)
                continue
            raise ResearchError('ERR_FETCH_TIMEOUT', f'HTTP {err.code}', status=err.code) from err
        except ResearchError:
            raise
        except (TimeoutError, socket.timeout, urllib.error.URLError) as err:
            if attempts == 1:
                time.sleep(0.5)
                continue
            raise ResearchError('ERR_FETCH_TIMEOUT', str(err)) from err


def web_search(query: str, *, target_stack: str | None = None, max_results: int = 5, fetcher=None) -> dict:
    """Search the web and return metadata only (FR-01, FR-02, NFR-03, NFR-04)."""
    t0 = time.monotonic()
    trace_id = uuid.uuid4().hex[:12]
    if not isinstance(query, str) or not query.strip():
        raise ValueError('Provide a nonempty search query')
    lim = max(1, min(10, int(max_results)))
    anchored = f'{query.strip()} {target_stack.strip()}'.strip() if target_stack and target_stack.strip() else query.strip()
    url = 'https://html.duckduckgo.com/html/?q=' + urllib.parse.quote_plus(anchored)
    err_code = None
    try:
        raw, _ = fetcher(url) if fetcher else _http_get(url, timeout=SEARCH_TIMEOUT_S)
        results = []
        for chunk in raw.split('class="result__a"')[1:]:
            if len(results) >= lim:
                break
            href_m = re.search(r'href="([^"]+)"', chunk)
            title_m = re.search(r'>(.*?)</a>', chunk, re.S)
            snip_m = re.search(r'class="result__snippet"[^>]*>(.*?)</a>', chunk, re.S)
            href = href_m.group(1) if href_m else ''
            title = re.sub(r'\s+', ' ', re.sub(r'<[^>]+>', ' ', title_m.group(1))).strip() if title_m else ''
            snippet = re.sub(r'\s+', ' ', re.sub(r'<[^>]+>', ' ', snip_m.group(1))).strip()[:300] if snip_m else ''
            if title and href:
                results.append({'title': title, 'url': href, 'snippet': snippet, 'published_date': None})
        return {
            'query': anchored,
            'results': results,
            'total': len(results),
            'trace': {'trace_id': trace_id, 'tool_name': 'web_search', 'latency_ms': int((time.monotonic() - t0) * 1000), 'char_count': sum(len(r['snippet']) for r in results), 'truncated': False, 'error_code': err_code},
        }
    except ResearchError as err:
        err_code = err.code
        raise


def web_fetch(url: str, *, focus_query: str | None = None, fmt: str = 'markdown', max_chars: int = DEFAULT_MAX_CHARS, fetcher=None, allow_http: bool = False) -> dict:
    """Fetch a public URL with SSRF prevention, clean extraction, focus truncation, and untrusted wrapping."""
    t0 = time.monotonic()
    trace_id = uuid.uuid4().hex[:12]
    validate_public_url(url, allow_http=allow_http)
    raw, ctype = fetcher(url) if fetcher else _http_get(url, timeout=FETCH_TIMEOUT_S, allow_http=allow_http)
    cleaned = html_to_clean(raw, fmt=fmt)
    bounded, truncated = focus_truncate(cleaned, focus_query=focus_query, max_chars=max_chars)
    wrapped = wrap_untrusted(url, bounded)
    return {
        'url': url,
        'contentType': ctype,
        'format': fmt,
        'text': wrapped,
        'truncated': truncated,
        'totalCharacters': len(cleaned),
        'trace': {
            'trace_id': trace_id,
            'tool_name': 'web_fetch',
            'latency_ms': int((time.monotonic() - t0) * 1000),
            'char_count': len(wrapped),
            'truncated': truncated,
            'error_code': None,
        },
    }


def _strip_untrusted_delimiters(text: str) -> str:
    text = re.sub(r'</?untrusted_(?:web|rag)_content\b[^>]*>', '', text)
    lines = [ln for ln in text.splitlines() if not INJECTION_PATTERNS.search(ln)]
    return '\n'.join(lines).strip()


def summarize_research(sources: list[dict], *, objective: str = '', target_stack: str | None = None, output_format: str = 'api_reference', budget_exhausted: bool = False) -> dict:
    """Distill 1-5 fetched sources into a strict ResearchBrief and discard raw pages (FR-05)."""
    if not isinstance(sources, list) or not 1 <= len(sources) <= 5:
        raise ValueError('summarize_research requires 1 to 5 fetched sources')
    citations = []
    code_examples = []
    gotchas = []
    version_constraints = [target_stack.strip()] if isinstance(target_stack, str) and target_stack.strip() else []
    summary_sentences = []
    for src in sources:
        url = str(src.get('url') or '').strip()
        if url and url not in citations:
            citations.append(url)
        body = _strip_untrusted_delimiters(str(src.get('text') or src.get('content') or ''))
        for m in re.finditer(r'```([a-zA-Z0-9_+-]*)\n([\s\S]*?)```', body):
            code = m.group(2).strip()
            if code:
                code_examples.append({'language': m.group(1) or 'text', 'code': code[:2000], 'source_url': url})
        for line in body.splitlines():
            clean = line.strip().lstrip('#').strip()
            if not clean:
                continue
            low = clean.lower()
            if any(w in low for w in ('deprecated', 'breaking', 'warning', 'gotcha', 'caveat')) and len(gotchas) < 8:
                gotchas.append(clean[:240])
            if re.search(r'\b(python|node|rust|typescript|fastapi|react|next\.?js)\s*\d+(?:\.\d+)*', low) and len(version_constraints) < 8:
                if clean[:120] not in version_constraints:
                    version_constraints.append(clean[:120])
            if not clean.startswith('```') and len(summary_sentences) < 3 and len(clean) > 20:
                summary_sentences.append(clean[:220])
    if not citations and not summary_sentences and not code_examples:
        status = 'no_relevant_results'
    elif budget_exhausted:
        status = 'partial_budget_exhausted'
    else:
        status = 'complete'
    summary = ' '.join(summary_sentences[:3]) or (f'Findings for {objective}' if objective else 'No relevant findings.')
    return {
        'status': status,
        'summary': summary,
        'version_constraints': version_constraints,
        'code_examples': code_examples[:8],
        'gotchas': gotchas,
        'citations': citations,
    }


def run_research(request: dict, *, search_fn=None, fetch_fn=None, rag_fn=None, research_config: dict | None = None) -> dict:
    """Execute bounded research loop with optional RAG database query and hard max_tool_calls budget (FR-06)."""
    objective = str(request.get('objective') or '').strip()
    if not objective:
        raise ValueError('ResearchRequest requires objective')
    cfg = normalize_research_config(research_config)
    req_rag = request.get('rag')
    if isinstance(req_rag, dict):
        cfg_rag = normalize_research_config({'rag': {**cfg['rag'], **req_rag}})['rag']
    elif req_rag is True:
        cfg_rag = {**cfg['rag'], 'enabled': True}
    elif req_rag is False:
        cfg_rag = {**cfg['rag'], 'enabled': False}
    else:
        cfg_rag = cfg['rag']
        if request.get('use_rag') is True:
            cfg_rag = {**cfg_rag, 'enabled': True}
    target_stack = request.get('target_stack') or cfg['targetStack'] or None
    output_format = request.get('output_format') or 'api_reference'
    budget = max(1, min(MAX_TOOL_CALLS_CAP, int(request.get('max_tool_calls') or cfg['maxToolCalls'] or 5)))
    calls = 0
    budget_exhausted = False
    fetched = []

    def next_call():
        nonlocal calls, budget_exhausted
        if calls >= budget:
            budget_exhausted = True
            raise ResearchError('ERR_BUDGET_EXCEEDED', f'Research budget of {budget} tool calls exhausted')
        calls += 1

    try:
        if cfg_rag['enabled']:
            next_call()
            try:
                rag_res = (
                    rag_fn(objective, {'rag': cfg_rag, 'maxChars': cfg['maxChars'], 'targetStack': target_stack or ''})
                    if rag_fn is not None and not cfg_rag['endpoint']
                    else rag_search(objective, config={'rag': cfg_rag, 'maxChars': cfg['maxChars'], 'targetStack': target_stack or ''}, rag_fn=rag_fn)
                )
                for item in (rag_res or {}).get('results', []):
                    if item.get('content') or item.get('text'):
                        fetched.append({'url': item.get('source') or item.get('url') or f"rag://{cfg_rag['provider']}/{cfg_rag['collection']}", 'text': item.get('content') or item.get('text')})
            except ResearchError as err:
                if err.code not in ('ERR_BLOCKED_URL', 'ERR_ACCESS_DENIED', 'ERR_FETCH_TIMEOUT', 'ERR_RAG_UNCONFIGURED'):
                    raise

        if not cfg_rag.get('ragOnly'):
            next_call()
            sr = (search_fn or web_search)(objective, target_stack=target_stack, max_results=5)
            for item in sr.get('results', []):
                url = item.get('url')
                if not url:
                    continue
                next_call()
                try:
                    fetched.append((fetch_fn or web_fetch)(url, focus_query=objective))
                except ResearchError as err:
                    if err.code in ('ERR_BLOCKED_URL', 'ERR_ACCESS_DENIED', 'ERR_FETCH_TIMEOUT'):
                        continue
                    raise
    except ResearchError as err:
        if err.code != 'ERR_BUDGET_EXCEEDED':
            raise

    if not fetched:
        return {
            'status': 'partial_budget_exhausted' if budget_exhausted else 'no_relevant_results',
            'summary': f'No relevant sources retrieved for {objective}.',
            'version_constraints': [target_stack] if target_stack else [],
            'code_examples': [],
            'gotchas': [],
            'citations': [],
        }
    return summarize_research(
        fetched[:5],
        objective=objective,
        target_stack=target_stack,
        output_format=output_format,
        budget_exhausted=budget_exhausted,
    )
