//! Internet Research Module: SSRF-guarded URL validation, clean Markdown extraction,
//! focus-aware heading chunk truncation, untrusted content isolation, and ResearchBrief synthesis.
use crate::Result;
use serde_json::{json, Value};
use std::net::{IpAddr, ToSocketAddrs};

pub const DEFAULT_MAX_CHARS: usize = 12_000;
pub const HARD_MAX_CHARS: usize = 25_000;
pub const MAX_TOOL_CALLS_CAP: usize = 15;

pub const RAG_PROVIDERS: &[&str] = &[
    "qdrant",
    "pinecone",
    "weaviate",
    "chroma",
    "milvus",
    "pgvector",
    "elasticsearch",
    "opensearch",
    "lancedb",
    "faiss",
    "custom",
];

pub const RAG_SEARCH_MODES: &[&str] = &["hybrid", "dense", "sparse", "rerank"];

pub fn default_research_config() -> Value {
    json!({
        "enabled": true,
        "maxToolCalls": 5,
        "maxChars": DEFAULT_MAX_CHARS,
        "targetStack": "",
        "rag": {
            "enabled": false,
            "provider": "qdrant",
            "endpoint": "",
            "collection": "default",
            "namespace": "",
            "apiKey": "",
            "searchMode": "hybrid",
            "topK": 5,
            "minScore": 0.0,
            "embeddingEndpoint": "",
            "embeddingModel": "",
            "allowLocalhost": true,
            "timeoutMs": 5000,
            "headers": {},
            "ragOnly": false
        }
    })
}

pub fn normalize_research_config(config: &Value) -> Result<Value> {
    let raw = if config.is_object() { config.clone() } else { json!({}) };
    let raw_rag = if raw["rag"].is_object() {
        raw["rag"].clone()
    } else if ["provider", "endpoint", "collection", "searchMode", "search_mode", "topK", "top_k"]
        .iter()
        .any(|k| !raw[k].is_null())
    {
        raw.clone()
    } else {
        json!({})
    };
    let provider = raw_rag["provider"]
        .as_str()
        .unwrap_or("qdrant")
        .trim()
        .to_ascii_lowercase();
    if !RAG_PROVIDERS.contains(&provider.as_str()) {
        return Err(format!("Unsupported RAG provider {provider}").into());
    }
    let search_mode = raw_rag["searchMode"]
        .as_str()
        .or_else(|| raw_rag["search_mode"].as_str())
        .unwrap_or("hybrid")
        .trim()
        .to_ascii_lowercase();
    if !RAG_SEARCH_MODES.contains(&search_mode.as_str()) {
        return Err(format!("Unsupported RAG searchMode {search_mode}").into());
    }
    let max_calls = raw["maxToolCalls"]
        .as_u64()
        .or_else(|| raw["max_tool_calls"].as_u64())
        .unwrap_or(5)
        .clamp(1, MAX_TOOL_CALLS_CAP as u64);
    let max_chars = raw["maxChars"]
        .as_u64()
        .or_else(|| raw["max_chars"].as_u64())
        .unwrap_or(DEFAULT_MAX_CHARS as u64)
        .clamp(100, HARD_MAX_CHARS as u64);
    let top_k = raw_rag["topK"]
        .as_u64()
        .or_else(|| raw_rag["top_k"].as_u64())
        .unwrap_or(5)
        .clamp(1, 50);
    let min_score = raw_rag["minScore"]
        .as_f64()
        .or_else(|| raw_rag["min_score"].as_f64())
        .unwrap_or(0.0)
        .clamp(0.0, 1.0);
    let timeout_ms = raw_rag["timeoutMs"]
        .as_u64()
        .or_else(|| raw_rag["timeout_ms"].as_u64())
        .unwrap_or(5000)
        .clamp(500, 30_000);
    let headers = if let Some(map) = raw_rag["headers"].as_object() {
        Value::Object(
            map.iter()
                .map(|(k, v)| (k.clone(), json!(v.as_str().unwrap_or(&v.to_string()))))
                .collect(),
        )
    } else {
        json!({})
    };
    Ok(json!({
        "enabled": raw["enabled"].as_bool().unwrap_or(true),
        "maxToolCalls": max_calls,
        "maxChars": max_chars,
        "targetStack": raw["targetStack"].as_str().or_else(|| raw["target_stack"].as_str()).unwrap_or("").trim(),
        "rag": {
            "enabled": raw_rag["enabled"].as_bool().unwrap_or(false),
            "provider": provider,
            "endpoint": raw_rag["endpoint"].as_str().unwrap_or("").trim(),
            "collection": raw_rag["collection"].as_str().or_else(|| raw_rag["index"].as_str()).unwrap_or("default").trim(),
            "namespace": raw_rag["namespace"].as_str().unwrap_or("").trim(),
            "apiKey": raw_rag["apiKey"].as_str().or_else(|| raw_rag["api_key"].as_str()).unwrap_or("").trim(),
            "searchMode": search_mode,
            "topK": top_k,
            "minScore": min_score,
            "embeddingEndpoint": raw_rag["embeddingEndpoint"].as_str().or_else(|| raw_rag["embedding_endpoint"].as_str()).unwrap_or("").trim(),
            "embeddingModel": raw_rag["embeddingModel"].as_str().or_else(|| raw_rag["embedding_model"].as_str()).unwrap_or("").trim(),
            "allowLocalhost": raw_rag["allowLocalhost"].as_bool().or_else(|| raw_rag["allow_localhost"].as_bool()).unwrap_or(true),
            "timeoutMs": timeout_ms,
            "headers": headers,
            "ragOnly": raw_rag["ragOnly"].as_bool().or_else(|| raw_rag["rag_only"].as_bool()).unwrap_or(false)
        }
    }))
}

