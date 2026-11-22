use codingagentlib::a2a::{agent_card, A2AClient, A2AServer};
use codingagentlib::otel_genai::{GenAITracer, TraceContext};
use codingagentlib::streaming::{ag_ui_events, format_sse, ACPServer, SSEStreamBridge};
use serde_json::json;

#[test]
fn a2a_server_and_client() {
    let card = agent_card("RustAgent", "Native Rust A2A", "http://127.0.0.1:8000/api/a2a", "1.0.0", true);
    assert_eq!(card["name"], "RustAgent");
    let mut server = A2AServer::new(
        Some(card),
        Some(Box::new(|goal, _params| Ok(json!({ "status": "complete", "summary": format!("Done: {goal}") })))),
    );
    let mut client = A2AClient::new("http://127.0.0.1:8000/api/a2a", |_url, frame| {
        Ok(server.handle(frame))
    })
    .unwrap();
    let res = client.send_task("Check crate", Some("t-1"), Some("s-1")).unwrap();
    assert_eq!(res["status"]["state"], "completed");
    assert_eq!(client.get_task("t-1").unwrap()["id"], "t-1");
    assert!(client.cancel_task("t-1").unwrap_err().contains("terminal"));
    assert!(A2AClient::new("http://remote.invalid/a2a", |_, _| Ok(json!({}))).is_err());
}

#[test]
fn streaming_and_acp() {
    let mut bridge = SSEStreamBridge::new("ag-ui", "r-1", "th-1").unwrap();
    bridge.emit(&json!({ "kind": "start" }));
    bridge.emit(&json!({ "kind": "action", "value": { "id": "c1", "tool": "read_file", "args": { "path": "a.rs" } } }));
    bridge.emit(&json!({ "kind": "done", "value": { "summary": "OK" } }));
    assert!(bridge.frames.iter().any(|f| f.contains("event: RUN_STARTED")));
    assert!(bridge.frames.iter().any(|f| f.contains("event: TOOL_CALL_START")));
    assert!(bridge.frames.iter().any(|f| f.contains("event: RUN_FINISHED")));

    let evs = ag_ui_events(&json!({ "kind": "error", "error": "boom" }), "r-1", "th-1");
    assert_eq!(evs[0]["type"], "RUN_ERROR");
    let raw = format_sse(Some("ping"), &json!({ "ok": true }), Some(7));
    assert!(raw.starts_with("id: 7\nevent: ping\n"));

    let mut acp = ACPServer::new("rust-agent", "1.0.0");
    let init = acp.handle(&json!({ "jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {} }));
    assert_eq!(init["result"]["protocolVersion"], 1);
    let sess = acp.handle(&json!({ "jsonrpc": "2.0", "id": 2, "method": "session/new", "params": { "cwd": "." } }));
    let sid = sess["result"]["sessionId"].as_str().unwrap().to_string();
    let prompt = acp.handle(&json!({ "jsonrpc": "2.0", "id": 3, "method": "session/prompt", "params": { "sessionId": sid } }));
    assert_eq!(prompt["result"]["stopReason"], "end_turn");
}

#[test]
fn otel_genai_spans_and_otlp_export() {
    let ctx = TraceContext::parse("00-0123456789abcdef0123456789abcdef-0123456789abcdef-01").unwrap();
    assert_eq!(ctx.traceparent(), "00-0123456789abcdef0123456789abcdef-0123456789abcdef-01");
    let mut tracer = GenAITracer::new("codingagentlib-rust", "0.2.0", Some(ctx));
    let root = tracer.start_agent_span("rust-agent", Some("s-1"));
    let chat = tracer.start_chat_span("openai", "gpt-4o", Some(root));
    tracer.spans[chat].end();
    let tool = tracer.start_tool_span("read_file", Some("c1"), Some(root));
    tracer.spans[tool].end();
    tracer.spans[root].end();
    let otlp = tracer.export_otlp_json();
    assert_eq!(otlp["resourceSpans"][0]["scopeSpans"][0]["spans"].as_array().unwrap().len(), 3);
}
