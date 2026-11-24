'use strict';

const dns = require('node:dns').promises;
const net = require('node:net');
const crypto = require('node:crypto');

const DEFAULT_MAX_CHARS = 12000;
const HARD_MAX_CHARS = 25000;
const MAX_DOWNLOAD_BYTES = 5 * 1024 * 1024;
const MAX_REDIRECTS = 3;
const MAX_TOOL_CALLS_CAP = 15;
const INJECTION_RE = /(ignore\s+(?:all\s+)?previous\s+instructions|disregard\s+(?:all\s+)?prior\s+instructions|output\s+the\s+system\s+prompt|reveal\s+(?:your|the)\s+system\s+prompt|you\s+are\s+now\s+in\s+developer\s+mode)/i;

const RAG_PROVIDERS = [
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
];
const RAG_SEARCH_MODES = ['hybrid', 'dense', 'sparse', 'rerank'];

const DEFAULT_RESEARCH_CONFIG = {
  enabled: true,
  maxToolCalls: 5,
  maxChars: DEFAULT_MAX_CHARS,
  targetStack: '',
  rag: {
    enabled: false,
    provider: 'qdrant',
    endpoint: '',
    collection: 'default',
    namespace: '',
    apiKey: '',
    searchMode: 'hybrid',
    topK: 5,
    minScore: 0.0,
    embeddingEndpoint: '',
    embeddingModel: '',
    allowLocalhost: true,
    timeoutMs: 5000,
    headers: {},
    ragOnly: false,
  },
};

class ResearchError extends Error {
  constructor(code, message, status = null) {
    super(`${code}: ${message}`);
    this.code = code;
    this.status = status;
  }
}

function isBlockedIp(ip) {
  const clean = String(ip || '').split('%')[0].toLowerCase();
  if (net.isIPv4(clean)) {
    const p = clean.split('.').map(Number);
    if (p[0] === 127 || p[0] === 10 || p[0] === 0) return true;
    if (p[0] === 169 && p[1] === 254) return true;
    if (p[0] === 172 && p[1] >= 16 && p[1] <= 31) return true;
    if (p[0] === 192 && p[1] === 168) return true;
    if (p[0] === 100 && (p[1] & 0xc0) === 64) return true;
    if (p[0] >= 224) return true;
    return false;
  }
  if (net.isIPv6(clean)) {
    if (clean === '::1' || clean === '::' || clean.startsWith('fe80:') || clean.startsWith('fc') || clean.startsWith('fd') || clean.startsWith('ff')) return true;
    if (clean.startsWith('::ffff:')) return isBlockedIp(clean.slice(7));
    return false;
  }
  return false;
}

async function validatePublicUrl(url, { allowHttp = false } = {}) {
  if (typeof url !== 'string' || !url.trim()) throw new ResearchError('ERR_BLOCKED_URL', 'Empty URL');
  let parsed;
  try {
    parsed = new URL(url.trim());
  } catch {
    throw new ResearchError('ERR_BLOCKED_URL', 'Invalid URL');
  }
  const allowed = allowHttp ? ['https:', 'http:'] : ['https:'];
  if (!allowed.includes(parsed.protocol)) {
    throw new ResearchError('ERR_BLOCKED_URL', `Blocked scheme: ${parsed.protocol}`);
  }
  const host = parsed.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (!host || parsed.username || parsed.password || host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal')) {
    throw new ResearchError('ERR_BLOCKED_URL', `Blocked host: ${host}`);
  }
  if (net.isIP(host)) {
    if (isBlockedIp(host)) throw new ResearchError('ERR_BLOCKED_URL', `Blocked IP: ${host}`);
    return url.trim();
  }
  try {
    const addrs = await dns.lookup(host, { all: true });
    for (const entry of addrs) {
      if (isBlockedIp(entry.address)) {
        throw new ResearchError('ERR_BLOCKED_URL', `Host ${host} resolved to blocked IP ${entry.address}`);
      }
    }
  } catch (err) {
    if (err instanceof ResearchError) throw err;
  }
  return url.trim();
}

