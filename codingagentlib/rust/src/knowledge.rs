//! Bounded static project graph memory; never executes Python or RST.
use crate::{
    runtime::{atomic, hash, resolve, Runtime},
    Result,
};
use serde_json::{json, Value};
use std::io::Read;
use std::{
    collections::{BTreeMap, BTreeSet},
    fs,
    path::Path,
};
const FORMAT: &str = "codingagentlib/project-knowledge-v1";
fn ontology() -> Value {
    let classes = [
        "Project",
        "File",
        "Symbol",
        "Module",
        "Need",
        "Skill",
        "Tool",
        "Target",
        "Observation",
    ]
    .iter()
    .map(|id| json!({"id":id,"label":id}))
    .collect::<Vec<_>>();
    let relations = [
        "contains",
        "declares",
        "imports",
        "depends_on",
        "implements",
        "tests",
        "uses",
        "observed",
        "inherits",
        "calls",
        "blocks",
    ]
    .iter()
    .map(|id| json!({"id":id,"label":id}))
    .collect::<Vec<_>>();
    json!({"format":"codingagentlib/project-ontology-v1","version":1,"classes":classes,"relations":relations})
}
fn project(value: &str) -> Result<&str> {
    let p = value.trim();
    if p.is_empty() || p.chars().count() > 200 {
        return Err("Project label must be 1..200 characters".into());
    }
    Ok(p)
}
fn path(runtime: &Runtime, p: &str) -> Result<std::path::PathBuf> {
    let dir = runtime.state.join("knowledge");
    if dir.is_symlink() {
        return Err("Knowledge directory cannot be a symlink".into());
    }
    fs::create_dir_all(&dir)?;
    let path = dir.join(format!("{}.json", hash(p.as_bytes())));
    if path.is_symlink() {
        return Err("Knowledge file cannot be a symlink".into());
    }
    Ok(path)
}
fn load(runtime: &Runtime, p: &str) -> Result<Value> {
    let file = path(runtime, p)?;
    if file.exists() {
        Ok(serde_json::from_slice(&fs::read(file)?)?)
    } else {
        Ok(
            json!({"format":FORMAT,"version":1,"project":p,"ontology":ontology(),"nodes":[],"edges":[],"complete":false,"warnings":["Not indexed yet"],"revision":"missing"}),
        )
    }
}
fn save(
    runtime: &Runtime,
    p: &str,
    mut record: Value,
    expected: &str,
    action: &str,
) -> Result<Value> {
    let previous = load(runtime, p)?;
    if previous["revision"] != expected {
        return Err("Knowledge changed; reload before import".into());
    }
    record
        .as_object_mut()
        .ok_or("Invalid graph")?
        .remove("revision");
    let mut history = previous
        .get("memoryHistory")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    history.push(json!({"action":action,"previousRevision":expected,"nodes":record["nodes"].as_array().map(Vec::len),"edges":record["edges"].as_array().map(Vec::len)}));
    if history.len() > 100 {
        history.remove(0);
    }
    record["memoryHistory"] = json!(history);
    record["project"] = json!(p);
    record["revision"] = json!(hash(&serde_json::to_vec(&record)?));
    if serde_json::to_vec(&record)?.len() > 8000000 {
        return Err("Knowledge graph exceeds 8 MB".into());
    }
    atomic(&path(runtime, p)?, &record)?;
    Ok(record)
}
fn scan(root: &Path, at: &Path, files: &mut Vec<String>, warnings: &mut Vec<String>) -> Result<()> {
    if files.len() >= 512 {
        return Ok(());
    }
    let mut entries = fs::read_dir(at)?.collect::<std::io::Result<Vec<_>>>()?;
    entries.sort_by_key(|e| e.file_name());
    for entry in entries {
        let name = entry.file_name().to_string_lossy().into_owned();
        let meta = entry.file_type()?;
        if meta.is_symlink()
            || name.starts_with(".env")
            || [
                ".git",
                ".suite-agent",
                ".codingagentlib-rust",
                ".suite-wormhole",
                "node_modules",
                "target",
                "dist",
                "build",
                "vendor",
                "backup",
                ".venv",
                "venv",
                "__pycache__",
                ".aws",
                ".codex",
                ".agents",
            ]
            .contains(&name.as_str())
        {
            continue;
        }
        if meta.is_dir() {
            scan(root, &entry.path(), files, warnings)?;
        } else if meta.is_file()
            && [
                "py", "js", "cjs", "mjs", "ts", "tsx", "jsx", "rs", "rst", "md", "toml", "json",
            ]
            .contains(
                &entry
                    .path()
                    .extension()
                    .and_then(|v| v.to_str())
                    .unwrap_or(""),
            )
        {
            files.push(
                entry
                    .path()
                    .strip_prefix(root)?
                    .to_string_lossy()
                    .replace('\\', "/"),
            );
        }
        if files.len() >= 512 {
            if warnings.is_empty() {
                warnings.push("Index limited to 512 files".into());
            }
            break;
        }
    }
    Ok(())
}
fn node(
    nodes: &mut BTreeMap<String, Value>,
    kind: &str,
    label: &str,
    key: &str,
    source: Value,
) -> String {
    let id = format!("auto:{}", &hash(format!("{kind}:{key}").as_bytes())[..32]);
    if nodes.len() < 5500 {
        nodes.insert(id.clone(),json!({"id":id,"type":kind,"label":label.chars().take(1000).collect::<String>(),"source":source,"origin":"derived","properties":{}}));
    }
    id
}
fn edge(edges: &mut BTreeMap<String, Value>, source: &str, kind: &str, target: &str) {
    if edges.len() >= 11000 {
        return;
    }
    let id = hash(format!("{source}:{kind}:{target}").as_bytes());
    edges.insert(
        id.clone(),
        json!({"id":id,"source":source,"target":target,"type":kind,"origin":"derived"}),
    );
}
pub(crate) fn refresh(runtime: &Runtime, p: &str) -> Result<Value> {
    let previous = load(runtime, p)?;
    let mut schema = previous["ontology"].clone();
    schema["classes"]
        .as_array_mut()
        .ok_or("Invalid ontology")?
        .retain(|r| r["origin"] != "derived");
    let standard = ontology();
    for kind in ["classes", "relations"] {
        let known = schema[kind]
            .as_array()
            .ok_or("Invalid ontology")?
            .iter()
            .map(|r| r["id"].clone())
            .collect::<Vec<_>>();
        for row in standard[kind].as_array().unwrap() {
            if !known.contains(&row["id"]) {
                schema[kind].as_array_mut().unwrap().push(row.clone());
            }
        }
    }
    let mut nodes = previous["nodes"]
        .as_array()
        .unwrap()
        .iter()
        .filter(|n| n["origin"] != "derived")
        .map(|n| (n["id"].as_str().unwrap().to_owned(), n.clone()))
        .collect::<BTreeMap<_, _>>();
    let mut edges = previous["edges"]
        .as_array()
        .unwrap()
        .iter()
        .filter(|e| e["origin"] != "derived")
        .map(|e| (e["id"].as_str().unwrap().to_owned(), e.clone()))
        .collect::<BTreeMap<_, _>>();
    let root = node(&mut nodes, "Project", p, p, json!({}));
    let mut files = vec![];
    let mut warnings = vec![];
    scan(&runtime.root, &runtime.root, &mut files, &mut warnings)?;
    let mut bytes = 0;
    let mut needs = BTreeMap::new();
    let mut links = vec![];
    for relative in files {
        let sourcepath = resolve(&runtime.root, &relative)?;
        let size = sourcepath.metadata()?.len();
        if size > 200000 {
            warnings.push(format!("{relative}: exceeds 200 KB"));
            continue;
        }
        if bytes + size > 8000000 {
            warnings.push("Index limited to 8 MB".into());
            break;
        }
        let mut data = Vec::new();
        std::fs::File::open(sourcepath)?
            .take(200001)
            .read_to_end(&mut data)?;
        if data.len() > 200000 {
            warnings.push(format!("{relative}: grew beyond 200 KB"));
            continue;
        }
        if bytes + data.len() as u64 > 8000000 {
            warnings.push("Index limited to 8 MB".into());
            break;
        }
        bytes += data.len() as u64;
        let text = match String::from_utf8(data.clone()) {
            Ok(t) => t,
            Err(_) => {
                warnings.push(format!("{relative}: not UTF-8"));
                continue;
            }
        };
        let source = json!({"path":relative,"sha256":hash(&data)});
        let file = node(&mut nodes, "File", &relative, &relative, source.clone());
        edge(&mut edges, &root, "contains", &file);
        let lines = text.lines().collect::<Vec<_>>();
        let mut current: Option<String> = None;
        let mut directive = String::new();
        let mut skip_depth = None;
        for (index, line) in lines.iter().enumerate() {
            let trimmed = line.trim_start();
            let indent = line.len() - trimmed.len();
            if let Some(depth) = skip_depth {
                if trimmed.is_empty() || indent > depth {
                    continue;
                }
                skip_depth = None;
            }
            if trimmed.ends_with("::") && !trimmed.starts_with(".. ") {
                skip_depth = Some(indent);
                current = None;
                continue;
            }
            if let Some(rest) = trimmed.strip_prefix(".. ") {
                if let Some((kind, title)) = rest.split_once("::") {
                    if [
                        "raw",
                        "code",
                        "code-block",
                        "literalinclude",
                        "parsed-literal",
                    ]
                    .contains(&kind)
                    {
                        skip_depth = Some(indent);
                        current = None;
                        continue;
                    }
                    directive = title.trim().into();
                    current = None;
                }
            }
            if relative.ends_with(".rst") {
                if let Some(id) = trimmed.strip_prefix(":id:") {
                    let id = id.trim();
                    if needs.contains_key(id) {
                        warnings.push(format!("{relative}: duplicate need ID {id}"));
                        current = None;
                        continue;
                    }
                    let need = node(
                        &mut nodes,
                        "Need",
                        if directive.is_empty() { id } else { &directive },
                        id,
                        json!({"path":relative,"sha256":source["sha256"],"line":index+1}),
                    );
                    needs.insert(id.to_owned(), need.clone());
                    edge(&mut edges, &file, "declares", &need);
                    current = Some(need);
                }
                for relation in ["links", "depends_on", "implements", "tests", "blocks"] {
                    if let Some(value) = trimmed.strip_prefix(&format!(":{relation}:")) {
                        if let Some(need) = &current {
                            for target in value
                                .split(|c: char| c == ',' || c == ';' || c.is_whitespace())
                                .filter(|v| !v.is_empty())
                            {
                                links.push((
                                    need.clone(),
                                    if relation == "links" {
                                        "depends_on"
                                    } else {
                                        relation
                                    }
                                    .to_owned(),
                                    target.to_owned(),
                                ));
                            }
                        }
                    }
                }
            }
            if !["py", "js", "cjs", "mjs", "ts", "tsx", "jsx", "rs"]
                .iter()
                .any(|ext| relative.ends_with(&format!(".{ext}")))
            {
                continue;
            }
            let mut imported = Vec::new();
            if relative.ends_with(".py") {
                if let Some(rest) = trimmed.strip_prefix("import ") {
                    for module in rest.split(',') {
                        if let Some(name) = module.split_whitespace().next() {
                            imported.push(name.to_owned());
                        }
                    }
                }
                if let Some(rest) = trimmed.strip_prefix("from ") {
                    if let Some(name) = rest.split_whitespace().next() {
                        imported.push(name.to_owned());
                    }
                }
            } else if let Some(rest) = trimmed.strip_prefix("use ") {
                if let Some(name) = rest.split("::").next() {
                    imported.push(name.trim_end_matches(';').to_owned());
                }
            } else if trimmed.starts_with("import ")
                || trimmed.contains("require(")
                || trimmed.contains(" from ")
            {
                if let Some((start, quote)) = trimmed
                    .char_indices()
                    .find(|(_, c)| *c == '\'' || *c == '"')
                {
                    if let Some(end) = trimmed[start + 1..].find(quote) {
                        imported.push(trimmed[start + 1..start + 1 + end].to_owned());
                    }
                }
            }
            for name in imported {
                let module = node(&mut nodes, "Module", &name, &name, json!({}));
                edge(&mut edges, &file, "imports", &module);
            }
            for keyword in [
                "def ",
                "class ",
                "function ",
                "fn ",
                "struct ",
                "interface ",
            ] {
                if let Some(rest) = trimmed.strip_prefix(keyword) {
                    let name = rest
                        .chars()
                        .take_while(|c| c.is_alphanumeric() || *c == '_')
                        .collect::<String>();
                    if !name.is_empty() {
                        if ["class ", "struct ", "interface "].contains(&keyword)
                            && schema["classes"].as_array().unwrap().len() < 200
                        {
                            let concept = format!(
                                "type_{}",
                                &hash(format!("{relative}:{name}").as_bytes())[..20]
                            );
                            if !schema["classes"]
                                .as_array()
                                .unwrap()
                                .iter()
                                .any(|r| r["id"] == concept)
                            {
                                schema["classes"].as_array_mut().unwrap().push(json!({"id":concept,"label":name.chars().take(200).collect::<String>(),"origin":"derived","source":source}));
                            }
                        }
                        let symbol = node(
                            &mut nodes,
                            "Symbol",
                            &name,
                            &format!("{relative}:{index}:{name}"),
                            json!({"path":relative,"sha256":source["sha256"],"line":index+1,"extraction":"lexical"}),
                        );
                        edge(&mut edges, &file, "declares", &symbol);
                    }
                }
            }
        }
    }
    for (source, kind, target) in links {
        let target = needs.get(&target).cloned().unwrap_or_else(|| {
            node(
                &mut nodes,
                "Need",
                &target,
                &target,
                json!({"unresolved":true}),
            )
        });
        if nodes.contains_key(&source) && nodes.contains_key(&target) {
            edge(&mut edges, &source, &kind, &target);
        }
    }
    if nodes.len() >= 5500 || edges.len() >= 11000 {
        warnings.push("Graph node/edge budget reached".into());
    }
    edges.retain(|_, e| {
        nodes.contains_key(e["source"].as_str().unwrap())
            && nodes.contains_key(e["target"].as_str().unwrap())
    });
    let annotations = previous["annotations"]
        .as_object()
        .map(|notes| {
            notes
                .iter()
                .filter(|(id, _)| nodes.contains_key(*id))
                .map(|(id, n)| (id.clone(), n.clone()))
                .collect::<serde_json::Map<_, _>>()
        })
        .unwrap_or_default();
    let mut record = json!({"format":FORMAT,"version":1,"project":p,"ontology":schema,"nodes":nodes.into_values().collect::<Vec<_>>(),"edges":edges.into_values().collect::<Vec<_>>(),"complete":warnings.is_empty(),"warnings":warnings.into_iter().take(100).collect::<Vec<_>>(),"extraction":"native-static-reference-data-v1"});
    record["annotations"] = json!(annotations);
    for key in ["memoryHistory"] {
        if let Some(value) = previous.get(key) {
            record[key] = value.clone();
        }
    }
    if let Some(origin) = previous.get("importedFrom") {
        record["importedFrom"] = origin.clone();
    }
    let mut old = previous.clone();
    old.as_object_mut().unwrap().remove("revision");
    if old == record {
        return Ok(previous);
    }
    save(
        runtime,
        p,
        record,
        previous["revision"].as_str().unwrap(),
        "refresh",
    )
}
fn validate_schema(schema: &Value) -> Result<()> {
    if schema["format"] != "codingagentlib/project-ontology-v1" || schema["version"] != 1 {
        return Err("Unsupported ontology format".into());
    }
    for key in ["classes", "relations"] {
        let list = schema[key].as_array().ok_or("Invalid ontology")?;
        if list.is_empty() || list.len() > 200 {
            return Err("Ontology budget exceeded".into());
        }
        let mut ids = BTreeSet::new();
        for row in list {
            let id = row["id"].as_str().ok_or("Invalid ontology ID")?;
            if id.is_empty()
                || id.len() > 80
                || !id.as_bytes()[0].is_ascii_alphabetic()
                || !id
                    .chars()
                    .all(|c| c.is_ascii_alphanumeric() || "_.-".contains(c))
                || !ids.insert(id)
            {
                return Err("Invalid/duplicate ontology ID".into());
            }
        }
    }
    Ok(())
}
fn normalized_ontology(schema: &Value) -> Result<Value> {
    validate_schema(schema)?;
    let mut clean = json!({"format":"codingagentlib/project-ontology-v1","version":1});
    for key in ["classes", "relations"] {
        let mut rows = vec![];
        for row in schema[key].as_array().unwrap() {
            if row.get("label").is_some_and(|v| !v.is_string()) {
                return Err("Invalid ontology label".into());
            }
            let label = row["label"].as_str().unwrap_or(row["id"].as_str().unwrap());
            if label.chars().count() > 200 {
                return Err("Ontology label exceeds 200 characters".into());
            }
            rows.push(json!({"id":row["id"],"label":label}));
        }
        clean[key] = json!(rows);
    }
    Ok(clean)
}
fn validate_graph(payload: &Value, schema: &Value) -> Result<()> {
    validate_schema(schema)?;
    if payload["format"] != FORMAT
        || payload["version"] != 1
        || serde_json::to_vec(payload)?.len() > 8000000
    {
        return Err("Unsupported graph or size limit".into());
    }
    let nodes = payload["nodes"].as_array().ok_or("Missing nodes")?;
    let edges = payload["edges"].as_array().ok_or("Missing edges")?;
    if nodes.len() > 6000 || edges.len() > 12000 {
        return Err("Graph bounds".into());
    }
    let mut ids = BTreeSet::new();
    for node in nodes {
        let id = node["id"].as_str().ok_or("Invalid node ID")?;
        if id.is_empty()
            || id.len() > 180
            || !id
                .chars()
                .all(|c| c.is_ascii_alphanumeric() || "_.:-".contains(c))
            || !ids.insert(id)
            || node["label"]
                .as_str()
                .is_none_or(|s| s.chars().count() > 1000)
            || !schema["classes"]
                .as_array()
                .unwrap()
                .iter()
                .any(|r| r["id"] == node["type"])
        {
            return Err("Invalid graph node".into());
        }
        if node.get("source").is_some_and(|v| {
            !v.is_object()
                || serde_json::to_vec(v)
                    .map(|b| b.len() > 2000)
                    .unwrap_or(true)
        }) || node.get("properties").is_some_and(|v| {
            !v.is_object()
                || serde_json::to_vec(v)
                    .map(|b| b.len() > 8000)
                    .unwrap_or(true)
        }) {
            return Err("Invalid or oversized graph provenance/properties".into());
        }
        if let Some(path) = node["source"]["path"].as_str() {
            crate::runtime::safe_parts(path)?;
        }
    }
    for edge in edges {
        if !ids.contains(edge["source"].as_str().unwrap_or(""))
            || !ids.contains(edge["target"].as_str().unwrap_or(""))
            || !schema["relations"]
                .as_array()
                .unwrap()
                .iter()
                .any(|r| r["id"] == edge["type"])
        {
            return Err("Dangling/invalid graph edge".into());
        }
    }
    Ok(())
}
pub(crate) fn dispatch(runtime: &Runtime, data: &Value) -> Result<Value> {
    let fallback = runtime
        .root
        .file_name()
        .and_then(|v| v.to_str())
        .unwrap_or("workspace");
    let p = project(data["project"].as_str().unwrap_or(fallback))?;
    let mut record = load(runtime, p)?;
    match data["action"].as_str().unwrap_or("export") {
        "refresh" => refresh(runtime, p),
        "export" => Ok(record),
        "ontology" => {
            record["ontology"]["project"] = json!(p);
            record["ontology"]["revision"] = record["revision"].clone();
            Ok(record["ontology"].clone())
        }
        "query" => crate::graph_memory::query(&record, data),
        "stats" => Ok(
            json!({"project":p,"revision":record["revision"],"nodes":record["nodes"].as_array().unwrap().len(),"edges":record["edges"].as_array().unwrap().len(),"classes":record["ontology"]["classes"].as_array().unwrap().len(),"complete":record["complete"],"warnings":record["warnings"]}),
        ),
        "history" => Ok(
            json!({"project":p,"items":record.get("memoryHistory").cloned().unwrap_or(json!([]))}),
        ),
        "annotate" | "forget" | "relate" => {
            let action = data["action"].as_str().unwrap();
            let id = data["nodeId"]
                .as_str()
                .ok_or("Select a current graph node")?;
            let selected = record["nodes"]
                .as_array()
                .unwrap()
                .iter()
                .find(|n| n["id"] == id)
                .cloned()
                .ok_or("Unknown graph node")?;
            if action == "annotate" {
                let text = data["text"].as_str().ok_or("Provide annotation text")?;
                if text.chars().count() > 4000 {
                    return Err("Annotation exceeds 4,000 characters".into());
                }
                if !record["annotations"].is_object() {
                    record["annotations"] = json!({});
                }
                record["annotations"][id] = json!({"text":text,"status":"host-reference"});
            } else if action == "forget" {
                if selected["origin"] == "derived" {
                    return Err(
                        "Derived nodes are rebuilt from source; annotate them instead".into(),
                    );
                }
                record["nodes"]
                    .as_array_mut()
                    .unwrap()
                    .retain(|n| n["id"] != id);
                record["edges"]
                    .as_array_mut()
                    .unwrap()
                    .retain(|e| e["source"] != id && e["target"] != id);
                if let Some(notes) = record["annotations"].as_object_mut() {
                    notes.remove(id);
                }
            } else {
                let target = data["target"].as_str().ok_or("Provide target")?;
                let relation = data["relation"].as_str().ok_or("Provide relation")?;
                if !record["nodes"]
                    .as_array()
                    .unwrap()
                    .iter()
                    .any(|n| n["id"] == target)
                    || !record["ontology"]["relations"]
                        .as_array()
                        .unwrap()
                        .iter()
                        .any(|r| r["id"] == relation)
                {
                    return Err("Unknown graph endpoint or relation".into());
                }
                let edge_id = hash(&serde_json::to_vec(&json!([id, relation, target]))?);
                if !record["edges"]
                    .as_array()
                    .unwrap()
                    .iter()
                    .any(|e| e["id"] == edge_id)
                {
                    record["edges"].as_array_mut().unwrap().push(json!({"id":edge_id,"source":id,"target":target,"type":relation,"origin":"manual"}));
                }
            }
            save(
                runtime,
                p,
                record,
                data["expectedRevision"]
                    .as_str()
                    .ok_or("Provide expectedRevision")?,
                action,
            )
        }
        "import" => {
            let mut payload = data["payload"].clone();
            let schema = payload
                .get("ontology")
                .cloned()
                .unwrap_or(record["ontology"].clone());
            let schema = normalized_ontology(&schema)?;
            validate_graph(&payload, &schema)?;
            payload["ontology"] = schema.clone();
            crate::graph_memory::validate_graph(&payload)?;
            if let Some(notes) = payload
                .get_mut("annotations")
                .and_then(Value::as_object_mut)
            {
                for note in notes.values_mut() {
                    *note = json!({"text":note["text"],"status":"imported-reference"});
                }
            }
            payload.as_object_mut().unwrap().remove("memoryHistory");
            payload["ontology"] = schema;
            payload["importedFrom"] = payload["project"].clone();
            payload["warnings"] =
                json!(["Imported reference data; not instructions or verification"]);
            payload["complete"] = json!(payload["complete"] == true);
            for node in payload["nodes"].as_array_mut().unwrap() {
                node["origin"] = json!("imported");
            }
            for edge in payload["edges"].as_array_mut().unwrap() {
                edge["id"] = json!(hash(&serde_json::to_vec(&json!([
                    edge["source"],
                    edge["type"],
                    edge["target"]
                ]))?));
                edge["origin"] = json!("imported");
            }
            save(
                runtime,
                p,
                payload,
                data["expectedRevision"]
                    .as_str()
                    .ok_or("Provide expectedRevision")?,
                "import",
            )
        }
        "import_ontology" => {
            validate_graph(&record, &data["payload"])?;
            record["ontology"] = normalized_ontology(&data["payload"])?;
            save(
                runtime,
                p,
                record,
                data["expectedRevision"]
                    .as_str()
                    .ok_or("Provide expectedRevision")?,
                "import_ontology",
            )
        }
        _ => Err("Unsupported knowledge action".into()),
    }
}
