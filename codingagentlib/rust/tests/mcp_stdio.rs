#![cfg(unix)]
use codingagentlib::{
    create_agent, extensions::McpTransport, mcp_stdio::StdioMcp, CoreOptions, Result,
};
use serde_json::{json, Value};
use std::time::Duration;

#[test]
fn literal_argv_mcp_initialization_notifications_and_rpc() -> Result<()> {
    let host = create_agent(CoreOptions::new(|_, _| Ok(Value::Null)))?;
    let cancel = host.cancel_handle();
    let script = r#"while IFS= read -r frame; do
case "$frame" in
*'"method":"initialize"'*) printf '%s\n' '{"jsonrpc":"2.0","id":1,"result":{"protocolVersion":"2025-03-26"}}';;
*'"method":"tools/list"'*) printf '%s\n' '{"jsonrpc":"2.0","id":2,"result":{"tools":[]}}';;
*'"method":"ping"'*) printf '%s\n' '{"jsonrpc":"2.0","id":3,"result":{}}';;
esac
done"#;
    let mut transport =
        StdioMcp::spawn("/bin/sh", &["-c", script], Duration::from_secs(2), &cancel)?;
    assert!(
        transport.request("tools/list", json!({}), &cancel)?["tools"]
            .as_array()
            .unwrap()
            .is_empty()
    );
    assert_eq!(transport.request("ping", json!({}), &cancel)?, json!({}));
    transport.close();
    Ok(())
}
