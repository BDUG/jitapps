//! Evidence-based guard for unchanged terminal failures. Never executes recovery suggestions.
use serde_json::{json, Value};
use std::collections::{BTreeMap, BTreeSet};

pub const TERMINAL_FAILURE_LIMIT: usize = 3;

pub fn policy() -> Value {
    json!({"format":"codingagentlib/terminal-retry-policy/v1","maxUnchangedFailures":TERMINAL_FAILURE_LIMIT,"tools":["run_command","run_script"],"scope":"matching accepted action/observation receipts since the latest follow-up; no recent-window cutoff","automaticRetry":false})
}

pub fn terminal_retry(events: &Value, candidate: &Value) -> Option<Value> {
    let tool = candidate["tool"].as_str()?;
    if !["run_command", "run_script"].contains(&tool) { return None; }
    let args = candidate.get("args")?;
    let mut pending = BTreeMap::new();
    let mut seen = BTreeSet::new();
    let mut failures = Vec::new();
    for (index, event) in events.as_array()?.iter().enumerate() {
        let value = &event["value"];
        if event["kind"] == "user" && value["status"] == "follow_up" {
            pending.clear();seen.clear();failures.clear();continue;
        }
        if event["kind"] == "assistant" && value["status"] == "act" {
            if let (Some(session), Some(step)) = (value["sessionId"].as_str(), value["step"].as_u64()) {
                pending.insert(format!("{session}_{step}"), &value["action"]);
            }
        }
        if event["kind"] != "observation" { continue; }
        let Some(id) = value["id"].as_str() else { continue; };
        if !seen.insert(id) { continue; }
        let Some(action) = pending.remove(id) else { continue; };
        if action["tool"] != value["tool"] { continue; }
        if value["ok"] == true && ["write_file", "replace_text", "apply_edits", "delete_file", "restore_file", "write_script", "delete_script"].iter().any(|t| value["tool"] == *t) {
            failures.clear();
        }
        if action["tool"] != tool || action.get("args") != Some(args) { continue; }
        let result = &value["result"];
        let failed = value["ok"] == false || value["checks"]["passed"] == false || result["timedOut"] == true || result["cancelled"] == true || result["exitCode"].as_i64().map(|c| c != 0).unwrap_or(false);
        if failed { failures.push((id,index)); }
        else if value["ok"] == true && result["exitCode"].as_i64() == Some(0) { failures.clear(); }
    }
    if failures.len() < TERMINAL_FAILURE_LIMIT { return None; }
    Some(json!({
        "format":"codingagentlib/terminal-recovery/v1",
        "code":"repeated_terminal_failure",
        "tool":tool,
        "failures":failures.len(),
        "callIds":failures[failures.len()-TERMINAL_FAILURE_LIMIT..].iter().map(|(id,_)|*id).collect::<Vec<_>>(),
        "evidence":failures[failures.len()-TERMINAL_FAILURE_LIMIT..].iter().map(|(id,index)|json!({"callId":id,"eventIndex":index,"read":{"tool":"read_history","args":{"offset":index,"limit":1}}})).collect::<Vec<_>>(),
        "automaticRetry":false,
        "guidance":[
            "Inspect the recorded tool error, any retained stdout/stderr and current source before adapting the command.",
            "The same tool and literal arguments failed three times. Changing declarative checks does not repair the invocation.",
            "Use a changed approach, record a meaningful file-tool fix, or ask for a missing requirement. Resume alone does not reset this guard.",
            "A deliberate user follow-up starts a new retry segment. Existing permissions, command approvals and verification still apply."
        ],
        "note":"Derived only from matching accepted actions and unique native observations. No recovery command was executed. Earlier actions may have changed the workspace."
    }))
}
