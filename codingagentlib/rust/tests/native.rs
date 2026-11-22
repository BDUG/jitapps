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




#[test]
fn revision_conflict_recovery_preserves_external_work_and_receipts() -> Result<()> {
    let w=Workspace::new()?;
    fs::write(w.0.join("source.txt"),"external edits")?;
    let mut agent=Agent::new(&w.0,&[])?;
    let session=start(&mut agent,true,false)?;
    for (i,name) in ["write_file","replace_text","apply_edits","delete_file"].iter().enumerate() {
        let args=json!({"path":"source.txt","content":"lost","expectedHash":"missing","find":"external","replacement":"lost","edits":[{"find":"external","replacement":"lost"}]});
        let receipt=tool(&mut agent,&session,name,&format!("conflict{i}"),args.clone())?;
        assert_eq!(receipt["ok"],false);
        assert_eq!(receipt["code"],"file_revision_conflict");
        assert_eq!(receipt["conflict"]["path"],"source.txt");
        assert_eq!(receipt["conflict"]["expectedHash"],"missing");
        assert_eq!(receipt["conflict"]["requiresRead"],true);
        assert_eq!(receipt["recovery"]["automaticRetry"],false);
        assert_eq!(receipt["recovery"]["nextAction"],json!({"tool":"read_file","args":{"path":"source.txt"}}));
        assert_eq!(fs::read_to_string(w.0.join("source.txt"))?,"external edits");
        assert_eq!(tool(&mut agent,&session,name,&format!("conflict{i}"),args)?,receipt);
    }
    let read=tool(&mut agent,&session,"read_file","refresh",json!({"path":"source.txt"}))?;
    let adapted=tool(&mut agent,&session,"replace_text","adapt",json!({"path":"source.txt","find":"external edits","replacement":"external edits plus requested change","expectedHash":read["result"]["hash"]}))?;
    assert_eq!(adapted["ok"],true);
    assert_eq!(fs::read_to_string(w.0.join("source.txt"))?,"external edits plus requested change");
    agent.close()?;
    let mut agent=Agent::new(&w.0,&[])?;
    let saved=agent.dispatch(json!({"op":"session","session":session}))?;
    assert_eq!(saved["receipts"]["conflict0"]["observation"]["recovery"]["strategy"],"read_then_replan");
    Ok(())
}

#[test]
fn core_agent_script_and_program_tools() -> Result<()> {
    use codingagentlib::{core::CoreOptions, create_agent, program_tools, script_tools, Runtime};
    use std::sync::{Arc, Mutex};
    let w = Workspace::new()?;
    let mut rt = Runtime::new(&w.0, &["/bin/sh"])?;
    let sid = rt.start(
        "CoreAgent scripts and programs",
        &RunOptions {
            allow_edits: true,
            allow_commands: true,
            max_steps: Some(10),
        },
    )?;
    let shared = Arc::new(Mutex::new(rt));
    let mut tools = script_tools(shared.clone(), sid.clone());
    assert!(tools
        .iter()
        .find(|t| t.definition["name"] == "write_script")
        .unwrap()
        .definition["parameters"]["properties"]
        .get("content")
        .is_some());
    tools.extend(
        program_tools(shared.clone(), sid.clone())
            .into_iter()
            .filter(|t| t.definition["name"] == "run_command"),
    );
    let mut options = CoreOptions::new(|req, _| {
        let obs: Vec<_> = req["events"]
            .as_array()
            .unwrap()
            .iter()
            .filter(|e| e["kind"] == "tool_result")
            .collect();
        if obs.is_empty() {
            Ok(json!({
                "sessionId": req["sessionId"],
                "step": req["step"],
                "status": "act",
                "plan": "Write script",
                "action": {"tool": "write_script", "args": {"path": "hi.sh", "content": "printf rust-script", "expectedHash": "missing"}}
            }))
        } else if obs.len() == 1 {
            assert_eq!(obs[0]["value"]["ok"], true);
            Ok(json!({
                "sessionId": req["sessionId"],
                "step": req["step"],
                "status": "act",
                "plan": "Run script",
                "action": {"tool": "run_script", "args": {"path": "hi.sh", "command": "/bin/sh"}}
            }))
        } else if obs.len() == 2 {
            assert_eq!(obs[1]["value"]["result"]["stdout"], "rust-script");
            Ok(json!({
                "sessionId": req["sessionId"],
                "step": req["step"],
                "status": "act",
                "plan": "Run command",
                "action": {"tool": "run_command", "args": {"command": "/bin/sh", "args": ["-c", "printf rust-prog"]}}
            }))
        } else if obs.len() == 3 {
            assert_eq!(obs[2]["value"]["result"]["stdout"], "rust-prog");
            Ok(json!({
                "sessionId": req["sessionId"],
                "step": req["step"],
                "status": "act",
                "plan": "Delete script",
                "action": {"tool": "delete_script", "args": {"path": "hi.sh"}}
            }))
        } else {
            assert_eq!(obs[3]["value"]["result"]["deleted"], "hi.sh");
            Ok(json!({
                "sessionId": req["sessionId"],
                "step": req["step"],
                "status": "done",
                "plan": "Done",
                "action": null,
                "summary": "Executed script and program tools via Rust CoreAgent"
            }))
        }
    });
    options.tools = tools;
    let mut core = create_agent(options)?;
    let res = core.run(
        "Run script and program",
        &RunOptions {
            allow_edits: true,
            allow_commands: true,
            max_steps: None,
        },
    )?;
    assert_eq!(res["status"], "complete");
    Ok(())
}

