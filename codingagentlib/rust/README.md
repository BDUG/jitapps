# Native Rust coding agent

`codingagentlib` 0.2 implements the agent runtime and Sense–Plan–Act–Observe–Verify loop in Rust. It does not embed, install, import or spawn Python. Cargo builds a normal Rust library; model callbacks belong to the embedding application. No HTTP server, browser, Node.js or default shell is required.

```rust
use codingagentlib::{Agent, RunOptions};
use serde_json::json;

fn main() -> codingagentlib::Result<()> {
    let mut agent = Agent::new("/absolute/workspace", &[])?;
    let result = agent.run("List the workspace", &RunOptions::default(), |request| {
        let inspected = request["events"].as_array().unwrap().iter()
            .any(|event| event["kind"] == "observation");
        Ok(json!({
            "sessionId": request["sessionId"], "step": request["step"],
            "status": if inspected { "done" } else { "act" },
            "plan": "Inspect workspace files", "summary": "Workspace inspected",
            "action": if inspected { serde_json::Value::Null }
                else { json!({"tool":"list_files", "args":{}}) }
        }))
    })?;
    println!("{result}");
    agent.close()?;
    Ok(())
}
```

Run `cargo run --manifest-path codingagentlib/rust/Cargo.toml --example list -- /absolute/workspace`. `Agent::spawn(python, workspace, commands)` remains as a deprecated source-compatible alias; the first argument is ignored and no subprocess is created by the constructor.

## API and cycle

1. `Agent::new(workspace, &[executables])` canonicalizes an existing directory, resolves allowed programs and locks private native state.
2. `start(goal, &RunOptions)` records permissions and the initial SHA-256 file manifest. Edits and commands default to disabled, even when executables are allowlisted.
3. `next(session_id)` durably reserves a turn and returns the current identity, events, permissions, tool descriptions/arguments and response schema.
4. The host calls its model and passes the JSON result to `submit`. An `act` performs one tool call and records its actual observation; `ask` pauses; `done` checks completion conditions. Invalid responses get repair feedback and a fresh next turn, pausing after three consecutive invalid plans.
5. `run` combines these steps with a default 500-step budget. It pauses at the budget, on questions, callback errors or cancellation. Partial/blocked completion is explicit. With command permission, file edits need a successful command after the latest edit before a complete outcome is accepted. Public task lists permit one in-progress task; unfinished tasks block complete outcomes.

`cancel_handle()` returns a cloneable thread-safe cancellation handle. It interrupts a running command and is checked before model-response actions. `cancel(session)` pauses a session between calls. A host should also cancel its own model HTTP request; this library does not own provider networking. `dispatch` exposes `health`, `start`, `sessions`, `session`, `turn`, `resume`, `cancel`, `event`, `finish`, `tool` and `tool_status`. `request` preserves the earlier method names as direct in-process calls, without JSON-lines pipes.

Tool calls have immutable IDs and a fingerprint of tool/arguments/checks. A completed repeated ID returns its saved observation. Reusing it with different arguments is rejected. Interrupted calls are retained as uncertain and are never automatically replayed: inspect actual files/output before choosing another action. On reopening, formerly running sessions are paused; resume explicitly. Completed sessions require a new run.

## Native capabilities

| Area | Tools / behavior |
| --- | --- |
| Files | `list_files`, `read_file`, `search_text`, `write_file`, `replace_text`, `delete_file`; relative paths, symlink/traversal/private-state rejection, SHA-256 optimistic checks, pre-edit recovery copies. |
| Managed scripts | `write_script`, `read_script`, `list_scripts`, `run_script`; scripts remain session-local and use an explicitly allowed interpreter. |
| Commands | `run_command` with literal argv, executable allowlist and session permission. Default timeout 30 seconds, maximum 120 seconds. Stdout/stderr persisted separately; `read_command_output` retrieves full pages within the output bound. |
| Evidence | Observations, task status, JSON-pointer `equals`/`contains`/`exists` action checks, verification after edits, `read_history`, `changes`. |
| Findings | `memory_store`, `memory_read`, `memory_list`, `memory_search`; session-local JSON records and case-insensitive lexical search. This is not semantic vector embedding retrieval. |
| Reusable skills | `skill_save/read/list/search`; workspace-local revision history, expected-revision writes and pinned historical reads. |
| Workflows | `workflow_save/read/list/run`; pinned revisions and 1–16 literal file/script/program steps. Child actions retain receipts. Failure/cancellation stops execution; no expressions, input references, continuation or automatic replay. |
| Handover | `package_results` builds a ZIP with session/events, changed current files, scripts, command evidence, findings, skill/workflow definitions, manifest and `RESULT.md`. |

