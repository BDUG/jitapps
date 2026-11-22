//! Optional host-owned LLM provider adapters, JSON-Schema tool-use adapters,
//! response normalization, and bounded retry helpers. No HTTP client is bundled;
//! callers inject their own transport callback.

use serde_json::{json, Map, Value};
use std::fmt;
use std::thread;
use std::time::Duration;

pub const SYSTEM_PROMPT: &str = "Return exactly one ModelResponse JSON object matching responseSchema. Tool side effects occur only in the host runtime.";
pub const DEFAULT_ANTHROPIC_ENDPOINT: &str = "https://api.anthropic.com/v1/messages";
pub const DEFAULT_ANTHROPIC_VERSION: &str = "2023-06-01";
pub const DEFAULT_OLLAMA_ENDPOINT: &str = "http://127.0.0.1:11434/api/chat";

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ProviderError {
    pub retryable: bool,
    pub message: String,
}

impl ProviderError {
    pub fn transient(message: impl Into<String>) -> Self {
        Self {
            retryable: true,
            message: message.into(),
        }
    }

    pub fn permanent(message: impl Into<String>) -> Self {
        Self {
            retryable: false,
            message: message.into(),
        }
    }
}

impl fmt::Display for ProviderError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.message)
    }
}

impl std::error::Error for ProviderError {}

impl From<String> for ProviderError {
    fn from(message: String) -> Self {
        Self::permanent(message)
    }
}

impl From<&str> for ProviderError {
    fn from(message: &str) -> Self {
        Self::permanent(message)
    }
}

/// Validate provider endpoint (HTTPS or loopback HTTP, no userinfo or fragment)
/// and non-empty model ID.
pub fn validate_config(endpoint: &str, model_id: &str) -> Result<(), ProviderError> {
    if model_id.trim().is_empty() {
        return Err(ProviderError::permanent("Invalid provider configuration: empty model_id"));
    }
    if endpoint.contains('#') {
        return Err(ProviderError::permanent("Invalid provider configuration: fragment not allowed"));
    }
    let (scheme, rest) = endpoint
        .split_once("://")
        .ok_or_else(|| ProviderError::permanent("Invalid provider endpoint"))?;
    let authority = rest.split(['/', '?']).next().unwrap_or("");
    if authority.is_empty() || authority.contains('@') {
        return Err(ProviderError::permanent("Invalid provider configuration"));
    }
    let host = if authority.starts_with('[') {
        authority
            .split(']')
            .next()
            .map(|h| h.trim_start_matches('['))
            .unwrap_or("")
    } else {
        authority.split(':').next().unwrap_or("")
    };
    if host.is_empty() {
        return Err(ProviderError::permanent("Invalid provider endpoint"));
    }
    let is_local = scheme == "http" && matches!(host, "localhost" | "127.0.0.1" | "::1");
    if scheme != "https" && !is_local {
        return Err(ProviderError::permanent("Invalid provider configuration: HTTPS or loopback required"));
    }
    Ok(())
}

fn schema_from_arguments(arguments: Option<&Value>) -> Value {
    let Some(map) = arguments.and_then(|v| v.as_object()) else {
        return json!({ "type": "object", "properties": {} });
    };
    let mut props = Map::new();
    for (key, desc) in map {
        if let Some(obj) = desc.as_object() {
            if obj.contains_key("type") {
                props.insert(key.clone(), desc.clone());
                continue;
            }
        }
        let text = desc.as_str().unwrap_or("");
        let low = text.to_lowercase();
        let mut prop = if low.starts_with("array") || low.contains("array of") {
            json!({ "type": "array", "items": {} })
        } else if low.starts_with("boolean") || low.starts_with("optional boolean") {
            json!({ "type": "boolean" })
        } else if low.starts_with("integer")
            || low.starts_with("optional integer")
            || low.starts_with("one-based integer")
        {
            json!({ "type": "integer" })
        } else if low.starts_with("json")
            || low.starts_with("optional {")
            || low.split(',').next().unwrap_or("").contains("object")
        {
            json!({ "type": "object" })
        } else {
            json!({ "type": "string" })
        };
        if !text.is_empty() {
            prop.as_object_mut()
                .unwrap()
                .insert("description".to_string(), Value::String(text.to_string()));
        }
        props.insert(key.clone(), prop);
    }
    json!({ "type": "object", "properties": props })
}

