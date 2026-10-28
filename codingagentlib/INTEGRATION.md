# Embedding the agent in another application

JavaScript, Python and Rust export an optional `EmbeddedAgent` API for applications that own their tools, provider transport and UI. It has no dependency on a suite server or browser. JavaScript uses no Python worker in this mode. Rust remains native. Existing `Agent`, `Runtime`, `LocalRuntime` and browser-loop APIs are unchanged.

This is a small host-tool orchestration layer, not a replacement for the workspace runtime's guarded file tools, durable receipts, verification rules or recovery. It performs one registered tool call per model turn, publishes actual observations, supports questions/resume and bounds invalid-plan repairs. A `complete` result means the model ended the host conversation; hosts must enforce any domain-specific completion/verification requirements. Use the existing workspace `Agent` when those native coding safeguards are needed, or explicitly compose its tools as shown below.

## Shared integration points

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

## JavaScript / Node.js

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

## Python

```python
from codingagentlib import EmbeddedAgent
agent = EmbeddedAgent(context={'application':'my-app'}, on_event=print)
agent.add_tool('lookup', lambda args, ctx: {'id':args['id'], 'name':'Example'},
               description='Look up a record; args:{id:string}')
result = agent.run('Find example', my_model_transport)
```

Run `python3 -m codingagentlib.examples.embedded` from the repository root, or run `codingagentlib/examples/embedded.py` after installing the Python package. Only the base standard library is required.

## Rust

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

## Simple Rust UI

```sh
cargo run --manifest-path codingagentlib/rust/Cargo.toml --example ui -- /absolute/workspace
```

Open the loopback URL printed by the executable. This small Rust program serves a browser UI with a goal field, Run/Stop controls and live public plans/observations. Its registered tool delegates to the native Rust workspace runtime and lists actual files. It has no Python, JavaScript tool installation, GUI toolkit or paid-model dependency. The browser uses a small static script for rendering.

The example's `demo_model` is intentionally deterministic and labelled as such in the UI: it interprets only the demo commands `list`, `read <path>`, `search <text>` and `ask`; it does not generate/edit code. Replace that function with your provider transport to connect a real model. Extend `add_tool` to expose your own application capabilities, choosing permissions deliberately. The HTTP example binds to loopback, checks Host/Origin and a same-origin request header, and renders output as text. It is a local integration example, not a production web service or general remote API.

The composition pattern is explicit: start a read-only native workspace session, register a host callback that calls `native.dispatch({op:"tool", ...})`, check the native observation's `ok`, then forward its result. This retains native file permissions and hash checks for those operations. It does not automatically inherit native completion checks, session cancellation or packaging into the host loop: forward the corresponding native calls/handles when your integration needs them. The Rust UI source demonstrates the read-only case.

## Lifetime and security

- Only registered tools are advertised; there are no automatic filesystem/network/process capabilities.
- `edits` and `commands` tools require explicit per-run flags, disabled by default. These are host declarations: a callback falsely labelled `read` can still perform side effects with the host process's privileges.
- Context, events and tool results must be JSON-compatible. Never put API keys in context/events; keep credentials in the provider/tool transport.
- Snapshots are copies for inspection/export. This lightweight API does not automatically persist state or guarantee crash-safe exactly-once execution. Explicit trusted snapshot restore is described below. Existing native workspace agents provide separate durable session APIs. Reattach host callbacks each time an application starts.
- No built-in history compression or provider SDK is imposed. Hosts can compress/filter the model request in their callback while preserving original events and response identities. Do not infer full workspace-runtime feature parity from this small API.

Checks: `node codingagentlib/javascript/embedded-test.cjs`, `python3 -m unittest codingagentlib.test_embedded`, and `cargo test --manifest-path codingagentlib/rust/Cargo.toml`.

## Tool management, completion checks and session transfer

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

### Extended Rust UI example

The `ui` example now retains an embedded session between runs and offers:

- Actual file listing (with next-page preparation), reading and literal text search through native read-only tools.
- Questions (`ask`) and follow-up replies, plus a configurable 1–500 step budget and explicit Resume without replaying a completed tool just to continue.
- Current tool enable/disable controls that persist across new runs in this UI process.
- Public event search/type filters, run metrics and a completion gate requiring an observed successful tool.
- Snapshot JSON download and explicit local restore with edit/command permissions disabled. The full snapshot retains history; the UI displays at most the latest 200 events.

Start with the same command above. Click a listed file to prepare `read path`, then choose New run. For paged results, use Prepare next result page, or specify `read path @12000` / `search text @100` with the returned offset. Try `ask`, reply `search TODO`, or set the budget to 1 and resume after the first observed action. The model remains a clearly labelled deterministic demonstration, not a natural-language AI backend; replace `demo_model` for real provider use. The UI's current workspace stays fixed to its CLI directory even when importing another snapshot. The example HTTP request/snapshot budget is 8 MB, and the native text/paging limits still apply.

## Dynamic host integration framework

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

### Build an editor agent with reviewed takeover

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
