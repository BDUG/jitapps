//! Streaming adapters: SSE Data Streams, AG-UI events, and Zed ACP server.

use serde_json::{json, Value};
use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};

static ACP_SEQ: AtomicU64 = AtomicU64::new(1);

pub fn format_sse(event: Option<&str>, data: &Value, event_id: Option<u64>) -> String {
    let mut lines = Vec::new();
    if let Some(id) = event_id {
        lines.push(format!("id: {id}"));
    }
    if let Some(ev) = event {
        if !ev.is_empty() {
            lines.push(format!("event: {ev}"));
        }
    }
    let payload = match data {
        Value::String(s) => s.clone(),
        other => other.to_string(),
    };
    if payload.is_empty() {
        lines.push("data: ".to_string());
    } else {
        for line in payload.lines() {
            lines.push(format!("data: {line}"));
        }
    }
    format!("{}\n\n", lines.join("\n"))
}

pub fn ag_ui_events(event: &Value, run_id: &str, thread_id: &str) -> Vec<Value> {
    let kind = event
        .get("kind")
        .or_else(|| event.get("type"))
        .and_then(|v| v.as_str())
        .unwrap_or("");
    let val = event
        .get("value")
        .filter(|v| v.is_object())
        .unwrap_or(event);
    let step = event.get("step").and_then(|v| v.as_u64()).unwrap_or(0);
    let mid = format!("msg-{step}");
    let mut out = Vec::new();

    match kind {
        "start" => out.push(json!({ "type": "RUN_STARTED", "threadId": thread_id, "runId": run_id })),
        "step_start" => out.push(json!({ "type": "STEP_STARTED", "stepName": format!("step-{step}") })),
        "thought" | "plan" => {
            let text = val
                .get("plan")
                .or_else(|| val.get("text"))
                .or_else(|| val.get("thought"))
                .and_then(|v| v.as_str())
                .unwrap_or("");
            if !text.is_empty() {
                out.push(json!({ "type": "THINKING_TEXT_MESSAGE_CONTENT", "messageId": mid, "delta": text }));
            }
        }
        "action" => {
            let call_id = val
                .get("id")
                .and_then(|v| v.as_str())
                .map(ToString::to_string)
                .unwrap_or_else(|| format!("call-{}", ACP_SEQ.fetch_add(1, Ordering::Relaxed)));
            let tool = val.get("tool").and_then(|v| v.as_str()).unwrap_or("");
            let args = val.get("args").cloned().unwrap_or_else(|| json!({})).to_string();
            out.push(json!({ "type": "TOOL_CALL_START", "toolCallId": call_id, "toolCallName": tool, "parentMessageId": mid }));
            out.push(json!({ "type": "TOOL_CALL_ARGS", "toolCallId": call_id, "delta": args }));
            out.push(json!({ "type": "TOOL_CALL_END", "toolCallId": call_id }));
        }
        "observation" => {
            let call_id = val.get("id").and_then(|v| v.as_str()).unwrap_or("");
            let content = val.get("result").unwrap_or(val).to_string();
            out.push(json!({ "type": "TOOL_CALL_RESULT", "toolCallId": call_id, "content": content, "role": "tool" }));
        }
        "diff" | "state" | "tasks" => out.push(json!({ "type": "STATE_SNAPSHOT", "snapshot": val })),
        "permission_request" => out.push(json!({ "type": "CUSTOM", "name": "permission_request", "value": val })),
        "step_end" => out.push(json!({ "type": "STEP_FINISHED", "stepName": format!("step-{step}") })),
        "done" | "complete" | "assistant" => {
            let summary = val
                .get("summary")
                .or_else(|| val.get("text"))
                .and_then(|v| v.as_str())
                .unwrap_or("");
            if !summary.is_empty() {
                out.push(json!({ "type": "TEXT_MESSAGE_START", "messageId": mid, "role": "assistant" }));
                out.push(json!({ "type": "TEXT_MESSAGE_CONTENT", "messageId": mid, "delta": summary }));
                out.push(json!({ "type": "TEXT_MESSAGE_END", "messageId": mid }));
            }
            if kind != "assistant" {
                out.push(json!({ "type": "RUN_FINISHED", "threadId": thread_id, "runId": run_id, "result": val }));
            }
        }
        "error" => {
            let msg = val
                .get("error")
                .or_else(|| val.get("message"))
                .and_then(|v| v.as_str())
                .unwrap_or("Run error");
            out.push(json!({ "type": "RUN_ERROR", "message": msg }));
        }
        _ => {}
    }
    out
}