/// Convert internal tool specs into OpenAI, Anthropic, or Gemini JSON Schema tool definitions.
pub fn tool_schemas(tools: &[Value], provider: &str) -> Result<Vec<Value>, ProviderError> {
    let mut formatted = Vec::new();
    for tool in tools {
        let name = tool
            .get("name")
            .and_then(|v| v.as_str())
            .ok_or_else(|| ProviderError::permanent("Tool definition missing name"))?;
        let desc = tool.get("description").and_then(|v| v.as_str()).unwrap_or("");
        let params = tool
            .get("parameters")
            .filter(|v| !v.is_null())
            .cloned()
            .unwrap_or_else(|| schema_from_arguments(tool.get("arguments")));
        match provider {
            "openai" => formatted.push(json!({
                "type": "function",
                "function": { "name": name, "description": desc, "parameters": params }
            })),
            "anthropic" => formatted.push(json!({
                "name": name,
                "description": desc,
                "input_schema": params
            })),
            "gemini" => formatted.push(json!({
                "name": name,
                "description": desc,
                "parameters": params
            })),
            _ => {
                return Err(ProviderError::permanent(format!(
                    "Unsupported tool schema provider: {provider}"
                )))
            }
        }
    }
    if provider == "gemini" && !formatted.is_empty() {
        return Ok(vec![json!({ "functionDeclarations": formatted })]);
    }
    Ok(formatted)
}

fn map_stop_reason(raw: Option<&str>, has_calls: bool) -> &'static str {
    match raw {
        Some("tool_calls") | Some("tool_use") => "tool_use",
        Some("stop") | Some("end_turn") | Some("STOP") => "end_turn",
        Some("length") | Some("max_tokens") | Some("MAX_TOKENS") => "max_tokens",
        Some("content_filter") | Some("SAFETY") => "content_filter",
        _ => {
            if has_calls {
                "tool_use"
            } else {
                "end_turn"
            }
        }
    }
}

