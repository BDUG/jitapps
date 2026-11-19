#![cfg(unix)]
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
        let path = std::env::temp_dir().join(format!(
            "agent-resolution-{}-{}",
            std::process::id(),
            SystemTime::now().duration_since(UNIX_EPOCH)?.as_nanos()
        ));
        fs::create_dir_all(&path)?;
        Ok(Self(path))
    }
}
impl Drop for Workspace {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}
fn session(agent: &mut Agent, allow_commands: bool) -> Result<String> {
    agent.start(
        "Resolve executable",
        &RunOptions {
            allow_commands,
            allow_edits: true,
            ..Default::default()
        },
    )
}
fn run(agent: &mut Agent, id: &str, call: &str, command: &str) -> Result<Value> {
    agent.dispatch(json!({"op":"tool","session":id,"tool":"run_command","callId":call,"args":{"command":command,"args":["-c","printf resolved"]}}))
}

#[test]
fn missing_paths_resolve_without_granting_new_permissions() -> Result<()> {
    let w = Workspace::new()?;
    let missing = w.0.join("missing/sh").to_string_lossy().into_owned();
    let mut agent = Agent::new(&w.0, &[&missing])?;
    let id = session(&mut agent, true)?;
    for (call, command) in [
        ("configured", missing.as_str()),
        ("name", "sh"),
        ("requested", "/obsolete/agent-install/sh"),
    ] {
        let response = run(&mut agent, &id, call, command)?;
        assert_eq!(response["ok"], true, "{response}");
        assert_eq!(response["result"]["stdout"], "resolved");
        assert_eq!(response["result"]["command"], command);
        assert!(
            PathBuf::from(response["result"]["resolvedExecutable"].as_str().unwrap()).is_file()
        );
    }
    let other = w.0.join("other");
    fs::create_dir(&other)?;
    fs::copy("/bin/sh", other.join("sh"))?;
    assert_eq!(
        run(
            &mut agent,
            &id,
            "unapproved-existing",
            other.join("sh").to_str().unwrap()
        )?["ok"],
        false
    );
    assert_eq!(
        run(
            &mut agent,
            &id,
            "unapproved-name",
            "/missing/no-such-resolution-tool"
        )?["ok"],
        false
    );
    let denied = session(&mut agent, false)?;
    assert_eq!(run(&mut agent, &denied, "denied", &missing)?["ok"], false);
    Ok(())
}

#[test]
fn pinned_executable_removed_after_startup_uses_path_and_scripts_share_resolution() -> Result<()> {
    let w = Workspace::new()?;
    let executable = w.0.join("sh");
    let target = w.0.join("old-versioned-shell-target");
    fs::copy("/bin/sh", &target)?;
    std::os::unix::fs::symlink(&target, &executable)?;
    let mut agent = Agent::new(&w.0, &[executable.to_str().unwrap()])?;
    let id = session(&mut agent, true)?;
    fs::remove_file(&target)?;
    let response = run(&mut agent, &id, "removed", executable.to_str().unwrap())?;
    assert_eq!(response["ok"], true, "{response}");
    assert_eq!(response["result"]["stdout"], "resolved");
    let write = agent.dispatch(json!({"op":"tool","session":id,"tool":"write_script","callId":"script","args":{"path":"check.sh","content":"printf script-resolved","expectedHash":"missing"}}))?;
    assert_eq!(write["ok"], true, "{write}");
    let response = agent.dispatch(json!({"op":"tool","session":id,"tool":"run_script","callId":"run-script","args":{"path":"check.sh","command":"/missing/sh"}}))?;
    assert_eq!(response["ok"], true, "{response}");
    assert_eq!(response["result"]["stdout"], "script-resolved");
    Ok(())
}

#[test]
fn missing_after_search_is_an_observation_and_existing_nonexecutable_is_not_replaced() -> Result<()>
{
    let w = Workspace::new()?;
    let executable = w.0.join("unique-resolution-executable");
    fs::copy("/bin/sh", &executable)?;
    let mut agent = Agent::new(&w.0, &[executable.to_str().unwrap()])?;
    let id = session(&mut agent, true)?;
    fs::remove_file(&executable)?;
    let failed = run(&mut agent, &id, "missing", executable.to_str().unwrap())?;
    assert_eq!(failed["ok"], false);
    assert!(failed["error"].as_str().unwrap().contains("not found"));
    assert!(agent.next(&id)?["events"]
        .as_array()
        .unwrap()
        .iter()
        .any(|event| event["kind"] == "observation" && event["value"]["ok"] == false));
    agent.close()?;
    let nonexecutable = w.0.join("sh");
    fs::write(&nonexecutable, "not executable")?;
    assert!(Agent::new(&w.0, &[nonexecutable.to_str().unwrap()]).is_err());
    Ok(())
}