pub struct SSEStreamBridge {
    pub fmt: String,
    pub run_id: String,
    pub thread_id: String,
    pub frames: Vec<String>,
    seq: u64,
}

impl SSEStreamBridge {
    pub fn new(fmt: &str, run_id: &str, thread_id: &str) -> Result<Self, String> {
        if fmt != "ag-ui" && fmt != "sse" {
            return Err("fmt must be \"ag-ui\" or \"sse\"".into());
        }
        Ok(Self {
            fmt: fmt.to_string(),
            run_id: run_id.to_string(),
            thread_id: thread_id.to_string(),
            frames: Vec::new(),
            seq: 0,
        })
    }

    pub fn emit(&mut self, event: &Value) {
        if self.fmt == "ag-ui" {
            for item in ag_ui_events(event, &self.run_id, &self.thread_id) {
                self.seq += 1;
                let ev_type = item.get("type").and_then(|v| v.as_str());
                self.frames.push(format_sse(ev_type, &item, Some(self.seq)));
            }
        } else {
            self.seq += 1;
            let kind = event.get("kind").and_then(|v| v.as_str()).or(Some("event"));
            self.frames.push(format_sse(kind, event, Some(self.seq)));
        }
    }
}

pub struct ACPServer {
    pub agent_name: String,
    pub agent_version: String,
    pub sessions: HashMap<String, Value>,
    pub notifications: Vec<Value>,
}

impl ACPServer {
    pub const PROTOCOL_VERSION: u64 = 1;

    pub fn new(agent_name: &str, agent_version: &str) -> Self {
        Self {
            agent_name: agent_name.to_string(),
            agent_version: agent_version.to_string(),
            sessions: HashMap::new(),
            notifications: Vec::new(),
        }
    }

    pub fn emit_update(&mut self, session_id: &str, update: Value) -> Value {
        let note = json!({ "jsonrpc": "2.0", "method": "session/update", "params": { "sessionId": session_id, "update": update } });
        self.notifications.push(note.clone());
        note
    }

    pub fn handle(&mut self, frame: &Value) -> Value {
        if !frame.is_object()
            || frame.get("jsonrpc").and_then(|v| v.as_str()) != Some("2.0")
            || !frame.get("method").map(|v| v.is_string()).unwrap_or(false)
        {
            return json!({
                "jsonrpc": "2.0",
                "id": frame.get("id").cloned().unwrap_or(Value::Null),
                "error": { "code": -32600, "message": "Invalid ACP JSON-RPC request" }
            });
        }
        let req_id = frame.get("id").cloned().unwrap_or(Value::Null);
        let method = frame["method"].as_str().unwrap_or("");
        let params = frame.get("params").cloned().unwrap_or_else(|| json!({}));

        match method {
            "initialize" => json!({
                "jsonrpc": "2.0",
                "id": req_id,
                "result": {
                    "protocolVersion": Self::PROTOCOL_VERSION,
                    "agentCapabilities": { "loadSession": false, "promptCapabilities": { "image": false, "embeddedContext": true } },
                    "agentInfo": { "name": self.agent_name, "version": self.agent_version }
                }
            }),
            "session/new" => {
                let sid = params
                    .get("sessionId")
                    .and_then(|v| v.as_str())
                    .map(ToString::to_string)
                    .unwrap_or_else(|| format!("acp-{}", ACP_SEQ.fetch_add(1, Ordering::Relaxed)));
                let cwd = params.get("cwd").and_then(|v| v.as_str()).unwrap_or(".");
                self.sessions.insert(sid.clone(), json!({ "id": sid, "cwd": cwd, "cancelled": false }));
                json!({ "jsonrpc": "2.0", "id": req_id, "result": { "sessionId": sid } })
            }
            "session/cancel" => {
                let sid = params.get("sessionId").and_then(|v| v.as_str()).unwrap_or("");
                if let Some(s) = self.sessions.get_mut(sid) {
                    s["cancelled"] = json!(true);
                }
                json!({ "jsonrpc": "2.0", "id": req_id, "result": { "cancelled": true } })
            }
            "session/prompt" => {
                let sid = params.get("sessionId").and_then(|v| v.as_str()).unwrap_or("");
                if !self.sessions.contains_key(sid) {
                    return json!({ "jsonrpc": "2.0", "id": req_id, "error": { "code": -32001, "message": "Unknown ACP sessionId" } });
                }
                json!({ "jsonrpc": "2.0", "id": req_id, "result": { "stopReason": "end_turn" } })
            }
            _ => json!({
                "jsonrpc": "2.0",
                "id": req_id,
                "error": { "code": -32601, "message": format!("Unsupported ACP method: {method}") }
            }),
        }
    }
}
