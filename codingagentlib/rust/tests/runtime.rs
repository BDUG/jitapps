use codingagentlib::{Agent, RunOptions};
use serde_json::json;
use std::{
    env, fs,
    time::{SystemTime, UNIX_EPOCH},
};
#[test]
fn native_file_permissions_repair_and_loop() -> codingagentlib::Result<()> {
    let workspace = env::temp_dir().join(format!(
        "codingagentlib-rust-{}",
        SystemTime::now().duration_since(UNIX_EPOCH)?.as_nanos()
    ));
    fs::create_dir(&workspace)?;
    let mut agent = Agent::new(&workspace, &[])?;
    assert_eq!(agent.health()?["enabled"], true);
    let result=agent.run("Write a greeting",&RunOptions{allow_edits:true,max_steps:Some(10),..Default::default()},|request|{
        let wrote=request["events"].as_array().unwrap().iter().any(|e|e["kind"]=="observation");
        Ok(json!({"sessionId":request["sessionId"],"step":request["step"],"status":if wrote{"done"}else{"act"},"plan":"Write the requested greeting","action":if wrote{serde_json::Value::Null}else{json!({"tool":"write_file","args":{"path":"rust.txt","content":"hello from Rust","expectedHash":"missing"}})},"summary":"Greeting written; no command validation requested"}))
    })?;
    assert_eq!(result["status"], "complete");
    assert_eq!(
        fs::read_to_string(workspace.join("rust.txt"))?,
        "hello from Rust"
    );
    let session = agent.start("Reject invalid IDs", &RunOptions::default())?;
    for _ in 0..3 {
        let request = agent.next(&session)?;
        let result = agent.submit(
            &session,
            json!({"sessionId":"wrong","step":request["step"]}),
        )?;
        assert!(result["status"] == "retry" || result["status"] == "waiting");
    }
    let denied = agent.dispatch(json!({"op":"start","goal":"Read only"}))?;
    let result=agent.dispatch(json!({"op":"tool","session":denied["id"],"tool":"write_file","callId":"denied-rust","args":{"path":"denied.txt","content":"bad","expectedHash":"missing"}}))?;
    assert_eq!(result["ok"], false);
    assert!(!workspace.join("denied.txt").exists());
    agent.close()?;
    fs::remove_dir_all(workspace)?;
    Ok(())
}
