#![cfg(windows)]
use codingagentlib::{Agent, Result, RunOptions};
use serde_json::json;
use std::{
    fs,
    path::PathBuf,
    time::{SystemTime, UNIX_EPOCH},
};

struct Workspace(PathBuf);
impl Drop for Workspace {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}

#[test]
fn windows_pathext_resolution_and_existing_path_permissions() -> Result<()> {
    let root = Workspace(std::env::temp_dir().join(format!(
        "agent-resolution-{}-{}",
        std::process::id(),
        SystemTime::now().duration_since(UNIX_EPOCH)?.as_nanos()
    )));
    fs::create_dir_all(&root.0)?;
    let obsolete = root.0.join("missing").join("cmd");
    let mut agent = Agent::new(&root.0, &[obsolete.to_str().unwrap()])?;
    let id = agent.start(
        "Windows executable resolution",
        &RunOptions {
            allow_commands: true,
            ..Default::default()
        },
    )?;
    let result = agent.dispatch(json!({"op":"tool","session":id,"tool":"run_command","callId":"fallback","args":{"command":obsolete,"args":["/d","/c","echo resolved"]}}))?;
    assert_eq!(result["ok"], true, "{result}");
    assert_eq!(result["result"]["exitCode"], 0);
    assert_eq!(
        result["result"]["stdout"].as_str().unwrap().trim(),
        "resolved"
    );
    let actual = PathBuf::from(result["result"]["resolvedExecutable"].as_str().unwrap());
    assert!(actual.is_file());
    assert_eq!(
        actual
            .extension()
            .unwrap()
            .to_string_lossy()
            .to_ascii_lowercase(),
        "exe"
    );
    // A real cmd.exe at a different path must not be bypassed by omitting .exe.
    let other = root.0.join("other");
    fs::create_dir(&other)?;
    fs::copy(actual, other.join("cmd.exe"))?;
    let denied = agent.dispatch(json!({"op":"tool","session":id,"tool":"run_command","callId":"denied","args":{"command":other.join("cmd"),"args":["/d","/c","echo denied"]}}))?;
    assert_eq!(denied["ok"], false, "{denied}");
    Ok(())
}
