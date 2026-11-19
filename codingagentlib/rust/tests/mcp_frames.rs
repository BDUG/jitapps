use codingagentlib::{mcp_stdio::frame_kind, Result};
use serde_json::Value;

#[test]
fn shared_mcp_frame_conformance() -> Result<()> {
    let cases: Value = serde_json::from_str(include_str!("../../conformance/mcp-frames-v1.json"))?;
    for case in cases["cases"].as_array().unwrap() {
        let result = frame_kind(&case["frame"]);
        if case["valid"] == true {
            assert_eq!(result?, case["kind"].as_str().unwrap(), "{}", case["name"]);
        } else {
            assert!(result.is_err(), "{}", case["name"]);
        }
    }
    Ok(())
}

#[test]
fn shared_mcp_tool_result_conformance() -> Result<()> {
    use codingagentlib::{
        core::UncertainToolCall,
        create_agent,
        extensions::{mcp_tools, McpTransport, McpTrust},
        CancelHandle, CoreOptions,
    };
    use serde_json::json;
    use std::sync::{Arc, Mutex};
    struct Peer {
        reply: Value,
    }
    impl McpTransport for Peer {
        fn request(&mut self, method: &str, _: Value, _: &CancelHandle) -> Result<Value> {
            Ok(if method == "tools/list" {
                json!({"tools":[{"name":"echo","inputSchema":{"type":"object"}}]})
            } else {
                self.reply.clone()
            })
        }
    }
    let host = create_agent(CoreOptions::new(|_, _| Ok(Value::Null)))?;
    let cancel = host.cancel_handle();
    let cases: Value = serde_json::from_str(include_str!("../../conformance/mcp-frames-v1.json"))?;
    for case in cases["toolResults"].as_array().unwrap() {
        let transport = Arc::new(Mutex::new(Peer {
            reply: case["result"].clone(),
        }));
        let trust: McpTrust = Arc::new(Mutex::new(|_: &Value, _: &Value| Ok(true)));
        let mut tools = mcp_tools(transport, trust, &cancel)?;
        let result = (tools[0].execute)(&json!({}), &json!({}), &cancel);
        if case["valid"] == true {
            assert_eq!(result?, case["result"], "{}", case["name"]);
        } else {
            assert!(
                result
                    .unwrap_err()
                    .downcast_ref::<UncertainToolCall>()
                    .is_some(),
                "{}",
                case["name"]
            );
        }
    }
    Ok(())
}

#[cfg(unix)]
mod subprocess {
    use super::*;
    use codingagentlib::{
        create_agent, extensions::McpTransport, mcp_stdio::StdioMcp, CancelHandle, CoreOptions,
    };
    use serde_json::json;
    use std::{
        path::Path,
        time::{Duration, Instant},
    };

    fn peer(mode: &str, timeout: Duration, cancel: &CancelHandle) -> Result<StdioMcp> {
        let path =
            Path::new(env!("CARGO_MANIFEST_DIR")).join("../conformance/fixtures/mcp_server.py");
        StdioMcp::spawn("python3", &[path.to_str().unwrap(), mode], timeout, cancel)
    }

    #[test]
    fn notifications_and_unsupported_client_requests_do_not_consume_the_reply() -> Result<()> {
        let host = create_agent(CoreOptions::new(|_, _| Ok(Value::Null)))?;
        let cancel = host.cancel_handle();
        let mut transport = peer("normal", Duration::from_secs(2), &cancel)?;
        assert_eq!(
            transport.request("tools/list", json!({}), &cancel)?,
            json!({"tools":[]})
        );
        assert_eq!(
            transport.request("ping", json!({}), &cancel)?,
            json!({"alive":true})
        );
        transport.close();
        Ok(())
    }

    #[test]
    fn malformed_peers_close_without_accepting_later_calls() -> Result<()> {
        let host = create_agent(CoreOptions::new(|_, _| Ok(Value::Null)))?;
        let cancel = host.cancel_handle();
        for mode in [
            "missing-result",
            "both-results",
            "wrong-id",
            "invalid-notification",
            "invalid-error",
            "unicode-overflow",
        ] {
            let mut transport = peer(mode, Duration::from_secs(2), &cancel)?;
            assert!(
                transport.request("tools/list", json!({}), &cancel).is_err(),
                "{mode}"
            );
            assert!(
                transport
                    .request("ping", json!({}), &cancel)
                    .unwrap_err()
                    .to_string()
                    .contains("closed"),
                "{mode}"
            );
        }
        Ok(())
    }

    #[test]
    fn remote_errors_are_recoverable_and_integral_ids_correlate() -> Result<()> {
        let host = create_agent(CoreOptions::new(|_, _| Ok(Value::Null)))?;
        let cancel = host.cancel_handle();
        let mut transport = peer("tool-error", Duration::from_secs(2), &cancel)?;
        assert!(transport
            .request("tools/list", json!({}), &cancel)
            .unwrap_err()
            .to_string()
            .contains("Rejected arguments"));
        assert_eq!(
            transport.request("ping", json!({}), &cancel)?,
            json!({"alive":true})
        );
        let mut numeric = peer("numeric-id", Duration::from_secs(2), &cancel)?;
        assert_eq!(
            numeric.request("tools/list", json!({}), &cancel)?,
            json!({"tools":[]})
        );
        Ok(())
    }

    #[test]
    fn notifications_do_not_extend_request_deadlines() -> Result<()> {
        let host = create_agent(CoreOptions::new(|_, _| Ok(Value::Null)))?;
        let cancel = host.cancel_handle();
        let mut transport = peer("notification-timeout", Duration::from_millis(300), &cancel)?;
        let started = Instant::now();
        assert!(transport
            .request("tools/list", json!({}), &cancel)
            .unwrap_err()
            .to_string()
            .contains("timed out"));
        assert!(started.elapsed() < Duration::from_secs(2));
        assert!(transport
            .request("ping", json!({}), &cancel)
            .unwrap_err()
            .to_string()
            .contains("closed"));
        Ok(())
    }
}