/// Normalize OpenAI, Anthropic, or Gemini Tool-Use responses into
/// `{ provider, text, reasoning, tool_calls, stop_reason, raw_stop_reason, usage }`.
pub fn parse_provider_response(provider: &str, result: &Value) -> Result<Value, ProviderError> {
    let mut text_parts = Vec::new();
    let mut reasoning_parts = Vec::new();
    let mut tool_calls = Vec::new();
    let mut raw_stop: Option<String>;
    let mut input_tokens: i64 = 0;
    let mut output_tokens: i64 = 0;

    match provider {
        "openai" => {
            let choice = result
                .get("choices")
                .and_then(|v| v.as_array())
                .and_then(|a| a.first())
                .unwrap_or(&Value::Null);
            let msg = choice.get("message").unwrap_or(&Value::Null);
            raw_stop = choice
                .get("finish_reason")
                .and_then(|v| v.as_str())
                .map(ToString::to_string);
            if let Some(content) = msg.get("content").and_then(|v| v.as_str()) {
                if !content.is_empty() {
                    text_parts.push(content.to_string());
                }
            }
            for key in ["reasoning_content", "reasoning"] {
                if let Some(r) = msg.get(key).and_then(|v| v.as_str()) {
                    if !r.is_empty() {
                        reasoning_parts.push(r.to_string());
                    }
                }
            }
            if let Some(calls) = msg.get("tool_calls").and_then(|v| v.as_array()) {
                for tc in calls {
                    let fn_obj = tc.get("function").unwrap_or(&Value::Null);
                    let args = match fn_obj.get("arguments") {
                        Some(Value::String(s)) => {
                            serde_json::from_str::<Value>(s).unwrap_or_else(|_| json!({}))
                        }
                        Some(v) if !v.is_null() => v.clone(),
                        _ => json!({}),
                    };
                    let id = tc
                        .get("id")
                        .and_then(|v| v.as_str())
                        .filter(|s| !s.is_empty())
                        .map(ToString::to_string)
                        .unwrap_or_else(|| format!("call_{}", tool_calls.len() + 1));
                    let name = fn_obj.get("name").and_then(|v| v.as_str()).unwrap_or("");
                    tool_calls.push(json!({ "id": id, "name": name, "arguments": args }));
                }
            }
            if let Some(u) = result.get("usage") {
                input_tokens = u.get("prompt_tokens").and_then(|v| v.as_i64()).unwrap_or(0);
                output_tokens = u.get("completion_tokens").and_then(|v| v.as_i64()).unwrap_or(0);
            }
        }
        "anthropic" => {
            raw_stop = result
                .get("stop_reason")
                .and_then(|v| v.as_str())
                .map(ToString::to_string);
            if let Some(blocks) = result.get("content").and_then(|v| v.as_array()) {
                for block in blocks {
                    let Some(btype) = block.get("type").and_then(|v| v.as_str()) else {
                        continue;
                    };
                    match btype {
                        "text" => {
                            if let Some(t) = block.get("text").and_then(|v| v.as_str()) {
                                if !t.is_empty() {
                                    text_parts.push(t.to_string());
                                }
                            }
                        }
                        "thinking" => {
                            if let Some(t) = block.get("thinking").and_then(|v| v.as_str()) {
                                if !t.is_empty() {
                                    reasoning_parts.push(t.to_string());
                                }
                            }
                        }
                        "tool_use" => {
                            let id = block
                                .get("id")
                                .and_then(|v| v.as_str())
                                .filter(|s| !s.is_empty())
                                .map(ToString::to_string)
                                .unwrap_or_else(|| format!("toolu_{}", tool_calls.len() + 1));
                            let name = block.get("name").and_then(|v| v.as_str()).unwrap_or("");
                            let input = block.get("input").cloned().unwrap_or_else(|| json!({}));
                            tool_calls.push(json!({ "id": id, "name": name, "arguments": input }));
                        }
                        _ => {}
                    }
                }
            }
            if let Some(u) = result.get("usage") {
                input_tokens = u.get("input_tokens").and_then(|v| v.as_i64()).unwrap_or(0);
                output_tokens = u.get("output_tokens").and_then(|v| v.as_i64()).unwrap_or(0);
            }
        }
        "gemini" => {
            let cand = result
                .get("candidates")
                .and_then(|v| v.as_array())
                .and_then(|a| a.first())
                .unwrap_or(&Value::Null);
            raw_stop = cand
                .get("finishReason")
                .and_then(|v| v.as_str())
                .map(ToString::to_string);
            if let Some(parts) = cand
                .get("content")
                .and_then(|c| c.get("parts"))
                .and_then(|p| p.as_array())
            {
                for part in parts {
                    let is_thought = part.get("thought").and_then(|v| v.as_bool()).unwrap_or(false);
                    if is_thought {
                        if let Some(t) = part.get("text").and_then(|v| v.as_str()) {
                            if !t.is_empty() {
                                reasoning_parts.push(t.to_string());
                            }
                        }
                    } else if let Some(t) = part.get("text").and_then(|v| v.as_str()) {
                        if !t.is_empty() {
                            text_parts.push(t.to_string());
                        }
                    } else if let Some(fc) = part.get("functionCall") {
                        let id = fc
                            .get("id")
                            .and_then(|v| v.as_str())
                            .filter(|s| !s.is_empty())
                            .map(ToString::to_string)
                            .unwrap_or_else(|| format!("gem_{}", tool_calls.len() + 1));
                        let name = fc.get("name").and_then(|v| v.as_str()).unwrap_or("");
                        let args = fc.get("args").cloned().unwrap_or_else(|| json!({}));
                        tool_calls.push(json!({ "id": id, "name": name, "arguments": args }));
                    }
                }
            }
            if !tool_calls.is_empty() && raw_stop.as_deref() == Some("STOP") {
                raw_stop = Some("tool_use".to_string());
            }
            if let Some(u) = result.get("usageMetadata") {
                input_tokens = u.get("promptTokenCount").and_then(|v| v.as_i64()).unwrap_or(0);
                output_tokens = u
                    .get("candidatesTokenCount")
                    .and_then(|v| v.as_i64())
                    .unwrap_or(0);
            }
        }
        _ => {
            return Err(ProviderError::permanent(format!(
                "Unsupported provider: {provider}"
            )))
        }
    }

    let stop_reason = map_stop_reason(raw_stop.as_deref(), !tool_calls.is_empty());
    Ok(json!({
        "provider": provider,
        "text": text_parts.join(""),
        "reasoning": reasoning_parts.join(""),
        "tool_calls": tool_calls,
        "stop_reason": stop_reason,
        "raw_stop_reason": raw_stop,
        "usage": { "input_tokens": input_tokens, "output_tokens": output_tokens }
    }))
}

