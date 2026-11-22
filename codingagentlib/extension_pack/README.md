# Coding Agent Extension Pack 1.2

An opt-in **Python host adapter** implementing [EXT-SPEC](../../specs/EXT-SPEC.md).
It uses `CoreAgent`'s public policy, tool-callback, context-provider, event-observer
and `SessionStore` contracts. It does not implement another agent loop, provider
transport, authentication system, tool dispatcher or MCP/A2A wire protocol.
Python 3.10+, Git and POSIX file locks are required for the durable host. Docker
is optional for code-action/browser gates. No library import starts a provider,
subagent, container or network request. JavaScript/Rust hosts retain their existing
APIs; this module does not imply extension-pack parity in those languages.

Runnable demonstration: `PYTHONPATH=. python3 codingagentlib/examples/extension_pack_demo.py`
(reads a real temporary Git repository through MCP, pauses at a gate, runs an actual
check and resumes; no credentials required).

## Quick start

```python
from codingagentlib import create_agent
from codingagentlib.extension_pack import ExtensionPack

# Keep durable state OUTSIDE the source tree being verified (private 0700 directory).
pack = ExtensionPack('/absolute/repository', '/private/job-state', interactive=False)
try:
    options = pack.core_options(dict(model=my_host_model_callback, tools=my_host_tools))
    agent = create_agent(**options)
    result = agent.run('Implement the accepted specification', allow_edits=True)
    # The host owns display, approvals, check execution and resume.
finally:
    pack.close()
```

With no explicit gate configuration, completion requires deterministic tests,
SAST, dependency/IaC/secrets checks and Reviewer/SecurityAuditor receipts. Changed
frontend files additionally require a browser E2E receipt. No scanner result is
invented: the host must run each configured check through
`pack.verification.run(session_id, layer, name, runner)`, where `runner` invokes
an actual trusted host tool/check and returns `{'ok': True}` only on success.
`verification={}` explicitly disables extension verification gates, preserving
normal host completion policy. Native host edit/command permissions always apply.
A tool's permission annotation is supplied by the trusted host, not by model args.

`core_options` keeps user tools, policies, context providers and event callbacks.
User policy denial remains denial. A supplied session store is preserved with a
warning that extension checkpoint durability is unavailable; omit it to use the
pack's crash-recoverable store. `enabled=False` leaves options untouched and
creates no state. The host owns model streaming and credentials.

## Files and configuration

Version-controlled `.extension/policy.json` and `.extension/verification.json`
override bundled policy and default gate names. JSON files are data, never executed.
Untracked policy files are rejected. Explicit constructor options take precedence.
The policy keys are `denyTools`, `shellTools`, `completionTools`, `allowWrites`,
`approvalAllowlist`, and `destructivePatterns` (regular expressions). Destructive
shell patterns are denied even after approval. Unknown write tools require approval.

Personas live in `agents/{planner,implementer,reviewer,security_auditor}.md`.
Repository `.agents/agents/*.md` / `.extension/agents/*.md` replace matching bundled
personas; explicit user `customAgents` entries have highest precedence.
Repository `.agents/skills/*/SKILL.md` / `.extension/skills/*/SKILL.md` are discovered
without a search index. Only matching metadata is preloaded, full skill text is
loaded explicitly, and `disabled_skills` suppresses both paths. Instructions and
learnings are reference data, not executable programs.

`pack.apply(config, supported_surfaces=...)` also supports hosts that explicitly
document SessionConfig-style surfaces: `customAgents`, `skillDirectories`, `hooks`,
`mcpServers`, `a2aBridges`, `durability`, `worktreePolicy`, `modelRouter`. Missing
optional surfaces produce warnings and are omitted. It never monkey-patches a
host. User named entries win; hook lists retain user hooks. Such hosts must honor
all pre-tool hook denials and normalize tool permissions. The actual codingagentlib
host uses `core_options`, not an invented native SessionConfig API.

## Durability, approvals and replay

`CheckpointStore` implements the existing `SessionStore` interface. Each safe save
and its checkpoint commit in one SQLite transaction. Pending/uncertain tool calls
are not replay checkpoints. Kernel file locks prevent concurrent workers and
release automatically after process death; stale database leases are reclaimed
only after acquiring that same OS lock. Checkpoint retention is configurable.
Do not put the database/lease directory in a shared/public directory or delete
lease files while workers are alive.