pub fn redact_research_config(config: &Value) -> Result<Value> {
    let mut cfg = normalize_research_config(config)?;
    if let Some(key) = cfg["rag"]["apiKey"].as_str() {
        if !key.is_empty() {
            cfg["rag"]["apiKey"] = json!("***");
        }
    }
    Ok(cfg)
}

fn is_always_blocked_ip(ip: IpAddr) -> bool {
    match ip {
        IpAddr::V4(v4) => v4.is_link_local() || v4.is_unspecified() || v4.is_multicast(),
        IpAddr::V6(v6) => {
            v6.is_unspecified()
                || v6.is_multicast()
                || (v6.segments()[0] & 0xffc0) == 0xfe80
        }
    }
}

pub fn validate_rag_url(url: &str, allow_localhost: bool) -> Result<String> {
    let trimmed = url.trim();
    let (scheme, rest) = if let Some(r) = trimmed.strip_prefix("https://") {
        ("https", r)
    } else if let Some(r) = trimmed.strip_prefix("http://") {
        ("http", r)
    } else {
        return Err("ERR_BLOCKED_URL: Only HTTP(S) RAG URLs are permitted".into());
    };
    let authority = rest.split(['/', '?', '#']).next().unwrap_or("");
    if authority.is_empty() || authority.contains('@') {
        return Err("ERR_BLOCKED_URL: Invalid RAG URL authority".into());
    }
    let host_port = if authority.starts_with('[') {
        authority.split(']').next().unwrap_or("").trim_start_matches('[')
    } else {
        authority.split(':').next().unwrap_or("")
    };
    let lower = host_port.to_ascii_lowercase();
    if lower.is_empty()
        || (!allow_localhost
            && (lower == "localhost" || lower.ends_with(".local") || lower.ends_with(".internal")))
    {
        return Err(format!("ERR_BLOCKED_URL: Blocked RAG host {lower}").into());
    }
    if let Ok(ip) = lower.parse::<IpAddr>() {
        if is_always_blocked_ip(ip) || (!allow_localhost && is_blocked_ip(ip)) {
            return Err(format!("ERR_BLOCKED_URL: Blocked RAG IP {ip}").into());
        }
        return Ok(trimmed.trim_end_matches('/').to_owned());
    }
    let port: u16 = if scheme == "https" { 443 } else { 80 };
    if let Ok(addrs) = (host_port, port).to_socket_addrs() {
        for addr in addrs {
            let ip = addr.ip();
            if is_always_blocked_ip(ip) || (!allow_localhost && is_blocked_ip(ip)) {
                return Err(format!("ERR_BLOCKED_URL: RAG host {lower} resolved to blocked IP {ip}").into());
            }
        }
    }
    Ok(trimmed.trim_end_matches('/').to_owned())
}

pub fn wrap_untrusted_rag(provider: &str, source: &str, content: &str) -> String {
    let p = provider.replace('"', "&quot;");
    let s = source.replace('"', "&quot;");
    format!("<untrusted_rag_content provider=\"{p}\" source=\"{s}\">\n{content}\n</untrusted_rag_content>")
}