pub fn openai_model<F>(
    endpoint: impl Into<String>,
    model_id: impl Into<String>,
    api_key: impl Into<String>,
    mut request: F,
) -> Result<impl FnMut(&Value) -> Result<String, ProviderError>, ProviderError>
where
    F: FnMut(&str, &Value, &Map<String, Value>) -> Result<Value, ProviderError>,
{
    let endpoint = endpoint.into();
    let model_id = model_id.into();
    let api_key = api_key.into();
    validate_config(&endpoint, &model_id)?;
    Ok(move |payload: &Value| {
        let body = json!({
            "model": model_id,
            "messages": [
                { "role": "system", "content": SYSTEM_PROMPT },
                { "role": "user", "content": payload.to_string() }
            ],
            "response_format": { "type": "json_object" }
        });
        let mut headers = Map::new();
        headers.insert("Content-Type".into(), Value::String("application/json".into()));
        if !api_key.is_empty() {
            headers.insert("Authorization".into(), Value::String(format!("Bearer {api_key}")));
        }
        let result = request(&endpoint, &body, &headers)?;
        result
            .get("choices")
            .and_then(|v| v.as_array())
            .and_then(|a| a.first())
            .and_then(|c| c.get("message"))
            .and_then(|m| m.get("content"))
            .and_then(|v| v.as_str())
            .map(ToString::to_string)
            .ok_or_else(|| ProviderError::permanent("Provider did not return structured response text"))
    })
}

pub fn anthropic_model<F>(
    endpoint: Option<&str>,
    model_id: impl Into<String>,
    api_key: impl Into<String>,
    max_tokens: u32,
    anthropic_version: Option<&str>,
    mut request: F,
) -> Result<impl FnMut(&Value) -> Result<String, ProviderError>, ProviderError>
where
    F: FnMut(&str, &Value, &Map<String, Value>) -> Result<Value, ProviderError>,
{
    let endpoint = endpoint.unwrap_or(DEFAULT_ANTHROPIC_ENDPOINT).to_string();
    let model_id = model_id.into();
    let api_key = api_key.into();
    let version = anthropic_version.unwrap_or(DEFAULT_ANTHROPIC_VERSION).to_string();
    validate_config(&endpoint, &model_id)?;
    Ok(move |payload: &Value| {
        let body = json!({
            "model": model_id,
            "max_tokens": max_tokens,
            "system": SYSTEM_PROMPT,
            "messages": [{ "role": "user", "content": payload.to_string() }]
        });
        let mut headers = Map::new();
        headers.insert("Content-Type".into(), Value::String("application/json".into()));
        headers.insert("anthropic-version".into(), Value::String(version.clone()));
        if !api_key.is_empty() {
            headers.insert("x-api-key".into(), Value::String(api_key.clone()));
        }
        let result = request(&endpoint, &body, &headers)?;
        let text: String = result
            .get("content")
            .and_then(|v| v.as_array())
            .map(|blocks| {
                blocks
                    .iter()
                    .filter(|b| b.get("type").and_then(|t| t.as_str()) == Some("text"))
                    .filter_map(|b| b.get("text").and_then(|t| t.as_str()))
                    .collect::<String>()
            })
            .unwrap_or_default();
        if text.is_empty() {
            return Err(ProviderError::permanent("Provider did not return structured response text"));
        }
        Ok(text)
    })
}

