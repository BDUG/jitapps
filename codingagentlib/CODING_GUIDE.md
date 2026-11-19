# Coding with the SDK

Use the generic core for host tools without a workspace; use the coding adapters
for real source files. [SDK contracts and lifecycle](SDK.md) remain authoritative.
This guide covers project knowledge, reusable Python recipes, skills, targets,
and MCP transports. No provider, code or imported skill executes merely because
it was loaded.

## Standard coding cycle

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

## Automatic project ontology and graph

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

## Reusable Python tools

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

## MCP through JSON-RPC and shell transports

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

## rstiX workflow

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

## Optional model mosaic

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

## Graph retrieval and memory maintenance

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

## Graphical skill flows and embedded results

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

### Snapshot-safe project-memory stores

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

## Recovering command launch failures

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

### Command retries and changing checks

The browser loop and VS Code host count repeated terminal failures by tool and
arguments, independently of declarative result checks. Altering checks cannot
reset the three-failure pause. Exact action/result matching remains in place for
cycle detection and non-command tools. A changed command can be attempted;
successful matching retries, recorded edits and user follow-ups retain their
existing recovery-boundary behavior. This heuristic neither executes recovery
commands nor changes permissions or completion criteria.
