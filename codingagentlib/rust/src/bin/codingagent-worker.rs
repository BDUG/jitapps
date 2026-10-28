//! JSON-lines host bridge for the native agent. No provider credentials or Python.
use codingagentlib::{Agent, Result};
use serde_json::{json, Value};
use std::io::{BufRead, Read, Write};
use std::sync::{mpsc, Arc, Mutex};
fn reply(output: &Arc<Mutex<std::io::Stdout>>, id: Value, result: Result<Value>) {
    let frame = match result {
        Ok(value) => json!({"protocol":"codingagentlib/1","id":id,"ok":true,"result":value}),
        Err(error) => {
            json!({"protocol":"codingagentlib/1","id":id,"ok":false,"error":{"message":error.to_string()}})
        }
    };
    if let Ok(mut stream) = output.lock() {
        let _ = serde_json::to_writer(&mut *stream, &frame);
        let _ = stream.write_all(b"\n");
        let _ = stream.flush();
    }
}
fn main() -> Result<()> {
    let mut arguments = std::env::args().skip(1);
    let mut workspace = None;
    let mut commands = Vec::new();
    while let Some(arg) = arguments.next() {
        match arg.as_str() {
            "--workspace" => workspace = Some(arguments.next().ok_or("Missing workspace")?),
            "--allow-command" => commands.push(arguments.next().ok_or("Missing executable")?),
            "--help" | "-h" => {
                eprintln!("codingagent-worker --workspace PATH [--allow-command EXECUTABLE]...");
                return Ok(());
            }
            _ => return Err(format!("Unknown option: {arg}").into()),
        }
    }
    let mut agent = Agent::new(
        workspace.ok_or("--workspace is required")?,
        &commands.iter().map(String::as_str).collect::<Vec<_>>(),
    )?;
    let cancel = agent.cancel_handle();
    let output = Arc::new(Mutex::new(std::io::stdout()));
    let worker_output = output.clone();
    let (sender, receiver) = mpsc::channel::<Value>();
    let thread = std::thread::spawn(move || {
        for frame in receiver {
            let method = frame["method"].as_str().unwrap_or("");
            let result = agent.request(method, frame["params"].clone());
            reply(&worker_output, frame["id"].clone(), result);
            if method == "close" {
                break;
            }
        }
    });
    let stdin = std::io::stdin();
    let mut input = stdin.lock();
    loop {
        let mut line = String::new();
        // Bound frames before allocating unlimited input; an overlong frame closes transport.
        let bytes = Read::take(&mut input, 16_000_001).read_line(&mut line)?;
        if bytes == 0 {
            break;
        }
        if bytes > 16_000_000 {
            reply(&output, Value::Null, Err("Frame exceeds 16 MB".into()));
            break;
        }
        let frame: Value = match serde_json::from_str(&line) {
            Ok(value) => value,
            Err(error) => {
                reply(&output, Value::Null, Err(error.into()));
                continue;
            }
        };
        if frame["protocol"] != "codingagentlib/1"
            || !(frame["id"].is_string() || frame["id"].is_u64())
            || !frame["params"].is_object()
        {
            reply(
                &output,
                frame["id"].clone(),
                Err("Invalid worker frame".into()),
            );
            continue;
        }
        if frame["method"] == "interrupt" {
            cancel.cancel();
            reply(
                &output,
                frame["id"].clone(),
                Ok(json!({"cancelSignalled":true})),
            );
        } else if sender.send(frame).is_err() {
            break;
        }
    }
    cancel.cancel();
    drop(sender);
    thread.join().map_err(|_| "Native worker panicked")?;
    Ok(())
}