pub fn gemini_model<F>(
    endpoint: Option<&str>,
    model_id: impl Into<String>,
    api_key: impl Into<String>,
    mut request: F,
) -> Result<impl FnMut(&Value) -> Result<String, ProviderError>, ProviderError>
where
    F: FnMut(&str, &Value, &Map<String, Value>) -> Result<Value, ProviderError>,
{
    let model_id = model_id.into();
    let endpoint = endpoint
        .map(ToString::to_string)
        .unwrap_or_else(|| format!("https://generativelanguage.googleapis.com/v1beta/models/{model_id}:generateContent"));
    let api_key = api_key.into();
    validate_config(&endpoint, &model_id)?;
    Ok(move |payload: &Value| {
        let body = json!({
            "systemInstruction": { "parts": [{ "text": SYSTEM_PROMPT }] },
            "contents": [{ "role": "user", "parts": [{ "text": payload.to_string() }] }],
            "generationConfig": { "responseMimeType": "application/json" }
        });
        let mut headers = Map::new();
        headers.insert("Content-Type".into(), Value::String("application/json".into()));
        if !api_key.is_empty() {
            headers.insert("x-goog-api-key".into(), Value::String(api_key.clone()));
        }
        let result = request(&endpoint, &body, &headers)?;
        let text: String = result
            .get("candidates")
            .and_then(|v| v.as_array())
            .and_then(|a| a.first())
            .and_then(|c| c.get("content"))
            .and_then(|c| c.get("parts"))
            .and_then(|p| p.as_array())
            .map(|parts| {
                parts
                    .iter()
                    .filter_map(|p| p.get("text").and_then(|t| t.as_str()))
                    .collect::<String>()
            })
            .unwrap_or_default();
        if text.is_empty() {
            return Err(ProviderError::permanent("Provider did not return structured response text"));
        }
        Ok(text)
    })
}

pub fn ollama_model<F>(
    endpoint: Option<&str>,
    model_id: impl Into<String>,
    mut request: F,
) -> Result<impl FnMut(&Value) -> Result<String, ProviderError>, ProviderError>
where
    F: FnMut(&str, &Value, &Map<String, Value>) -> Result<Value, ProviderError>,
{
    let endpoint = endpoint.unwrap_or(DEFAULT_OLLAMA_ENDPOINT).to_string();
    let model_id = model_id.into();
    validate_config(&endpoint, &model_id)?;
    Ok(move |payload: &Value| {
        let body = json!({
            "model": model_id,
            "stream": false,
            "format": "json",
            "messages": [
                { "role": "system", "content": SYSTEM_PROMPT },
                { "role": "user", "content": payload.to_string() }
            ]
        });
        let mut headers = Map::new();
        headers.insert("Content-Type".into(), Value::String("application/json".into()));
        let result = request(&endpoint, &body, &headers)?;
        result
            .get("message")
            .and_then(|m| m.get("content"))
            .and_then(|v| v.as_str())
            .map(ToString::to_string)
            .ok_or_else(|| ProviderError::permanent("Provider did not return structured response text"))
    })
}

