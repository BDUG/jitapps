use codingagentlib::core::CoreTool;
use codingagentlib::{create_agent, CoreOptions, RunOptions};
use serde_json::{json, Value};
use std::sync::{
    atomic::{AtomicUsize, Ordering},
    Arc,
};
fn fill(v: &Value, r: &Value) -> Value {
    if v == "$session" {
        return r["sessionId"].clone();
    }
    if v == "$step" {
        return r["step"].clone();
    }
    match v {
        Value::Array(a) => json!(a.iter().map(|v| fill(v, r)).collect::<Vec<_>>()),
        Value::Object(o) => Value::Object(o.iter().map(|(k, v)| (k.clone(), fill(v, r))).collect()),
        _ => v.clone(),
    }
}
#[test]
fn shared_sdk_conformance() -> codingagentlib::Result<()> {
    let vectors: Value = serde_json::from_str(include_str!("../../conformance/core-v1.json"))?;
    for case in vectors["cases"].as_array().unwrap() {
        let replies = case["responses"].as_array().unwrap().clone();
        let mut index = 0;
        let cancel = case["cancel"] == true;
        let mut options = CoreOptions::new(move |r, signal| {
            if cancel {
                signal.cancel();
            }
            let response = fill(&replies[index], r);
            index += 1;
            Ok(response)
        });
        let count = Arc::new(AtomicUsize::new(0));
        let captured = count.clone();
        options.tools.push(CoreTool::new(json!({"name":"echo","description":"Echo","permission":case.get("permission").unwrap_or(&json!("read")),"parameters":case.get("parameters").unwrap_or(&json!({"type":"object"}))}),move|args,_,_|{captured.fetch_add(1,Ordering::SeqCst);Ok(args.clone())}));
        let denied = case["denyComplete"] == true;
        options.policy = Some(Box::new(
            move |kind, _, _| Ok(kind != "complete" || !denied),
        ));
        options.budgets = case.get("budgets").cloned().unwrap_or(json!({}));
        let mut agent = create_agent(options)?;
        let mut result = agent.run("Conformance", &RunOptions::default())?;
        if case["resume"] == true {
            let id = result["sessionId"].as_str().unwrap().to_owned();
            result = agent.resume(&id, "Continue", &RunOptions::default())?;
        }
        assert_eq!(
            result["status"], case["expected"]["status"],
            "{}",
            case["name"]
        );
        assert_eq!(
            count.load(Ordering::SeqCst) as u64,
            case["expected"]["calls"].as_u64().unwrap(),
            "{}",
            case["name"]
        );
        if let Some(reason) = case["expected"].get("reason") {
            assert_eq!(&result["reason"], reason, "{}", case["name"]);
        }
    }
    Ok(())
}

