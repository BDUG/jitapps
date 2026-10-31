# Coding-agent techniques: implementation and remaining gaps

The agent already provides a ReAct loop, tools, persistent sessions, context compression, paging, vector working memory, reusable skills/workflows, verification checks, and reviewed app updates. This table preserves the original gap assessment and records the implementation status.

| Technique | Original gap | Status and practical limits |
| --- | --- | --- |
| **Isolated execution** | Commands use the server account's OS permissions; no per-run sandbox. | Still open. Use OS/container isolation for untrusted work. |
| **Git-backed checkpoints** | File backups and app Undo exist; no automatic branch/worktree lifecycle or project-wide rollback. | Still open. Review freshness checkpoints below are not Git checkpoints or rollback. |
| **Semantic code navigation** | File reads/text search without language-server symbols, references or diagnostics. | Implemented: TypeScript compiler bindings for JS/TS; Python AST symbols, lexical scopes and explicit workspace imports. Bounded snapshots and analysis limits are reported. |
| **Semantic embeddings** | Hashed lexical features rather than a learned embedding model. | Implemented: optional local quantized MiniLM ONNX sentence embeddings, model-specific SQLite vectors and legacy reindexing. Unconfigured/unavailable semantic retrieval is explicitly labelled lexical fallback. |
| **Independent review** | The planner evaluates its own work; no dedicated reviewer stage. | Implemented: optional fresh-context, tool-free reviewer before complete, concrete findings, bounded revision loops, persisted verdicts and runtime freshness checks. Uses the active provider; a separate context is not an independently trained model or proof of correctness. |
| **Dependency-aware planning** | Checklist without explicit prerequisites. | Implemented: `dependsOn` task DAGs, cycle/reference validation, readiness, one active task, action-to-task binding and runtime enforcement. Task status remains a planner claim, separate from verification evidence. |
| **Parallel workers** | No managed isolated workers, conflict detection or coordinated merging. | Still open. Multiple sessions are not isolated parallel workers. |
| **Automatic test selection** | Model-selected commands/configured acceptance rules rather than dependency-aware test selection. | Still open. Navigation and review help inspection; they do not discover a complete regression suite automatically. |
| **Run-level budgets** | Step pauses/timeouts without comprehensive interactive cost/token/resource budgets. | Still open for interactive runs. The evaluation runner has its own step, request and time budgets. |
| **Real-model evaluations** | Mocked regression tests without a maintained live coding benchmark. | Implemented: opt-in provider-backed runner, three versioned cases, held-out executable checks, immutable-test checks, isolated temporary directories, repeats and baseline comparisons. Temporary directories are not an OS sandbox. Replay self-tests are labelled separately from live scores. |

## Semantic code navigation

Python navigation retains one analyzed snapshot for repeated queries. Every request still reads and hashes the current source files; changes to file content or membership rebuild the index. JavaScript-only requests skip Python indexing. Search retains only the requested result page while preserving the exact total and scan order.

Python AST navigation is available without additional packages. Enable JS/TS compiler navigation from the repository root:

```sh
npm ci --ignore-scripts --prefix server/code-navigation
python3 server/server.py --agent-workspace /path/to/project
```

The model receives four read-only tools:

| Tool | Inputs | Result |
| --- | --- | --- |
| `code_symbols` | Optional relative path and name fragment, cursor/limit | Definitions with names, kinds, positions and source hashes. |
| `code_definition` | Relative source path, one-based line/column | Workspace definitions for the selected binding. |
| `code_references` | Relative source path, one-based line/column | References to that binding, distinguishing shadowed names. |
| `code_diagnostics` | Relative source path | JS/TS compiler diagnostics or Python syntax diagnostics. |

The service and executable compiler files are pinned by hash at runtime startup and excluded from agent file tools; changed helpers require a reviewed update and server restart. NODE_OPTIONS/NODE_PATH injection is disabled for the analysis subprocess. These checks preserve the distinction between read-only analysis and command execution; they are not an OS sandbox.

