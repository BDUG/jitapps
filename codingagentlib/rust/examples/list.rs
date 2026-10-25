use codingagentlib::{Agent, RunOptions};
use serde_json::json;
fn main() -> codingagentlib::Result<()> {
    let path = std::env::args()
        .nth(1)
        .ok_or("Usage: cargo run --example list -- /workspace/path")?;
    let mut agent = Agent::new(path, &[])?;
    let result=agent.run("List workspace files",&RunOptions::default(),|r|{
        let done=r["events"].as_array().unwrap().iter().any(|e|e["kind"]=="observation");
        Ok(json!({"sessionId":r["sessionId"],"step":r["step"],"status":if done{"done"}else{"act"},"plan":"List files","action":if done{serde_json::Value::Null}else{json!({"tool":"list_files","args":{}})},"summary":"Listed workspace files without changes"}))
    })?;
    println!("{}", result);
    agent.close()?;
    Ok(())
}
