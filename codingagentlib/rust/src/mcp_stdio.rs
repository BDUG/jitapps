//! Optional explicit MCP JSON-RPC subprocess transport; never invokes a shell.
use crate::{extensions::McpTransport, CancelHandle, Result};
use serde_json::{json, Value};
use std::{
    io::{BufRead, BufReader, Read, Write},
    path::Path,
    process::{Child, ChildStdin, Command, Stdio},
    sync::mpsc,
    time::{Duration, Instant},
};

/// Validate a JSON-RPC envelope before distinguishing replies from server traffic.
pub fn frame_kind(frame: &Value) -> Result<&'static str> {
    let object = frame.as_object().ok_or("Invalid MCP JSON-RPC frame")?;
    if frame["jsonrpc"] != "2.0" {
        return Err("Invalid MCP JSON-RPC frame".into());
    }
    let integer = |value: &Value| {
        value
            .as_f64()
            .is_some_and(|n| n.is_finite() && n.fract() == 0.0 && n.abs() <= 9007199254740991.0)
    };
    let identity = |value: &Value| value.is_null() || value.is_string() || integer(value);
    if object.contains_key("method") {
        if frame["method"].as_str().is_none_or(|s| s.is_empty())
            || object.contains_key("result")
            || object.contains_key("error")
            || object.get("id").is_some_and(|v| !identity(v))
            || object
                .get("params")
                .is_some_and(|v| !v.is_object() && !v.is_array())
        {
            return Err("Invalid MCP JSON-RPC request".into());
        }
        return Ok(if object.contains_key("id") {
            "request"
        } else {
            "notification"
        });
    }
    if object.get("id").is_none_or(|v| !identity(v))
        || object.contains_key("result") == object.contains_key("error")
        || object.contains_key("params")
    {
        return Err("Invalid MCP JSON-RPC response".into());
    }
    if let Some(error) = object.get("error") {
        if !error.is_object() || error["message"].as_str().is_none() || !integer(&error["code"]) {
            return Err("Invalid MCP JSON-RPC error".into());
        }
    }
    Ok("response")
}

pub struct StdioMcp {
    child: Child,
    input: ChildStdin,
    receive: mpsc::Receiver<std::result::Result<Value, String>>,
    sequence: u64,
    timeout: Duration,
    closed: bool,
}
impl StdioMcp {
    pub fn spawn(
        command: &str,
        args: &[&str],
        timeout: Duration,
        cancel: &CancelHandle,
    ) -> Result<Self> {
        if command.is_empty()
            || command.contains('\0')
            || timeout.is_zero()
            || timeout > Duration::from_secs(600)
        {
            return Err("Use a command and timeout of at most 600 seconds".into());
        }
        let requested = Path::new(command);
        let executable = if requested.components().count() > 1 && !requested.exists() {
            requested
                .file_name()
                .and_then(|v| v.to_str())
                .ok_or("Invalid MCP executable")?
        } else {
            command
        };
        let mut child = Command::new(executable)
            .args(args)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .spawn()?;
        let input = child.stdin.take().ok_or("Missing MCP stdin")?;
        let output = child.stdout.take().ok_or("Missing MCP stdout")?;
        let (send, receive) = mpsc::sync_channel(64);
        std::thread::spawn(move || {
            let mut reader = BufReader::new(output);
            loop {
                let mut line = String::new();
                let result = reader.by_ref().take(8000001).read_line(&mut line);
                match result {
                    Ok(0) => {
                        let _ =
                            send.send(Err("MCP process exited; inspect uncertain calls".into()));
                        break;
                    }
                    Ok(_) => {
                        if line.len() > 8000000 {
                            let _ = send.send(Err("MCP response exceeds 8 MB".into()));
                            break;
                        }
                        match serde_json::from_str::<Value>(&line) {
                            Ok(frame) => match frame_kind(&frame) {
                                Ok("notification") => continue,
                                Ok(_) => {
                                    if send.send(Ok(frame)).is_err() {
                                        break;
                                    }
                                }
                                Err(error) => {
                                    let _ = send.send(Err(error.to_string()));
                                    break;
                                }
                            },
                            Err(e) => {
                                let _ = send.send(Err(e.to_string()));
                                break;
                            }
                        }
                    }
                    Err(e) => {
                        let _ = send.send(Err(e.to_string()));
                        break;
                    }
                }
            }
        });
        let mut transport = Self {
            child,
            input,
            receive,
            sequence: 0,
            timeout,
            closed: false,
        };
        let result=transport.request("initialize",json!({"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"codingagentlib","version":"1.0.0"}}),cancel)?;
        if result["protocolVersion"] != "2025-03-26" {
            return Err("MCP version mismatch".into());
        }
        writeln!(
            transport.input,
            "{}",
            json!({"jsonrpc":"2.0","method":"notifications/initialized","params":{}})
        )?;
        transport.input.flush()?;
        Ok(transport)
    }
    pub fn close(&mut self) {
        if self.closed {
            return;
        }
        self.closed = true;
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}
impl McpTransport for StdioMcp {
    fn request(&mut self, method: &str, params: Value, cancel: &CancelHandle) -> Result<Value> {
        if self.closed {
            return Err("MCP transport closed".into());
        }
        if cancel.is_cancelled() {
            return Err("MCP request cancelled".into());
        }
        self.sequence += 1;
        let id = self.sequence;
        let frame = json!({"jsonrpc":"2.0","id":id,"method":method,"params":params});
        frame_kind(&frame)?;
        if let Err(error) = writeln!(self.input, "{}", frame).and_then(|_| self.input.flush()) {
            self.close();
            return Err(error.into());
        }
        let start = Instant::now();
        loop {
            if cancel.is_cancelled() || start.elapsed() >= self.timeout {
                self.close();
                return Err("MCP request cancelled/timed out; outcome may be uncertain".into());
            }
            match self.receive.recv_timeout(Duration::from_millis(25)) {
                Ok(Ok(frame)) => {
                    if frame_kind(&frame)? == "request" {
                        if let Err(error) = writeln!(self.input, "{}", json!({"jsonrpc":"2.0","id":frame["id"],"error":{"code":-32601,"message":"Client method not supported"}})).and_then(|_| self.input.flush()) {
                            self.close();
                            return Err(error.into());
                        }
                        continue;
                    }
                    if frame["jsonrpc"] != "2.0" || frame["id"].as_f64() != Some(id as f64) {
                        self.close();
                        return Err("MCP response identity mismatch".into());
                    }
                    if let Some(error) = frame.get("error") {
                        return Err(error["message"]
                            .as_str()
                            .unwrap_or("MCP RPC error")
                            .to_owned()
                            .into());
                    }
                    return frame
                        .get("result")
                        .cloned()
                        .ok_or_else(|| "Missing MCP result".into());
                }
                Ok(Err(error)) => {
                    self.close();
                    return Err(error.into());
                }
                Err(mpsc::RecvTimeoutError::Timeout) => continue,
                Err(_) => {
                    self.close();
                    return Err("MCP output disconnected".into());
                }
            }
        }
    }
}
impl Drop for StdioMcp {
    fn drop(&mut self) {
        self.close();
    }
}