`health()` is authoritative: unsupported Python/browser tools are not advertised and are rejected. Optional compiler navigation, learned embeddings, shared catalog integration, browser context editing, independent reviews, acceptance-rule orchestration and context compression remain features of the other ports. No feature silently falls back to Python.

## Storage and limits

Private native state is `<workspace>/.codingagentlib-rust/`, format `codingagentlib-rust/session-v1`. It is separate from Python's `.suite-agent/` SQLite/session layout; existing Python sessions are not migrated or loaded. One native runtime opens a workspace at a time using an OS advisory lock released on close/process exit. State directories have mode 0700 and JSON saves mode 0600 on Unix; Windows uses inherited OS ACLs. Session/record writes and file-tool edits use temporary files followed by rename. Existing edited files retain their permissions. File-tool recovery copies cover their own writes/deletes; commands have no automatic rollback.

Text file/script operations accept at most 2 MB, with Unicode-character paging (default 12,000, maximum 32,000 characters). Lists default to 100 items, maximum 1,000 per page. Workspace manifests are limited to 100,000 files; packages to 1,000 changed files and 100 MB. Commands accept 100 arguments, up to 20,000 characters each. The combined output guard is 8 MB and is polled every 10 ms; a program can briefly exceed it. Oversized output is retained on disk but full retrieval is refused, with a clear error. ZIPs store data uncompressed.

Commands run with the host account's OS permissions. The allowlist and workspace file-tool checks are not an OS sandbox: an allowed interpreter can read/write outside the workspace. Use a container or OS isolation when required. On Unix, timed-out/cancelled command process groups are killed, including children that remain in that group. Windows currently terminates the direct child only; hosts requiring descendant isolation should use a Windows Job Object/container. Processes that deliberately detach require host-level isolation on every platform.

## Verify

```sh
cargo test --manifest-path codingagentlib/rust/Cargo.toml
cargo fmt --manifest-path codingagentlib/rust/Cargo.toml -- --check
cargo clippy --manifest-path codingagentlib/rust/Cargo.toml --all-targets -- -D warnings
cargo package --manifest-path codingagentlib/rust/Cargo.toml
```

Native tests cover operation without any valid interpreter, session restart, exclusive locking, receipt replay, stale hashes, path/symlink permissions, Unicode paging, checks, actual commands, timeout/cancellation, verification, findings, skills/workflows and real ZIP contents. Tests use deterministic model callbacks; no paid providers are called. Unix command tests use explicit `/bin/sh`, `sleep` and `cat`; those are test programs, not runtime dependencies. Linux is exercised here; Windows/macOS runtime behavior needs validation on those platforms.

## Embed in a UI or another Rust program

`EmbeddedAgent`, `ToolPermission` and `ToolContext` provide a small optional host-tool integration API alongside the guarded workspace `Agent`. Register callbacks, add an event sink or approval hook, pass JSON application context and supply your own model transport. See the [language-neutral integration guide](../INTEGRATION.md) for semantics and limitations.

`cargo run --manifest-path codingagentlib/rust/Cargo.toml --example ui -- /absolute/workspace` starts a small local browser UI with real read-only workspace listing and a deterministic demonstration model. No Python or GUI toolkit is needed. Replace `demo_model` with your provider callback for real AI requests.

The UI also supports reading/searching files, questions and follow-ups, step budgets, live event filters, tool switches, metrics and explicit snapshot download/restore. The `EmbeddedAgent` API provides matching discovery/context/completion-policy/restore integration points across Rust, Python and JavaScript; see [session transfer contracts](../INTEGRATION.md#tool-management-completion-checks-and-session-transfer).

## Dynamic host context

`ContextRegistry`, `EmbeddedAgent::context_provider` and `tool_available` support live application integrations with revisioned context sources, descriptive schemas, per-turn refresh and dispatch-time capability checks. Tools receive the exact model-turn context in `ToolContext.context`. See the [cross-language guide](../INTEGRATION.md#dynamic-host-integration-framework) and `cargo run --example dynamic_context` for a native, provider-free demonstration.