#[test]
fn replay_streams_uncertainty_and_delegation() -> codingagentlib::Result<()> {
    use codingagentlib::{
        core::{buffer_stream, MemorySessionStore, UncertainToolCall},
        extensions,
    };
    fn model(r: &Value, _: &codingagentlib::CancelHandle) -> codingagentlib::Result<Value> {
        Ok(
            json!({"sessionId":r["sessionId"],"step":r["step"],"status":if r["events"].as_array().unwrap().iter().any(|e|e["kind"]=="tool_result"){"done"}else{"act"},"plan":"Inspect evidence","action":if r["events"].as_array().unwrap().iter().any(|e|e["kind"]=="tool_result"){Value::Null}else{json!({"tool":"echo","args":{}})},"summary":"Observed"}),
        )
    }
    let calls = Arc::new(AtomicUsize::new(0));
    let observed = calls.clone();
    let mut options = CoreOptions::new(model);
    options.tools.push(CoreTool::new(json!({"name":"echo","description":"Echo","permission":"read","parameters":{"type":"object"}}),move|a,_,_|{observed.fetch_add(1,Ordering::SeqCst);Ok(a.clone())}));
    let mut agent = create_agent(options)?;
    agent.run("Record", &RunOptions::default())?;
    assert_eq!(
        extensions::replay(&agent.snapshot())?["result"]["status"],
        "complete"
    );
    assert_eq!(calls.load(Ordering::SeqCst), 1);
    let stop = agent.cancel_handle();
    let valid=json!({"sessionId":"test","step":1,"status":"done","plan":"Finish","action":null,"summary":"Observed"}).to_string();
    assert_eq!(
        buffer_stream(vec![Ok(valid.clone())], 10000, &stop)?["status"],
        "done"
    );
    assert!(buffer_stream(vec![Ok(valid), Ok("trailing".into())], 10000, &stop).is_err());
    let store = Arc::new(MemorySessionStore::default());
    let mut options = CoreOptions::new(model);
    options.session_store = store.clone();
    options.tools.push(CoreTool::new(json!({"name":"echo","description":"Uncertain","permission":"read","parameters":{"type":"object"}}),|_,_,_|Err(Box::new(UncertainToolCall("Transport interrupted".into())))));
    let mut interrupted = create_agent(options)?;
    assert!(interrupted
        .run("Uncertain", &RunOptions::default())
        .is_err());
    let saved = interrupted.snapshot();
    assert_eq!(
        interrupted.resume(saved["id"].as_str().unwrap(), "", &RunOptions::default())?["reason"],
        "uncertain_tool_call"
    );
    interrupted.resolve_pending(saved["id"].as_str().unwrap(),json!({"callId":saved["pending"]["callId"],"tool":"echo","ok":false,"error":{"code":"host_resolved","message":"Host confirmed outcome","retryable":false}}))?;
    assert_eq!(
        interrupted.resume(saved["id"].as_str().unwrap(), "", &RunOptions::default())?["status"],
        "complete"
    );
    let mut delegated = extensions::delegation_tool(
        "delegate",
        Box::new(|| {
            Ok(CoreOptions::new(|r, _| {
                Ok(
                    json!({"sessionId":r["sessionId"],"step":r["step"],"status":"done","plan":"Finish","action":null,"summary":"Child observed"}),
                )
            }))
        }),
        1,
    )?;
    let result = (delegated.execute)(
        &json!({"goal":"Bounded child"}),
        &json!({"sessionId":"parent","callId":"parent_call"}),
        &stop,
    )?;
    assert_eq!(result["result"]["status"], "complete");
    Ok(())
}

#[test]
fn mcp_requires_trust_and_command_permission() -> codingagentlib::Result<()> {
    use codingagentlib::extensions::{mcp_tools, McpServer, McpTransport, McpTrust};
    use std::sync::Mutex;
    let count = Arc::new(AtomicUsize::new(0));
    let calls = count.clone();
    let server = McpServer {
        tools: vec![CoreTool::new(
            json!({"name":"echo","description":"Echo","permission":"read","parameters":{"type":"object"}}),
            move |args, _, _| {
                calls.fetch_add(1, Ordering::SeqCst);
                Ok(args.clone())
            },
        )],
        authorize: Arc::new(Mutex::new(|_: &Value, _: &Value| Ok(true))),
    };
    let transport: Arc<Mutex<dyn McpTransport>> = Arc::new(Mutex::new(server));
    let trust: McpTrust = Arc::new(Mutex::new(|_: &Value, _: &Value| Ok(true)));
    let mut options = CoreOptions::new(|r, _| {
        Ok(
            json!({"sessionId":r["sessionId"],"step":r["step"],"status":"act","plan":"Call MCP","action":{"tool":"echo","args":{}}}),
        )
    });
    let temporary = create_agent(CoreOptions::new(|_, _| Ok(Value::Null)))?;
    options.tools = mcp_tools(transport, trust, &temporary.cancel_handle())?;
    options.budgets = json!({"modelCalls":1});
    let mut agent = create_agent(options)?;
    agent.run("Denied", &RunOptions::default())?;
    assert_eq!(count.load(Ordering::SeqCst), 0);
    agent.run(
        "Allowed",
        &RunOptions {
            allow_commands: true,
            ..Default::default()
        },
    )?;
    assert_eq!(count.load(Ordering::SeqCst), 1);
    Ok(())
}

