//! cargo run --example dynamic_context: deterministic host integration, no provider calls.
use codingagentlib::{ContextRegistry, EmbeddedAgent, Result, RunOptions, ToolPermission};
use serde_json::json;
use std::sync::{
    atomic::{AtomicUsize, Ordering},
    Arc,
};
fn main() -> Result<()> {
    let revision = Arc::new(AtomicUsize::new(1));
    let read = revision.clone();
    let mut sources = ContextRegistry::new(json!({"application":"custom-editor"}));
    sources.add("project","Live editor revision",json!({"type":"object"}),move |_,_|Ok(json!({"revision":read.load(Ordering::SeqCst).to_string(),"data":{"file":"README.md"}})))?;
    let mut agent = EmbeddedAgent::new(serde_json::Value::Null);
    agent.context_provider(move |state, cancel| sources.resolve(state, cancel));
    agent.on_event(|e| {
        println!("{}", e["kind"]);
        Ok(())
    });
    agent.add_tool(
        "refresh",
        "Refresh host state",
        ToolPermission::Read,
        move |_, turn| {
            let expected = turn.context["sources"][0]["revision"].as_str().unwrap();
            if expected != revision.load(Ordering::SeqCst).to_string() {
                return Err("Stale context; refresh and adapt".into());
            }
            revision.fetch_add(1, Ordering::SeqCst);
            Ok(json!({"refreshed":true}))
        },
    )?;
    let result=agent.run("Refresh and inspect the editor",&RunOptions::default(),|r|{let first=r["step"]==1;Ok(json!({"sessionId":r["sessionId"],"step":r["step"],"plan":"Refresh the host then inspect its current context","status":if first{"act"}else{"done"},"action":if first{json!({"tool":"refresh","args":{}})}else{serde_json::Value::Null},"summary":format!("Observed context revision {}",r["context"]["sources"][0]["revision"])}))})?;
    println!("{result}");
    Ok(())
}