function htmlToClean(raw, fmt = 'markdown') {
  if (!['markdown', 'code_only', 'text'].includes(fmt)) {
    throw Error('format must be markdown, code_only, or text');
  }
  const text = String(raw || '');
  const isHtml = /^\s*</.test(text) && /<(html|body|div|p|script|h[1-6]|pre)\b/i.test(text.slice(0, 1500));
  let md = text;
  const codeBlocks = [];
  if (isHtml) {
    let stripped = text
      .replace(/<(script|style|nav|footer|aside|noscript|svg)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<pre\b[^>]*>([\s\S]*?)<\/pre>/gi, (_, inner) => {
        const cleanCode = inner.replace(/<[^>]+>/g, '').trim();
        if (cleanCode) codeBlocks.push(cleanCode);
        return `\n\`\`\`\n${cleanCode}\n\`\`\`\n`;
      })
      .replace(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi, (_, lvl, inner) => `\n${'#'.repeat(Math.min(3, Number(lvl)))} ${inner.replace(/<[^>]+>/g, '').trim()}\n`)
      .replace(/<li\b[^>]*>([\s\S]*?)<\/li>/gi, (_, inner) => `\n- ${inner.replace(/<[^>]+>/g, '').trim()}\n`)
      .replace(/<(p|div|br|tr|section|article)\b[^>]*>/gi, '\n')
      .replace(/<[^>]+>/g, ' ');
    md = stripped.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
    if (fmt === 'code_only') return codeBlocks.map((b) => `\`\`\`\n${b}\n\`\`\``).join('\n\n');
  } else if (fmt === 'code_only') {
    const matches = [...text.matchAll(/```[\w-]*\n([\s\S]*?)```/g)].map((m) => m[1].trim()).filter(Boolean);
    return matches.map((b) => `\`\`\`\n${b}\n\`\`\``).join('\n\n');
  }
  if (fmt === 'text') {
    return md.replace(/```[\w-]*\n?/g, '').replace(/^#{1,6}\s+/gm, '').replace(/[ \t]+/g, ' ').trim();
  }
  return md;
}

function focusTruncate(text, focusQuery = null, maxChars = DEFAULT_MAX_CHARS) {
  const ceiling = Math.max(100, Math.min(HARD_MAX_CHARS, Math.floor(Number(maxChars) || DEFAULT_MAX_CHARS)));
  if (text.length <= ceiling) return { text, truncated: false };
  if (!focusQuery || !String(focusQuery).trim()) return { text: text.slice(0, ceiling), truncated: true };
  const sections = text.split(/(?=^#{1,3}\s+)/m).map((s) => s.trim()).filter(Boolean);
  if (sections.length <= 1) return { text: text.slice(0, ceiling), truncated: true };
  const terms = [...new Set((String(focusQuery).toLowerCase().match(/[a-z0-9_]+/g) || []).filter((t) => t.length > 1))];
  if (!terms.length) return { text: text.slice(0, ceiling), truncated: true };
  const avgLen = sections.reduce((n, s) => n + s.split(/\s+/).length, 0) / sections.length;
  const df = Object.fromEntries(terms.map((t) => [t, sections.filter((s) => s.toLowerCase().includes(t)).length]));
  const k1 = 1.5, b = 0.75;
  const scored = sections.map((sec, idx) => {
    const low = sec.toLowerCase();
    const words = low.match(/[a-z0-9_]+/g) || [];
    const dl = Math.max(1, words.length);
    let score = 0;
    const first = sec.split('\n')[0].toLowerCase();
    for (const term of terms) {
      const tf = words.filter((w) => w === term).length;
      if (!tf) continue;
      const idf = Math.log(1 + (sections.length - df[term] + 0.5) / (df[term] + 0.5));
      score += idf * ((tf * (k1 + 1)) / (tf + k1 * (1 - b + b * (dl / Math.max(1, avgLen)))));
      if (first.includes(term)) score += 2.0;
    }
    return { score, idx, sec };
  });
  scored.sort((a, b2) => (b2.score - a.score) || (a.idx - b2.idx));
  const chosen = [];
  let used = 0;
  for (const item of scored) {
    const sep = chosen.length ? 2 : 0;
    if (used + sep + item.sec.length <= ceiling) {
      chosen.push(item);
      used += sep + item.sec.length;
    } else if (!chosen.length) {
      chosen.push({ ...item, sec: item.sec.slice(0, ceiling) });
      break;
    }
  }
  chosen.sort((a, b2) => a.idx - b2.idx);
  return { text: chosen.map((c) => c.sec).join('\n\n'), truncated: true };
}

function wrapUntrusted(url, content) {
  const safe = String(url).replace(/"/g, '&quot;');
  return `<untrusted_web_content url="${safe}">\n${content}\n</untrusted_web_content>`;
}

function wrapUntrustedRag(provider, source, content) {
  return `<untrusted_rag_content provider="${String(provider).replace(/"/g, '&quot;')}" source="${String(source).replace(/"/g, '&quot;')}">\n${content}\n</untrusted_rag_content>`;
}

function normalizeResearchConfig(config = {}) {
  const raw = config && typeof config === 'object' ? config : {};
  let rawRag = raw.rag && typeof raw.rag === 'object' ? raw.rag : {};
  if (!Object.keys(rawRag).length && ['provider', 'endpoint', 'collection', 'searchMode', 'search_mode', 'topK', 'top_k'].some((k) => k in raw)) {
    rawRag = raw;
  }
  const provider = String(rawRag.provider || 'qdrant').trim().toLowerCase();
  if (!RAG_PROVIDERS.includes(provider)) {
    throw Error(`Unsupported RAG provider ${provider}; expected one of ${RAG_PROVIDERS.join(', ')}`);
  }
  const searchMode = String(rawRag.searchMode || rawRag.search_mode || 'hybrid').trim().toLowerCase();
  if (!RAG_SEARCH_MODES.includes(searchMode)) {
    throw Error(`Unsupported RAG searchMode ${searchMode}; expected one of ${RAG_SEARCH_MODES.join(', ')}`);
  }
  const maxToolCalls = Math.max(1, Math.min(MAX_TOOL_CALLS_CAP, Math.floor(Number(raw.maxToolCalls ?? raw.max_tool_calls ?? 5) || 5)));
  const maxChars = Math.max(100, Math.min(HARD_MAX_CHARS, Math.floor(Number(raw.maxChars ?? raw.max_chars ?? DEFAULT_MAX_CHARS) || DEFAULT_MAX_CHARS)));
  const topK = Math.max(1, Math.min(50, Math.floor(Number(rawRag.topK ?? rawRag.top_k ?? 5) || 5)));
  const minScore = Math.max(0, Math.min(1, Number(rawRag.minScore ?? rawRag.min_score ?? 0) || 0));
  const timeoutMs = Math.max(500, Math.min(30000, Math.floor(Number(rawRag.timeoutMs ?? rawRag.timeout_ms ?? 5000) || 5000)));
  const headers = rawRag.headers && typeof rawRag.headers === 'object'
    ? Object.fromEntries(Object.entries(rawRag.headers).map(([k, v]) => [String(k), String(v)]))
    : {};
  return {
    enabled: raw.enabled !== false,
    maxToolCalls,
    maxChars,
    targetStack: String(raw.targetStack ?? raw.target_stack ?? '').trim(),
    rag: {
      enabled: Boolean(rawRag.enabled),
      provider,
      endpoint: String(rawRag.endpoint || '').trim(),
      collection: String(rawRag.collection || rawRag.index || 'default').trim() || 'default',
      namespace: String(rawRag.namespace || '').trim(),
      apiKey: String(rawRag.apiKey || rawRag.api_key || '').trim(),
      searchMode,
      topK,
      minScore,
      embeddingEndpoint: String(rawRag.embeddingEndpoint || rawRag.embedding_endpoint || '').trim(),
      embeddingModel: String(rawRag.embeddingModel || rawRag.embedding_model || '').trim(),
      allowLocalhost: (rawRag.allowLocalhost ?? rawRag.allow_localhost ?? true) !== false,
      timeoutMs,
      headers,
      ragOnly: Boolean(rawRag.ragOnly ?? rawRag.rag_only ?? false),
    },
  };
}

function redactResearchConfig(config = {}) {
  const cfg = normalizeResearchConfig(config);
  if (cfg.rag.apiKey) cfg.rag.apiKey = '***';
  return cfg;
}

function isAlwaysBlockedIp(ip) {
  const clean = String(ip || '').split('%')[0].toLowerCase();
  if (net.isIPv4(clean)) {
    const p = clean.split('.').map(Number);
    if (p[0] === 0 || (p[0] === 169 && p[1] === 254) || p[0] >= 224) return true;
    return false;
  }
  if (net.isIPv6(clean)) {
    if (clean === '::' || clean.startsWith('fe80:') || clean.startsWith('ff')) return true;
    if (clean.startsWith('::ffff:')) return isAlwaysBlockedIp(clean.slice(7));
    return false;
  }
  return false;
}

async function validateRagUrl(url, { allowLocalhost = true } = {}) {
  if (typeof url !== 'string' || !url.trim()) throw new ResearchError('ERR_BLOCKED_URL', 'Empty RAG endpoint URL');
  let parsed;
  try {
    parsed = new URL(url.trim());
  } catch {
    throw new ResearchError('ERR_BLOCKED_URL', 'Invalid RAG endpoint URL');
  }
  if (!['https:', 'http:'].includes(parsed.protocol)) {
    throw new ResearchError('ERR_BLOCKED_URL', `Blocked RAG scheme: ${parsed.protocol}`);
  }
  const host = parsed.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (!host || parsed.username || parsed.password) {
    throw new ResearchError('ERR_BLOCKED_URL', `Blocked RAG host: ${host}`);
  }
  if (!allowLocalhost && (host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal'))) {
    throw new ResearchError('ERR_BLOCKED_URL', `Blocked local RAG host: ${host}`);
  }
  if (net.isIP(host)) {
    if (isAlwaysBlockedIp(host) || (!allowLocalhost && isBlockedIp(host))) {
      throw new ResearchError('ERR_BLOCKED_URL', `Blocked RAG IP: ${host}`);
    }
    return url.trim().replace(/\/+$/, '');
  }
  try {
    const addrs = await dns.lookup(host, { all: true });
    for (const entry of addrs) {
      if (isAlwaysBlockedIp(entry.address) || (!allowLocalhost && isBlockedIp(entry.address))) {
        throw new ResearchError('ERR_BLOCKED_URL', `RAG host ${host} resolved to blocked IP ${entry.address}`);
      }
    }
  } catch (err) {
    if (err instanceof ResearchError) throw err;
  }
  return url.trim().replace(/\/+$/, '');
}

async function httpPostJson(url, payload, { headers = {}, timeoutMs = 5000, allowLocalhost = true } = {}) {
  await validateRagUrl(url, { allowLocalhost });
  let attempts = 0;
  while (true) {
    attempts++;
    try {
      const res = await fetch(url, {
        method: 'POST',
        signal: AbortSignal.timeout(timeoutMs),
        headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'User-Agent': 'codingagentlib/1.0', ...headers },
        body: JSON.stringify(payload),
      });
      if ([401, 403, 429].includes(res.status)) {
        throw new ResearchError('ERR_ACCESS_DENIED', `RAG HTTP ${res.status}`, res.status);
      }
      if (res.status >= 500 && res.status < 600 && attempts === 1) {
        await new Promise((r) => setTimeout(r, 500));
        continue;
      }
      if (!res.ok) throw new ResearchError('ERR_FETCH_TIMEOUT', `RAG HTTP ${res.status}`, res.status);
      const text = (await res.text()).slice(0, MAX_DOWNLOAD_BYTES);
      return JSON.parse(text);
    } catch (err) {
      if (err instanceof ResearchError) throw err;
      if (attempts === 1) {
        await new Promise((r) => setTimeout(r, 500));
        continue;
      }
      throw new ResearchError('ERR_FETCH_TIMEOUT', err.message || 'RAG request failed');
    }
  }
}

function buildRagRequest(provider, endpoint, query, { collection, namespace, topK, minScore, searchMode, apiKey, vector, filter, extraHeaders }) {
  const base = endpoint.replace(/\/+$/, '');
  const headers = { ...(extraHeaders || {}) };
  if (provider === 'qdrant') {
    if (apiKey && !headers['api-key']) headers['api-key'] = apiKey;
    const payload = { limit: topK, with_payload: true, query: vector || query };
    if (minScore > 0) payload.score_threshold = minScore;
    if (filter) payload.filter = filter;
    return { url: `${base}/collections/${encodeURIComponent(collection)}/points/query`, payload, headers };
  }
  if (provider === 'pinecone') {
    if (apiKey && !headers['Api-Key']) headers['Api-Key'] = apiKey;
    const url = base.endsWith('/query') ? base : `${base}/query`;
    const payload = { topK, includeMetadata: true };
    if (namespace) payload.namespace = namespace;
    if (filter) payload.filter = filter;
    if (vector) payload.vector = vector;
    else payload.query = query;
    return { url, payload, headers };
  }
  if (provider === 'weaviate') {
    if (apiKey && !headers.Authorization) headers.Authorization = `Bearer ${apiKey}`;
    const url = base.endsWith('/v1/graphql') ? base : `${base}/v1/graphql`;
    const cls = collection.replace(/[^A-Za-z0-9_]/g, '') || 'Document';
    const qJson = JSON.stringify(query);
    let clause;
    if (searchMode === 'sparse') clause = `bm25: { query: ${qJson} }`;
    else if (searchMode === 'dense' && vector) clause = `nearVector: { vector: ${JSON.stringify(vector)} }`;
    else if (searchMode === 'dense') clause = `nearText: { concepts: [${qJson}] }`;
    else clause = `hybrid: { query: ${qJson}${vector ? `, vector: ${JSON.stringify(vector)}` : ''} }`;
    return { url, payload: { query: `{ Get { ${cls}(${clause}, limit: ${topK}) { text content title source url _additional { id score distance certainty } } } }` }, headers };
  }
  if (provider === 'chroma') {
    if (apiKey && !headers.Authorization) headers.Authorization = `Bearer ${apiKey}`;
    const payload = { n_results: topK, include: ['documents', 'metadatas', 'distances'] };
    if (filter) payload.where = filter;
    if (vector) payload.query_embeddings = [vector];
    else payload.query_texts = [query];
    return { url: `${base}/api/v1/collections/${encodeURIComponent(collection)}/query`, payload, headers };
  }
  if (provider === 'milvus') {
    if (apiKey && !headers.Authorization) headers.Authorization = `Bearer ${apiKey}`;
    const url = base.includes('/entities/search') ? base : `${base}/v2/vectordb/entities/search`;
    const payload = { collectionName: collection, limit: topK, outputFields: ['*'], data: [vector || query] };
    if (namespace) payload.partitionNames = [namespace];
    if (typeof filter === 'string') payload.filter = filter;
    return { url, payload, headers };
  }
  if (provider === 'elasticsearch' || provider === 'opensearch') {
    if (apiKey && !headers.Authorization) headers.Authorization = provider === 'elasticsearch' ? `ApiKey ${apiKey}` : `Bearer ${apiKey}`;
    const url = base.endsWith('/_search') ? base : `${base}/${encodeURIComponent(collection)}/_search`;
    const payload = { size: topK };
    if (vector && ['dense', 'hybrid', 'rerank'].includes(searchMode)) {
      payload.knn = { field: 'embedding', query_vector: vector, k: topK, num_candidates: Math.max(topK * 4, 20) };
    }
    if (['sparse', 'hybrid', 'rerank'].includes(searchMode) || !vector) {
      payload.query = { match: { content: query } };
    }
    return { url, payload, headers };
  }
  if (provider === 'lancedb') {
    if (apiKey && !headers.Authorization) headers.Authorization = `Bearer ${apiKey}`;
    const payload = { query, k: topK, search_mode: searchMode };
    if (vector) payload.vector = vector;
    if (filter) payload.filter = filter;
    return { url: `${base}/v1/table/${encodeURIComponent(collection)}/query`, payload, headers };
  }
  if (apiKey && !headers.Authorization) headers.Authorization = `Bearer ${apiKey}`;
  const payload = { provider, query, collection, top_k: topK, min_score: minScore, search_mode: searchMode };
  if (namespace) payload.namespace = namespace;
  if (vector) payload.vector = vector;
  if (filter) payload.filter = filter;
  return { url: base, payload, headers };
}

function parseRagResponse(provider, data, { collection, topK, minScore }) {
  const items = [];
  if (!data || typeof data !== 'object') return items;
  if (provider === 'qdrant') {
    const rawHits = Array.isArray(data.result) ? data.result : (data.result?.points || []);
    for (const hit of rawHits) {
      const pl = hit?.payload || {};
      items.push({ id: String(hit.id ?? ''), title: String(pl.title || pl.name || ''), source: String(pl.source || pl.url || `rag://qdrant/${collection}/${hit.id ?? ''}`), content: String(pl.text || pl.content || pl.page_content || ''), score: Number(hit.score || 0), metadata: pl });
    }
  } else if (provider === 'pinecone') {
    for (const m of data.matches || []) {
      const md = m?.metadata || {};
      items.push({ id: String(m.id ?? ''), title: String(md.title || ''), source: String(md.source || md.url || `rag://pinecone/${collection}/${m.id ?? ''}`), content: String(md.text || md.content || md.chunk || ''), score: Number(m.score || 0), metadata: md });
    }
  } else if (provider === 'weaviate') {
    for (const clsHits of Object.values(data.data?.Get || {})) {
      if (!Array.isArray(clsHits)) continue;
      for (const hit of clsHits) {
        const add = hit._additional || {};
        const score = add.score ?? add.certainty ?? (add.distance != null ? Math.max(0, 1 - Number(add.distance)) : 0);
        items.push({ id: String(add.id ?? ''), title: String(hit.title || ''), source: String(hit.source || hit.url || `rag://weaviate/${collection}/${add.id ?? ''}`), content: String(hit.text || hit.content || ''), score: Number(score || 0), metadata: hit });
      }
    }
  } else if (provider === 'chroma') {
    const docs = data.documents?.[0] || [], metas = data.metadatas?.[0] || [], dists = data.distances?.[0] || [], ids = data.ids?.[0] || [];
    for (let i = 0; i < docs.length; i++) {
      const md = metas[i] || {}, hid = String(ids[i] ?? i);
      const score = dists[i] != null ? Math.max(0, 1 - Number(dists[i])) : 1.0;
      items.push({ id: hid, title: String(md.title || ''), source: String(md.source || md.url || `rag://chroma/${collection}/${hid}`), content: String(docs[i] || ''), score, metadata: md });
    }
  } else if (provider === 'milvus') {
    for (const hit of data.data || []) {
      const score = hit.score ?? (hit.distance != null ? Math.max(0, 1 - Number(hit.distance)) : 0);
      items.push({ id: String(hit.id ?? ''), title: String(hit.title || ''), source: String(hit.source || hit.url || `rag://milvus/${collection}/${hit.id ?? ''}`), content: String(hit.text || hit.content || ''), score: Number(score), metadata: hit });
    }
  } else if (provider === 'elasticsearch' || provider === 'opensearch') {
    for (const hit of data.hits?.hits || []) {
      const src = hit._source || {};
      items.push({ id: String(hit._id ?? ''), title: String(src.title || ''), source: String(src.source || src.url || `rag://${provider}/${collection}/${hit._id ?? ''}`), content: String(src.text || src.content || ''), score: Number(hit._score || 0), metadata: src });
    }
  }
  if (!items.length) {
    const rawList = data.results || data.matches || data.data || data.hits || [];
    for (let i = 0; i < (Array.isArray(rawList) ? rawList.length : 0); i++) {
      const hit = rawList[i] || {}, md = hit.metadata || {}, hid = String(hit.id ?? i);
      items.push({ id: hid, title: String(hit.title || md.title || ''), source: String(hit.source || hit.url || md.source || `rag://${provider}/${collection}/${hid}`), content: String(hit.content || hit.text || hit.document || ''), score: Number(hit.score ?? 1.0), metadata: md });
    }
  }
  return items.filter((it) => it.content.trim() && it.score >= minScore).sort((a, b) => b.score - a.score).slice(0, topK);
}