#[test]
fn embedded_migration_preserves_host_context() -> codingagentlib::Result<()> {
    use codingagentlib::{EmbeddedAgent, ToolPermission};
    let mut embedded = EmbeddedAgent::new(json!({"project":"host"}));
    embedded.add_tool("legacy", "Host tool", ToolPermission::Read, |_, ctx| {
        assert_eq!(ctx.context["project"], "host");
        Ok(json!({"read":true}))
    })?;
    let mut agent=embedded.into_core(Box::new(|r,_|{
        let done=r["events"].as_array().unwrap().iter().any(|e|e["kind"]=="tool_result");
        Ok(json!({"sessionId":r["sessionId"],"step":r["step"],"plan":"Migrate host tools","status":if done{"done"}else{"act"},"action":if done{Value::Null}else{json!({"tool":"legacy","args":{}})},"summary":"Observed"}))
    }))?;
    assert_eq!(
        agent.run("Migrate host tools", &RunOptions::default())?["status"],
        "complete"
    );
    Ok(())
}

#[test]
fn decision_mode_assist_and_gate() -> codingagentlib::Result<()> {
    use codingagentlib::DecisionMode;
    use std::sync::{Arc, Mutex};

    let events = Arc::new(Mutex::new(Vec::<Value>::new()));
    let ev_hook = events.clone();

    let mut options = CoreOptions::new(|r, _| {
        assert!(
            r["context"].as_array().map(|a| a.iter().any(|item| item.get("decision").is_some())).unwrap_or(false),
            "expected advisory decision in request context"
        );
        let events = r["events"].as_array().unwrap();
        let rejected = events.iter().any(|e| e["kind"] == "decision_gate" && e["value"]["decision"]["approve"] == false);
        let ran = events.iter().any(|e| e["kind"] == "tool_result");
        if ran {
            Ok(json!({"sessionId":r["sessionId"],"step":r["step"],"status":"done","plan":"Complete","action":null,"summary":"Done after gate"}))
        } else if !rejected {
            Ok(json!({"sessionId":r["sessionId"],"step":r["step"],"status":"act","plan":"Try unsafe","action":{"tool":"bad_tool","args":{}}}))
        } else {
            Ok(json!({"sessionId":r["sessionId"],"step":r["step"],"status":"act","plan":"Use safe tool","action":{"tool":"safe_tool","args":{}}}))
        }
    });
    options.decision_mode = DecisionMode::Gate;
    options.decision_model = Some(Box::new(|dreq, _| {
        if dreq["phase"] == "gate" {
            let tool = dreq["candidate"]["action"]["tool"].as_str().unwrap_or("");
            if tool == "bad_tool" {
                return Ok(json!({"approve":false,"rationale":"Use safe_tool instead","strategy":"Switch to safe_tool"}));
            }
            return Ok(json!({"approve":true,"rationale":"Approved"}));
        }
        Ok(json!({"approve":true,"strategy":"Prefer safe_tool","focus":"Read safely"}))
    }));
    options.tools = vec![
        codingagentlib::core::CoreTool::new(
            json!({"name":"bad_tool","description":"Bad","permission":"read","parameters":{"type":"object"}}),
            |_, _, _| panic!("bad_tool must be blocked by decision gate"),
        ),
        codingagentlib::core::CoreTool::new(
            json!({"name":"safe_tool","description":"Safe","permission":"read","parameters":{"type":"object"}}),
            |_, _, _| Ok(json!({"safe":true})),
        ),
    ];
    options.on_event = Some(Box::new(move |ev| {
        ev_hook.lock().unwrap().push(ev.clone());
        Ok(())
    }));

    let mut agent = create_agent(options)?;
    let res = agent.run("Test decision gate", &RunOptions::default())?;
    assert_eq!(res["status"], "complete");
    let captured = events.lock().unwrap();
    assert!(captured.iter().any(|e| e["kind"] == "decision"));
    assert!(captured.iter().any(|e| e["kind"] == "decision_gate" && e["value"]["decision"]["approve"] == false));
    Ok(())
}
