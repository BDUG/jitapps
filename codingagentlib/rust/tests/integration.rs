use codingagentlib::{ContextRegistry, EmbeddedAgent, Result, RunOptions, ToolPermission};
use serde_json::{json, Value};
use std::sync::{
    atomic::{AtomicBool, AtomicUsize, Ordering},
    Arc,
};
fn reply(r: &Value, status: &str, extra: Value) -> Value {
    let mut v = json!({"sessionId":r["sessionId"],"step":r["step"],"status":status,"plan":"Public integration plan","action":null});
    for (k, x) in extra.as_object().unwrap() {
        v[k] = x.clone();
    }
    v
}
#[test]
fn live_context_tools_resume_and_events() -> Result<()> {
    let revision = Arc::new(AtomicUsize::new(1));
    let source = revision.clone();
    let mut registry = ContextRegistry::new(json!({"app":"custom-editor"}));
    registry.add("project","Live project",json!({"type":"object"}),move |_,_| Ok(json!({"revision":source.load(Ordering::SeqCst).to_string(),"data":{"selection":"a"}})))?;
    assert_eq!(registry.list()[0]["id"], "project");
    assert!(registry
        .add("project", "Duplicate", json!({}), |_, _| Ok(json!({})))
        .is_err());
    let mut agent = EmbeddedAgent::new(Value::Null);
    agent
        .context_provider(move |s, c| registry.resolve(s, c))
        .tool_available(|tool, _, _| Ok(tool["name"] != "hidden"));
    let update = revision.clone();
    agent.add_tool(
        "select",
        "Change selection",
        ToolPermission::Read,
        move |_, ctx| {
            assert_eq!(ctx.context["sources"][0]["revision"], "1");
            update.store(2, Ordering::SeqCst);
            Ok(json!({"selected":"b"}))
        },
    )?;
    agent.add_tool("hidden", "Unavailable", ToolPermission::Read, |_, _| {
        panic!("Hidden tool executed")
    })?;
    let result = agent.run("Inspect project", &RunOptions::default(), |r| {
        assert_eq!(r["tools"].as_array().unwrap().len(), 1);
        Ok(if r["step"] == 1 {
            reply(r, "act", json!({"action":{"tool":"select","args":{}}}))
        } else {
            assert_eq!(r["context"]["sources"][0]["revision"], "2");
            reply(r, "ask", json!({"question":"Keep it?"}))
        })
    })?;
    assert_eq!(result["status"], "waiting");
    revision.store(3, Ordering::SeqCst);
    assert_eq!(
        agent.resume("Yes", 500, |r| {
            assert_eq!(r["context"]["sources"][0]["revision"], "3");
            Ok(reply(r, "done", json!({"summary":"Observed selection"})))
        })?["status"],
        "complete"
    );
    assert!(agent.snapshot().unwrap()["events"]
        .as_array()
        .unwrap()
        .iter()
        .any(|e| e["kind"] == "context"));
    Ok(())
}
#[test]
fn revocation_and_failed_sources() -> Result<()> {
    let allowed = Arc::new(AtomicBool::new(true));
    let filter = allowed.clone();
    let mut agent = EmbeddedAgent::new(Value::Null);
    agent.tool_available(move |_, _, _| Ok(filter.load(Ordering::SeqCst)));
    agent.add_tool("inspect", "Inspect", ToolPermission::Read, |_, _| {
        panic!("Revoked tool executed")
    })?;
    let mut options = RunOptions::default();
    options.max_steps = Some(1);
    let outcome = agent.run("Inspect", &options, |r| {
        allowed.store(false, Ordering::SeqCst);
        Ok(reply(
            r,
            "act",
            json!({"action":{"tool":"inspect","args":{}}}),
        ))
    })?;
    assert_eq!(outcome["metrics"]["failedTools"], 1);
    let mut registry = ContextRegistry::new(Value::Null);
    registry.add("broken", "Unavailable", json!({}), |_, _| {
        Ok(json!({"data":{}}))
    })?;
    let mut agent = EmbeddedAgent::new(Value::Null);
    agent.context_provider(move |s, c| registry.resolve(s, c));
    assert!(agent
        .run("Inspect", &RunOptions::default(), |_| panic!(
            "Stale context used"
        ))
        .is_err());
    assert_eq!(agent.snapshot().unwrap()["status"], "paused");
    Ok(())
}
