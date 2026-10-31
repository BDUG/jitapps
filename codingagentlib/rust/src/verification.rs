use crate::{
    runtime::{hash, resolve, Runtime},
    Result,
};
use serde_json::{json, Value};
use std::{
    collections::{BTreeMap, BTreeSet},
    fs::OpenOptions,
    io::Read,
};
const NOTE:&str="Hashes cover known inspected/edited workspace files and managed scripts, not every dependency or command-side effect. Matching hashes establish input continuity, not test adequacy, hermeticity or an atomic snapshot. Changed inputs need fresh verification; do not replay commands automatically.";
fn targets(runtime: &Runtime, id: &str, extra: &Value) -> BTreeSet<(String, String)> {
    let session = &runtime.sessions[id];
    let mut paths = BTreeSet::new();
    if let Some(events) = session["events"].as_array() {
        for event in events {
            let parent = &event["value"];
            if event["kind"] != "observation" {
                continue;
            }
            let mut receipts = vec![parent];
            if parent["tool"] == "parallel_read" {
                if let Some(children) = parent["result"]["results"].as_array() {
                    receipts.extend(children);
                }
            }
            for v in receipts {
                if v["ok"] != true {
                    continue;
                }
                if let (Some(tool), Some(path)) = (v["tool"].as_str(), v["result"]["path"].as_str())
                {
                    let kind = if [
                        "read_file",
                        "write_file",
                        "replace_text",
                        "apply_edits",
                        "delete_file",
                        "restore_file",
                    ]
                    .contains(&tool)
                    {
                        Some("workspace")
                    } else if ["read_script", "write_script", "delete_script"].contains(&tool) {
                        Some("script")
                    } else {
                        None
                    };
                    if let Some(kind) = kind {
                        paths.insert((kind.to_owned(), path.to_owned()));
                    }
                }
            }
        }
    }
    for rows in [&session["verificationBinding"]["files"], extra] {
        if let Some(rows) = rows.as_array() {
            for row in rows {
                if let (Some(kind), Some(path)) = (row["kind"].as_str(), row["path"].as_str()) {
                    if ["workspace", "script"].contains(&kind) {
                        paths.insert((kind.to_owned(), path.to_owned()));
                    }
                }
            }
        }
    }
    paths
}
pub(crate) fn capture(runtime: &Runtime, id: &str, extra: &Value) -> Value {
    let paths = targets(runtime, id, extra);
    let mut files = vec![];
    let mut warnings = vec![];
    if paths.len() > 256 {
        warnings.push(json!({"reason":"input_count_limit","total":paths.len(),"limit":256}));
    }
    for (kind, path) in paths.iter().take(256) {
        let loaded = (|| -> Result<String> {
            let base = if kind == "script" {
                let base = runtime.state.join(format!("{id}-scripts"));
                if base.is_symlink() {
                    return Err("Symlink script root".into());
                }
                base
            } else {
                runtime.root.clone()
            };
            let target = resolve(&base, path)?;
            let mut options = OpenOptions::new();
            options.read(true);
            #[cfg(unix)]
            {
                use std::os::unix::fs::OpenOptionsExt;
                options.custom_flags(libc::O_NOFOLLOW | libc::O_NONBLOCK);
            }
            let file = match options.open(target) {
                Ok(file) => file,
                Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
                    return Ok("missing".to_owned())
                }
                Err(e) => return Err(e.into()),
            };
            let metadata = file.metadata()?;
            if !metadata.is_file() || metadata.len() > 2_000_000 {
                return Err("Unsupported verification input".into());
            }
            let mut bytes = vec![];
            file.take(2_000_001).read_to_end(&mut bytes)?;
            if bytes.len() > 2_000_000 {
                return Err("Verification input exceeded budget".into());
            }
            Ok(hash(&bytes))
        })();
        match loaded {
            Ok(hash) => files.push(json!({"kind":kind,"path":path,"hash":hash})),
            Err(_) => warnings.push(json!({"kind":kind,"path":path,"reason":"unavailable"})),
        }
    }
    json!({"files":files,"complete":warnings.is_empty(),"warnings":warnings})
}
fn changes(before: &Value, after: &Value) -> Vec<Value> {
    fn map(value: &Value) -> BTreeMap<(String, String), Value> {
        value["files"]
            .as_array()
            .unwrap()
            .iter()
            .map(|r| {
                (
                    (
                        r["kind"].as_str().unwrap().to_owned(),
                        r["path"].as_str().unwrap().to_owned(),
                    ),
                    r["hash"].clone(),
                )
            })
            .collect()
    }
    let old = map(before);
    let new = map(after);
    old.keys()
        .chain(new.keys())
        .cloned()
        .collect::<BTreeSet<_>>()
        .into_iter()
        .filter(|k| old.get(k) != new.get(k))
        .map(|k| json!({"kind":k.0,"path":k.1,"expectedHash":old.get(&k),"actualHash":new.get(&k)}))
        .collect()
}
pub(crate) fn record(runtime: &mut Runtime, id: &str, before: &Value, result: &mut Value) {
    let after = capture(runtime, id, &before["files"]);
    let changed = changes(before, &after);
    let stable = before["complete"] == true && after["complete"] == true && changed.is_empty();
    let successful = result["exitCode"] == 0
        && result["timedOut"] != true
        && result["cancelled"] != true
        && result["outputLimited"] != true;
    let digest = hash(serde_json::to_string(&after["files"]).unwrap().as_bytes());
    runtime.sessions.get_mut(id).unwrap()["verificationBinding"] = json!({"format":"codingagentlib/verification-binding/v1","jobId":result["jobId"],"inputDigest":digest,"successful":successful,"stable":stable,"files":after["files"],"complete":after["complete"],"warnings":after["warnings"],"changedDuringCommand":changed});
    result["verificationBinding"] = json!({"inputDigest":digest,"inputs":after["files"],"stable":stable,"complete":after["complete"],"boundFiles":after["files"].as_array().unwrap().len(),"changedDuringCommand":changed,"warnings":after["warnings"],"note":NOTE});
}
pub(crate) fn freshness(runtime: &Runtime, id: &str) -> Value {
    let binding = &runtime.sessions[id]["verificationBinding"];
    if !binding.is_object() {
        return json!({"format":"codingagentlib/verification-freshness/v1","status":"none","passed":false,"trackedFiles":0,"changed":[],"note":NOTE});
    }
    let current = capture(runtime, id, &binding["files"]);
    let changed = changes(binding, &current);
    let count = binding["files"].as_array().unwrap().len();
    let status = if binding["successful"] != true {
        "failed"
    } else if binding["complete"] != true || current["complete"] != true {
        "unavailable"
    } else if binding["stable"] != true || !changed.is_empty() {
        "stale"
    } else if count == 0 {
        "unbound"
    } else {
        "current"
    };
    json!({"format":"codingagentlib/verification-freshness/v1","status":status,"passed":(["current","unbound"].contains(&status)),"jobId":binding["jobId"],"inputDigest":binding["inputDigest"],"trackedFiles":count,"changed":if changed.is_empty(){binding["changedDuringCommand"].clone()}else{json!(changed)},"warnings":current["warnings"],"note":NOTE})
}
