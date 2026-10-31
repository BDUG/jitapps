use codingagentlib::{Agent, Result};
use serde_json::json;
#[test]
fn collaboration_metadata_preserves_reserved_step() -> Result<()> {
    let root = std::env::temp_dir().join(format!(
        "collaboration-{}-{}",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)?
            .as_nanos()
    ));
    std::fs::create_dir_all(&root)?;
    let result = (|| -> Result<()> {
        let mut agent = Agent::new(&root, &[])?;
        let session = agent.dispatch(json!({"op":"start","goal":"Plan","allowCommands":false}))?;
        let id = session["id"].as_str().unwrap();
        let turn = agent.dispatch(json!({"op":"turn","session":id}))?;
        let saved = agent.dispatch(json!({"op":"collaboration_event","session":id,"value":{"format":"codingagentlib/model-collaboration/v1","status":"model_collaboration_round","discussion":[]}}))?;
        assert_eq!(saved["pending"], turn["step"]);
        assert!(saved["events"]
            .as_array()
            .unwrap()
            .iter()
            .all(|event| event["kind"] != "observation"));
        assert!(agent.dispatch(json!({"op":"collaboration_event","session":id,"value":{"format":"codingagentlib/model-collaboration/v1","status":"act"}})).is_err());
        Ok(())
    })();
    let _ = std::fs::remove_dir_all(&root);
    result
}
