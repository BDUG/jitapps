//! Bounded validation of the canonical protocol schema subset.
use crate::{contracts_data::CONTRACTS, Result};
use serde_json::Value;

pub const PROTOCOL: &str = "codingagentlib/sdk-v1";
pub fn schema(name: &str) -> Result<Value> {
    let data: Value = serde_json::from_str(CONTRACTS)?;
    data["contracts"]
        .get(name)
        .cloned()
        .ok_or_else(|| "Unknown contract".into())
}
pub fn check_schema(value: &Value) -> Result<()> {
    check(value, 0)
}
fn check(value: &Value, depth: usize) -> Result<()> {
    let obj = value.as_object().ok_or("Invalid schema")?;
    if depth > 32 {
        return Err("Schema nesting limit".into());
    }
    for key in obj.keys() {
        if ![
            "type",
            "properties",
            "required",
            "additionalProperties",
            "items",
            "minItems",
            "maxItems",
            "minLength",
            "maxLength",
            "minimum",
            "maximum",
            "enum",
            "const",
            "anyOf",
            "description",
            "title",
            "default",
        ]
        .contains(&key.as_str())
        {
            return Err(format!("Unsupported schema keyword: {key}").into());
        }
    }
    if let Some(kind) = obj.get("type") {
        if ![
            "object", "array", "string", "integer", "number", "boolean", "null",
        ]
        .contains(&kind.as_str().unwrap_or(""))
        {
            return Err("Unsupported schema type".into());
        }
    }
    if let Some(required) = obj.get("required") {
        if required
            .as_array()
            .is_none_or(|a| a.iter().any(|v| !v.is_string()))
        {
            return Err("Invalid required fields".into());
        }
    }
    if let Some(v) = obj.get("additionalProperties") {
        if !v.is_boolean() {
            return Err("additionalProperties must be boolean".into());
        }
    }
    if let Some(properties) = obj.get("properties") {
        for child in properties.as_object().ok_or("Invalid properties")?.values() {
            check(child, depth + 1)?;
        }
    }
    if let Some(items) = obj.get("items") {
        check(items, depth + 1)?;
    }
    if let Some(variants) = obj.get("anyOf") {
        let variants = variants.as_array().ok_or("Invalid anyOf")?;
        if variants.is_empty() {
            return Err("Invalid anyOf".into());
        }
        for child in variants {
            check(child, depth + 1)?;
        }
    }
    for key in [
        "minItems",
        "maxItems",
        "minLength",
        "maxLength",
        "minimum",
        "maximum",
    ] {
        if let Some(v) = obj.get(key) {
            if !v.is_number() {
                return Err("Invalid schema bound".into());
            }
        }
    }
    if let Some(v) = obj.get("enum") {
        if v.as_array().is_none_or(|a| a.is_empty()) {
            return Err("Invalid enum".into());
        }
    }
    Ok(())
}
pub fn validate(schema: &Value, value: &Value) -> Result<()> {
    valid(schema, value, 0)
}
fn valid(s: &Value, v: &Value, depth: usize) -> Result<()> {
    if depth > 64 {
        return Err("Value nesting limit".into());
    }
    if let Some(a) = s["anyOf"].as_array() {
        if !a.iter().any(|c| valid(c, v, depth + 1).is_ok()) {
            return Err("No matching variant".into());
        }
    }
    if s.get("const").is_some_and(|c| c != v) {
        return Err("Unexpected constant".into());
    }
    if s["enum"].as_array().is_some_and(|a| !a.contains(v)) {
        return Err("Invalid enum".into());
    }
    if let Some(kind) = s["type"].as_str() {
        let matches = match kind {
            "object" => v.is_object(),
            "array" => v.is_array(),
            "string" => v.is_string(),
            "number" => v.is_number(),
            "integer" => v
                .as_f64()
                .is_some_and(|n| n.fract() == 0.0 && n.abs() <= 9007199254740991.0),
            "boolean" => v.is_boolean(),
            "null" => v.is_null(),
            _ => false,
        };
        if !matches {
            return Err(format!("Expected {kind}").into());
        }
    }
    if let Some(obj) = v.as_object() {
        if let Some(required) = s["required"].as_array() {
            for k in required {
                if !obj.contains_key(k.as_str().ok_or("Invalid required")?) {
                    return Err("Missing required field".into());
                }
            }
        }
        for (k, item) in obj {
            if let Some(child) = s["properties"].get(k) {
                valid(child, item, depth + 1)?;
            } else if s["additionalProperties"] == false {
                return Err("Unknown field".into());
            }
        }
    }
    if let Some(array) = v.as_array() {
        bounds(array.len() as f64, s, "minItems", "maxItems")?;
        if let Some(child) = s.get("items") {
            for item in array {
                valid(child, item, depth + 1)?;
            }
        }
    }
    if let Some(text) = v.as_str() {
        bounds(text.chars().count() as f64, s, "minLength", "maxLength")?;
    }
    if let Some(number) = v.as_f64() {
        bounds(number, s, "minimum", "maximum")?;
    }
    Ok(())
}
fn bounds(n: f64, s: &Value, min: &str, max: &str) -> Result<()> {
    if n < s[min].as_f64().unwrap_or(f64::NEG_INFINITY)
        || n > s[max].as_f64().unwrap_or(f64::INFINITY)
    {
        return Err("Value bounds".into());
    }
    Ok(())
}
pub fn contract(name: &str, value: &Value) -> Result<()> {
    validate(&schema(name)?, value)?;
    if name == "ModelResponse" {
        let payload = if value["status"] == "act" {
            value["action"].is_object()
        } else {
            value["action"].is_null()
                && value[if value["status"] == "ask" {
                    "question"
                } else {
                    "summary"
                }]
                .as_str()
                .is_some_and(|s| !s.trim().is_empty())
        };
        if !payload || value["plan"].as_str().is_none_or(|s| s.trim().is_empty()) {
            return Err("Invalid response status payload".into());
        }
    }
    if name == "ToolResult"
        && if value["ok"] == true {
            value.get("result").is_none() || value.get("error").is_some()
        } else {
            value.get("error").is_none() || value.get("result").is_some()
        }
    {
        return Err("Invalid result variant".into());
    }
    Ok(())
}