pub fn build_rag_request(
    provider: &str,
    endpoint: &str,
    query: &str,
    collection: &str,
    namespace: &str,
    top_k: usize,
    min_score: f64,
    search_mode: &str,
    api_key: &str,
    vector: Option<&Value>,
    filter: Option<&Value>,
    extra_headers: Option<&Value>,
) -> (String, Value, serde_json::Map<String, Value>) {
    let base = endpoint.trim_end_matches('/');
    let mut headers = extra_headers
        .and_then(Value::as_object)
        .cloned()
        .unwrap_or_default();
    let q_or_vec = vector.cloned().unwrap_or_else(|| json!(query));
    match provider {
        "qdrant" => {
            if !api_key.is_empty() && !headers.contains_key("api-key") {
                headers.insert("api-key".into(), json!(api_key));
            }
            let mut payload = json!({"limit": top_k, "with_payload": true, "query": q_or_vec});
            if min_score > 0.0 {
                payload["score_threshold"] = json!(min_score);
            }
            if let Some(f) = filter {
                payload["filter"] = f.clone();
            }
            (format!("{base}/collections/{collection}/points/query"), payload, headers)
        }
        "pinecone" => {
            if !api_key.is_empty() && !headers.contains_key("Api-Key") {
                headers.insert("Api-Key".into(), json!(api_key));
            }
            let url = if base.ends_with("/query") { base.to_owned() } else { format!("{base}/query") };
            let mut payload = json!({"topK": top_k, "includeMetadata": true});
            if !namespace.is_empty() {
                payload["namespace"] = json!(namespace);
            }
            if let Some(f) = filter {
                payload["filter"] = f.clone();
            }
            if let Some(v) = vector {
                payload["vector"] = v.clone();
            } else {
                payload["query"] = json!(query);
            }
            (url, payload, headers)
        }
        "weaviate" => {
            if !api_key.is_empty() && !headers.contains_key("Authorization") {
                headers.insert("Authorization".into(), json!(format!("Bearer {api_key}")));
            }
            let url = if base.ends_with("/v1/graphql") { base.to_owned() } else { format!("{base}/v1/graphql") };
            let cls: String = collection.chars().filter(|c| c.is_ascii_alphanumeric() || *c == '_').collect();
            let cls_name = if cls.is_empty() { "Document" } else { cls.as_str() };
            let q_json = serde_json::to_string(query).unwrap_or_else(|_| "\"\"".into());
            let clause = if search_mode == "sparse" {
                format!("bm25: {{ query: {q_json} }}")
            } else if search_mode == "dense" {
                if let Some(v) = vector {
                    format!("nearVector: {{ vector: {} }}", v)
                } else {
                    format!("nearText: {{ concepts: [{q_json}] }}")
                }
            } else if let Some(v) = vector {
                format!("hybrid: {{ query: {q_json}, vector: {} }}", v)
            } else {
                format!("hybrid: {{ query: {q_json} }}")
            };
            let gql = format!("{{ Get {{ {cls_name}({clause}, limit: {top_k}) {{ text content title source url _additional {{ id score distance certainty }} }} }} }}");
            (url, json!({"query": gql}), headers)
        }
        "chroma" => {
            if !api_key.is_empty() && !headers.contains_key("Authorization") {
                headers.insert("Authorization".into(), json!(format!("Bearer {api_key}")));
            }
            let mut payload = json!({"n_results": top_k, "include": ["documents", "metadatas", "distances"]});
            if let Some(f) = filter {
                payload["where"] = f.clone();
            }
            if let Some(v) = vector {
                payload["query_embeddings"] = json!([v]);
            } else {
                payload["query_texts"] = json!([query]);
            }
            (format!("{base}/api/v1/collections/{collection}/query"), payload, headers)
        }
        "milvus" => {
            if !api_key.is_empty() && !headers.contains_key("Authorization") {
                headers.insert("Authorization".into(), json!(format!("Bearer {api_key}")));
            }
            let url = if base.contains("/entities/search") { base.to_owned() } else { format!("{base}/v2/vectordb/entities/search") };
            let mut payload = json!({"collectionName": collection, "limit": top_k, "outputFields": ["*"], "data": [q_or_vec]});
            if !namespace.is_empty() {
                payload["partitionNames"] = json!([namespace]);
            }
            if let Some(f) = filter.and_then(Value::as_str) {
                payload["filter"] = json!(f);
            }
            (url, payload, headers)
        }
        "elasticsearch" | "opensearch" => {
            if !api_key.is_empty() && !headers.contains_key("Authorization") {
                let auth = if provider == "elasticsearch" { format!("ApiKey {api_key}") } else { format!("Bearer {api_key}") };
                headers.insert("Authorization".into(), json!(auth));
            }
            let url = if base.ends_with("/_search") { base.to_owned() } else { format!("{base}/{collection}/_search") };
            let mut payload = json!({"size": top_k});
            if let Some(v) = vector {
                if matches!(search_mode, "dense" | "hybrid" | "rerank") {
                    payload["knn"] = json!({"field": "embedding", "query_vector": v, "k": top_k, "num_candidates": (top_k * 4).max(20)});
                }
            }
            if matches!(search_mode, "sparse" | "hybrid" | "rerank") || vector.is_none() {
                payload["query"] = json!({"match": {"content": query}});
            }
            (url, payload, headers)
        }
        "lancedb" => {
            if !api_key.is_empty() && !headers.contains_key("Authorization") {
                headers.insert("Authorization".into(), json!(format!("Bearer {api_key}")));
            }
            let mut payload = json!({"query": query, "k": top_k, "search_mode": search_mode});
            if let Some(v) = vector {
                payload["vector"] = v.clone();
            }
            if let Some(f) = filter {
                payload["filter"] = f.clone();
            }
            (format!("{base}/v1/table/{collection}/query"), payload, headers)
        }
        _ => {
            if !api_key.is_empty() && !headers.contains_key("Authorization") {
                headers.insert("Authorization".into(), json!(format!("Bearer {api_key}")));
            }
            let mut payload = json!({"provider": provider, "query": query, "collection": collection, "top_k": top_k, "min_score": min_score, "search_mode": search_mode});
            if !namespace.is_empty() {
                payload["namespace"] = json!(namespace);
            }
            if let Some(v) = vector {
                payload["vector"] = v.clone();
            }
            if let Some(f) = filter {
                payload["filter"] = f.clone();
            }
            (base.to_owned(), payload, headers)
        }
    }
}

