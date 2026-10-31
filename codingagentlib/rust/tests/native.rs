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

#[test]
fn scoped_project_guidance_refreshes_without_granting_permissions() -> Result<()> {
    let w = Workspace::new()?;
    fs::create_dir(w.0.join("src"))?;
    fs::write(w.0.join("AGENTS.md"), "Root rules")?;
    fs::write(w.0.join("src/AGENTS.md"), "Fallback rules")?;
    fs::write(w.0.join("src/AGENTS.override.md"), "Nested override")?;
    fs::write(w.0.join("src/source.rs"), "fn main() {}")?;
    let mut agent = Agent::new(&w.0, &[])?;
    let id = agent.start("Inspect scoped guidance", &RunOptions::default())?;
    let request = agent.next(&id)?;
    assert_eq!(
        request["projectInstructions"]["documents"][0]["content"],
        "Root rules"
    );
    agent.submit(&id, json!({"sessionId":id,"step":request["step"],"status":"act","plan":"Inspect nested source","action":{"tool":"read_file","args":{"path":"src/source.rs"}}}))?;
    fs::write(w.0.join("AGENTS.md"), "Refreshed root")?;
    let next = agent.next(&id)?;
    let docs = &next["projectInstructions"]["documents"];
    assert_eq!(docs[0]["content"], "Refreshed root");
    assert_eq!(docs[1]["path"], "src/AGENTS.override.md");
    assert_eq!(docs[1]["scope"], "src");
    assert_eq!(docs[1]["sha256"].as_str().unwrap().len(), 64);
    assert_eq!(next["permissions"]["allowCommands"], false);
    assert_eq!(next["permissions"]["allowEdits"], false);
    agent.submit(&id,json!({"sessionId":id,"step":next["step"],"status":"act","plan":"Read guidance explicitly","action":{"tool":"read_project_instructions","args":{"path":"src/new.rs"}}}))?;
    fs::write(w.0.join("src/AGENTS.override.md"), "  \n")?;
    let next = agent.next(&id)?;
    assert_eq!(
        next["projectInstructions"]["documents"][1]["content"],
        "Fallback rules"
    );
    agent.close()?;
    Ok(())
}

#[test]
fn instruction_budget_and_symlinks_are_explicit() -> Result<()> {
    let w = Workspace::new()?;
    fs::create_dir(w.0.join("src"))?;
    fs::write(w.0.join("AGENTS.md"), "🧪".repeat(1000))?;
    fs::write(w.0.join("src/AGENTS.md"), "x".repeat(32768))?;
    let mut agent = Agent::new(&w.0, &[])?;
    let id = agent.start("Inspect budget", &RunOptions::default())?;
    let result=agent.dispatch(json!({"op":"tool","session":id,"tool":"read_project_instructions","callId":"guidance-budget","args":{"path":"src"}}))?;
    assert_eq!(result["result"]["complete"], false);
    assert_eq!(result["result"]["bytes"], 4000);
    assert_eq!(result["result"]["warnings"][0]["reason"], "byte_budget");
    let denied=agent.dispatch(json!({"op":"tool","session":id,"tool":"read_project_instructions","callId":"guidance-traversal","args":{"path":"../outside"}}))?;
    assert_eq!(denied["ok"], false);
    #[cfg(unix)]
    {
        fs::remove_file(w.0.join("AGENTS.md"))?;
        std::os::unix::fs::symlink("src/AGENTS.md", w.0.join("AGENTS.md"))?;
        let result=agent.dispatch(json!({"op":"tool","session":id,"tool":"read_project_instructions","callId":"guidance-link","args":{}}))?;
        assert_eq!(result["result"]["documents"].as_array().unwrap().len(), 0);
        assert_eq!(result["result"]["complete"], false);
    }
    agent.close()?;
    Ok(())
}

