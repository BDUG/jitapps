//! A2A (Agent2Agent) protocol server, client, and AgentCard builder.

use serde_json::{json, Value};
use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};

static SEQ: AtomicU64 = AtomicU64::new(1);

fn next_seq() -> u64 {
    SEQ.fetch_add(1, Ordering::Relaxed)
}

pub fn agent_card(name: &str, description: &str, url: &str, version: &str, streaming: bool) -> Value {
    json!({
        "name": name,
        "description": description,
        "url": url,
        "version": version,
        "protocolVersion": "0.3.0",
        "capabilities": {
            "streaming": streaming,
            "pushNotifications": false,
            "stateTransitionHistory": true
        },
        "defaultInputModes": ["text/plain", "application/json"],
        "defaultOutputModes": ["text/plain", "application/json"],
        "skills": [{
            "id": "coding-react",
            "name": "ReAct Coding",
            "description": "Plan, inspect, edit, and verify workspace tasks",
            "tags": ["coding", "react"]
        }]
    })
}

fn extract_text(message: &Value) -> String {
    if let Some(s) = message.as_str() {
        return s.trim().to_string();
    }
    message
        .get("parts")
        .and_then(|v| v.as_array())
        .map(|parts| {
            parts
                .iter()
                .filter(|p| {
                    p.get("kind")
                        .or_else(|| p.get("type"))
                        .and_then(|v| v.as_str())
                        .unwrap_or("text")
                        == "text"
                })
                .filter_map(|p| p.get("text").and_then(|v| v.as_str()))
                .filter(|s| !s.is_empty())
                .collect::<Vec<_>>()
                .join("\n")
                .trim()
                .to_string()
        })
        .unwrap_or_default()
}

pub type A2AHandler = Box<dyn FnMut(&str, &Value) -> Result<Value, String>>;

pub struct A2AServer {
    pub card: Value,
    pub tasks: HashMap<String, Value>,
    handler: Option<A2AHandler>,
}

impl A2AServer {
    pub fn new(card: Option<Value>, handler: Option<A2AHandler>) -> Self {
        Self {
            card: card.unwrap_or_else(|| {
                agent_card(
                    "CodingAgent",
                    "TLAL OS ReAct Coding Agent",
                    "http://127.0.0.1:8000/api/a2a",
                    "1.0.0",
                    false,
                )
            }),
            tasks: HashMap::new(),
            handler,
        }
    }

    pub fn handle(&mut self, frame: &Value) -> Value {
        if !frame.is_object()
            || frame.get("jsonrpc").and_then(|v| v.as_str()) != Some("2.0")
            || !frame.get("method").map(|v| v.is_string()).unwrap_or(false)
        {
            return json!({
                "jsonrpc": "2.0",
                "id": frame.get("id").cloned().unwrap_or(Value::Null),
                "error": { "code": -32600, "message": "Invalid A2A JSON-RPC request" }
            });
        }
        let req_id = frame.get("id").cloned().unwrap_or(Value::Null);
        let method = frame["method"].as_str().unwrap_or("");
        let params = frame.get("params").cloned().unwrap_or_else(|| json!({}));
        if !params.is_object() {
            return json!({"jsonrpc":"2.0","id":req_id,"error":{"code":-32602,"message":"A2A params must be an object"}});
        }

        match method {
            "tasks/send" | "message/send" => {
                let mut msg = params.get("message").cloned().unwrap_or_else(|| {
                    let goal = params.get("goal").and_then(|v| v.as_str()).unwrap_or("");
                    json!({ "role": "user", "parts": [{ "kind": "text", "text": goal }] })
                });
                if let Some(text) = msg.as_str() {
                    msg = json!({"role":"user","parts":[{"kind":"text","text":text}]});
                }
                if !msg.is_object() {
                    return json!({"jsonrpc":"2.0","id":req_id,"error":{"code":-32602,"message":"Invalid A2A message"}});
                }
                msg["kind"] = json!("message");
                if msg.get("messageId").is_none() {msg["messageId"] = json!(format!("message-{}", next_seq()));}
                let goal = extract_text(&msg);
                if goal.is_empty() {
                    return json!({
                        "jsonrpc": "2.0",
                        "id": req_id,
                        "error": { "code": -32602, "message": "A2A message text is required" }
                    });
                }
                let task_id = params
                    .get("id")
                    .or_else(|| msg.get("taskId"))
                    .and_then(|v| v.as_str())
                    .map(ToString::to_string)
                    .unwrap_or_else(|| format!("task-{}", next_seq()));
                let session_id = params
                    .get("sessionId")
                    .or_else(|| msg.get("contextId"))
                    .and_then(|v| v.as_str())
                    .map(ToString::to_string)
                    .unwrap_or_else(|| format!("ctx-{}", next_seq()));
                let existing = self.tasks.contains_key(&task_id);
                let mut task = self.tasks.remove(&task_id).unwrap_or_else(|| {
                    json!({
                        "id": task_id,
                        "sessionId": session_id,
                        "contextId": session_id,
                        "kind": "task",
                        "status": { "state": "submitted" },
                        "history": [msg.clone()],
                        "artifacts": []
                    })
                });
                if existing {
                    if let Some(h) = task.get_mut("history").and_then(|v| v.as_array_mut()) {
                        h.push(msg);
                    }
                }
                let updated = self.run_task(task, &goal, &params);
                self.tasks.insert(task_id, updated.clone());
                json!({ "jsonrpc": "2.0", "id": req_id, "result": updated })
            }
            "tasks/get" => {
                let id = params.get("id").and_then(|v| v.as_str()).unwrap_or("");
                match self.tasks.get(id) {
                    Some(task) => json!({ "jsonrpc": "2.0", "id": req_id, "result": task }),
                    None => json!({ "jsonrpc": "2.0", "id": req_id, "error": { "code": -32001, "message": "Task not found" } }),
                }
            }
            "tasks/cancel" => {
                let id = params.get("id").and_then(|v| v.as_str()).unwrap_or("");
                match self.tasks.get_mut(id) {
                    Some(task) => {
                        if ["completed", "failed", "rejected", "canceled"].contains(&task["status"]["state"].as_str().unwrap_or("")) {
                            return json!({"jsonrpc":"2.0","id":req_id,"error":{"code":-32002,"message":"Task is already terminal and cannot be canceled"}});
                        }
                        task["status"] = json!({ "state": "canceled" });
                        json!({ "jsonrpc": "2.0", "id": req_id, "result": task })
                    }
                    None => json!({ "jsonrpc": "2.0", "id": req_id, "error": { "code": -32001, "message": "Task not found" } }),
                }
            }
            "agent/authenticatedExtendedCard" => {
                json!({ "jsonrpc": "2.0", "id": req_id, "result": self.card })
            }
            _ => json!({
                "jsonrpc": "2.0",
                "id": req_id,
                "error": { "code": -32601, "message": format!("Unsupported A2A method: {method}") }
            }),
        }
    }