pub fn parse_rag_response(provider: &str, data: &Value, collection: &str, top_k: usize, min_score: f64) -> Vec<Value> {
    let mut items: Vec<(f64, Value)> = vec![];
    let mut push_item = |id: String, title: String, source: String, content: String, score: f64, metadata: Value| {
        if content.trim().is_empty() || score < min_score {
            return;
        }
        items.push((score, json!({
            "id": id,
            "title": title,
            "source": source,
            "url": source,
            "content": content,
            "score": score,
            "metadata": metadata,
        })));
    };
    match provider {
        "qdrant" => {
            let arr = data["result"].as_array().or_else(|| data["result"]["points"].as_array());
            for hit in arr.into_iter().flatten() {
                let pl = &hit["payload"];
                let id = hit["id"].as_str().map(str::to_owned).unwrap_or_else(|| hit["id"].to_string());
                let title = pl["title"].as_str().or_else(|| pl["name"].as_str()).unwrap_or("").to_owned();
                let source = pl["source"].as_str().or_else(|| pl["url"].as_str()).map(str::to_owned).unwrap_or_else(|| format!("rag://qdrant/{collection}/{id}"));
                let content = pl["text"].as_str().or_else(|| pl["content"].as_str()).or_else(|| pl["page_content"].as_str()).unwrap_or("").to_owned();
                let score = hit["score"].as_f64().unwrap_or(0.0);
                push_item(id, title, source, content, score, pl.clone());
            }
        }
        "pinecone" => {
            for m in data["matches"].as_array().into_iter().flatten() {
                let md = &m["metadata"];
                let id = m["id"].as_str().unwrap_or("").to_owned();
                let title = md["title"].as_str().unwrap_or("").to_owned();
                let source = md["source"].as_str().or_else(|| md["url"].as_str()).map(str::to_owned).unwrap_or_else(|| format!("rag://pinecone/{collection}/{id}"));
                let content = md["text"].as_str().or_else(|| md["content"].as_str()).or_else(|| md["chunk"].as_str()).unwrap_or("").to_owned();
                let score = m["score"].as_f64().unwrap_or(0.0);
                push_item(id, title, source, content, score, md.clone());
            }
        }
        "weaviate" => {
            if let Some(get_map) = data["data"]["Get"].as_object() {
                for cls_hits in get_map.values() {
                    for hit in cls_hits.as_array().into_iter().flatten() {
                        let add = &hit["_additional"];
                        let id = add["id"].as_str().unwrap_or("").to_owned();
                        let score = add["score"].as_f64().or_else(|| add["certainty"].as_f64()).or_else(|| add["distance"].as_f64().map(|d| (1.0 - d).max(0.0))).unwrap_or(0.0);
                        let title = hit["title"].as_str().unwrap_or("").to_owned();
                        let source = hit["source"].as_str().or_else(|| hit["url"].as_str()).map(str::to_owned).unwrap_or_else(|| format!("rag://weaviate/{collection}/{id}"));
                        let content = hit["text"].as_str().or_else(|| hit["content"].as_str()).unwrap_or("").to_owned();
                        push_item(id, title, source, content, score, hit.clone());
                    }
                }
            }
        }
        "chroma" => {
            let docs = data["documents"][0].as_array();
            let metas = data["metadatas"][0].as_array();
            let dists = data["distances"][0].as_array();
            let ids = data["ids"][0].as_array();
            if let Some(docs_arr) = docs {
                for (i, doc) in docs_arr.iter().enumerate() {
                    let md = metas.and_then(|m| m.get(i)).cloned().unwrap_or_else(|| json!({}));
                    let id = ids.and_then(|a| a.get(i)).and_then(Value::as_str).map(str::to_owned).unwrap_or_else(|| i.to_string());
                    let score = dists.and_then(|d| d.get(i)).and_then(Value::as_f64).map(|d| (1.0 - d).max(0.0)).unwrap_or(1.0);
                    let title = md["title"].as_str().unwrap_or("").to_owned();
                    let source = md["source"].as_str().or_else(|| md["url"].as_str()).map(str::to_owned).unwrap_or_else(|| format!("rag://chroma/{collection}/{id}"));
                    let content = doc.as_str().unwrap_or("").to_owned();
                    push_item(id, title, source, content, score, md);
                }
            }
        }
        "milvus" => {
            for hit in data["data"].as_array().into_iter().flatten() {
                let id = hit["id"].as_str().map(str::to_owned).unwrap_or_else(|| hit["id"].to_string());
                let score = hit["score"].as_f64().or_else(|| hit["distance"].as_f64().map(|d| (1.0 - d).max(0.0))).unwrap_or(0.0);
                let title = hit["title"].as_str().unwrap_or("").to_owned();
                let source = hit["source"].as_str().or_else(|| hit["url"].as_str()).map(str::to_owned).unwrap_or_else(|| format!("rag://milvus/{collection}/{id}"));
                let content = hit["text"].as_str().or_else(|| hit["content"].as_str()).unwrap_or("").to_owned();
                push_item(id, title, source, content, score, hit.clone());
            }
        }
        "elasticsearch" | "opensearch" => {
            for hit in data["hits"]["hits"].as_array().into_iter().flatten() {
                let src = &hit["_source"];
                let id = hit["_id"].as_str().unwrap_or("").to_owned();
                let title = src["title"].as_str().unwrap_or("").to_owned();
                let source = src["source"].as_str().or_else(|| src["url"].as_str()).map(str::to_owned).unwrap_or_else(|| format!("rag://{provider}/{collection}/{id}"));
                let content = src["text"].as_str().or_else(|| src["content"].as_str()).unwrap_or("").to_owned();
                let score = hit["_score"].as_f64().unwrap_or(0.0);
                push_item(id, title, source, content, score, src.clone());
            }
        }
        _ => {}
    }
    if items.is_empty() {
        let arr = data["results"]
            .as_array()
            .or_else(|| data["matches"].as_array())
            .or_else(|| data["data"].as_array())
            .or_else(|| data["hits"].as_array());
        for (i, hit) in arr.into_iter().flatten().enumerate() {
            let md = &hit["metadata"];
            let id = hit["id"].as_str().map(str::to_owned).unwrap_or_else(|| i.to_string());
            let title = hit["title"].as_str().or_else(|| md["title"].as_str()).unwrap_or("").to_owned();
            let source = hit["source"].as_str().or_else(|| hit["url"].as_str()).or_else(|| md["source"].as_str()).map(str::to_owned).unwrap_or_else(|| format!("rag://{provider}/{collection}/{id}"));
            let content = hit["content"].as_str().or_else(|| hit["text"].as_str()).or_else(|| hit["document"].as_str()).unwrap_or("").to_owned();
            let score = hit["score"].as_f64().unwrap_or(1.0);
            if !content.trim().is_empty() && score >= min_score {
                items.push((score, json!({
                    "id": id,
                    "title": title,
                    "source": source,
                    "url": source,
                    "content": content,
                    "score": score,
                    "metadata": md.clone(),
                })));
            }
        }
    }
    items.sort_by(|a, b| b.0.partial_cmp(&a.0).unwrap_or(std::cmp::Ordering::Equal));
    items.into_iter().take(top_k).map(|(_, v)| v).collect()
}