#[test]
#[cfg(unix)]
fn verification_binds_source_and_blocks_changes_after_planning() -> Result<()> {
    let w = Workspace::new()?;
    let mut agent = Agent::new(&w.0, &["/bin/sh"])?;
    let id = start(&mut agent, true, true)?;
    assert_eq!(
        tool(
            &mut agent,
            &id,
            "write_file",
            "write-source",
            json!({"path":"source.txt","content":"one","expectedHash":"missing"})
        )?["ok"],
        true
    );
    let result = tool(
        &mut agent,
        &id,
        "run_command",
        "verify-one",
        json!({"command":"/bin/sh","args":["-c","cat source.txt"]}),
    )?;
    assert_eq!(result["result"]["verificationBinding"]["stable"], true);
    let request = agent.next(&id)?;
    assert_eq!(request["verificationFreshness"]["status"], "current");
    fs::write(w.0.join("source.txt"), "external edit")?;
    let rejected=agent.submit(&id,json!({"sessionId":id,"step":request["step"],"status":"done","plan":"Premature completion","action":null,"summary":"Old checks passed"}))?;
    assert_eq!(rejected["status"], "retry");
    assert!(rejected["error"]
        .as_str()
        .unwrap()
        .contains("Verification inputs changed"));
    let request = agent.next(&id)?;
    assert_eq!(request["verificationFreshness"]["status"], "stale");
    agent.submit(&id,json!({"sessionId":id,"step":request["step"],"status":"act","plan":"Verify changed source","action":{"tool":"run_command","args":{"command":"/bin/sh","args":["-c","test \"$(cat source.txt)\" = 'external edit'"]}}}))?;
    let request = agent.next(&id)?;
    assert_eq!(request["verificationFreshness"]["status"], "current");
    assert_eq!(agent.submit(&id,json!({"sessionId":id,"step":request["step"],"status":"done","plan":"Fresh verification observed","action":null,"summary":"Verified current tracked source"}))?["status"],"complete");
    assert_eq!(fs::read_to_string(w.0.join("source.txt"))?, "external edit");
    agent.close()?;
    Ok(())
}

#[test]
#[cfg(unix)]
fn mutating_commands_and_unavailable_inputs_cannot_certify_completion() -> Result<()> {
    let w = Workspace::new()?;
    let mut agent = Agent::new(&w.0, &["/bin/sh"])?;
    let id = start(&mut agent, true, true)?;
    tool(
        &mut agent,
        &id,
        "write_file",
        "tracked",
        json!({"path":"source.txt","content":"one","expectedHash":"missing"}),
    )?;
    let result = tool(
        &mut agent,
        &id,
        "run_command",
        "format",
        json!({"command":"/bin/sh","args":["-c","printf two > source.txt"]}),
    )?;
    assert_eq!(result["result"]["verificationBinding"]["stable"], false);
    let request = agent.next(&id)?;
    assert_eq!(request["verificationFreshness"]["status"], "stale");
    agent.submit(&id,json!({"sessionId":id,"step":request["step"],"status":"act","plan":"Verify after formatting","action":{"tool":"run_command","args":{"command":"/bin/sh","args":["-c","cat source.txt"]}}}))?;
    fs::remove_file(w.0.join("source.txt"))?;
    std::os::unix::fs::symlink("/etc/passwd", w.0.join("source.txt"))?;
    let request = agent.next(&id)?;
    assert_eq!(request["verificationFreshness"]["status"], "unavailable");
    assert_eq!(request["verificationFreshness"]["passed"], false);
    let done=agent.submit(&id,json!({"sessionId":id,"step":request["step"],"status":"done","plan":"Explain limitation","action":null,"outcome":"partial","summary":"Input replaced; fresh verification unavailable"}))?;
    assert_eq!(done["outcome"], "partial");
    agent.close()?;
    Ok(())
}

