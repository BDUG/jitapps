use codingagentlib::{EmbeddedAgent, Result, RunOptions, ToolPermission};
use serde_json::{json, Value};
use std::sync::{Arc, Mutex};
fn response(r: &Value, status: &str, extra: Value) -> Value {
    let mut value = json!({"sessionId":r["sessionId"],"step":r["step"],"status":status,"plan":"Public host integration plan","action":null});
    for (k, v) in extra.as_object().unwrap() {
        value[k] = v.clone();
    }
    value
}
#[test]
fn host_tools_permissions_resume_and_events() -> Result<()> {
    let events = Arc::new(Mutex::new(Vec::new()));
    let sink = events.clone();
    let mut a = EmbeddedAgent::new(json!({"app":"test"}));
    a.add_tool("echo", "Echo text", ToolPermission::Read, |args, ctx| {
        Ok(json!({"text":args["text"],"callId":ctx.call_id}))
    })?;
    a.add_tool(
        "write",
        "Requires permission",
        ToolPermission::Edits,
        |_, _| panic!("Must not execute"),
    )?;
    a.on_event(move |e| {
        sink.lock().unwrap().push(e.clone());
        Ok(())
    });
    let result = a.run("Integrate", &RunOptions::default(), |r| {
        assert_eq!(
            r["responseSchema"]["properties"]["sessionId"]["const"],
            r["sessionId"]
        );
        Ok(match r["step"].as_u64().unwrap() {
            1 => response(r, "act", json!({"action":{"tool":"write","args":{}}})),
            2 => response(
                r,
                "act",
                json!({"action":{"tool":"echo","args":{"text":"hello"}}}),
            ),
            _ => response(r, "ask", json!({"question":"Continue?"})),
        })
    })?;
    assert_eq!(result["status"], "waiting");
    assert!(events
        .lock()
        .unwrap()
        .iter()
        .any(|e| e["kind"] == "observation" && e["value"]["ok"] == false));
    assert_eq!(
        a.resume("Yes", 5, |r| Ok(response(
            r,
            "done",
            json!({"summary":"Observed host results"})
        )))?["status"],
        "complete"
    );
    Ok(())
}
#[test]
fn cancellation_approval_and_invalid_response_repairs() -> Result<()> {
    let mut a = EmbeddedAgent::new(Value::Null);
    a.add_tool("blocked", "Blocked", ToolPermission::Read, |_, _| {
        panic!("Must not run")
    })?;
    a.before_tool(|_, _| Ok(false));
    let result = a.run(
        "Blocked",
        &RunOptions {
            max_steps: Some(1),
            ..Default::default()
        },
        |r| {
            Ok(response(
                r,
                "act",
                json!({"action":{"tool":"blocked","args":{}}}),
            ))
        },
    )?;
    assert_eq!(result["reason"], "step_budget");
    assert_eq!(
        a.run("Repair", &RunOptions::default(), |_| Ok(Value::Null))?["status"],
        "waiting"
    );
    let cancel = a.cancel_handle();
    let result = a.run("Cancel", &RunOptions::default(), move |r| {
        cancel.cancel();
        Ok(response(
            r,
            "act",
            json!({"action":{"tool":"blocked","args":{}}}),
        ))
    })?;
    assert_eq!(result["reason"], "cancelled");
    Ok(())
}
#[test]
fn event_hook_failure_pauses_before_side_effects() -> Result<()> {
    let mut a = EmbeddedAgent::new(Value::Null);
    a.add_tool("tool", "Test", ToolPermission::Read, |_, _| {
        panic!("Must not run")
    })?;
    a.on_event(|e| {
        if e["kind"] == "plan" {
            Err("Observer failed".into())
        } else {
            Ok(())
        }
    });
    assert!(a
        .run("Observe", &RunOptions::default(), |r| Ok(response(
            r,
            "act",
            json!({"action":{"tool":"tool","args":{}}})
        )))
        .is_err());
    assert_eq!(a.snapshot().unwrap()["status"], "paused");
    Ok(())
}

#[test]
fn tools_completion_policy_and_read_only_restore() -> Result<()> {
    let mut a = EmbeddedAgent::new(Value::Null);
    a.add_tool("echo", "Echo", ToolPermission::Read, |args, _| {
        Ok(args.clone())
    })?;
    a.set_tool_enabled("echo", false)?;
    assert_eq!(a.list_tools()[0]["enabled"], false);
    a.set_tool_enabled("echo", true)?;
    a.before_finish(|_, s| {
        Ok(s["events"]
            .as_array()
            .unwrap()
            .iter()
            .any(|e| e["kind"] == "observation" && e["value"]["ok"] == true))
    });
    assert_eq!(
        a.run("Verify", &RunOptions::default(), |r| Ok(response(
            r,
            "done",
            json!({"summary":"Unverified"})
        )))?["status"],
        "waiting"
    );
    let result = a.resume("Use echo", 1, |r| {
        Ok(response(
            r,
            "act",
            json!({"action":{"tool":"echo","args":{"value":"hello"}}}),
        ))
    })?;
    assert_eq!(result["metrics"]["toolAttempts"], 1);
    let mut snapshot = a.snapshot().unwrap();
    snapshot["permissions"]["edits"] = json!(true);
    let mut b = EmbeddedAgent::new(Value::Null);
    b.add_tool("echo", "Echo", ToolPermission::Read, |a, _| Ok(a.clone()))?;
    b.restore(&snapshot, &RunOptions::default())?;
    assert_eq!(b.snapshot().unwrap()["permissions"]["edits"], false);
    b.set_context(json!({"phase":"restored"}));
    assert_eq!(
        b.resume("Continue", 5, |r| Ok(response(
            r,
            "done",
            json!({"summary":r["context"]["phase"]})
        )))?["summary"],
        "restored"
    );
    b.remove_tool("echo")?;
    assert!(b.list_tools().is_empty());
    Ok(())
}