#[test]
fn read_files_paging_and_batch_budget() -> Result<()> {
    let dir = Workspace::new()?;
    fs::write(dir.0.join("a.txt"), "A".repeat(32000))?;
    fs::write(dir.0.join("b.txt"), "B".repeat(32000))?;
    fs::write(dir.0.join("c.txt"), "C".repeat(100))?;
    let mut agent = Agent::new(&dir.0, &[])?;
    let sess = agent.start("Batch read", &RunOptions::default())?;
    let res = agent.dispatch(json!({
        "op": "tool",
        "session": sess,
        "callId": "read-files-1",
        "tool": "read_files",
        "args": {
            "files": [
                { "path": "a.txt", "limit": 32000 },
                { "path": "b.txt", "limit": 32000 },
                { "path": "c.txt" }
            ]
        }
    }))?;
    let obs = &res["result"];
    assert_eq!(obs["truncated"], true);
    assert_eq!(obs["totalCharacters"], 64000);
    assert_eq!(obs["files"][0]["text"].as_str().unwrap().len(), 32000);
    assert_eq!(obs["files"][1]["text"].as_str().unwrap().len(), 32000);
    assert_eq!(obs["files"][2]["skipped"], true);
    agent.close()?;
    Ok(())
}




#[test]
fn discovery_symbols_image_parallel_restore_and_git_tools() -> Result<()> {
    let dir = Workspace::new()?;
    fs::create_dir_all(dir.0.join("src"))?;
    fs::write(
        dir.0.join("src/lib.rs"),
        "pub fn greet_user() {}\nstruct Helper;\n",
    )?;
    fs::write(dir.0.join("src/app.js"), "export function runApp() {}\n")?;
    // Minimal 1x1 PNG header/bytes for read_image test
    let png_bytes: Vec<u8> = vec![
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
    ];
    fs::write(dir.0.join("pixel.png"), &png_bytes)?;

    let mut agent = Agent::new(&dir.0, &[])?;
    let s = start(&mut agent, true, false)?;

    // find_files
    let found = tool(
        &mut agent,
        &s,
        "find_files",
        "find-rs",
        json!({"pattern":"*.rs","path":"src"}),
    )?;
    assert_eq!(found["result"]["total"], 1);
    assert_eq!(found["result"]["files"][0], "src/lib.rs");

    // grep_search (case-insensitive + include filter)
    let grep = tool(
        &mut agent,
        &s,
        "grep_search",
        "grep-fn",
        json!({"query":"GREET_USER","caseSensitive":false,"include":"*.rs"}),
    )?;
    assert_eq!(grep["result"]["total"], 1);
    assert_eq!(grep["result"]["matches"][0]["path"], "src/lib.rs");

    // code_symbols
    let syms = tool(
        &mut agent,
        &s,
        "code_symbols",
        "syms",
        json!({"query":"greet"}),
    )?;
    assert_eq!(syms["result"]["total"], 1);
    assert_eq!(syms["result"]["symbols"][0]["kind"], "fn");
    assert_eq!(syms["result"]["symbols"][0]["name"], "greet_user");

    // parallel_read
    let par = tool(
        &mut agent,
        &s,
        "parallel_read",
        "par-1",
        json!({"requests":[
            {"tool":"read_file","args":{"path":"src/app.js"}},
            {"tool":"find_files","args":{"pattern":"*.js"}}
        ]}),
    )?;
    assert_eq!(par["result"]["count"], 2);
    assert_eq!(par["result"]["results"][0]["ok"], true);
    assert_eq!(par["result"]["results"][1]["result"]["total"], 1);

    // read_image
    let img = tool(
        &mut agent,
        &s,
        "read_image",
        "img-1",
        json!({"path":"pixel.png"}),
    )?;
    assert_eq!(img["result"]["mimeType"], "image/png");
    assert_eq!(img["result"]["bytes"], png_bytes.len());
    assert!(img["result"]["dataUrl"]
        .as_str()
        .unwrap()
        .starts_with("data:image/png;base64,"));

    // restore_file after edit
    let orig = tool(
        &mut agent,
        &s,
        "read_file",
        "read-orig",
        json!({"path":"src/app.js"}),
    )?;
    let orig_hash = orig["result"]["hash"].as_str().unwrap().to_owned();
    let edited = tool(
        &mut agent,
        &s,
        "write_file",
        "edit-app",
        json!({"path":"src/app.js","content":"// overwritten\n","expectedHash":orig_hash}),
    )?;
    let edited_hash = edited["result"]["hash"].as_str().unwrap().to_owned();
    let restored = tool(
        &mut agent,
        &s,
        "restore_file",
        "restore-app",
        json!({"path":"src/app.js","expectedHash":edited_hash}),
    )?;
    assert_eq!(restored["result"]["restored"], true);
    let after_restore = tool(
        &mut agent,
        &s,
        "read_file",
        "read-restored",
        json!({"path":"src/app.js"}),
    )?;
    assert_eq!(after_restore["result"]["text"], "export function runApp() {}\n");

    // git_status / git_diff / git_log in a real temp git repo
    if std::process::Command::new("git")
        .arg("--version")
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
    {
        let init = std::process::Command::new("git")
            .args(["-C", dir.0.to_str().unwrap(), "init"])
            .output()?;
        if init.status.success() {
            let _ = std::process::Command::new("git")
                .args(["-C", dir.0.to_str().unwrap(), "config", "user.email", "t@example.com"])
                .output();
            let _ = std::process::Command::new("git")
                .args(["-C", dir.0.to_str().unwrap(), "config", "user.name", "Test"])
                .output();
            let _ = std::process::Command::new("git")
                .args(["-C", dir.0.to_str().unwrap(), "add", "src/app.js"])
                .output();
            let committed = std::process::Command::new("git")
                .args([
                    "-C",
                    dir.0.to_str().unwrap(),
                    "-c",
                    "commit.gpgsign=false",
                    "commit",
                    "-m",
                    "init",
                ])
                .output()?;

            let gs = tool(&mut agent, &s, "git_status", "gs", json!({}))?;
            assert_eq!(gs["ok"], true);
            assert_eq!(gs["result"]["clean"], false);

            if committed.status.success() {
                let gl = tool(&mut agent, &s, "git_log", "gl", json!({"limit":5}))?;
                assert_eq!(gl["ok"], true);
                assert!(gl["result"]["text"].as_str().unwrap().contains("init"));

                fs::write(dir.0.join("src/app.js"), "export function changed() {}\n")?;
                let gd = tool(
                    &mut agent,
                    &s,
                    "git_diff",
                    "gd",
                    json!({"path":"src/app.js"}),
                )?;
                assert_eq!(gd["ok"], true);
                assert!(gd["result"]["text"].as_str().unwrap().contains("changed"));
            }
        }
    }

    agent.close()?;
    Ok(())
}