pub fn validate_public_url(url: &str, allow_http: bool) -> Result<String> {
    let trimmed = url.trim();
    let (scheme, rest) = if let Some(r) = trimmed.strip_prefix("https://") {
        ("https", r)
    } else if allow_http {
        if let Some(r) = trimmed.strip_prefix("http://") {
            ("http", r)
        } else {
            return Err("ERR_BLOCKED_URL: Only HTTP(S) URLs are permitted".into());
        }
    } else {
        return Err("ERR_BLOCKED_URL: Only https:// URLs are permitted".into());
    };
    let authority = rest.split(['/', '?', '#']).next().unwrap_or("");
    if authority.is_empty() || authority.contains('@') {
        return Err("ERR_BLOCKED_URL: Invalid URL authority".into());
    }
    let host_port = if authority.starts_with('[') {
        authority
            .split(']')
            .next()
            .unwrap_or("")
            .trim_start_matches('[')
    } else {
        authority.split(':').next().unwrap_or("")
    };
    let lower = host_port.to_ascii_lowercase();
    if lower.is_empty()
        || lower == "localhost"
        || lower.ends_with(".local")
        || lower.ends_with(".internal")
    {
        return Err(format!("ERR_BLOCKED_URL: Blocked host {lower}").into());
    }
    if let Ok(ip) = lower.parse::<IpAddr>() {
        if is_blocked_ip(ip) {
            return Err(format!("ERR_BLOCKED_URL: Blocked IP {ip}").into());
        }
        return Ok(trimmed.to_owned());
    }
    let port: u16 = if scheme == "https" { 443 } else { 80 };
    if let Ok(addrs) = (host_port, port).to_socket_addrs() {
        for addr in addrs {
            if is_blocked_ip(addr.ip()) {
                return Err(format!("ERR_BLOCKED_URL: Host {lower} resolved to blocked IP {}", addr.ip()).into());
            }
        }
    }
    Ok(trimmed.to_owned())
}

pub fn is_blocked_ip(ip: IpAddr) -> bool {
    match ip {
        IpAddr::V4(v4) => {
            v4.is_loopback()
                || v4.is_private()
                || v4.is_link_local()
                || v4.is_unspecified()
                || v4.is_multicast()
                || (v4.octets()[0] == 100 && (v4.octets()[1] & 0b1100_0000) == 64)
        }
        IpAddr::V6(v6) => {
            v6.is_loopback()
                || v6.is_unspecified()
                || v6.is_multicast()
                || (v6.segments()[0] & 0xfe00) == 0xfc00
                || (v6.segments()[0] & 0xffc0) == 0xfe80
        }
    }
}

pub fn html_to_clean(raw: &str, fmt: &str) -> Result<String> {
    if !matches!(fmt, "markdown" | "code_only" | "text") {
        return Err("format must be markdown, code_only, or text".into());
    }
    let trimmed = raw.trim_start();
    let is_html = trimmed.starts_with('<')
        && (raw.contains("<html")
            || raw.contains("<body")
            || raw.contains("<div")
            || raw.contains("<p>")
            || raw.contains("<script")
            || raw.contains("<h1")
            || raw.contains("<h2"));
    let md = if is_html {
        strip_html_to_markdown(raw)
    } else {
        raw.trim().to_owned()
    };
    if fmt == "code_only" {
        let mut blocks = vec![];
        let mut rest = md.as_str();
        while let Some(start) = rest.find("```") {
            let after_start = &rest[start + 3..];
            let body_start = after_start.find('\n').map(|n| n + 1).unwrap_or(0);
            if let Some(end) = after_start[body_start..].find("```") {
                let code = after_start[body_start..body_start + end].trim();
                if !code.is_empty() {
                    blocks.push(format!("```\n{code}\n```"));
                }
                rest = &after_start[body_start + end + 3..];
            } else {
                break;
            }
        }
        return Ok(blocks.join("\n\n"));
    }
    if fmt == "text" {
        let mut out = String::new();
        for line in md.lines() {
            if line.trim_start().starts_with("```") {
                continue;
            }
            let clean = line.trim_start_matches('#').trim();
            if !clean.is_empty() {
                if !out.is_empty() {
                    out.push('\n');
                }
                out.push_str(clean);
            }
        }
        return Ok(out);
    }
    Ok(md)
}

