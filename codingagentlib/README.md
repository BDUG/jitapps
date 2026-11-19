# codingagentlib

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

The versioned generic `createAgent` / `create_agent` core supports registered host tools, policy, context, pluggable sessions, budgets, replay, streaming, MCP transports and scoped delegation without requiring a coding workspace. [Contracts, lifecycle, optional packages and compatibility](SDK.md). Existing coding APIs remain available.

## Project knowledge, Python tools, skills and targets

The optional **model mosaic** routes planning, coding and review turns to host-configured models with one provider call per turn, pinned routes, a model-call budget and an inspectable route history. JavaScript `createModelMosaic`, Python `create_model_mosaic` and Rust `mosaic::ModelMosaic` work with generic SDK agents and coding callbacks. Browser agents expose the option beside runtime settings; load saved model profiles before selecting routes. Errors return to normal orchestration without a fallback model. [Deterministic JavaScript example](examples/model-mosaic.cjs) · [Python example](examples/model_mosaic.py).

Graph recall now follows bounded neighborhoods with explicit seeds, relation filters and direction. Python AST indexing adds qualified symbols, same-file inheritance and direct-call references; moving an unchanged Python declaration preserves its identity and annotations. Hosts can annotate entities, inspect change history and remove imported entities with revision guards. JavaScript's optional `@tlal/agent-memory` builds graphs from host-supplied source snapshots and supplies generic agent context providers. Python `ProjectKnowledge.context_provider` and Rust `graph_memory::ProjectGraphMemory`/`query` provide equivalent host integration. Imported annotations remain reference data.

The [graphical skill-flow editor](../shared-suite/skill-flow/README.md) supports sketch-style editing, dependency validation, pinned skill prerequisites, workflow JSON exchange and revision-safe saves from an agent session. Saving never runs a workflow. rstiX additionally scans one or multiple GitHub repositories at pinned commits, merges RST and exported needs, and preserves repository provenance. Both editors export static embeddable illustrations.

Coding sessions automatically derive project-local ontology/knowledge-graph references from bounded source inspection and include them in planning context. Graph and ontology can be exported separately or imported into a selected project with revision checks; they never grant permissions or count as verification. The browser agent and VS Code Project memory dialogs expose these operations. rstiX builds equivalent portable memory from its open RST document.

Parameterized managed Python scripts are the standard reusable coding approach when Python is approved. Successful scripts with a `codingagent-tool` header can populate a private, versioned recipe library without overwriting existing tools. Skills and named targets remain explicit, revision/hash-pinned data. Preparing a recipe never executes it; normal script/command permissions still apply. Libraries are project-independent and portable, with an optional configured shared SQLite path.

MCP supports injected JSON-RPC bridges and literal-argv shell/stdio transports in JavaScript, Python and Rust. The bundled `python3 -m codingagentlib.rpc --workspace PATH` service is read-only by default; writes and programs require explicit flags and the normal runtime guards. [Coding guide and working examples](CODING_GUIDE.md) · [rstiX app](../rstiX/README.md).

## Dynamic integrations

JavaScript, Python and native Rust support named, revisioned `ContextRegistry` sources, context refresh before every model turn, dynamic tool discovery/revocation, progress events and exact-turn context in host tool callbacks. A reviewed editor integration example shows how to stage proposals and reject stale projects. See the [integration framework guide](INTEGRATION.md#dynamic-host-integration-framework).

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

JavaScript, Python and Rust now export `EmbeddedAgent` for registering application tools and injecting model callbacks, public progress events, approval hooks, context and cancellation. Questions and follow-up resumes share the same JSON protocol. See [cross-language integration examples and contracts](INTEGRATION.md), including a small [Rust browser UI](rust/examples/ui.rs) using actual native workspace tools.

The JavaScript planning core exposes `loop.failureRecovery(events)` for structured, observation-based recovery guidance. The suite shows it in a foldable panel, offers an unsent follow-up draft and exports a linked JSON report. See the [agent recovery guide](../shared-agent/README.md#evidence-based-failure-recovery).
Optional progressive tool discovery reduces current-turn definitions in the JavaScript loop/LocalRuntime, with audited read-only lookup in the Python runtime. It does not enable tools or change permissions. See the [integration guide](INTEGRATION.md#progressive-tool-definitions).


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

[Evidence-driven model handoff](MODEL_HANDOFF.md) adds shadow evaluation and an opt-in one-time primary-to-efficient switch, configurable in the relay and VS Code and available through JavaScript, Python and native Rust APIs. Saved role state survives resume; existing permissions and verification gates still apply.

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