The TypeScript service analyzes supplied source snapshots and trusted compiler libraries; it does not load or execute workspace modules. It uses ES2022/CommonJS/checkJs defaults, not a project's complete tsconfig, installed third-party types or build pipeline. Python analysis resolves lexical scopes and explicit imports, not dynamic attributes, wildcard imports, global/nonlocal rebinding, runtime types or full type checking. Unsupported resolution returns no match rather than executing the code.

For an external trusted installation, use `--agent-navigation-dir /path/to/server/code-navigation` or `SUITE_AGENT_NAVIGATION_DIR`. A desktop sidecar build bundles the helper and installed TypeScript libraries when present at build time; Node.js is still required on the host.

Navigation reads up to 400 supported source files, 1 MB (1,000,000 bytes) per file and 8 MB total. Dependency/vendor/build/private paths are excluded. Query paths are prioritized, and coverage reports disclose skipped files. Source hashes identify the analyzed bytes; read current source before editing and retain normal stale-write guards. Configure a focused workspace or narrow the path when coverage is incomplete.

## Learned semantic memory

Install the optional CPU inference packages and explicitly prepare the pinned model:

```sh
python3 -m venv .venv
.venv/bin/pip install -r server/requirements-agent.txt
.venv/bin/python scripts/prepare-agent-embeddings.py --output server/models/minilm
.venv/bin/python server/server.py \
  --agent-workspace /path/to/project \
  --agent-embedding-dir server/models/minilm
```