An approval-required action is denied before its callback, a structured
`ask-for-help` escalation is persisted, and the next model boundary asks the host
for input. Restart using the same state directory, obtain the pending action from
`pack.gateway.pending(session_id)`, and approve its exact `actionSignature` using
`approve_pending`. Then call the host's normal `agent.resume`. Approvals are
single-use and cannot authorize another action. Denied destructive commands do
not become approvable. In headless mode approval defaults to denial;
`headless_policy='allow_allowlisted'` permits only policy-listed tools. Interactive
hosts may supply an `approve` callback. No terminal prompt is required.

Inspect `pack.store.checkpoints(tenant, session_id)` and branch with
`pack.store.fork(tenant, session_id, checkpoint_id)`, then use normal host resume.
Earlier verified tool receipts remain; tools are not automatically replayed.
Branches share their parent's model-budget ledger. **Agent state rollback does
not undo arbitrary external side effects.** Restore the corresponding source or
artifact snapshot before replaying writes; never replay an uncertain call. Git
worktrees isolate source branches but are not snapshots of databases/services.

## Verification and governance

Receipts bind a check name/layer to its session and source digest. Failed checks,
source drift and another session's green results cannot authorize completion/PR
creation. `create_pr` / `complete_task` are default gated tool names, configurable
for the host. Terminal completion is gated by the public SDK completion policy.
Configure actual compile/typecheck/test/lint runners, frontend browser flows,
SAST/dependency/IaC/secrets scanners, Reviewer and SecurityAuditor host callbacks.
A missing tool/container/check is failed or unavailable evidence, never green.

Tool callbacks are wrapped only at registration. Outputs and error text are
redacted before the host stores them in model context or emits telemetry. Configure
literal `secrets` in addition to the built-in API-key/Bearer patterns. Repeated
callback exceptions with the same tool arguments escalate at `retry_threshold`,
even when diagnostics vary; a successful callback resets that operation's failure count; detected requirement conflicts
can call `gateway.escalate(session, 'conflicting_requirements', requirements=...)`.
A callback returning a failure-shaped value without raising is still a successful
SDK tool invocation; connect failed verification results to `gateway.on_error` if
that check also needs retry escalation. Its failed receipt still blocks completion.
Pending escalations stop further model calls until the host resolves them. Use
`resolve_escalation(session, resolution)` for reviewed conflicts/retry failures;
verification escalations can only be resolved after all current receipts are green.

Audit records are append-only through SQLite triggers and hash chained, including
policy decisions, checkpoint transitions, A2A operations and cost routes. Each is
an OpenTelemetry LogRecord with `extensionId`, `sessionId`, `checkpointId`.
`pack.audit.export()` returns OTLP Logs JSON. An optional asynchronous `exporter`
receives each record; local records remain durable if export is behind/fails.
Use a trusted remote/WORM sink for protection against a privileged local attacker
replacing the entire database; local hashes alone are not an external trust anchor.

## MCP and A2A

`DomainMCP(namespace, tools, authorize=..., audit=..., fields=..., max_bytes=...)`
uses the host SDK's MCP dispatcher. It prefixes tool names and filters/redacts
payloads **on the server**, before response serialization. Import through the
host's existing MCP client (`mcp_tools`), or supply `mcp_servers` entries containing
`transport` and explicit `trust` callbacks to the adapter. Client transport/auth
remain the host's responsibility. Do not use MCP to pretend an autonomous remote
agent is a static tool.

`TrustedA2A` accepts a registry of exact trusted `cardUrl` and `identity` pairs,
a host OAuth/Bearer `token_provider`, and a mandatory `verify_identity` callback.
It discovers live cards and delegates via the existing `A2AClient`, preserving task
send/get/cancel states. Card and endpoint origins must match. HTTPS is required
except loopback; credentials are refreshed per call and redirects are forbidden.
Identity verification must bind the configured peer to authenticated credentials;
merely supplying a nonempty token is not authentication. Provide this bridge via
`a2a_bridge`, separately from MCP registrations.

## Worktrees and local subagents

`Worktrees(repo, private_directory, mode='isolated_per_task')` creates owned
branches/worktrees with separate Git indexes. `shared_workspace` is an explicit
opt-in. The host still launches its own subagents. Feed host lifecycle events to
`pack.subagent_lifecycle`: `subagent.started` with `taskId` returns the workspace
for that host launch; `subagent.merged` / `subagent.aborted` remove only registered
owned trees. `session.recovered` reclaims crash-abandoned trees, while live owners'
OS locks prevent cleanup. Standard parent `subagent.*` telemetry is preserved.
Successful task branches remain until merge/abort. **Temporary task changes are
removed on abort/crash recovery**; save needed artifacts before that transition.
No extension code launches an agent, merges a PR or contacts another person.

## Model tiers, cost and memory