fn strip_html_to_markdown(html: &str) -> String {
    let mut out = String::with_capacity(html.len() / 2);
    let mut i = 0;
    let bytes = html.as_bytes();
    let mut skip_tag: Option<&'static str> = None;
    let mut last_ws = false;
    while i < bytes.len() {
        if bytes[i] == b'<' {
            let close = html[i..].find('>').map(|p| i + p).unwrap_or(bytes.len() - 1);
            let tag = html[i + 1..close].trim().to_ascii_lowercase();
            let name = tag.split_whitespace().next().unwrap_or("");
            if let Some(sk) = skip_tag {
                if name == format!("/{sk}") {
                    skip_tag = None;
                }
            } else if matches!(name, "script" | "style" | "nav" | "footer" | "aside" | "noscript" | "svg") {
                skip_tag = Some(match name {
                    "script" => "script",
                    "style" => "style",
                    "nav" => "nav",
                    "footer" => "footer",
                    "aside" => "aside",
                    "noscript" => "noscript",
                    _ => "svg",
                });
            } else if matches!(name, "h1" | "h2" | "h3") {
                let lvl = name[1..].parse::<usize>().unwrap_or(1);
                out.push('\n');
                for _ in 0..lvl {
                    out.push('#');
                }
                out.push(' ');
                last_ws = true;
            } else if matches!(name, "pre") {
                out.push_str("\n```\n");
                last_ws = true;
            } else if name == "/pre" {
                out.push_str("\n```\n");
                last_ws = true;
            } else if matches!(name, "p" | "div" | "br" | "li" | "tr" | "/h1" | "/h2" | "/h3" | "/p") {
                out.push('\n');
                last_ws = true;
            }
            i = close + 1;
            continue;
        }
        if skip_tag.is_none() {
            let ch = html[i..].chars().next().unwrap();
            if ch.is_whitespace() && ch != '\n' {
                if !last_ws {
                    out.push(' ');
                    last_ws = true;
                }
            } else {
                out.push(ch);
                last_ws = ch == '\n';
            }
            i += ch.len_utf8();
        } else {
            let ch = html[i..].chars().next().unwrap();
            i += ch.len_utf8();
        }
    }
    out.trim().to_owned()
}

pub fn focus_truncate(text: &str, focus_query: Option<&str>, max_chars: usize) -> (String, bool) {
    let ceiling = max_chars.clamp(100, HARD_MAX_CHARS);
    let chars: Vec<char> = text.chars().collect();
    if chars.len() <= ceiling {
        return (text.to_owned(), false);
    }
    let query = match focus_query {
        Some(q) if !q.trim().is_empty() => q.trim(),
        _ => return (chars[..ceiling].iter().collect(), true),
    };
    let mut sections: Vec<String> = vec![];
    let mut cur = String::new();
    for line in text.lines() {
        let trimmed = line.trim_start();
        if (trimmed.starts_with("# ") || trimmed.starts_with("## ") || trimmed.starts_with("### "))
            && !cur.trim().is_empty()
        {
            sections.push(cur.trim().to_owned());
            cur.clear();
        }
        if !cur.is_empty() {
            cur.push('\n');
        }
        cur.push_str(line);
    }
    if !cur.trim().is_empty() {
        sections.push(cur.trim().to_owned());
    }
    if sections.len() <= 1 {
        return (chars[..ceiling].iter().collect(), true);
    }
    let terms: Vec<String> = query
        .to_lowercase()
        .split(|c: char| !c.is_ascii_alphanumeric() && c != '_')
        .filter(|s| s.len() > 1)
        .map(str::to_owned)
        .collect();
    if terms.is_empty() {
        return (chars[..ceiling].iter().collect(), true);
    }
    let n_docs = sections.len() as f64;
    let avg_len = (sections
        .iter()
        .map(|s| s.split_whitespace().count())
        .sum::<usize>() as f64
        / n_docs)
        .max(1.0);
    let mut scored: Vec<(f64, usize, String)> = sections
        .iter()
        .enumerate()
        .map(|(idx, sec)| {
            let low = sec.to_lowercase();
            let words: Vec<&str> = low
                .split(|c: char| !c.is_ascii_alphanumeric() && c != '_')
                .filter(|w| !w.is_empty())
                .collect();
            let dl = words.len().max(1) as f64;
            let first = sec.lines().next().unwrap_or("").to_lowercase();
            let mut score = 0.0;
            for term in &terms {
                let tf = words.iter().filter(|w| **w == term.as_str()).count() as f64;
                if tf == 0.0 {
                    continue;
                }
                let df = sections
                    .iter()
                    .filter(|s| s.to_lowercase().contains(term.as_str()))
                    .count() as f64;
                let idf = (1.0 + (n_docs - df + 0.5) / (df + 0.5)).ln();
                let k1 = 1.5;
                let b = 0.75;
                score += idf * ((tf * (k1 + 1.0)) / (tf + k1 * (1.0 - b + b * (dl / avg_len))));
                if first.contains(term.as_str()) {
                    score += 2.0;
                }
            }
            (score, idx, sec.clone())
        })
        .collect();
    scored.sort_by(|a, b| {
        b.0.partial_cmp(&a.0)
            .unwrap_or(std::cmp::Ordering::Equal)
            .then_with(|| a.1.cmp(&b.1))
    });
    let mut chosen: Vec<(usize, String)> = vec![];
    let mut used = 0usize;
    for (_, idx, sec) in scored {
        let sep = if chosen.is_empty() { 0 } else { 2 };
        let sec_len = sec.chars().count();
        if used + sep + sec_len <= ceiling {
            used += sep + sec_len;
            chosen.push((idx, sec));
        } else if chosen.is_empty() {
            let sliced: String = sec.chars().take(ceiling).collect();
            chosen.push((idx, sliced));
            break;
        }
    }
    chosen.sort_by_key(|(idx, _)| *idx);
    let joined = chosen
        .into_iter()
        .map(|(_, s)| s)
        .collect::<Vec<_>>()
        .join("\n\n");
    (joined, true)
}