#[allow(clippy::type_complexity)]
pub fn openai_tool_model<F>(
    endpoint: impl Into<String>,
    model_id: impl Into<String>,
    api_key: impl Into<String>,
    tools: Vec<Value>,
    mut request: F,
) -> Result<impl FnMut(&[Value], Option<&str>, &str) -> Result<Value, ProviderError>, ProviderError>
where
    F: FnMut(&str, &Value, &Map<String, Value>) -> Result<Value, ProviderError>,
{
    let endpoint = endpoint.into();
    let model_id = model_id.into();
    let api_key = api_key.into();
    validate_config(&endpoint, &model_id)?;
    let schemas = tool_schemas(&tools, "openai")?;
    Ok(move |messages: &[Value], system: Option<&str>, tool_choice: &str| {
        let mut all_messages = Vec::new();
        let sys = system.unwrap_or(SYSTEM_PROMPT);
        if !sys.is_empty() {
            all_messages.push(json!({ "role": "system", "content": sys }));
        }
        all_messages.extend_from_slice(messages);
        let mut body = json!({ "model": model_id, "messages": all_messages });
        if !schemas.is_empty() {
            body.as_object_mut()
                .unwrap()
                .insert("tools".into(), Value::Array(schemas.clone()));
            body.as_object_mut()
                .unwrap()
                .insert("tool_choice".into(), Value::String(tool_choice.to_string()));
        }
        let mut headers = Map::new();
        headers.insert("Content-Type".into(), Value::String("application/json".into()));
        if !api_key.is_empty() {
            headers.insert("Authorization".into(), Value::String(format!("Bearer {api_key}")));
        }
        let raw = request(&endpoint, &body, &headers)?;
        parse_provider_response("openai", &raw)
    })
}

#[allow(clippy::type_complexity)]
pub fn anthropic_tool_model<F>(
    endpoint: Option<&str>,
    model_id: impl Into<String>,
    api_key: impl Into<String>,
    tools: Vec<Value>,
    max_tokens: u32,
    anthropic_version: Option<&str>,
    mut request: F,
) -> Result<impl FnMut(&[Value], Option<&str>) -> Result<Value, ProviderError>, ProviderError>
where
    F: FnMut(&str, &Value, &Map<String, Value>) -> Result<Value, ProviderError>,
{
    let endpoint = endpoint.unwrap_or(DEFAULT_ANTHROPIC_ENDPOINT).to_string();
    let model_id = model_id.into();
    let api_key = api_key.into();
    let version = anthropic_version.unwrap_or(DEFAULT_ANTHROPIC_VERSION).to_string();
    validate_config(&endpoint, &model_id)?;
    let schemas = tool_schemas(&tools, "anthropic")?;
    Ok(move |messages: &[Value], system: Option<&str>| {
        let mut body = json!({
            "model": model_id,
            "max_tokens": max_tokens,
            "system": system.unwrap_or(SYSTEM_PROMPT),
            "messages": messages
        });
        if !schemas.is_empty() {
            body.as_object_mut()
                .unwrap()
                .insert("tools".into(), Value::Array(schemas.clone()));
        }
        let mut headers = Map::new();
        headers.insert("Content-Type".into(), Value::String("application/json".into()));
        headers.insert("anthropic-version".into(), Value::String(version.clone()));
        if !api_key.is_empty() {
            headers.insert("x-api-key".into(), Value::String(api_key.clone()));
        }
        let raw = request(&endpoint, &body, &headers)?;
        parse_provider_response("anthropic", &raw)
    })
}

#[allow(clippy::type_complexity)]
pub fn gemini_tool_model<F>(
    endpoint: Option<&str>,
    model_id: impl Into<String>,
    api_key: impl Into<String>,
    tools: Vec<Value>,
    mut request: F,
) -> Result<impl FnMut(&[Value], Option<&str>) -> Result<Value, ProviderError>, ProviderError>
where
    F: FnMut(&str, &Value, &Map<String, Value>) -> Result<Value, ProviderError>,
{
    let model_id = model_id.into();
    let endpoint = endpoint
        .map(ToString::to_string)
        .unwrap_or_else(|| format!("https://generativelanguage.googleapis.com/v1beta/models/{model_id}:generateContent"));
    let api_key = api_key.into();
    validate_config(&endpoint, &model_id)?;
    let schemas = tool_schemas(&tools, "gemini")?;
    Ok(move |contents: &[Value], system: Option<&str>| {
        let mut body = json!({
            "systemInstruction": { "parts": [{ "text": system.unwrap_or(SYSTEM_PROMPT) }] },
            "contents": contents
        });
        if !schemas.is_empty() {
            body.as_object_mut()
                .unwrap()
                .insert("tools".into(), Value::Array(schemas.clone()));
        }
        let mut headers = Map::new();
        headers.insert("Content-Type".into(), Value::String("application/json".into()));
        if !api_key.is_empty() {
            headers.insert("x-goog-api-key".into(), Value::String(api_key.clone()));
        }
        let raw = request(&endpoint, &body, &headers)?;
        parse_provider_response("gemini", &raw)
    })
}