Configure `pack.set_routing(tiers={'fast': Tier(...), 'reasoning': Tier(...)},
token_cap=..., cost_cap_micro_usd=...)`. A tier contains the host model callback,
its `max_output_tokens`, and conservative integer micro-USD per-token prices.
Bind the tier's output limit to the host provider request. The default classifier
uses explicit host `taskMetadata.routine` in context to route bounded routine work
to `fast`; everything else uses `reasoning`. A host can supply its classifier.
There is no implicit paid model or fallback route. Without configured tier
pricing/output bounds the adapter warns and retains the vanilla host model;
token/monetary controls are unavailable until `set_routing` is configured.

The ledger reserves the **full** input plus maximum output and monetary upper
bound before calling the model. Reservations persist across restart and checkpoint
branches, warn near the limit and ask for help before exceeding it. Failed provider
calls retain their reservations. This conservative ceiling may stop before actual
billing reaches the limit. Exact provider tokenizer/prices/output enforcement are
host contracts; a callback lying about those cannot be secured by a wrapper.
Without an exact tokenizer the UTF-8 byte count is used as a conservative bound.

Combined extension start context (instructions, matching skill metadata and memory)
is capped at 4% of `context_window`; an exact tokenizer may be supplied to the
conventions context method. End-of-session summaries persist asynchronously and
are redacted reference data. `conventions.inspect(query, kind='text'|'symbols'|
'history')` works directly on Git-tracked files, Python ASTs or Git history in fresh
clones without an embedding/index bootstrap.

## Containers, browser and code actions

Build the supplied `sandbox-image/Dockerfile` with a reviewed base image, then
configure `Sandbox(image='<resulting sha256 image ID>')`. The adapter never pulls an
image silently. Runs are ephemeral, UID 65534, network `none`, capabilities dropped,
no-new-privileges, read-only root/source, bounded tmpfs, memory/CPU/PID/output and
wall-clock limits (including an in-container coreutils timeout that survives host
process death). Reviewed images must provide `/usr/bin/timeout`. Returned patches/artifacts are data; writes still go through
host tools/policy. Docker socket access is trusted host authority, never mounted
inside a sandbox. Missing Docker warns and leaves optional verification unmet.

`code_action(code, data, repository=...)` runs transformations in a single sandbox
turn. Expose this through a namespaced DomainMCP server. The deterministic acceptance
benchmark compares four sequential transformations with one consolidated code action
and checks equal outputs and model-call reduction of at least 25%.

`browser_smoke.py` verifies the actual two-view demo using Chromium/WebDriver
inside that same container boundary. It disables Chromium's nested sandbox because
setuid/user namespaces are unavailable under these container restrictions; it never
runs that configuration on the host. The enforced sandbox is Docker. Generic hosts
can supply their own browser command as a configured verification runner.

## UI, tests and evidence

