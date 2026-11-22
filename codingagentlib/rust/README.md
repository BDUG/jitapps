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
| Managed scripts | `write_script`, `read_script`, `list_scripts`, `delete_script`, `run_script`; scripts remain session-local and use an explicitly allowed interpreter. |
| Portable core adapters | `core_tools(runtime, session_id, selected)`, `script_tools(runtime, session_id)`, and `program_tools(runtime, session_id)` wrap native tools as `CoreTool` definitions for `create_agent`. |
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

`EmbeddedAgent`, `ToolPermission` and `ToolContext` provide a small optional host-tool integration API alongside the guarded workspace `Agent`. Register callbacks, add an event sink or approval hook, pass JSON application context and supply your own model transport. See the [language-neutral integration guide](../README.md#integration) for semantics and limitations.

`cargo run --manifest-path codingagentlib/rust/Cargo.toml --example ui -- /absolute/workspace` starts a small local browser UI with real read-only workspace listing and a deterministic demonstration model. No Python or GUI toolkit is needed. Replace `demo_model` with your provider callback for real AI requests.

The UI also supports reading/searching files, questions and follow-ups, step budgets, live event filters, tool switches, metrics and explicit snapshot download/restore. The `EmbeddedAgent` API provides matching discovery/context/completion-policy/restore integration points across Rust, Python and JavaScript; see [session transfer contracts](../README.md#integration-tool-management-completion-checks-and-session-transfer).

## Dynamic host context

`ContextRegistry`, `EmbeddedAgent::context_provider` and `tool_available` support live application integrations with revisioned context sources, descriptive schemas, per-turn refresh and dispatch-time capability checks. Tools receive the exact model-turn context in `ToolContext.context`. See the [cross-language guide](../README.md#integration-dynamic-host-integration-framework) and `cargo run --example dynamic_context` for a native, provider-free demonstration.

### Retained output through the host API

`Agent::request("output", json!({"session_id": id, "jobId": job, "stream": "stdout", "offset": 0, "limit": 12000}))` reads a recorded command's retained log in running, paused or completed sessions. It uses the same Unicode-character paging and 8 MB log bound as read_command_output; maximum page size is 32,000 characters. Results contain text, offset, nullable nextOffset, done and totalCharacters.

This host method bypasses the mutating tool-call ledger, not path/job validation: only command/script jobs recorded in that session are eligible. Symlinked/nonregular logs are rejected. It does not resume a session, execute a program, record an observation or change verification state. Model-issued read_command_output remains an ordinary audited tool call and now applies the same recorded-job/log checks. JSON-lines workers expose the additional method without changing the codingagentlib/1 envelope.


### Host terminal review audit

`Agent::request("agent_review", params)` accepts `session_id`, the current reserved numeric `step`, and `review` containing boolean `approved`, `tool` (`run_command`, `run_script`, `workflow_run`, or `workflow_continue`) and a 64-character hexadecimal `fingerprint`. Optional `reason` is one of `declined`, `preview_requested`, `review_required`, `reviewed_action_changed`, `commands_disabled`, or `workflow_requires_individual_steps`. A declined `preview_requested` review requires `proposal` with matching `tool`, object `args`, and optional `checks`.

This host-only audit operation preserves the pending planning turn and records a user event. It does not execute the proposal, grant permissions, or verify human approval. Proposal data is untrusted reference material and may appear in session exports. Generic user-event dispatch still invalidates the pending turn. Hosts must bind approval to their exact proposal and continue to submit with the native turn identity.


### Scoped repository guidance

Native requests include fresh `projectInstructions`, loading workspace-root and most recently targeted subtree guidance. The read-only `read_project_instructions` tool selects a file/directory scope explicitly. It supports non-empty `AGENTS.override.md` precedence over `AGENTS.md`, exact UTF-8 source hashes and a 32 KiB aggregate budget with explicit skipped-source warnings. No global/home guidance is read. Source provenance is recorded on turn events; source bodies stay in current model requests and explicit read observations. These documents never grant permissions or bypass runtime checks. See the [library guide](../README.md#scoped-repository-instructions).


### Source-bound command receipts

Command results now include `verificationBinding` with input hashes/digest and stability metadata for known file-tool inputs and managed scripts. Native planning requests include `verificationFreshness`; completion rechecks the hashes and rejects `stale`/`unavailable` inputs even if an earlier command exited zero. Partial/blocked reporting remains available. Bindings persist across process restarts and do not execute retries. See the [scope and limits](../README.md#source-bound-verification).


### Precise edit batches

Native `apply_edits` accepts `path`, `expectedHash` and 1–32 `edits` with `find`, `replacement` and optional exact `count` (default 1; at most 1,000). It validates the immutable original UTF-8 snapshot and every overlap before one atomic write, retaining the existing recovery copy and verification bookkeeping. It rejects unsupported arguments, including preview/dryRun modes. Python is not required. See [precise edit batches](../README.md#precise-edit-batches) for examples and scope.

## Evidence-driven model handoff

Native `ModelHandoff`, `Agent::run_with_handoff` and `resume_with_handoff` support shadow and one-way automatic routing with persistent session metadata and host-supplied primary/continuation/detector callbacks. See the [shared guide](../README.md#model-handoff-native-rust-integration) for configuration, evidence requirements, examples and limits. No Python dependency is introduced.

## Native task dependency validation

Rust model submissions now use `codingagentlib::planning::validate` and `planning::action` to enforce the task DAG and ready-task binding already used by the JavaScript/Python coding drivers. `planning::latest` retrieves the latest accepted assistant checklist; new native requests expose it as `tasks`. The graph is limited to 30 tasks (IDs up to 80 characters, titles up to 300), unique known dependency IDs, one active task and no cycles. Active/done tasks require done prerequisites. With dependencies, use `action.taskId` for the ready active task. Invalid incoming plans/actions are rejected before tool execution and may be repaired using a fresh turn. A complete corrected task list can replace invalid archived metadata.

Checklists without dependencies retain legacy unbound actions. This applies to model `submit` orchestration; low-level host-directed tool dispatch does not require task binding. Task statuses are planning claims, never execution proof or permission grants. Existing verification and completion gates remain authoritative.

Shared fixtures in `rust/tests/fixtures/task-planning.json` exercise JavaScript, Python and Rust validation. Run `node --test codingagentlib/javascript/task-planning-test.cjs`, `python3 -m unittest codingagentlib.test_task_planning`, and the Rust/VS Code suites. Native integration tests cover rejection without side effects, repair, prerequisites and persisted plans after restart.

## Native terminal retry guard

Native Rust `Agent::submit` / `Agent::run` now pause before a fourth unchanged failed `run_command` or `run_script` invocation. Comparison uses the tool and literal arguments, independently of checks, task IDs or changing error output. Only unique native observations matched to accepted model actions count. Matching zero-exit success, a successful matching file-tool edit or a new explicit user follow-up resets the applicable counter; reads and Resume alone do not. The entire current follow-up segment is inspected rather than only a recent receipt window, and saved history survives restart.

Results use `status: waiting`, `reason: repeated_terminal_failure` and a `recovery` object (`codingagentlib/terminal-recovery/v1`) containing the tool, failure count, last three call IDs with original `read_history` offsets, `automaticRetry:false` and guidance. No fourth action is executed; earlier side effects remain. Hosts can call the pure `codingagentlib::recovery::terminal_retry(&events, &action)` helper for one native session's audit. `recovery::policy()` is exposed as `terminalRetryPolicy` in native health and planning requests.

Low-level host-directed tool dispatch remains explicit and is outside this guard. Workflow-internal invocations are not treated as separate matched model actions. Provider request retry policy, permissions, approvals and verification gates are unchanged. Changed invocations are evaluated separately, and successful matching file edits can reset counters; neither certifies a fix or prevents every possible repetition pattern. Recovery suggestions never execute themselves.

Tests: native `recovery` tests cover failure/check variations, duplicate observations, unknown exit codes, reset boundaries, actual command side-effect counts and restart. VS Code tests also check the native fallback beyond its recent-window heuristic.

## Current verification snapshots for host integrations

Native Rust planning requests now add three fields to `verificationFreshness` when a command binding exists:

| Field | Meaning |
| --- | --- |
| `inputDigest` | The latest command's recorded tracked-input digest (existing field). |
| `currentInputDigest` | Digest of the currently captured known-input set. |
| `currentComplete` | Whether current capture completed without coverage warnings. |
| `currentTrackedFiles` | Number of entries in that current snapshot. |

Hosts with several required checks can compare each receipt's `result.verificationBinding.inputDigest` with `currentInputDigest`, requiring stable, complete command input capture and complete current coverage. A later command pass does not refresh an earlier check's binding. VS Code now enforces this for every configured command and exposes stale/unavailable results. The snapshot reuses the native freshness capture; it does not add another filesystem read pass. With no previous command binding, status remains `none` and these additive snapshot fields are absent.

Known inputs, limits and non-atomic coverage remain as documented under source-bound verification. An empty known-input set remains unbound, not proof of whole-workspace correctness. Host-directed policy is separate from native permissions and the native completion recheck. No verification commands are run automatically by comparing digests.

## Two-view browser example and extension-pack boundary

The [SVG/rich-text example](../examples/two-views/README.md) registers distinct
`svg_color` and `rich_text` tools on native Rust `EmbeddedAgent`, with chat,
a bottom communication/step panel and JSON trace export:

```sh
cargo build --locked --manifest-path codingagentlib/rust/Cargo.toml --example two_views
python3 codingagentlib/examples/two-views/serve.py rust
```

Run from the repository root and open `http://127.0.0.1:8765`. Python serves this
example's common page and optional provider bridge; tool execution remains native
Rust. Default commands are deterministic and require no model credentials. This
example's Python requirement is a presentation-host choice, not a dependency of
the Rust library. Trace events appear after a bounded run returns.

The [Extension Pack 1.2](../extension_pack/README.md) is a separate Python generic
host adapter. Its SQLite checkpoints, policy/configuration, tier ledger and
SessionConfig-style composition are not Rust crate APIs. Rust's existing generic
core/session-store and native runtime capabilities remain as described above;
do not import Python session snapshots into Rust or assume extension-pack parity.
