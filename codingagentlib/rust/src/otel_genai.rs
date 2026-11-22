//! OpenTelemetry GenAI Semantic Conventions tracer and OTLP JSON exporter.

use serde_json::{json, Value};
use std::collections::BTreeMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};

static SPAN_SEQ: AtomicU64 = AtomicU64::new(1);

fn now_ns() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0)
}

fn gen_hex(len: usize) -> String {
    let seq = SPAN_SEQ.fetch_add(1, Ordering::Relaxed);
    let nanos = now_ns() as u64;
    let raw = format!("{nanos:016x}{seq:016x}");
    raw.chars().cycle().take(len).collect()
}

fn otlp_attr(key: &str, value: &Value) -> Value {
    match value {
        Value::Bool(b) => json!({ "key": key, "value": { "boolValue": b } }),
        Value::Number(n) => {
            if let Some(i) = n.as_i64() {
                json!({ "key": key, "value": { "intValue": i.to_string() } })
            } else {
                json!({ "key": key, "value": { "doubleValue": n.as_f64().unwrap_or(0.0) } })
            }
        }
        Value::Array(arr) => {
            let vals: Vec<Value> = arr
                .iter()
                .map(|v| json!({ "stringValue": v.as_str().map(ToString::to_string).unwrap_or_else(|| v.to_string()) }))
                .collect();
            json!({ "key": key, "value": { "arrayValue": { "values": vals } } })
        }
        Value::String(s) => json!({ "key": key, "value": { "stringValue": s } }),
        other => json!({ "key": key, "value": { "stringValue": other.to_string() } }),
    }
}

#[derive(Debug, Clone)]
pub struct TraceContext {
    pub trace_id: String,
    pub span_id: String,
    pub flags: String,
}

impl TraceContext {
    pub fn new() -> Self {
        Self {
            trace_id: gen_hex(32),
            span_id: gen_hex(16),
            flags: "01".to_string(),
        }
    }

    pub fn traceparent(&self) -> String {
        format!("00-{}-{}-{}", self.trace_id, self.span_id, self.flags)
    }

    pub fn parse(header: &str) -> Result<Self, String> {
        let parts: Vec<&str> = header.trim().split('-').collect();
        if parts.len() != 4 || parts[1].len() != 32 || parts[2].len() != 16 {
            return Err("Invalid W3C traceparent header".into());
        }
        Ok(Self {
            trace_id: parts[1].to_string(),
            span_id: parts[2].to_string(),
            flags: parts[3].to_string(),
        })
    }
}

impl Default for TraceContext {
    fn default() -> Self {
        Self::new()
    }
}

#[derive(Debug, Clone)]
pub struct GenAISpan {
    pub name: String,
    pub trace_id: String,
    pub span_id: String,
    pub parent_span_id: Option<String>,
    pub kind: u8,
    pub attributes: BTreeMap<String, Value>,
    pub start_time_ns: u128,
    pub end_time_ns: Option<u128>,
    pub error_message: Option<String>,
}

impl GenAISpan {
    pub fn set_attribute(&mut self, key: impl Into<String>, value: Value) {
        self.attributes.insert(key.into(), value);
    }

    pub fn set_error(&mut self, message: impl Into<String>, error_type: &str) {
        self.error_message = Some(message.into());
        self.attributes
            .insert("error.type".into(), Value::String(error_type.to_string()));
    }

    pub fn end(&mut self) {
        if self.end_time_ns.is_none() {
            self.end_time_ns = Some(now_ns());
        }
    }

    pub fn to_otlp(&self) -> Value {
        let end_ns = self.end_time_ns.unwrap_or_else(now_ns);
        let attrs: Vec<Value> = self
            .attributes
            .iter()
            .map(|(k, v)| otlp_attr(k, v))
            .collect();
        let status = match &self.error_message {
            Some(msg) => json!({ "code": 2, "message": msg }),
            None => json!({ "code": 1 }),
        };
        let mut payload = json!({
            "traceId": self.trace_id,
            "spanId": self.span_id,
            "name": self.name,
            "kind": self.kind,
            "startTimeUnixNano": self.start_time_ns.to_string(),
            "endTimeUnixNano": end_ns.to_string(),
            "attributes": attrs,
            "status": status
        });
        if let Some(pid) = &self.parent_span_id {
            payload["parentSpanId"] = Value::String(pid.clone());
        }
        payload
    }
}

pub struct GenAITracer {
    pub service_name: String,
    pub service_version: String,
    pub context: TraceContext,
    pub spans: Vec<GenAISpan>,
}

impl GenAITracer {
    pub fn new(service_name: &str, service_version: &str, context: Option<TraceContext>) -> Self {
        Self {
            service_name: service_name.to_string(),
            service_version: service_version.to_string(),
            context: context.unwrap_or_default(),
            spans: Vec::new(),
        }
    }

    pub fn start_span(
        &mut self,
        name: impl Into<String>,
        parent_span_id: Option<String>,
        kind: u8,
        attributes: BTreeMap<String, Value>,
    ) -> usize {
        let span = GenAISpan {
            name: name.into(),
            trace_id: self.context.trace_id.clone(),
            span_id: gen_hex(16),
            parent_span_id,
            kind,
            attributes,
            start_time_ns: now_ns(),
            end_time_ns: None,
            error_message: None,
        };
        self.spans.push(span);
        self.spans.len() - 1
    }

    pub fn start_agent_span(&mut self, agent_name: &str, conversation_id: Option<&str>) -> usize {
        let mut attrs = BTreeMap::new();
        attrs.insert("gen_ai.operation.name".into(), json!("invoke_agent"));
        attrs.insert("gen_ai.agent.name".into(), json!(agent_name));
        if let Some(cid) = conversation_id {
            attrs.insert("gen_ai.conversation.id".into(), json!(cid));
        }
        self.start_span(format!("invoke_agent {agent_name}"), None, 1, attrs)
    }

    pub fn start_chat_span(&mut self, system: &str, model: &str, parent_idx: Option<usize>) -> usize {
        let mut attrs = BTreeMap::new();
        attrs.insert("gen_ai.operation.name".into(), json!("chat"));
        attrs.insert("gen_ai.system".into(), json!(system));
        attrs.insert("gen_ai.request.model".into(), json!(model));
        let pid = parent_idx.and_then(|i| self.spans.get(i)).map(|s| s.span_id.clone());
        self.start_span(format!("chat {model}"), pid, 3, attrs)
    }

    pub fn start_tool_span(&mut self, tool_name: &str, call_id: Option<&str>, parent_idx: Option<usize>) -> usize {
        let mut attrs = BTreeMap::new();
        attrs.insert("gen_ai.operation.name".into(), json!("execute_tool"));
        attrs.insert("gen_ai.tool.name".into(), json!(tool_name));
        if let Some(cid) = call_id {
            attrs.insert("gen_ai.tool.call.id".into(), json!(cid));
        }
        let pid = parent_idx.and_then(|i| self.spans.get(i)).map(|s| s.span_id.clone());
        self.start_span(format!("execute_tool {tool_name}"), pid, 1, attrs)
    }

    pub fn export_otlp_json(&self) -> Value {
        let spans: Vec<Value> = self.spans.iter().map(GenAISpan::to_otlp).collect();
        json!({
            "resourceSpans": [{
                "resource": {
                    "attributes": [
                        otlp_attr("service.name", &json!(self.service_name)),
                        otlp_attr("service.version", &json!(self.service_version))
                    ]
                },
                "scopeSpans": [{
                    "scope": { "name": "codingagentlib.otel_genai", "version": "1.0.0" },
                    "spans": spans
                }]
            }]
        })
    }
}