async function ragSearch(query, { config = null, provider = null, endpoint = null, collection = null, namespace = null, apiKey = null, topK = null, minScore = null, searchMode = null, vector = null, filter = null, targetStack = null, maxChars = null, ragFn = null, fetcher = null } = {}) {
  const t0 = Date.now();
  const traceId = crypto.randomUUID().slice(0, 12);
  if (typeof query !== 'string' || !query.trim()) throw Error('Provide a nonempty RAG search query');
  const norm = normalizeResearchConfig(config || {});
  const ragCfg = norm.rag;
  const effProvider = String(provider || ragCfg.provider).trim().toLowerCase();
  if (!RAG_PROVIDERS.includes(effProvider)) throw Error(`Unsupported RAG provider ${effProvider}`);
  const effEndpoint = String(endpoint ?? ragCfg.endpoint).trim();
  const effCollection = String(collection || ragCfg.collection).trim() || 'default';
  const effNamespace = String(namespace ?? ragCfg.namespace).trim();
  const effApiKey = apiKey ?? ragCfg.apiKey;
  const effMode = String(searchMode || ragCfg.searchMode).trim().toLowerCase();
  if (!RAG_SEARCH_MODES.includes(effMode)) throw Error(`Unsupported RAG searchMode ${effMode}`);
  const effTopK = Math.max(1, Math.min(50, Math.floor(Number(topK ?? ragCfg.topK) || 5)));
  const effMinScore = Math.max(0, Math.min(1, Number(minScore ?? ragCfg.minScore) || 0));
  const effMaxChars = Math.max(100, Math.min(HARD_MAX_CHARS, Math.floor(Number(maxChars ?? norm.maxChars) || DEFAULT_MAX_CHARS)));
  const effStack = String(targetStack ?? norm.targetStack).trim();
  const anchored = effStack ? `${query.trim()} ${effStack}` : query.trim();

  let rawData;
  if (ragFn) {
    rawData = await ragFn(anchored, { provider: effProvider, endpoint: effEndpoint, collection: effCollection, namespace: effNamespace, topK: effTopK, minScore: effMinScore, searchMode: effMode, filter });
  } else {
    if (!effEndpoint) throw new ResearchError('ERR_RAG_UNCONFIGURED', 'RAG endpoint is not configured');
    await validateRagUrl(effEndpoint, { allowLocalhost: ragCfg.allowLocalhost });
    let effVector = vector;
    if (!effVector && ragCfg.embeddingEndpoint) {
      const embHeaders = effApiKey ? { Authorization: `Bearer ${effApiKey}` } : {};
      const embPayload = { input: anchored, ...(ragCfg.embeddingModel ? { model: ragCfg.embeddingModel } : {}) };
      const embData = fetcher ? await fetcher(ragCfg.embeddingEndpoint, embPayload, embHeaders) : await httpPostJson(ragCfg.embeddingEndpoint, embPayload, { headers: embHeaders, timeoutMs: ragCfg.timeoutMs, allowLocalhost: ragCfg.allowLocalhost });
      effVector = embData?.data?.[0]?.embedding || embData?.embedding || null;
    }
    const req = buildRagRequest(effProvider, effEndpoint, anchored, { collection: effCollection, namespace: effNamespace, topK: effTopK, minScore: effMinScore, searchMode: effMode, apiKey: effApiKey, vector: effVector, filter, extraHeaders: ragCfg.headers });
    rawData = fetcher ? await fetcher(req.url, req.payload, req.headers) : await httpPostJson(req.url, req.payload, { headers: req.headers, timeoutMs: ragCfg.timeoutMs, allowLocalhost: ragCfg.allowLocalhost });
  }
  const hits = parseRagResponse(effProvider, Array.isArray(rawData) ? { results: rawData } : rawData, { collection: effCollection, topK: effTopK, minScore: effMinScore });
  let anyTruncated = false, totalChars = 0;
  const perHitCap = Math.max(200, Math.floor(effMaxChars / Math.max(1, hits.length || 1)));
  const results = hits.map((hit) => {
    const { text: bounded, truncated } = focusTruncate(hit.content, query, perHitCap);
    anyTruncated = anyTruncated || truncated;
    const wrapped = wrapUntrustedRag(effProvider, hit.source, bounded);
    totalChars += wrapped.length;
    return { id: hit.id, title: hit.title, source: hit.source, url: hit.source, content: wrapped, text: wrapped, score: Number(hit.score.toFixed(6)), truncated, metadata: hit.metadata };
  });
  return {
    provider: effProvider,
    collection: effCollection,
    search_mode: effMode,
    query: anchored,
    results,
    total: results.length,
    trace: { trace_id: traceId, tool_name: 'rag_search', provider: effProvider, collection: effCollection, search_mode: effMode, latency_ms: Date.now() - t0, char_count: totalChars, truncated: anyTruncated, error_code: null },
  };
}