Interactive event sinks receive an initial AG-UI `STATE_SNAPSHOT`, then
`STATE_DELTA` records and optional A2UI v0.8 `surfaceUpdate`/`beginRendering`
plan, diff and approval prompts. See the official [AG-UI state events](https://github.com/ag-ui-protocol/ag-ui/blob/main/docs/concepts/events.mdx) and [A2UI v0.8 protocol](https://github.com/a2ui-project/a2ui/blob/main/specification/v0_8/docs/a2ui_protocol.md). No UI payload is emitted with `interactive=False` or
`ui_mode='disabled'`; normal host callbacks still receive telemetry. This module
does not require a DOM, web server, terminal prompt or IDE.

```sh
python3 -m unittest codingagentlib.test_extension_pack -v
# Include real code-action and Chromium checks using a reviewed built image:
TLAL_EXTENSION_SANDBOX_IMAGE=sha256:YOUR_IMAGE_ID python3 -m unittest codingagentlib.test_extension_pack -v
```

See [acceptance evidence](../../specs/APPS-STATUS-REPORT.md) and the
[requirement map](../../specs/EXT-IMPLEMENTATION.md). Local tests establish the
specific recorded scenarios, not untested production cloud redeployments,
third-party host interoperability or external OAuth/provider billing correctness.

## Public entry points and defaults

Configure the pack and its optional collaborators before calling `core_options`;
that method returns construction options for a new host agent. Registering another
MCP server or calling `set_routing` afterwards does not reconfigure an already
constructed agent. The root `codingagentlib` package does not export these pack
classes; import them from `codingagentlib.extension_pack`.

| Public export | Purpose / key defaults |
| --- | --- |
| `ExtensionPack` | Adapter identity `tlal.extension-pack`, version `1.2.0`, compatible host range `>=0.1.0 <0.2.0`, protocol `codingagentlib/sdk-v1` |
| `CheckpointStore` | Private SQLite backend; retain 1000 safe checkpoints per session by default |
| `DomainMCP` | Namespaced MCP dispatcher; default filtered structured-result limit 16000 UTF-8 bytes; MCP envelope overhead is additional |
| `TrustedA2A` | Trusted card registry plus mandatory token-provider and identity-verifier callbacks |
| `Tier` | Host model callback and required `max_output_tokens`; default declared prices 0 micro-USD/token, suitable only when actually free |
| `Sandbox` | Required pinned image; defaults: 30 s, 256 MiB, 1 CPU, 256 PIDs, `docker` executable |
| `Worktrees` | Task Git isolation; default `isolated_per_task`, optional explicit `shared_workspace` |

| Adapter option | Default / behavior |
| --- | --- |
| `enabled` | `True`; `False` creates no extension state and passes configuration through |
| `enabled_agents` | All four bundled personas; repository/user definitions retain precedence |
| `verification` | Default named deterministic/security/agentic gates and a browser gate when frontend changes are detected at construction; `{}` explicitly disables extension gates |
| `rules` | Bundled policy or tracked repository policy; an explicit object **replaces**, rather than merges, those rules |
| `interactive`, `headless_policy` | `False`, `deny`; `allow_allowlisted` requires explicit policy entries |
| `retry_threshold`, `retention` | 3 repeated callback failures; 1000 retained safe checkpoints |
| `context_window`, `disabled_skills` | 32000 tokens, no disabled skills; combined extension context cap is 4% |
| `ui_mode`, `ui_sink` | `auto`, no sink; all UI payloads are suppressed headlessly |
| `mcp_servers` | Mapping of server IDs to `transport` and explicit `trust` callbacks, consumed by `core_options` |
| `a2a_bridge`, `worktrees` | Optional collaborators exposed to capable `apply` hosts; forward lifecycle/delegation explicitly in a CoreAgent host |
| `sandbox` | Stored collaborator; does not automatically register a code-action tool or run verification |
| `digest`, `exporter`, `secrets`, `approve` | Optional trusted source-digest, asynchronous OTel sink, literal redaction secrets and interactive approval callback |

`set_routing` requires tiers plus positive integer `token_cap` and nonnegative
integer `cost_cap_micro_usd`. Its warning ratio defaults to 0.8. The fallback input
tokenizer counts UTF-8 bytes. Routing is selected from host task metadata or an
explicit classifier; no model is selected/downloaded automatically.

### Host hook signatures

`hooks()` returns these normalized Python callables for an explicitly compatible
`apply` host. They are not added as new native CoreAgent constructor arguments:

| Hook | Arguments and result |
| --- | --- |
| `onPreToolUse` | `(action, state) -> bool`; `state.id` identifies the session and `action.permission` is trusted host metadata; absent permission is treated as `commands` |
| `onPostToolUse` | `(value) -> redacted_value` before persistence/model context |
| `onErrorOccurred` | `(session, tool, message, *, arguments=None)` records operation failures/escalation |
| `onSessionStart` | `(metadata='') -> bounded_context_string` |
| `onSessionEnd` | `(learning_text) -> Future`; `close()` waits for pending memory persistence |

Hosts must honor every pre-tool denial. For current codingagentlib use
`core_options`, which maps known tool permissions directly and composes user
policies with logical AND. Native session permissions are an additional guard.

### Common integration symptoms

| Symptom | Check |
| --- | --- |
| Completion keeps waiting | Inspect `gateway.pending(session)` and `verification.missing(session)`; successful checks must have the current source digest |
| Checks are now green but resume still asks for help | Resolve the `verification_required` escalation with `resolve_escalation`; passing checks alone does not acknowledge the persisted escalation |
| An approved edit remains denied | Ensure exact action signature, single-use approval, native edit/command flags and user policy all agree |
| No cost protection / routing warning | Configure priced/bounded tiers before `core_options`; the pack cannot infer provider billing or enforce an undeclared output ceiling |
| Private-state permission error | Use an owned 0700 state directory and 0600 database, outside source inputs; do not loosen permissions to bypass the guard |
| Sandbox unavailable | Supply Docker and a reviewed image already present locally; missing tools or failed containers do not produce green receipts |
| Expected personas or A2A calls did not run | They are host integrations, not automatically launched capabilities of `core_options` |

The pack ships in the full `codingagentlib` Python wheel, including its ordinary
persona, policy and skill files. It is not copied into the separately generated
`codingagentextensions` source package. The runnable example and test commands
above distinguish local verification from production service qualification.
