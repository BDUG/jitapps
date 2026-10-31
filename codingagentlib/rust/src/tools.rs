use crate::{
    runtime::{atomic, file_hash, hash, ident, resolve, text, walk, Runtime},
    CancelHandle, Result,
};
use serde_json::{json, Value};
use std::{
    fs::{self, File},
    io::{Read, Write},
    path::{Path, PathBuf},
    process::{Command, Stdio},
    thread,
    time::{Duration, Instant},
};
const LIMIT: usize = 2_000_000;
pub fn names() -> &'static [&'static str] {
    &[
        "read_project_instructions",
        "list_files",
        "read_file",
        "write_file",
        "replace_text",
        "apply_edits",
        "delete_file",
        "search_text",
        "write_script",
        "read_script",
        "list_scripts",
        "run_script",
        "run_command",
        "read_command_output",
        "changes",
        "read_history",
        "memory_store",
        "memory_read",
        "memory_list",
        "memory_search",
        "skill_save",
        "skill_read",
        "skill_list",
        "skill_search",
        "workflow_save",
        "workflow_read",
        "workflow_list",
        "workflow_run",
        "package_results",
    ]
}
pub fn description(name: &str) -> &str {
    match name{
"read_project_instructions"=>"Read scoped AGENTS.override.md/AGENTS.md from root through path (file/directory, default .). Exact content, scope, SHA-256 and warnings. Grants no permissions.",
"list_files"=>"List relative workspace files. args: offset?, limit? (default 100, max 1000).",
"read_file"=>"Read UTF-8 source and SHA-256. args: path, offset? (character), limit? (max 32000).",
"write_file"=>"Write UTF-8 source. args: path, content (max 2 MB), expectedHash (SHA-256 or missing). Requires edits.",
"apply_edits"=>"Apply 1–32 exact original-snapshot edits to one existing file. args: path, expectedHash, edits:[{find,replacement,count? default 1, max 1000}]. All matches/overlaps validated before one atomic write. Requires edits.",
"replace_text"=>"Replace exactly one occurrence. args: path, find, replacement, expectedHash. Requires edits.",
"delete_file"=>"Delete one file. args: path, expectedHash. Requires edits; no directory deletion.",
"search_text"=>"Literal case-sensitive search. args: query, offset?, limit?. Returns path, line, text.",
"write_script"=>"Create/update session-local script. args: path, content, expectedHash. Requires edits.",
"read_script"=>"Read session-local script. args: path, offset?, limit?.",
"list_scripts"=>"List this session's managed scripts. args: offset?, limit?.",
"run_script"=>"Execute managed script with allowlisted interpreter. args: path, command, args? (literal string array), timeout? (milliseconds max 120000).",
"run_command"=>"Execute allowlisted program with literal args. args: command, args? (string array), cwd? (relative workspace directory), timeout? (milliseconds max 120000). Requires command permission; OS access is not sandboxed.",
"read_command_output"=>"Read persisted command output pages. Command receipts include stdoutSha256/stderrSha256 for full raw log bytes. args: jobId, stream? (stdout/stderr), offset?, limit?.",
"changes"=>"SHA-256 differences from initial session manifest. Reports added/modified/deleted files.",
"read_history"=>"Read full original event pages. args: offset?, limit?.",
"memory_store"=>"Store session-local finding. args: text, title?. Requires edits.",
"memory_read"=>"Read finding. args: id, offset?, limit?.",
"memory_list"=>"List session-local findings. args: offset?, limit?.",
"memory_search"=>"Case-insensitive lexical search over findings. args: query, offset?, limit?.",
"skill_save"=>"Create/update reusable workspace skill with optimistic revision. args: id, expectedRevision (0 creates), content, name?. Requires edits.",
"skill_read"=>"Read reusable skill. args: id, revision? (pin historical version), offset?, limit?.",
"skill_list"=>"List reusable skills. args: offset?, limit?.",
"skill_search"=>"Case-insensitive lexical skill search. args: query, offset?, limit?.",
"workflow_save"=>"Create/update reusable workflow. args: id, expectedRevision, definition:{name,steps:[{tool,args}]}. Max 16 file/script/program steps; no expressions. Requires edits.",
"workflow_read"=>"Read workflow. args: id, revision?.",
"workflow_list"=>"List reusable workflows. args: offset?, limit?.",
"workflow_run"=>"Run pinned workflow. args: id, revision. Executes literal steps once, stops on failure/cancellation; no automatic replay.",
"package_results"=>"Build session ZIP containing logs, changed readable files, scripts, skills/workflows and manifest. Does not include deleted file contents or command rollback.",_=>"Unsupported"}
}
fn page(value: &str, args: &Value) -> Result<Value> {
    let start = offset(args)?;
    let max = limit(args, 12000, 32000)?;
    let chars = value.chars().collect::<Vec<_>>();
    if start > chars.len() {
        return Err("Offset exceeds text length".into());
    }
    let end = (start + max).min(chars.len());
    Ok(
        json!({"text":chars[start..end].iter().collect::<String>(),"offset":start,"nextOffset":if end<chars.len(){Some(end)}else{None},"done":end==chars.len(),"totalCharacters":chars.len()}),
    )
}
fn offset(args: &Value) -> Result<usize> {
    let n = args
        .get("offset")
        .map(|v| v.as_u64().ok_or("Offset must be a nonnegative integer"))
        .transpose()?
        .unwrap_or(0);
    usize::try_from(n).map_err(Into::into)
}
fn limit(args: &Value, default: usize, max: usize) -> Result<usize> {
    let n = args
        .get("limit")
        .map(|v| v.as_u64().ok_or("Limit must be a positive integer"))
        .transpose()?
        .unwrap_or(default as u64);
    if n == 0 || n > max as u64 {
        return Err(format!("Limit must be 1–{max}").into());
    }
    Ok(n as usize)
}
fn rows(items: Vec<Value>, args: &Value, key: &str) -> Result<Value> {
    let start = offset(args)?;
    let count = limit(args, 100, 1000)?;
    let end = start.saturating_add(count).min(items.len());
    if start > items.len() {
        return Err("Offset exceeds result length".into());
    }
    let mut out = json!({"offset":start,"nextOffset":if end<items.len(){Some(end)}else{None},"done":end==items.len(),"total":items.len()});
    out[key] = json!(&items[start..end]);
    Ok(out)
}
fn permission(runtime: &Runtime, id: &str, key: &str) -> Result<()> {
    if runtime.sessions[id][key] != true {
        return Err(format!("Permission denied: {key}").into());
    }
    Ok(())
}
fn private(runtime: &Runtime, id: &str, folder: &str) -> Result<PathBuf> {
    if id.len() != 32 || !id.chars().all(|c| c.is_ascii_hexdigit()) {
        return Err("Invalid session ID".into());
    }
    let root = runtime.state.join(format!("{id}-{folder}"));
    if fs::symlink_metadata(&root)
        .map(|m| m.file_type().is_symlink())
        .unwrap_or(false)
    {
        return Err("Private path is a symlink".into());
    }
    fs::create_dir_all(&root)?;
    Ok(root)
}
fn contents(path: &Path) -> Result<String> {
    if fs::metadata(path)?.len() > LIMIT as u64 {
        return Err("File exceeds 2 MB text tool limit".into());
    }
    let value = fs::read_to_string(path)?;
    if value.contains('\0') {
        return Err("Binary file is not supported by text tools".into());
    }
    Ok(value)
}
fn expected(path: &Path, args: &Value) -> Result<()> {
    let current = if path.exists() {
        file_hash(path)?
    } else {
        "missing".into()
    };
    if text(args, "expectedHash")? != current {
        return Err(format!("Stale file hash; read again. Current hash: {current}").into());
    }
    Ok(())
}
fn write(path: &Path, body: &str) -> Result<()> {
    if body.len() > LIMIT || body.contains('\0') {
        return Err("Use UTF-8 text up to 2 MB without NUL".into());
    }
    fs::create_dir_all(path.parent().ok_or("Missing parent")?)?;
    let temp = path.with_extension(format!("{}.tmp", ident()));
    let mut options = fs::OpenOptions::new();
    options.create_new(true).write(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }
    let result = (|| -> Result<()> {
        let mut file = options.open(&temp)?;
        file.write_all(body.as_bytes())?;
        file.sync_all()?;
        if path.exists() {
            fs::set_permissions(&temp, fs::metadata(path)?.permissions())?;
        }
        fs::rename(&temp, path)?;
        Ok(())
    })();
    if temp.exists() {
        let _ = fs::remove_file(temp);
    }
    result
}
fn edited(runtime: &mut Runtime, id: &str) {
    let session = runtime.sessions.get_mut(id).unwrap();
    session["edited"] = json!(true);
    session["verified"] = json!(false);
}
fn backup(runtime: &Runtime, id: &str, path: &str, target: &Path) -> Result<()> {
    let dir = private(runtime, id, "backups")?;
    let key = hash(path.as_bytes());
    let record = dir.join(format!("{key}.json"));
    if !record.exists() {
        let exists = target.exists();
        if exists {
            fs::copy(target, dir.join(&key))?;
        }
        atomic(
            &record,
            &json!({"path":path,"existed":exists,"sha256":if exists{Some(file_hash(target)?)}else{None}}),
        )?;
    }
    Ok(())
}
pub(crate) fn execute(
    runtime: &mut Runtime,
    id: &str,
    name: &str,
    args: &Value,
    cancel: &CancelHandle,
) -> Result<Value> {
    if !args.is_object() {
        return Err("Tool arguments must be an object".into());
    }
    if cancel.is_cancelled() {
        return Err("Agent cancelled".into());
    }
    match name {
        "read_project_instructions" => crate::instructions::read(
            runtime,
            args.get("path")
                .map(|p| p.as_str().ok_or("Instruction path must be text"))
                .transpose()?
                .unwrap_or("."),
        ),
        "list_files" | "list_scripts" => {
            let root = if name == "list_scripts" {
                private(runtime, id, "scripts")?
            } else {
                runtime.root.clone()
            };
            let mut files = vec![];
            walk(&root, &root, &mut files)?;
            rows(
                files.into_iter().map(|p| json!({"path":p})).collect(),
                args,
                "files",
            )
        }
        "read_file" | "read_script" => {
            let root = if name == "read_script" {
                private(runtime, id, "scripts")?
            } else {
                runtime.root.clone()
            };
            let path = resolve(&root, text(args, "path")?)?;
            let body = contents(&path)?;
            let mut result = page(&body, args)?;
            result["path"] = args["path"].clone();
            result["hash"] = json!(hash(body.as_bytes()));
            Ok(result)
        }
        "write_file" | "apply_edits" | "replace_text" | "delete_file" | "write_script" => {
            permission(runtime, id, "allowEdits")?;
            let root = if name == "write_script" {
                private(runtime, id, "scripts")?
            } else {
                runtime.root.clone()
            };
            let relative = text(args, "path")?;
            let target = resolve(&root, relative)?;
            expected(&target, args)?;
            if name != "write_script" && name != "apply_edits" {
                backup(runtime, id, relative, &target)?;
            }
            let result = if name == "delete_file" {
                fs::remove_file(&target)?;
                json!({"deleted":true,"path":relative})
            } else {
                let body = if name == "apply_edits" {
                    if args
                        .as_object()
                        .unwrap()
                        .keys()
                        .any(|k| !["path", "expectedHash", "edits"].contains(&k.as_str()))
                    {
                        return Err("apply_edits accepts only path, expectedHash and edits; no preview/dryRun mode. No changes applied.".into());
                    }
                    let source = contents(&target)?;
                    if hash(source.as_bytes()) != text(args, "expectedHash")? {
                        return Err("File changed while preparing edits; reread source".into());
                    }
                    let (body, _) = crate::edits::apply(&source, &args["edits"])?;
                    expected(&target, args)?;
                    body
                } else if name == "replace_text" {
                    let source = contents(&target)?;
                    let find = text(args, "find")?;
                    if find.is_empty() || source.matches(find).count() != 1 {
                        return Err("find must match exactly one nonempty occurrence".into());
                    }
                    source.replacen(find, text(args, "replacement")?, 1)
                } else {
                    text(args, "content")?.to_owned()
                };
                if name == "apply_edits" {
                    if cancel.is_cancelled() {
                        return Err("Agent cancelled before edit commit".into());
                    }
                    backup(runtime, id, relative, &target)?;
                    if cancel.is_cancelled() {
                        return Err("Agent cancelled before edit commit".into());
                    }
                }
                write(&target, &body)?;
                let mut result =
                    json!({"path":relative,"bytes":body.len(),"hash":hash(body.as_bytes())});
                if name == "apply_edits" {
                    let edits = args["edits"].as_array().unwrap();
                    result["edits"] = json!(edits.len());
                    result["replacements"] = json!(edits
                        .iter()
                        .map(|e| e.get("count").and_then(Value::as_u64).unwrap_or(1))
                        .sum::<u64>());
                }
                result
            };
            if name != "write_script" {
                edited(runtime, id);
            }
            Ok(result)
        }
        "search_text" => {
            let query = text(args, "query")?;
            if query.is_empty() {
                return Err("Provide a search query".into());
            }
            let mut files = vec![];
            walk(&runtime.root, &runtime.root, &mut files)?;
            let mut matches = vec![];
            for file in files {
                if cancel.is_cancelled() {
                    return Err("Cancelled".into());
                }
                if let Ok(body) = contents(&resolve(&runtime.root, &file)?) {
                    for (line, value) in body.lines().enumerate() {
                        if value.contains(query) {
                            matches.push(json!({"path":file,"line":line+1,"text":value}));
                        }
                    }
                }
            }
            rows(matches, args, "matches")
        }
        "run_command" | "run_script" => run_command(runtime, id, name, args, cancel),
        "read_command_output" => {
            let job = text(args, "jobId")?;
            valid_id(job)?;
            let recorded = runtime.sessions[id]["events"]
                .as_array()
                .unwrap()
                .iter()
                .any(|event| {
                    event["kind"] == "observation"
                        && matches!(
                            event["value"]["tool"].as_str(),
                            Some("run_command" | "run_script")
                        )
                        && event["value"]["result"]["jobId"] == job
                });
            if !recorded {
                return Err("Unknown recorded command output job".into());
            }
            let stream = args["stream"].as_str().unwrap_or("stdout");
            if !["stdout", "stderr"].contains(&stream) {
                return Err("Use stdout or stderr".into());
            }
            let path = private(runtime, id, "commands")?.join(format!("{job}.{stream}"));
            let metadata = fs::symlink_metadata(&path)?;
            if metadata.file_type().is_symlink() || !metadata.is_file() {
                return Err("Command output must be a regular retained log, not a symlink".into());
            }
            let mut file = File::open(path)?;
            let mut bytes = vec![];
            std::io::Read::by_ref(&mut file)
                .take(8_000_001)
                .read_to_end(&mut bytes)?;
            if bytes.len() > 8_000_000 {
                return Err("Command output exceeds the native 8 MB retrieval bound".into());
            }
            page(&String::from_utf8_lossy(&bytes), args)
        }
        "changes" => {
            let current = runtime.manifest()?;
            let before = &runtime.sessions[id]["manifest"];
            let mut changes = vec![];
            for (path, value) in current.as_object().unwrap() {
                if before[path] != *value {
                    changes.push(json!({"path":path,"status":if before.get(path).is_none(){"added"}else{"modified"},"hash":value}));
                }
            }
            for path in before.as_object().unwrap().keys() {
                if current.get(path).is_none() {
                    changes.push(json!({"path":path,"status":"deleted"}));
                }
            }
            rows(changes, args, "changes")
        }
        "read_history" => rows(
            runtime.sessions[id]["events"].as_array().unwrap().clone(),
            args,
            "events",
        ),
        "memory_store" => {
            permission(runtime, id, "allowEdits")?;
            let key = ident();
            let value = json!({"id":key,"title":args["title"].as_str().unwrap_or("Finding"),"text":text(args,"text")?});
            if value.to_string().len() > LIMIT {
                return Err("Finding exceeds 2 MB".into());
            }
            atomic(
                &private(runtime, id, "memory")?.join(format!("{key}.json")),
                &value,
            )?;
            Ok(value)
        }
        "memory_read" => {
            let key = text(args, "id")?;
            valid_id(key)?;
            let path = private(runtime, id, "memory")?.join(format!("{key}.json"));
            let value: Value = serde_json::from_slice(&fs::read(path)?)?;
            let mut result = page(text(&value, "text")?, args)?;
            result["id"] = json!(key);
            result["title"] = value["title"].clone();
            Ok(result)
        }
        "memory_list" | "memory_search" => records(
            &private(runtime, id, "memory")?,
            args,
            "items",
            name == "memory_search",
        ),
        "skill_save" | "workflow_save" => {
            permission(runtime, id, "allowEdits")?;
            let kind = if name == "skill_save" {
                "skills"
            } else {
                "workflows"
            };
            let key = text(args, "id")?;
            valid_id(key)?;
            let path = runtime.state.join(kind).join(format!("{key}.json"));
            let previous = if path.exists() {
                serde_json::from_slice::<Value>(&fs::read(&path)?)?
            } else {
                json!({"revision":0,"history":[]})
            };
            let revision = previous["revision"]
                .as_u64()
                .ok_or("Invalid revision record")?;
            if args["expectedRevision"].as_u64() != Some(revision) {
                return Err("Stale revision; read the current record".into());
            }
            if name == "workflow_save" {
                let steps = args["definition"]["steps"]
                    .as_array()
                    .ok_or("Workflow needs steps")?;
                if steps.is_empty() || steps.len() > 16 {
                    return Err("Use 1–16 workflow steps".into());
                }
                for step in steps {
                    if ![
                        "read_file",
                        "write_file",
                        "replace_text",
                        "apply_edits",
                        "delete_file",
                        "write_script",
                        "read_script",
                        "run_script",
                        "run_command",
                        "search_text",
                        "list_files",
                    ]
                    .contains(&text(step, "tool")?)
                        || !step["args"].is_object()
                    {
                        return Err(
                            "Unsupported workflow step; use literal file/script/program tools"
                                .into(),
                        );
                    }
                }
            } else {
                let content = text(args, "content")?;
                if content.len() > LIMIT {
                    return Err("Skill exceeds 2 MB".into());
                }
            }
            let mut value =
                json!({"id":key,"revision":revision+1,"name":args["name"].as_str().unwrap_or(key)});
            value[if kind == "skills" {
                "content"
            } else {
                "definition"
            }] = args[if kind == "skills" {
                "content"
            } else {
                "definition"
            }]
            .clone();
            let mut history = previous["history"].as_array().cloned().unwrap_or_default();
            history.push(value.clone());
            value["history"] = json!(history);
            atomic(&path, &value)?;
            Ok(json!({"id":key,"revision":revision+1}))
        }
        "skill_read" | "workflow_read" => {
            let value = record(runtime, name.starts_with("skill"), args)?;
            if name == "skill_read" {
                let mut result = page(text(&value, "content")?, args)?;
                result["id"] = value["id"].clone();
                result["revision"] = value["revision"].clone();
                Ok(result)
            } else {
                Ok(value)
            }
        }
        "skill_list" | "skill_search" | "workflow_list" => records(
            &runtime.state.join(if name.starts_with("skill") {
                "skills"
            } else {
                "workflows"
            }),
            args,
            "items",
            name == "skill_search",
        ),
        "workflow_run" => {
            let revision = args["revision"].as_u64().ok_or("Pin a workflow revision")?;
            if revision == 0 {
                return Err("Pin a positive workflow revision".into());
            }
            let value = record(runtime, false, args)?;
            let steps = value["definition"]["steps"]
                .as_array()
                .ok_or("Invalid workflow")?;
            let mut results = vec![];
            let run = ident();
            for (index, step) in steps.iter().enumerate() {
                if cancel.is_cancelled() {
                    return Ok(json!({"runId":run,"status":"cancelled","results":results}));
                }
                let call = format!("{run}_{index}");
                let observation = runtime.tool(
                    id,
                    text(step, "tool")?,
                    step["args"].clone(),
                    &call,
                    step.get("checks"),
                    cancel,
                )?;
                let failed = observation["ok"] != true
                    || observation["checks"]["passed"] == false
                    || observation["result"]
                        .get("exitCode")
                        .map(|v| v != 0)
                        .unwrap_or(false)
                    || observation["result"]["timedOut"] == true
                    || observation["result"]["cancelled"] == true;
                results.push(observation);
                if failed {
                    return Ok(json!({"runId":run,"status":"failed","results":results}));
                }
            }
            Ok(json!({"runId":run,"status":"complete","results":results}))
        }
        "package_results" => package(runtime, id, cancel),
        _ => Err(format!("Unsupported native Rust tool: {name}").into()),
    }
}
fn valid_id(id: &str) -> Result<()> {
    if id.is_empty()
        || id.len() > 100
        || !id
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
    {
        return Err("Use an alphanumeric identifier with hyphens/underscores".into());
    }
    Ok(())
}
fn record(runtime: &Runtime, skill: bool, args: &Value) -> Result<Value> {
    let key = text(args, "id")?;
    valid_id(key)?;
    let value: Value = serde_json::from_slice(&fs::read(
        runtime
            .state
            .join(if skill { "skills" } else { "workflows" })
            .join(format!("{key}.json")),
    )?)?;
    if let Some(revision) = args.get("revision") {
        let n = revision.as_u64().ok_or("Revision must be an integer")?;
        return value["history"]
            .as_array()
            .ok_or("Missing revision history")?
            .iter()
            .find(|v| v["revision"] == n)
            .cloned()
            .ok_or_else(|| "Unknown revision".into());
    }
    Ok(value)
}
fn records(root: &Path, args: &Value, key: &str, search: bool) -> Result<Value> {
    let query = if search {
        text(args, "query")?.to_lowercase()
    } else {
        String::new()
    };
    let mut records = vec![];
    for entry in fs::read_dir(root)? {
        let path = entry?.path();
        if path.extension().and_then(|v| v.to_str()) != Some("json") {
            continue;
        }
        let mut value: Value = serde_json::from_slice(&fs::read(path)?)?;
        value
            .as_object_mut()
            .ok_or("Invalid record")?
            .remove("history");
        if !search || value.to_string().to_lowercase().contains(&query) {
            records.push(value);
        }
    }
    records.sort_by_key(|v| v["id"].as_str().unwrap_or("").to_owned());
    rows(records, args, key)
}
struct ChildGuard(std::process::Child);
impl ChildGuard {
    fn terminate(&mut self) {
        #[cfg(unix)]
        {
            // The child is the leader of a newly created process group; never signal our own group.
            let pid = self.0.id();
            if pid <= i32::MAX as u32 {
                unsafe {
                    libc::kill(-(pid as i32), libc::SIGKILL);
                }
            }
        }
        let _ = self.0.kill();
        let _ = self.0.wait();
    }
}
impl Drop for ChildGuard {
    fn drop(&mut self) {
        self.terminate();
    }
}
fn run_command(
    runtime: &mut Runtime,
    id: &str,
    name: &str,
    args: &Value,
    cancel: &CancelHandle,
) -> Result<Value> {
    permission(runtime, id, "allowCommands")?;
    let command = text(args, "command")?;
    let executable = runtime
        .allowed
        .get(command)
        .ok_or("Executable is not allowlisted")?
        .clone();
    let argv = args
        .get("args")
        .map(|v| v.as_array().ok_or("args must be a string array"))
        .transpose()?
        .cloned()
        .unwrap_or_default();
    if argv.len() > 100
        || argv.iter().any(|v| {
            v.as_str()
                .map(|s| s.contains('\0') || s.len() > 20000)
                .unwrap_or(true)
        })
    {
        return Err("Use up to 100 literal text arguments without NUL".into());
    }
    let timeout = args
        .get("timeout")
        .map(|v| v.as_u64().ok_or("timeout must be milliseconds"))
        .transpose()?
        .unwrap_or(30000);
    if !(1..=120000).contains(&timeout) {
        return Err("timeout must be 1–120000 milliseconds".into());
    }
    let cwd = if let Some(value) = args.get("cwd") {
        resolve(
            &runtime.root,
            value.as_str().ok_or("cwd must be a relative path")?,
        )?
    } else {
        runtime.root.clone()
    };
    if !cwd.is_dir() {
        return Err("cwd must be a directory".into());
    }
    let job = ident();
    let dir = private(runtime, id, "commands")?;
    let stdout = dir.join(format!("{job}.stdout"));
    let stderr = dir.join(format!("{job}.stderr"));
    let mut program = Command::new(executable);
    program
        .current_dir(cwd)
        .stdin(Stdio::null())
        .stdout(File::create(&stdout)?)
        .stderr(File::create(&stderr)?);
    if name == "run_script" {
        let script = resolve(&private(runtime, id, "scripts")?, text(args, "path")?)?;
        if !script.is_file() {
            return Err("Managed script not found".into());
        }
        program.arg(script);
    }
    for arg in argv {
        program.arg(arg.as_str().unwrap());
    }
    #[cfg(unix)]
    {
        use std::os::unix::process::CommandExt;
        program.process_group(0);
    }
    let verification_before = crate::verification::capture(runtime, id, &Value::Null);
    let mut child = ChildGuard(program.spawn()?);
    let start = Instant::now();
    let mut timed_out = false;
    let mut cancelled = false;
    let mut output_limited = false;
    let status = loop {
        if let Some(status) = child.0.try_wait()? {
            break status;
        }
        cancelled = cancel.is_cancelled();
        timed_out = start.elapsed() > Duration::from_millis(timeout);
        output_limited = fs::metadata(&stdout)?.len() + fs::metadata(&stderr)?.len() > 8_000_000;
        if cancelled || timed_out || output_limited {
            child.terminate();
            break child.0.wait()?;
        }
        thread::sleep(Duration::from_millis(10));
    };
    let read_preview = |path: &Path| -> Result<String> {
        let mut bytes = vec![];
        File::open(path)?.take(12000).read_to_end(&mut bytes)?;
        Ok(String::from_utf8_lossy(&bytes).into_owned())
    };
    let mut result = json!({"jobId":job,"exitCode":status.code(),"timedOut":timed_out,"cancelled":cancelled,"outputLimited":output_limited,"stdout":read_preview(&stdout)?,"stderr":read_preview(&stderr)?,"stdoutSha256":file_hash(&stdout)?,"stderrSha256":file_hash(&stderr)?,"stdoutBytes":fs::metadata(&stdout)?.len(),"stderrBytes":fs::metadata(&stderr)?.len(),"outputPaging":"Use read_command_output with jobId, stream, offset and limit; offsets count Unicode characters."});
    crate::verification::record(runtime, id, &verification_before, &mut result);
    if status.success() && !timed_out && !cancelled && !output_limited {
        runtime.sessions.get_mut(id).unwrap()["verified"] = json!(true);
    } else {
        runtime.sessions.get_mut(id).unwrap()["verified"] = json!(false);
    }
    atomic(&dir.join(format!("{job}.json")), &result)?;
    Ok(result)
}
fn package(runtime: &mut Runtime, id: &str, cancel: &CancelHandle) -> Result<Value> {
    let changes = execute(runtime, id, "changes", &json!({"limit":1000}), cancel)?;
    if changes["done"] != true {
        return Err("Package exceeds 1000 changed files; use a separate workspace backup".into());
    }
    let path = private(runtime, id, "packages")?.join(format!("{}.zip", ident()));
    let mut zip = zip::ZipWriter::new(File::create(&path)?);
    let options = zip::write::SimpleFileOptions::default()
        .compression_method(zip::CompressionMethod::Stored)
        .unix_permissions(0o600);
    let mut total = 0u64;
    let mut add = |name: String, bytes: Vec<u8>| -> Result<()> {
        total += bytes.len() as u64;
        if total > 100_000_000 {
            return Err("Package exceeds 100 MB".into());
        }
        zip.start_file(name, options)?;
        zip.write_all(&bytes)?;
        Ok(())
    };
    add(
        "session.json".into(),
        serde_json::to_vec_pretty(&runtime.sessions[id])?,
    )?;
    add("manifest.json".into(), serde_json::to_vec_pretty(&changes)?)?;
    add("RESULT.md".into(),b"# Native Rust agent result\n\nInspect session.json for observed verification and remaining limits. Files are current workspace snapshots, not deployments. Deleted files and arbitrary command side effects are not recoverable from this package.\n".to_vec())?;
    for change in changes["changes"].as_array().unwrap() {
        if change["status"] != "deleted" {
            let name = text(change, "path")?;
            let target = resolve(&runtime.root, name)?;
            if fs::metadata(&target)?.len() > 100_000_000 {
                return Err("Package file exceeds 100 MB".into());
            }
            add(format!("files/{name}"), fs::read(target)?)?;
        }
    }
    for folder in ["scripts", "commands", "memory"] {
        let root = private(runtime, id, folder)?;
        let mut files = vec![];
        walk(&root, &root, &mut files)?;
        for file in files {
            add(
                format!("{folder}/{file}"),
                fs::read(resolve(&root, &file)?)?,
            )?;
        }
    }
    for folder in ["skills", "workflows"] {
        for entry in fs::read_dir(runtime.state.join(folder))? {
            let path = entry?.path();
            if path.is_file() {
                add(
                    format!("{folder}/{}", path.file_name().unwrap().to_string_lossy()),
                    fs::read(path)?,
                )?;
            }
        }
    }
    zip.finish()?;
    Ok(json!({"path":path,"bytes":fs::metadata(&path)?.len(),"format":"zip"}))
}