async function safeFetch(url, { timeoutMs = 8000, allowHttp = false, fetchImpl = fetch } = {}) {
  let current = await validatePublicUrl(url, { allowHttp });
  for (let redir = 0; redir <= MAX_REDIRECTS; redir++) {
    let attempts = 0;
    while (true) {
      attempts++;
      try {
        const res = await fetchImpl(current, {
          redirect: 'manual',
          signal: AbortSignal.timeout(timeoutMs),
          headers: { 'User-Agent': 'codingagentlib/1.0' },
        });
        if ([301, 302, 303, 307, 308].includes(res.status)) {
          const loc = res.headers.get('location');
          if (!loc || redir >= MAX_REDIRECTS) throw new ResearchError('ERR_BLOCKED_URL', 'Blocked or excessive redirect');
          current = await validatePublicUrl(new URL(loc, current).toString(), { allowHttp });
          break;
        }
        if ([401, 403, 429].includes(res.status)) {
          throw new ResearchError('ERR_ACCESS_DENIED', `HTTP ${res.status}`, res.status);
        }
        if (res.status >= 500 && attempts === 1) {
          await new Promise((r) => setTimeout(r, 500));
          continue;
        }
        if (!res.ok) throw new ResearchError('ERR_FETCH_TIMEOUT', `HTTP ${res.status}`, res.status);
        const text = (await res.text()).slice(0, MAX_DOWNLOAD_BYTES);
        return { text, contentType: res.headers.get('content-type') || 'text/plain' };
      } catch (err) {
        if (err instanceof ResearchError) throw err;
        if (attempts === 1) {
          await new Promise((r) => setTimeout(r, 500));
          continue;
        }
        throw new ResearchError('ERR_FETCH_TIMEOUT', err.message || 'Fetch failed');
      }
    }
  }
  throw new ResearchError('ERR_BLOCKED_URL', 'Exceeded max redirects');
}