#[test]
fn apply_patch_discover_tools_and_interactive_process() -> Result<()> {
    let dir = Workspace::new()?;
    fs::write(dir.0.join("keep.txt"), "alpha\nbeta\ngamma\n")?;
    fs::write(dir.0.join("remove.txt"), "bye\n")?;
    let mut agent = Agent::new(&dir.0, &["cat"])?;
    let s = start(&mut agent, true, true)?;

    // discover_tools
    let disc = tool(
        &mut agent,
        &s,
        "discover_tools",
        "disc",
        json!({"query":"patch"}),
    )?;
    assert_eq!(disc["ok"], true);
    assert!(disc["result"]["tools"]
        .as_array()
        .unwrap()
        .iter()
        .any(|t| t["name"] == "apply_patch"));

    // apply_patch (add + update + delete)
    let patch = "\
*** Begin Patch
*** Add File: sub/new.txt
+hello
+world
*** Update File: keep.txt
@@
 alpha
-beta
+BETA
 gamma
*** Delete File: remove.txt
*** End Patch";
    let patched = tool(&mut agent, &s, "apply_patch", "ap", json!({"patch": patch}))?;
    assert_eq!(patched["ok"], true);
    assert_eq!(fs::read_to_string(dir.0.join("sub/new.txt"))?, "hello\nworld\n");
    assert_eq!(fs::read_to_string(dir.0.join("keep.txt"))?, "alpha\nBETA\ngamma\n");
    assert!(!dir.0.join("remove.txt").exists());

    // start_process + write_stdin + stop_process (using cat)
    let sp = tool(
        &mut agent,
        &s,
        "start_process",
        "sp",
        json!({"command":"cat"}),
    )?;
    assert_eq!(sp["ok"], true);
    let pid = sp["result"]["processId"].as_str().unwrap().to_owned();
    let wr = tool(
        &mut agent,
        &s,
        "write_stdin",
        "ws",
        json!({"processId":pid,"input":"hello-stdin\n","waitMs":200}),
    )?;
    assert_eq!(wr["ok"], true);
    assert_eq!(wr["result"]["running"], true);
    assert!(wr["result"]["stdout"].as_str().unwrap().contains("hello-stdin"));

    let st = tool(
        &mut agent,
        &s,
        "stop_process",
        "stop",
        json!({"processId":pid}),
    )?;
    assert_eq!(st["ok"], true);
    assert_eq!(st["result"]["stopped"], true);

    // scratchpad
    assert_eq!(
        tool(&mut agent, &s, "scratchpad", "sp1", json!({"action":"set","key":"plan_note","value":"step1"}))?["ok"],
        true
    );
    let sp_get = tool(&mut agent, &s, "scratchpad", "sp2", json!({"action":"get","key":"plan_note"}))?;
    assert_eq!(sp_get["result"]["value"], "step1");

    // memory_store + memory_delete
    let mem = tool(&mut agent, &s, "memory_store", "mem1", json!({"text":"temp note"}))?;
    let mem_id = mem["result"]["id"].as_str().unwrap().to_owned();
    let del_mem = tool(&mut agent, &s, "memory_delete", "mem2", json!({"id":mem_id}))?;
    assert_eq!(del_mem["result"]["deleted"], true);

    // workflow_preflight + workflow_save + workflow_history + workflow_run + workflow_status
    let wf_def = json!({"name":"Check","steps":[{"tool":"list_files","args":{}}]});
    let pre = tool(&mut agent, &s, "workflow_preflight", "wp1", json!({"definition":wf_def}))?;
    assert_eq!(pre["result"]["valid"], true);
    assert_eq!(tool(&mut agent, &s, "workflow_save", "ws1", json!({"id":"wf_check","expectedRevision":0,"definition":wf_def}))?["ok"], true);
    let wh = tool(&mut agent, &s, "workflow_history", "wh1", json!({"id":"wf_check"}))?;
    assert_eq!(wh["result"]["total"], 1);
    let wrun = tool(&mut agent, &s, "workflow_run", "wrun1", json!({"id":"wf_check","revision":1}))?;
    let run_id = wrun["result"]["runId"].as_str().unwrap().to_owned();
    let wstat = tool(&mut agent, &s, "workflow_status", "wstat1", json!({"runId":run_id}))?;
    assert_eq!(wstat["result"]["status"], "complete");

    // tool_save + tool_list + tool_read + tool_run
    let ts = tool(
        &mut agent,
        &s,
        "tool_save",
        "ts1",
        json!({"id":"echo_tool","name":"Echo Tool","interpreter":"cat","source":"hello-tool\n","expectedRevision":0}),
    )?;
    assert_eq!(ts["result"]["revision"], 1);
    let tl = tool(&mut agent, &s, "tool_list", "tl1", json!({"query":"echo"}))?;
    assert_eq!(tl["result"]["total"], 1);
    let tr = tool(&mut agent, &s, "tool_read", "tr1", json!({"id":"echo_tool"}))?;
    assert_eq!(tr["result"]["source"], "hello-tool\n");
    let trun = tool(&mut agent, &s, "tool_run", "trun1", json!({"id":"echo_tool"}))?;
    assert_eq!(trun["ok"], true);
    assert_eq!(trun["result"]["toolId"], "echo_tool");
    assert_eq!(trun["result"]["exitCode"], 0);

    agent.close()?;
    Ok(())
}

