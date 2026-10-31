use codingagentlib::{Agent, ModelHandoff, Result, RunOptions};
use serde_json::{json, Value};
use std::{
    fs,
    path::PathBuf,
    time::{SystemTime, UNIX_EPOCH},
};
struct Workspace(PathBuf);
impl Workspace {
    fn new() -> Result<Self> {
        let p = std::env::temp_dir().join(format!(
            "native-handoff-{}-{}",
            std::process::id(),
            SystemTime::now().duration_since(UNIX_EPOCH)?.as_nanos()
        ));
        fs::create_dir_all(&p)?;
        Ok(Self(p))
    }
}
impl Drop for Workspace {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}
fn policy(mode: &str) -> Result<ModelHandoff> {
    ModelHandoff::new(mode, json!({"id":"strong"}), json!({"id":"cheap"}), None)
}
fn response(r: &Value, status: &str, action: Value) -> Value {
    json!({"sessionId":r["sessionId"],"step":r["step"],"status":status,"action":action,"plan":"Use actual implementation evidence","question":"Any final adjustments?","summary":"Verified current implementation","outcome":"complete"})
}
fn ready(r: &Value) -> Value {
    let p = &r["brief"]["evidence"];
    json!({"ready":true,"reason":"Implementation exercised, finalization remains","artifactCallId":p["artifact"]["callId"],"feedbackCallId":p["feedback"]["callId"],"remainingWork":[{"task":"Report actual checked source","kind":"finalize"}]})
}
#[cfg(unix)]
#[test]
fn one_way_native_handoff_survives_restart_and_configuration_drift_pauses() -> Result<()> {
    let root = Workspace::new()?;
    let options = RunOptions {
        allow_edits: true,
        allow_commands: true,
        max_steps: Some(6),
    };
    let handoff = policy("auto")?;
    let mut roles = vec![];
    let session = {
        let mut agent = Agent::new(&root.0, &["sh"])?;
        let result=agent.run_with_handoff("Implement value",&options,&handoff,|role,r|{roles.push(role.to_string());Ok(if role=="detector"{ready(r)}else if role=="continuation"{response(r,"ask",Value::Null)}else if r["step"]==1{response(r,"act",json!({"tool":"write_file","args":{"path":"value.txt","content":"one","expectedHash":"missing"}}))}else{response(r,"act",json!({"tool":"run_command","args":{"command":"sh","args":["-c","test \"$(cat value.txt)\" = one"]}}))})})?;
        assert_eq!(result["status"], "waiting");
        result["sessionId"].as_str().unwrap().to_string()
    };
    assert_eq!(
        roles,
        vec!["primary", "primary", "detector", "continuation"]
    );
    let mut agent = Agent::new(&root.0, &["sh"])?;
    let result = agent.resume_with_handoff(&session, "", 2, &handoff, |role, r| {
        assert_eq!(role, "continuation");
        assert_eq!(r["modelHandoff"]["activeRole"], "continuation");
        Ok(response(r, "ask", Value::Null))
    })?;
    assert_eq!(result["status"], "waiting");
    let saved = agent.dispatch(json!({"op":"session","session":session}))?;
    assert_eq!(
        saved["events"]
            .as_array()
            .unwrap()
            .iter()
            .filter(|e| e["value"]["status"] == "model_handoff")
            .count(),
        1
    );
    let changed = ModelHandoff::new(
        "auto",
        json!({"id":"different"}),
        json!({"id":"cheap"}),
        None,
    )?;
    assert!(agent
        .resume_with_handoff(&session, "", 2, &changed, |_, _| panic!(
            "must not call provider after configuration drift"
        ))
        .is_err());
    Ok(())
}
#[cfg(unix)]
#[test]
fn shadow_never_changes_executing_model() -> Result<()> {
    let root = Workspace::new()?;
    let mut agent = Agent::new(&root.0, &["sh"])?;
    let mut detectors = 0;
    let result=agent.run_with_handoff("Implement value",&RunOptions{allow_edits:true,allow_commands:true,max_steps:Some(5)},&policy("shadow")?,|role,r|{assert_ne!(role,"continuation");Ok(if role=="detector"{detectors+=1;ready(r)}else if r["step"]==1{response(r,"act",json!({"tool":"write_file","args":{"path":"value.txt","content":"one","expectedHash":"missing"}}))}else if r["step"]==2{response(r,"act",json!({"tool":"run_command","args":{"command":"sh","args":["-c","test -f value.txt"]}}))}else{response(r,"done",Value::Null)})})?;
    assert_eq!(result["status"], "complete");
    assert_eq!(detectors, 1);
    Ok(())
}
