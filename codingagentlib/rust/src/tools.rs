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
    sync::{Arc, Mutex},
    thread,
    time::{Duration, Instant},
};
const LIMIT: usize = 2_000_000;
pub fn names() -> &'static [&'static str] {
    &[
        "project_knowledge",
        "read_project_instructions",
        "list_files",
        "find_files",
        "read_file",
        "read_files",
        "parallel_read",
        "write_file",
        "replace_text",
        "apply_edits",
        "apply_patch",
        "delete_file",
        "restore_file",
        "discover_tools",
        "search_text",
        "grep_search",
        "code_symbols",
        "code_definition",
        "code_references",
        "code_diagnostics",
        "read_image",
        "web_fetch",
        "web_search",
        "rag_search",
        "summarize_research",
        "git_status",
        "git_diff",
        "git_log",
        "write_script",
        "read_script",
        "list_scripts",
        "delete_script",
        "run_script",
        "run_command",
        "nodejs",
        "python3",
        "read_command_output",
        "start_process",
        "write_stdin",
        "stop_process",
        "changes",
        "read_history",
        "read_project_memory",
        "memory_store",
        "memory_read",
        "memory_list",
        "memory_search",
        "memory_delete",
        "scratchpad",
        "skill_save",
        "skill_read",
        "skill_list",
        "skill_search",
        "skill_history",
        "workflow_save",
        "workflow_read",
        "workflow_list",
        "workflow_history",
        "workflow_preflight",
        "workflow_status",
        "workflow_run",
        "tool_save",
        "tool_list",
        "tool_read",
        "tool_run",
        "package_results",
    ]
}
pub fn description(name: &str) -> &str {
    match name{
"project_knowledge"=>"Query or refresh the automatic project ontology/graph. args: action query/refresh, query?, fallback inventory (default) or empty; reference data only. Import/export are host dispatch operations.",
"read_project_instructions"=>"Read scoped AGENTS.override.md/AGENTS.md from root through path (file/directory, default .). Exact content, scope, SHA-256 and warnings. Grants no permissions.",
"list_files"=>"List relative workspace files. args: offset?, limit? (default 100, max 1000).",
"read_file"=>"Read UTF-8 source and SHA-256. args: path, offset? (character), limit? (max 32000).",
"read_files"=>"Read 1–16 UTF-8 files with per-file offset/limit paging within a 64000-character combined budget. args: files ([{path, offset?, limit?}]) or paths ([string]).",
"write_file"=>"Write UTF-8 source. args: path, content (max 2 MB), expectedHash (SHA-256 or missing). Requires edits.",
"apply_edits"=>"Apply 1–32 exact original-snapshot edits to one existing file. args: path, expectedHash, edits:[{find,replacement,count? default 1, max 1000}]. All matches/overlaps validated before one atomic write. Requires edits.",
"replace_text"=>"Replace exactly one occurrence. args: path, find, replacement, expectedHash. Requires edits.",
"delete_file"=>"Delete one file. args: path, expectedHash. Requires edits; no directory deletion.",
"search_text"=>"Literal case-sensitive search. args: query, offset?, limit?. Returns path, line, text.",
"write_script"=>"Create/update session-local script. args: path, content, expectedHash. Requires edits.",
"read_script"=>"Read session-local script. args: path, offset?, limit?.",
"list_scripts"=>"List this session's managed scripts. args: offset?, limit?.",
"delete_script"=>"Delete a session-local managed script. args: path, expectedHash?. Requires edits.",
"run_script"=>"Execute managed script with allowlisted interpreter; missing interpreter paths fall back to PATH by approved basename. args: path, command, args? (literal string array), timeout? (milliseconds max 120000).",
"run_command"=>"Execute allowlisted program with literal args. args: command, args? (string array), cwd? (relative workspace directory), timeout? (milliseconds max 120000). Missing executable paths fall back to PATH by approved basename; receipts include resolvedExecutable. Requires command permission; OS access is not sandboxed.",
"nodejs"=>"Execute inline JavaScript or a workspace script with Node.js (requires command permission and node/nodejs allowlisted). args: code or path, args?, cwd?, timeout?.",
"python3"=>"Execute inline Python 3 code or a workspace script with python3 (requires command permission and python3/python allowlisted). args: code or path, args?, cwd?, timeout?.",
"read_command_output"=>"Read persisted command output pages. Command receipts include stdoutSha256/stderrSha256 for full raw log bytes. args: jobId, stream? (stdout/stderr), offset?, limit?.",
"changes"=>"SHA-256 differences from initial session manifest. Reports added/modified/deleted files.",
"read_project_memory"=>"Read approved project note snapshot, not policy or verification. args: id, offset? (characters), limit? (1..8000). Cannot switch projects.",
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
"package_results"=>"Build session ZIP containing logs, changed readable files, scripts, skills/workflows and manifest. Does not include deleted file contents or command rollback.",
"find_files"=>"Find workspace files matching a glob pattern (optional path subdirectory, offset, limit).",
"grep_search"=>"Search workspace text with optional path subdirectory, glob include filter, caseSensitive flag, offset and limit.",
"parallel_read"=>"Run 1 to 8 read-only tool requests (read_file, list_files, find_files, search_text, grep_search) in one batch.",
"git_status"=>"Inspect read-only git working tree status and current branch.",
"git_diff"=>"Inspect read-only git diff (optional staged flag, path filter, offset, limit).",
"git_log"=>"Inspect read-only git commit history (optional limit, path filter, offset).",
"code_symbols"=>"Extract code symbol definitions (functions, structs, classes, traits, types) across workspace or file.",
"code_definition"=>"Resolve a symbol at a 1-based line and column to workspace symbol definitions.",
"code_references"=>"Find whole-word references to the symbol at a 1-based line and column across workspace files.",
"code_diagnostics"=>"Run read-only syntax and delimiter diagnostics on a workspace source file.",
"read_image"=>"Read a workspace image (.png, .jpg, .jpeg, .webp, .gif up to 8 MB) as base64 dataUrl with metadata.",
"web_fetch"=>"Fetch a public HTTPS URL (SSRF-guarded) with clean Markdown/code/text extraction, focus-aware truncation, and untrusted_web_content delimiters.",
"web_search"=>"Search the web via HTTPS returning metadata only (title, url, snippet <= 300 chars, published_date), optionally anchored by target_stack.",
"rag_search"=>"Query a configured state-of-the-art RAG database (qdrant, pinecone, weaviate, chroma, milvus, pgvector, elasticsearch, opensearch, lancedb, faiss, custom) with hybrid/dense/sparse/rerank search and untrusted_rag_content delimiters.",
"summarize_research"=>"Distill 1-5 fetched sources into a structured ResearchBrief (summary, version_constraints, code_examples, gotchas, citations) and discard raw pages.",
"restore_file"=>"Restore a file modified or deleted in the current session from its session backup (requires expectedHash).",
"apply_patch"=>"Apply a unified multi-file Codex-style patch (*** Begin Patch / Add File / Update File / Delete File / *** End Patch) atomically.",
"start_process"=>"Start an allowlisted interactive child process with piped stdin/stdout/stderr; returns processId.",
"write_stdin"=>"Write input (or eof) to a running interactive process and read available stdout/stderr output.",
"stop_process"=>"Terminate an interactive child process started by start_process.",
"discover_tools"=>"Find available tool names, descriptions, and schemas by keywords or exact names.",
"scratchpad"=>"Manage session-scoped key/value working scratchpad (set, get, delete, list).",
"memory_delete"=>"Delete one session memory document by id.",
"skill_history"=>"Inspect revision history metadata for a workspace skill.",
"workflow_history"=>"Inspect revision history metadata for a workspace workflow.",
"workflow_preflight"=>"Validate a workflow definition and inspect required permissions without executing.",
"workflow_status"=>"Inspect saved workflow run state and step results by runId.",
"tool_save"=>"Save a parameterized reusable script tool (any allowlisted interpreter) with JSON schema.",
"tool_list"=>"List or search saved reusable script tools in this workspace.",
"tool_read"=>"Read a saved reusable script tool definition and source.",
"tool_run"=>"Execute a saved reusable script tool by id with JSON input (requires allowCommands).",
_=>"Unsupported"}
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
#[derive(Debug)]
pub(crate) struct RevisionConflict {
    pub expected: String,
    pub actual: String,
}
impl std::fmt::Display for RevisionConflict {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "Stale file hash; read again. Current hash: {}", self.actual)
    }
}
impl std::error::Error for RevisionConflict {}
fn expected(path: &Path, args: &Value) -> Result<()> {
    let current = if path.exists() {
        file_hash(path)?
    } else {
        "missing".into()
    };
    let expected = text(args, "expectedHash")?;
    if expected != current {
        return Err(RevisionConflict { expected: expected.into(), actual: current }.into());
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
        "project_knowledge" => { let action=args["action"].as_str().unwrap_or("query");if !["query","refresh"].contains(&action){return Err("Agent knowledge tools are read-only".into());}let project=runtime.sessions[id]["knowledgeProject"].as_str().unwrap_or_else(||runtime.root.file_name().and_then(|v|v.to_str()).unwrap_or("workspace"));{let mut data=args.clone();data["action"]=json!(action);data["project"]=json!(project);crate::knowledge::dispatch(runtime,&data)} },
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
        "read_files" => {
            let specs: Vec<Value> = if let Some(arr) = args.get("files").and_then(|v| v.as_array()) {
                arr.clone()
            } else if let Some(arr) = args.get("paths").and_then(|v| v.as_array()) {
                arr.iter().map(|p| json!({ "path": p })).collect()
            } else {
                return Err("Provide files or paths array".into());
            };
            if specs.is_empty() || specs.len() > 16 {
                return Err("Provide 1–16 files to read_files".into());
            }
            let default_offset = args.get("offset").and_then(|v| v.as_u64()).unwrap_or(0);
            let default_limit = args.get("limit").and_then(|v| v.as_u64()).unwrap_or(12000).clamp(1, 32000);
            let budget = 64000usize;
            let mut used = 0usize;
            let mut out = Vec::new();
            let mut truncated = false;
            for spec in specs {
                let path_str = spec
                    .as_str()
                    .or_else(|| spec.get("path").and_then(|v| v.as_str()))
                    .ok_or("Each read_files entry requires a path")?;
                if used >= budget {
                    truncated = true;
                    out.push(json!({ "path": path_str, "skipped": true, "reason": "batch_budget" }));
                    continue;
                }
                let rem = budget - used;
                let off = spec.get("offset").and_then(|v| v.as_u64()).unwrap_or(default_offset);
                let lim = spec.get("limit").and_then(|v| v.as_u64()).unwrap_or(default_limit).min(rem as u64).max(1);
                let resolved = resolve(&runtime.root, path_str)?;
                let body = contents(&resolved)?;
                let mut res = page(&body, &json!({ "offset": off, "limit": lim }))?;
                used += res["text"].as_str().map(|s| s.chars().count()).unwrap_or(0);
                res["path"] = json!(path_str);
                res["hash"] = json!(hash(body.as_bytes()));
                out.push(res);
            }
            Ok(json!({ "files": out, "totalCharacters": used, "truncated": truncated }))
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
                        expected(&target, args)?;
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
        "find_files" => {
            let pattern = args.get("pattern").and_then(Value::as_str).unwrap_or("*");
            let sub = args.get("path").and_then(Value::as_str).unwrap_or("");
            let base = if sub.is_empty() {
                runtime.root.clone()
            } else {
                resolve(&runtime.root, sub)?
            };
            let mut files = vec![];
            if base.is_dir() {
                walk(&runtime.root, &base, &mut files)?;
            } else if base.is_file() && !sub.is_empty() {
                files.push(sub.replace('\\', "/"));
            }
            let matched: Vec<Value> = files
                .into_iter()
                .filter(|f| match_glob(pattern, f))
                .map(Value::String)
                .collect();
            rows(matched, args, "files")
        }
        "grep_search" => {
            let query = text(args, "query")?;
            if query.is_empty() {
                return Err("Provide a search query".into());
            }
            let sub = args.get("path").and_then(Value::as_str).unwrap_or("");
            let include = args.get("include").and_then(Value::as_str).unwrap_or("");
            let case_sensitive = args
                .get("caseSensitive")
                .and_then(Value::as_bool)
                .unwrap_or(true);
            let needle = if case_sensitive {
                query.to_owned()
            } else {
                query.to_lowercase()
            };
            let base = if sub.is_empty() {
                runtime.root.clone()
            } else {
                resolve(&runtime.root, sub)?
            };
            let mut files = vec![];
            if base.is_dir() {
                walk(&runtime.root, &base, &mut files)?;
            } else if base.is_file() && !sub.is_empty() {
                files.push(sub.replace('\\', "/"));
            }
            let mut matches = vec![];
            for file in files {
                if cancel.is_cancelled() {
                    return Err("Cancelled".into());
                }
                if !include.is_empty() && !match_glob(include, &file) {
                    continue;
                }
                if let Ok(body) = contents(&resolve(&runtime.root, &file)?) {
                    for (line, value) in body.lines().enumerate() {
                        let hit = if case_sensitive {
                            value.contains(&needle)
                        } else {
                            value.to_lowercase().contains(&needle)
                        };
                        if hit {
                            matches.push(json!({"path":file,"line":line+1,"text":value}));
                        }
                    }
                }
            }
            rows(matches, args, "matches")
        }
        "parallel_read" => {
            let requests = args
                .get("requests")
                .and_then(Value::as_array)
                .ok_or("Provide a requests array of 1 to 8 read-only tool calls")?;
            if requests.is_empty() || requests.len() > 8 {
                return Err("requests must contain between 1 and 8 items".into());
            }
            let allowed = [
                "read_file",
                "list_files",
                "find_files",
                "search_text",
                "grep_search",
            ];
            for req in requests {
                let t = text(req, "tool")?;
                if !allowed.contains(&t) {
                    return Err(format!("parallel_read does not allow tool: {t}").into());
                }
            }
            let mut out = Vec::with_capacity(requests.len());
            for (index, req) in requests.iter().enumerate() {
                if cancel.is_cancelled() {
                    return Err("Cancelled".into());
                }
                let t = text(req, "tool")?;
                let req_args = req.get("args").cloned().unwrap_or_else(|| json!({}));
                match execute(runtime, id, t, &req_args, cancel) {
                    Ok(res) => out.push(json!({"index":index,"tool":t,"ok":true,"result":res})),
                    Err(err) => {
                        out.push(json!({"index":index,"tool":t,"ok":false,"error":err.to_string()}))
                    }
                }
            }
            Ok(json!({"results":out,"count":out.len()}))
        }
        "git_status" => {
            let out = git_cmd(&runtime.root, &["status", "--porcelain=v1", "-b"])?;
            let mut branch = String::new();
            let mut entries = vec![];
            for line in out.lines() {
                if let Some(rest) = line.strip_prefix("## ") {
                    branch = rest.to_owned();
                } else if line.len() >= 4 {
                    entries.push(json!({
                        "status": line[..2].trim(),
                        "path": line[3..].trim()
                    }));
                }
            }
            Ok(json!({
                "branch": branch,
                "clean": entries.is_empty(),
                "total": entries.len(),
                "entries": entries
            }))
        }
        "git_diff" => {
            let staged = args.get("staged").and_then(Value::as_bool).unwrap_or(false);
            let mut cmd_args: Vec<String> = vec!["diff".into()];
            if staged {
                cmd_args.push("--staged".into());
            }
            if let Some(p) = args.get("path").and_then(Value::as_str) {
                if !p.is_empty() {
                    let _ = resolve(&runtime.root, p)?;
                    cmd_args.push("--".into());
                    cmd_args.push(p.to_owned());
                }
            }
            let refs: Vec<&str> = cmd_args.iter().map(String::as_str).collect();
            let out = git_cmd(&runtime.root, &refs)?;
            let mut paged = page(&out, args)?;
            if let Some(obj) = paged.as_object_mut() {
                obj.insert("staged".into(), json!(staged));
            }
            Ok(paged)
        }
        "git_log" => {
            let limit = args
                .get("limit")
                .and_then(Value::as_u64)
                .unwrap_or(20)
                .clamp(1, 200);
            let limit_str = limit.to_string();
            let mut cmd_args: Vec<String> =
                vec!["log".into(), "--oneline".into(), "-n".into(), limit_str];
            if let Some(p) = args.get("path").and_then(Value::as_str) {
                if !p.is_empty() {
                    let _ = resolve(&runtime.root, p)?;
                    cmd_args.push("--".into());
                    cmd_args.push(p.to_owned());
                }
            }
            let refs: Vec<&str> = cmd_args.iter().map(String::as_str).collect();
            let out = git_cmd(&runtime.root, &refs)?;
            let page_args = json!({"offset": args.get("offset").cloned().unwrap_or_else(|| json!(0))});
            page(&out, &page_args)
        }
        "code_symbols" => {
            let sub = args.get("path").and_then(Value::as_str).unwrap_or("");
            let query = args
                .get("query")
                .and_then(Value::as_str)
                .unwrap_or("")
                .to_lowercase();
            let base = if sub.is_empty() {
                runtime.root.clone()
            } else {
                resolve(&runtime.root, sub)?
            };
            let mut files = vec![];
            if base.is_dir() {
                walk(&runtime.root, &base, &mut files)?;
            } else if base.is_file() && !sub.is_empty() {
                files.push(sub.replace('\\', "/"));
            }
            let mut symbols = vec![];
            for file in files {
                if cancel.is_cancelled() {
                    return Err("Cancelled".into());
                }
                let ext = Path::new(&file)
                    .extension()
                    .and_then(|e| e.to_str())
                    .unwrap_or("");
                if ![
                    "rs", "py", "js", "ts", "cjs", "mjs", "tsx", "jsx", "go", "java",
                ]
                .contains(&ext)
                {
                    continue;
                }
                if let Ok(body) = contents(&resolve(&runtime.root, &file)?) {
                    for (kind, name, line) in extract_symbols(ext, &body) {
                        if query.is_empty() || name.to_lowercase().contains(&query) {
                            symbols.push(json!({"path":file,"kind":kind,"name":name,"line":line}));
                        }
                    }
                }
            }
            rows(symbols, args, "symbols")
        }
        "code_definition" => {
            let relative = text(args, "path")?;
            let line = args["line"]
                .as_u64()
                .ok_or("Provide 1-based line integer")? as usize;
            let column = args["column"]
                .as_u64()
                .ok_or("Provide 1-based column integer")? as usize;
            let source = contents(&resolve(&runtime.root, relative)?)?;
            let sym = identifier_at(&source, line, column)
                .ok_or("No identifier found at the specified line and column")?;
            let mut files = vec![];
            walk(&runtime.root, &runtime.root, &mut files)?;
            let mut defs = vec![];
            for file in files {
                if cancel.is_cancelled() {
                    return Err("Cancelled".into());
                }
                let ext = Path::new(&file)
                    .extension()
                    .and_then(|e| e.to_str())
                    .unwrap_or("");
                if !is_source_ext(ext) {
                    continue;
                }
                if let Ok(body) = contents(&resolve(&runtime.root, &file)?) {
                    for (kind, name, dline) in extract_symbols(ext, &body) {
                        if name == sym {
                            let text = body.lines().nth(dline - 1).unwrap_or("").trim();
                            defs.push(json!({"path":file,"kind":kind,"name":name,"line":dline,"text":text}));
                        }
                    }
                }
            }
            let mut res = rows(defs, args, "definitions")?;
            if let Some(obj) = res.as_object_mut() {
                obj.insert("symbol".into(), json!(sym));
            }
            Ok(res)
        }
        "code_references" => {
            let relative = text(args, "path")?;
            let line = args["line"]
                .as_u64()
                .ok_or("Provide 1-based line integer")? as usize;
            let column = args["column"]
                .as_u64()
                .ok_or("Provide 1-based column integer")? as usize;
            let source = contents(&resolve(&runtime.root, relative)?)?;
            let sym = identifier_at(&source, line, column)
                .ok_or("No identifier found at the specified line and column")?;
            let mut files = vec![];
            walk(&runtime.root, &runtime.root, &mut files)?;
            let mut refs = vec![];
            for file in files {
                if cancel.is_cancelled() {
                    return Err("Cancelled".into());
                }
                let ext = Path::new(&file)
                    .extension()
                    .and_then(|e| e.to_str())
                    .unwrap_or("");
                if !is_source_ext(ext) {
                    continue;
                }
                if let Ok(body) = contents(&resolve(&runtime.root, &file)?) {
                    for (lno, line_txt) in body.lines().enumerate() {
                        for col in whole_word_columns(line_txt, &sym) {
                            refs.push(json!({
                                "path": file,
                                "line": lno + 1,
                                "column": col,
                                "text": line_txt.trim()
                            }));
                        }
                    }
                }
            }
            let mut res = rows(refs, args, "references")?;
            if let Some(obj) = res.as_object_mut() {
                obj.insert("symbol".into(), json!(sym));
            }
            Ok(res)
        }
        "code_diagnostics" => {
            let relative = text(args, "path")?;
            let target = resolve(&runtime.root, relative)?;
            let body = contents(&target)?;
            let (engine, diags) = run_diagnostics(&target, relative, &body);
            let mut res = rows(diags, args, "diagnostics")?;
            if let Some(obj) = res.as_object_mut() {
                obj.insert("engine".into(), json!(engine));
            }
            Ok(res)
        }
        "web_fetch" | "web_search" | "rag_search" | "summarize_research"
            if runtime.research_config["enabled"] == false =>
        {
            return Err("Research module is disabled by configuration".into());
        }
        "web_fetch" => {
            let started = Instant::now();
            let url = text(args, "url")?;
            crate::research::validate_public_url(url, false)?;
            let raw = curl_https(url)?;
            let fmt = args.get("format").and_then(Value::as_str).unwrap_or("markdown");
            let focus = args.get("focus_query").and_then(Value::as_str);
            let max_chars = args
                .get("max_chars")
                .or_else(|| args.get("limit"))
                .and_then(Value::as_u64)
                .unwrap_or(crate::research::DEFAULT_MAX_CHARS as u64) as usize;
            let cleaned = crate::research::html_to_clean(&raw, fmt)?;
            let (bounded, truncated) = crate::research::focus_truncate(&cleaned, focus, max_chars);
            let wrapped = crate::research::wrap_untrusted(url, &bounded);
            Ok(json!({
                "url": url,
                "format": fmt,
                "text": wrapped,
                "truncated": truncated,
                "totalCharacters": cleaned.chars().count(),
                "trace": {
                    "trace_id": ident(),
                    "tool_name": "web_fetch",
                    "latency_ms": started.elapsed().as_millis() as u64,
                    "char_count": wrapped.chars().count(),
                    "truncated": truncated,
                    "error_code": Value::Null
                }
            }))
        }
        "web_search" => {
            let started = Instant::now();
            let query = text(args, "query")?;
            if query.trim().is_empty() {
                return Err("Provide a nonempty search query".into());
            }
            let lim = args
                .get("max_results")
                .or_else(|| args.get("limit"))
                .and_then(Value::as_u64)
                .unwrap_or(5)
                .clamp(1, 10) as usize;
            let anchored = match args.get("target_stack").and_then(Value::as_str) {
                Some(s) if !s.trim().is_empty() => format!("{} {}", query.trim(), s.trim()),
                _ => query.trim().to_owned(),
            };
            let encoded = percent_encode(&anchored);
            let url = format!("https://html.duckduckgo.com/html/?q={encoded}");
            crate::research::validate_public_url(&url, false)?;
            let html = curl_https(&url)?;
            let results: Vec<Value> = parse_ddg_html(&html, lim)
                .into_iter()
                .map(|mut item| {
                    if let Some(s) = item["snippet"].as_str() {
                        item["snippet"] = json!(s.chars().take(300).collect::<String>());
                    }
                    item["published_date"] = Value::Null;
                    item
                })
                .collect();
            Ok(json!({
                "query": anchored,
                "results": results,
                "total": results.len(),
                "trace": {
                    "trace_id": ident(),
                    "tool_name": "web_search",
                    "latency_ms": started.elapsed().as_millis() as u64,
                    "char_count": 0,
                    "truncated": false,
                    "error_code": Value::Null
                }
            }))
        }
        "summarize_research" => {
            let sources = args
                .get("sources")
                .and_then(Value::as_array)
                .ok_or("Provide 1 to 5 sources")?;
            let objective = args.get("objective").and_then(Value::as_str).unwrap_or("");
            let target_stack = args
                .get("target_stack")
                .and_then(Value::as_str)
                .or_else(|| {
                    runtime.research_config["targetStack"]
                        .as_str()
                        .filter(|s| !s.is_empty())
                });
            let budget_exhausted = args
                .get("budget_exhausted")
                .and_then(Value::as_bool)
                .unwrap_or(false);
            crate::research::summarize_research(sources, objective, target_stack, budget_exhausted)
        }
        "rag_search" => {
            let started = Instant::now();
            let query = text(args, "query")?;
            if query.trim().is_empty() {
                return Err("Provide a nonempty RAG search query".into());
            }
            let cfg = crate::research::normalize_research_config(&runtime.research_config)?;
            let rag = &cfg["rag"];
            let provider = args
                .get("provider")
                .and_then(Value::as_str)
                .unwrap_or_else(|| rag["provider"].as_str().unwrap_or("qdrant"))
                .trim()
                .to_ascii_lowercase();
            if !crate::research::RAG_PROVIDERS.contains(&provider.as_str()) {
                return Err(format!("Unsupported RAG provider {provider}").into());
            }
            let endpoint = args
                .get("endpoint")
                .and_then(Value::as_str)
                .unwrap_or_else(|| rag["endpoint"].as_str().unwrap_or(""))
                .trim();
            if endpoint.is_empty() {
                return Err("ERR_RAG_UNCONFIGURED: RAG endpoint is not configured".into());
            }
            let allow_localhost = rag["allowLocalhost"].as_bool().unwrap_or(true);
            crate::research::validate_rag_url(endpoint, allow_localhost)?;
            let collection = args
                .get("collection")
                .and_then(Value::as_str)
                .unwrap_or_else(|| rag["collection"].as_str().unwrap_or("default"));
            let namespace = args
                .get("namespace")
                .and_then(Value::as_str)
                .unwrap_or_else(|| rag["namespace"].as_str().unwrap_or(""));
            let search_mode = args
                .get("search_mode")
                .or_else(|| args.get("searchMode"))
                .and_then(Value::as_str)
                .unwrap_or_else(|| rag["searchMode"].as_str().unwrap_or("hybrid"));
            let top_k = args
                .get("top_k")
                .or_else(|| args.get("topK"))
                .and_then(Value::as_u64)
                .unwrap_or_else(|| rag["topK"].as_u64().unwrap_or(5))
                .clamp(1, 50) as usize;
            let min_score = args
                .get("min_score")
                .or_else(|| args.get("minScore"))
                .and_then(Value::as_f64)
                .unwrap_or_else(|| rag["minScore"].as_f64().unwrap_or(0.0))
                .clamp(0.0, 1.0);
            let max_chars = args
                .get("max_chars")
                .or_else(|| args.get("limit"))
                .and_then(Value::as_u64)
                .unwrap_or_else(|| cfg["maxChars"].as_u64().unwrap_or(crate::research::DEFAULT_MAX_CHARS as u64))
                .clamp(100, crate::research::HARD_MAX_CHARS as u64) as usize;
            let stack = args
                .get("target_stack")
                .and_then(Value::as_str)
                .unwrap_or_else(|| cfg["targetStack"].as_str().unwrap_or(""));
            let anchored = if stack.trim().is_empty() {
                query.trim().to_owned()
            } else {
                format!("{} {}", query.trim(), stack.trim())
            };
            let api_key = rag["apiKey"].as_str().unwrap_or("");
            let timeout_ms = rag["timeoutMs"].as_u64().unwrap_or(5000);
            let emb_endpoint = rag["embeddingEndpoint"].as_str().unwrap_or("");
            let mut vector_val: Option<Value> = None;
            if !emb_endpoint.is_empty() {
                crate::research::validate_rag_url(emb_endpoint, allow_localhost)?;
                let mut emb_headers = serde_json::Map::new();
                if !api_key.is_empty() {
                    emb_headers.insert("Authorization".into(), json!(format!("Bearer {api_key}")));
                }
                let emb_model = rag["embeddingModel"].as_str().unwrap_or("");
                let mut emb_payload = json!({"input": anchored});
                if !emb_model.is_empty() {
                    emb_payload["model"] = json!(emb_model);
                }
                let emb_resp = curl_post_json(emb_endpoint, &emb_payload, &emb_headers, timeout_ms)?;
                if let Some(v) = emb_resp["data"][0]["embedding"].as_array().or_else(|| emb_resp["embedding"].as_array()) {
                    vector_val = Some(Value::Array(v.clone()));
                }
            }
            let (req_url, req_payload, req_headers) = crate::research::build_rag_request(
                &provider,
                endpoint,
                &anchored,
                collection,
                namespace,
                top_k,
                min_score,
                search_mode,
                api_key,
                vector_val.as_ref(),
                args.get("filter"),
                rag.get("headers"),
            );
            let raw_data = curl_post_json(&req_url, &req_payload, &req_headers, timeout_ms)?;
            let hits = crate::research::parse_rag_response(&provider, &raw_data, collection, top_k, min_score);
            let per_hit_cap = (max_chars / hits.len().max(1)).max(200);
            let mut any_truncated = false;
            let mut total_chars = 0usize;
            let mut results = vec![];
            for hit in hits {
                let raw_content = hit["content"].as_str().unwrap_or("");
                let (bounded, trunc) = crate::research::focus_truncate(raw_content, Some(query), per_hit_cap);
                any_truncated |= trunc;
                let source = hit["source"].as_str().unwrap_or("");
                let wrapped = crate::research::wrap_untrusted_rag(&provider, source, &bounded);
                total_chars += wrapped.chars().count();
                results.push(json!({
                    "id": hit["id"],
                    "title": hit["title"],
                    "source": source,
                    "url": source,
                    "content": wrapped,
                    "text": wrapped,
                    "score": hit["score"],
                    "truncated": trunc,
                    "metadata": hit["metadata"],
                }));
            }
            Ok(json!({
                "provider": provider,
                "collection": collection,
                "search_mode": search_mode,
                "query": anchored,
                "results": results,
                "total": results.len(),
                "trace": {
                    "trace_id": ident(),
                    "tool_name": "rag_search",
                    "provider": provider,
                    "collection": collection,
                    "search_mode": search_mode,
                    "latency_ms": started.elapsed().as_millis() as u64,
                    "char_count": total_chars,
                    "truncated": any_truncated,
                    "error_code": Value::Null
                }
            }))
        }
        "read_image" => {
            let relative = text(args, "path")?;
            let target = resolve(&runtime.root, relative)?;
            let ext = target
                .extension()
                .and_then(|e| e.to_str())
                .map(|s| s.to_ascii_lowercase())
                .unwrap_or_default();
            let mime = match ext.as_str() {
                "png" => "image/png",
                "jpg" | "jpeg" => "image/jpeg",
                "webp" => "image/webp",
                "gif" => "image/gif",
                _ => return Err("Unsupported image extension; use png, jpg, jpeg, webp, or gif".into()),
            };
            let meta = fs::metadata(&target)?;
            if meta.len() > 8 * 1024 * 1024 {
                return Err("Image exceeds 8 MB limit".into());
            }
            let bytes = fs::read(&target)?;
            let sha = hash(&bytes);
            let b64 = base64_encode(&bytes);
            Ok(json!({
                "path": relative,
                "mimeType": mime,
                "bytes": bytes.len(),
                "sha256": sha,
                "dataUrl": format!("data:{mime};base64,{b64}")
            }))
        }
        "restore_file" => {
            permission(runtime, id, "allowEdits")?;
            let relative = text(args, "path")?;
            let target = resolve(&runtime.root, relative)?;
            expected(&target, args)?;
            let dir = private(runtime, id, "backups")?;
            let key = hash(relative.as_bytes());
            let record_path = dir.join(format!("{key}.json"));
            if !record_path.exists() {
                return Err(format!("No session backup recorded for {relative}").into());
            }
            let rec: Value = serde_json::from_slice(&fs::read(&record_path)?)?;
            let existed = rec["existed"].as_bool().unwrap_or(false);
            if existed {
                let backup_file = dir.join(&key);
                if let Some(parent) = target.parent() {
                    fs::create_dir_all(parent)?;
                }
                fs::copy(&backup_file, &target)?;
            } else if target.exists() {
                fs::remove_file(&target)?;
            }
            edited(runtime, id);
            Ok(json!({
                "restored": true,
                "path": relative,
                "existed": existed,
                "sha256": rec["sha256"]
            }))
        }
        "apply_patch" => {
            permission(runtime, id, "allowEdits")?;
            let patch = text(args, "patch")?;
            let ops = crate::edits::parse_patch(patch)?;
            enum Prepared {
                Write(String, PathBuf, String, &'static str),
                Delete(String, PathBuf),
            }
            let mut prepared = Vec::with_capacity(ops.len());
            for (rel, op) in ops {
                let target = resolve(&runtime.root, &rel)?;
                match op {
                    crate::edits::PatchOp::Add(body) => {
                        if target.exists() {
                            return Err(format!("Add File target already exists: {rel}").into());
                        }
                        prepared.push(Prepared::Write(rel, target, body, "added"));
                    }
                    crate::edits::PatchOp::Delete => {
                        if !target.is_file() {
                            return Err(format!("Delete File target does not exist: {rel}").into());
                        }
                        prepared.push(Prepared::Delete(rel, target));
                    }
                    crate::edits::PatchOp::Update(hunks) => {
                        let source = contents(&target)?;
                        let updated = crate::edits::apply_hunks(&source, &hunks)?;
                        prepared.push(Prepared::Write(rel, target, updated, "updated"));
                    }
                }
            }
            let mut summary = Vec::with_capacity(prepared.len());
            for item in prepared {
                match item {
                    Prepared::Write(rel, target, body, action) => {
                        backup(runtime, id, &rel, &target)?;
                        write(&target, &body)?;
                        summary.push(json!({
                            "path": rel,
                            "action": action,
                            "bytes": body.len(),
                            "hash": hash(body.as_bytes())
                        }));
                    }
                    Prepared::Delete(rel, target) => {
                        backup(runtime, id, &rel, &target)?;
                        fs::remove_file(&target)?;
                        summary.push(json!({
                            "path": rel,
                            "action": "deleted"
                        }));
                    }
                }
            }
            edited(runtime, id);
            Ok(json!({"applied": true, "files": summary}))
        }
        "discover_tools" => {
            let query = args
                .get("query")
                .and_then(Value::as_str)
                .unwrap_or("")
                .to_lowercase();
            let exact: Option<Vec<&str>> = args.get("names").and_then(Value::as_array).map(|arr| {
                arr.iter().filter_map(Value::as_str).collect()
            });
            let mut found = vec![];
            for &tool_name in names() {
                if let Some(ref list) = exact {
                    if !list.contains(&tool_name) {
                        continue;
                    }
                } else if !query.is_empty() {
                    let hay = format!("{} {}", tool_name, description(tool_name)).to_lowercase();
                    if !hay.contains(&query) {
                        continue;
                    }
                }
                found.push(json!({
                    "name": tool_name,
                    "description": description(tool_name),
                    "permission": tool_permission(tool_name),
                    "parameters": schema(tool_name)
                }));
            }
            rows(found, args, "tools")
        }
        "delete_script" => {
            permission(runtime, id, "allowEdits")?;
            let root = private(runtime, id, "scripts")?;
            let relative = text(args, "path")?;
            let target = resolve(&root, relative)?;
            if args.get("expectedHash").is_some() {
                expected(&target, args)?;
            }
            fs::remove_file(&target)?;
            Ok(json!({"deleted": relative}))
        }
        "run_command" | "run_script" => run_command(runtime, id, name, args, cancel),
        "nodejs" | "python3" => run_interpreter_tool(runtime, id, name, args, cancel),
        "start_process" => start_process(runtime, id, args),
        "write_stdin" => write_stdin(runtime, id, args, cancel),
        "stop_process" => stop_process(runtime, id, args),
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
                            Some("run_command" | "run_script" | "nodejs" | "python3")
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
        "read_project_memory" => {
            let snapshot=&runtime.sessions[id]["projectMemorySnapshot"];
            let notes=snapshot["notes"].as_array().ok_or("Run has no approved project-memory snapshot")?;
            let note_id=text(args,"id")?;
            let note=notes.iter().find(|n|n["id"].as_str()==Some(note_id)).ok_or("Note is not in this run's approved project snapshot")?;
            let offset=args["offset"].as_u64().unwrap_or(0) as usize;
            let limit=args["limit"].as_u64().unwrap_or(2000) as usize;
            if limit==0||limit>8000{return Err("Memory read limit must be 1..8000".into());}
            let chars:Vec<char>=note["text"].as_str().ok_or("Invalid note text")?.chars().collect();
            let start=offset.min(chars.len());let end=(start+limit).min(chars.len());
            let mut value=note.clone();value["text"]=json!(chars[start..end].iter().collect::<String>());value["offset"]=json!(start);value["nextOffset"]=json!(end);value["totalCharacters"]=json!(chars.len());value["done"]=json!(end==chars.len());value["project"]=snapshot["project"].clone();Ok(value)
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
        "memory_delete" => {
            let key = text(args, "id")?;
            valid_id(key)?;
            let path = private(runtime, id, "memory")?.join(format!("{key}.json"));
            let existed = path.exists();
            if existed {
                fs::remove_file(&path)?;
            }
            Ok(json!({"id": key, "deleted": existed}))
        }
        "skill_history" | "workflow_history" => {
            let kind = if name == "skill_history" {
                "skills"
            } else {
                "workflows"
            };
            let key = text(args, "id")?;
            valid_id(key)?;
            let path = runtime.state.join(kind).join(format!("{key}.json"));
            let value: Value = serde_json::from_slice(&fs::read(path)?)?;
            let hist = value["history"]
                .as_array()
                .cloned()
                .unwrap_or_default();
            rows(hist, args, "revisions")
        }
        "workflow_preflight" => {
            let steps = args["definition"]["steps"]
                .as_array()
                .ok_or("Workflow needs steps")?;
            if steps.is_empty() || steps.len() > 16 {
                return Err("Use 1–16 workflow steps".into());
            }
            let mut perms = std::collections::BTreeSet::new();
            let mut missing_commands = vec![];
            for step in steps {
                let tool_name = text(step, "tool")?;
                if !is_workflow_step_tool(tool_name) || !step["args"].is_object() {
                    return Err("Unsupported workflow step; use literal file/script/program tools".into());
                }
                perms.insert(tool_permission(tool_name));
                if tool_name == "run_command" {
                    if let Some(cmd) = step["args"].get("command").and_then(Value::as_str) {
                        if runtime.resolve_command(cmd).is_err() {
                            missing_commands.push(cmd.to_owned());
                        }
                    }
                }
            }
            Ok(json!({
                "valid": missing_commands.is_empty(),
                "steps": steps.len(),
                "permissions": perms.into_iter().collect::<Vec<_>>(),
                "missingCommands": missing_commands
            }))
        }
        "workflow_status" => {
            let run_id = text(args, "runId")?;
            valid_id(run_id)?;
            let path = private(runtime, id, "workflows")?.join(format!("{run_id}.json"));
            let value: Value = serde_json::from_slice(&fs::read(path)?)?;
            Ok(value)
        }
        "tool_save" => {
            permission(runtime, id, "allowEdits")?;
            let key = text(args, "id")?;
            valid_id(key)?;
            let interpreter = text(args, "interpreter")?;
            let source = text(args, "source")?;
            if source.len() > LIMIT {
                return Err("Tool source exceeds 2 MB".into());
            }
            let dir = runtime.state.join("tools");
            fs::create_dir_all(&dir)?;
            let path = dir.join(format!("{key}.json"));
            let previous = if path.exists() {
                serde_json::from_slice::<Value>(&fs::read(&path)?)?
            } else {
                json!({"revision":0,"history":[]})
            };
            let revision = previous["revision"].as_u64().ok_or("Invalid revision record")?;
            if args["expectedRevision"].as_u64() != Some(revision) {
                return Err("Stale revision; read the current tool record".into());
            }
            let mut value = json!({
                "id": key,
                "revision": revision + 1,
                "name": args["name"].as_str().unwrap_or(key),
                "description": args["description"].as_str().unwrap_or(""),
                "interpreter": interpreter,
                "parameters": args.get("parameters").cloned().unwrap_or_else(|| json!({"type":"object","properties":{}})),
                "source": source
            });
            let mut history = previous["history"].as_array().cloned().unwrap_or_default();
            history.push(value.clone());
            value["history"] = Value::Array(history);
            atomic(&path, &value)?;
            Ok(json!({"id": key, "revision": revision + 1}))
        }
        "tool_list" => {
            let dir = runtime.state.join("tools");
            if !dir.exists() {
                return rows(vec![], args, "tools");
            }
            let query = args.get("query").and_then(Value::as_str).unwrap_or("").to_lowercase();
            let mut items = vec![];
            for entry in fs::read_dir(&dir)? {
                let path = entry?.path();
                if path.extension().and_then(|v| v.to_str()) != Some("json") {
                    continue;
                }
                let mut val: Value = serde_json::from_slice(&fs::read(path)?)?;
                if let Some(obj) = val.as_object_mut() {
                    obj.remove("history");
                    obj.remove("source");
                }
                if query.is_empty() || val.to_string().to_lowercase().contains(&query) {
                    items.push(val);
                }
            }
            items.sort_by_key(|v| v["id"].as_str().unwrap_or("").to_owned());
            rows(items, args, "tools")
        }
        "tool_read" => {
            let key = text(args, "id")?;
            valid_id(key)?;
            let path = runtime.state.join("tools").join(format!("{key}.json"));
            let value: Value = serde_json::from_slice(&fs::read(path)?)?;
            if let Some(rev) = args.get("revision").and_then(Value::as_u64) {
                return value["history"]
                    .as_array()
                    .ok_or("Missing revision history")?
                    .iter()
                    .find(|v| v["revision"] == rev)
                    .cloned()
                    .ok_or_else(|| "Unknown revision".into());
            }
            Ok(value)
        }
        "tool_run" => {
            permission(runtime, id, "allowCommands")?;
            let key = text(args, "id")?;
            valid_id(key)?;
            let path = runtime.state.join("tools").join(format!("{key}.json"));
            let value: Value = serde_json::from_slice(&fs::read(path)?)?;
            let target_rev = args.get("revision").and_then(Value::as_u64);
            let rec = if let Some(rev) = target_rev {
                value["history"]
                    .as_array()
                    .and_then(|h| h.iter().find(|v| v["revision"] == rev).cloned())
                    .ok_or("Unknown tool revision")?
            } else {
                value.clone()
            };
            let interpreter = text(&rec, "interpreter")?;
            let source = text(&rec, "source")?;
            let script_name = format!("tool-{key}-r{}.script", rec["revision"].as_u64().unwrap_or(1));
            let script_path = resolve(&private(runtime, id, "scripts")?, &script_name)?;
            write(&script_path, source)?;
            let mut run_args = json!({
                "path": script_name,
                "command": interpreter,
                "args": if args.get("input").is_some() { vec![serde_json::to_string(&args["input"])?] } else { vec![] },
                "timeout": args.get("timeout").and_then(Value::as_u64).unwrap_or(30000)
            });
            if let Some(cwd) = args.get("cwd").and_then(Value::as_str) {
                run_args["cwd"] = json!(cwd);
            }
            let mut res = run_command(runtime, id, "run_script", &run_args, cancel)?;
            if let Some(obj) = res.as_object_mut() {
                obj.insert("toolId".into(), json!(key));
                obj.insert("revision".into(), rec["revision"].clone());
            }
            Ok(res)
        }
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
                    if !is_workflow_step_tool(text(step, "tool")?) || !step["args"].is_object() {
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
                    let state = json!({"runId":run,"status":"failed","results":results});
                    let _ = atomic(&private(runtime, id, "workflows")?.join(format!("{run}.json")), &state);
                    return Ok(state);
                }
            }
            let state = json!({"runId":run,"status":"complete","results":results});
            let _ = atomic(&private(runtime, id, "workflows")?.join(format!("{run}.json")), &state);
            Ok(state)
        }
        "package_results" => package(runtime, id, cancel),
        "scratchpad" => {
            let action = args.get("action").and_then(Value::as_str).unwrap_or("list");
            let pad_path = private(runtime, id, "scratchpad")?.join("pad.json");
            let mut pad: serde_json::Map<String, Value> = if pad_path.exists() {
                serde_json::from_slice::<Value>(&fs::read(&pad_path)?)?
                    .as_object()
                    .cloned()
                    .unwrap_or_default()
            } else {
                serde_json::Map::new()
            };
            match action {
                "list" => Ok(json!({"items": pad})),
                "get" => {
                    let key = text(args, "key")?;
                    Ok(json!({"key": key, "value": pad.get(key).cloned().unwrap_or(Value::Null), "exists": pad.contains_key(key)}))
                }
                "set" => {
                    let key = text(args, "key")?;
                    valid_id(key)?;
                    let val = args.get("value").cloned().unwrap_or(Value::Null);
                    if args.get("append").and_then(Value::as_bool) == Some(true) {
                        let prev = pad.get(key).and_then(Value::as_str).unwrap_or("");
                        let add = val.as_str().unwrap_or("");
                        pad.insert(key.to_owned(), Value::String(format!("{prev}{add}")));
                    } else {
                        pad.insert(key.to_owned(), val.clone());
                    }
                    atomic(&pad_path, &Value::Object(pad.clone()))?;
                    Ok(json!({"key": key, "value": pad.get(key).cloned().unwrap_or(Value::Null)}))
                }
                "delete" => {
                    let key = text(args, "key")?;
                    let removed = pad.remove(key).is_some();
                    atomic(&pad_path, &Value::Object(pad))?;
                    Ok(json!({"key": key, "deleted": removed}))
                }
                _ => Err("Unsupported scratchpad action; use set, get, delete or list".into()),
            }
        }
        _ => Err(format!("Unsupported native Rust tool: {name}").into()),
    }
}
fn is_workflow_step_tool(name: &str) -> bool {
    matches!(
        name,
        "read_file"
            | "write_file"
            | "replace_text"
            | "apply_edits"
            | "apply_patch"
            | "delete_file"
            | "restore_file"
            | "write_script"
            | "read_script"
            | "delete_script"
            | "run_script"
            | "nodejs"
            | "python3"
            | "run_command"
            | "search_text"
            | "grep_search"
            | "list_files"
            | "find_files"
            | "changes"
    )
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
fn run_interpreter_tool(
    runtime: &mut Runtime,
    id: &str,
    name: &str,
    args: &Value,
    cancel: &CancelHandle,
) -> Result<Value> {
    let code = args.get("code").and_then(Value::as_str);
    let path_arg = args.get("path").and_then(Value::as_str);
    if code.is_some() == path_arg.is_some() {
        return Err(format!("{name} requires exactly one of code or path").into());
    }
    let mut argv: Vec<String> = Vec::new();
    if let Some(src) = code {
        if src.trim().is_empty() {
            return Err("code must be a nonempty string".into());
        }
        argv.push(if name == "nodejs" { "-e" } else { "-c" }.to_owned());
        argv.push(src.to_owned());
    } else if let Some(rel) = path_arg {
        let resolved = resolve(&runtime.root, rel)?;
        if !resolved.is_file() {
            return Err(format!("Script not found: {rel}").into());
        }
        argv.push(resolved.to_string_lossy().into_owned());
    }
    if let Some(extra) = args.get("args") {
        let arr = extra.as_array().ok_or("args must be an array of strings")?;
        for item in arr {
            argv.push(item.as_str().ok_or("args must be an array of strings")?.to_owned());
        }
    }
    let candidates: &[&str] = if name == "nodejs" {
        &["node", "nodejs"]
    } else {
        &["python3", "python"]
    };
    let exe = candidates
        .iter()
        .find(|c| runtime.allowed.contains_key(**c))
        .copied()
        .unwrap_or(candidates[0]);
    let mut cmd_args = json!({"command": exe, "args": argv});
    if let Some(cwd) = args.get("cwd") {
        cmd_args["cwd"] = cwd.clone();
    }
    if let Some(timeout) = args.get("timeout") {
        cmd_args["timeout"] = timeout.clone();
    }
    run_command(runtime, id, "run_command", &cmd_args, cancel)
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
    let executable = runtime.resolve_command(command)?;
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
    let mut program = Command::new(&executable);
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
    let mut result = json!({"jobId":job,"command":command,"resolvedExecutable":executable,"exitCode":status.code(),"timedOut":timed_out,"cancelled":cancelled,"outputLimited":output_limited,"stdout":read_preview(&stdout)?,"stderr":read_preview(&stderr)?,"stdoutSha256":file_hash(&stdout)?,"stderrSha256":file_hash(&stderr)?,"stdoutBytes":fs::metadata(&stdout)?.len(),"stderrBytes":fs::metadata(&stderr)?.len(),"outputPaging":"Use read_command_output with jobId, stream, offset and limit; offsets count Unicode characters."});
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

pub const SCRIPT_TOOL_NAMES: &[&str] = &[
    "list_scripts",
    "write_script",
    "read_script",
    "delete_script",
    "run_script",
];

pub const PROGRAM_TOOL_NAMES: &[&str] = &[
    "run_command",
    "read_command_output",
    "run_script",
];

pub fn schema(name: &str) -> Value {
    match name {
        "write_script" => json!({"type":"object","required":["path","content","expectedHash"],"properties":{"path":{"type":"string"},"content":{"type":"string"},"expectedHash":{"type":"string"}}}),
        "read_script" => json!({"type":"object","required":["path"],"properties":{"path":{"type":"string"},"offset":{"type":"integer","minimum":0},"limit":{"type":"integer","minimum":1,"maximum":32000}}}),
        "list_scripts" | "list_files" => json!({"type":"object","properties":{"offset":{"type":"integer","minimum":0},"limit":{"type":"integer","minimum":1,"maximum":1000}}}),
        "delete_script" => json!({"type":"object","required":["path"],"properties":{"path":{"type":"string"},"expectedHash":{"type":"string"}}}),
        "run_script" => json!({"type":"object","required":["path","command"],"properties":{"path":{"type":"string"},"command":{"type":"string"},"args":{"type":"array","items":{"type":"string"}},"timeout":{"type":"integer","minimum":100,"maximum":120000}}}),
        "run_command" => json!({"type":"object","required":["command"],"properties":{"command":{"type":"string"},"args":{"type":"array","items":{"type":"string"}},"cwd":{"type":"string"},"timeout":{"type":"integer","minimum":100,"maximum":120000}}}),
        "nodejs" => json!({"type":"object","properties":{"code":{"type":"string"},"path":{"type":"string"},"args":{"type":"array","items":{"type":"string"}},"cwd":{"type":"string"},"timeout":{"type":"integer","minimum":100,"maximum":120000}}}),
        "python3" => json!({"type":"object","properties":{"code":{"type":"string"},"path":{"type":"string"},"args":{"type":"array","items":{"type":"string"}},"cwd":{"type":"string"},"timeout":{"type":"integer","minimum":100,"maximum":120000}}}),
        "read_command_output" => json!({"type":"object","required":["jobId"],"properties":{"jobId":{"type":"string"},"stream":{"type":"string","enum":["stdout","stderr"]},"offset":{"type":"integer","minimum":0},"limit":{"type":"integer","minimum":1,"maximum":32000}}}),
        "read_file" => json!({"type":"object","required":["path"],"properties":{"path":{"type":"string"},"offset":{"type":"integer","minimum":0},"limit":{"type":"integer","minimum":1,"maximum":32000}}}),
        "read_files" => json!({"type":"object","properties":{"files":{"type":"array","items":{"type":"object"}},"paths":{"type":"array","items":{"type":"string"}},"offset":{"type":"integer","minimum":0},"limit":{"type":"integer","minimum":1,"maximum":32000}}}),
        "write_file" => json!({"type":"object","required":["path","content","expectedHash"],"properties":{"path":{"type":"string"},"content":{"type":"string"},"expectedHash":{"type":"string"}}}),
        "replace_text" => json!({"type":"object","required":["path","find","replacement","expectedHash"],"properties":{"path":{"type":"string"},"find":{"type":"string"},"replacement":{"type":"string"},"expectedHash":{"type":"string"}}}),
        "apply_edits" => json!({"type":"object","required":["path","expectedHash","edits"],"properties":{"path":{"type":"string"},"expectedHash":{"type":"string"},"edits":{"type":"array","items":{"type":"object"}}}}),
        "delete_file" => json!({"type":"object","required":["path","expectedHash"],"properties":{"path":{"type":"string"},"expectedHash":{"type":"string"}}}),
        "restore_file" => json!({"type":"object","required":["path","expectedHash"],"properties":{"path":{"type":"string"},"expectedHash":{"type":"string"}}}),
        "apply_patch" => json!({"type":"object","required":["patch"],"properties":{"patch":{"type":"string"}}}),
        "start_process" => json!({"type":"object","required":["command"],"properties":{"command":{"type":"string"},"args":{"type":"array","items":{"type":"string"}},"cwd":{"type":"string"}}}),
        "write_stdin" => json!({"type":"object","required":["processId"],"properties":{"processId":{"type":"string"},"input":{"type":"string"},"eof":{"type":"boolean"},"waitMs":{"type":"integer","minimum":0,"maximum":5000}}}),
        "stop_process" => json!({"type":"object","required":["processId"],"properties":{"processId":{"type":"string"}}}),
        "discover_tools" => json!({"type":"object","properties":{"query":{"type":"string"},"names":{"type":"array","items":{"type":"string"}},"offset":{"type":"integer","minimum":0},"limit":{"type":"integer","minimum":1,"maximum":200}}}),
        "scratchpad" => json!({"type":"object","properties":{"action":{"type":"string","enum":["set","get","delete","list"]},"key":{"type":"string"},"value":{},"append":{"type":"boolean"}}}),
        "memory_delete" => json!({"type":"object","required":["id"],"properties":{"id":{"type":"string"}}}),
        "skill_history" => json!({"type":"object","required":["id"],"properties":{"id":{"type":"string"},"offset":{"type":"integer","minimum":0},"limit":{"type":"integer","minimum":1,"maximum":1000}}}),
        "workflow_history" => json!({"type":"object","required":["id"],"properties":{"id":{"type":"string"},"offset":{"type":"integer","minimum":0},"limit":{"type":"integer","minimum":1,"maximum":1000}}}),
        "workflow_preflight" => json!({"type":"object","required":["definition"],"properties":{"definition":{"type":"object"}}}),
        "workflow_status" => json!({"type":"object","required":["runId"],"properties":{"runId":{"type":"string"}}}),
        "tool_save" => json!({"type":"object","required":["id","interpreter","source","expectedRevision"],"properties":{"id":{"type":"string"},"name":{"type":"string"},"description":{"type":"string"},"interpreter":{"type":"string"},"source":{"type":"string"},"parameters":{"type":"object"},"expectedRevision":{"type":"integer","minimum":0}}}),
        "tool_list" => json!({"type":"object","properties":{"query":{"type":"string"},"offset":{"type":"integer","minimum":0},"limit":{"type":"integer","minimum":1,"maximum":1000}}}),
        "tool_read" => json!({"type":"object","required":["id"],"properties":{"id":{"type":"string"},"revision":{"type":"integer","minimum":1}}}),
        "tool_run" => json!({"type":"object","required":["id"],"properties":{"id":{"type":"string"},"revision":{"type":"integer","minimum":1},"input":{"type":"object"},"cwd":{"type":"string"},"timeout":{"type":"integer","minimum":1,"maximum":120000}}}),
        "search_text" => json!({"type":"object","required":["query"],"properties":{"query":{"type":"string"},"offset":{"type":"integer","minimum":0},"limit":{"type":"integer","minimum":1,"maximum":1000}}}),
        "find_files" => json!({"type":"object","properties":{"pattern":{"type":"string"},"path":{"type":"string"},"offset":{"type":"integer","minimum":0},"limit":{"type":"integer","minimum":1,"maximum":1000}}}),
        "grep_search" => json!({"type":"object","required":["query"],"properties":{"query":{"type":"string"},"path":{"type":"string"},"include":{"type":"string"},"caseSensitive":{"type":"boolean"},"offset":{"type":"integer","minimum":0},"limit":{"type":"integer","minimum":1,"maximum":1000}}}),
        "parallel_read" => json!({"type":"object","required":["requests"],"properties":{"requests":{"type":"array","minItems":1,"maxItems":8,"items":{"type":"object","required":["tool"],"properties":{"tool":{"type":"string","enum":["read_file","list_files","find_files","search_text","grep_search"]},"args":{"type":"object"}}}}}}),
        "git_status" => json!({"type":"object","properties":{}}),
        "git_diff" => json!({"type":"object","properties":{"staged":{"type":"boolean"},"path":{"type":"string"},"offset":{"type":"integer","minimum":0},"limit":{"type":"integer","minimum":1,"maximum":200000}}}),
        "git_log" => json!({"type":"object","properties":{"limit":{"type":"integer","minimum":1,"maximum":200},"path":{"type":"string"},"offset":{"type":"integer","minimum":0}}}),
        "code_symbols" => json!({"type":"object","properties":{"path":{"type":"string"},"query":{"type":"string"},"offset":{"type":"integer","minimum":0},"limit":{"type":"integer","minimum":1,"maximum":1000}}}),
        "code_definition" => json!({"type":"object","required":["path","line","column"],"properties":{"path":{"type":"string"},"line":{"type":"integer","minimum":1},"column":{"type":"integer","minimum":1},"offset":{"type":"integer","minimum":0},"limit":{"type":"integer","minimum":1,"maximum":1000}}}),
        "code_references" => json!({"type":"object","required":["path","line","column"],"properties":{"path":{"type":"string"},"line":{"type":"integer","minimum":1},"column":{"type":"integer","minimum":1},"offset":{"type":"integer","minimum":0},"limit":{"type":"integer","minimum":1,"maximum":1000}}}),
        "code_diagnostics" => json!({"type":"object","required":["path"],"properties":{"path":{"type":"string"},"offset":{"type":"integer","minimum":0},"limit":{"type":"integer","minimum":1,"maximum":1000}}}),
        "read_image" => json!({"type":"object","required":["path"],"properties":{"path":{"type":"string"}}}),
        "web_fetch" => json!({"type":"object","required":["url"],"properties":{"url":{"type":"string"},"focus_query":{"type":"string"},"format":{"type":"string","enum":["markdown","code_only","text"]},"max_chars":{"type":"integer","minimum":100,"maximum":25000}}}),
        "web_search" => json!({"type":"object","required":["query"],"properties":{"query":{"type":"string"},"target_stack":{"type":"string"},"max_results":{"type":"integer","minimum":1,"maximum":10}}}),
        "rag_search" => json!({"type":"object","required":["query"],"properties":{"query":{"type":"string"},"provider":{"type":"string","enum":["qdrant","pinecone","weaviate","chroma","milvus","pgvector","elasticsearch","opensearch","lancedb","faiss","custom"]},"collection":{"type":"string"},"namespace":{"type":"string"},"search_mode":{"type":"string","enum":["hybrid","dense","sparse","rerank"]},"top_k":{"type":"integer","minimum":1,"maximum":50},"min_score":{"type":"number","minimum":0,"maximum":1},"filter":{"type":"object"},"target_stack":{"type":"string"},"max_chars":{"type":"integer","minimum":100,"maximum":25000}}}),
        "summarize_research" => json!({"type":"object","required":["sources"],"properties":{"sources":{"type":"array","minItems":1,"maxItems":5},"objective":{"type":"string"},"target_stack":{"type":"string"},"output_format":{"type":"string","enum":["api_reference","bug_workaround","migration_guide","comparison"]},"budget_exhausted":{"type":"boolean"}}}),
        _ => json!({"type": "object", "properties": {}}),
    }
}

fn tool_permission(name: &str) -> &'static str {
    match name {
        "run_command" | "run_script" | "nodejs" | "python3" | "workflow_run" | "tool_run" | "start_process"
        | "write_stdin" | "stop_process" => "commands",
        "write_file" | "apply_edits" | "apply_patch" | "replace_text" | "delete_file"
        | "restore_file" | "write_script" | "delete_script" | "memory_store" | "skill_save"
        | "workflow_save" | "tool_save" => "edits",
        _ => "read",
    }
}

pub fn core_tools(
    runtime: std::sync::Arc<std::sync::Mutex<Runtime>>,
    session_id: String,
    selected: Option<&[&str]>,
) -> Vec<crate::core::CoreTool> {
    let mut result = vec![];
    for &name in names() {
        if let Some(filter) = selected {
            if !filter.contains(&name) {
                continue;
            }
        }
        let rt = runtime.clone();
        let sid = session_id.clone();
        let tool_name = name.to_string();
        let def = json!({
            "name": name,
            "version": 1,
            "description": description(name),
            "parameters": schema(name),
            "permission": tool_permission(name),
        });
        result.push(crate::core::CoreTool::new(def, move |args, ctx, cancel| {
            let mut guard = rt.lock().map_err(|_| "Runtime lock poisoned")?;
            let call_id = ctx
                .get("callId")
                .and_then(|v| v.as_str())
                .unwrap_or("core_tool");
            let obs = guard.tool(&sid, &tool_name, args.clone(), call_id, None, cancel)?;
            if obs["ok"] != true {
                return Err(obs["error"]
                    .as_str()
                    .unwrap_or("Tool execution failed")
                    .into());
            }
            Ok(obs["result"].clone())
        }));
    }
    result
}

pub fn script_tools(
    runtime: std::sync::Arc<std::sync::Mutex<Runtime>>,
    session_id: String,
) -> Vec<crate::core::CoreTool> {
    core_tools(runtime, session_id, Some(SCRIPT_TOOL_NAMES))
}

pub fn program_tools(
    runtime: std::sync::Arc<std::sync::Mutex<Runtime>>,
    session_id: String,
) -> Vec<crate::core::CoreTool> {
    core_tools(runtime, session_id, Some(PROGRAM_TOOL_NAMES))
}

fn match_glob(pattern: &str, path: &str) -> bool {
    let p = pattern.replace('\\', "/");
    let candidate = path.replace('\\', "/");
    if glob_bytes(p.as_bytes(), candidate.as_bytes()) {
        return true;
    }
    if !p.contains('/') {
        if let Some(base) = candidate.rsplit('/').next() {
            return glob_bytes(p.as_bytes(), base.as_bytes());
        }
    }
    false
}

fn glob_bytes(pat: &[u8], txt: &[u8]) -> bool {
    let (mut pi, mut ti, mut star, mut match_ti) = (0, 0, None, 0);
    while ti < txt.len() {
        if pi < pat.len() && (pat[pi] == b'?' || pat[pi] == txt[ti]) {
            pi += 1;
            ti += 1;
        } else if pi < pat.len() && pat[pi] == b'*' {
            star = Some(pi);
            match_ti = ti;
            pi += 1;
        } else if let Some(sp) = star {
            pi = sp + 1;
            match_ti += 1;
            ti = match_ti;
        } else {
            return false;
        }
    }
    while pi < pat.len() && pat[pi] == b'*' {
        pi += 1;
    }
    pi == pat.len()
}

fn git_cmd(root: &Path, args: &[&str]) -> Result<String> {
    let out = Command::new("git")
        .arg("-C")
        .arg(root)
        .args(args)
        .output()?;
    if !out.status.success() {
        let err = String::from_utf8_lossy(&out.stderr).trim().to_owned();
        return Err(if err.is_empty() {
            format!("git {} failed", args.first().copied().unwrap_or(""))
        } else {
            err
        }
        .into());
    }
    Ok(String::from_utf8_lossy(&out.stdout).into_owned())
}

fn curl_post_json(
    url: &str,
    payload: &Value,
    headers: &serde_json::Map<String, Value>,
    timeout_ms: u64,
) -> Result<Value> {
    let timeout_secs = (timeout_ms / 1000).clamp(1, 30).to_string();
    let body = serde_json::to_string(payload)?;
    let mut cmd = Command::new("curl");
    cmd.args([
        "--proto",
        "=http,https",
        "-fsSL",
        "--max-time",
        &timeout_secs,
        "--max-filesize",
        "5242880",
        "-X",
        "POST",
        "-H",
        "Content-Type: application/json",
        "-H",
        "Accept: application/json",
        "-A",
        "codingagentlib/1.0",
    ]);
    for (k, v) in headers {
        if let Some(vs) = v.as_str() {
            cmd.arg("-H").arg(format!("{k}: {vs}"));
        }
    }
    cmd.arg("-d").arg(&body).arg(url);
    let out = cmd.output().map_err(|e| format!("Failed to invoke curl: {e}"))?;
    if !out.status.success() {
        let err = String::from_utf8_lossy(&out.stderr).trim().to_owned();
        return Err(if err.is_empty() {
            "ERR_FETCH_TIMEOUT: RAG HTTP request failed".into()
        } else {
            format!("ERR_FETCH_TIMEOUT: {err}")
        }
        .into());
    }
    serde_json::from_slice(&out.stdout).map_err(|e| format!("Invalid RAG JSON response: {e}").into())
}

fn extract_symbols(ext: &str, body: &str) -> Vec<(&'static str, String, usize)> {
    let prefixes: &[(&str, &str)] = match ext {
        "rs" => &[
            ("pub async fn ", "fn"),
            ("async fn ", "fn"),
            ("pub fn ", "fn"),
            ("fn ", "fn"),
            ("pub struct ", "struct"),
            ("struct ", "struct"),
            ("pub enum ", "enum"),
            ("enum ", "enum"),
            ("pub trait ", "trait"),
            ("trait ", "trait"),
            ("impl ", "impl"),
            ("pub mod ", "mod"),
            ("mod ", "mod"),
        ],
        "py" => &[
            ("async def ", "fn"),
            ("def ", "fn"),
            ("class ", "class"),
        ],
        "go" => &[
            ("func ", "fn"),
            ("type ", "type"),
        ],
        "java" => &[
            ("public class ", "class"),
            ("class ", "class"),
            ("public interface ", "interface"),
            ("interface ", "interface"),
            ("public enum ", "enum"),
        ],
        _ => &[
            ("export async function ", "fn"),
            ("export function ", "fn"),
            ("async function ", "fn"),
            ("function ", "fn"),
            ("export class ", "class"),
            ("class ", "class"),
            ("export interface ", "interface"),
            ("interface ", "interface"),
            ("export type ", "type"),
            ("type ", "type"),
        ],
    };
    let mut found = vec![];
    for (idx, raw) in body.lines().enumerate() {
        let line = raw.trim_start();
        for (prefix, kind) in prefixes {
            if let Some(rest) = line.strip_prefix(prefix) {
                let name: String = rest
                    .chars()
                    .take_while(|c| c.is_ascii_alphanumeric() || *c == '_' || *c == '$')
                    .collect();
                if !name.is_empty() {
                    found.push((*kind, name, idx + 1));
                }
                break;
            }
        }
    }
    found
}

fn base64_encode(bytes: &[u8]) -> String {
    const TABLE: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = String::with_capacity(bytes.len().div_ceil(3) * 4);
    for chunk in bytes.chunks(3) {
        let b0 = chunk[0] as usize;
        let b1 = chunk.get(1).copied().unwrap_or(0) as usize;
        let b2 = chunk.get(2).copied().unwrap_or(0) as usize;
        let n = (b0 << 16) | (b1 << 8) | b2;
        out.push(TABLE[(n >> 18) & 0x3f] as char);
        out.push(TABLE[(n >> 12) & 0x3f] as char);
        out.push(if chunk.len() > 1 {
            TABLE[(n >> 6) & 0x3f] as char
        } else {
            '='
        });
        out.push(if chunk.len() > 2 {
            TABLE[n & 0x3f] as char
        } else {
            '='
        });
    }
    out
}

fn spawn_pipe_reader<R: Read + Send + 'static>(mut reader: R) -> Arc<Mutex<Vec<u8>>> {
    let buf = Arc::new(Mutex::new(Vec::new()));
    let cloned = Arc::clone(&buf);
    thread::spawn(move || {
        let mut chunk = [0u8; 4096];
        while let Ok(n) = reader.read(&mut chunk) {
            if n == 0 {
                break;
            }
            if let Ok(mut guard) = cloned.lock() {
                if guard.len() < 1_000_000 {
                    let room = 1_000_000 - guard.len();
                    guard.extend_from_slice(&chunk[..n.min(room)]);
                }
            }
        }
    });
    buf
}

fn start_process(runtime: &mut Runtime, id: &str, args: &Value) -> Result<Value> {
    permission(runtime, id, "allowCommands")?;
    if runtime.processes.len() >= 16 {
        return Err("Too many active interactive processes (max 16)".into());
    }
    let command = text(args, "command")?;
    let executable = runtime.resolve_command(command)?;
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
    let mut program = Command::new(&executable);
    program
        .current_dir(cwd)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    for item in &argv {
        program.arg(item.as_str().unwrap());
    }
    let mut child = program.spawn()?;
    let stdin = child.stdin.take();
    let stdout = spawn_pipe_reader(child.stdout.take().ok_or("Missing stdout pipe")?);
    let stderr = spawn_pipe_reader(child.stderr.take().ok_or("Missing stderr pipe")?);
    let pid = ident();
    runtime.processes.insert(
        pid.clone(),
        crate::runtime::InteractiveProcess {
            child,
            stdin,
            stdout,
            stderr,
        },
    );
    Ok(json!({
        "processId": pid,
        "command": command,
        "resolvedExecutable": executable.to_string_lossy()
    }))
}

fn write_stdin(
    runtime: &mut Runtime,
    id: &str,
    args: &Value,
    cancel: &CancelHandle,
) -> Result<Value> {
    permission(runtime, id, "allowCommands")?;
    let pid = text(args, "processId")?;
    let wait_ms = args
        .get("waitMs")
        .and_then(Value::as_u64)
        .unwrap_or(200)
        .min(5000);
    let eof = args.get("eof").and_then(Value::as_bool).unwrap_or(false);
    let proc = runtime
        .processes
        .get_mut(pid)
        .ok_or_else(|| format!("Unknown interactive process: {pid}"))?;
    if let Some(input) = args.get("input").and_then(Value::as_str) {
        if let Some(ref mut stdin) = proc.stdin {
            stdin.write_all(input.as_bytes())?;
            stdin.flush()?;
        } else {
            return Err("Process stdin is already closed".into());
        }
    }
    if eof {
        proc.stdin.take();
    }
    let start = Instant::now();
    let mut exit_code: Option<i32> = None;
    let mut running = true;
    loop {
        if cancel.is_cancelled() {
            break;
        }
        if let Some(status) = proc.child.try_wait()? {
            running = false;
            exit_code = status.code();
            break;
        }
        if start.elapsed() >= Duration::from_millis(wait_ms) {
            break;
        }
        thread::sleep(Duration::from_millis(10));
    }
    // Give reader threads a brief moment to flush after exit
    if !running {
        thread::sleep(Duration::from_millis(15));
    }
    let stdout = {
        let mut g = proc.stdout.lock().unwrap();
        let s = String::from_utf8_lossy(&g).into_owned();
        g.clear();
        s
    };
    let stderr = {
        let mut g = proc.stderr.lock().unwrap();
        let s = String::from_utf8_lossy(&g).into_owned();
        g.clear();
        s
    };
    if !running {
        runtime.processes.remove(pid);
    }
    Ok(json!({
        "processId": pid,
        "running": running,
        "exitCode": exit_code,
        "stdout": stdout,
        "stderr": stderr
    }))
}

fn stop_process(runtime: &mut Runtime, id: &str, args: &Value) -> Result<Value> {
    permission(runtime, id, "allowCommands")?;
    let pid = text(args, "processId")?;
    let mut proc = runtime
        .processes
        .remove(pid)
        .ok_or_else(|| format!("Unknown interactive process: {pid}"))?;
    proc.stdin.take();
    let _ = proc.child.kill();
    let exit_code = proc.child.wait().ok().and_then(|s| s.code());
    Ok(json!({
        "processId": pid,
        "stopped": true,
        "exitCode": exit_code
    }))
}

fn is_source_ext(ext: &str) -> bool {
    matches!(
        ext,
        "rs" | "py" | "js" | "ts" | "cjs" | "mjs" | "tsx" | "jsx" | "go" | "java"
    )
}

fn is_ident_char(c: char) -> bool {
    c.is_ascii_alphanumeric() || c == '_' || c == '$'
}

fn identifier_at(source: &str, line: usize, column: usize) -> Option<String> {
    let line_str = source.lines().nth(line.checked_sub(1)?)?;
    let chars: Vec<char> = line_str.chars().collect();
    if chars.is_empty() {
        return None;
    }
    let mut idx = column.checked_sub(1)?;
    if idx >= chars.len() {
        idx = chars.len() - 1;
    }
    if !is_ident_char(chars[idx]) {
        if idx > 0 && is_ident_char(chars[idx - 1]) {
            idx -= 1;
        } else {
            return None;
        }
    }
    let mut start = idx;
    while start > 0 && is_ident_char(chars[start - 1]) {
        start -= 1;
    }
    let mut end = idx + 1;
    while end < chars.len() && is_ident_char(chars[end]) {
        end += 1;
    }
    Some(chars[start..end].iter().collect())
}

fn whole_word_columns(line: &str, sym: &str) -> Vec<usize> {
    let mut cols = vec![];
    if sym.is_empty() {
        return cols;
    }
    let mut offset = 0;
    while let Some(pos) = line[offset..].find(sym) {
        let abs = offset + pos;
        let prev_ok = line[..abs]
            .chars()
            .next_back()
            .map(|c| !is_ident_char(c))
            .unwrap_or(true);
        let after = abs + sym.len();
        let next_ok = line[after..]
            .chars()
            .next()
            .map(|c| !is_ident_char(c))
            .unwrap_or(true);
        if prev_ok && next_ok {
            let col = line[..abs].chars().count() + 1;
            cols.push(col);
        }
        offset = abs + sym.len();
    }
    cols
}

fn run_diagnostics(target: &Path, relative: &str, body: &str) -> (&'static str, Vec<Value>) {
    let ext = target
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("");
    if matches!(ext, "js" | "cjs" | "mjs") {
        if let Ok(out) = Command::new("node").arg("--check").arg(target).output() {
            if !out.status.success() {
                let msg = String::from_utf8_lossy(&out.stderr).trim().to_owned();
                return (
                    "node --check",
                    vec![json!({"path": relative, "line": 1, "severity": "error", "message": msg})],
                );
            }
            return ("node --check", vec![]);
        }
    }
    if ext == "py" {
        if let Ok(out) = Command::new("python3")
            .args(["-m", "py_compile"])
            .arg(target)
            .output()
        {
            if !out.status.success() {
                let msg = String::from_utf8_lossy(&out.stderr).trim().to_owned();
                return (
                    "python3 -m py_compile",
                    vec![json!({"path": relative, "line": 1, "severity": "error", "message": msg})],
                );
            }
            return ("python3 -m py_compile", vec![]);
        }
    }
    // Fallback structural delimiter check
    let mut stack: Vec<(char, usize)> = vec![];
    let mut diags = vec![];
    for (lno, line) in body.lines().enumerate() {
        let mut in_str: Option<char> = None;
        let mut escaped = false;
        for ch in line.chars() {
            if let Some(q) = in_str {
                if escaped {
                    escaped = false;
                } else if ch == '\\' {
                    escaped = true;
                } else if ch == q {
                    in_str = None;
                }
                continue;
            }
            if ch == '"' || ch == '\'' {
                in_str = Some(ch);
            } else if matches!(ch, '(' | '[' | '{') {
                stack.push((ch, lno + 1));
            } else if matches!(ch, ')' | ']' | '}') {
                let expected = match ch {
                    ')' => '(',
                    ']' => '[',
                    _ => '{',
                };
                if let Some((open, _)) = stack.pop() {
                    if open != expected {
                        diags.push(json!({"path": relative, "line": lno + 1, "severity": "error", "message": format!("Mismatched '{ch}' for '{open}'") }));
                    }
                } else {
                    diags.push(json!({"path": relative, "line": lno + 1, "severity": "error", "message": format!("Unmatched closing '{ch}'") }));
                }
            }
        }
    }
    for (open, lno) in stack {
        diags.push(json!({"path": relative, "line": lno, "severity": "error", "message": format!("Unclosed '{open}'") }));
    }
    ("structural", diags)
}

fn curl_https(url: &str) -> Result<String> {
    let out = Command::new("curl")
        .args([
            "--proto",
            "=https",
            "--tlsv1.2",
            "-fsSL",
            "--max-time",
            "10",
            "--max-filesize",
            "262144",
            "-A",
            "codingagentlib/1.0",
            url,
        ])
        .output()
        .map_err(|e| format!("Failed to invoke curl: {e}"))?;
    if !out.status.success() {
        let err = String::from_utf8_lossy(&out.stderr).trim().to_owned();
        return Err(if err.is_empty() {
            "HTTPS request failed".into()
        } else {
            err
        }
        .into());
    }
    Ok(String::from_utf8_lossy(&out.stdout).into_owned())
}

fn strip_html_tags(html: &str) -> String {
    let mut out = String::with_capacity(html.len() / 2);
    let mut in_tag = false;
    let mut last_ws = false;
    for ch in html.chars() {
        if ch == '<' {
            in_tag = true;
            if !last_ws {
                out.push(' ');
                last_ws = true;
            }
        } else if ch == '>' {
            in_tag = false;
        } else if !in_tag {
            if ch.is_whitespace() {
                if !last_ws {
                    out.push(' ');
                    last_ws = true;
                }
            } else {
                out.push(ch);
                last_ws = false;
            }
        }
    }
    out.trim().to_owned()
}

fn percent_encode(s: &str) -> String {
    let mut out = String::new();
    for b in s.as_bytes() {
        if b.is_ascii_alphanumeric() || matches!(b, b'-' | b'_' | b'.' | b'~') {
            out.push(*b as char);
        } else if *b == b' ' {
            out.push('+');
        } else {
            out.push_str(&format!("%{:02X}", b));
        }
    }
    out
}

fn parse_ddg_html(html: &str, limit: usize) -> Vec<Value> {
    let mut results = vec![];
    for chunk in html.split("class=\"result__a\"").skip(1) {
        if results.len() >= limit {
            break;
        }
        let href = chunk
            .split("href=\"")
            .nth(1)
            .and_then(|s| s.split('"').next())
            .unwrap_or("")
            .to_owned();
        let title_raw = chunk
            .split('>')
            .nth(1)
            .and_then(|s| s.split("</a>").next())
            .unwrap_or("");
        let title = strip_html_tags(title_raw);
        let snippet_raw = chunk
            .split("class=\"result__snippet\"")
            .nth(1)
            .and_then(|s| s.split('>').nth(1))
            .and_then(|s| s.split("</a>").next())
            .unwrap_or("");
        let snippet = strip_html_tags(snippet_raw);
        if !title.is_empty() && !href.is_empty() {
            results.push(json!({"title": title, "url": href, "snippet": snippet}));
        }
    }
    results
}
