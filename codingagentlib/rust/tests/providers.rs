use codingagentlib::providers::{
    anthropic_model, anthropic_tool_model, gemini_model, gemini_tool_model, ollama_model,
    openai_model, openai_tool_model, parse_provider_response, tool_schemas,
    tool_use_to_react_model, with_retry, ProviderError,
};
use serde_json::{json, Value};

#[test]
fn provider_adapters_and_retry() {
    let mut oa = openai_model(
        "https://api.example.com/v1/chat/completions",
        "gpt-4o",
        "sk-test",
        |_url, _body, _headers| Ok(json!({"choices":[{"message":{"content":"{\"ok\":1}"}}]})),
    )
    .unwrap();
    assert_eq!(oa(&json!({"step":1})).unwrap(), "{\"ok\":1}");

    let mut ant = anthropic_model(
        None,
        "claude-sonnet",
        "sk-ant",
        1024,
        None,
        |_url, _body, _headers| Ok(json!({"content":[{"type":"text","text":"{\"ok\":2}"}]})),
    )
    .unwrap();
    assert_eq!(ant(&json!({"step":1})).unwrap(), "{\"ok\":2}");

    let mut gem = gemini_model(
        None,
        "gemini-2.5-flash",
        "gk",
        |_url, _body, _headers| Ok(json!({"candidates":[{"content":{"parts":[{"text":"{\"ok\":3}"}]}}]})),
    )
    .unwrap();
    assert_eq!(gem(&json!({"step":1})).unwrap(), "{\"ok\":3}");

    let mut oll = ollama_model(None, "qwen2.5-coder", |_url, _body, _headers| {
        Ok(json!({"message":{"content":"{\"ok\":4}"}}))
    })
    .unwrap();
    assert_eq!(oll(&json!({"step":1})).unwrap(), "{\"ok\":4}");

    assert!(openai_model(
        "http://remote.invalid/v1",
        "m",
        "",
        |_, _, _| Ok(json!({})),
    )
    .is_err());

    let mut attempts = 0usize;
    let mut slept = Vec::new();
    let mut retried = with_retry(
        |_payload: &Value| {
            attempts += 1;
            if attempts < 3 {
                Err(ProviderError::transient("transient"))
            } else {
                Ok("recovered".to_string())
            }
        },
        3,
        10,
        |d| slept.push(d.as_millis()),
    )
    .unwrap();
    assert_eq!(retried(&json!({})).unwrap(), "recovered");
    drop(retried);
    assert_eq!(attempts, 3);
    assert_eq!(slept, vec![10, 20]);
}

#[test]
fn tool_schemas_parse_and_react_bridge() {
    let tools = vec![json!({
        "name": "read_file",
        "description": "Read a file",
        "arguments": { "path": "Workspace path", "limit": "Optional integer max lines" }
    })];
    let oa_tools = tool_schemas(&tools, "openai").unwrap();
    assert_eq!(oa_tools[0]["function"]["parameters"]["properties"]["limit"]["type"], "integer");

    let gem_tools = tool_schemas(&tools, "gemini").unwrap();
    assert_eq!(gem_tools[0]["functionDeclarations"][0]["name"], "read_file");

    let parsed = parse_provider_response(
        "anthropic",
        &json!({
            "stop_reason": "tool_use",
            "content": [
                {"type": "thinking", "thinking": "Need to inspect README"},
                {"type": "tool_use", "id": "tu_1", "name": "read_file", "input": {"path": "README.md"}}
            ],
            "usage": {"input_tokens": 12, "output_tokens": 8}
        }),
    )
    .unwrap();
    assert_eq!(parsed["stop_reason"], "tool_use");
    assert_eq!(parsed["tool_calls"][0]["name"], "read_file");
    assert_eq!(parsed["usage"]["input_tokens"], 12);

    let mut oa_tm = openai_tool_model(
        "https://api.example.com/v1/chat/completions",
        "gpt-4o",
        "",
        tools.clone(),
        |_u, _b, _h| {
            Ok(json!({
                "choices": [{
                    "finish_reason": "tool_calls",
                    "message": {
                        "reasoning_content": "Check file",
                        "tool_calls": [{"id":"c1","function":{"name":"read_file","arguments":"{\"path\":\"a.txt\"}"}}]
                    }
                }]
            }))
        },
    )
    .unwrap();
    let mut bridge = tool_use_to_react_model(|msgs| oa_tm(msgs, None, "auto"));
    let react_json: Value = serde_json::from_str(
        &bridge(&json!({"sessionId": "s1", "step": 1})).unwrap(),
    )
    .unwrap();
    assert_eq!(react_json["status"], "act");
    assert_eq!(react_json["action"]["tool"], "read_file");
    assert_eq!(react_json["action"]["args"]["path"], "a.txt");

    let mut ant_tm = anthropic_tool_model(None, "claude-sonnet", "", tools.clone(), 512, None, |_, _, _| {
        Ok(json!({"stop_reason":"end_turn","content":[{"type":"text","text":"All done"}]}))
    })
    .unwrap();
    assert_eq!(ant_tm(&[json!({"role":"user","content":"hi"})], None).unwrap()["stop_reason"], "end_turn");

    let mut gem_tm = gemini_tool_model(None, "gemini-2.5-flash", "", tools, |_, _, _| {
        Ok(json!({"candidates":[{"finishReason":"STOP","content":{"parts":[{"functionCall":{"name":"read_file","args":{"path":"b.txt"}}}]}}]}))
    })
    .unwrap();
    assert_eq!(gem_tm(&[json!({"role":"user","parts":[{"text":"hi"}]})], None).unwrap()["stop_reason"], "tool_use");
}
