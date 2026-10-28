# codingagentlib

The suite's headless coding-agent components, reusable without the desktop, chat UI, relay or HTTP server. The original JavaScript planning loop and Python workspace runtime now live here. Provider/model transports are injected; the library never selects a paid model or starts an AI request on its own.

| Interface | Entry point | Runtime requirements |
| --- | --- | --- |
| JavaScript core | `javascript/index.js` or individual browser scripts | Node.js 18+; or browser globals with injected transport callbacks. |
| JavaScript local agent | `javascript/local.js` / `LocalRuntime` export | Node.js plus the installed Python package. Uses the original JavaScript ReAct loop. |
| Native Python API | `from codingagentlib import Agent, Runtime` | Python 3.10+, standard library for base features. No Node or web server required. |
| Native Rust API | `rust/` crate, `codingagentlib::Agent` | Rust/Cargo to build; the compiled library requires no Python, Node, worker or web server. |
| JSON-lines worker | `python3 -m codingagentlib --workspace PATH` | Python only. Protocol documented below; no listening TCP ports. |

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
