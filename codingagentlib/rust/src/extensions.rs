//! Explicit MCP transports, side-effect-free replay and read-only delegation.
use crate::{
    contracts,
    core::{create_agent, CoreOptions, CoreTool, Model, UncertainToolCall},
    CancelHandle, Result, RunOptions,
};
use serde_json::{json, Value};
use std::sync::{Arc, Mutex};
pub trait McpTransport: Send {
    fn request(&mut self, method: &str, params: Value, cancel: &CancelHandle) -> Result<Value>;
}
pub type McpTrust = Arc<Mutex<dyn FnMut(&Value, &Value) -> Result<bool> + Send>>;
pub fn mcp_tools(
    transport: Arc<Mutex<dyn McpTransport>>,
    trust: McpTrust,
    cancel: &CancelHandle,
) -> Result<Vec<CoreTool>> {
    let listing = transport
        .lock()
        .map_err(|_| "MCP transport lock poisoned")?
        .request("tools/list", json!({}), cancel)?;
    if listing
        .get("nextCursor")
        .is_some_and(|v| v.as_str().is_some_and(|s| !s.is_empty()))
    {
        return Err("Provide one complete bounded MCP tool page".into());
    }
    let mut tools = vec![];
    for definition in listing["tools"].as_array().ok_or("Invalid MCP listing")? {
        if !trust.lock().map_err(|_| "MCP trust lock poisoned")?(definition, &Value::Null)? {
            continue;
        }
        contracts::check_schema(&definition["inputSchema"])?;
        let source = definition.clone();
        let transport = transport.clone();
        let trust = trust.clone();
        tools.push(CoreTool::new(json!({"name":source["name"],"version":1,"description":source["description"].as_str().unwrap_or(""),"parameters":source["inputSchema"],"permission":"commands"}),move|args,ctx,cancel|{
            contracts::validate(&source["inputSchema"],args)?;
            if !trust.lock().map_err(|_|"MCP trust lock poisoned")?(&source,ctx)?{return Err("MCP trust revoked".into());}
            let reply=transport.lock().map_err(|_|"MCP transport lock poisoned")?.request("tools/call",json!({"name":source["name"],"arguments":args}),cancel).map_err(|e|Box::new(UncertainToolCall(e.to_string()))as Box<dyn std::error::Error+Send+Sync>)?;
            if !reply.is_object() || !reply["content"].is_array() || reply.get("isError").is_some_and(|v| !v.is_boolean()) {
                return Err(Box::new(UncertainToolCall("Invalid MCP tool result; outcome may be uncertain".to_owned())) as Box<dyn std::error::Error+Send+Sync>);
            }
            if reply["isError"]==true{return Err(format!("MCP tool failed: {}",reply["content"]).into());}Ok(reply)
        }));
    }
    Ok(tools)
}
pub struct McpServer {
    pub tools: Vec<CoreTool>,
    pub authorize: McpTrust,
}
impl McpTransport for McpServer {
    fn request(&mut self, method: &str, params: Value, cancel: &CancelHandle) -> Result<Value> {
        if method == "tools/list" {
            return Ok(
                json!({"tools":self.tools.iter().map(|t|json!({"name":t.definition["name"],"description":t.definition["description"],"inputSchema":t.definition["parameters"]})).collect::<Vec<_>>()}),
            );
        }
        if method != "tools/call" {
            return Err("Unsupported MCP method".into());
        }
        let tool = self
            .tools
            .iter_mut()
            .find(|t| t.definition["name"] == params["name"])
            .ok_or("Unknown MCP tool")?;
        contracts::validate(&tool.definition["parameters"], &params["arguments"])?;
        if cancel.is_cancelled()
            || !self
                .authorize
                .lock()
                .map_err(|_| "MCP trust lock poisoned")?(&params, &Value::Null)?
        {
            return Err("MCP action denied".into());
        }
        match (tool.execute)(&params["arguments"], &params, cancel) {
            Ok(value) => Ok(
                json!({"content":[{"type":"text","text":value.to_string()}],"structuredContent":{"result":value},"isError":false}),
            ),
            Err(e) => Ok(json!({"content":[{"type":"text","text":e.to_string()}],"isError":true})),
        }
    }
}
pub fn replay(snapshot: &Value) -> Result<Value> {
    let events = snapshot["events"].as_array().ok_or("Invalid recording")?;
    let replies = events
        .iter()
        .filter(|e| e["kind"] == "model_response")
        .map(|e| e["value"]["response"].clone())
        .collect::<Vec<_>>();
    let count = replies.len().max(1);
    let mut index = 0;
    let receipts = Arc::new(Mutex::new(
        events
            .iter()
            .filter(|e| e["kind"] == "tool_result")
            .map(|e| e["value"].clone())
            .collect::<std::collections::VecDeque<_>>(),
    ));
    let mut options = CoreOptions::new(move |r, _| {
        let raw = replies.get(index).ok_or("Replay exhausted")?.clone();
        index += 1;
        let mut response = if let Some(text) = raw.as_str() {
            match serde_json::from_str(text) {
                Ok(v) => v,
                Err(_) => return Ok(raw),
            }
        } else {
            raw
        };
        if response.is_object() {
            response["sessionId"] = r["sessionId"].clone();
            response["step"] = r["step"].clone();
        }
        Ok(response)
    });
    options.budgets = json!({"modelCalls":count});
    let names = receipts
        .lock()
        .map_err(|_| "Replay lock")?
        .iter()
        .filter_map(|r| r["tool"].as_str().map(String::from))
        .collect::<std::collections::BTreeSet<_>>();
    for name in names {
        let receipts = receipts.clone();
        let expected = name.clone();
        options.tools.push(CoreTool::new(json!({"name":name,"description":"Recorded mock","permission":"read","parameters":{"type":"object"}}),move|_,_,_|{
            let receipt=receipts.lock().map_err(|_|"Replay lock")?.pop_front().ok_or("Replay receipt exhausted")?;
            if receipt["tool"]!=expected{return Err("Replay tool order mismatch".into());}
            if receipt["ok"]!=true{return Err(receipt["error"]["message"].as_str().unwrap_or("Recorded tool failure").to_owned().into());}
            Ok(receipt["result"].clone())
        }));
    }
    let mut agent = create_agent(options)?;
    let result = agent.run(
        snapshot["goal"].as_str().ok_or("Missing replay goal")?,
        &RunOptions::default(),
    )?;
    Ok(json!({"result":result,"snapshot":agent.snapshot()}))
}
pub type ChildFactory = Box<dyn FnMut() -> Result<CoreOptions> + Send>;
pub fn delegation_tool(name: &str, mut factory: ChildFactory, max_depth: u64) -> Result<CoreTool> {
    if !(1..=8).contains(&max_depth) {
        return Err("Delegation depth must be 1..8".into());
    }
    Ok(CoreTool::new(
        json!({"name":name,"version":1,"description":"Bounded read-only child agent; observations are not proof of completion","permission":"read","parameters":{"type":"object","required":["goal"],"properties":{"goal":{"type":"string","minLength":1}},"additionalProperties":false}}),
        move |args, parent, cancel| {
            let depth = parent["delegationDepth"].as_u64().unwrap_or(0) + 1;
            if depth > max_depth {
                return Err("Delegation depth exhausted".into());
            }
            let mut options = factory()?;
            for tool in &mut options.tools {
                if tool.definition["permission"] != "read" {
                    return Err("Delegated tools must be read-only".into());
                }
                let mut execute = std::mem::replace(
                    &mut tool.execute,
                    Box::new(|_, _, _| Err("Missing delegated tool".into())),
                );
                tool.execute = Box::new(move |args, ctx, cancel| {
                    let mut ctx = ctx.clone();
                    ctx["delegationDepth"] = json!(depth);
                    execute(args, &ctx, cancel)
                });
            }
            options.tenant = parent["sessionId"]
                .as_str()
                .ok_or("Missing parent session")?
                .into();
            let mut model: Model = std::mem::replace(
                &mut options.model,
                Box::new(|_, _| Err("Missing child model".into())),
            );
            let parent_cancel = cancel.clone();
            options.model = Box::new(move |r, child_cancel| {
                if parent_cancel.is_cancelled() {
                    child_cancel.cancel();
                    return Err("Delegation cancelled".into());
                }
                model(r, child_cancel)
            });
            let mut budgets =
                json!({"modelCalls":16,"toolCalls":16,"elapsedMs":60000,"sessionBytes":1000000});
            for (k, v) in options.budgets.as_object().ok_or("Invalid child budgets")? {
                budgets[k] = v.clone();
            }
            options.budgets = budgets;
            let mut child = create_agent(options)?;
            let result = child.run(
                args["goal"].as_str().ok_or("Missing child goal")?,
                &RunOptions::default(),
            )?;
            Ok(
                json!({"format":"codingagentlib/delegation-v1","parentCallId":parent["callId"],"childSessionId":result["sessionId"],"depth":depth,"result":result,"events":child.snapshot()["events"]}),
            )
        },
    ))
}
