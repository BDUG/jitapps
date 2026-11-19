//! Optional host-owned model routing; one bounded provider call per turn.
use crate::{core::Model, Result};
use serde_json::{json, Value};
use std::collections::BTreeMap;

pub fn phase(request: &Value) -> &'static str {
    if request["step"] == 1 {
        return "plan";
    }
    let observation = request["events"]
        .as_array()
        .and_then(|events| {
            events
                .iter()
                .rev()
                .find(|e| e["kind"] == "observation" || e["kind"] == "tool_result")
        })
        .map(|e| &e["value"]);
    if observation.is_some_and(|v| {
        v["ok"] == true
            && ["run_command", "run_script", "read_command_output"]
                .iter()
                .any(|tool| v["tool"] == *tool)
            && v["result"]["exitCode"] == 0
    }) {
        "review"
    } else {
        "code"
    }
}

pub struct ModelMosaic {
    models: BTreeMap<String, Model>,
    routes: BTreeMap<String, String>,
    calls: usize,
    max_calls: usize,
    history: Vec<Value>,
}
impl ModelMosaic {
    pub fn new(
        models: BTreeMap<String, Model>,
        routes: BTreeMap<String, String>,
        max_calls: usize,
    ) -> Result<Self> {
        if models.is_empty()
            || models.len() > 16
            || models.keys().any(String::is_empty)
            || max_calls == 0
            || !routes.contains_key("default")
            || routes.values().any(|id| !models.contains_key(id))
        {
            return Err("Invalid host model mosaic routes or budget".into());
        }
        Ok(Self {
            models,
            routes,
            calls: 0,
            max_calls,
            history: Vec::new(),
        })
    }
    pub fn call(&mut self, request: &Value, cancel: &crate::CancelHandle) -> Result<Value> {
        self.call_role(phase(request), request, cancel)
    }
    pub fn call_role(
        &mut self,
        role: &str,
        request: &Value,
        cancel: &crate::CancelHandle,
    ) -> Result<Value> {
        if cancel.is_cancelled() {
            return Err("Model mosaic cancelled".into());
        }
        if self.calls >= self.max_calls {
            return Err("Mosaic model-call budget exhausted".into());
        }
        let id = self
            .routes
            .get(role)
            .unwrap_or(&self.routes["default"])
            .clone();
        self.calls += 1;
        self.history.push(json!({"call":self.calls,"role":role,"model":id,"sessionId":request["sessionId"],"step":request["step"]}));
        if self.history.len() > 1000 {
            self.history.remove(0);
        }
        self.models.get_mut(&id).unwrap()(request, cancel)
    }
    pub fn inspect(&self) -> Value {
        json!({"format":"codingagentlib/model-mosaic-v1","calls":self.calls,"maxCalls":self.max_calls,"routes":self.routes,"history":self.history})
    }
    pub fn into_model(mut self) -> Model {
        Box::new(move |r, c| self.call(r, c))
    }
}
