//! Read-only Rust UI with tools, follow-ups and explicit snapshot import/export.
//! cargo run --example ui -- /absolute/workspace
use codingagentlib::{Agent, EmbeddedAgent, RunOptions, ToolPermission};
use serde_json::{json, Value};
use std::{
    collections::BTreeMap,
    io::{Read, Write},
    net::{TcpListener, TcpStream},
    path::{Path, PathBuf},
    sync::{Arc, Mutex},
    thread,
    time::Duration,
};
#[derive(Default)]
struct Ui {
    running: bool,
    stop_requested: bool,
    events: Vec<Value>,
    result: Value,
    snapshot: Value,
    tools: Vec<Value>,
    agent: Option<EmbeddedAgent>,
    cancel: Option<codingagentlib::CancelHandle>,
    native_cancel: Option<codingagentlib::CancelHandle>,
}
fn operand(value: &str) -> (&str, u64) {
    value
        .rsplit_once(" @")
        .and_then(|(text, offset)| {
            offset
                .parse::<u64>()
                .ok()
                .map(|offset| (text.trim(), offset))
        })
        .unwrap_or((value.trim(), 0))
}
fn demo_model(r: &Value) -> codingagentlib::Result<Value> {
    let events = r["events"].as_array().unwrap();
    let boundary = events.iter().rposition(|e| e["kind"] == "user");
    let goal = boundary
        .and_then(|i| events[i]["value"]["text"].as_str())
        .unwrap_or_else(|| r["goal"].as_str().unwrap_or("list"))
        .trim();
    let tail = &events[boundary.map(|i| i + 1).unwrap_or(0)..];
    let observed = tail.iter().rev().find(|e| e["kind"] == "observation");
    let mut value = json!({"sessionId":r["sessionId"],"step":r["step"],"plan":"Inspect actual workspace data using a registered read-only tool","action":null});
    if let Some(event) = observed {
        if event["value"]["ok"] == true {
            value["status"] = json!("done");
            value["summary"]=json!("Read-only demo operation completed. Inspect the observed result; no AI provider was called.");
        } else {
            value["status"] = json!("ask");
            value["question"]=json!("The operation failed. Reply with list, read <relative-path>, or search <text> to try another approach.");
        }
        return Ok(value);
    }
    if goal.eq_ignore_ascii_case("ask") {
        value["status"] = json!("ask");
        value["question"] =
            json!("Which operation? Reply list, read <relative-path>, or search <text>.");
        return Ok(value);
    }
    let (tool, args) = if let Some(path) = goal.strip_prefix("read ") {
        {
            let (path, offset) = operand(path);
            ("workspace_read", json!({"path":path,"offset":offset}))
        }
    } else if let Some(query) = goal.strip_prefix("search ") {
        {
            let (query, offset) = operand(query);
            ("workspace_search", json!({"query":query,"offset":offset}))
        }
    } else {
        (
            "workspace_list",
            json!({"offset":goal.strip_prefix("list ").and_then(|v|v.parse::<u64>().ok()).unwrap_or(0)}),
        )
    };
    if !r["tools"]
        .as_array()
        .unwrap()
        .iter()
        .any(|t| t["name"] == tool)
    {
        value["status"] = json!("ask");
        value["question"]=json!("That tool is disabled. Enable it in Tools or reply with an operation whose tool is enabled.");
    } else {
        value["status"] = json!("act");
        value["action"] = json!({"tool":tool,"args":args});
    }
    Ok(value)
}
fn build_agent(root: &Path, state: Arc<Mutex<Ui>>) -> codingagentlib::Result<EmbeddedAgent> {
    let mut native = Agent::new(root, &[])?;
    let session = native.start("Read-only Rust UI tools", &RunOptions::default())?;
    state.lock().map_err(|_| "UI lock failed")?.native_cancel = Some(native.cancel_handle());
    let native = Arc::new(Mutex::new(native));
    let mut agent =
        EmbeddedAgent::new(json!({"workspace":root,"mode":"read-only deterministic demo"}));
    for (name, native_name, description) in [
        (
            "workspace_list",
            "list_files",
            "List files; args offset?/limit?",
        ),
        (
            "workspace_read",
            "read_file",
            "Read UTF-8 file with SHA-256; args path, offset?/limit?",
        ),
        (
            "workspace_search",
            "search_text",
            "Literal source search; args query, offset?/limit?",
        ),
    ] {
        let native = native.clone();
        let session = session.clone();
        agent.add_tool(name,description,ToolPermission::Read,move|args,ctx|{if ctx.cancel.is_cancelled(){return Err("Cancelled".into());}let mut runtime=native.lock().map_err(|_|"Native runtime lock failed")?;runtime.dispatch(json!({"op":"resume","session":session}))?;if ctx.cancel.is_cancelled(){return Err("Cancelled".into());}let observation=runtime.dispatch(json!({"op":"tool","session":session,"tool":native_name,"callId":ctx.call_id,"args":args}))?;if observation["ok"]!=true{return Err(observation["error"].to_string().into());}Ok(observation["result"].clone())})?;
    }
    let event_cancel = agent.cancel_handle();
    let weak = Arc::downgrade(&state);
    agent.on_event(move |event| {
        let state = weak.upgrade().ok_or("UI closed")?;
        let mut ui = state.lock().map_err(|_| "UI lock failed")?;
        if ui.stop_requested {
            event_cancel.cancel();
        }
        ui.events.push(event.clone());
        if ui.events.len() > 200 {
            ui.events.remove(0);
        }
        Ok(())
    });
    agent.before_finish(|_, snapshot| {
        Ok(snapshot["events"]
            .as_array()
            .unwrap()
            .iter()
            .rev()
            .find(|e| e["kind"] == "observation")
            .map(|e| e["value"]["ok"] == true)
            .unwrap_or(false))
    });
    Ok(agent)
}
fn start(root: PathBuf, state: Arc<Mutex<Ui>>, input: Value) {
    thread::spawn(move || {
        let previous = state.lock().unwrap().agent.take();
        let resume = input["resume"] == true;
        let restore = input.get("snapshot");
        let built = match previous {
            Some(agent) => Ok(agent),
            None => build_agent(&root, state.clone()),
        };
        match built {
            Ok(mut agent) => {
                state.lock().unwrap().cancel = Some(agent.cancel_handle());
                let result = if let Some(snapshot) = restore {
                    agent
                        .restore(snapshot, &RunOptions::default())
                        .map(|_| json!({"status":"restored"}))
                } else {
                    let budget = input["maxSteps"].as_u64().unwrap_or(500) as usize;
                    let goal = input["goal"].as_str().unwrap_or("");
                    if resume {
                        agent.resume(goal, budget, demo_model)
                    } else {
                        agent.run(
                            goal,
                            &RunOptions {
                                max_steps: Some(budget),
                                ..Default::default()
                            },
                            demo_model,
                        )
                    }
                };
                let snapshot = agent.snapshot().unwrap_or(Value::Null);
                let mut ui = state.lock().unwrap();
                if restore.is_some() {
                    ui.events = snapshot["events"]
                        .as_array()
                        .cloned()
                        .unwrap_or_default()
                        .into_iter()
                        .rev()
                        .take(200)
                        .collect::<Vec<_>>();
                    ui.events.reverse();
                }
                ui.snapshot = snapshot;
                ui.tools = agent.list_tools();
                ui.agent = Some(agent);
                ui.result = match result {
                    Ok(v) => v,
                    Err(e) => json!({"status":"error","error":e.to_string()}),
                };
                ui.running = false;
                ui.cancel = None;
            }
            Err(e) => {
                let mut ui = state.lock().unwrap();
                ui.running = false;
                ui.cancel = None;
                ui.result = json!({"status":"error","error":e.to_string()});
            }
        }
    });
}
fn respond(stream: &mut TcpStream, status: &str, mime: &str, body: &str) {
    let header=format!("HTTP/1.1 {status}\r\nContent-Type: {mime}\r\nContent-Length: {}\r\nCache-Control: no-store\r\nX-Content-Type-Options: nosniff\r\nContent-Security-Policy: default-src 'none'; script-src 'nonce-rust-example'; style-src 'nonce-rust-example'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'\r\nConnection: close\r\n\r\n",body.len());
    let _ = stream.write_all(header.as_bytes());
    let _ = stream.write_all(body.as_bytes());
}
fn serve(
    stream: &mut TcpStream,
    base: &str,
    root: &Path,
    state: Arc<Mutex<Ui>>,
) -> codingagentlib::Result<()> {
    stream.set_read_timeout(Some(Duration::from_secs(5)))?;
    let mut bytes = Vec::new();
    let mut buffer = [0u8; 4096];
    let (head, offset) = loop {
        let count = stream.read(&mut buffer)?;
        if count == 0 {
            return Ok(());
        }
        bytes.extend_from_slice(&buffer[..count]);
        if let Some(i) = bytes.windows(4).position(|v| v == b"\r\n\r\n") {
            break (String::from_utf8(bytes[..i].to_vec())?, i + 4);
        }
        if bytes.len() > 16000 {
            return Err("Headers too large".into());
        }
    };
    let mut lines = head.lines();
    let request = lines
        .next()
        .unwrap_or("")
        .split_whitespace()
        .collect::<Vec<_>>();
    if request.len() != 3 {
        return Err("Invalid request".into());
    }
    let mut headers = BTreeMap::new();
    for line in lines {
        let (k, v) = line.split_once(':').ok_or("Invalid header")?;
        if headers
            .insert(k.to_lowercase(), v.trim().to_owned())
            .is_some()
        {
            return Err("Duplicate headers are not accepted".into());
        }
    }
    if headers.get("host").map(String::as_str) != Some(base.trim_start_matches("http://")) {
        respond(
            stream,
            "403 Forbidden",
            "text/plain",
            "Use the printed loopback URL",
        );
        return Ok(());
    }
    if request[0] == "POST"
        && (headers.get("origin").map(String::as_str) != Some(base)
            || headers.get("x-agent-request").map(String::as_str) != Some("1"))
    {
        respond(stream, "403 Forbidden", "text/plain", "Use the example UI");
        return Ok(());
    }
    let input = if request[0] == "POST" {
        if headers.contains_key("transfer-encoding")
            || !headers
                .get("content-type")
                .map(|v| v.starts_with("application/json"))
                .unwrap_or(false)
        {
            return Err("Use application/json with Content-Length".into());
        }
        let length = headers
            .get("content-length")
            .ok_or("Content-Length required")?
            .parse::<usize>()?;
        if length > 8_000_000 {
            return Err("Snapshot/request exceeds 8 MB".into());
        }
        while bytes.len() - offset < length {
            let count = stream.read(&mut buffer)?;
            if count == 0 {
                return Err("Incomplete body".into());
            }
            bytes.extend_from_slice(&buffer[..count]);
        }
        serde_json::from_slice::<Value>(&bytes[offset..offset + length])?
    } else {
        Value::Null
    };
    match (request[0], request[1]) {
        ("GET", "/") => respond(
            stream,
            "200 OK",
            "text/html; charset=utf-8",
            include_str!("ui.html"),
        ),
        ("GET", "/state") => {
            let ui = state.lock().unwrap();
            respond(stream,"200 OK","application/json",&json!({"running":ui.running,"events":ui.events,"result":ui.result,"workspace":root,"session":ui.snapshot["id"],"sessionStatus":ui.snapshot["status"],"tools":ui.tools}).to_string());
        }
        ("GET", "/snapshot") => respond(
            stream,
            "200 OK",
            "application/json",
            &state.lock().unwrap().snapshot.to_string(),
        ),
        ("POST", "/stop") => {
            let mut ui = state.lock().unwrap();
            ui.stop_requested = true;
            if let Some(cancel) = &ui.cancel {
                cancel.cancel();
            }
            if let Some(cancel) = &ui.native_cancel {
                cancel.cancel();
            }
            respond(stream, "200 OK", "application/json", "{}");
        }
        ("POST", "/tools") => {
            let mut ui = state.lock().unwrap();
            if ui.running {
                return Err("Stop the run before changing tools".into());
            }
            let agent = ui.agent.as_mut().ok_or("No agent")?;
            agent.set_tool_enabled(
                input["name"].as_str().ok_or("Tool name required")?,
                input["enabled"]
                    .as_bool()
                    .ok_or("enabled must be boolean")?,
            )?;
            ui.tools = agent.list_tools();
            respond(stream, "200 OK", "application/json", "{}");
        }
        ("POST", "/run" | "/restore") => {
            let mut ui = state.lock().unwrap();
            if ui.running {
                return Err("A run is already active".into());
            }
            if request[1] == "/run" {
                let goal = input["goal"].as_str().ok_or("Goal required")?;
                let budget = input["maxSteps"].as_u64().unwrap_or(500);
                if goal.len() > 4000
                    || (!(input["resume"] == true) && goal.trim().is_empty())
                    || !(1..=500).contains(&budget)
                {
                    return Err("Provide a goal up to 4000 bytes and a 1–500 step budget".into());
                }
                if input["resume"] == true
                    && !matches!(ui.snapshot["status"].as_str(), Some("paused" | "waiting"))
                {
                    return Err("Resume requires a waiting or paused session".into());
                }
            } else if !input["snapshot"].is_object() {
                return Err("Snapshot object required".into());
            }
            ui.running = true;
            ui.stop_requested = false;
            if input["resume"] != true && request[1] != "/restore" {
                ui.events.clear();
            }
            ui.result = Value::Null;
            drop(ui);
            start(root.to_path_buf(), state, input);
            respond(stream, "200 OK", "application/json", "{}");
        }
        _ => respond(stream, "404 Not Found", "text/plain", "Not found"),
    };
    Ok(())
}
fn main() -> codingagentlib::Result<()> {
    let root = PathBuf::from(
        std::env::args()
            .nth(1)
            .ok_or("Usage: cargo run --example ui -- /absolute/workspace")?,
    )
    .canonicalize()?;
    if !root.is_dir() {
        return Err("Workspace must be a directory".into());
    }
    let listener = TcpListener::bind("127.0.0.1:0")?;
    let base = format!("http://{}", listener.local_addr()?);
    let state = Arc::new(Mutex::new(Ui::default()));
    let agent = build_agent(&root, state.clone())?;
    {
        let mut ui = state.lock().unwrap();
        ui.tools = agent.list_tools();
        ui.agent = Some(agent);
    }
    println!("Native Rust agent demo: {base}");
    println!("Read-only deterministic model; no paid provider. Press Ctrl+C to exit.");
    for stream in listener.incoming() {
        let mut stream = stream?;
        let base = base.clone();
        let root = root.clone();
        let state = state.clone();
        thread::spawn(move || {
            if let Err(error) = serve(&mut stream, &base, &root, state) {
                respond(
                    &mut stream,
                    "400 Bad Request",
                    "text/plain",
                    &error.to_string(),
                );
            }
        });
    }
    Ok(())
}