#[test]
fn code_navigation_diagnostics_and_web_ssrf_guard() -> Result<()> {
    let dir = Workspace::new()?;
    fs::create_dir_all(dir.0.join("src"))?;
    fs::write(
        dir.0.join("src/mod.rs"),
        "pub fn compute_sum(x: i32) -> i32 {\n    x + 1\n}\n\npub fn caller() -> i32 {\n    compute_sum(41)\n}\n",
    )?;
    fs::write(dir.0.join("src/bad.rs"), "fn broken( {\n")?;

    let mut agent = Agent::new(&dir.0, &[])?;
    let s = start(&mut agent, false, false)?;

    // code_definition from call site on line 6 ("    compute_sum(41)")
    let def = tool(
        &mut agent,
        &s,
        "code_definition",
        "cdef",
        json!({"path":"src/mod.rs","line":6,"column":6}),
    )?;
    assert_eq!(def["ok"], true);
    assert_eq!(def["result"]["symbol"], "compute_sum");
    assert_eq!(def["result"]["definitions"][0]["line"], 1);

    // code_references
    let refs = tool(
        &mut agent,
        &s,
        "code_references",
        "cref",
        json!({"path":"src/mod.rs","line":1,"column":8}),
    )?;
    assert_eq!(refs["ok"], true);
    assert_eq!(refs["result"]["total"], 2);

    // code_diagnostics (structural error in bad.rs)
    let diag = tool(
        &mut agent,
        &s,
        "code_diagnostics",
        "cdiag",
        json!({"path":"src/bad.rs"}),
    )?;
    assert_eq!(diag["ok"], true);
    assert!(diag["result"]["total"].as_u64().unwrap() >= 1);

    // web_fetch SSRF / HTTP blocking
    for (idx, bad_url) in [
        "http://example.com",
        "https://localhost/secret",
        "https://127.0.0.1/admin",
        "https://169.254.169.254/latest/meta-data",
    ]
    .iter()
    .enumerate()
    {
        let res = tool(
            &mut agent,
            &s,
            "web_fetch",
            &format!("wf-{idx}"),
            json!({"url": bad_url}),
        )?;
        assert_eq!(res["ok"], false, "expected SSRF block for {bad_url}");
    }

    agent.close()?;
    Ok(())
}