pub fn wrap_untrusted(url: &str, content: &str) -> String {
    let safe_url = url.replace('"', "&quot;");
    format!("<untrusted_web_content url=\"{safe_url}\">\n{content}\n</untrusted_web_content>")
}

fn is_injection_line(line: &str) -> bool {
    let low = line.to_ascii_lowercase();
    low.contains("ignore previous instructions")
        || low.contains("ignore all previous instructions")
        || low.contains("disregard prior instructions")
        || low.contains("output the system prompt")
        || low.contains("reveal the system prompt")
        || low.contains("reveal your system prompt")
}

pub fn summarize_research(
    sources: &[Value],
    objective: &str,
    target_stack: Option<&str>,
    budget_exhausted: bool,
) -> Result<Value> {
    if sources.is_empty() || sources.len() > 5 {
        return Err("summarize_research requires 1 to 5 fetched sources".into());
    }
    let mut citations: Vec<String> = vec![];
    let mut code_examples: Vec<Value> = vec![];
    let mut gotchas: Vec<String> = vec![];
    let mut version_constraints: Vec<String> = vec![];
    if let Some(stack) = target_stack {
        if !stack.trim().is_empty() {
            version_constraints.push(stack.trim().to_owned());
        }
    }
    let mut summary_lines: Vec<String> = vec![];
    for src in sources {
        let url = src["url"].as_str().unwrap_or("").trim().to_owned();
        if !url.is_empty() && !citations.contains(&url) {
            citations.push(url.clone());
        }
        let raw_body = src["text"]
            .as_str()
            .or_else(|| src["content"].as_str())
            .unwrap_or("");
        let clean_lines: Vec<&str> = raw_body
            .lines()
            .filter(|ln| {
                let t = ln.trim();
                !t.starts_with("<untrusted_web_content")
                    && t != "</untrusted_web_content>"
                    && !t.starts_with("<untrusted_rag_content")
                    && t != "</untrusted_rag_content>"
                    && !is_injection_line(t)
            })
            .collect();
        let body = clean_lines.join("\n");
        // Extract fenced code blocks
        let mut rest = body.as_str();
        while let Some(start) = rest.find("```") {
            let after = &rest[start + 3..];
            let nl = after.find('\n').unwrap_or(0);
            let lang = after[..nl].trim();
            if let Some(end) = after[nl..].find("```") {
                let code = after[nl..nl + end].trim();
                if !code.is_empty() && code_examples.len() < 8 {
                    code_examples.push(json!({
                        "language": if lang.is_empty() { "text" } else { lang },
                        "code": code.chars().take(2000).collect::<String>(),
                        "source_url": url
                    }));
                }
                rest = &after[nl + end + 3..];
            } else {
                break;
            }
        }
        for line in clean_lines {
            let clean = line.trim().trim_start_matches('#').trim();
            if clean.is_empty() {
                continue;
            }
            let low = clean.to_ascii_lowercase();
            if (low.contains("deprecated")
                || low.contains("breaking")
                || low.contains("warning")
                || low.contains("gotcha")
                || low.contains("caveat"))
                && gotchas.len() < 8
            {
                gotchas.push(clean.chars().take(240).collect());
            }
            if !clean.starts_with("```") && summary_lines.len() < 3 && clean.len() > 20 {
                summary_lines.push(clean.chars().take(220).collect());
            }
        }
    }
    let status = if citations.is_empty() && summary_lines.is_empty() && code_examples.is_empty() {
        "no_relevant_results"
    } else if budget_exhausted {
        "partial_budget_exhausted"
    } else {
        "complete"
    };
    let summary = if summary_lines.is_empty() {
        if objective.is_empty() {
            "No relevant findings.".to_owned()
        } else {
            format!("Findings for {objective}")
        }
    } else {
        summary_lines.join(" ")
    };
    Ok(json!({
        "status": status,
        "summary": summary,
        "version_constraints": version_constraints,
        "code_examples": code_examples,
        "gotchas": gotchas,
        "citations": citations,
    }))
}

