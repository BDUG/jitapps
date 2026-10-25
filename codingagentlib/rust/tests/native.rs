use codingagentlib::{Agent, Result, RunOptions};
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
            "native-rust-agent-{}-{}",
            std::process::id(),
            SystemTime::now().duration_since(UNIX_EPOCH)?.as_nanos()
        ));
        fs::create_dir(&p)?;
        Ok(Self(p))
    }
}
impl Drop for Workspace {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}
fn start(agent: &mut Agent, edits: bool, commands: bool) -> Result<String> {
    agent.start(
        "Test native runtime",
        &RunOptions {
            allow_edits: edits,
            allow_commands: commands,
            ..Default::default()
        },
    )
}
fn tool(agent: &mut Agent, session: &str, name: &str, call: &str, args: Value) -> Result<Value> {
    agent.dispatch(json!({"op":"tool","session":session,"tool":name,"callId":call,"args":args}))
}
#[test]
#[allow(deprecated)]
fn no_interpreter_or_worker_required() -> Result<()> {
    let w = Workspace::new()?;
    let mut agent = Agent::spawn("/this/interpreter/does/not/exist", &w.0, &[])?;
    assert_eq!(agent.health()?["requiresPython"], false);
    assert_eq!(agent.health()?["implementation"], "native-rust");
    let s = start(&mut agent, false, false)?;
    let v = tool(&mut agent, &s, "list_files", "list", json!({}))?;
    assert_eq!(v["result"]["files"], json!([]));
    Ok(())
}
#[test]
fn persisted_sessions_receipts_stale_hash_and_lock() -> Result<()> {
    let w = Workspace::new()?;
    let mut agent = Agent::new(&w.0, &[])?;
    assert!(Agent::new(&w.0, &[]).is_err());
    let session = start(&mut agent, true, false)?;
    let args = json!({"path":"a.txt","content":"one","expectedHash":"missing"});
    let first = tool(&mut agent, &session, "write_file", "write", args.clone())?;
    let hash = first["result"]["hash"].clone();
    assert_eq!(
        tool(&mut agent, &session, "write_file", "write", args.clone())?,
        first
    );
    assert!(tool(
        &mut agent,
        &session,
        "write_file",
        "write",
        json!({"path":"b","content":"bad","expectedHash":"missing"})
    )
    .is_err());
    assert_eq!(
        tool(
            &mut agent,
            &session,
            "write_file",
            "stale",
            json!({"path":"a.txt","content":"lost","expectedHash":"missing"})
        )?["ok"],
        false
    );
    agent.close()?;
    let mut agent = Agent::new(&w.0, &[])?;
    assert_eq!(
        agent.dispatch(json!({"op":"session","session":session}))?["status"],
        "paused"
    );
    agent.dispatch(json!({"op":"resume","session":session}))?;
    assert_eq!(
        tool(&mut agent, &session, "write_file", "write", args)?,
        first
    );
    let replace = tool(
        &mut agent,
        &session,
        "replace_text",
        "replace",
        json!({"path":"a.txt","find":"one","replacement":"two","expectedHash":hash}),
    )?;
    assert_eq!(replace["ok"], true);
    assert_eq!(fs::read_to_string(w.0.join("a.txt"))?, "two");
    Ok(())
}
#[test]
fn paths_permissions_unicode_and_checks() -> Result<()> {
    let w = Workspace::new()?;
    fs::write(w.0.join("text.txt"), "a😀éz")?;
    let mut agent = Agent::new(&w.0, &[])?;
    let s = start(&mut agent, false, false)?;
    for (index, path) in [
        "../escape",
        "/etc/passwd",
        ".codingagentlib-rust/lock",
        ".suite-agent/session",
        "a/../escape",
    ]
    .iter()
    .enumerate()
    {
        assert_eq!(
            tool(
                &mut agent,
                &s,
                "read_file",
                &format!("bad{index}"),
                json!({"path":path})
            )?["ok"],
            false
        );
    }
    let page = tool(
        &mut agent,
        &s,
        "read_file",
        "page",
        json!({"path":"text.txt","offset":1,"limit":2}),
    )?;
    assert_eq!(page["result"]["text"], "😀é");
    assert_eq!(page["result"]["nextOffset"], 3);
    assert_eq!(
        tool(
            &mut agent,
            &s,
            "write_file",
            "denied",
            json!({"path":"denied","content":"bad","expectedHash":"missing"})
        )?["ok"],
        false
    );
    let checked=agent.dispatch(json!({"op":"tool","session":s,"tool":"read_file","callId":"checked","args":{"path":"text.txt"},"checks":[{"path":"/text","op":"contains","value":"😀"}]}))?;
    assert_eq!(checked["checks"]["passed"], true);
    Ok(())
}
#[cfg(unix)]
#[test]
fn symlink_boundary() -> Result<()> {
    let w = Workspace::new()?;
    let outside = Workspace::new()?;
    fs::write(outside.0.join("secret"), "secret")?;
    std::os::unix::fs::symlink(&outside.0, w.0.join("link"))?;
    let mut agent = Agent::new(&w.0, &[])?;
    let s = start(&mut agent, true, false)?;
    assert_eq!(
        tool(
            &mut agent,
            &s,
            "read_file",
            "escape",
            json!({"path":"link/secret"})
        )?["ok"],
        false
    );
    let files = tool(&mut agent, &s, "list_files", "list", json!({}))?;
    assert_eq!(files["result"]["files"], json!([]));
    Ok(())
}
#[test]
fn skills_workflows_memory_and_zip_are_native() -> Result<()> {
    let w = Workspace::new()?;
    let mut agent = Agent::new(&w.0, &[])?;
    let s = start(&mut agent, true, false)?;
    let saved = tool(
        &mut agent,
        &s,
        "skill_save",
        "save-skill",
        json!({"id":"rust-build","name":"Rust build","expectedRevision":0,"content":"Use cargo test to verify."}),
    )?;
    assert_eq!(saved["result"]["revision"], 1);
    assert_eq!(
        tool(
            &mut agent,
            &s,
            "skill_save",
            "stale-skill",
            json!({"id":"rust-build","expectedRevision":0,"content":"stale"})
        )?["ok"],
        false
    );
    let mem = tool(
        &mut agent,
        &s,
        "memory_store",
        "memory",
        json!({"text":"Native Rust test finding"}),
    )?;
    assert!(mem["result"]["id"].is_string());
    assert_eq!(
        tool(
            &mut agent,
            &s,
            "memory_search",
            "search",
            json!({"query":"RUST"})
        )?["result"]["total"],
        1
    );
    let wf = tool(
        &mut agent,
        &s,
        "workflow_save",
        "save-workflow",
        json!({"id":"greeting","expectedRevision":0,"definition":{"name":"Write greeting","steps":[{"tool":"write_file","args":{"path":"hello.txt","content":"hello","expectedHash":"missing"}}]}}),
    )?;
    assert_eq!(wf["ok"], true);
    assert_eq!(
        tool(
            &mut agent,
            &s,
            "workflow_run",
            "run-workflow",
            json!({"id":"greeting","revision":1})
        )?["result"]["status"],
        "complete"
    );
    let packaged = tool(&mut agent, &s, "package_results", "package", json!({}))?;
    let path = packaged["result"]["path"].as_str().unwrap();
    let mut zip = zip::ZipArchive::new(fs::File::open(path)?)?;
    assert!(zip.by_name("files/hello.txt").is_ok());
    assert!(zip.by_name("session.json").is_ok());
    assert!(zip.by_name("skills/rust-build.json").is_ok());
    agent.close()?;
    let mut agent = Agent::new(&w.0, &[])?;
    let s = start(&mut agent, false, false)?;
    assert_eq!(
        tool(
            &mut agent,
            &s,
            "skill_read",
            "reuse",
            json!({"id":"rust-build","revision":1})
        )?["result"]["text"],
        "Use cargo test to verify."
    );
    Ok(())
}
#[cfg(unix)]
#[test]
fn real_commands_output_paging_timeout_and_cancellation() -> Result<()> {
    let w = Workspace::new()?;
    let mut agent = Agent::new(&w.0, &["/bin/sh"])?;
    let s = start(&mut agent, true, true)?;
    let output = tool(
        &mut agent,
        &s,
        "run_command",
        "command",
        json!({"command":"/bin/sh","args":["-c","printf 'native 😀 output'"]}),
    )?;
    assert_eq!(output["result"]["exitCode"], 0);
    let job = output["result"]["jobId"].clone();
    assert_eq!(
        tool(
            &mut agent,
            &s,
            "read_command_output",
            "output",
            json!({"jobId":job,"offset":7,"limit":1})
        )?["result"]["text"],
        "😀"
    );
    let timed = tool(
        &mut agent,
        &s,
        "run_command",
        "timeout",
        json!({"command":"/bin/sh","args":["-c","sleep 30"],"timeout":30}),
    )?;
    assert_eq!(timed["result"]["timedOut"], true);
    let cancel = agent.cancel_handle();
    let worker = std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_millis(40));
        cancel.cancel();
    });
    let now = std::time::Instant::now();
    let result = tool(
        &mut agent,
        &s,
        "run_command",
        "cancel",
        json!({"command":"/bin/sh","args":["-c","sleep 30"],"timeout":10000}),
    )?;
    worker.join().unwrap();
    assert_eq!(result["result"]["cancelled"], true);
    assert!(now.elapsed().as_secs() < 3);
    Ok(())
}
#[test]
fn budgets_questions_callback_errors_and_cancel_before_act() -> Result<()> {
    let w = Workspace::new()?;
    let mut agent = Agent::new(&w.0, &[])?;
    let options = RunOptions {
        max_steps: Some(1),
        ..Default::default()
    };
    let result=agent.run("List once",&options,|r|Ok(json!({"sessionId":r["sessionId"],"step":r["step"],"status":"act","plan":"Inspect","action":{"tool":"list_files","args":{}}})))?;
    assert_eq!(result["reason"], "step_budget");
    let result=agent.run("Ask",&RunOptions::default(),|r|Ok(json!({"sessionId":r["sessionId"],"step":r["step"],"status":"ask","plan":"Clarify","question":"Which file?","action":null})))?;
    assert_eq!(result["status"], "waiting");
    assert!(agent
        .run("Fail", &RunOptions::default(), |_| Err(
            "Callback failed".into()
        ))
        .is_err());
    let cancel = agent.cancel_handle();
    let result=agent.run("Cancel",&RunOptions{allow_edits:true,..Default::default()},|r|{cancel.cancel();Ok(json!({"sessionId":r["sessionId"],"step":r["step"],"status":"act","plan":"Must not run","action":{"tool":"write_file","args":{"path":"bad","content":"bad","expectedHash":"missing"}}}))})?;
    assert_eq!(result["reason"], "cancelled");
    assert!(!w.0.join("bad").exists());
    Ok(())
}
#[cfg(unix)]
#[test]
fn completion_requires_actual_verification_after_edit() -> Result<()> {
    let w = Workspace::new()?;
    let mut agent = Agent::new(&w.0, &["/bin/sh"])?;
    let s = start(&mut agent, true, true)?;
    tool(
        &mut agent,
        &s,
        "write_file",
        "write",
        json!({"path":"a","content":"test","expectedHash":"missing"}),
    )?;
    let request = agent.next(&s)?;
    let denied=agent.submit(&s,json!({"sessionId":s,"step":request["step"],"status":"done","plan":"Complete","action":null,"summary":"Claimed success"}))?;
    assert_eq!(denied["status"], "retry");
    assert!(denied["error"].as_str().unwrap().contains("verification"));
    tool(
        &mut agent,
        &s,
        "run_command",
        "verify",
        json!({"command":"/bin/sh","args":["-c","test \"$(cat a)\" = test"]}),
    )?;
    let request = agent.next(&s)?;
    let done=agent.submit(&s,json!({"sessionId":s,"step":request["step"],"status":"done","plan":"Verification observed","action":null,"summary":"Verified"}))?;
    assert_eq!(done["status"], "complete");
    Ok(())
}

#[test]
fn new_user_event_invalidates_reserved_response() -> Result<()> {
    let w = Workspace::new()?;
    let mut agent = Agent::new(&w.0, &[])?;
    let session = start(&mut agent, true, false)?;
    let previous = agent.next(&session)?;
    agent.dispatch(json!({"op":"event","session":session,"value":{"status":"follow_up","text":"Do not write that file"}}))?;
    assert!(agent.submit(&session,json!({"sessionId":session,"step":previous["step"],"status":"act","plan":"Old reply","action":{"tool":"write_file","args":{"path":"bad","content":"bad","expectedHash":"missing"}}})).is_err());
    assert!(!w.0.join("bad").exists());
    assert!(agent.next(&session)?["step"].as_u64().unwrap() > previous["step"].as_u64().unwrap());
    Ok(())
}
