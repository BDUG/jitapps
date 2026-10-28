//! Host-owned dynamic context sources; resolving does not perform built-in I/O.
use crate::{CancelHandle, Result};
use serde_json::{json, Value};
use std::collections::BTreeMap;
type Provider = Box<dyn FnMut(&Value, &CancelHandle) -> Result<Value> + Send>;
struct Source {
    description: String,
    schema: Value,
    provider: Provider,
}
pub struct ContextRegistry {
    base: Value,
    sources: BTreeMap<String, Source>,
}
impl ContextRegistry {
    pub fn new(base: Value) -> Self {
        Self {
            base,
            sources: BTreeMap::new(),
        }
    }
    pub fn add<F>(
        &mut self,
        id: &str,
        description: &str,
        schema: Value,
        provider: F,
    ) -> Result<&mut Self>
    where
        F: FnMut(&Value, &CancelHandle) -> Result<Value> + Send + 'static,
    {
        if id.is_empty()
            || id.len() > 100
            || !id.as_bytes()[0].is_ascii_alphabetic()
            || !id
                .bytes()
                .all(|b| b.is_ascii_alphanumeric() || b"_.-".contains(&b))
            || self.sources.contains_key(id)
            || !schema.is_object()
        {
            return Err("Provide a unique context source ID and object schema".into());
        }
        self.sources.insert(
            id.to_owned(),
            Source {
                description: description.to_owned(),
                schema,
                provider: Box::new(provider),
            },
        );
        Ok(self)
    }
    pub fn remove(&mut self, id: &str) -> Result<&mut Self> {
        self.sources.remove(id).ok_or("Unknown context source")?;
        Ok(self)
    }
    pub fn list(&self) -> Vec<Value> {
        self.sources
            .iter()
            .map(|(id, s)| json!({"id":id,"description":s.description,"schema":s.schema}))
            .collect()
    }
    pub fn resolve(&mut self, state: &Value, cancel: &CancelHandle) -> Result<Value> {
        let mut sources = Vec::new();
        for (id, source) in &mut self.sources {
            if cancel.is_cancelled() {
                return Err("Context resolution cancelled".into());
            }
            let value = (source.provider)(state, cancel)?;
            if !value["revision"].is_string() || value.get("data").is_none() {
                return Err(format!(
                    "Context source {id} must return {{revision:string,data:JSON}}"
                )
                .into());
            }
            sources.push(json!({"id":id,"description":source.description,"schema":source.schema,"revision":value["revision"],"data":value["data"]}));
        }
        Ok(
            json!({"format":"codingagentlib/integration-context-v1","base":self.base,"sources":sources}),
        )
    }
}