#[test]
#[cfg(unix)]
fn managed_script_verification_binding_survives_restart() -> Result<()> {
    let w = Workspace::new()?;
    let mut agent = Agent::new(&w.0, &["/bin/sh"])?;
    let id = start(&mut agent, true, true)?;
    assert_eq!(
        tool(
            &mut agent,
            &id,
            "write_script",
            "script",
            json!({"path":"check.sh","content":"exit 0\n","expectedHash":"missing"})
        )?["ok"],
        true
    );
    let checked = tool(
        &mut agent,
        &id,
        "run_script",
        "check",
        json!({"path":"check.sh","command":"/bin/sh","args":[]}),
    )?;
    assert_eq!(checked["result"]["verificationBinding"]["boundFiles"], 1);
    assert_eq!(
        checked["result"]["verificationBinding"]["inputs"][0]["kind"],
        "script"
    );
    assert_eq!(
        checked["result"]["verificationBinding"]["inputDigest"]
            .as_str()
            .unwrap()
            .len(),
        64
    );
    agent.close()?;
    fs::write(
        w.0.join(".codingagentlib-rust")
            .join(format!("{id}-scripts/check.sh")),
        "exit 1\n",
    )?;
    let mut restored = Agent::new(&w.0, &["/bin/sh"])?;
    restored.dispatch(json!({"op":"resume","session":id}))?;
    let request = restored.next(&id)?;
    assert_eq!(request["verificationFreshness"]["status"], "stale");
    assert_eq!(
        request["verificationFreshness"]["changed"][0]["kind"],
        "script"
    );
    restored.close()?;
    Ok(())
}

#[test]
fn structured_edit_batch_is_all_or_nothing_and_hash_guarded() -> Result<()> {
    let w = Workspace::new()?;
    let original = "one two\r\n🧪 unchanged\r\n";
    fs::write(w.0.join("source.txt"), original)?;
    let mut agent = Agent::new(&w.0, &[])?;
    let id = start(&mut agent, true, false)?;
    let source = tool(
        &mut agent,
        &id,
        "read_file",
        "read",
        json!({"path":"source.txt"}),
    )?;
    let old = source["result"]["hash"].clone();
    let bad = tool(
        &mut agent,
        &id,
        "apply_edits",
        "bad",
        json!({"path":"source.txt","expectedHash":old,"edits":[{"find":"one","replacement":"ONE"},{"find":"missing","replacement":"bad"}]}),
    )?;
    assert_eq!(bad["ok"], false);
    assert_eq!(fs::read_to_string(w.0.join("source.txt"))?, original);
    assert!(!w
        .0
        .join(".codingagentlib-rust")
        .join(format!("{id}-backups"))
        .exists());
    let result = tool(
        &mut agent,
        &id,
        "apply_edits",
        "good",
        json!({"path":"source.txt","expectedHash":old,"edits":[{"find":"one","replacement":"two"},{"find":"two","replacement":"three"}]}),
    )?;
    assert_eq!(result["ok"], true);
    assert_eq!(result["result"]["replacements"], 2);
    assert_eq!(
        fs::read_to_string(w.0.join("source.txt"))?,
        "two three\r\n🧪 unchanged\r\n"
    );
    let stale = tool(
        &mut agent,
        &id,
        "apply_edits",
        "stale",
        json!({"path":"source.txt","expectedHash":old,"edits":[{"find":"two","replacement":"lost"}]}),
    )?;
    assert_eq!(stale["ok"], false);
    let readonly = start(&mut agent, false, false)?;
    assert_eq!(
        tool(
            &mut agent,
            &readonly,
            "apply_edits",
            "denied",
            json!({"path":"source.txt","expectedHash":result["result"]["hash"],"edits":[{"find":"two","replacement":"bad"}]})
        )?["ok"],
        false
    );
    assert_eq!(
        fs::read_to_string(w.0.join("source.txt"))?,
        "two three\r\n🧪 unchanged\r\n"
    );
    agent.close()?;
    Ok(())
}