Use the equivalent Scripts paths on Windows. `SUITE_AGENT_EMBEDDING_DIR` is the equivalent environment selector for desktop launches; optional ONNX dependencies must be included when building the sidecar. The downloader fetches **Xenova/all-MiniLM-L6-v2**, revision `751bff37182d3f1213fa05d7196b954e230abad9`, and verifies pinned model/tokenizer SHA-256 values. The model is Apache-2.0 licensed; see its [source model](https://huggingface.co/Xenova/all-MiniLM-L6-v2). Downloaded weights are not committed. The server never downloads a model automatically, and inference makes no network requests.

Learned vectors have 384 dimensions and use attention-masked mean pooling with normalization. The model window is 256 tokens per chunk; stored note/source text remains complete and can be read in pages. Vectors are keyed by the model and tokenizer identities, preventing comparisons across incompatible models. New memory is indexed on store; search incrementally indexes up to 32 missing legacy chunks and reports remaining coverage. Use `memory_reindex` until `done:true` for a full migration.

`memory_search` reports its actual model, semantic flag, dimensions and indexing state. If inference fails, the response explicitly includes `semanticError` and uses lexical retrieval. Without `--agent-embedding-dir`, existing hashed lexical retrieval remains available and is not described as semantic. The default avoids an implicit model download or an undeclared inference dependency. Inspect the runtime details for the current mode.

These embeddings currently enhance session working memory and automatically retained tool observations. Local skills and the shared catalog retain their existing retrieval implementations; they are not silently relabelled as learned embeddings.

## Independent completion review

Enable **Independent model review before completion** under **Agent tools → Run setup** before starting a run. It is off by default and saved per app, because it adds model calls. The choice is retained in the session; changing UI preferences does not remove a saved run's completion requirement.

After ordinary completion guards pass, a separate reviewer request receives the original goal and follow-ups, candidate completion, task plan, actual changed-file text and available recovery originals, managed script source, command results/checks, recent inspection results, and optional app context. File/script text is assembled in pages. Unavailable originals, binary data, limited inspections and command-output previews are labelled in the coverage information. The reviewer has no tools and does not receive the planner's conversation as its own assistant history.

The reviewer returns `approve` or `revise` with structured findings. Error findings cannot accompany approval. Revisions return to the planner with the findings; after three rejected completion attempts the run asks for user guidance. Invalid reviewer formats receive one repair attempt. Reviewer suggestions are feedback, not executable tool calls or additional permission.

The runtime binds approval to the current workspace manifest, scripts, observations, user instructions, task states, app-context snapshot and proposed completion. Later changes make it stale. A `complete` finish is rejected without a current matching approval when the run requires review. Partial/blocked outcomes can still describe unresolved work honestly. Verdicts are retained in the audit log and result package's session record.

App takeover review and independent model review are different: takeover review asks the user before a browser-project edit; independent review critiques completion after work may already have changed real files. Neither rolls back command side effects. The active provider may supply both planner and reviewer, so this is role/context separation, not guaranteed independent judgment. Live-provider quality remains something to evaluate.

## Dependency-aware task plans

For a multi-step task, the planner can return:

```json
[
  {"id":"inspect","title":"Inspect source","status":"in_progress","dependsOn":[]},
  {"id":"implement","title":"Implement change","status":"pending","dependsOn":["inspect"]},
  {"id":"verify","title":"Verify behavior","status":"pending","dependsOn":["implement"]}
]
```

Both browser and runtime reject unknown/self dependencies, duplicate edges, cycles, multiple active tasks, and tasks marked active/done before prerequisites are done. The model request includes `planning.ready` and `planning.waiting`; the checklist shows dependency labels. When a plan contains dependencies, each action must supply `action.taskId` for the ready `in_progress` task. Workflow child calls inherit their parent execution's task context rather than creating additional planning tasks.

Legacy checklists without dependencies remain supported. The planner can revise a graph after new evidence, but must keep the revised graph valid. A dependency reaching `done` is not proof that a source change or test succeeded; tool evidence, acceptance checks and independent review remain separate.

## Provider-backed evaluations

See the [live evaluation guide](../evaluations/coding-agent/README.md). It explains explicit opt-in, setup, cases, held-out checks, budgets, reports, baseline comparisons and the difference between fixture replay and actual model scores.

## Completion evidence

Acceptance rules inspect the latest matching recorded result, searching history backward and stopping at the first match. A failed declarative action check remains unresolved until a checked rerun of the same tool with the same arguments passes; unrelated successes and unchecked reruns cannot clear it. The browser loop and server completion gate use the same policy, including restored sessions. Partial/blocked outcomes remain available for unresolved limitations. Result packages expose unresolved checks separately from the last individual check result. Browser project edits also invalidate earlier command verification when command verification is enabled. These guards do not establish that the chosen checks adequately test every user requirement.

Local lexical memory retrieval evaluates only nonzero query-vector dimensions and retains the best cursor-plus-page candidates. It still scans current session/collection vectors and reports the exact positive-match count, scores and deterministic ordering. No approximate index or stale result cache is introduced.

Command previews include per-stream `stdoutNextOffset` / `stderrNextOffset` byte cursors at complete UTF-8 boundaries. The working brief suggests missing log pages for successful commands with truncated output as well as failed commands. These are read-only suggestions; commands are never replayed automatically to recover output.

File/script page reads decode UTF-8 and compute SHA-256 from the same binary stream. This avoids a second file scan and ties returned text, byte counts and hashes to the bytes actually read. A subsequent write still checks the current file hash; the stream is not a filesystem transaction.

Compressed context retains the action arguments associated with selected observations, including browser-only assistant-action histories. Failed reads do not displace the latest successful full retrieval. The retained tool window follows last-use order, while original events remain unchanged and retrievable through history references.

Archived-context paging reuses one decoded snapshot per runtime (up to 8,000,000 source bytes) and up to four rendered pointer selections, bounded to 8,000,000 characters in total. Every read still loads and hashes the current archive bytes before using the cache; missing files, changed bytes and another session's unavailable snapshot remain errors. Parsing uses those same verified bytes. Commit also hashes and persists the validated bytes rather than reopening an upload for its hash. Runtime shutdown clears the cache. A local synthetic roughly 1 MB archive benchmark measured repeated string pages about 6× faster and formatted root pages about 10× faster; this is a paging microbenchmark, not a live model quality score.

Acceptance evaluation binds each observation to the action arguments already recorded at that point in history. A later action with a reused ID cannot relabel earlier evidence. Browser-only runs can use their immediately pending assistant action when no explicit runtime action exists; an observation consumes that fallback, and the tool must match. Assistant proposals without a corresponding observation never satisfy a rule. Shared Python/JavaScript fixtures cover wrong targets, reused IDs, missing provenance and explicit-action precedence; an actual browser-only loop regression checks successful completion from the required artifact.

Command verification uses the latest recorded command attempt, including tool errors with no exit code. A failed launch after a passing check invalidates that earlier pass for completion after edits. Browser cycle assessment, the working brief, visible command evidence and the server completion gate follow this rule. Only an actual successful tool response with numeric exit code zero, without cancellation or timeout, verifies the latest edit. A subsequent successful rerun can restore verification; partial/blocked completion remains available. Regression coverage includes a real browser run and server restart persistence.


Learned-memory retrieval streams only document IDs, part IDs and model-specific vector bytes while scoring. It retains the exact cursor-plus-page best candidates, then retrieves text and metadata only for the requested page inside the same SQLite read transaction. Scores, deterministic ties, zero/negative results, matched counts, model/session/collection filtering and incremental indexing remain unchanged. Dimension failures retain the explicit lexical fallback.

A synthetic indexed workload of 5,000 chunks, 384 dimensions and an eight-result page measured median retrieval at 132 ms before and 68 ms after (about 1.9× faster). Peak Python allocations measured by tracemalloc fell from about 24.6 MB to 23.5 KB (99.9% reduction). This measures retrieval rather than embedding inference, model quality or complete agent latency. Dense-reference regression tests cover pagination, ties, negative scores, updates, deletes, partial legacy indexing and fallback.

Cycle detection keeps the latest 24 matched action/observation references before serializing their signatures and normalized results. Earlier payloads and histories cleared by a follow-up do not need serialization. The pairing scan still checks receipt IDs, child-call boundaries and duplicate observations on every invocation; no history cache or relaxed guard is introduced. The main loop also evaluates a potential cycle once per proposed action instead of repeating the same scan when a cycle is found.

A synthetic guard benchmark with 1,024 tool observations, 32,000-character previews and an eight-action cycle measured median detection at 67.6 ms before and 1.72 ms after (about 39× faster). This is cycle-detection latency, not complete agent latency or model quality. Regression coverage retains eight-action cycles, actual progress, changed checks, delayed/duplicate receipts, follow-up resets, long Unicode history and parallel-read result normalization.


## Specification preparation

**Create specification** beside the goal opens a shared questionnaire and editable LLM draft. It works in the browser coding agent and the VS Code extension. Questions cover outcome/users, scope, constraints, acceptance criteria, proposed verification and unresolved decisions. Only the command and answers are sent to the configured provider; no project snapshot, files, attachments or agent tools are included. Preparing a spec does not start a run or execute terminal commands.

The bounded specification protocol requires unique requirement/task IDs, observable acceptance criteria and task/check coverage for every requirement. These are structural checks, not evidence of implementation correctness. The output retains the original input and answers independently of the model's reformulation. Unknowns and assumptions remain visible for review. **Use specification** explicitly replaces the unchanged command field with the edited draft; the normal run/permission controls still apply. Changing answers invalidates a prior result. Closing cancels generation; invalid or incomplete output leaves the command intact. The browser uses its existing relay and a 60-second request timeout; VS Code uses its configured primary provider and stored key with one request and a bounded timeout. No worker/runtime is needed for specification preparation. Standard provider charges apply.

Core and questionnaire UI are shared from `codingagentlib/vscode/media/specification*.js`, allowing the packaged extension to use the same protocol without a suite server. Input/output bounds protect the draft UI; source field limits still apply when replacing the command.

### VS Code history preparation overhead

The VS Code controller's compacted history path copies only selected events instead of copying and then discarding the full audit. Request-scoped event serialization is reused during budget selection and retained-event cloning. The edit/command/failure ledger scans backwards to find the latest evidence. Full native history, exact retrieval offsets, pinned constraints/reference snapshots and over-budget disclosures remain unchanged. A 1,001-event synthetic benchmark measured about 2.1× faster preparation; inference and tool latency are outside that measurement. See the extension README for the reproducible baseline comparison.

### Browser context packing overhead

Browser model turns now index the audit once per `pack()` call. The initial and tighter context views reuse that index for action/receipt pairing, latest successful retrieval, file hashes, workflow states and pinned history. No index persists between calls, so new edits and workflow updates are reflected on the next turn. When the latest retained retrieval text alone is larger than the fallback threshold, packing goes directly to the existing tighter view; JSON escaping can only increase that lower bound. The full retrieved result remains intact, even when it exceeds the soft target.

A synthetic 10,001-event history measured median packing time of 11.2 ms before and 7.7 ms after (about 1.46× faster). This measures context packing, not inference, network or tool execution. The reproducible benchmark compares payloads and metrics across 600 mode/snapshot cases:

```sh
git show 6c304d6:codingagentlib/javascript/context.js > /tmp/context-baseline.cjs
node --expose-gc scripts/benchmark-agent-context.cjs /tmp/context-baseline.cjs
```

The full audit, compression presets, source retrieval pointers, latest evidence, user constraints and Off mode retain their existing behavior. Large retained evidence is still reported as over target; the optimization does not silently truncate it.

### Attachment-heavy planning turns

Coding-agent reference preparation no longer constructs JSON deduplication keys containing full attachment bodies for ordinary native references. Exact per-call tuple lookups preserve content/media/caption/detail identity, first occurrence order and unique output names. Legacy field shapes retain their former JSON equality. Media descriptor numbering is linear in the number of attachments. Full text and inline media remain available through the same provider and context paths; this changes preparation overhead, not the amount of evidence delivered. See the shared AI README and `scripts/benchmark-agent-attachments.cjs` for scope and reproducible stress measurements.

### Progress evidence aggregation

Command-evidence reporting now counts outcomes in one pass and materializes only the latest command receipt. It no longer builds full intermediate command/failure arrays or filters those arrays again. Failed tool invocations with an apparent zero exit remain failures; unknown exits, timeouts, cancellations and edits after the latest command retain their existing classifications. Counters summarize observed receipts and do not certify that task requirements were tested.

A synthetic 50,000-event audit measured median evidence aggregation at 6.6 ms before and 2.9 ms after (about 2.3× faster). This is summary overhead, not total model/run latency. The benchmark checks 800 evidence/display-summary comparisons. Reproduce from the repository root:

```sh
git show 6c304d6:codingagentlib/javascript/loop.js > /tmp/loop-baseline.cjs
node --expose-gc scripts/benchmark-agent-evidence.cjs /tmp/loop-baseline.cjs
```

### Demand-driven receipt formatting

The browser activity log now defers action/observation JSON formatting as well as receipt DOM rendering. Collapsed receipts retain a per-row formatter; opening a receipt or searching/filtering its full payload formats that text once and reuses it. Normal unfiltered log updates do not format hidden payloads. Full audit data, exact text search, failed-receipt classification and transcript exports retain their existing paths. This reduces display work without changing the model context or tool execution.

The browser regression loads 100 large receipts and verifies zero receipt-formatting calls on initial display, one after inspecting the first receipt, and exactly 100 after searching all receipts. Repeated inspection/search reuses those results. Text remains literal, including HTML-like source, and the test executes no agent actions. This measures avoided formatting operations rather than end-to-end model latency.