async function webSearch(query, { targetStack = null, maxResults = 5, fetcher = null } = {}) {
  const t0 = Date.now();
  const traceId = crypto.randomUUID().slice(0, 12);
  if (typeof query !== 'string' || !query.trim()) throw Error('Provide a nonempty search query');
  const lim = Math.max(1, Math.min(10, Number(maxResults) || 5));
  const anchored = targetStack && String(targetStack).trim() ? `${query.trim()} ${String(targetStack).trim()}` : query.trim();
  const url = 'https://html.duckduckgo.com/html/?q=' + encodeURIComponent(anchored);
  const { text: raw } = fetcher ? await fetcher(url) : await safeFetch(url, { timeoutMs: 5000 });
  const results = [];
  for (const chunk of String(raw).split('class="result__a"').slice(1)) {
    if (results.length >= lim) break;
    const href = /href="([^"]+)"/.exec(chunk)?.[1] || '';
    const titleRaw = />([\s\S]*?)<\/a>/.exec(chunk)?.[1] || '';
    const snipRaw = /class="result__snippet"[^>]*>([\s\S]*?)<\/a>/.exec(chunk)?.[1] || '';
    const title = titleRaw.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    const snippet = snipRaw.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 300);
    if (title && href) results.push({ title, url: href, snippet, published_date: null });
  }
  return {
    query: anchored,
    results,
    total: results.length,
    trace: { trace_id: traceId, tool_name: 'web_search', latency_ms: Date.now() - t0, char_count: results.reduce((n, r) => n + r.snippet.length, 0), truncated: false, error_code: null },
  };
}

