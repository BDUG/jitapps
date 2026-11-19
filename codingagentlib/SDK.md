# Portable SDK v1

The SDK separates **generic orchestration** from **coding execution**. Its generic
core has no workspace, shell, provider or UI requirement. Registering a tool is a
host trust decision: a `read` label does not sandbox its callback. Coding adapters
retain the established guarded file edits, hashes, recovery, command allowlists,
source-bound verification and change inspection. Neither layer is an OS sandbox.

## Stable contracts and generation

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

## Create a generic agent

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

## Lifecycle, storage and uncertainty

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

## Optional extensions

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
  MCP SDK owns authentication and remote transport. Optional JSON-RPC/stdio adapters handle initialization; the explicit `codingagentlib.rpc` stdio service and its permissions are described in [the Coding Guide](CODING_GUIDE.md).
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

## Coding adapters, packages and compatibility

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

## Deterministic capability ladder and checks

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
[Coding Guide](CODING_GUIDE.md#optional-model-mosaic). Mosaic adapters are
available in JavaScript, Python and Rust. Graph/ontology JSON retains version 1;
new query/annotation operations do not change the frozen core protocol. The
optional JavaScript `@tlal/agent-memory` package has no filesystem dependency.
