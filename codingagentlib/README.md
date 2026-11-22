# codingagentlib

Runnable UI: [SVG + rich text + AI chat + exportable trace](examples/two-views/README.md), with native Python, JavaScript/TypeScript and Rust SDK hosts.

Opt-in [Extension Pack 1.2](extension_pack/README.md): durable Python-host checkpoints, verification gates, isolated worktrees, authenticated A2A, filtered MCP, sandbox actions, routing/budgets and governance. Uses public SDK hooks; no JavaScript/Rust extension-pack parity is implied.

## Documentation map

This README consolidates the library guides. Component-specific documentation
remains in [Rust](rust/README.md) and [VS Code](vscode/README.md).

- [App views, tools and integration requirements](apps.md)
- [HOWTO: files and integration cases](#howto)
- [Portable SDK contracts and lifecycle](#sdk)
- [Embedding and dynamic host integration](#integration)
- [Coding, project knowledge, reusable tools and MCP](#coding-guide)
- [Evidence-driven model handoff](#model-handoff)
- [Optional multi-model collaboration](#model-collaboration)
- [Python extension-pack integration](#howto-l-extension-pack)
- [SVG/rich-text UI example](#howto-m-two-view-ui)

Start with [HOWTO: files and integration cases](README.md#howto) to choose the browser, Node, Python, Rust or editor entry point and understand every source file.

Read the [Coding Agent How-to Book](../docs/coding-agent-book/README.md) for step-by-step usage, LLM request/response examples, result delivery and SDK integration.

The suite's headless coding-agent components, reusable without the desktop, chat UI, relay or HTTP server. The original JavaScript planning loop and Python workspace runtime now live here. Provider/model transports are injected; the library never selects a paid model or starts an AI request on its own.

| Interface | Entry point | Runtime requirements |
| --- | --- | --- |
| JavaScript core | `javascript/index.js` or individual browser scripts | Node.js 18+; or browser globals with injected transport callbacks. |
| JavaScript local agent | `javascript/local.js` / `LocalRuntime` export | Node.js plus the installed Python package. Uses the original JavaScript ReAct loop. |
| Native Python API | `from codingagentlib import Agent, Runtime` | Python 3.10+, standard library for base features. No Node or web server required. |
| Native Rust API | `rust/` crate, `codingagentlib::Agent` | Rust/Cargo to build; the compiled library requires no Python, Node, worker or web server. |
| JSON-lines worker | `python3 -m codingagentlib --workspace PATH` | Python only. Protocol documented below; no listening TCP ports. |

## ReAct Loop, `uv` Python Environments, Script Harness & Memory Manager

- **`ReactAgent`** (`from codingagentlib import ReactAgent`): High-level ReAct driver with context compaction (`compactedHistory`), `workingBrief`, `decisionGuidance`, action-cycle/loop detection (`loopWarning`), structured invalid-reply repair (`repairHint`), optional multi-action turn batching (`actions: [...]`), and automatic `MemoryManager` recall/episode capture.
- **`PythonEnvironments`** (`python_env` tool / `op: "python_env"`): Isolated virtual environments under `.suite-agent/pyenvs/<name>/.venv`, preferring `uv` (`uv venv` / `uv pip`) with automatic fallback to stdlib `venv` + `pip`, PEP 508 requirement validation, `freeze` lockfiles, and command-policy enforcement.
- **`ScriptLibrary` & `script_run` harness** (`script_run`, `script_library` tools): Executes managed, inline, or library scripts inside a managed virtual environment with PEP 723 `# /// script` dependency bootstrap, structured JSON I/O (`agent_io.load_input()`, `agent_io.emit()`, `AGENT_ARTIFACT_DIR`), and automatic credential/path-screened capture into a versioned, searchable SQLite script library.
- **`MemoryManager`** (`memory_remember`, `memory_recall`, `memory_forget`, `memory_manage`, `scratchpad`): Layered long-term memory (`fact`, `lesson`, `episode`, `preference`, `procedure`, `note`) with similarity + importance + recency decay + usage scoring, near-duplicate merging, TTL expiry, consolidation, pinning, per-session scratchpad, and automatic session episode/lesson capture on completion.
- **Memory Architectures (`UnifiedMemorySuite`)**:
  - **StructMem** (`memory_struct`): Typed, schema-validated structured records (`entity`, `file_summary`, `api_contract`, `error_pattern`, `decision`, `config`, `dependency`).
  - **egGENT** (`memory_graph` `eggent_query`): Episodic Event-Graph (`State -> Action -> Observation -> Outcome`) with `PRECEDES` / `RESOLVED_BY` transitions.
  - **A-MEM** (`memory_graph` `amem_add` / `amem_search`): Zettelkasten atomic notes with automatic bidirectional linking and dynamic neighbor evolution.
  - **MAGMA** (`memory_graph` `magma_add` / `magma_link` / `magma_query`): Four-view multi-graph (`semantic`, `temporal`, `causal`, `entity`) with intent routing, spreading activation, and Reciprocal Rank Fusion (RRF).
  - **GAM** (`memory_research`): Dual-module Memorizer (page store) + Researcher (iterative multi-hop retrieval & synthesis across all memory layers).
- **CLI**: `python3 -m codingagentlib.cli --workspace PATH {react,env,scripts,memory} ...`
- **ReAct Loop Protocols & Standards**:
  - **Thought → Action (`providers.py`)**: Native JSON Schema tool-use adapters (`openai_tool_model`, `anthropic_tool_model`, `gemini_tool_model`, `tool_schemas`, `parse_provider_response`, `tool_use_to_react_model`) extracting reasoning tokens, `tool_calls`, normalized `stop_reason`, and token `usage`.
  - **Action → Observation (`mcp_transports.py`, `rpc.py`)**: MCP stdio (`ShellMCP`, `MCPService`) and Streamable HTTP (`HttpMCPTransport`, `POST /api/mcp`).
  - **Nested ReAct Loops (`a2a.py`)**: Agent2Agent (`agent_card`, `A2AServer`, `A2AClient`, `a2a_delegation_tool`) with `GET /.well-known/agent.json` and `POST /api/a2a` (`tasks/send`, `tasks/get`, `tasks/cancel`, `message/send`).
  - **Loop → Editor / UI (`streaming.py`)**: SSE Data Streams (`format_sse`, `SSEStreamBridge`), AG-UI lifecycle events (`ag_ui_events`, `POST /api/agent/stream`), and Zed ACP (`ACPServer` `initialize`, `session/new`, `session/prompt`, `session/update`, `session/request_permission`).
  - **Loop Observability (`otel_genai.py`)**: OpenTelemetry GenAI Semantic Conventions (`GenAITracer`, `ReactOtelObserver`, `TraceContext` W3C `traceparent`, OTLP JSON export via `export_otlp_json()` and `GET /api/agent/otel`).
- **Hybrid Orchestration (`hybrid_agent.py`)**: `HybridPlanReflexionAgent` combines Plan-and-Execute (DAG task decomposition & adaptive `replanner`), Reflexion (mandatory post-failure self-critique + episodic memory capture), and ReAct execution.
- **Handbook**: [Coding Agent & SDK Handbook](../docs/coding-agent-book/HANDBOOK.md)

## Portable SDK v1

The versioned generic `createAgent` / `create_agent` core supports registered host tools, policy, context, pluggable sessions, budgets, replay, streaming, MCP transports and scoped delegation without requiring a coding workspace. [Contracts, lifecycle, optional packages and compatibility](README.md#sdk). Existing coding APIs remain available.

## Project knowledge, Python tools, skills and targets

The optional **model mosaic** routes planning, coding and review turns to host-configured models with one provider call per turn, pinned routes, a model-call budget and an inspectable route history. JavaScript `createModelMosaic`, Python `create_model_mosaic` and Rust `mosaic::ModelMosaic` work with generic SDK agents and coding callbacks. Browser agents expose the option beside runtime settings; load saved model profiles before selecting routes. Errors return to normal orchestration without a fallback model. [Deterministic JavaScript example](examples/model-mosaic.cjs) · [Python example](examples/model_mosaic.py).

Graph recall now follows bounded neighborhoods with explicit seeds, relation filters and direction. Python AST indexing adds qualified symbols, same-file inheritance and direct-call references; moving an unchanged Python declaration preserves its identity and annotations. Hosts can annotate entities, inspect change history and remove imported entities with revision guards. JavaScript's optional `@tlal/agent-memory` builds graphs from host-supplied source snapshots and supplies generic agent context providers. Python `ProjectKnowledge.context_provider` and Rust `graph_memory::ProjectGraphMemory`/`query` provide equivalent host integration. Imported annotations remain reference data.

The [graphical skill-flow editor](../shared-suite/skill-flow/README.md) supports sketch-style editing, dependency validation, pinned skill prerequisites, workflow JSON exchange and revision-safe saves from an agent session. Saving never runs a workflow. rstiX additionally scans one or multiple GitHub repositories at pinned commits, merges RST and exported needs, and preserves repository provenance. Both editors export static embeddable illustrations.

Coding sessions automatically derive project-local ontology/knowledge-graph references from bounded source inspection and include them in planning context. Graph and ontology can be exported separately or imported into a selected project with revision checks; they never grant permissions or count as verification. The browser agent and VS Code Project memory dialogs expose these operations. rstiX builds equivalent portable memory from its open RST document.

Parameterized managed Python scripts are the standard reusable coding approach when Python is approved. Successful scripts with a `codingagent-tool` header can populate a private, versioned recipe library without overwriting existing tools. Skills and named targets remain explicit, revision/hash-pinned data. Preparing a recipe never executes it; normal script/command permissions still apply. Libraries are project-independent and portable, with an optional configured shared SQLite path.

MCP supports injected JSON-RPC bridges and literal-argv shell/stdio transports in JavaScript, Python and Rust. The bundled `python3 -m codingagentlib.rpc --workspace PATH` service is read-only by default; writes and programs require explicit flags and the normal runtime guards. [Coding guide and working examples](README.md#coding-guide) · [rstiX app](../rstiX/README.md).

## Dynamic integrations

JavaScript, Python and native Rust support named, revisioned `ContextRegistry` sources, context refresh before every model turn, dynamic tool discovery/revocation, progress events and exact-turn context in host tool callbacks. A reviewed editor integration example shows how to stage proposals and reject stale projects. See the [integration framework guide](README.md#integration-dynamic-host-integration-framework).

## Layout

- `javascript/`: canonical schema/instructions, plan parsing/validation, ReAct/Sense–Plan–Act orchestration, context compression/recovery, task planning, action checks, acceptance checks and independent-review orchestration. `loop.run(state, callbacks)` is transport independent.
- `python/`: canonical file/command runtime, recovery copies, result ZIP packaging, persistent sessions, context archives, memory, local skills/workflows, acceptance/action checks, task dependency validation, independent-review checkpoints, live file inspection, optional compiler navigation and embeddings.
- `python/agent.py`: native Python turn driver and model-callback loop with bounded invalid-plan repairs, explicit permissions, cancellation checks and step budgets.
- `rust/`: independent native Rust workspace runtime, persisted sessions, tools and model-callback loop. See its [API, capabilities and storage reference](rust/README.md).
- `protocol.json`: generated copy of `javascript/spec.js` for the Python driver. The independent Rust runtime advertises its own supported tools/schema. Keep it synchronized using the command below.
- `examples/` and `rust/examples/`: local deterministic examples; no model credentials needed.

Browser UI, provider configuration, Google services and shared remote skill-catalog management remain outside the library. The runtime can accept an optional catalog object implementing `profile`, `search`, `read` and `resolve`; it has no import dependency on the suite server. Browser-only `read_current_project` / `apply_project` operations are excluded from standalone driver plans. Embedders can use the low-level context/project protocol to implement their own host bridge.

## Install Python

From the repository root:

```sh
python3 -m pip install ./codingagentlib
# For local development instead:
python3 -m pip install -e ./codingagentlib
```

No packages beyond Python's standard library are needed for normal file tools, managed scripts, subprocess commands, SQLite memory/skills/workflows and packaging. Optional local learned embeddings use `pip install './codingagentlib[embeddings]'` and prepared model files; they never download weights at startup. An optional trusted TypeScript service needs Node and TypeScript installed with `npm ci --prefix codingagentlib/python/code-navigation`, or pass a prepared external `navigation_dir`. The suite's legacy `npm ci --prefix server/code-navigation` location remains supported by the server launcher.

Use a virtual environment on systems that restrict global pip installs. The JavaScript local adapter's Python executable must select the environment where this package is installed. Native Rust needs no Python environment. From a source checkout without installing, set `PYTHONPATH` to the repository root; the Node adapter detects a checkout automatically.

## Python usage

```python
from codingagentlib import Agent

# Existing directory. Commands are disabled by default.
with Agent('/absolute/path/to/workspace') as agent:
    def model(request):
        inspected = any(e['kind'] == 'observation' for e in request['events'])
        return {
            'sessionId': request['sessionId'],
            'step': request['step'],
            'status': 'done' if inspected else 'act',
            'plan': 'Inspect workspace files',
            'action': None if inspected else {'tool': 'list_files', 'args': {}},
            'summary': 'Listed workspace files without editing them'
        }

    result = agent.run('List files', model, max_steps=500)
    print(result)
```

Replace `model(request)` with your provider call and return one response object or its JSON text. The request carries current IDs, the goal, permissions, actual observations, tools, instructions and the response schema. Callbacks must use the current `sessionId` and integer `step`. Invalid plans never execute and stop for input after three consecutive failed repairs. Model exceptions pause the session and propagate to the caller.

For explicit edits/commands:

```python
with Agent('/absolute/workspace', commands=['python3', 'git']) as agent:
    result = agent.run(
        'Implement and verify the requested change', model,
        allow_edits=True, allow_commands=True,
        max_steps=500,
        on_event=lambda event: print(event['status'])
    )
```

Executables must exist. File edits require `allow_edits`; commands require both the executable allowlist and `allow_commands`. The native driver returns `complete`, `waiting` or `paused`. Budget exhaustion returns a `sessionId`; explicitly resume with `agent.run(goal_or_followup, model, session_id=id)`. Existing session permissions remain fixed. `cancel_event` accepts a `threading.Event` checked around model calls and between steps; it cannot interrupt arbitrary blocking model callback code. To stop an active command from another application thread, use `agent.dispatch({'op':'cancel','session':id})` or the low-level runtime's cancel method.

### Executable path fallback

Python and native Rust resolve `run_command` programs and `run_script` interpreters before execution. A missing explicit path (for example `/old/install/python3`) falls back to searching `PATH` for its basename. This also works when registering an allowlisted executable and when its pinned installation disappears after startup. An approved alias is searched if a versioned canonical target is no longer available. Python uses the platform's `shutil.which` rules; Rust checks regular executable files in `PATH` order and considers `PATHEXT` suffixes on Windows. Both return the resolved absolute path as `resolvedExecutable` in command receipts, alongside the requested `command`.

Fallback preserves permissions: a missing model-supplied path must name an approved executable, and an existing unapproved path is rejected even if its basename matches an approved command. Existing nonexecutable paths do not trigger substitution. Python's explicit `commands=['*']` policy permits any resolvable executable; restricted lists and disabled session command permissions remain enforced. The search uses the host process's environment, does not scan the filesystem, and does not install programs or enable unknown tool names. JavaScript LocalRuntime also resolves a relocated Python interpreter using its supplied `env`. The VS Code worker launcher applies the same search to its native executable; worker startup failures reject subsequent requests instead of leaving them pending. These launchers resolve before spawning and never retry a process that may already have started. On POSIX, an absent `PATH` uses `/usr/bin:/bin`, while an explicitly empty `PATH` retains current-directory lookup. Inaccessible or broken entries are skipped during `PATH` searches; errors at an explicit existing path remain errors. Hosts must supply a trusted `PATH`; commands run with host OS permissions, not in an OS sandbox.

Failure after search produces an unsuccessful tool observation for the next model turn. The harness does not retry the command or replay side effects. Existing argument validation, timeouts, output paging, cancellation and verification apply to the resolved executable. JavaScript LocalRuntime and the suite server share the Python implementation; the VS Code native worker shares Rust's implementation.

Checks: `python3 -m unittest codingagentlib.test_command_resolution` and `cargo test --locked --manifest-path codingagentlib/rust/Cargo.toml --test command_resolution` exercise stale paths, removed versioned targets, script interpreters, permission denials and failure observations with local executables and deterministic callbacks.

For custom orchestration use `agent.start(...)`, `agent.next(session_id)` and `agent.submit(session_id, response)`. Each `next` reserves a fresh turn. Submitting the same turn twice does not replay its action. A question pauses the run. Use `Runtime.dispatch()` directly for session listing, follow-ups, guarded file tools, context archives, workflows, memory, inspection, acceptance reports and independent-review prepare/submit operations.

```python
from codingagentlib import Runtime
runtime = Runtime('/absolute/workspace', commands=())
try:
    session = runtime.dispatch({'op': 'start', 'goal': 'Inspect', 'allowEdits': False})
    print(runtime.dispatch({'op': 'files', 'session': session['id']}))
finally:
    runtime.close()
```

## JavaScript usage

The core exports `spec`, `loop`, `context`, `checks`, `acceptance`, `planning`, and `independentReview`. The original `loop.run()` accepts model, action, audit, synchronization, recovery, pause and review callbacks; no DOM, filesystem or HTTP transport is hardcoded in the core. Its trace callbacks report public operation boundaries, not hidden model reasoning.

For real local tools, use the adapter:

```js
const {LocalRuntime} = require('./codingagentlib/javascript');
const agent = new LocalRuntime({workspace:'/absolute/workspace', commands:[]});
try {
  const result = await agent.run({
    goal:'Inspect the project',
    model: async request => JSON.stringify(await myProvider(request)),
    onTrace: event => console.log(event.phase, event.status),
    batch:500
  });
  console.log(result.status, result.sessionId);
} finally {
  await agent.close();
}
```

The shown `await` belongs inside an async function in CommonJS; see the runnable [example](examples/javascript-agent.cjs). `LocalRuntime` options: `workspace`, `commands`, `python` (default `python3`), `pythonPath` (optional package/checkout search path), `env` (worker environment). `.run()` supports `sessionId`, `allowEdits`, `allowCommands`, `acceptanceRules`, `signal`, `batch`, `onUpdate`, `onTrace`, `onPause` and a separate `review` model callback. An absent pause callback returns a paused result at the batch limit. An explicit callback may wait for application input before continuing. An AbortSignal terminates the local worker, whose shutdown cancels active commands; inspect/reload the saved session before resuming.

For browser embedders load the individual files from `codingagentlib/javascript/` in the suite's script order. They preserve the existing `SuiteCodingAgentSpec`, `SuiteCodingAgentLoop`, `SuiteAgentContext`, etc. globals. Do not load the CommonJS `index.js` directly as a browser script. The old `shared-agent/*.js` core paths are CommonJS compatibility imports; suite browser pages now use canonical library paths. Browser UI files stay in `shared-agent/`.

## Rust usage

Add a local path dependency:

```toml
[dependencies]
codingagentlib = { path = "/path/to/singlepageapps/codingagentlib/rust" }
serde_json = "1"
```

```rust
use codingagentlib::{Agent, RunOptions};
use serde_json::json;

fn main() -> codingagentlib::Result<()> {
    let mut agent = Agent::new("/absolute/workspace", &[])?;
    let result = agent.run("Inspect", &RunOptions::default(), |request| {
        Ok(json!({
            "sessionId": request["sessionId"], "step": request["step"],
            "status":"ask", "plan":"Clarify requirements",
            "action":null, "question":"Which feature should be inspected?"
        }))
    })?;
    println!("{}", result);
    agent.close()?;
    Ok(())
}
```

`RunOptions` controls `allow_edits`, `allow_commands` and `max_steps` (default 500). Rust callbacks return `serde_json::Value`; Rust validates identities/plans, executes tools and persists observations itself. Low-level `start`, `next`, `submit`, `dispatch`, `health`, `cancel`, `request` and `close` remain public. `cancel_handle()` can interrupt a command from another thread. `Agent::spawn` is deprecated compatibility syntax whose interpreter argument is ignored; it does not launch a worker.

The Rust runtime is independent of Python and has its own versioned storage and supported-tool list. It supports guarded file edits, scripts, allowlisted commands, output paging, action checks, completion verification, local findings, revisioned skills/literal workflows and result ZIPs. It does not implement the Python runtime's optional semantic navigation/ONNX embeddings, shared remote catalog, browser context/project protocol, independent review, acceptance rules or the JavaScript driver's compression/live steering heuristics. Hosts inject their model/provider transport in every language. See [native Rust details](rust/README.md) before migrating persisted sessions or relying on advanced features.

## Worker protocol

```sh
python3 -m codingagentlib --workspace /absolute/workspace \
  --allow-command python3 --allow-command git
```

Options: required `--workspace`, repeatable `--allow-command` (default none), optional `--navigation-dir` / `--embedding-dir`, and `-h` / `--help`. The worker never starts a web server. Each stdin/stdout line is one JSON frame:

```json
{"protocol":"codingagentlib/1","id":1,"method":"dispatch","params":{"op":"health"}}
```

```json
{"protocol":"codingagentlib/1","id":1,"ok":true,"result":{"enabled":true}}
```

The result above is abbreviated. Errors use `ok:false,error:{type,message}` with matching IDs. Supported methods: `dispatch` (runtime operation object), `agent_start` (Python `Agent.start` keyword fields), `agent_next` (`session_id`), `agent_submit` (`session_id`,`response`), `close` (empty params). stdout contains only protocol frames; diagnostics use stderr. Requests above 16 million characters are rejected. EOF/graceful termination closes the runtime. Calls are serial and no browser callbacks are implicitly serviced.

## Compatibility and storage

`server.agent_*` modules alias the canonical Python modules, preserving old imports and test monkeypatch behavior. The server still owns HTTP/origin policy, provider credentials and private-path exclusions. Headless embedders must supply their own transport/authentication/private-file policy. The old shared-catalog interface can be injected through `runtime.shared_skills`; it is not packaged with this library.

Python sessions, recovery copies, managed scripts and SQLite state remain under `<workspace>/.suite-agent/` with the existing layout. Result ZIPs and runtime tool protocols retain their existing formats. Commands use the process's OS permissions and are not sandboxed. File-tool rollback cannot undo arbitrary command side effects. Keep private configuration outside the workspace or register protected paths with `runtime.private_paths`.

## Verify

From the repository root:

```sh
python3 -m unittest codingagentlib.test_library
python3 -m unittest discover -s server -t . -p 'agent*_test.py'
node codingagentlib/javascript/local-test.cjs
node scripts/verify-suite.cjs
node shared-agent/browser-test.cjs
cargo test --manifest-path codingagentlib/rust/Cargo.toml
```

Rust integration tests are native and do not require the Python package, `PYTHONPATH`, or a Python interpreter. Unix command tests explicitly allow `/bin/sh`; the library itself does not require a shell. Navigation checks need the optional TypeScript npm dependencies; embeddings checks need prepared model files. Tests use deterministic model callbacks and temporary workspaces, without paid AI calls.

Regenerate the Python protocol artifact after changing the canonical JavaScript spec:

```sh
node -e "require('fs').writeFileSync('codingagentlib/protocol.json',JSON.stringify(require('./codingagentlib/javascript/spec.js'),null,2)+'\\n')"
```

## Standalone VS Code extension

[`vscode/`](vscode/README.md) provides a standalone, installable VS Code extension with native Rust workspace execution, model chat/follow-ups, saved sessions, live trace, file comparisons and ZIP exports. It needs no Python package or suite server. API keys use VS Code SecretStorage; trust and per-run permissions are explicit. Build the platform-specific VSIX with `npm ci`, `npm run verify`, and `npm run package -- --target linux-x64` from that directory. See its guide for direct provider setup, optional relay transport, remote hosts and supported capabilities.

## Simple host integration API

JavaScript, Python and Rust now export `EmbeddedAgent` for registering application tools and injecting model callbacks, public progress events, approval hooks, context and cancellation. Questions and follow-up resumes share the same JSON protocol. See [cross-language integration examples and contracts](README.md#integration), including a small [Rust browser UI](rust/examples/ui.rs) using actual native workspace tools.

The JavaScript planning core exposes `loop.failureRecovery(events)` for structured, observation-based recovery guidance. The suite shows it in a foldable panel, offers an unsent follow-up draft and exports a linked JSON report. See the [agent recovery guide](../shared-agent/README.md#evidence-based-failure-recovery).
Optional progressive tool discovery reduces current-turn definitions in the JavaScript loop/LocalRuntime, with audited read-only lookup in the Python runtime. It does not enable tools or change permissions. See the [integration guide](README.md#integration-progressive-tool-definitions).


## Scoped repository instructions

Python and native Rust now refresh `projectInstructions` for every planning turn. The browser JavaScript loop forwards this runtime-provided context unchanged, including when history compression and progressive tool discovery are active. Native VS Code uses the same Rust implementation. Standalone JavaScript hosts can supply the additive `projectInstructions` field in `reserveTurn` results; without it, existing behavior is preserved.

`read_project_instructions` is a read-only tool accepting a workspace-relative file/directory `path` (default `.`). It reads root-to-target `AGENTS.override.md` / `AGENTS.md`, choosing the first non-empty document at each level. Return fields include `documents` (`path`, `scope`, `sha256`, `bytes`, `content`), `complete`, `warnings`, `target`, and a 32 KiB aggregate byte budget. Hashes identify actual source bytes, not trust or correctness. Oversized/unreadable sources are reported rather than silently cut; unrelated subtrees and home-directory settings are not scanned. The next automatic discovery follows the most recent file or instruction-scope action. Use the tool before editing a new subtree.

Turn audit events retain document paths, scopes, hashes and warnings, while full source bodies are supplied only in the current request or an explicit tool observation. Guidance remains subordinate to host/system and explicit user instructions and never grants permissions. Reading instruction metadata alone does not satisfy the browser loop's fresh-source-inspection completion requirement.

Design references: [OpenAI: AGENTS.md discovery and scope](https://developers.openai.com/codex/guides/agents-md), [Anthropic: effective context engineering](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents). The implementation intentionally keeps local guidance exact while reducing redundant history. Automated checks use deterministic model callbacks and local runtimes; they do not establish comparative performance against live models.

Validation: `python3 -m unittest codingagentlib.test_project_instructions`, `node shared-agent/project-instructions-test.cjs`, `node shared-agent/tool-discovery-browser-test.cjs`, and the native Rust/VS Code suites.


## Source-bound verification

New command receipts bind observed success to the known source inputs: files inspected or edited through file tools, and managed scripts. Python and native Rust hash these inputs before and after each command. Each result includes `verificationBinding` with exact input hashes, an aggregate SHA-256 `inputDigest`, the number of bound files, stability and warnings. Bindings are saved with the session and command receipt; they survive restarts. File contents are not copied into this metadata.

Planning requests expose `verificationFreshness`:

| Status | Meaning |
| --- | --- |
| `none` | No new binding has been recorded. Earlier receipts are not retroactively bound. |
| `unbound` | The command succeeded but no known inputs were tracked; it does not certify the workspace. |
| `current` | Successful command, stable tracked inputs during execution, and matching hashes now. |
| `stale` | An input changed, disappeared, was newly tracked, or changed during the command. |
| `unavailable` | The input snapshot could not be completed or read safely. |
| `failed` | The latest command failed, timed out or was cancelled. |

A `stale` or `unavailable` binding blocks a full completion claim in both runtimes. The browser loop also checks it before completion, keeping its copy separate from model-visible metadata. The runtime checks again at completion to catch changes made while the model was planning. Inspect current files and propose a fresh meaningful verification command, or report `partial`/`blocked`. Nothing replays a previous command automatically. The host may replan from a rejected completion or pause for explicit Resume.

A formatter or other command that changes tracked inputs needs a separate verification command afterward. Newly inspected inputs can also require another command because the earlier receipt was not bound to them. A later read alone does not refresh test evidence.

Snapshots cover at most 256 known files/scripts, each up to 2,000,000 bytes. Symlinks, non-regular/unreadable inputs and exceeded budgets produce explicit warnings and cannot certify completion. This is a bounded read/edit-set check, not a whole-workspace snapshot: unread dependencies, environment changes, files edited only by shell commands and browser-project state outside the runtime remain outside this binding. Matching hashes do not prove test adequacy, hermeticity or an atomic snapshot, and do not rule out transient changes that leave the same final bytes. Existing permissions, allowlists, approval and acceptance checks remain authoritative.

This extends the evidence-oriented tool design discussed in [Anthropic's tool-engineering guidance](https://www.anthropic.com/engineering/writing-tools-for-agents). It adds no model calls for hashing and makes no comparative live-model performance claim.

Checks: `python3 -m unittest codingagentlib.test_verification_binding`, `node shared-agent/verification-binding-test.cjs`, native Rust tests, and the VS Code native-worker integration suite. These exercise source drift after planning, mutation during a command, deletion, script changes, symlinks, persistence, model-metadata mutation, external-edit preservation and fresh re-verification.


## Precise edit batches

`apply_edits` applies several exact changes to **one existing UTF-8 file** with one whole-file `expectedHash` and one atomic file replacement. It is available in Python, native Rust, browser agents and VS Code. This consolidates related edits without asking the model to resend unchanged file contents.

```json
{
  "tool": "apply_edits",
  "args": {
    "path": "src/example.py",
    "expectedHash": "<actual SHA-256 returned by read_file>",
    "edits": [
      {"find": "def add(a,b):", "replacement": "def add(a, b):"},
      {"find": "return a-b", "replacement": "return a+b"}
    ]
  }
}
```

Every `find` is matched against the **original snapshot**, not earlier replacement text. By default exactly one match is required. Use a more specific anchor or an explicit `count` (1–1,000) when repeating the same change. Matches are checked for ambiguity and overlap, including self-overlapping anchors. Adjacent edits are allowed. Missing matches, wrong counts, overlapping edits, stale hashes, invalid fields or oversized results reject the whole batch before any source write. Unknown top-level arguments, including `dryRun`/preview flags, are rejected; this tool is a write operation and has no preview mode.

A batch contains 1–32 edits and keeps the complete file within 2,000,000 UTF-8 bytes. Text replacements are literal; no regex evaluation or replacement-string expansion occurs. Unicode and original line endings outside changed text remain intact. Read current source first and use its real hash. New files still use `write_file`; changes across files require separate operations.

Successful batches participate in edit permissions, normal file recovery, workflow preflight, scoped guidance, source-bound verification, acceptance-check freshness and changed-file inspection. A new batch invalidates earlier recorded verification just like another source edit. Results include `path`, final `hash`, byte count, edit count and replacement count. The agent must inspect failures and make a fresh plan; invalid batches are not partially applied or blindly replayed.

Atomic means one file replacement after complete validation, not a multi-file transaction or isolation from arbitrary external writers. Python serializes file-tool edits within its runtime, and both implementations recheck the current hash before committing. External writers can still race the final filesystem operation; the usual source-bound verification and review remain necessary.

Design reference: [Anthropic: writing effective tools for agents](https://www.anthropic.com/engineering/writing-tools-for-agents), particularly consolidating coherent operations and returning actionable validation failures. No live-model speed or accuracy improvement is claimed.

Command receipts expose `stdoutSha256` and `stderrSha256` for complete raw log bytes, even when returned previews are paged. Python and Rust compute these with streaming reads. Consumers can compare the full outputs without loading them into the model context; these hashes certify neither command correctness nor the completeness of a program's own logging. The VS Code unchanged-cycle guard uses full digests and avoids equating incomplete legacy previews.

## Optional model handoff

[Evidence-driven model handoff](README.md#model-handoff) adds shadow evaluation and an opt-in one-time primary-to-efficient switch, configurable in the relay and VS Code and available through JavaScript, Python and native Rust APIs. Saved role state survives resume; existing permissions and verification gates still apply.

## Recovering from concurrent file edits

Python, JavaScript `LocalRuntime` and native Rust now return the same additive conflict receipt for guarded file edits. VS Code uses the native Rust implementation. Existing `ok:false` and `error` fields remain available:

```json
{
  "ok": false,
  "code": "file_revision_conflict",
  "conflict": {
    "path": "src/example.py",
    "expectedHash": "<revision used by the proposal>",
    "actualHash": "<current SHA-256, or missing>",
    "requiresRead": true
  },
  "recovery": {
    "strategy": "read_then_replan",
    "automaticRetry": false,
    "nextAction": {"tool": "read_file", "args": {"path": "src/example.py"}},
    "note": "Read current contents and preserve concurrent edits before making a new proposal."
  }
}
```

This receipt means the stale edit was rejected. The recovery action is a suggestion for a new approved turn, not a scheduled operation. Read current contents, incorporate concurrent changes, then propose an adapted edit using its fresh hash and a new call ID. If the file was removed, inspect the parent folder before deciding whether to recreate it. Never fix a stale write by replacing only its hash. Managed-script conflicts in Rust suggest `read_script` instead. Permissions, validation and call-ID deduplication still apply; no write is retried automatically.

The JavaScript loop exposes the supplied receipt as `loop.failureRecovery(events).recoveryPlan`, alongside `revisionConflict`, for browser or custom host recovery interfaces. Python callers inspect `Runtime.dispatch(...)`; Rust callers inspect `Agent::dispatch(...)`. All fields also remain in recorded observations for resumed sessions. Host code should treat paths and notes as untrusted data, render them as text and validate suggestions through its normal tool policy.

VS Code shows a concise conflict explanation and **Draft recovery follow-up** beside the raw result. The button appends to the current draft after the run pauses or stops. Review it and choose Resume; drafting neither executes a tool nor changes permissions.

Checks: `python3 -m unittest codingagentlib.test_revision_conflicts`, `node --test codingagentlib/javascript/revision-conflict-test.cjs`, Rust's `revision_conflict_recovery_preserves_external_work_and_receipts` test and the VS Code panel tests use local deterministic workspaces; no paid model calls.

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


---

<a id="howto"></a>

## HOWTO: choose files and integrate codingagentlib

Start with the integration you need. You normally import a public entry point;
its internal dependencies load automatically. You do not need every file in this
folder, and a plain HTML page cannot directly load Node-only CommonJS modules.

This guide covers the checked-in source tree, including examples, tests, generated
contracts, packaging and editor integration. Build outputs, installed dependencies,
caches and saved workspace/session data are not distributable source files and are
excluded from the file index.

<a id="howto-choose-an-integration"></a>

### Choose an integration

| Case | Entry point / files you use | What you supply | Example |
| --- | --- | --- | --- |
| Plain HTML text chat | No agent library required | UI, conversation history and backend model call | Send messages to your authenticated `/api/chat`; render its text. |
| HTML assistant with application tools | `javascript/embedded.js` | UI, model callback, application tool handlers | Change the selected SVG rectangle through an editor callback. See A. |
| Generic SDK with contracts, policies and budgets | `javascript/core.js` or Python `create_agent`; Rust `core` | Model, tool registry, context and policy | Look up a customer record and return an answer. See B. |
| Node coding agent over local files | `javascript/local.js`, or `coding.js` for exclusive ownership | Workspace, installed Python package, provider callback, permissions | Read, edit and verify an SVG file on disk. See C. |
| Native Python coding automation | `from codingagentlib import Agent` or `ReactAgent` | Workspace, model callback, executable allowlist | Fix a source file and run its existing checks. See D. |
| Native Rust coding automation | `rust/` crate: `Agent`, `RunOptions` | Workspace and model callback | Compile a standalone native coding tool. See E. |
| Another language talking to Python | Root `__main__.py` worker | Subprocess transport and JSON frame handling | C# host sends `agent_next` and `agent_submit`. See F. |
| Existing suite app/browser coding tab | `javascript/loop.js` and its script dependencies; suite host code outside this library | Runtime/project bridge, provider relay, context and UI | Apply reviewed changes to the open browser project. See G. |
| Durable generic sessions | `node-store.js`, `python/sqlite_store.py`, or Rust host `SessionStore` | Private storage location and lifecycle handling | Resume after a process restart. See H. |
| MCP / external-agent / editor protocols | Optional transports and extensions | Explicit trust, authentication and real transport | Expose a read-only lookup through MCP. See I. |
| Multiple model roles / complex planning | Mosaic, handoff, collaboration, state machines or other orchestrators | Explicit role callbacks, budgets and evidence policy | Ask a bounded reviewer to inspect a proposed change. See J. |
| Governed durable Python jobs | `extension_pack`: `ExtensionPack.core_options` around `create_agent` | Git repository, private state, trusted check/model callbacks; POSIX locks | Checkpoints, verification, approval and budget controls. See L. |
| SVG + rich text + chat UI | `examples/two-views/` and Rust `examples/two_views.rs` | Python UI host plus selected SDK runtime; optional model endpoint | Separate view tools and exportable communication trace. See M. |
| VS Code user interface | `vscode/` extension | Supported native worker build and provider settings | Install a VSIX with chat, file review and saved sessions. See K. |

A browser editor document and a server workspace file are different resources.
Loading an agent library does not grant access to local files or commands. Your
host decides which tools exist, what they can access and how their effects are
approved. None of these APIs creates an OS sandbox.

<a id="howto-a-html-assistant-one-standalone-agent-script"></a>

### A. HTML assistant: one standalone agent script

Serve this example over HTTPS or localhost. The model response must follow the
request's `responseSchema`; the backend returns the response object directly here.
The `/api/model` route is an application endpoint you implement, not an endpoint
created by `embedded.js`.

```html
<script src="/codingagentlib/javascript/embedded.js"></script>
<script>
  const agent = new SuiteEmbeddedAgent({
    contextProvider: () => ({selectedId: 'badge'}),
    onEvent: event => console.log(event.kind, event.value)
  });
  agent.addTool('read_selection', () => ({id: 'badge', fill: '#ef4444'}), {
    description: 'Read the selected shape', permission: 'read'
  });
  async function askAgent(goal) {
    const result = await agent.run({
      goal,
      model: async (request, signal) => {
        const reply = await fetch('/api/model', {
          method: 'POST', signal,
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify(request)
        });
        if (!reply.ok) throw new Error('Model HTTP ' + reply.status);
        return reply.json();
      }
    });
    return result;
  }
</script>
```

Replace the static selection callback with your editor API. Register a separate
write handler only when edits are desired, enforce document revisions in it, and
supply `allowEdits: true` for an edit-enabled run. The handler—not model text—makes
the change. Build chat controls, render events as text, and display `result.summary`
or the returned question/status in your UI.

**Needed:** `embedded.js`, your HTML/JS and model transport. **Not needed:** Python,
`local.js`, `executable.js`, `index.js`, the suite server, or Node. Optional named
live context can be composed using `integration.js`; it is not a prerequisite.
API keys should remain in your backend or another credential-safe host transport.
For plain chat without tool orchestration, a direct backend call is sufficient.

<a id="howto-b-generic-sdk-registered-tools-and-stronger-contracts"></a>

### B. Generic SDK: registered tools and stronger contracts

From the repository root, this CommonJS example is deterministic and makes no LLM
request. It uses `core.js`, which imports its contract modules automatically:

```js
const {createAgent} = require('./codingagentlib/javascript/core.js');
const agent = createAgent({
  tools: [{
    name: 'lookup', version: 1, description: 'Read a demonstration record',
    permission: 'read',
    parameters: {type: 'object', required: ['id'],
      properties: {id: {type: 'string'}}, additionalProperties: false},
    execute: args => ({id: args.id, title: 'Demo record'})
  }],
  model: request => {
    const observed = request.events.some(e => e.kind === 'tool_result');
    return {sessionId: request.sessionId, step: request.step,
      status: observed ? 'done' : 'act', plan: 'Look up the requested record',
      action: observed ? null : {tool: 'lookup', args: {id: '42'}},
      summary: 'Observed the demo record'};
  }
});
agent.run('Look up record 42').then(console.log).catch(console.error);
```

Use `create_agent` in Python or `core::create_agent` in Rust for equivalent generic
host orchestration, checking each language's actual signatures. Generic core has
no built-in workspace tools. Add your own authorization and completion policies.
Tool callbacks have real host permissions; a `read` annotation cannot make an
unsafe callback read-only.

**Browser deployment:** `core.js` in this checkout is CommonJS. Bundle it and its
dependencies with your browser build tools; do not add it as a plain script tag.
`index.js` also imports the broader coding stack, so a direct core import is the
clear boundary for a minimal generic integration. `embedded.js` remains the
standalone browser-script alternative. See [SDK reference](README.md#sdk) for differences in
contracts, persistence, uncertainty handling and budgets.

<a id="howto-c-node-coding-python-worker-and-executable-resolution"></a>

### C. Node coding: Python worker and executable resolution

From the repository root:

```sh
python3 -m pip install -e ./codingagentlib
node codingagentlib/examples/javascript-agent.cjs /absolute/existing/workspace
```

The [example](examples/javascript-agent.cjs) injects deterministic responses and
lists real workspace files. For live model calls replace the callback with your
provider transport. `LocalRuntime` starts Python and connects the JavaScript
coding loop to its guarded file/command runtime:

```text
Node host → local.js → executable.js → Python JSON-lines worker
          → loop.js → model callback → LLM provider
```

`executable.js` resolves a program before spawning it: checks an explicit path,
searches `PATH`, handles Windows `PATHEXT`, and returns an executable absolute
path. If an explicit installation path disappeared, it can search by basename.
It does not itself run the program, install Python, grant permissions or retry a
process that might already have started. It requires Node filesystem APIs and
belongs on the host, not inside your HTML page.

Use `require('./codingagentlib/javascript/local.js').LocalRuntime` for the legacy
adapter. `coding.js` wraps it with exclusive workspace ownership. Commands need
both a constructor executable allowlist and `allowCommands: true`; edits need
`allowEdits: true`. Include the Python package and runtime dependencies when
shipping this integration. Copying only `local.js` or `executable.js` is insufficient.

<a id="howto-d-python-workspace-agent"></a>

### D. Python workspace agent

```sh
python3 -m pip install -e ./codingagentlib
python3 codingagentlib/examples/python_agent.py /absolute/existing/workspace
```

Use `Agent` for the explicit next/submit/run coding API. Use `ReactAgent` when you
need the additional compaction, working briefs, recovery heuristics, lifecycle
hooks and budgets. Both execute through `agent_runtime.py`. Python needs no Node
for base file/command tools. Compiler navigation and learned embeddings are
optional integrations with their own prerequisites.

The complete [SVG walkthrough](../docs/coding-agent-book/SVG-EDITING.md) shows
`Agent(...)`, provider setup, edit permissions, exact model messages, file hashes,
verification receipts, skill/instruction discovery and session resume. Use that
example when moving from “chat about an SVG” to “actually edit this SVG file”.

`Runtime.dispatch` exposes lower-level tools/session operations for a host that
owns orchestration. Do not mistake a low-level tool result for a terminal agent
response. Neither `Agent` nor `ReactAgent` requires the JavaScript `embedded.js`.

<a id="howto-e-native-rust"></a>

### E. Native Rust

Depend on the local crate and use the examples in [rust/README.md](rust/README.md).
The crate's `Agent` runs a native workspace implementation; it does not launch a
Python worker. `default-features = false` selects the generic core boundary;
the `coding` feature adds the native execution dependencies.

```sh
cargo test --locked --no-default-features \
  --manifest-path codingagentlib/rust/Cargo.toml --test core --test beyond_react
```

The same feature names across languages do not guarantee full parity. Inspect
capabilities and tool lists: Python-specific protocol adapters, memory/harness
features and navigation are not automatically implemented by Rust or JavaScript.
Rust and Python coding session formats are independent.

<a id="howto-f-subprocess-integration-from-another-language"></a>

### F. Subprocess integration from another language

```sh
python3 -m codingagentlib --workspace /absolute/existing/workspace
```

Send one JSON frame per stdin line; consume one response per stdout line:

```json
{"protocol":"codingagentlib/1","id":1,"method":"dispatch","params":{"op":"health"}}
```

The worker returns the matching `id`, `ok`, and `result` or `error`. A normal host
uses `agent_start`, `agent_next`, its own model call, then `agent_submit`. The
worker is not an HTTP server or a model provider. Keep diagnostics on stderr and
reconcile unknown tool outcomes before repeating effects. See [README.md](README.md#worker-protocol).
Root `rpc.py` is a separate MCP JSON-RPC service; it is not this worker envelope.

<a id="howto-g-full-suitebrowser-coding-integration"></a>

### G. Full suite/browser coding integration

The browser coding tab uses `loop.js`, the coding spec, context/planning/check and
review helpers plus the host's script loading order. The host in
[shared-agent/ui.js](../shared-agent/ui.js) supplies runtime calls, turn reservation,
recording, app snapshots, provider transport and UI. Inspect an existing suite
app's script tags before constructing that integration yourself.

This stack supports both open-project tools and a relay filesystem workspace.
It offers richer coding behavior than the lightweight `EmbeddedAgent`, but the
loop alone supplies no filesystem or provider connection. Reusing the entire suite
UI is not necessary when all you want is an HTML assistant with a few editor tools.

<a id="howto-h-persistent-state-context-and-memory"></a>

### H. Persistent state, context and memory

| Need | Files / example |
| --- | --- |
| Restore generic Node sessions | `node-store.js`: inject `DirectorySessionStore` into core options; choose a private directory. |
| Restore generic Python sessions | `python/sqlite_store.py`: inject `SQLiteSessionStore`. |
| Native durable generic Rust sessions | Implement `SessionStore` as described in the Rust/core API. |
| Live editor selection/document context | `integration.js` / `python/integration.py`; follow `examples/dynamic-editor.cjs` or `dynamic_context.py`. |
| Source-derived project graph | `graph-memory.js`, Python `project_knowledge.py`/`graph_query.py`, Rust graph modules; supply source snapshots or the configured workspace. |
| Workspace skills and guidance | Python `agent_skills.py` and `agent_instructions.py`; read pinned skill pages and scoped `AGENTS.md` before reuse/editing. |
| Persistent coding working memory | Python `agent_memory.py`, `agent_memory_manager.py`, `agent_memory_architectures.py`; runtime storage and optional learned embeddings. |

A snapshot is not automatically durable storage. Store leases, pending effects,
revision guards and permissions remain important on resume. Memories, graph links,
skills and model summaries are reference material, not executed verification.

<a id="howto-i-external-tools-and-editor-protocols"></a>

### I. External tools and editor protocols

Generic `extensions.js` / `python/extensions.py` import/expose host-registered tools
through a supplied MCP transport and support bounded read-only delegation. MCP
transport modules add explicit JSON-RPC/stdio clients; Python also contains HTTP
MCP transport. Read the actual capabilities before assuming transport parity.

For example, connect a trusted MCP client, pass it to `mcpTools` / `mcp_tools` with
an explicit trust callback, then register the resulting tools with the generic
core. Imported tools require command permission regardless of remote annotations.
Your transport owns authentication, cancellation and uncertain-call reconciliation.

Python-specific optional modules also provide A2A client/server helpers, SSE/AG-UI
and ACP event bridges, and GenAI tracing. They do not start a public network
service just because you import them. The suite server explicitly wires supported
routes. Verify actual protocol compatibility with your target client; a matching
protocol label alone is insufficient.

<a id="howto-j-multiple-models-and-orchestration"></a>

### J. Multiple models and orchestration

| Requirement | Modules | Example decision |
| --- | --- | --- |
| Choose a configured model per role | `mosaic.js`, `python/mosaic.py`, Rust `mosaic.rs` | Planning, coding and review routes with explicit call budgets. |
| One-way model handoff | `handoff.js`, Python/Rust handoff | Switch once after actual evidence; preserve permissions and session state. |
| Advisory model discussions | `collaboration.js` | Solver/critic suggestions to a coordinator; agreement is not tool evidence. |
| Explicit state graph | `state-machine.js`, Python/Rust equivalent | Route inspection → proposal → review with a bounded transition budget. |
| Explore candidates | `tree-search.js`, Python/Rust equivalents | Evaluate candidate plans before selecting one. |
| Higher-level orchestration | `beyond-react.js`; Python `codeact.py`, `pipelines.py`, `multi_agent.py`, `hybrid_agent.py` | Planner/executor or Reflexion workflows with explicitly configured callbacks. |
| Optional decision callback | Python `decision_model.py`; coding loop options | Advisory or pre-execution gate on a proposed action. |

These are optional host choices, not requirements for simple chat. Do not have
multiple coding writers modify one workspace without explicit ownership and
conflict handling. A read-only reviewer needs its own bounded tool set and context.
For working examples see [model collaboration](README.md#model-collaboration),
[model handoff](README.md#model-handoff) and [coding guide](README.md#coding-guide).

<a id="howto-k-vs-code"></a>

### K. VS Code

`vscode/` contains an extension host (`src/`), webview UI (`media/`), build scripts,
manifest and tests. It launches the native Rust worker, not `LocalRuntime`'s Python
worker. Follow [vscode/README.md](vscode/README.md) to build/install a platform VSIX.
The separate `npm run test:editor-host` command uses an installed VS Code
executable and disposable profile to qualify real editor APIs and bundled native
execution. Text file mentions support `#page=N`; combined previews enforce their
48,000-character budget and report omitted content. Unit tests, browser-panel
tests, actual editor-host runs and live-provider evaluation are separate evidence.
Your standalone HTML assistant does not need this directory. Its provider,
executable and context modules are extension-specific even when names resemble
files in `javascript/`.

<a id="howto-l-extension-pack"></a>

### L. Opt-in Python extension pack

Use `from codingagentlib.extension_pack import ExtensionPack` with the generic
`create_agent` host. Python 3.10+, Git and POSIX file locks are needed; install the
full `codingagentlib` package. The separately generated `codingagentextensions`
package contains generic MCP/delegation helpers, not this pack.

```sh
PYTHONPATH=. python3 codingagentlib/examples/extension_pack_demo.py
```

The deterministic demo creates a temporary committed Git repository, reads its
note through namespaced MCP, pauses at a missing verification gate, runs an actual
Git diff check, resolves that escalation and resumes the same SDK session. It
prints a complete result, checkpoint count, audit-chain validity and reserved
budget usage. No paid model, Docker, suite relay or UI is needed.

For an application, configure model tiers before constructing the agent, then
pass `pack.core_options(dict(model=model, tools=tools))` to
`create_agent`. Keep private durable state outside the source tree being checked.
The adapter uses public host policies, callbacks and storage; the host still owns
provider streaming/authentication, tool effects and permission flags.

Default completion gates require deterministic tests, security checks and two
reviewer receipts; frontend files detected as changed at pack construction add a
browser gate. Supply real host check callbacks through `pack.verification.run`.
`verification={}` disables those gates explicitly. Without configured tier prices
and output bounds, routing/cost controls warn and remain unavailable.

`core_options` is the current Python SDK integration. `apply(config,
supported_surfaces=...)` is only for hosts that document those SessionConfig-style
surfaces; unsupported surfaces warn. It does not add a SessionConfig API to the
JavaScript or Rust SDKs. See the [configuration and lifecycle reference](extension_pack/README.md)
and [handbook walkthrough](../docs/coding-agent-book/HANDBOOK.md#6-extension-pack-durable-governed-python-jobs).

<a id="howto-m-two-view-ui"></a>

### M. SVG and rich-text editor with chat and trace export

```sh
python3 codingagentlib/examples/two-views/serve.py python
# Select javascript instead for the Node implementation of the JS/TS SDK.
# For native Rust, first build the host:
cargo build --locked --manifest-path codingagentlib/rust/Cargo.toml --example two_views
python3 codingagentlib/examples/two-views/serve.py rust
```

Run one UI host at a time and open `http://127.0.0.1:8765`. Each language registers
its own `EmbeddedAgent` tools: `svg_color` changes the fixed SVG circle and
`rich_text` replaces paragraph text while retaining document styling. Default
commands (`svg_color purple`, `rich_text Hello`) use a deterministic callback;
configure the documented endpoint environment variables for natural-language chat.
Python serves the page/provider bridge in every mode; Rust/Node execute their own
tools. This example is separate from the extension pack and the 24 suite apps.

The bottom panel shows model requests/responses, public steps and observations.
JSON export retains page runs and document state. Events appear after each bounded
run returns; the sample does not stream tokens. Reload clears in-page state.
See [launch instructions and provider requirements](examples/two-views/README.md)
and the [handbook message walkthrough](../docs/coding-agent-book/HANDBOOK.md#7-two-view-ui-and-message-trace).

<a id="howto-request-protocols-and-returned-results"></a>

### Request protocols and returned results

| API | Model protocol | Observations / return |
| --- | --- | --- |
| Lightweight `EmbeddedAgent` | `codingagentlib/embedded-v1` | `observation` events; terminal status/session/summary or question. |
| Generic core | `codingagentlib/sdk-v1` | `tool_result` events with typed receipt; terminal status, usage and summary/question. |
| Coding `Agent` / coding loop | `suite-coding-agent/v1` | Runtime observations with hashes/command results; completion subject to evidence gates. |
| Python subprocess worker | Outer `codingagentlib/1` | Worker request ID wraps results; inner model payload is a separate contract. |

Always use the current `sessionId` and integer `step` from the actual request.
Return one response object or JSON text with `act`, `ask` or `done` as required by
that API. Provider adapters unwrap provider-specific envelopes; the LLM content
is not the HTTP response envelope. File effects happen in tool execution, not when
a final summary is returned. See the [book](../docs/coding-agent-book/README.md)
for payload-by-payload examples and completion limits.

<a id="howto-javascript-module-reference"></a>

### JavaScript module reference

“Browser script” below means the file has a standalone global export. “Bundle”
means CommonJS imports need a build step for browser use. Node imports load their
own dependencies; avoid manually copying selected internal files.

| File | Environment / purpose | Needed when |
| --- | --- | --- |
| `embedded.js` | Browser script / Node; lightweight `EmbeddedAgent` | HTML assistant with registered tools; case A. |
| `core.js` | Node / browser bundle; generic SDK loop | Policies, schema validation, budgets and stores; B. |
| `contracts.js` | Core JSON/schema validators | Automatically loaded by generic core/extensions. |
| `contracts-data.js` | Generated contract schema data | Required by validators; regenerate, do not hand-edit. |
| `index.js` | CommonJS aggregate exports | Node convenience imports; not a raw HTML script. |
| `adapters.js` | Embedded-to-core adapter | Migrate registered EmbeddedAgent tools to generic core. |
| `local.js` | Node/Python subprocess bridge | Local coding runtime; C. |
| `coding.js` | Node coding wrapper with exclusive workspace ownership | Coordinate workspace access; C. |
| `executable.js` | Node executable path resolver | Automatically used to launch local runtime's Python. |
| `loop.js` | Browser script / Node coding orchestration | Full coding driver with host callbacks; C/G. |
| `spec.js` | Coding instructions and schema | Coding loop and protocol generation. |
| `context.js` | Coding context packing, recovery and compression | Large coding sessions; G. |
| `planning.js` | Task/dependency validation | Coding checklists and ready-task action binding. |
| `checks.js` | Declarative tool-result checks | Expected result assertions after an action. |
| `acceptance.js` | Run acceptance rules/evidence | Completion with required observed postconditions. |
| `independent-review.js` | Review checkpoint orchestration | Separate coding completion review. |
| `integration.js` | Live named `ContextRegistry` | Current app/document state per turn; H. |
| `tool-routing.js` | Progressive coding tool definitions | Reduce advertised schemas without granting new permissions. |
| `providers.js` | CommonJS provider transports/retry helper | Host configured OpenAI-compatible/Anthropic/Gemini/Ollama calls. |
| `node-store.js` | Node filesystem session store | Durable generic sessions; H. |
| `extensions.js` | Generic MCP/delegation adapters | Trusted remote tools or child agents; I. |
| `mcp-transports.js` | Node JSON-RPC/stdio transport helpers | External MCP bridge with literal argv; I. |
| `graph-memory.js` | Portable source-snapshot graph memory | Host-supplied project graph context; H. |
| `mosaic.js` | Model role routing | Configured model-per-turn selection; J. |
| `handoff.js` | Evidence-driven model handoff | Optional primary-to-continuation policy; J. |
| `collaboration.js` | Advisory multi-model coordination | Explicit solver/critic consultation; J. |
| `state-machine.js` | CommonJS bounded state graph | Explicit orchestration transitions; J. |
| `tree-search.js` | CommonJS candidate search | Model/host-defined search and scoring; J. |
| `beyond-react.js` | Higher-level orchestration helpers | CodeAct, planner/executor, agentless, multi-agent and Reflexion; J. |
| `*.d.ts` | TypeScript declarations | Editor/type checking for corresponding JS API; no runtime execution. |
| `package.json`, `LICENSE` | Package metadata and licensing | Installation/redistribution, not HTML script loading. |
| `*-test.cjs` | Deterministic tests | Development verification, not production imports. |

<a id="howto-python-module-reference"></a>

### Python module reference

Import public APIs from `codingagentlib` where exported. Most `agent_*` files are
runtime implementation modules, automatically composed by the coding entry points.

| Files under `python/` | Purpose / when needed |
| --- | --- |
| `agent.py`, `react.py`, `agent_runtime.py` | Coding next/submit/run, enhanced ReAct driver, actual workspace runtime; D. |
| `core.py`, `embedded.py`, `adapters.py`, `coding.py` | Generic core, lightweight host API, migration and exclusive coding adapter; B/D. |
| `contracts.py`, `contracts_data.py` | Contract validators and generated types/schema data. |
| `providers.py` | Provider adapters, retry, and native tool-use conversion; host model transport. |
| `integration.py` | Named dynamic context sources; H. |
| `sqlite_store.py`, `workspace_lock.py` | Durable generic storage and workspace ownership. |
| `agent_edits.py` | Literal validated file-edit batches. |
| `agent_instructions.py` | Scoped repository guidance discovery. |
| `agent_planning.py`, `agent_checks.py`, `agent_acceptance.py` | Task DAGs, result assertions and acceptance evidence. |
| `agent_verification.py` | Source-bound command verification/freshness. |
| `agent_review.py`, `agent_independent_review.py` | Change/completion review support. |
| `agent_context.py` | Context archives and paging. |
| `agent_parallel.py` | Bounded independent read batching, not child agents. |
| `agent_project.py` | Host/browser project context protocol. |
| `agent_project_memory.py` | Persistent project memory integration. |
| `project_knowledge.py`, `graph_query.py`, `source_imports.py` | Source-provenanced project ontology/graph creation, queries and import extraction. |
| `agent_memory.py` | Coding working-memory retrieval/storage. |
| `agent_memory_manager.py` | Long-term facts/lessons, lifecycle and scratchpad. |
| `agent_memory_architectures.py` | StructMem, egGENT, A-MEM, MAGMA and GAM layers. |
| `agent_embeddings.py` | Optional local learned embedding backend; prepared model/dependencies required. |
| `agent_navigation.py`, `code-navigation/` | Optional compiler-assisted navigation; trusted Node/TypeScript helper. |
| `agent_skills.py`, `agent_workflows.py` | Versioned local procedures and literal workflows. |
| `tool_library.py` | Reusable parameterized Python tools/targets. |
| `agent_pyenv.py`, `agent_harness.py` | Managed uv/venv environments and structured script execution/library capture. |
| `runtime_tools.py` | Portable SDK v1 (`CoreAgent`) tool adapters for generated scripts, `ScriptLibrary`, `PythonEnvironments`, `ToolLibrary`, and allowlisted programs. |
| `agent_tool_discovery.py` | Tool definition discovery; does not execute or authorize tools. |
| `agent_package.py` | Result ZIP creation, separate from completion. |
| `extensions.py`, `mcp_transports.py` | Generic MCP/delegation plus transport implementations; I. |
| `a2a.py` | Explicit agent-card/client/server/delegation helpers; I. |
| `streaming.py` | SSE, AG-UI and ACP bridges; I. |
| `otel_genai.py` | Trace context, public operation spans and export helpers; I. |
| `mosaic.py`, `handoff.py`, `decision_model.py` | Model routing, handoff and advisory/gate callbacks; J. |
| `state_machine.py`, `tree_search.py` | Bounded state orchestration and candidate search; J. |
| `codeact.py`, `pipelines.py`, `multi_agent.py`, `hybrid_agent.py` | Optional higher-level execution/planning/Reflexion composition; J. |
| `__init__.py` | Internal Python subpackage marker. |

Root `__init__.py` exports public Python APIs. Root `__main__.py` implements the
JSON-lines worker; `cli.py` supplies the command-line utility and `rpc.py` supplies
the MCP service. `pyproject.toml` controls package installation and optional extras.
Use explicit public imports rather than copying a single `agent.py` file out of
the package: its relative dependencies and protocol data are required.

<a id="howto-rust-packaging-examples-and-tests"></a>

### Rust, packaging, examples and tests

Rust `lib.rs` exports APIs; `core.rs` and contract modules implement generic SDK
orchestration. `runtime.rs`, `tools.rs`, `edits.rs`, `instructions.rs`, `planning.rs`,
`verification.rs` and `recovery.rs` support native coding execution. `embedded.rs`,
`integration.rs`, `extensions.rs`, `mcp_stdio.rs`, `graph_memory.rs`, `knowledge.rs`,
`mosaic.rs`, `handoff.rs` and `beyond_react.rs` supply their respective optional or
host integration features. `bin/codingagent-worker.rs` is the native worker used
by integrations such as VS Code. See the complete paths below.

`protocol.json` is the checked-in coding/SDK protocol artifact. Contract generation
produces JS/Python/Rust schema/type data; do not independently alter one language's
copy. `scripts/generate_contracts.py --check` checks synchronization.
`scripts/package_sdk.py` builds separate optional package sources; it does not
publish them. `Cargo.toml`, `Cargo.lock`, npm manifests/locks and licenses belong
to installation/build reproducibility, not model context.

`examples/` and `rust/examples/` are host integration recipes. `conformance/` and
Rust fixtures are shared test inputs. Root `test_*.py`, JS `*-test.cjs`, Rust
`tests/` and VS Code `test/` verify behavior; they are not additional agent features
to import. A passing deterministic example does not establish live-model quality,
provider availability or compatibility with every remote protocol implementation.

<a id="howto-complete-source-file-index"></a>

### Complete source-file index

Inventory: **358 existing nonignored SDK files**, including examples, documentation,
fixtures and tests; build/cache/session artifacts are excluded. Each is listed
below. Counts include the optional extension pack; importing the core does not
load all these files.

Extension pack additions: **22 source/document files**. Direct entry: `extension_pack/__init__.py`; modules are automatic dependencies, bundled personas/policies/skills are data, browser/container files and the test are optional verification support.

| File | Responsibility |
| --- | --- |
| [extension_pack/README.md](extension_pack/README.md) | Extension configuration, lifecycle, dependencies and operational reference |
| [extension_pack/__init__.py](extension_pack/__init__.py) | Public opt-in exports; direct Python host entry point |
| [extension_pack/adapter.py](extension_pack/adapter.py) | Configuration composition, CoreAgent integration and interactive event mapping |
| [extension_pack/agents/implementer.md](extension_pack/agents/implementer.md) | Bundled implementer persona instructions; data, not automatic delegation |
| [extension_pack/agents/planner.md](extension_pack/agents/planner.md) | Bundled planner persona instructions; data, not automatic delegation |
| [extension_pack/agents/reviewer.md](extension_pack/agents/reviewer.md) | Bundled reviewer persona instructions; data, not automatic delegation |
| [extension_pack/agents/security_auditor.md](extension_pack/agents/security_auditor.md) | Bundled security_auditor persona instructions; data, not automatic delegation |
| [extension_pack/audit.py](extension_pack/audit.py) | Recursive redaction, append-only audit chain and asynchronous OTLP Logs export |
| [extension_pack/browser_smoke.py](extension_pack/browser_smoke.py) | Optional in-container Chromium/WebDriver UI and export checks |
| [extension_pack/conventions.py](extension_pack/conventions.py) | Progressive file skills, direct Git/AST inspection and bounded asynchronous memory |
| [extension_pack/durability.py](extension_pack/durability.py) | Public SessionStore implementation, crash-released leases and checkpoint branching |
| [extension_pack/gateway.py](extension_pack/gateway.py) | Tool/completion policies, exact approvals, redaction and retry escalation |
| [extension_pack/policies/default.json](extension_pack/policies/default.json) | Bundled deny/gate patterns and write/approval allowlists |
| [extension_pack/protocols.py](extension_pack/protocols.py) | Namespaced filtered MCP dispatcher and authenticated A2A client wrapper |
| [extension_pack/routing.py](extension_pack/routing.py) | Model-tier callbacks, persistent token/cost reservations and checkpoint job lineage |
| [extension_pack/sandbox-image/Dockerfile](extension_pack/sandbox-image/Dockerfile) | Optional Python/Chromium verification image build recipe |
| [extension_pack/sandbox.py](extension_pack/sandbox.py) | Ephemeral Docker code/check execution with resource and internal wall-clock limits |
| [extension_pack/skills/verification/SKILL.md](extension_pack/skills/verification/SKILL.md) | Bundled progressively disclosed verification playbook |
| [extension_pack/verification.py](extension_pack/verification.py) | Per-session source-bound receipts and configured verification layers |
| [extension_pack/worktrees.py](extension_pack/worktrees.py) | Owned task branches/worktrees, OS leases and recovery cleanup |
| [examples/extension_pack_demo.py](examples/extension_pack_demo.py) | Runnable MCP/checkpoint/gate/routing composition without a provider |
| [test_extension_pack.py](test_extension_pack.py) | Host, restart, protocols, policy and optional real sandbox acceptance tests |


Two-view example additions: **7 source/document files** (listed here individually).

| File | Responsibility |
| --- | --- |
| [examples/two-views/README.md](examples/two-views/README.md) | Launch instructions, provider setup and boundaries |
| [examples/two-views/index.html](examples/two-views/index.html) | Shared SVG, rich text, chat and trace export UI |
| [examples/two-views/serve.py](examples/two-views/serve.py) | Loopback UI host and optional provider bridge |
| [examples/two-views/verify.py](examples/two-views/verify.py) | HTTP integration scenarios with deterministic and mock-provider models |
| [examples/two-views/python.py](examples/two-views/python.py) | Python SDK tools and callback |
| [examples/two-views/javascript.cjs](examples/two-views/javascript.cjs) | JavaScript/TypeScript SDK tools and callback under Node |
| [rust/examples/two_views.rs](rust/examples/two_views.rs) | Native Rust SDK tools and callback |


Each checked-in file is listed below by responsibility. The runtime tables above
explain how modules are used; test/fixture/manifest entries are development or
packaging support. No integration requires you to load this whole index.

<a id="howto-root-apis-documentation-and-python-tests"></a>

#### Root APIs, documentation and Python tests

| File | Responsibility |
| --- | --- |
| [LICENSE](LICENSE) | License / source or distribution housekeeping |
| [README.md](README.md) | Usage or design documentation; not executable |
| [apps.md](apps.md) | Per-app native views, editor tools, scripts, services and integration requirements |
| [__init__.py](__init__.py) | Public Python API exports |
| [__main__.py](__main__.py) | Python JSON-lines worker entry point |
| [cli.py](cli.py) | Python command-line utility |
| [integration-context.schema.json](integration-context.schema.json) | Integration schema; host validation contract |
| [protocol.json](protocol.json) | Protocol/contract data; generated copies must stay synchronized |
| [pyproject.toml](pyproject.toml) | Package/build manifest or pinned dependency lock |
| [rpc.py](rpc.py) | Explicit MCP JSON-RPC service |
| [test_all_commands.py](test_all_commands.py) | Test / fixture: test all commands |
| [test_apply_edits.py](test_apply_edits.py) | Test / fixture: test apply edits |
| [test_beyond_react.py](test_beyond_react.py) | Test / fixture: test beyond react |
| [test_command_resolution.py](test_command_resolution.py) | Test / fixture: test command resolution |
| [test_core.py](test_core.py) | Test / fixture: test core |
| [test_embedded.py](test_embedded.py) | Test / fixture: test embedded |
| [test_graph_query.py](test_graph_query.py) | Test / fixture: test graph query |
| [test_handoff.py](test_handoff.py) | Test / fixture: test handoff |
| [test_integration.py](test_integration.py) | Test / fixture: test integration |
| [test_knowledge.py](test_knowledge.py) | Test / fixture: test knowledge |
| [test_library.py](test_library.py) | Test / fixture: test library |
| [test_mcp_transports.py](test_mcp_transports.py) | Test / fixture: test mcp transports |
| [test_memory_architectures.py](test_memory_architectures.py) | Test / fixture: test memory architectures |
| [test_memory_manager.py](test_memory_manager.py) | Test / fixture: test memory manager |
| [test_mosaic_graph.py](test_mosaic_graph.py) | Test / fixture: test mosaic graph |
| [test_parallel.py](test_parallel.py) | Test / fixture: test parallel |
| [test_project_instructions.py](test_project_instructions.py) | Test / fixture: test project instructions |
| [test_providers.py](test_providers.py) | Test / fixture: test providers |
| [test_pyenv_harness.py](test_pyenv_harness.py) | Test / fixture: test pyenv harness |
| [test_react.py](test_react.py) | Test / fixture: test react |
| [test_react_protocols.py](test_react_protocols.py) | Test / fixture: test react protocols |
| [test_review_evidence.py](test_review_evidence.py) | Test / fixture: test review evidence |
| [test_revision_conflicts.py](test_revision_conflicts.py) | Test / fixture: test revision conflicts |
| [test_runtime_tools.py](test_runtime_tools.py) | Test / fixture: test runtime tools |
| [test_sdk_packages.py](test_sdk_packages.py) | Test / fixture: test sdk packages |
| [test_task_planning.py](test_task_planning.py) | Test / fixture: test task planning |
| [test_tool_discovery.py](test_tool_discovery.py) | Test / fixture: test tool discovery |
| [test_verification_binding.py](test_verification_binding.py) | Test / fixture: test verification binding |

<a id="howto-shared-conformance-fixtures"></a>
| [test_docs_index.py](test_docs_index.py) | Regression checks for source-index section boundaries and inventory counts |


#### Shared conformance fixtures

| File | Responsibility |
| --- | --- |
| [conformance/core-v1.json](conformance/core-v1.json) | Shared cross-language protocol fixture |
| [conformance/fixtures/mcp_server.py](conformance/fixtures/mcp_server.py) | Shared cross-language protocol fixture |
| [conformance/graph-query-v1.json](conformance/graph-query-v1.json) | Shared cross-language protocol fixture |
| [conformance/mcp-frames-v1.json](conformance/mcp-frames-v1.json) | Shared cross-language protocol fixture |
| [conformance/workflows-v2.json](conformance/workflows-v2.json) | Shared cross-language protocol fixture |

<a id="howto-runnable-host-examples"></a>

#### Runnable host examples

| File | Responsibility |
| --- | --- |
| [examples/dynamic-editor.cjs](examples/dynamic-editor.cjs) | Runnable integration example: dynamic editor |
| [examples/dynamic_context.py](examples/dynamic_context.py) | Runnable integration example: dynamic context |
| [examples/embedded.cjs](examples/embedded.cjs) | Runnable integration example: embedded |
| [examples/embedded.py](examples/embedded.py) | Runnable integration example: embedded |
| [examples/javascript-agent.cjs](examples/javascript-agent.cjs) | Runnable integration example: javascript agent |
| [examples/model-mosaic.cjs](examples/model-mosaic.cjs) | Runnable integration example: model mosaic |
| [examples/model_mosaic.py](examples/model_mosaic.py) | Runnable integration example: model mosaic |
| [examples/python_agent.py](examples/python_agent.py) | Runnable integration example: python agent |

<a id="howto-javascript-runtime-declarations-and-tests"></a>

#### JavaScript runtime, declarations and tests

| File | Responsibility |
| --- | --- |
| [javascript/LICENSE](javascript/LICENSE) | License / source or distribution housekeeping |
| [javascript/a2a.d.ts](javascript/a2a.d.ts) | TypeScript declarations; corresponding API type support |
| [javascript/a2a.js](javascript/a2a.js) | Runtime module; A2A server, client, AgentCard, and delegation tool |
| [javascript/acceptance.js](javascript/acceptance.js) | Runtime module; see language reference above: acceptance |
| [javascript/adapters.js](javascript/adapters.js) | Runtime module; see language reference above: adapters |
| [javascript/adapters.d.ts](javascript/adapters.d.ts) | TypeScript declarations; corresponding API type support |
| [javascript/beyond-react-test.cjs](javascript/beyond-react-test.cjs) | Test / fixture: beyond react test |
| [javascript/beyond-react.d.ts](javascript/beyond-react.d.ts) | TypeScript declarations; corresponding API type support |
| [javascript/beyond-react.js](javascript/beyond-react.js) | Runtime module; see language reference above: beyond react |
| [javascript/checks.js](javascript/checks.js) | Runtime module; see language reference above: checks |
| [javascript/coding-test.cjs](javascript/coding-test.cjs) | Test / fixture: coding test |
| [javascript/coding.js](javascript/coding.js) | Runtime module; see language reference above: coding |
| [javascript/collaboration-context-test.cjs](javascript/collaboration-context-test.cjs) | Test / fixture: collaboration context test |
| [javascript/collaboration-test.cjs](javascript/collaboration-test.cjs) | Test / fixture: collaboration test |
| [javascript/collaboration.js](javascript/collaboration.js) | Runtime module; see language reference above: collaboration |
| [javascript/command-resolution-test.cjs](javascript/command-resolution-test.cjs) | Test / fixture: command resolution test |
| [javascript/context.js](javascript/context.js) | Runtime module; see language reference above: context |
| [javascript/contracts-data.js](javascript/contracts-data.js) | Protocol/contract data; generated copies must stay synchronized |
| [javascript/contracts.d.ts](javascript/contracts.d.ts) | TypeScript declarations; corresponding API type support |
| [javascript/contracts.js](javascript/contracts.js) | Runtime module; see language reference above: contracts |
| [javascript/core-test.cjs](javascript/core-test.cjs) | Test / fixture: core test |
| [javascript/core.d.ts](javascript/core.d.ts) | TypeScript declarations; corresponding API type support |
| [javascript/core.js](javascript/core.js) | Runtime module; see language reference above: core |
| [javascript/embedded-test.cjs](javascript/embedded-test.cjs) | Test / fixture: embedded test |
| [javascript/embedded.d.ts](javascript/embedded.d.ts) | TypeScript declarations; corresponding API type support |
| [javascript/embedded.js](javascript/embedded.js) | Runtime module; see language reference above: embedded |
| [javascript/executable-test.cjs](javascript/executable-test.cjs) | Test / fixture: executable test |
| [javascript/executable.js](javascript/executable.js) | Runtime module; see language reference above: executable |
| [javascript/extensions.d.ts](javascript/extensions.d.ts) | TypeScript declarations; corresponding API type support |
| [javascript/extensions.js](javascript/extensions.js) | Runtime module; see language reference above: extensions |
| [javascript/graph-memory.d.ts](javascript/graph-memory.d.ts) | TypeScript declarations; corresponding API type support |
| [javascript/graph-memory.js](javascript/graph-memory.js) | Runtime module; see language reference above: graph memory |
| [javascript/graph-query-test.cjs](javascript/graph-query-test.cjs) | Test / fixture: graph query test |
| [javascript/graph-store-test.cjs](javascript/graph-store-test.cjs) | Test / fixture: graph store test |
| [javascript/handoff-test.cjs](javascript/handoff-test.cjs) | Test / fixture: handoff test |
| [javascript/handoff.js](javascript/handoff.js) | Runtime module; see language reference above: handoff |
| [javascript/independent-review.js](javascript/independent-review.js) | Runtime module; see language reference above: independent review |
| [javascript/index.d.ts](javascript/index.d.ts) | TypeScript declarations |
| [javascript/index.js](javascript/index.js) | Runtime module; see language reference above: index |
| [javascript/integration-test.cjs](javascript/integration-test.cjs) | Test / fixture: integration test |
| [javascript/integration.d.ts](javascript/integration.d.ts) | TypeScript declarations; corresponding API type support |
| [javascript/integration.js](javascript/integration.js) | Runtime module; see language reference above: integration |
| [javascript/local-test.cjs](javascript/local-test.cjs) | Test / fixture: local test |
| [javascript/local.d.ts](javascript/local.d.ts) | TypeScript declarations |
| [javascript/local.js](javascript/local.js) | Runtime module; see language reference above: local |
| [javascript/loop.js](javascript/loop.js) | Runtime module; see language reference above: loop |
| [javascript/mcp-frame-test.cjs](javascript/mcp-frame-test.cjs) | Test / fixture: mcp frame test |
| [javascript/mcp-transports-test.cjs](javascript/mcp-transports-test.cjs) | Test / fixture: mcp transports test |
| [javascript/mcp-transports.d.ts](javascript/mcp-transports.d.ts) | TypeScript declarations; corresponding API type support |
| [javascript/mcp-transports.js](javascript/mcp-transports.js) | Runtime module; see language reference above: mcp transports |
| [javascript/mosaic-memory-test.cjs](javascript/mosaic-memory-test.cjs) | Test / fixture: mosaic memory test |
| [javascript/mosaic.d.ts](javascript/mosaic.d.ts) | TypeScript declarations; corresponding API type support |
| [javascript/mosaic.js](javascript/mosaic.js) | Runtime module; see language reference above: mosaic |
| [javascript/node-store-test.cjs](javascript/node-store-test.cjs) | Test / fixture: node store test |
| [javascript/node-store.js](javascript/node-store.js) | Runtime module; see language reference above: node store |
| [javascript/otel-genai.d.ts](javascript/otel-genai.d.ts) | TypeScript declarations; corresponding API type support |
| [javascript/otel-genai.js](javascript/otel-genai.js) | Runtime module; OpenTelemetry GenAI semantic conventions tracer and OTLP JSON exporter |
| [javascript/package.json](javascript/package.json) | Package/build manifest or pinned dependency lock |
| [javascript/planning.js](javascript/planning.js) | Runtime module; see language reference above: planning |
| [javascript/protocols-test.cjs](javascript/protocols-test.cjs) | Test / fixture: A2A, streaming, and OTel GenAI protocol tests |
| [javascript/providers-test.cjs](javascript/providers-test.cjs) | Test / fixture: providers test |
| [javascript/providers.d.ts](javascript/providers.d.ts) | TypeScript declarations; corresponding API type support |
| [javascript/providers.js](javascript/providers.js) | Runtime module; see language reference above: providers |
| [javascript/revision-conflict-test.cjs](javascript/revision-conflict-test.cjs) | Test / fixture: revision conflict test |
| [javascript/spec.js](javascript/spec.js) | Runtime module; see language reference above: spec |
| [javascript/state-machine.d.ts](javascript/state-machine.d.ts) | TypeScript declarations; corresponding API type support |
| [javascript/state-machine.js](javascript/state-machine.js) | Runtime module; see language reference above: state machine |
| [javascript/streaming.d.ts](javascript/streaming.d.ts) | TypeScript declarations; corresponding API type support |
| [javascript/streaming.js](javascript/streaming.js) | Runtime module; SSE Data Streams, AG-UI events, and Zed ACP server |
| [javascript/task-planning-test.cjs](javascript/task-planning-test.cjs) | Test / fixture: task planning test |
| [javascript/tool-routing-test.cjs](javascript/tool-routing-test.cjs) | Test / fixture: tool routing test |
| [javascript/tool-routing.d.ts](javascript/tool-routing.d.ts) | TypeScript declarations; corresponding API type support |
| [javascript/tool-routing.js](javascript/tool-routing.js) | Runtime module; see language reference above: tool routing |
| [javascript/tree-search.d.ts](javascript/tree-search.d.ts) | TypeScript declarations; corresponding API type support |
| [javascript/tree-search.js](javascript/tree-search.js) | Runtime module; see language reference above: tree search |

<a id="howto-python-runtime-and-optional-navigation-helper"></a>

#### Python runtime and optional navigation helper

| File | Responsibility |
| --- | --- |
| [python/__init__.py](python/__init__.py) | Runtime module; see language reference above:   init   |
| [python/a2a.py](python/a2a.py) | Runtime module; see language reference above: a2a |
| [python/adapters.py](python/adapters.py) | Runtime module; see language reference above: adapters |
| [python/agent.py](python/agent.py) | Runtime module; see language reference above: agent |
| [python/agent_acceptance.py](python/agent_acceptance.py) | Runtime module; see language reference above: agent acceptance |
| [python/agent_checks.py](python/agent_checks.py) | Runtime module; see language reference above: agent checks |
| [python/agent_context.py](python/agent_context.py) | Runtime module; see language reference above: agent context |
| [python/agent_edits.py](python/agent_edits.py) | Runtime module; see language reference above: agent edits |
| [python/agent_embeddings.py](python/agent_embeddings.py) | Runtime module; see language reference above: agent embeddings |
| [python/agent_harness.py](python/agent_harness.py) | Runtime module; see language reference above: agent harness |
| [python/agent_independent_review.py](python/agent_independent_review.py) | Runtime module; see language reference above: agent independent review |
| [python/agent_instructions.py](python/agent_instructions.py) | Runtime module; see language reference above: agent instructions |
| [python/agent_memory.py](python/agent_memory.py) | Runtime module; see language reference above: agent memory |
| [python/agent_memory_architectures.py](python/agent_memory_architectures.py) | Runtime module; see language reference above: agent memory architectures |
| [python/agent_memory_manager.py](python/agent_memory_manager.py) | Runtime module; see language reference above: agent memory manager |
| [python/agent_navigation.py](python/agent_navigation.py) | Runtime module; see language reference above: agent navigation |
| [python/agent_package.py](python/agent_package.py) | Runtime module; see language reference above: agent package |
| [python/agent_parallel.py](python/agent_parallel.py) | Runtime module; see language reference above: agent parallel |
| [python/agent_planning.py](python/agent_planning.py) | Runtime module; see language reference above: agent planning |
| [python/agent_project.py](python/agent_project.py) | Runtime module; see language reference above: agent project |
| [python/agent_project_memory.py](python/agent_project_memory.py) | Runtime module; see language reference above: agent project memory |
| [python/agent_pyenv.py](python/agent_pyenv.py) | Runtime module; see language reference above: agent pyenv |
| [python/agent_review.py](python/agent_review.py) | Runtime module; see language reference above: agent review |
| [python/agent_runtime.py](python/agent_runtime.py) | Runtime module; see language reference above: agent runtime |
| [python/agent_skills.py](python/agent_skills.py) | Runtime module; see language reference above: agent skills |
| [python/agent_tool_discovery.py](python/agent_tool_discovery.py) | Runtime module; see language reference above: agent tool discovery |
| [python/agent_verification.py](python/agent_verification.py) | Runtime module; see language reference above: agent verification |
| [python/agent_workflows.py](python/agent_workflows.py) | Runtime module; see language reference above: agent workflows |
| [python/code-navigation/package-lock.json](python/code-navigation/package-lock.json) | Package/build manifest or pinned dependency lock |
| [python/code-navigation/package.json](python/code-navigation/package.json) | Package/build manifest or pinned dependency lock |
| [python/code-navigation/service.cjs](python/code-navigation/service.cjs) | Optional trusted TypeScript navigation service |
| [python/codeact.py](python/codeact.py) | Runtime module; see language reference above: codeact |
| [python/coding.py](python/coding.py) | Runtime module; see language reference above: coding |
| [python/contracts.py](python/contracts.py) | Runtime module; see language reference above: contracts |
| [python/contracts_data.py](python/contracts_data.py) | Protocol/contract data; generated copies must stay synchronized |
| [python/core.py](python/core.py) | Runtime module; see language reference above: core |
| [python/decision_model.py](python/decision_model.py) | Runtime module; see language reference above: decision model |
| [python/embedded.py](python/embedded.py) | Runtime module; see language reference above: embedded |
| [python/extensions.py](python/extensions.py) | Runtime module; see language reference above: extensions |
| [python/graph_query.py](python/graph_query.py) | Runtime module; see language reference above: graph query |
| [python/handoff.py](python/handoff.py) | Runtime module; see language reference above: handoff |
| [python/hybrid_agent.py](python/hybrid_agent.py) | Runtime module; see language reference above: hybrid agent |
| [python/integration.py](python/integration.py) | Runtime module; see language reference above: integration |
| [python/mcp_transports.py](python/mcp_transports.py) | Runtime module; see language reference above: mcp transports |
| [python/mosaic.py](python/mosaic.py) | Runtime module; see language reference above: mosaic |
| [python/multi_agent.py](python/multi_agent.py) | Runtime module; see language reference above: multi agent |
| [python/otel_genai.py](python/otel_genai.py) | Runtime module; see language reference above: otel genai |
| [python/pipelines.py](python/pipelines.py) | Runtime module; see language reference above: pipelines |
| [python/project_knowledge.py](python/project_knowledge.py) | Runtime module; see language reference above: project knowledge |
| [python/providers.py](python/providers.py) | Runtime module; see language reference above: providers |
| [python/react.py](python/react.py) | Runtime module; see language reference above: react |
| [python/runtime_tools.py](python/runtime_tools.py) | Runtime module; see language reference above: runtime tools |
| [python/source_imports.py](python/source_imports.py) | Runtime module; see language reference above: source imports |
| [python/sqlite_store.py](python/sqlite_store.py) | Runtime module; see language reference above: sqlite store |
| [python/state_machine.py](python/state_machine.py) | Runtime module; see language reference above: state machine |
| [python/streaming.py](python/streaming.py) | Runtime module; see language reference above: streaming |
| [python/tool_library.py](python/tool_library.py) | Runtime module; see language reference above: tool library |
| [python/tree_search.py](python/tree_search.py) | Runtime module; see language reference above: tree search |
| [python/workspace_lock.py](python/workspace_lock.py) | Runtime module; see language reference above: workspace lock |

<a id="howto-rust-crate-native-worker-examples-and-tests"></a>

#### Rust crate, native worker, examples and tests

| File | Responsibility |
| --- | --- |
| [rust/Cargo.lock](rust/Cargo.lock) | Package/build manifest or pinned dependency lock |
| [rust/Cargo.toml](rust/Cargo.toml) | Package/build manifest or pinned dependency lock |
| [rust/LICENSE](rust/LICENSE) | License / source or distribution housekeeping |
| [rust/README.md](rust/README.md) | Usage or design documentation; not executable |
| [rust/examples/dynamic_context.rs](rust/examples/dynamic_context.rs) | Runnable integration example: dynamic context |
| [rust/examples/list.rs](rust/examples/list.rs) | Runnable integration example: list |
| [rust/examples/ui.html](rust/examples/ui.html) | Runnable integration example: ui |
| [rust/examples/ui.rs](rust/examples/ui.rs) | Runnable integration example: ui |
| [rust/src/a2a.rs](rust/src/a2a.rs) | Runtime module; A2A server, client, and AgentCard builder |
| [rust/src/beyond_react.rs](rust/src/beyond_react.rs) | Runtime module; see language reference above: beyond react |
| [rust/src/bin/codingagent-worker.rs](rust/src/bin/codingagent-worker.rs) | Runtime module; see language reference above: codingagent worker |
| [rust/src/contracts.rs](rust/src/contracts.rs) | Runtime module; see language reference above: contracts |
| [rust/src/contracts_data.rs](rust/src/contracts_data.rs) | Protocol/contract data; generated copies must stay synchronized |
| [rust/src/core.rs](rust/src/core.rs) | Runtime module; see language reference above: core |
| [rust/src/edits.rs](rust/src/edits.rs) | Runtime module; see language reference above: edits |
| [rust/src/embedded.rs](rust/src/embedded.rs) | Runtime module; see language reference above: embedded |
| [rust/src/extensions.rs](rust/src/extensions.rs) | Runtime module; see language reference above: extensions |
| [rust/src/graph_memory.rs](rust/src/graph_memory.rs) | Runtime module; see language reference above: graph memory |
| [rust/src/handoff.rs](rust/src/handoff.rs) | Runtime module; see language reference above: handoff |
| [rust/src/instructions.rs](rust/src/instructions.rs) | Runtime module; see language reference above: instructions |
| [rust/src/integration.rs](rust/src/integration.rs) | Runtime module; see language reference above: integration |
| [rust/src/knowledge.rs](rust/src/knowledge.rs) | Runtime module; see language reference above: knowledge |
| [rust/src/lib.rs](rust/src/lib.rs) | Runtime module; see language reference above: lib |
| [rust/src/mcp_stdio.rs](rust/src/mcp_stdio.rs) | Runtime module; see language reference above: mcp stdio |
| [rust/src/mosaic.rs](rust/src/mosaic.rs) | Runtime module; see language reference above: mosaic |
| [rust/src/otel_genai.rs](rust/src/otel_genai.rs) | Runtime module; OpenTelemetry GenAI semantic conventions tracer and OTLP JSON exporter |
| [rust/src/planning.rs](rust/src/planning.rs) | Runtime module; see language reference above: planning |
| [rust/src/providers.rs](rust/src/providers.rs) | Optional LLM provider adapters, JSON-Schema tool-use parsing, and bounded retry helpers |
| [rust/src/recovery.rs](rust/src/recovery.rs) | Runtime module; see language reference above: recovery |
| [rust/src/runtime.rs](rust/src/runtime.rs) | Runtime module; see language reference above: runtime |
| [rust/src/streaming.rs](rust/src/streaming.rs) | Runtime module; SSE Data Streams, AG-UI events, and Zed ACP server |
| [rust/src/tools.rs](rust/src/tools.rs) | Runtime module; see language reference above: tools |
| [rust/src/verification.rs](rust/src/verification.rs) | Runtime module; see language reference above: verification |
| [rust/tests/beyond_react.rs](rust/tests/beyond_react.rs) | Test / fixture: beyond react |
| [rust/tests/collaboration.rs](rust/tests/collaboration.rs) | Test / fixture: collaboration |
| [rust/tests/command_resolution.rs](rust/tests/command_resolution.rs) | Test / fixture: command resolution |
| [rust/tests/command_resolution_windows.rs](rust/tests/command_resolution_windows.rs) | Test / fixture: command resolution windows |
| [rust/tests/core.rs](rust/tests/core.rs) | Test / fixture: core |
| [rust/tests/embedded.rs](rust/tests/embedded.rs) | Test / fixture: embedded |
| [rust/tests/fixtures/task-planning.json](rust/tests/fixtures/task-planning.json) | Test / fixture: task planning |
| [rust/tests/graph_query.rs](rust/tests/graph_query.rs) | Test / fixture: graph query |
| [rust/tests/handoff.rs](rust/tests/handoff.rs) | Test / fixture: handoff |
| [rust/tests/integration.rs](rust/tests/integration.rs) | Test / fixture: integration |
| [rust/tests/knowledge.rs](rust/tests/knowledge.rs) | Test / fixture: knowledge |
| [rust/tests/mcp_frames.rs](rust/tests/mcp_frames.rs) | Test / fixture: mcp frames |
| [rust/tests/mcp_stdio.rs](rust/tests/mcp_stdio.rs) | Test / fixture: mcp stdio |
| [rust/tests/mosaic_graph.rs](rust/tests/mosaic_graph.rs) | Test / fixture: mosaic graph |
| [rust/tests/native.rs](rust/tests/native.rs) | Test / fixture: native |
| [rust/tests/planning.rs](rust/tests/planning.rs) | Test / fixture: planning |
| [rust/tests/protocols.rs](rust/tests/protocols.rs) | Test / fixture: A2A, streaming, and OTel GenAI protocol tests |
| [rust/tests/providers.rs](rust/tests/providers.rs) | Test / fixture: provider adapters, tool schemas, and retry helpers |
| [rust/tests/recovery.rs](rust/tests/recovery.rs) | Test / fixture: recovery |
| [rust/tests/runtime.rs](rust/tests/runtime.rs) | Test / fixture: runtime |
| [rust/tests/ui-browser-test.cjs](rust/tests/ui-browser-test.cjs) | Test / fixture: ui browser test |

<a id="howto-generation-and-packaging-scripts"></a>

#### Generation and packaging scripts

| File | Responsibility |
| --- | --- |
| [scripts/generate_contracts.py](scripts/generate_contracts.py) | Contract generation or optional package-source generation |
| [scripts/check_docs_index.py](scripts/check_docs_index.py) | Documentation source-file index and relative-link checker |
| [scripts/package_sdk.py](scripts/package_sdk.py) | Contract generation or optional package-source generation |

<a id="howto-vs-code-extension-host-webview-build-and-tests"></a>

#### VS Code extension host, webview, build and tests

| File | Responsibility |
| --- | --- |
| [vscode/.gitignore](vscode/.gitignore) | License / source or distribution housekeeping |
| [vscode/.vscode/launch.json](vscode/.vscode/launch.json) | Supporting source/configuration: launch |
| [vscode/.vscode/tasks.json](vscode/.vscode/tasks.json) | Supporting source/configuration: tasks |
| [vscode/.vscodeignore](vscode/.vscodeignore) | License / source or distribution housekeeping |
| [vscode/LICENSE](vscode/LICENSE) | License / source or distribution housekeeping |
| [vscode/README.md](vscode/README.md) | Usage or design documentation; not executable |
| [vscode/bin/.gitkeep](vscode/bin/.gitkeep) | License / source or distribution housekeeping |
| [vscode/media/icon.png](vscode/media/icon.png) | Extension icon: RabbitHole logo |
| [vscode/media/panel.css](vscode/media/panel.css) | Extension webview UI: panel |
| [vscode/media/panel.js](vscode/media/panel.js) | Extension webview UI: panel |
| [vscode/media/project-memory-ui.js](vscode/media/project-memory-ui.js) | Extension webview UI: project memory ui |
| [vscode/media/project-memory.css](vscode/media/project-memory.css) | Extension webview UI: project memory |
| [vscode/media/specification-ui.js](vscode/media/specification-ui.js) | Extension webview UI: specification ui |
| [vscode/media/specification.css](vscode/media/specification.css) | Extension webview UI: specification |
| [vscode/media/specification.js](vscode/media/specification.js) | Extension webview UI: specification |
| [vscode/media/tasks.js](vscode/media/tasks.js) | Extension webview UI: tasks |
| [vscode/package-lock.json](vscode/package-lock.json) | Package/build manifest or pinned dependency lock |
| [vscode/package.json](vscode/package.json) | Package/build manifest or pinned dependency lock |
| [vscode/prompt-workflows.json](vscode/prompt-workflows.json) | Supporting source/configuration: prompt-workflows |
| [vscode/scripts/benchmark-editor-context.cjs](vscode/scripts/benchmark-editor-context.cjs) | Extension build/check/benchmark utility |
| [vscode/scripts/benchmark-history.cjs](vscode/scripts/benchmark-history.cjs) | Extension build/check/benchmark utility |
| [vscode/scripts/benchmark-provider-retry.cjs](vscode/scripts/benchmark-provider-retry.cjs) | Extension build/check/benchmark utility |
| [vscode/scripts/benchmark-turn.cjs](vscode/scripts/benchmark-turn.cjs) | Extension build/check/benchmark utility |
| [vscode/scripts/build-native.cjs](vscode/scripts/build-native.cjs) | Extension build/check/benchmark utility |
| [vscode/scripts/check-binary.cjs](vscode/scripts/check-binary.cjs) | Extension build/check/benchmark utility |
| [vscode/scripts/test-editor-host.cjs](vscode/scripts/test-editor-host.cjs) | Disposable actual VS Code extension-host runner; requires an installed editor and display |
| [vscode/src/action-review.cjs](vscode/src/action-review.cjs) | Extension host component: action review |
| [vscode/src/agent-library.cjs](vscode/src/agent-library.cjs) | Extension host component: automatic skill/agent discovery, matching, destructive command guardrails, and secret redaction |
| [vscode/src/attachments.cjs](vscode/src/attachments.cjs) | Extension host component: attachments |
| [vscode/src/chat-commands.cjs](vscode/src/chat-commands.cjs) | Extension host component: / slash commands and @ mention parser and help formatter |
| [vscode/src/controller.cjs](vscode/src/controller.cjs) | Extension host component: controller |
| [vscode/src/editor-context.cjs](vscode/src/editor-context.cjs) | Extension host component: editor context |
| [vscode/src/executable.cjs](vscode/src/executable.cjs) | Extension host component: executable |
| [vscode/src/execution-mode.cjs](vscode/src/execution-mode.cjs) | Extension host component: execution mode |
| [vscode/src/extension.cjs](vscode/src/extension.cjs) | Extension host component: extension |
| [vscode/src/history-context.cjs](vscode/src/history-context.cjs) | Extension host component: history context |
| [vscode/src/loop-guard.cjs](vscode/src/loop-guard.cjs) | Extension host component: loop guard |
| [vscode/src/output.cjs](vscode/src/output.cjs) | Extension host component: output |
| [vscode/src/problem-draft.cjs](vscode/src/problem-draft.cjs) | Extension host component: problem draft |
| [vscode/src/project-memory.cjs](vscode/src/project-memory.cjs) | Extension host component: project memory |
| [vscode/src/prompt-workflows.cjs](vscode/src/prompt-workflows.cjs) | Extension host component: prompt workflows |
| [vscode/src/provider-recovery.cjs](vscode/src/provider-recovery.cjs) | Extension host component: provider recovery |
| [vscode/src/provider.cjs](vscode/src/provider.cjs) | Extension host component: provider |
| [vscode/src/review.cjs](vscode/src/review.cjs) | Extension host component: review |
| [vscode/src/session-summary.cjs](vscode/src/session-summary.cjs) | Extension host component: session summary |
| [vscode/src/usage.cjs](vscode/src/usage.cjs) | Extension host component: usage |
| [vscode/src/verification.cjs](vscode/src/verification.cjs) | Extension host component: verification |
| [vscode/src/worker.cjs](vscode/src/worker.cjs) | Extension host component: worker |
| [vscode/test/action-review.test.cjs](vscode/test/action-review.test.cjs) | Test / fixture: action review.test |
| [vscode/test/apply-edits.test.cjs](vscode/test/apply-edits.test.cjs) | Test / fixture: apply edits.test |
| [vscode/test/attachments.test.cjs](vscode/test/attachments.test.cjs) | Test / fixture: attachments.test |
| [vscode/test/chat-commands-and-library.test.cjs](vscode/test/chat-commands-and-library.test.cjs) | Test / fixture: slash commands, @ mentions, skills/agents discovery, and guardrails |
| [vscode/test/check-source-binding.test.cjs](vscode/test/check-source-binding.test.cjs) | Test / fixture: check source binding.test |
| [vscode/test/conflict-browser.cjs](vscode/test/conflict-browser.cjs) | Test / fixture: conflict browser |
| [vscode/test/editor-context.test.cjs](vscode/test/editor-context.test.cjs) | Test / fixture: editor context.test |
| [vscode/test/execution-mode.test.cjs](vscode/test/execution-mode.test.cjs) | Test / fixture: execution mode.test |
| [vscode/test/extension.test.cjs](vscode/test/extension.test.cjs) | Test / fixture: extension.test |
| [vscode/test/history-context.test.cjs](vscode/test/history-context.test.cjs) | Test / fixture: history context.test |
| [vscode/test/history-performance.test.cjs](vscode/test/history-performance.test.cjs) | Test / fixture: history performance.test |
| [vscode/test/loop-guard.test.cjs](vscode/test/loop-guard.test.cjs) | Test / fixture: loop guard.test |
| [vscode/test/model-handoff.test.cjs](vscode/test/model-handoff.test.cjs) | Test / fixture: model handoff.test |
| [vscode/test/multimodal-continuity.test.cjs](vscode/test/multimodal-continuity.test.cjs) | Test / fixture: multimodal continuity.test |
| [vscode/test/native-recovery.test.cjs](vscode/test/native-recovery.test.cjs) | Test / fixture: native recovery.test |
| [vscode/test/native.test.cjs](vscode/test/native.test.cjs) | Test / fixture: native.test |
| [vscode/test/output.test.cjs](vscode/test/output.test.cjs) | Test / fixture: output.test |
| [vscode/test/panel.test.cjs](vscode/test/panel.test.cjs) | Test / fixture: panel.test |
| [vscode/test/pause.test.cjs](vscode/test/pause.test.cjs) | Test / fixture: pause.test |
| [vscode/test/problem-draft.test.cjs](vscode/test/problem-draft.test.cjs) | Test / fixture: problem draft.test |
| [vscode/test/project-instructions.test.cjs](vscode/test/project-instructions.test.cjs) | Test / fixture: project instructions.test |
| [vscode/test/project-memory-host.test.cjs](vscode/test/project-memory-host.test.cjs) | Test / fixture: project memory host.test |
| [vscode/test/project-memory.test.cjs](vscode/test/project-memory.test.cjs) | Test / fixture: project memory.test |
| [vscode/test/prompt-workflows.test.cjs](vscode/test/prompt-workflows.test.cjs) | Test / fixture: prompt workflows.test |
| [vscode/test/provider-recovery.test.cjs](vscode/test/provider-recovery.test.cjs) | Test / fixture: provider recovery.test |
| [vscode/test/provider-retry.test.cjs](vscode/test/provider-retry.test.cjs) | Test / fixture: provider retry.test |
| [vscode/test/provider.test.cjs](vscode/test/provider.test.cjs) | Test / fixture: provider.test |
| [vscode/test/review.test.cjs](vscode/test/review.test.cjs) | Test / fixture: review.test |
| [vscode/test/run-deadline.test.cjs](vscode/test/run-deadline.test.cjs) | Test / fixture: run deadline.test |
| [vscode/test/session-summary.test.cjs](vscode/test/session-summary.test.cjs) | Test / fixture: session summary.test |
| [vscode/test/specification.test.cjs](vscode/test/specification.test.cjs) | Test / fixture: specification.test |
| [vscode/test/task-planning.test.cjs](vscode/test/task-planning.test.cjs) | Test / fixture: task planning.test |
| [vscode/test/tasks.test.cjs](vscode/test/tasks.test.cjs) | Test / fixture: tasks.test |
| [vscode/test/usage.test.cjs](vscode/test/usage.test.cjs) | Test / fixture: usage.test |
| [vscode/test/verification-binding.test.cjs](vscode/test/verification-binding.test.cjs) | Test / fixture: verification binding.test |
| [vscode/test/verification.test.cjs](vscode/test/verification.test.cjs) | Test / fixture: verification.test |
| [vscode/test/worker-lifecycle.test.cjs](vscode/test/worker-lifecycle.test.cjs) | Test / fixture: worker lifecycle.test |
| [vscode/test/editor-host.cjs](vscode/test/editor-host.cjs) | Actual VS Code activation, editor context, attachment commands, native verification and ZIP qualification |

<a id="howto-validate-an-integration"></a>

### Validate an integration

Run the deterministic example for your selected interface first. Then test malformed
responses, denied tools, questions/resume, cancellation and conflicting revisions
before enabling writes. For full repository gates see [AGENTS.md](../AGENTS.md).
For package boundaries and capabilities see [SDK reference](README.md#sdk); for dynamic editor
context see [integration guide](README.md#integration). Browser rendering and live providers
need their own checks beyond deterministic SDK tests.


---

<a id="sdk"></a>

## Portable SDK v1

The SDK separates **generic orchestration** from **coding execution**. Its generic
core has no workspace, shell, provider or UI requirement. Registering a tool is a
host trust decision: a `read` label does not sandbox its callback. Coding adapters
retain the established guarded file edits, hashes, recovery, command allowlists,
source-bound verification and change inspection. Neither layer is an OS sandbox.

<a id="sdk-stable-contracts-and-generation"></a>

### Stable contracts and generation

`protocol.json` → `sdk` is the canonical source of the versioned `ModelRequest`,
`ModelResponse`, `ToolDefinition`, `ToolResult`, `AgentEvent` and `AgentError`
contracts. `codingagentlib/sdk-v1` versions requests, responses, results, events
and errors together. Tool contract version is `1`; omitted versions mean `1`.
Legacy coding and embedded wire formats keep their previous version identifiers.

```sh
python3 codingagentlib/scripts/generate_contracts.py
python3 codingagentlib/scripts/generate_contracts.py --check
```

The generator produces TypeScript types, Python TypedDicts (Python 3.10+), Rust
Serde types and schema data used by each language's validators. Protocol data is
compiled into modules; the core does not read a schema file during a run.
`spec.js` retains the SDK contracts when regenerating the legacy artifact.

Tool parameters support a bounded JSON Schema subset: `type`, `properties`,
`required`, boolean `additionalProperties`, `items`, item/string/numeric bounds,
`enum`, `const`, `anyOf`, and descriptive `title`, `description`, `default`.
Unsupported keywords fail preflight instead of being ignored. References, regex
evaluation and remote schemas are not supported. Integers are limited to the
JSON/JavaScript safe integer range. Request and response identity is validated
before dispatch; `ask` and `done` require `action: null` and a question/summary.

<a id="sdk-create-a-generic-agent"></a>

### Create a generic agent

```js
const {createAgent} = require('./javascript');
const agent = createAgent({
  model: async request => myModel(request),
  tools: [{
    name: 'lookup', version: 1, description: 'Read a host record', permission: 'read',
    parameters: {type:'object', required:['id'], properties:{id:{type:'string'}}, additionalProperties:false},
    execute: (args, context) => hostLookup(args.id, context.signal)
  }],
  contextProviders: [(state, signal) => currentHostContext()],
  policy: {
    authorize: (action, state) => approveHostAction(action),
    complete: (response, state) => sufficientObservedEvidence(state)
  },
  onEvent: event => renderPublicEvent(event)
});
const diagnostics = agent.preflight();
const result = await agent.run('Find the record');
```

Python exports `create_agent(model=..., tools=..., context_providers=..., policy=...,
session_store=..., on_event=...)`. Call `agent.run(goal)` and
`agent.resume(session_id, answer=...)`. Python callbacks are synchronous and receive
a `threading.Event` for cooperative cancellation. JavaScript callbacks may be async
and receive an AbortSignal. Rust exports `create_agent(CoreOptions)`, `CoreTool`,
`SessionStore` and a cloneable cancellation handle. Its `policy` callback receives
the phase (`preflight`, `authorize`, `complete`), payload and state.

`available(context, state)` can hide/revoke a tool each turn and immediately before
execution. Live context is refreshed before every model call. Event callbacks
receive public lifecycle records, not private model reasoning. Call IDs are unique
within a session; a duplicate is denied without invoking the handler.

Preflight checks model/hook/store interfaces, tenant, tool names and versions,
schemas, required capabilities and positive budgets. Optional provider adapters
validate endpoint/model/transport configuration at construction. Use the host
`policy.preflight` hook for service authentication or workspace-specific checks;
configuration checks do not establish live provider authorization.

<a id="sdk-lifecycle-storage-and-uncertainty"></a>

### Lifecycle, storage and uncertainty

| State | Behavior |
|---|---|
| running | A leased session has one owner. The model sees current context and public history. |
| waiting | The model asked a question or exhausted three response/completion repairs. Resume explicitly. |
| paused | Cancellation, resource exhaustion, an exception or an uncertain action stopped progress. |
| complete | The completion policy accepted the answer. Further work starts a new run. |

`sessionStore` implements `acquire`, `release`, `load`, and revision-checked `save`.
Each operation receives the host-selected tenant and session ID. A tenant name is
a storage namespace, not authentication: the embedding service must derive it
from the authenticated caller. Default stores are private in-memory instances.
Pass a shared store to coordinate concurrent agents. Events and snapshots are
defensive copies. A lease covers the entire run/resume slice; conflicting owners
and revision conflicts fail rather than overwriting another session.

Before a tool starts, its call identity and arguments are persisted as `pending`.
Its result is recorded before that marker is cleared. A storage/observer failure
or a host exception marked `uncertain` leaves the marker in place. Rust exposes
`core::UncertainToolCall`; JS/Python exceptions may carry `uncertain: true`.
On restore, a pending call pauses with `uncertain_tool_call`: **no automatic retry**.
The host must inspect the external system and submit a matching `ToolResult` to
`resolvePending` / `resolve_pending`. Failed calls never imply rollback of effects.

Ordinary callback exceptions become failed tool results. Model and provider
exceptions pause and propagate. Cancellation is checked before dispatch and around
callbacks. It is cooperative: arbitrary blocking host code cannot be forcibly
interrupted by the generic core. Coding runtimes retain their process cancellation.

Resume does not increase stored permissions; write/command permissions must be
explicitly supplied again and are intersected with the previous session. Budgets
are lifetime session limits: `modelCalls`, `toolCalls`, `elapsedMs`, `sessionBytes`
and `responseBytes`. Active elapsed time accumulates across run/resume slices;
time spent waiting between slices is excluded. A host can use another configured
agent with larger limits to resume an exhausted session. Tool result storage can
fail after an effect; the pending marker then requires host reconciliation.

Optional stores are `DirectorySessionStore` (Node) and `SQLiteSessionStore`
(Python). Their private directories/files use 0700/0600 on POSIX; insecure existing
paths are rejected. They provide persisted leases and revisions across normal
process restarts. A crashed owner's persisted lease is intentionally not stolen:
an administrator must first confirm the owner stopped and reconcile pending work
before removing the stale lock/lease. Atomic writes/transactions do not promise
power-loss durability on every filesystem. Stores are not encryption or access
control against other processes running as the same OS user. Rust hosts inject
their durable store through the same `SessionStore` contract.

<a id="sdk-optional-extensions"></a>

### Optional extensions

- **Replay:** `replay(snapshot)` runs recorded model responses against recorded
  tool receipts, or explicit JS/Python mocks. It never receives the original tool
  callbacks. Session/step identities are rebound to a fresh replay session. To
  reproduce host-specific validation, supply equivalent mocks; replay is not proof
  that remote systems or original filesystem effects are reproducible.
- **Streaming:** JS async iterables and Python text iterators are completely
  buffered and bounded before JSON/identity/argument validation. Rust provides
  `buffer_stream` for the model adapter. Partial or trailing invalid JSON never
  dispatches a tool. Transports remain responsible for stream I/O cancellation.
- **MCP:** `mcpTools` / `mcp_tools` consumes a host-provided SDK transport exposing
  `request('tools/list' | 'tools/call', ...)`. `exposeMcp` / `expose_mcp` and Rust's
  `McpServer` expose registered callbacks. Explicit trust/authorization is required;
  imported tools require command permission regardless of remote annotations.
  Trust is rechecked per call. Transport failures are uncertain calls. The host's
  MCP SDK owns authentication and remote transport. Optional JSON-RPC/stdio adapters handle initialization; the explicit `codingagentlib.rpc` stdio service and its permissions are described in [the Coding Guide](README.md#coding-guide).
  An incomplete paged listing is rejected; provide a complete bounded tool page.
  JS/Python/Rust stdio clients share envelope-conformance tests, handle
  interleaved notifications, and return method-not-found for unsupported client
  requests. Malformed replies close the connection; normal RPC errors leave it
  usable. Notifications never extend reply deadlines or become tool receipts.
- **Delegation:** `delegationTool` / `delegation_tool` creates bounded read-only
  child agents with separate context, tool sets, stores and IDs. The result names
  the parent call, child session, depth, public events and child outcome. Child
  agreement is not completion evidence. Depth is limited to 1–8; cancellation and
  parent budgets still apply around the child call. Rust uses a child-options
  factory. Hosts must not label effectful callbacks as read-only.

<a id="sdk-coding-adapters-packages-and-compatibility"></a>

### Coding adapters, packages and compatibility

The original `Agent`, `Runtime`, `LocalRuntime`, `EmbeddedAgent`, worker protocol,
server relay and VS Code interfaces remain usable. `javascript/coding.js` and
`python/coding.py` add exclusive workspace ownership by default. Rust's coding
runtime already takes an exclusive workspace lock. Legacy Python/JS entry points
retain their prior concurrency behavior; use the optional coding adapters when
sharing a workspace. `fromEmbedded` / `from_embedded` (Rust: `EmbeddedAgent::into_core`) migrates a registered host
tool collection to the new core while leaving legacy session formats untouched.

Build independent optional package sources locally:

```sh
python3 codingagentlib/scripts/package_sdk.py --out /tmp/sdk-packages
```

The output contains separate JS/Python core, extension, provider, durable-store
and coding-adapter packages, project-memory packages, a Python tool-library package
and JS UI bindings. Model mosaic is part of the optional extensions. The core packages have
no dependency on the legacy coding runtime. Coding packages deliberately depend
on it. Rust supports the independent boundary via
`default-features = false`; the `coding` feature adds its optional execution
dependencies. Package generation and local tarball/wheel builds do not publish
to npm/PyPI. Registry names, versions, ownership and release credentials require
a separate release review; no registry upload is performed by the build script.

Call `capabilities()` before enabling an extension. JS/Python extension modules expose their own capability list; a core-only package does not advertise optional MCP/delegation helpers. Unknown required capabilities
or tool contract versions fail preflight (Rust hosts check the returned feature
list explicitly). Wire-breaking changes require a new protocol major identifier;
new optional extensions advertise a capability first. Existing session formats
are not silently migrated or granted new permissions.

<a id="sdk-deterministic-capability-ladder-and-checks"></a>

### Deterministic capability ladder and checks

1. `examples/embedded.cjs` / `examples/embedded.py`: generic create/register/run.
2. `examples/dynamic-editor.cjs`: live revisioned context, schemas, host validation,
   stale-revision checks and a human review queue; proposals are not applied.
3. `examples/dynamic_context.py` / `rust/examples/dynamic_context.rs`: context parity.
4. `rust/examples/ui.rs`: read-only local host UI, sessions, follow-ups,
   cancellation and explicit snapshot import/export.
5. `examples/javascript-agent.cjs`: the coding-specific runtime using real files.

Run examples from the repository root; Python examples need `PYTHONPATH=.` unless
the library is installed. None selects or calls a paid provider automatically.

```sh
node codingagentlib/javascript/core-test.cjs
python3 -m unittest codingagentlib.test_core codingagentlib.test_sdk_packages
cargo test --locked --no-default-features --manifest-path codingagentlib/rust/Cargo.toml --test core
```

All three runners use `conformance/core-v1.json` for malformed replies, denied
tools, schemas, cancellation, duplicate call IDs, resume, completion gates and
resource limits. Separate tests exercise stores, stream buffering, uncertainty,
MCP trust, replay, delegation and isolated package imports. These deterministic
checks do not establish live-provider quality or remote MCP interoperability.

Optional model mosaics, portable graph memory, ontology extraction, graph
maintenance and graphical skill workflows are covered in the
[Coding Guide](README.md#coding-guide-optional-model-mosaic). Mosaic adapters are
available in JavaScript, Python and Rust. Graph/ontology JSON retains version 1;
new query/annotation operations do not change the frozen core protocol. The
optional JavaScript `@tlal/agent-memory` package has no filesystem dependency.


---

<a id="integration"></a>

## Embedding the agent in another application

JavaScript, Python and Rust export an optional `EmbeddedAgent` API for applications that own their tools, provider transport and UI. It has no dependency on a suite server or browser. JavaScript uses no Python worker in this mode. Rust remains native. Existing `Agent`, `Runtime`, `LocalRuntime` and browser-loop APIs are unchanged.

This is a small host-tool orchestration layer, not a replacement for the workspace runtime's guarded file tools, durable receipts, verification rules or recovery. It performs one registered tool call per model turn, publishes actual observations, supports questions/resume and bounds invalid-plan repairs. A `complete` result means the model ended the host conversation; hosts must enforce any domain-specific completion/verification requirements. Use the existing workspace `Agent` when those native coding safeguards are needed, or explicitly compose its tools as shown below.

<a id="integration-shared-integration-points"></a>

### Shared integration points

| Integration point | JavaScript | Python | Rust |
| --- | --- | --- | --- |
| Host tool registration | `addTool(name, handler, options)` | `add_tool(name, handler, ...)` | `add_tool(name, description, permission, handler)` |
| Model / provider transport | `model(request, signal)` | `model(request)` | `FnMut(&Value) -> Result<Value>` |
| Progress events | constructor `onEvent(event)` | constructor `on_event(event)` | `on_event(handler)` |
| Approval / policy | constructor `beforeTool(tool, args)` | constructor `before_tool(tool, args)` | `before_tool(handler)` |
| Cancellation | `AbortSignal` | `threading.Event` | `cancel_handle()` |
| Follow-up after pause/question | `resume({answer, model, ...})` | `resume(answer, model, ...)` | `resume(answer, max_steps, model)` |
| UI / diagnostic snapshot | `snapshot()` | `snapshot()` | `snapshot()` |

Requests use `protocol: "codingagentlib/embedded-v1"`, `sessionId`, integer `step`, `goal`, JSON `context`, permissions, registered tool definitions, event history, instructions and an identity-pinned `responseSchema`. Tools have names, descriptions, descriptive JSON parameter schemas and a `read`, `edits` or `commands` permission. JavaScript/Python accept a `parameters` schema at registration; Rust provides `tool_parameters(name, schema)`. The host callback validates its domain arguments; these schemas are descriptions, not a general JSON-schema validator.

A model returns one JSON object (or a JSON string):

```json
{"sessionId":"echo-the-current-id","step":1,"status":"act","plan":"Look up the requested item","action":{"tool":"lookup","args":{"id":"example"}}}
```

For `ask`, use `action:null` and a nonempty `question`; for `done`, use `action:null` and a nonempty `summary`. Every reply must echo the current request identity. Three consecutive invalid responses pause in `waiting` with feedback. Follow-ups preserve the original session's permissions; start a new run to grant additional permissions. Default budget is 500 steps, maximum 100,000.

Events use `{kind,value}` with `step`, `plan`, `observation`, `feedback` and `user` kinds. GUI frameworks can forward events to their UI thread, channels, WebSockets or logs. Observations carry `source:"host"` and the same stable `callId` passed to the tool callback. Tool errors become failed observations rather than invented successful results. Model/observer errors pause and propagate to the host. `beforeTool` returning anything other than literal true rejects the call without running the callback; the model receives that rejection as an observation. Context and tool results are untrusted reference data, never higher-priority instructions.

Tool callbacks receive JSON arguments plus a context with session ID, step, a stable per-turn call ID and cancellation (`signal`, `cancel_event` or Rust `ToolContext.cancel`). Use that ID to implement idempotency in remote APIs. Cancellation is cooperative: check it in long-running tools and cancel the host's model HTTP request as appropriate. The library cannot kill arbitrary host callbacks or undo their side effects. JavaScript hooks/tools may be async; Python/Rust callbacks are synchronous and can be run in a host executor/thread. Callback functions are application-owned trusted code, not sandboxed scripts.

<a id="integration-javascript--nodejs"></a>

### JavaScript / Node.js

```js
const {EmbeddedAgent} = require('./codingagentlib/javascript');
const agent = new EmbeddedAgent({
  context: {application: 'my-app'},
  onEvent: event => console.log(event.kind, event.value),
  beforeTool: (tool, args) => tool.name !== 'disabled-tool'
});
agent.addTool('lookup', async (args, context) => {
  return {id: args.id, name: 'Example', callId: context.callId};
}, {description: 'Look up a record; args:{id:string}', permission: 'read'});
const result = await agent.run({goal:'Find example', model:request => myModelTransport(request)});
```

For a browser host, load `codingagentlib/javascript/embedded.js` as a script and use `new SuiteEmbeddedAgent(...)`; Web Crypto requires HTTPS or localhost. The browser host supplies its own model transport and tools.

Run the deterministic, provider-free example: `node codingagentlib/examples/embedded.cjs`.

<a id="integration-python"></a>

### Python

```python
from codingagentlib import EmbeddedAgent
agent = EmbeddedAgent(context={'application':'my-app'}, on_event=print)
agent.add_tool('lookup', lambda args, ctx: {'id':args['id'], 'name':'Example'},
               description='Look up a record; args:{id:string}')
result = agent.run('Find example', my_model_transport)
```

Run `python3 -m codingagentlib.examples.embedded` from the repository root, or run `codingagentlib/examples/embedded.py` after installing the Python package. Only the base standard library is required.

<a id="integration-rust"></a>

### Rust

```rust
use codingagentlib::{EmbeddedAgent, RunOptions, ToolPermission};
use serde_json::json;

let mut agent = EmbeddedAgent::new(json!({"application":"my-app"}));
agent.add_tool("lookup", "Look up a record; args:{id:string}",
    ToolPermission::Read, |args, context| {
        Ok(json!({"id":args["id"], "name":"Example", "callId":context.call_id}))
    })?;
agent.on_event(|event| { println!("{event}"); Ok(()) });
let result = agent.run("Find example", &RunOptions::default(), my_model_transport)?;
```

<a id="integration-simple-rust-ui"></a>

### Simple Rust UI

```sh
cargo run --manifest-path codingagentlib/rust/Cargo.toml --example ui -- /absolute/workspace
```

Open the loopback URL printed by the executable. This small Rust program serves a browser UI with a goal field, Run/Stop controls and live public plans/observations. Its registered tool delegates to the native Rust workspace runtime and lists actual files. It has no Python, JavaScript tool installation, GUI toolkit or paid-model dependency. The browser uses a small static script for rendering.

The example's `demo_model` is intentionally deterministic and labelled as such in the UI: it interprets only the demo commands `list`, `read <path>`, `search <text>` and `ask`; it does not generate/edit code. Replace that function with your provider transport to connect a real model. Extend `add_tool` to expose your own application capabilities, choosing permissions deliberately. The HTTP example binds to loopback, checks Host/Origin and a same-origin request header, and renders output as text. It is a local integration example, not a production web service or general remote API.

The composition pattern is explicit: start a read-only native workspace session, register a host callback that calls `native.dispatch({op:"tool", ...})`, check the native observation's `ok`, then forward its result. This retains native file permissions and hash checks for those operations. It does not automatically inherit native completion checks, session cancellation or packaging into the host loop: forward the corresponding native calls/handles when your integration needs them. The Rust UI source demonstrates the read-only case.

<a id="integration-lifetime-and-security"></a>

### Lifetime and security

- Only registered tools are advertised; there are no automatic filesystem/network/process capabilities.
- `edits` and `commands` tools require explicit per-run flags, disabled by default. These are host declarations: a callback falsely labelled `read` can still perform side effects with the host process's privileges.
- Context, events and tool results must be JSON-compatible. Never put API keys in context/events; keep credentials in the provider/tool transport.
- Snapshots are copies for inspection/export. This lightweight API does not automatically persist state or guarantee crash-safe exactly-once execution. Explicit trusted snapshot restore is described below. Existing native workspace agents provide separate durable session APIs. Reattach host callbacks each time an application starts.
- No built-in history compression or provider SDK is imposed. Hosts can compress/filter the model request in their callback while preserving original events and response identities. Do not infer full workspace-runtime feature parity from this small API.

Checks: `node codingagentlib/javascript/embedded-test.cjs`, `python3 -m unittest codingagentlib.test_embedded`, and `cargo test --manifest-path codingagentlib/rust/Cargo.toml`.

<a id="integration-tool-management-completion-checks-and-session-transfer"></a>

### Tool management, completion checks and session transfer

The following additions are available in all three languages:

| Capability | JavaScript | Python | Rust |
| --- | --- | --- | --- |
| Discover registered tool metadata | `listTools()` | `list_tools()` | `list_tools()` |
| Enable/disable an existing tool | `setToolEnabled(name, bool)` | `set_tool_enabled(name, bool)` | `set_tool_enabled(name, bool)` |
| Remove a registration | `removeTool(name)` | `remove_tool(name)` | `remove_tool(name)` |
| Change host context while idle | `setContext(json)` | `set_context(json)` | `set_context(json)` |
| Veto premature completion | constructor `beforeFinish(reply, snapshot)` | constructor `before_finish(reply, snapshot)` | `before_finish(handler)` |
| Restore a trusted exported session | `restore(snapshot, permissions?)` | `restore(snapshot, allow_edits=False, allow_commands=False)` | `restore(&snapshot, &RunOptions)` |

Approval and completion hooks must return literal `true`/`True` to accept (`Result<bool>` in Rust). Omitted return values do not grant approval. Completion rejection records feedback and asks the model for a corrected response; three consecutive rejections/invalid responses pause in `waiting`. Hook failures pause/propagate according to the hook's existing contract; a failed tool-approval check never executes the tool.

Disabled tools are omitted from model requests and stale attempts to call them are rejected. Tool registrations and context are host-owned. Register/change/remove tools while idle; re-register trusted callbacks when constructing a new host process. Parameter schemas are descriptive and domain argument validation remains in the callback.

Run results now include cumulative session metrics: `steps`, `toolAttempts` (recorded observations, including denied calls), and `failedTools`. These describe recorded host events, not a certification of correctness. An empty resume answer continues the paused operation without adding a new user instruction; a nonempty answer records a follow-up. Response-repair counters reset on resume.

Snapshots use `format:"codingagentlib/embedded-state-v1"`. Restore validates structure and identity; imported `running` sessions become `paused`. Tool callbacks, provider credentials, context, enabled-tool configuration and policy hooks are **not** imported. Current host bindings apply. Edit/command permissions default to disabled and can only be restored when both the snapshot and the host explicitly allow them. No action executes during restore. Completed sessions remain completed; start a new run for a new goal.

```js
const saved = agent.snapshot(); // persist privately using your own application storage
const next = new EmbeddedAgent({beforeFinish:(_reply,state) =>
  state.events.some(e => e.kind==='observation' && e.value.ok)});
next.addTool('lookup', myLookup, {description:'Look up an item'});
next.restore(saved); // edits and commands remain disabled
const result = await next.resume({answer:'', model:myModelTransport});
```

```python
next_agent = EmbeddedAgent(before_finish=lambda reply, state:
    any(e['kind']=='observation' and e['value'].get('ok') for e in state['events']))
next_agent.add_tool('lookup', my_lookup, description='Look up an item')
next_agent.restore(saved_snapshot)  # permissions default to read-only
result = next_agent.resume('', my_model_transport)
```

```rust
next.restore(&saved_snapshot, &RunOptions::default())?;
let result = next.resume("", 500, my_model_transport)?;
```

Restore is a host-managed data transfer API, not authenticated audit recovery or automatic durable execution. Snapshots can contain private file text and imported/forged observations. Only restore snapshots your application trusts; completion policies must account for that provenance. A schema-valid snapshot does not prove tool execution. Call IDs support host idempotency but do not provide crash-safe exactly-once side effects. Do not blindly replay an uncertain external action.

<a id="integration-extended-rust-ui-example"></a>

#### Extended Rust UI example

The `ui` example now retains an embedded session between runs and offers:

- Actual file listing (with next-page preparation), reading and literal text search through native read-only tools.
- Questions (`ask`) and follow-up replies, plus a configurable 1–500 step budget and explicit Resume without replaying a completed tool just to continue.
- Current tool enable/disable controls that persist across new runs in this UI process.
- Public event search/type filters, run metrics and a completion gate requiring an observed successful tool.
- Snapshot JSON download and explicit local restore with edit/command permissions disabled. The full snapshot retains history; the UI displays at most the latest 200 events.

Start with the same command above. Click a listed file to prepare `read path`, then choose New run. For paged results, use Prepare next result page, or specify `read path @12000` / `search text @100` with the returned offset. Try `ask`, reply `search TODO`, or set the budget to 1 and resume after the first observed action. The model remains a clearly labelled deterministic demonstration, not a natural-language AI backend; replace `demo_model` for real provider use. The UI's current workspace stays fixed to its CLI directory even when importing another snapshot. The example HTTP request/snapshot budget is 8 MB, and the native text/paging limits still apply.

<a id="integration-dynamic-host-integration-framework"></a>

### Dynamic host integration framework

`ContextRegistry`, live context providers, dynamic tool availability and the existing event/approval hooks form a host integration framework in JavaScript, Python and native Rust. Use it to build an editor/agent UI with changing projects, selections, schemas, diagnostics, domain records or retrieved references. It is opt-in: static `context` and existing APIs still work. This adds an SDK integration surface; it does not replace the existing codeiX browser/relay implementation.

| Extension point | JavaScript | Python | Rust |
| --- | --- | --- | --- |
| Named context sources | `new ContextRegistry({base})` | `ContextRegistry(base=...)` | `ContextRegistry::new(base)` |
| Source registration | `.add(id, provide, {description, schema})` | `.add(id, provide, description=..., schema=...)` | `.add(id, description, schema, provider)?` |
| Discovery/removal | `.list()`, `.remove(id)` | `.list()`, `.remove(id)` | `.list()`, `.remove(id)?` |
| Bind live context | `new EmbeddedAgent({contextProvider: registry.provider()})` | `EmbeddedAgent(context_provider=registry.provider())` | `agent.context_provider(move \|state,cancel\| registry.resolve(state,cancel))` |
| Dynamic capabilities | constructor `toolAvailable(tool, context, state)` | constructor `tool_available(tool, context, state)` | `.tool_available(\|tool,context,state\| Ok(bool))` |
| Exact turn context in tools | `turn.context` | `turn['context']` | `ToolContext.context` |

Each source callback receives the current session snapshot (including goal, integer step and observed events) and the cancellation signal/handle. It returns **`{revision: string, data: JSON}`**. Sources can select relevant records based on the current goal and observations; hosts own filtering, retrieval, budgets and exclusion policies. JavaScript supports async providers; Python/Rust use synchronous callbacks. No I/O, model calls or subprocesses are built into the registry.

Before **every** model turn, including invalid-plan retries and resumed conversations, the registry resolves its sources into:

```json
{
  "format": "codingagentlib/integration-context-v1",
  "base": {"application": "my-editor"},
  "sources": [
    {"id":"project", "description":"Current native project", "schema":{"type":"object"},
     "revision":"host-revision-42", "data":{"name":"My project","files":[]}}
  ]
}
```

The machine-readable contract is [integration-context.schema.json](integration-context.schema.json). Source IDs are unique. Schema objects describe host data; the registry checks the envelope, not arbitrary schema conformance. Callbacks and schemas are trusted host configuration; source data remains untrusted task context. Sources resolve sequentially, so applications needing an atomic snapshot across several sources must capture one consistent host snapshot themselves and split it into sources, or expose one combined source. Registry membership changes belong between model turns/runs; JavaScript/Python reject changes during an active resolution. Do not concurrently mutate host state without synchronization.

Context is copied into the model request and separately into tool callbacks. A model callback mutating its request does not change the context handed to a tool. The optional `context` progress event exposes only `{step,sources:[{id,revision}]}`, suitable for a UI's context status. It does not emit complete source payloads. Revisions are host-defined freshness tokens, **not** library-generated hashes or security credentials.

Availability callbacks run when listing tools for the model and again before dispatch. They must return literal `true` (Python `True`, Rust `Ok(true)`) to allow a tool. The second check can inspect live host state captured by the callback to revoke a capability while a model call is in flight. Unadvertised tools are rejected; revoked tools produce a failed observation without execution. This is additional to `read`/`edits`/`commands` permission and `beforeTool` policy. Source/discovery callback failures pause and propagate instead of silently reusing stale context. Tool-dispatch callback failures become failed observations. Callback functions are host code, not a plugin sandbox.

<a id="integration-build-an-editor-agent-with-reviewed-takeover"></a>

#### Build an editor agent with reviewed takeover

[examples/dynamic-editor.cjs](examples/dynamic-editor.cjs) exports `createEditorIntegration(...)` with injectable `readProject`, `readSelection`, `documentSchema`, `validate`, `review`, `canPropose` and `onEvent` callbacks. It registers `read_project` and a permission-gated `propose_project` tool. The proposal must match the exact turn's project revision; it is rejected if the live revision changed before or during validation. `review` queues a validated candidate for the host UI, and an observation says queued rather than applied.

```js
const {createEditorIntegration} = require('./codingagentlib/examples/dynamic-editor.cjs');
const {agent, contexts} = createEditorIntegration({
  readProject: () => editor.readRevisionedProject(), // {revision:string,data:document}
  readSelection: () => editor.readRevisionedSelection(),
  documentSchema: editor.schema,
  validate: document => editor.validate(document),  // returns validated document
  review: proposal => editor.queueReview(proposal), // returns JSON; no silent apply
  canPropose: () => !editor.readOnly,
  onEvent: event => ui.appendAgentEvent(event)
});
contexts.add('diagnostics', () => editor.readRevisionedDiagnostics());
const result = await agent.run({goal: userInput, model: modelTransport, allowEdits: true});
// result.status === 'waiting': show its question and resume with the user's answer.
// The host's Apply button rechecks expectedRevision and commits atomically with Undo.
```

The host **must** enforce revision comparison again at the actual Apply action (ideally compare-and-swap in its own transaction), validate domain data and tool arguments, provide Undo/recovery, and explicitly grant execution permissions when needed. A queued review or `complete` result is not proof of a successful workspace merge. Register additional domain tools on `agent` while idle; register their availability policy through the core API when constructing a custom host. Provider-specific HTTP calls, streaming UI and review UI remain injected host responsibilities.

Runnable deterministic demos, without paid provider calls:

```sh
node codingagentlib/examples/dynamic-editor.cjs
python3 -m codingagentlib.examples.dynamic_context
cargo run --manifest-path codingagentlib/rust/Cargo.toml --example dynamic_context
```

On restoring a saved agent session, re-register source/tool callbacks and bind the current host environment. Source data and functions are not persisted as executable configuration in agent snapshots. Resumed turns resolve current context again; permissions still require explicit restoration grants.
<a id="integration-progressive-tool-definitions"></a>

### Progressive tool definitions

The JavaScript suite loop accepts toolDiscovery:true (default false). The toolRouting.select helper uses the current host catalogue to advertise essential and relevant definitions. LocalRuntime exposes the same option:

    const {LocalRuntime} = require('./codingagentlib/javascript');
    const runtime = new LocalRuntime({workspace: projectDirectory, commands: ['python3']});
    try {
      await runtime.run({goal: 'Inspect this codebase', model: myModelTransport, toolDiscovery: true});
    } finally { await runtime.close(); }

The Python workspace runtime provides audited, read-only discover_tools. Arguments are query (optional text), names (up to 20 exact names), offset and limit (1–20, default 12). Its codingagentlib/tool-discovery-v1 result includes descriptors, totalMatches, nextOffset, done and unavailableNames. Descriptions grant no execution permission.

The JavaScript package exports toolRouting; browser scripts expose SuiteAgentTools. Custom browser hosts load javascript/tool-routing.js before javascript/loop.js. Only the JavaScript suite loop and LocalRuntime automatically prune schemas. Python's direct Agent and native Rust/EmbeddedAgent loops retain their existing catalogues unless the host supplies routing. Embedded hosts can compose this with dynamic context and availability policies. See the [suite behavior and limitations](../shared-agent/README.md#progressive-tool-discovery).

<a id="integration-review-evidence-references"></a>

### Review evidence references

Python independent_prepare responses include evidenceIndex entries. An entry has an id and kind: instruction (goal or instruction:N), observation (call:ID with callId/tool), change (change:N with path/status/hash), or browser-context (app-context with snapshot). Corresponding source observations and collected file views carry evidenceId where available. Reviewer findings can include evidenceIds, an array of 1–10 unique current-checkpoint IDs.

The JavaScript independentReview helper requires references for findings when the request supplies an index. independent_submit validates supplied references against the server-owned checkpoint and stores the index with the verdict. Legacy submissions can omit evidenceIds; old servers without an index keep the previous client behavior. These references do not replace freshness checks, declarative acceptance rules or native validation. See the [review behavior and limitations](../shared-agent/README.md#evidence-linked-independent-review).

<a id="integration-parallel-read-integration"></a>

### Parallel read integration

The Python workspace runtime (including JavaScript LocalRuntime backed by it) accepts an audited tool request:

```json
{
  "op": "tool",
  "sessionId": "YOUR_SESSION",
  "callId": "inspect_sources_1",
  "tool": "parallel_read",
  "args": {
    "workers": 2,
    "requests": [
      {"id": "source", "tool": "read_file", "args": {"path": "main.py"}},
      {"id": "listing", "tool": "list_files", "args": {"path": "."}}
    ]
  }
}
```

Use the usual session, permission and unique-call-ID rules. The observation contains `codingagentlib/parallel-read-v1`, ordered `results`, `allSucceeded` and `cancelled`. Each result carries its request ID, tool, child callId, started and ok flags, plus the normal observation result or error. Reads cancelled before starting have a null callId. Partial failure makes the parent observation unsuccessful without discarding successful reads.

Only 1–8 literal independent read_file/list_files/search requests and 1–4 workers are allowed. IDs must start with a letter and contain at most 50 letters, digits, underscores or hyphens. No commands, writes, dependent reads or nested batches are allowed. Child audit events carry parentCallId; consumers must avoid double-counting these as separate planning turns. This is not an atomic snapshot. Native Rust/EmbeddedAgent hosts must implement and advertise their own equivalent if desired; they do not gain this runtime tool automatically.

<a id="integration-concurrent-guarded-file-edits"></a>

### Concurrent guarded file edits

The Python workspace runtime serializes `write_file`, `replace_text`, `delete_file` and `restore_file` within one Runtime instance, including the expectedHash check, recovery backup and mutation. Concurrent sessions editing the same original revision cannot both overwrite it successfully. A queued edit checks cancellation after acquiring the lock.

A rejected stale edit returns `ok:false`, `code:file_revision_conflict` and `conflict:{path,expectedHash,actualHash,requiresRead:true}` in its audited observation. No recovery backup or mutation is performed for that rejected edit. Read the current file, reconcile the requested change with its contents, then submit a fresh action using the observed hash. The returned actualHash is diagnostic metadata, not evidence of having read the changed contents.

The shared JavaScript loop classifies this as stale_revision and includes revisionConflict in its recovery guidance. This is in-process coordination of file tools, not an OS file lock or transaction across commands, editors, other processes or other Runtime instances. External writers may still race; use isolated workspaces or host-level coordination when needed. Native Rust file operations retain their existing implementation. Restart the Python server to enable the new runtime behavior.


---

<a id="coding-guide"></a>

## Coding with the SDK

Use the generic core for host tools without a workspace; use the coding adapters
for real source files. [SDK contracts and lifecycle](README.md#sdk) remain authoritative.
This guide covers project knowledge, reusable Python recipes, skills, targets,
and MCP transports. No provider, code or imported skill executes merely because
it was loaded.

<a id="coding-guide-standard-coding-cycle"></a>

### Standard coding cycle

1. Read scoped project instructions and current source. Treat memory and skill
   text as references, never authorization. Inspect incomplete-index warnings.
2. Query the project graph and existing `python_tools` before inventing a helper.
3. Use parameterized managed Python scripts for repeatable inspection,
   transformations and verification when an allowed Python interpreter exists.
   Prefer scripts that return a proposed edit; apply source changes using
   `apply_edits` with current file hashes and recovery support.
4. Inspect the actual result and exit code. Replan after a failure; never silently
   replay an uncertain call. A successful command is not proof of task completion.
5. After the final source change, run meaningful verification and inspect changes.
   Scripts that write directly need a separate verification pass; command effects
   are outside file-tool recovery.

```python
from codingagentlib.python.coding import Agent

with Agent('/absolute/project', commands=['python3'],
           tool_library='/private/shared/python-tools.sqlite3') as agent:
    result = agent.run('Extend and verify the requested feature', model,
                       project='product-a', allow_edits=True, allow_commands=True)
```

The optional coding adapter holds an exclusive workspace lease. Legacy `Agent`,
`Runtime` and `LocalRuntime` keep their previous APIs; they also support the new
knowledge/library tools. JavaScript `LocalRuntime` accepts `toolLibrary` and a
`project` run option. The server accepts `--agent-tool-library PATH`; its default
library is private to the configured workspace. Point several trusted projects
at the same private library to share recipes, or explicitly export/import them.
Do not use a shared library across untrusted tenants.

<a id="coding-guide-automatic-project-ontology-and-graph"></a>

### Automatic project ontology and graph

Coding runs build a bounded static graph at start and refresh it before planning.
Python/browser requests and native Rust requests include `projectKnowledge`.
Files, symbols, imports, RST needs and dependency links carry source provenance;
Python class and lexical class/struct/interface declarations also infer ontology
concepts. The Python runtime adds available local skills, recipes and targets.
Python uses AST extraction where possible; Rust and JS/TS/Rust source inspection
are deliberately lexical. Dynamic dependencies and runtime behavior are not
inferred. This lightweight JSON ontology is not an OWL reasoner.

Python import edges resolve indexed `.py` modules, package `__init__.py` files,
relative imports (including `from . import sibling`), and conventional `src/`
layouts to their workspace file nodes. References outside the indexed source or
with multiple matching files remain module references; ambiguous candidates are
listed with a warning. Relative references cannot escape their source root.
Resolution uses source paths only: it does not execute imports, inspect installed
packages or `sys.path`, or infer re-exports and runtime attribute shadowing.

The default namespace is the workspace name; Python runs can set `project=...`,
JavaScript local runs can set `project`, and native host dispatch can pass
`knowledgeProject` on start. Existing note recall still requires its separate
explicit setting. Graph references do not count as fresh file inspection or
verification evidence.

Indexing excludes state, environment files, known private paths (Python),
symlinks, dependencies and build/vendor folders. It reads at most 512 source
files, 200 KB per file and 8 MB total. Graph/concept bounds and parse/read failures
produce incomplete-index warnings. Imported/custom knowledge is retained across
refresh; derived source records are rebuilt. Static extraction can miss or
misidentify relationships; inspect source before relying on an edge.

Host APIs (also supported by the native Rust `dispatch` interface):

```python
graph = agent.dispatch({'op':'project_knowledge','project':'product-a','action':'export'})
schema = agent.dispatch({'op':'project_knowledge','project':'product-a','action':'ontology'})
# Write JSON to user-selected files for download or transport.

current = agent.dispatch({'op':'project_knowledge','project':'product-b','action':'export'})
agent.dispatch({'op':'project_knowledge','project':'product-b','action':'import',
                'payload':graph,'expectedRevision':current['revision']})
```

`import_ontology` loads a standalone ontology using the same revision guard and
rejects removal of types used by existing nodes. Imports are validated for format,
bounds, node types and edge endpoints; they never open referenced source files or
execute content. Graph and ontology formats are respectively
`codingagentlib/project-knowledge-v1` and `codingagentlib/project-ontology-v1`.
The shared **Project memory** dialog supports refresh, separate downloads and
reviewed imports in the browser agent and VS Code. `rstiX` additionally builds a
graph directly from its open RST document, separate from server workspace files.

<a id="coding-guide-reusable-python-tools"></a>

### Reusable Python tools

Use `write_script` to create a managed `.py` file. A parameterized recipe accepts
one `--input-json` argument and emits machine-readable output. A single-line
header opts it into implicit capture after a successful `run_script`:

```python
# codingagent-tool: {"id":"describe_python","name":"Describe Python source","parameters":{"type":"object","required":["source"],"properties":{"source":{"type":"string"}},"additionalProperties":false}}
import argparse
import ast
import json

parser = argparse.ArgumentParser()
parser.add_argument('--input-json', required=True)
args = json.loads(parser.parse_args().input_json)
tree = ast.parse(args['source'])
print(json.dumps({'declarations': [node.name for node in ast.walk(tree)
    if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef))]}))
```

Implicit capture creates a new tool only; it does not overwrite an existing ID.
Timeouts, failed/cancelled commands, unmarked scripts, absolute path literals and
obvious embedded credentials prevent promotion. This filter is not a secret
scanner or a sandbox: keep credentials out of scripts and review source before
sharing or reuse. Generic recipes use arguments rather than project names/paths.
Updates use `python_tool_save` with a managed source path, current source hash,
parameters and expected library revision. Source stays private until exported.

`python_tools` supports `list`, `read`, `list_targets` and `prepare`. Preparation
requires the inspected recipe hash and edit permission; it stages an audited
managed script and returns its path/arguments. A **separate** `run_script` action
with an allowlisted Python interpreter and command permission executes it.
Neither listing, importing nor preparation executes recipe source.

Named targets pin a tool revision and source hash plus validated parameters and
skill IDs. Host example:

```python
recipe = agent.dispatch({'op':'tool_library','action':'read','id':'describe_python'})
target = agent.dispatch({'op':'tool_library','action':'target_save','id':'inspect-source',
    'tool':recipe['id'],'arguments':{'source':'def example(): pass'},
    'skills':[], 'expectedRevision':0})
bundle = agent.dispatch({'op':'tool_library','action':'export'})
# Another workspace can import the bundle; conflicts are rejected atomically.
agent.dispatch({'op':'tool_library','action':'import','payload':another_bundle})
```

Read a target/recipe before preparation. Stale pins are rejected, not silently
upgraded. Referenced skills must exist and be enabled in the current runtime;
importing tools does not import or authorize skill instructions. Use the existing
`skill_list`, `skill_read`, `skill_save` and versioned workflow APIs for reusable
procedures and ordered target steps. Library bundles are data-only
`codingagentlib/python-tools-v1` records; importing source never runs it.

#### Exposing generated scripts and programs to Portable SDK v1 (`CoreAgent` / `createAgent`)

When embedding the Portable SDK v1 loop (`create_agent` / `createAgent`) instead of `ReactAgent` or `LocalRuntime.run`, you can expose workspace-managed scripts, `ScriptLibrary`, `PythonEnvironments`, `ToolLibrary`, and allowlisted OS programs as standard `ToolDefinition`s:

- **Python**: `runtime_tools(runtime, allow_edits=..., allow_commands=...)`, `script_tools(...)`, `program_tools(...)`, or standalone `script_library_tools(script_library, pyenvs=..., allow_edits=...)` (exported from `codingagentlib` and `codingagenttools`). `CoreAgent.async_run(...)` supports async models, async streaming, and async tools; `Runtime(..., command_wrapper=...)` supports optional OS-level sandbox wrappers (e.g. `bwrap` / `firejail`); and `providers.tool_schemas(TOOLS, provider='openai'|'anthropic'|'gemini')` converts `Runtime` `arguments` maps into JSON Schema `parameters`.
- **JavaScript (`LocalRuntime`)**: `await runtime.coreTools({ allowEdits, allowCommands })`, `await runtime.scriptTools(...)`, `await runtime.programTools(...)`, and `await runtime.toolLibrary(action, params)` (with TypeScript types in `local.d.ts` and `index.d.ts`). `providers.js` also exposes `toolSchemas`, `parseProviderResponse`, `openAIToolModel`, `anthropicToolModel`, `geminiToolModel`, and `toolUseToReactModel`.
- **Rust (`coding` feature)**: `codingagentlib::core_tools(runtime, session_id, None)`, `script_tools(runtime, session_id)`, and `program_tools(runtime, session_id)` (with per-tool JSON Schema `parameters` via `tools::schema`).
- **Workflows**: `agent_workflows.STEP_TOOLS` includes `script_run` alongside `run_command`, `run_script`, and managed script tools (`write_script`, `read_script`, `list_scripts`, `delete_script`).

<a id="coding-guide-mcp-through-json-rpc-and-shell-transports"></a>

### MCP through JSON-RPC and shell transports

The SDK supports injected JSON-RPC senders as well as explicit stdio subprocesses.
Subprocess arguments are literal arrays with shell evaluation disabled. External
transport configuration is host-owned, not model-owned. MCP tools still pass the
core's trust, argument, permission and uncertainty checks.

```js
const {shellMcp, rpcTransport, initialize} = require('./javascript/mcp-transports');
const {mcpTools} = require('./javascript/extensions');
const transport = await shellMcp({
  command:'python3', args:['-m','codingagentlib.rpc','--workspace','/absolute/project'],
  cwd:'/absolute/checkout', timeout:30000
});
try {
  const tools = await mcpTools({transport,
    trust: tool => ['project_graph','skills','python_library'].includes(tool.name)});
  // Register these tools in createAgent. Imported tools require command permission.
} finally { await transport.close(); }

// For an authenticated HTTP/WebSocket/SDK bridge owned by the host:
const rpc = rpcTransport(frame => hostSendJSONRPC(frame));
await initialize(rpc);
```

Python offers `ShellMCP` (context manager) and `RPCTransport` in
`python.mcp_transports`; Rust offers `mcp_stdio::StdioMcp` plus the existing
`McpTransport` trait for arbitrary RPC bridges. Initialization negotiates
`2025-03-26` and sends the initialized notification. Listing/calling tools uses
JSON-RPC `tools/list` and `tools/call`. The service supports bounded JSON-lines
frames, separate error responses and normal MCP tool results.

JavaScript, Python and Rust validate JSON-RPC envelopes against the shared
`conformance/mcp-frames-v1.json` vectors. Stdio notifications are consumed without
using a pending call ID or extending its reply deadline. These clients advertise
no sampling or roots capabilities; server requests receive `-32601` and never
dispatch host tools. Request IDs in the two directions are independent.
Malformed replies, unexpected response IDs, response frames over 8 MB of UTF-8,
timeouts and cancellation close the stdio connection; inspect uncertain tool
outcomes before reconnecting. A valid JSON-RPC error rejects its call while
leaving the connection available. Python and Rust bound queued peer frames to
64; notifications are discarded rather than stored as agent observations.
Discovered tool definitions are snapshotted before registration and trust
callbacks cannot alter the pinned name/schema. Rediscover and register tools
explicitly after a remote schema change. All three adapters require a content
array and an optional boolean `isError`; malformed tool results are uncertain
calls rather than successful receipts.

```sh
python3 -m codingagentlib.rpc --workspace /absolute/project
# Explicitly opt into writes/programs only when needed:
python3 -m codingagentlib.rpc --workspace /absolute/project \
  --allow-edits --allow-commands --allow-command python3 \
  --tool-library /private/shared/python-tools.sqlite3
```

The service defaults to read-only tools. It supplies `project_graph`,
`python_library`, `skills` and the runtime's normal guarded tools. It never
interprets a command string as shell syntax. It is a local stdio service, not an
unauthenticated HTTP server. Hosts implement network authentication and remote
server trust. Timeouts/transport loss can leave an uncertain call; inspect and
reconcile it before retrying. Shell transports must be explicitly closed.

<a id="coding-guide-rstix-workflow"></a>

### rstiX workflow

Open RST files, a folder, a RST ZIP, `needs.json` or a native `.rstix.json` project.
Select a need to edit title/status/tags/body; drag cards to change layout only.
Connect cards or use the dependency inspector to update actual RST options.
Use the source editor for structural changes or nested need bodies. Apply source
explicitly; malformed/duplicate-ID edits do not replace the current document.

Export native projects for layout plus source, RST ZIPs for source files, or
`needs.json` for interchange. Non-RST assets and build configuration remain
outside rstiX's RST-only project. Directives/includes/conf.py are never executed.
The graph review detects missing targets and cycles but does not replace a real
Sphinx build. [Full app guide](../rstiX/README.md).

<a id="coding-guide-optional-model-mosaic"></a>

### Optional model mosaic

Use a mosaic when different host-configured models suit different phases. It is
off by default. Routing chooses one model per turn; the core validates its
complete response and owns all tool execution. No fallback model is called
silently, and routing never grants permissions or bypasses completion gates.

```js
const {createAgent, createModelMosaic, ProjectGraphMemory} = require('./javascript');
const memory = new ProjectGraphMemory();
await memory.refresh('flight', [{path:'control.py', content:sourceText}]);
const model = createModelMosaic({
  models:{planner:planningModel, coder:codingModel, reviewer:reviewModel},
  routes:{default:'coder', plan:'planner', review:'reviewer'},
  maxCalls:100, onEvent:event => hostAudit(event)
});
const agent = createAgent({model,
  contextProviders:[memory.contextProvider('flight',{hops:2})]});
```

The default selector routes the first turn to planning and successful command
observations to review; other turns use coding. It reads structural receipts,
not source-text instructions. This heuristic does not establish verification
adequacy. JavaScript/Python hosts can supply `select`; Rust hosts can use
`ModelMosaic::call_role`. SDK budgets count model callback invocations, including
failures. Host-owned transports must separately budget any internal retries.
`inspect()` returns a bounded route history without credentials/model functions.

Python exposes `create_model_mosaic(models=..., routes=..., max_calls=...)`.
Rust exposes `mosaic::ModelMosaic::new(models,routes,max_calls)` and
`into_model()` for `CoreOptions.model`. These adapters work with generic agents
and coding model callbacks, without requiring a filesystem or provider package.
[JS example](examples/model-mosaic.cjs) and [Python example](examples/model_mosaic.py)
use deterministic callbacks.

In the browser agent, expand **Optional model mosaic**, load saved model
profiles, choose planning/coding/review routes, and enable it for the run.
Routes/profile revisions are pinned in session events. Actual model HTTP
attempts, including retries and paging, reserve the session's budget atomically
before dispatch. Resume cannot reset it or silently change profile revisions.
Mosaic takes precedence over handoff/advisory consultations for a new run;
sessions with a different saved model policy require a new session. Failed
requests may still incur provider charges; these are request bounds, not billing
guarantees.

<a id="coding-guide-graph-retrieval-and-memory-maintenance"></a>

### Graph retrieval and memory maintenance

JavaScript `ProjectGraphMemory` takes host-supplied source snapshots. It hashes
source, extracts lexical declarations/imports, and indexes RST needs through the
shared static parser. Optional `@tlal/agent-memory` includes the parser; browser
hosts indexing RST must load `architex/sphinx-rst.js`. Storage defaults to memory.
For durability, provide host-owned `load(project)` and atomic
`save(project,record,expected)` callbacks, scoped to the current tenant.
JavaScript `contextProvider`, Python `ProjectKnowledge.context_provider`, and
Rust `graph_memory::query` integrate the same format into generic agents.
Rust `ProjectGraphMemory` is an in-memory import/export/query store; native coding
`Agent` also builds/persists its automatic workspace graph.

Python indexing adds stable qualified symbols, same-file inheritance and direct
named-call references. Moving unchanged Python declarations preserves annotations.
JS/native extraction remains lexical; Python does not resolve dynamic dispatch
or cross-module aliases. Imported hashes that disagree with the current Python
index are marked `stale-reference` during recall. `current-index-snapshot` means
the source matches this index, never that a command or test passed.

```python
result = agent.dispatch({'op':'project_knowledge','project':'flight',
    'action':'query','query':'FlightController','hops':2,'limit':30,
    'direction':'out','relations':['calls','inherits','depends_on']})
current = agent.dispatch({'op':'project_knowledge','project':'flight','action':'export'})
agent.dispatch({'op':'project_knowledge','project':'flight','action':'annotate',
    'nodeId':current['nodes'][0]['id'], 'text':'Inspect this entry point.',
    'expectedRevision':current['revision']})
```

Queries also accept explicit `nodeIds`. Bounds: 12 seeds, 0–4 hops, 1–50 returned
nodes, 150 links. Unmatched text falls back to a bounded inventory, rather than
implying that no graph exists; the result marks this with `fallbackUsed: true`.
Set `fallback: 'empty'` for search interfaces that should return no matches
instead. Blank queries still browse the inventory. The browser and VS Code
graph search use this empty-result mode; automatic agent context retains the
inventory default. Runtime health advertises `query-fallback-v1` for this option.
JavaScript, Python and Rust share `conformance/graph-query-v1.json` tests for
Unicode label/property searches, ranking by score then ASCII ID, stable
breadth-first traversal, direction/relation filters and unique bounded seeds.
Returned annotations, warnings, seeds, nodes and edges are independent snapshots.
`stats`/`history` are nonexecuting host operations.
`annotate`, `relate` and `forget` require the inspected revision. Forget removes
an imported entity and its links; source-derived entities must be edited in
source or annotated. Refresh prunes orphaned links/annotations and retains
imported/custom knowledge. History retains the latest 100 stored changes.
Imported annotations round-trip as reference notes; imported history is never
adopted as local evidence. JavaScript offers `memory.manage(project,...)`.
The browser and VS Code **Project memory** dialogs expose neighborhood search,
annotations, imported-entity removal, history and JSON exchange.

<a id="coding-guide-graphical-skill-flows-and-embedded-results"></a>

### Graphical skill flows and embedded results

The [skill-flow editor](../shared-suite/skill-flow/README.md) compiles an acyclic
diagram into normal versioned tool workflows. Skill nodes pin local ID/revision
prerequisites and propagate them to downstream tool steps. Python preflight and
dispatch check these pins; disabled/changed skills block dispatch. Pinned definitions use `suite-tool-workflow/v2`, which older hosts reject; plain
flows continue to use v1. Check `workflowContracts` and `workflowFeatures` before
transferring a pinned flow. Argument and
result references add implicit dependencies and participate in cycle checks.

Open the editor from an agent session to load/save workflow revisions through
its restricted same-origin bridge. Standalone use supports native/workflow JSON
exchange. Editing/importing never executes steps. Static HTML/SVG exports from
the flow editor and rstiX embed through sandboxed iframes without agent access.
Keep native JSON for continued editing.

<a id="coding-guide-snapshot-safe-project-memory-stores"></a>

#### Snapshot-safe project-memory stores

JavaScript graph stores require both `load(project)` and atomic
`save(project, record, expectedRevision)` callbacks, or neither for in-memory
storage. Loaded records must identify the requested project and their stored
revision. Exports, query results and callback writes use independent snapshots;
editing a returned graph cannot mutate a host's stored record. Source snapshots
are captured before asynchronous indexing, so their hashes and extracted
entities describe the same supplied text. Identical refreshes preserve the
revision and do not add history entries. Local import/refresh/management history
is bounded to 100 changes; history supplied by an import is not trusted.

`memory.ontology(project)` downloads the separate ontology;
`memory.importOntology(project, payload, revision)` loads it without replacing
nodes or their annotations. Types still used by graph nodes cannot be removed.
`memory.history(project)` returns local change metadata. Rust's portable
`graph_memory::ProjectGraphMemory` now also exposes `ontology` and
`import_ontology`; Python/native coding host dispatch already supports the same
standalone ontology exchange. The graph and ontology formats remain version 1.

Graphical workflow import preserves exactly which steps require each pinned
skill. New flows can choose downstream or next-step scope. Native skill-flow v2
carries that scope explicitly; execution exports remain the existing workflow v2
contract. The editor retains unapplied fields per session and blocks exporting
old applied values until pending fields are applied or discarded.

<a id="coding-guide-recovering-command-launch-failures"></a>

### Recovering command launch failures

The Python runtime retains an inspectable job when the OS rejects an approved
executable (for example, a missing shebang interpreter or an invalid executable
format). The tool observation has `ok: false`, `code: "command_launch_failed"`
and a `result` with `jobId`, `started: false`, `exitCode: null`, and `launchError`
containing a classified code, errno and diagnostic. Standard output/error logs
remain available through `read_command_output`, including after session restart.
A failed launch invalidates prior command verification; a missing exit code is
never treated as success. The normal retry budget and command permissions remain
in effect. The browser loop passes this structured diagnosis to the next model
turn and shows its specific recovery guidance in the existing recovery panel.

Inspect executable/interpreter availability, the working directory and retained
diagnostics before proposing a correction. No shell fallback, installation,
permission change or automatic command replay occurs. The same shared log reader
builds complete byte hashes and UTF-8-safe previews for launch failures and normal
command exits. Native runtimes that do not report this optional error code retain
their existing error handling.

<a id="coding-guide-command-retries-and-changing-checks"></a>

#### Command retries and changing checks

The browser loop and VS Code host count repeated terminal failures by tool and
arguments, independently of declarative result checks. Altering checks cannot
reset the three-failure pause. Exact action/result matching remains in place for
cycle detection and non-command tools. A changed command can be attempted;
successful matching retries, recorded edits and user follow-ups retain their
existing recovery-boundary behavior. This heuristic neither executes recovery
commands nor changes permissions or completion criteria.


---

<a id="model-handoff"></a>

## Evidence-driven model handoff

This optional host policy adapts [AgentBaton](https://arxiv.org/html/2610.35959v1): a primary model establishes an implementation, then an efficient continuation model can finish localized work. It is a one-time handoff, not per-turn routing, a parallel-agent system, or an automatic retry of failed commands. This implementation uses a separately prompted readiness evaluator, not the paper's trained detector. Cost or accuracy gains have not been established for this suite.

<a id="model-handoff-configure-the-browser-coding-agent"></a>

### Configure the browser coding agent

1. Open **AI provider settings** from the desktop. Create and save a primary and a continuation provider profile, each with its endpoint, model and credentials.
2. Set each profile's **Declared input support** to formats the model actually accepts. Text is the default; image, audio and PDF/file support are explicit declarations, not capability probes.
3. Under **Coding-agent model handoff**, choose primary and continuation profiles. Optionally select a separate readiness evaluator; otherwise a separate call to the primary model evaluates readiness.
4. Start with **Shadow · evaluate only**, then **Save handoff settings**. No continuation profile means normal single-model behavior, with no detector calls.
5. Inspect the coding-agent role indicator and saved readiness decisions. After evaluating your model pair, select **Automatic · one handoff** for new sessions.

These settings apply to shared coding-agent tabs across the apps. Ordinary AI chat and shelliX's separate shell loop retain their existing provider behavior. Keys stay in the relay's private profile store. Selecting roles does not change tools, command allowlists, run approvals or completion requirements. Relay imports/exports include the handoff settings. Ordinary exports still omit API keys.

A saved relay configuration can include:

```json
{
  "agentHandoff": {
    "mode": "shadow",
    "primaryProfileId": "strong-profile",
    "continuationProfileId": "efficient-profile",
    "detectorProfileId": ""
  }
}
```

Each ID must refer to a profile in the same configuration. The primary can be empty to use the active profile; continuation empty disables routing. Use explicit primary selection when regularly changing the relay's active profile. Profile `inputModalities` is an array drawn from `text`, `image`, `audio`, `file`.

<a id="model-handoff-configure-the-standalone-vs-code-extension"></a>

### Configure the standalone VS Code extension

**Configure Model Provider** now asks for the role: primary, continuation or readiness evaluator. The primary retains the existing endpoint/model/transport settings. Additional roles use `codingagent.handoffContinuation` and `codingagent.handoffDetector`; credentials use the existing origin-bound SecretStorage. A relay role also needs its saved profile ID. Different keys at the same provider origin still share the existing origin-bound key slot.

The **Model handoff** button opens native settings. `codingagent.handoffMode` accepts `off`, `shadow` (default) or `auto`. No configured continuation means no evaluator calls. A machine-level example:

```json
{
  "codingagent.handoffMode": "shadow",
  "codingagent.handoffContinuation": {
    "endpoint": "http://127.0.0.1:4000/v1/chat/completions",
    "model": "your-efficient-model",
    "transport": "openai",
    "inputModalities": ["text", "image"]
  }
}
```

Do not put API keys in these objects. Empty `handoffDetector` reuses the primary through a distinct evaluator request. The active role/model ID appears in run details and trace; provider-attempt events identify detector versus planning calls. A detector call consumes the same request timeout/retry settings and may incur cost.

<a id="model-handoff-readiness-and-execution-boundaries"></a>

### Readiness and execution boundaries

The first release is deliberately conservative. A qualifying sequence requires a successful workspace file-tool write, replacement, edit batch or restoration, followed by a completed command/script receipt. File-tool receipts provide exact path/hash provenance. Pure planning, command-only changes without file-tool evidence, and browser `apply_project` changes do not qualify. A server command cannot certify a separate browser project just because it followed a browser edit.

The readiness evaluator receives the original goal, user follow-ups, repository instructions, task state, permissions, and bounded tool-input/source and command-output previews with explicit coverage notes. It must classify the artifact and feedback as relevant to the task, cite exact artifact/feedback call IDs, and describe remaining work using `repair`, `validate`, `harden`, or `finalize` categories. A failed test can qualify if it localizes a defect; environment failures and unrelated checks must not. This relevance judgment is model supplied, not a deterministic proof.

Missing receipts, malformed replies, wrong citations, unsupported continuation input formats, and evaluator/transport errors retain the primary model. Cancellation stops routing. The same artifact/feedback pair is not evaluated repeatedly. New follow-up instructions require new evidence before an initial handoff. Stale or unavailable source-bound verification blocks a readiness opportunity. Source freshness remains bounded to inspected/edited files, as documented separately.

The native audit records `model_handoff_policy`, `model_handoff_decision`, and, in automatic mode, one `model_handoff` transition. Dedicated `handoff_event` metadata writes preserve the reserved native turn. No detector output is submitted as a tool action. Policy persistence must succeed before switching.

The workspace, native session ID, reserved step, command review, file hashes, loop/failure budgets and completion checks remain unchanged. The handoff brief adds goal, remaining work, source/evidence references and original history offsets; full history remains accessible through `read_history`. Native multimodal attachments remain in their normal transport and session storage. Attaching an unsupported modality after a switch pauses with an explanation; it does not silently drop the reference or switch back.

Role identity and mode are frozen in configured sessions. A changed configuration requires restoring the original role configuration or starting a new run. Relay browser calls also carry a profile revision, rejecting a profile changed between policy loading and request dispatch. VS Code's direct role IDs hash endpoint, transport, model and declared input support. An existing external relay profile can still change independently of a VS Code local role; manage that external profile consistently. Native SDK hosts must give each model configuration a stable versioned ID and change it when the actual configuration changes.

<a id="model-handoff-javascript-integration"></a>

### JavaScript integration

The provider-independent module is `javascript/handoff.js`, also available as `SuiteAgentHandoff` in browsers. Its `route` method wraps a host planning callback:

```js
const H = require('./codingagentlib/javascript/handoff.js');
const reply = await H.route(request, {
  policy: {
    mode: 'shadow',
    primary: { id: 'primary-v1', modalities: ['text'] },
    continuation: { id: 'efficient-v1', modalities: ['text'] }
  },
  model: (request, role, signal) => clients[role?.id || 'primary-v1'](request, signal),
  detect: (probe, role, signal) => readinessClient(probe, signal),
  record: value => runtime.dispatch({op:'handoff_event',session:request.sessionId,value}),
  current: () => runtime.dispatch({op:'session',session:request.sessionId}),
  signal,
  notify: event => console.log(event)
});
```

`detect` returns readiness JSON, never an agent action. It can integrate a future trained detector. Call the router before compressing history so evidence offsets refer to original events. Supply `current` to check that no new instructions or tool observations arrived during evaluation; the built-in browser, VS Code, Python and Rust integrations perform this check. It does not create an atomic filesystem snapshot. Do not send a full JSON request to a provider endpoint directly: use the existing transport adapter and preserve native media parts. The VS Code build bundles the canonical module into the extension; it needs no suite server or Python.

<a id="model-handoff-python-integration"></a>

### Python integration

```python
from codingagentlib import Agent, ModelHandoff

handoff = ModelHandoff(
    efficient_model,
    detector=readiness_model,
    mode='shadow',
    primary_id='primary-v1',
    continuation_id='efficient-v1',
    continuation_modalities=('text', 'image'),
)
with Agent('/path/to/workspace', ['python3']) as agent:
    result = agent.run('Implement and verify the feature', primary_model,
                       handoff=handoff, allow_edits=True, allow_commands=True)
    # On a later process, reconstruct the same policy and callbacks:
    # agent.run(original_goal, primary_model, session_id=saved_id, handoff=handoff)
```

Callbacks receive structured requests. The readiness callback receives `purpose: handoff-readiness`, instructions and evidence; return an object such as:

```json
{
  "ready": true,
  "reason": "Implementation has been exercised; one targeted repair remains.",
  "artifactCallId": "exact-artifact-call-id",
  "feedbackCallId": "exact-command-call-id",
  "remainingWork": [{"task": "Fix the reproduced boundary case", "kind": "repair"}]
}
```

When `detector` is omitted, the primary callback must handle the distinct readiness request purpose. It must not treat that request as a normal planning turn.

<a id="model-handoff-native-rust-integration"></a>

### Native Rust integration

```rust,ignore
use codingagentlib::{Agent, ModelHandoff, RunOptions};
use serde_json::json;

let handoff = ModelHandoff::new(
    "shadow",
    json!({"id":"primary-v1", "modalities":["text"]}),
    json!({"id":"efficient-v1", "modalities":["text"]}),
    None,
)?;
let mut agent = Agent::new(workspace, &["git", "sh"])?;
let result = agent.run_with_handoff(goal, &RunOptions { allow_edits: true, allow_commands: true, ..Default::default() }, &handoff,
    |role, request| match role {
        "primary" => primary_client(request),
        "continuation" => efficient_client(request),
        "detector" => readiness_client(request),
        _ => unreachable!(),
    })?;
// agent.resume_with_handoff(session_id, "", 500, &handoff, same_role_callback)?;
```

Rust implements the policy natively; no Python or JavaScript runtime is required. Host callbacks supply networking, credentials and model selection. `None` for the detector identity means the host should use its primary provider for a separate readiness call, or a compatible custom evaluator. Use the same versioned identities and configuration on resume.

<a id="model-handoff-evaluate-before-automatic-rollout"></a>

### Evaluate before automatic rollout

The existing held-out evaluation harness accepts:

```sh
node evaluations/coding-agent/run.cjs --live --provider-config /private/providers.json \
  --handoff-mode shadow --report shadow.json
```

Compare `off` (configured primary only), `continuation` (efficient only), `shadow`, and `auto` on the same cases and repeat count. Reports include task success, duration, planning/model/tool call counts, saved handoff decisions and per-call purpose/model/usage where reported. Detector calls count toward the request budget. `costUsd` remains null: no price is guessed and local inference is not assumed free. Usage coverage depends on the upstream provider; character counts are not billed tokens. Review requests are separate from planning. No live-provider evaluations are run automatically.

Tests use controlled model responses, real local runtimes, held-out checks and browser workflows. They establish integration behavior, not model accuracy or savings. Keep shadow mode until your selected model pair meets your own success-rate and cost criteria. Training a lightweight detector is a later experiment requiring representative trajectories and held-out repositories; no trained detector or benchmark performance is claimed here.


---

<a id="model-collaboration"></a>

## Optional multi-model coding-agent collaboration

Restart the suite server after updating the code, then open **AI provider settings → Multi-model coding-agent collaboration**. Create saved provider profiles first (different models can use the same provider), then assign each participating profile **Solver** or **Critic**. The active provider coordinates the result; when one-way handoff is enabled, its current primary/continuation model remains the coordinator.

- **Off** is the default and makes no peer calls.
- **Adaptive** consults peers for initial planning, newly observed failures, pending verification, response recovery and every configured number of steps.
- **Every planning step** consults on each new planning turn.
- **Maximum peer calls per discussion** bounds additional calls, independently of provider token settings. Only distinct, compatible peers other than the current coordinator participate.

Start with one solver and one critic, a budget of two calls and a five-step interval. Solvers propose approaches; critics receive earlier replies and challenge assumptions, propose checks and state disagreements. The coordinator receives the discussion alongside the original task, schemas, permissions and observations, and returns the normal single-action response. On failure/verification checkpoints critics take priority; planning favors solvers. Compatible profiles rotate within each role to avoid using only the first configured member.

Review **Model collaboration** status and **Model discussion** receipts in the agent activity log. Expand a discussion to inspect each model's public recommendation, rationale, checks, risks, disagreements, unavailable providers and skipped modalities. The run log retains this metadata. Model agreement is advice, never proof of correctness: command/result checks, stale-file protection, dependency validation, independent review and project-takeover approval still apply.

<a id="model-collaboration-context-persistence-and-failure-behavior"></a>

### Context, persistence and failure behavior

Enabling collaboration shares the coding request and supported native references with the chosen providers. The existing context-compression policy applies and schemas remain available. Older discussion rounds are archived from the active compressed view; the latest advice and all original user references are preserved, and full rounds remain retrievable in runtime history. Advisers cannot execute tools, retrieve additional history themselves, grant permissions or apply proposals. They must report uncertainty about omitted context; the coordinator can retrieve actual files/history through the normal tools.

A run records `codingagentlib/model-collaboration/v1` policy and discussion events. Profile/model revisions are pinned. Changing the saved team configuration requires restoring it or starting a new run; provider revision errors stop rather than silently substituting a different model. Ordinary provider errors or invalid advisory replies are recorded and the coordinator continues with whatever valid feedback remains. There is no claim of consensus if peers fail.

Interrupted coordinator calls can reuse the persisted discussion for the same evidence/context checkpoint. A new reference, instruction, observation or app-context snapshot invalidates that reuse. Stop aborts in-flight calls. Changed server observations, user instructions or open-project content during discussion prevent takeover of stale advice. Metadata events do not consume the runtime's reserved planning turn or count as execution/verification evidence.

Settings are included in normal relay configuration import/export, with the existing key-inclusion controls. Example fragment (IDs must exist in `profiles`):

```json
{
  "agentCollaboration": {
    "mode": "adaptive",
    "members": [
      { "profileId": "coding-solver", "role": "solver" },
      { "profileId": "independent-critic", "role": "critic" }
    ],
    "maxConsultations": 2,
    "interval": 5
  }
}
```

Additional calls increase latency and provider usage. Choosing a model team is workload-specific; verification against real requirements determines whether a proposed solution works.

<a id="model-collaboration-javascript-host-integration"></a>

### JavaScript host integration

`javascript/collaboration.js` exports `SuiteAgentCollaboration` in browsers and CommonJS `policy`, `trigger`, `parse`, `boundary`, and `discuss` helpers. No provider SDK or credentials are built into the module.

```js
const { discuss } = require('./javascript/collaboration.js');
const enriched = await discuss(request, {
  policy: resolvedPolicy,             // stable profile revisions and input modalities
  coordinator: currentModel,
  consult: (probe, member, signal) => providerAdvisoryCall(probe, member, signal),
  record: value => runtime.dispatch({ op: 'collaboration_event', session: request.sessionId, value }),
  current: () => runtime.dispatch({ op: 'session', session: request.sessionId }),
  signal,
  notify: event => updateDiscussionStatus(event)
});
return coordinatorModel(enriched);   // normal schema validation and runtime follow
```

Hosts may supply `prepareRequest(request)` to prepare a read-only context view once per discussion. It runs only when peers will be called; disabled mode and cached rounds skip it. Each peer receives an independent deep copy of the prepared view, together with earlier feedback. The browser uses this hook to compress history and collect native references once, rather than repeating preparation for each peer. The full request remains available for modality checks and stale-context validation. This reduces local processing; provider latency and call budgets are unchanged.

`consult` returns advisory JSON with a required nonempty `recommendation` and optional `rationale`, `risks`, `checks`, `disagreements`. A reply containing an executable `action` is rejected. Treat every reply as untrusted reference data. Python and native Rust runtimes provide the `collaboration_event` persistence operation; the browser/JavaScript module owns the discussion orchestration.

<a id="model-collaboration-verification"></a>

### Verification

```sh
node --test codingagentlib/javascript/collaboration-test.cjs
python3 -m unittest server.collaboration_test server.handoff_test
node shared-agent/collaboration-browser-test.cjs
cargo test --locked --manifest-path codingagentlib/rust/Cargo.toml --test collaboration
```

The browser regression uses controlled provider replies with the real provider-settings UI, configuration persistence, context assembly, runtime planning and a real workspace file read. It makes no live-provider quality or cost claims.