async function webFetch(url, { focusQuery = null, format = 'markdown', maxChars = DEFAULT_MAX_CHARS, fetcher = null, allowHttp = false } = {}) {
  const t0 = Date.now();
  const traceId = crypto.randomUUID().slice(0, 12);
  await validatePublicUrl(url, { allowHttp });
  const { text: raw, contentType } = fetcher ? await fetcher(url) : await safeFetch(url, { timeoutMs: 8000, allowHttp });
  const cleaned = htmlToClean(raw, format);
  const { text: bounded, truncated } = focusTruncate(cleaned, focusQuery, maxChars);
  const wrapped = wrapUntrusted(url, bounded);
  return {
    url,
    contentType,
    format,
    text: wrapped,
    truncated,
    totalCharacters: cleaned.length,
    trace: { trace_id: traceId, tool_name: 'web_fetch', latency_ms: Date.now() - t0, char_count: wrapped.length, truncated, error_code: null },
  };
}

function summarizeResearch(sources, { objective = '', targetStack = null, budgetExhausted = false } = {}) {
  if (!Array.isArray(sources) || sources.length < 1 || sources.length > 5) {
    throw Error('summarizeResearch requires 1 to 5 fetched sources');
  }
  const citations = [];
  const codeExamples = [];
  const gotchas = [];
  const versionConstraints = targetStack && String(targetStack).trim() ? [String(targetStack).trim()] : [];
  const summaryLines = [];
  for (const src of sources) {
    const url = String(src.url || '').trim();
    if (url && !citations.includes(url)) citations.push(url);
    const body = String(src.text || src.content || '')
      .replace(/<\/?untrusted_(?:web|rag)_content\b[^>]*>/g, '')
      .split('\n')
      .filter((ln) => !INJECTION_RE.test(ln))
      .join('\n')
      .trim();
    for (const m of body.matchAll(/```([a-zA-Z0-9_+-]*)\n([\s\S]*?)```/g)) {
      const code = m[2].trim();
      if (code) codeExamples.push({ language: m[1] || 'text', code: code.slice(0, 2000), source_url: url });
    }
    for (const rawLine of body.split('\n')) {
      const clean = rawLine.trim().replace(/^#+\s*/, '').trim();
      if (!clean) continue;
      const low = clean.toLowerCase();
      if (/(deprecated|breaking|warning|gotcha|caveat)/.test(low) && gotchas.length < 8) gotchas.push(clean.slice(0, 240));
      if (/\b(python|node|rust|typescript|fastapi|react|next\.?js)\s*\d+(?:\.\d+)*/.test(low) && versionConstraints.length < 8) {
        if (!versionConstraints.includes(clean.slice(0, 120))) versionConstraints.push(clean.slice(0, 120));
      }
      if (!clean.startsWith('```') && summaryLines.length < 3 && clean.length > 20) summaryLines.push(clean.slice(0, 220));
    }
  }
  const status = !citations.length && !summaryLines.length && !codeExamples.length
    ? 'no_relevant_results'
    : budgetExhausted ? 'partial_budget_exhausted' : 'complete';
  return {
    status,
    summary: summaryLines.join(' ') || (objective ? `Findings for ${objective}` : 'No relevant findings.'),
    version_constraints: versionConstraints,
    code_examples: codeExamples.slice(0, 8),
    gotchas,
    citations,
  };
}

async function runResearch(request, { searchFn = webSearch, fetchFn = webFetch, ragFn = null, researchConfig = null } = {}) {
  const objective = String(request?.objective || '').trim();
  if (!objective) throw Error('ResearchRequest requires objective');
  const cfg = normalizeResearchConfig(researchConfig || {});
  let cfgRag = cfg.rag;
  if (request?.rag && typeof request.rag === 'object') {
    cfgRag = normalizeResearchConfig({ rag: { ...cfgRag, ...request.rag } }).rag;
  } else if (request?.rag === true || request?.use_rag === true) {
    cfgRag = { ...cfgRag, enabled: true };
  } else if (request?.rag === false) {
    cfgRag = { ...cfgRag, enabled: false };
  }
  const targetStack = request.target_stack || cfg.targetStack || null;
  const budget = Math.max(1, Math.min(MAX_TOOL_CALLS_CAP, Number(request.max_tool_calls ?? cfg.maxToolCalls) || 5));
  let calls = 0;
  let budgetExhausted = false;
  const fetched = [];
  const nextCall = () => {
    if (calls >= budget) {
      budgetExhausted = true;
      throw new ResearchError('ERR_BUDGET_EXCEEDED', `Research budget of ${budget} tool calls exhausted`);
    }
    calls++;
  };
  try {
    if (cfgRag.enabled) {
      nextCall();
      try {
        const ragRes = ragFn && !cfgRag.endpoint
          ? await ragFn(objective, { config: { rag: cfgRag, maxChars: cfg.maxChars, targetStack: targetStack || '' } })
          : await ragSearch(objective, { config: { rag: cfgRag, maxChars: cfg.maxChars, targetStack: targetStack || '' }, ragFn });
        for (const item of ragRes?.results || []) {
          if (item.content || item.text) {
            fetched.push({ url: item.source || item.url || `rag://${cfgRag.provider}/${cfgRag.collection}`, text: item.content || item.text });
          }
        }
      } catch (err) {
        if (!(err instanceof ResearchError && ['ERR_BLOCKED_URL', 'ERR_ACCESS_DENIED', 'ERR_FETCH_TIMEOUT', 'ERR_RAG_UNCONFIGURED'].includes(err.code))) throw err;
      }
    }
    if (!cfgRag.ragOnly) {
      nextCall();
      const sr = await searchFn(objective, { targetStack, maxResults: 5 });
      for (const item of sr.results || []) {
        if (!item.url) continue;
        nextCall();
        try {
          fetched.push(await fetchFn(item.url, { focusQuery: objective }));
        } catch (err) {
          if (err instanceof ResearchError && ['ERR_BLOCKED_URL', 'ERR_ACCESS_DENIED', 'ERR_FETCH_TIMEOUT'].includes(err.code)) continue;
          throw err;
        }
      }
    }
  } catch (err) {
    if (!(err instanceof ResearchError && err.code === 'ERR_BUDGET_EXCEEDED')) throw err;
  }
  if (!fetched.length) {
    return {
      status: budgetExhausted ? 'partial_budget_exhausted' : 'no_relevant_results',
      summary: `No relevant sources retrieved for ${objective}.`,
      version_constraints: targetStack ? [targetStack] : [],
      code_examples: [],
      gotchas: [],
      citations: [],
    };
  }
  return summarizeResearch(fetched.slice(0, 5), { objective, targetStack, budgetExhausted });
}

module.exports = {
  RAG_PROVIDERS,
  RAG_SEARCH_MODES,
  DEFAULT_RESEARCH_CONFIG,
  ResearchError,
  normalizeResearchConfig,
  redactResearchConfig,
  validatePublicUrl,
  validateRagUrl,
  htmlToClean,
  focusTruncate,
  wrapUntrusted,
  wrapUntrustedRag,
  webSearch,
  webFetch,
  ragSearch,
  summarizeResearch,
  runResearch,
};