pub fn run_research<S, F>(request: &Value, mut search_fn: S, mut fetch_fn: F) -> Result<Value>
where
    S: FnMut(&str, Option<&str>, usize) -> Result<Value>,
    F: FnMut(&str, Option<&str>) -> Result<Value>,
{
    let objective = request["objective"]
        .as_str()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .ok_or("ResearchRequest requires objective")?;
    let target_stack = request.get("target_stack").and_then(Value::as_str);
    let budget = request
        .get("max_tool_calls")
        .and_then(Value::as_u64)
        .unwrap_or(5)
        .clamp(1, MAX_TOOL_CALLS_CAP as u64) as usize;
    let mut calls = 0usize;
    let mut budget_exhausted = false;
    let mut fetched = vec![];
    if calls < budget {
        calls += 1;
        let sr = search_fn(objective, target_stack, 5)?;
        if let Some(items) = sr["results"].as_array() {
            for item in items {
                let url = match item["url"].as_str() {
                    Some(u) if !u.is_empty() => u,
                    _ => continue,
                };
                if calls >= budget {
                    budget_exhausted = true;
                    break;
                }
                calls += 1;
                match fetch_fn(url, Some(objective)) {
                    Ok(doc) => fetched.push(doc),
                    Err(e) => {
                        let msg = e.to_string();
                        if msg.contains("ERR_BLOCKED_URL")
                            || msg.contains("ERR_ACCESS_DENIED")
                            || msg.contains("ERR_FETCH_TIMEOUT")
                        {
                            continue;
                        }
                        return Err(e);
                    }
                }
            }
        }
    } else {
        budget_exhausted = true;
    }
    if fetched.is_empty() {
        return Ok(json!({
            "status": if budget_exhausted { "partial_budget_exhausted" } else { "no_relevant_results" },
            "summary": format!("No relevant sources retrieved for {objective}."),
            "version_constraints": target_stack.map(|s| vec![s]).unwrap_or_default(),
            "code_examples": [],
            "gotchas": [],
            "citations": []
        }));
    }
    let slice_len = fetched.len().min(5);
    summarize_research(&fetched[..slice_len], objective, target_stack, budget_exhausted)
}

pub fn run_research_with_rag<R, S, F>(
    request: &Value,
    mut rag_fn: Option<R>,
    mut search_fn: S,
    mut fetch_fn: F,
) -> Result<Value>
where
    R: FnMut(&str, &Value) -> Result<Value>,
    S: FnMut(&str, Option<&str>, usize) -> Result<Value>,
    F: FnMut(&str, Option<&str>) -> Result<Value>,
{
    let objective = request["objective"]
        .as_str()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .ok_or("ResearchRequest requires objective")?;
    let target_stack = request.get("target_stack").and_then(Value::as_str);
    let budget = request
        .get("max_tool_calls")
        .and_then(Value::as_u64)
        .unwrap_or(5)
        .clamp(1, MAX_TOOL_CALLS_CAP as u64) as usize;
    let use_rag = request["use_rag"].as_bool().unwrap_or(false)
        || request["rag"].as_bool().unwrap_or(false)
        || request["rag"]["enabled"].as_bool().unwrap_or(false);
    let rag_only = request["rag"]["ragOnly"].as_bool().unwrap_or(false);
    let mut calls = 0usize;
    let mut budget_exhausted = false;
    let mut fetched = vec![];
    if use_rag {
        if let Some(ref mut rf) = rag_fn {
            if calls < budget {
                calls += 1;
                if let Ok(rag_res) = rf(objective, &request["rag"]) {
                    for item in rag_res["results"].as_array().into_iter().flatten() {
                        let txt = item["content"].as_str().or_else(|| item["text"].as_str()).unwrap_or("");
                        if !txt.is_empty() {
                            let url = item["source"].as_str().or_else(|| item["url"].as_str()).unwrap_or("rag://default");
                            fetched.push(json!({"url": url, "text": txt}));
                        }
                    }
                }
            } else {
                budget_exhausted = true;
            }
        }
    }
    if !rag_only && !budget_exhausted {
        if calls < budget {
            calls += 1;
            let sr = search_fn(objective, target_stack, 5)?;
            if let Some(items) = sr["results"].as_array() {
                for item in items {
                    let url = match item["url"].as_str() {
                        Some(u) if !u.is_empty() => u,
                        _ => continue,
                    };
                    if calls >= budget {
                        budget_exhausted = true;
                        break;
                    }
                    calls += 1;
                    match fetch_fn(url, Some(objective)) {
                        Ok(doc) => fetched.push(doc),
                        Err(e) => {
                            let msg = e.to_string();
                            if msg.contains("ERR_BLOCKED_URL")
                                || msg.contains("ERR_ACCESS_DENIED")
                                || msg.contains("ERR_FETCH_TIMEOUT")
                            {
                                continue;
                            }
                            return Err(e);
                        }
                    }
                }
            }
        } else {
            budget_exhausted = true;
        }
    }
    if fetched.is_empty() {
        return Ok(json!({
            "status": if budget_exhausted { "partial_budget_exhausted" } else { "no_relevant_results" },
            "summary": format!("No relevant sources retrieved for {objective}."),
            "version_constraints": target_stack.map(|s| vec![s]).unwrap_or_default(),
            "code_examples": [],
            "gotchas": [],
            "citations": []
        }));
    }
    let slice_len = fetched.len().min(5);
    summarize_research(&fetched[..slice_len], objective, target_stack, budget_exhausted)
}