/// Bridge a native tool-use provider adapter into the `ModelResponse` JSON contract.
pub fn tool_use_to_react_model<F>(
    mut tool_model: F,
) -> impl FnMut(&Value) -> Result<String, ProviderError>
where
    F: FnMut(&[Value]) -> Result<Value, ProviderError>,
{
    move |payload: &Value| {
        let turn = tool_model(&[json!({ "role": "user", "content": payload.to_string() })])?;
        let sid = payload.get("sessionId").cloned().unwrap_or(Value::Null);
        let step = payload.get("step").cloned().unwrap_or(Value::Null);
        let plan_raw = turn
            .get("reasoning")
            .and_then(|v| v.as_str())
            .filter(|s| !s.is_empty())
            .or_else(|| turn.get("text").and_then(|v| v.as_str()).filter(|s| !s.is_empty()))
            .unwrap_or("Execute next tool step");
        let plan: String = plan_raw.chars().take(500).collect();
        let calls = turn
            .get("tool_calls")
            .and_then(|v| v.as_array())
            .cloned()
            .unwrap_or_default();
        if let Some(first) = calls.first() {
            let name = first.get("name").cloned().unwrap_or_else(|| json!(""));
            let args = first.get("arguments").cloned().unwrap_or_else(|| json!({}));
            return Ok(json!({
                "sessionId": sid,
                "step": step,
                "status": "act",
                "plan": plan,
                "action": { "tool": name, "args": args },
                "toolCalls": calls,
                "stopReason": turn.get("stop_reason").cloned().unwrap_or(Value::Null),
                "usage": turn.get("usage").cloned().unwrap_or(Value::Null)
            })
            .to_string());
        }
        let summary = turn
            .get("text")
            .and_then(|v| v.as_str())
            .filter(|s| !s.is_empty())
            .unwrap_or("Completed");
        Ok(json!({
            "sessionId": sid,
            "step": step,
            "status": "done",
            "plan": plan,
            "action": null,
            "summary": summary,
            "outcome": "complete",
            "stopReason": turn.get("stop_reason").cloned().unwrap_or(Value::Null),
            "usage": turn.get("usage").cloned().unwrap_or(Value::Null)
        })
        .to_string())
    }
}

/// Wrap a model callback with bounded exponential backoff on transient errors.
pub fn with_retry<T, F, S>(
    mut model: F,
    max_attempts: usize,
    base_delay_ms: u64,
    mut sleep_fn: S,
) -> Result<impl FnMut(&Value) -> Result<T, ProviderError>, ProviderError>
where
    F: FnMut(&Value) -> Result<T, ProviderError>,
    S: FnMut(Duration),
{
    if !(1..=10).contains(&max_attempts) {
        return Err(ProviderError::permanent("Invalid retry configuration"));
    }
    Ok(move |payload: &Value| {
        let mut last_error: Option<ProviderError> = None;
        for attempt in 0..max_attempts {
            match model(payload) {
                Ok(val) => return Ok(val),
                Err(err) => {
                    if !err.retryable || attempt + 1 >= max_attempts {
                        return Err(err);
                    }
                    last_error = Some(err);
                    let factor = 1u64 << attempt.min(10);
                    sleep_fn(Duration::from_millis(base_delay_ms.saturating_mul(factor)));
                }
            }
        }
        Err(last_error.unwrap_or_else(|| ProviderError::transient("Retry exhausted")))
    })
}

pub fn default_sleep(duration: Duration) {
    thread::sleep(duration);
}
