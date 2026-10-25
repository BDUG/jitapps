//! Native Rust coding agent. No Python, Node, worker process or HTTP server is required.
//! Model callbacks are supplied by the host. Commands require an explicit allowlist and
//! session permission, and run with host OS permissions (not in a sandbox).
mod runtime;
mod tools;
use serde_json::{json, Value};
use std::path::Path;
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc,
};
pub type Result<T> = std::result::Result<T, Box<dyn std::error::Error + Send + Sync>>;
#[derive(Default)]
pub struct RunOptions {
    pub allow_edits: bool,
    pub allow_commands: bool,
    pub max_steps: Option<usize>,
}
#[derive(Clone)]
pub struct CancelHandle(Arc<AtomicBool>);
impl CancelHandle {
    pub fn cancel(&self) {
        self.0.store(true, Ordering::SeqCst);
    }
    pub fn is_cancelled(&self) -> bool {
        self.0.load(Ordering::SeqCst)
    }
}
pub struct Agent {
    pub(crate) runtime: runtime::Runtime,
    pub(crate) cancel: CancelHandle,
}
impl Agent {
    pub fn new(workspace: impl AsRef<Path>, commands: &[&str]) -> Result<Self> {
        Ok(Self {
            runtime: runtime::Runtime::new(workspace.as_ref(), commands)?,
            cancel: CancelHandle(Arc::new(AtomicBool::new(false))),
        })
    }
    /// Compatibility constructor. The interpreter argument is ignored; no worker is spawned.
    #[deprecated(note = "Use Agent::new(workspace, commands); Rust now executes natively")]
    pub fn spawn(_python: &str, workspace: impl AsRef<Path>, commands: &[&str]) -> Result<Self> {
        Self::new(workspace, commands)
    }
    pub fn cancel_handle(&self) -> CancelHandle {
        self.cancel.clone()
    }
    pub fn health(&mut self) -> Result<Value> {
        Ok(self.runtime.health())
    }
    pub fn start(&mut self, goal: &str, options: &RunOptions) -> Result<String> {
        if goal.trim().is_empty() {
            return Err("Provide a goal".into());
        }
        self.cancel.0.store(false, Ordering::SeqCst);
        self.runtime.start(goal, options)
    }
    pub fn next(&mut self, session: &str) -> Result<Value> {
        self.runtime.next(session, &self.cancel)
    }
    pub fn submit(&mut self, session: &str, response: Value) -> Result<Value> {
        self.runtime.submit(session, response, &self.cancel)
    }
    pub fn cancel(&mut self, session: &str) -> Result<Value> {
        self.cancel.cancel();
        self.runtime.pause(session)?;
        self.runtime.session(session)
    }
    pub fn dispatch(&mut self, params: Value) -> Result<Value> {
        self.runtime.dispatch(params, &self.cancel)
    }
    pub fn request(&mut self, method: &str, params: Value) -> Result<Value> {
        let session = || params["session_id"].as_str().ok_or("Missing session_id");
        match method {
            "dispatch" => self.dispatch(params),
            "agent_start" => {
                let options = RunOptions {
                    allow_edits: params["allow_edits"] == true,
                    allow_commands: params["allow_commands"] == true,
                    ..Default::default()
                };
                let id = self.start(params["goal"].as_str().ok_or("Missing goal")?, &options)?;
                self.runtime.session(&id)
            }
            "agent_next" => self.next(session()?),
            "agent_submit" => self.submit(session()?, params["response"].clone()),
            "close" => {
                self.runtime.pause_all()?;
                Ok(json!({"closed":true}))
            }
            _ => Err(format!("Unsupported method: {method}").into()),
        }
    }
    pub fn run<F>(&mut self, goal: &str, options: &RunOptions, mut model: F) -> Result<Value>
    where
        F: FnMut(&Value) -> Result<Value>,
    {
        let budget = options.max_steps.unwrap_or(500);
        if !(1..=100000).contains(&budget) {
            return Err("Use a step budget between 1 and 100000".into());
        }
        let session = self.start(goal, options)?;
        for _ in 0..budget {
            if self.cancel.is_cancelled() {
                self.runtime.pause(&session)?;
                return Ok(json!({"status":"paused","reason":"cancelled","sessionId":session}));
            }
            let request = self.next(&session)?;
            let response = match model(&request) {
                Ok(v) => v,
                Err(e) => {
                    self.runtime.pause(&session)?;
                    return Err(e);
                }
            };
            if self.cancel.is_cancelled() {
                self.runtime.pause(&session)?;
                return Ok(json!({"status":"paused","reason":"cancelled","sessionId":session}));
            }
            let result = self.submit(&session, response)?;
            if result["status"] != "continue" && result["status"] != "retry" {
                return Ok(result);
            }
        }
        self.runtime.pause(&session)?;
        Ok(json!({"status":"paused","reason":"step_budget","sessionId":session}))
    }
    pub fn close(mut self) -> Result<()> {
        self.runtime.pause_all()
    }
}
impl Drop for Agent {
    fn drop(&mut self) {
        self.cancel.cancel();
        let _ = self.runtime.pause_all();
    }
}
