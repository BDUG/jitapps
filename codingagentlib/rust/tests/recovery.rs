use codingagentlib::{recovery, Result};
use serde_json::{json, Value};

fn pair(step: usize, action: &Value, receipt: Value) -> Vec<Value> {
    vec![json!({"kind":"assistant","value":{"sessionId":"s","step":step,"status":"act","action":action}}),json!({"kind":"observation","value":{"id":format!("s_{step}"),"tool":action["tool"],"ok":true,"result":receipt}})]
}
fn command() -> Value { json!({"tool":"run_command","args":{"command":"compiler","args":["private-argument"]}}) }
fn failed() -> Value { let mut events=vec![];for i in 1..=3 { events.extend(pair(i,&command(),json!({"exitCode":1,"stderr":format!("failure {i}")}))); }json!(events) }
#[test]
fn exact_failures_ignore_changed_checks_and_deduplicate_receipts() {
    let mut events=failed();let mut action=command();action["checks"]=json!([{"path":"/exitCode","op":"equals","value":1}]);
    let duplicate=events[5].clone();for _ in 0..4 { events.as_array_mut().unwrap().push(duplicate.clone()); }
    let report=recovery::terminal_retry(&events,&action).unwrap();assert_eq!(report["failures"],3);assert_eq!(report["automaticRetry"],false);assert_eq!(report["callIds"],json!(["s_1","s_2","s_3"]));assert!(!report.to_string().contains("private-argument"));assert_eq!(report["evidence"][0]["read"]["args"]["offset"],1);assert_eq!(report["evidence"][2]["eventIndex"],5);
    action["args"]["args"]=json!(["changed approach"]);assert!(recovery::terminal_retry(&events,&action).is_none());
    assert!(recovery::terminal_retry(&events,&json!({"tool":"read_file","args":{}})).is_none());
}
#[test]
fn success_edits_and_followups_reset_but_reads_and_unknown_exit_codes_do_not() {
    let mut events=failed();for i in 4..80 { events.as_array_mut().unwrap().extend(pair(i,&json!({"tool":"read_file","args":{"path":"source"}}),json!({"text":"inspected"}))); }
    assert!(recovery::terminal_retry(&events,&command()).is_some());
    let mut unknown=events.clone();unknown.as_array_mut().unwrap().extend(pair(80,&command(),json!({"exitCode":null})));assert!(recovery::terminal_retry(&unknown,&command()).is_some());
    let mut succeeded=events.clone();succeeded.as_array_mut().unwrap().extend(pair(80,&command(),json!({"exitCode":0})));assert!(recovery::terminal_retry(&succeeded,&command()).is_none());
    let mut fixed=events.clone();fixed.as_array_mut().unwrap().extend(pair(80,&json!({"tool":"apply_edits","args":{"path":"source"}}),json!({"hash":"new"})));assert!(recovery::terminal_retry(&fixed,&command()).is_none());
    events.as_array_mut().unwrap().push(json!({"kind":"user","value":{"status":"execution_mode","mode":"build"}}));assert!(recovery::terminal_retry(&events,&command()).is_some());
    events.as_array_mut().unwrap().push(json!({"kind":"user","value":{"status":"follow_up","text":"Reviewed failure; try a changed approach"}}));assert!(recovery::terminal_retry(&events,&command()).is_none());
}
#[test]
fn unrelated_or_unmatched_receipts_do_not_reset_failures_and_scripts_are_supported() {
    let mut events=failed();events.as_array_mut().unwrap().push(json!({"kind":"observation","value":{"id":"unknown","tool":"write_file","ok":true}}));assert!(recovery::terminal_retry(&events,&command()).is_some());
    let action=json!({"tool":"run_script","args":{"path":"check.sh","command":"sh"}});let mut scripts=vec![];for i in 1..=3 { let mut p=pair(i,&action,json!({"exitCode":0}));p[1]["value"]["checks"]=json!({"passed":false});scripts.extend(p); }assert!(recovery::terminal_retry(&json!(scripts),&action).is_some());
}

#[cfg(unix)]
#[test]
fn native_loop_stops_before_fourth_command_and_remembers_guard_after_restart() -> Result<()> {
    use codingagentlib::{Agent,RunOptions};use std::{fs,time::{SystemTime,UNIX_EPOCH}};
    let root=std::env::temp_dir().join(format!("terminal-retry-{}-{}",std::process::id(),SystemTime::now().duration_since(UNIX_EPOCH)?.as_nanos()));fs::create_dir(&root)?;
    let result=(|| -> Result<()> {
        let mut agent=Agent::new(&root,&["sh"])?;let mut proposals=0;
        let invocation=json!({"tool":"run_command","args":{"command":"sh","args":["-c","printf x >> attempts.txt; exit 1"]}});
        let outcome=agent.run("Diagnose terminal failure",&RunOptions{allow_commands:true,max_steps:Some(20),..Default::default()},|r|{proposals+=1;assert_eq!(r["terminalRetryPolicy"]["maxUnchangedFailures"],3);let mut action=invocation.clone();action["checks"]=json!([{"path":"/exitCode","op":"equals","value":proposals+10}]);Ok(json!({"sessionId":r["sessionId"],"step":r["step"],"status":"act","plan":"Inspect failure","action":action}))})?;
        assert_eq!(outcome["status"],"waiting");assert_eq!(outcome["reason"],"repeated_terminal_failure");assert_eq!(proposals,4);assert_eq!(fs::read_to_string(root.join("attempts.txt"))?,"xxx");
        let id=outcome["sessionId"].as_str().unwrap().to_owned();let audit=agent.dispatch(json!({"op":"session","session":id}))?;for evidence in outcome["recovery"]["evidence"].as_array().unwrap(){let index=evidence["eventIndex"].as_u64().unwrap() as usize;assert_eq!(audit["events"][index]["value"]["id"],evidence["callId"]);}agent.close()?;
        let mut agent=Agent::new(&root,&["sh"])?;agent.dispatch(json!({"op":"resume","session":id}))?;let turn=agent.next(&id)?;
        let result=agent.submit(&id,json!({"sessionId":id,"step":turn["step"],"status":"act","plan":"Inspect before retrying","action":invocation}))?;assert_eq!(result["reason"],"repeated_terminal_failure");assert_eq!(fs::read_to_string(root.join("attempts.txt"))?,"xxx");
        agent.dispatch(json!({"op":"event","session":id,"value":{"status":"follow_up","text":"Reviewed the failure; explicitly retry once."}}))?;agent.dispatch(json!({"op":"resume","session":id}))?;let turn=agent.next(&id)?;
        let result=agent.submit(&id,json!({"sessionId":id,"step":turn["step"],"status":"act","plan":"One deliberate retry","action":invocation}))?;assert_eq!(result["status"],"continue");assert_eq!(fs::read_to_string(root.join("attempts.txt"))?,"xxxx");
        let saved=agent.dispatch(json!({"op":"session","session":id}))?;assert_eq!(saved["events"].as_array().unwrap().iter().filter(|e|e["kind"]=="observation").count(),4);assert_eq!(saved["allowCommands"],true);agent.close()?;Ok(())
    })();let _=fs::remove_dir_all(root);result
}
