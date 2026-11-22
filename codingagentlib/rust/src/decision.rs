//! Optional decision-model support (assist / gate) for ReAct runs.
use crate::{core::Model, CancelHandle, Result};
use serde_json::{json, Value};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum DecisionMode {
    #[default]
    Auto,
    Off,
    Assist,
    Gate,
}

impl DecisionMode {
    pub fn as_str(self) -> &'static str {
        match self {
            DecisionMode::Auto => "auto",
            DecisionMode::Off => "off",
            DecisionMode::Assist => "assist",
            DecisionMode::Gate => "gate",
        }
    }
}

pub fn resolve_mode(has_model: bool, mode: DecisionMode) -> Result<DecisionMode> {
    match mode {
        DecisionMode::Auto => Ok(if has_model {
            DecisionMode::Assist
        } else {
            DecisionMode::Off
        }),
        DecisionMode::Off => Ok(DecisionMode::Off),
        other => {
            if !has_model {
                return Err(format!(
                    "decision_model callback is required when decision_mode is {}",
                    other.as_str()
                )
                .into());
            }
            Ok(other)
        }
    }
}

pub fn build_decision_request(request: &Value, candidate: Option<&Value>) -> Value {
    let tools: Vec<Value> = request["tools"]
        .as_array()
        .map(|arr| {
            arr.iter()
                .filter_map(|t| t.get("name").cloned())
                .collect()
        })
        .unwrap_or_default();
    let mut payload = json!({
        "format": "codingagentlib/decision-request-v1",
        "sessionId": request["sessionId"],
        "step": request["step"],
        "goal": request["goal"],
        "context": request["context"],
        "availableTools": tools,
        "phase": if candidate.is_some() { "gate" } else { "advise" },
    });
    if let Some(cand) = candidate {
        payload["candidate"] = cand.clone();
    }
    payload
}

pub fn normalize_decision(raw: Value) -> Result<Value> {
    let value = if let Some(text) = raw.as_str() {
        serde_json::from_str::<Value>(text)?
    } else {
        raw
    };
    let obj = value
        .as_object()
        .ok_or("Decision model must return a JSON object")?;
    let approve = obj.get("approve").and_then(Value::as_bool).unwrap_or(true);
    let stop = obj
        .get("stopRecommended")
        .and_then(Value::as_bool)
        .unwrap_or(false);
    let strategy = obj
        .get("strategy")
        .and_then(Value::as_str)
        .unwrap_or("")
        .trim()
        .to_owned();
    let focus = obj
        .get("focus")
        .and_then(Value::as_str)
        .unwrap_or("")
        .trim()
        .to_owned();
    let rationale = obj
        .get("rationale")
        .and_then(Value::as_str)
        .unwrap_or("")
        .trim()
        .to_owned();
    let risks: Vec<Value> = obj
        .get("risks")
        .and_then(Value::as_array)
        .map(|arr| {
            arr.iter()
                .filter_map(|v| v.as_str().map(|s| Value::String(s.to_owned())))
                .take(8)
                .collect()
        })
        .unwrap_or_default();
    Ok(json!({
        "approve": approve,
        "stopRecommended": stop,
        "strategy": strategy,
        "focus": focus,
        "rationale": rationale,
        "risks": risks,
    }))
}

pub fn consult_decision_model(
    model: &mut Model,
    request: &Value,
    candidate: Option<&Value>,
    cancel: &CancelHandle,
) -> Result<Value> {
    let payload = build_decision_request(request, candidate);
    let raw = model(&payload, cancel)?;
    normalize_decision(raw)
}