    fn run_task(&mut self, mut task: Value, goal: &str, params: &Value) -> Value {
        let Some(handler) = self.handler.as_mut() else {
            task["status"] = json!({
                "state": "failed",
                "message": { "role": "agent", "parts": [{ "kind": "text", "text": "No A2A task handler configured" }] }
            });
            return task;
        };
        match handler(goal, params) {
            Ok(res) => {
                let status = res.get("status").and_then(|v| v.as_str()).unwrap_or("complete");
                let state = match status {
                    "ask" | "waiting" | "paused" => "input-required",
                    "complete" | "done" => "completed",
                    _ => "failed",
                };
                let summary = res
                    .get("summary")
                    .or_else(|| res.get("question"))
                    .and_then(|v| v.as_str())
                    .map(ToString::to_string)
                    .unwrap_or_else(|| res.to_string());
                let agent_msg = json!({ "role": "agent", "kind":"message", "messageId":format!("message-{}",next_seq()), "parts": [{ "kind": "text", "text": summary }] });
                if let Some(h) = task.get_mut("history").and_then(|v| v.as_array_mut()) {
                    h.push(agent_msg.clone());
                }
                if let Some(a) = task.get_mut("artifacts").and_then(|v| v.as_array_mut()) {
                    a.push(json!({
                        "artifactId": format!("art-{}", next_seq()),
                        "name": "react-result",
                        "parts": [
                            { "kind": "text", "text": summary },
                            { "kind": "data", "data": res }
                        ]
                    }));
                }
                task["status"] = json!({ "state": state, "message": agent_msg });
            }
            Err(err) => {
                let err_msg = json!({ "role": "agent", "parts": [{ "kind": "text", "text": err }] });
                if let Some(h) = task.get_mut("history").and_then(|v| v.as_array_mut()) {
                    h.push(err_msg.clone());
                }
                task["status"] = json!({ "state": "failed", "message": err_msg });
            }
        }
        task
    }
}

pub struct A2AClient<F> {
    pub endpoint: String,
    request: F,
    next_id: u64,
}

impl<F> A2AClient<F>
where
    F: FnMut(&str, &Value) -> Result<Value, String>,
{
    pub fn new(endpoint: impl Into<String>, request: F) -> Result<Self, String> {
        let endpoint = endpoint.into();
        crate::providers::validate_config(&endpoint, "a2a").map_err(|e| e.message)?;
        Ok(Self {
            endpoint,
            request,
            next_id: 0,
        })
    }

    pub fn call(&mut self, method: &str, params: Value) -> Result<Value, String> {
        self.next_id += 1;
        let id = self.next_id;
        let frame = json!({ "jsonrpc": "2.0", "id": id, "method": method, "params": params });
        let reply = (self.request)(&self.endpoint, &frame)?;
        if reply.get("id").and_then(|v| v.as_u64()) != Some(id) {
            return Err("A2A response identity mismatch".into());
        }
        if let Some(err) = reply.get("error") {
            return Err(err
                .get("message")
                .and_then(|v| v.as_str())
                .unwrap_or("A2A call failed")
                .to_string());
        }
        Ok(reply.get("result").cloned().unwrap_or(Value::Null))
    }

    pub fn send_task(&mut self, goal: &str, task_id: Option<&str>, session_id: Option<&str>) -> Result<Value, String> {
        let mut params = json!({
            "message": { "role": "user", "kind":"message", "messageId":format!("message-{}",next_seq()), "parts": [{ "kind": "text", "text": goal }] }
        });
        if let Some(tid) = task_id {
            params["message"]["taskId"] = json!(tid);
        }
        if let Some(sid) = session_id {
            params["message"]["contextId"] = json!(sid);
        }
        self.call("message/send", params)
    }

    pub fn get_task(&mut self, task_id: &str) -> Result<Value, String> {
        self.call("tasks/get", json!({ "id": task_id }))
    }

    pub fn cancel_task(&mut self, task_id: &str) -> Result<Value, String> {
        self.call("tasks/cancel", json!({ "id": task_id }))
    }
}
