//! Task DAG checks for native model submissions. Statuses remain planner claims, not proof.
use crate::Result;
use serde_json::Value;
use std::collections::{BTreeMap, BTreeSet};

pub fn latest(events: &Value) -> Option<&Value> {
    events.as_array()?.iter().rev().find_map(|event| {
        if event["kind"] == "assistant" && event["value"]["tasks"].is_array() {
            event["value"].get("tasks")
        } else { None }
    })
}

pub fn validate(tasks: &Value) -> Result<()> {
    let list = tasks.as_array().ok_or("Tasks must be an array")?;
    if list.len() > 30 { return Err("Use up to 30 tasks".into()); }
    let mut by_id = BTreeMap::new();
    let mut active = 0;
    for task in list {
        let id = task["id"].as_str().ok_or("Task IDs must be strings")?;
        let title = task["title"].as_str().ok_or("Task titles must be strings")?;
        if id.is_empty() || id.chars().count() > 80 || title.trim().is_empty() || title.chars().count() > 300 || by_id.insert(id, task).is_some() {
            return Err("Tasks need unique IDs (1–80 characters) and titles (1–300 characters)".into());
        }
        match task["status"].as_str() {
            Some("in_progress") => active += 1,
            Some("pending" | "done" | "blocked") => {},
            _ => return Err("Invalid task status".into()),
        }
        if let Some(value) = task.get("dependsOn") {
            let deps = value.as_array().ok_or("Task dependencies must be unique IDs")?;
            if deps.len() > 30 { return Err("Task dependencies exceed the 30-task budget".into()); }
            let mut unique = BTreeSet::new();
            for dep in deps {
                let dep = dep.as_str().ok_or("Task dependencies must be strings")?;
                if !unique.insert(dep) { return Err("Task dependencies must be unique IDs".into()); }
            }
        }
    }
    if active > 1 { return Err("Only one task may be in progress".into()); }
    fn visit<'a>(id: &'a str, tasks: &BTreeMap<&'a str, &'a Value>, visiting: &mut BTreeSet<&'a str>, done: &mut BTreeSet<&'a str>) -> Result<()> {
        if done.contains(id) { return Ok(()); }
        if !visiting.insert(id) { return Err(format!("Task dependency cycle at {id}").into()); }
        if let Some(deps) = tasks[id].get("dependsOn").and_then(Value::as_array) {
            for dep in deps {
                let dep = dep.as_str().unwrap();
                if dep == id || !tasks.contains_key(dep) { return Err(format!("Unknown or self task prerequisite: {id} -> {dep}").into()); }
                visit(dep, tasks, visiting, done)?;
            }
        }
        visiting.remove(id);done.insert(id);Ok(())
    }
    let mut visiting = BTreeSet::new();let mut done = BTreeSet::new();
    for id in by_id.keys() { visit(id, &by_id, &mut visiting, &mut done)?; }
    for task in list {
        if ["in_progress", "done"].contains(&task["status"].as_str().unwrap()) {
            if let Some(deps) = task.get("dependsOn").and_then(Value::as_array) {
                if deps.iter().any(|dep| by_id[dep.as_str().unwrap()]["status"] != "done") {
                    return Err(format!("Complete task prerequisites before activating or completing {}", task["id"]).into());
                }
            }
        }
    }
    Ok(())
}

pub fn action(tasks: &Value, action: &Value) -> Result<()> {
    validate(tasks)?;
    let list = tasks.as_array().unwrap();
    let dependent = list.iter().any(|task| task.get("dependsOn").and_then(Value::as_array).map(|d| !d.is_empty()).unwrap_or(false));
    if !dependent && action.get("taskId").is_none() { return Ok(()); }
    let task_id = action["taskId"].as_str().ok_or("Bind action.taskId to the ready in_progress task")?;
    if !list.iter().any(|task| task["id"] == task_id && task["status"] == "in_progress") {
        return Err("Bind action.taskId to the ready in_progress task".into());
    }
    Ok(())
}
