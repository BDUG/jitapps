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

Navigation reads up to 400 supported source files, 256 KiB per file and 8 MB total. Dependency/vendor/build/private paths are excluded. Query paths are prioritized, and coverage reports disclose skipped files. Source hashes identify the analyzed bytes; read current source before editing and retain normal stale-write guards. Configure a focused workspace or narrow the path when coverage is incomplete.

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
