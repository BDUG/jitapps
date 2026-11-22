# TLAL OS Suite & Agentic Tools Overview

This document summarizes the TLAL OS local-first application suite and the agentic tools exposed by `codingagentlib` (Python, JavaScript/TypeScript, Native Rust, and the RabbitHole VS Code extension).

---

## 1. Suite Applications (`shared-suite/apps.js`)

| App | Category | Purpose |
| --- | --- | --- |
| `markiX` | Markdown & reStructuredText | Visual Markdown/RST authoring with source-preserving blocks and reviewed AI editing |
| `formiX` | Mathematics & formulas | LaTeX formula notebooks with live vector previews, SVG/LaTeX export, and AI proposals |
| `trackiX` | Issue & sprint tracking | Local epics, stories, bugs, sprints, and Kanban boards with reviewed AI triage |
| `cncfiX` | Cloud native & architecture | CNCF landscape diagrams with YAML/SVG export and reviewed AI proposals |
| `schematiX` | Schemas & knowledge | Schema derivation, ontology/knowledge-graph editing, and AI enrichment |
| `mergiX` | Compare & merge | File/folder comparison, three-way merge hunks, and semantic AI comparisons |
| `rstiX` | RST & requirements | Sphinx-Needs, RST documents, and dependency graph browsing/editing |
| `mockiX` | Wireframing & UI mockups | Component-based wireframes, user flows, and AI chat refinement |
| `shelliX` | AI shell | Workspace command execution, output inspection, and goal-oriented AI chat |
| `colabriX` | Collaborative whiteboard | Sticky notes, diagrams, frames, and local master-led collaboration |
| `designiX` | Graphic design | Multi-page posters, branded layouts, templates, and AI design assistance |
| `photiX` | Image editing | Whole-image or selection-based AI-guided effects and adjustments |
| `vidiX` | Video & motion | Video clip editing, layer animation, and GIF/SVG/video export |
| `architeX` | Architecture | System design, port connections, and model validation |
| `graphiX` | Vector graphics | Precision SVG artwork with shapes and layers |
| `textiX` | Documents | Document formatting and editing (DOCX, HTML, Markdown, text) |
| `sheetiX` | Spreadsheets | Data tables, formulas, and XLSX/CSV/TSV/JSON exchange |
| `codeiX` | Code & agents | Project editing with coding-agent loop and change review |
| `appiX` | App studio | Single-page app generation and editing |
| `automatextiX` | Automation | Visual step-based workflow builder |
| `reportiX` | Research & reports | Source research and cited visual report compilation |
| `presentiX` | Presentations | Slide deck creation and PPTX/JSON exchange |
| `sketchiX` | Diagrams & sketches | Freehand sketches, vector shapes, and diagram exchange (draw.io, SVG, PlantUML, PPTX, VSDX) |
| `mindiX` | Mind mapping | Branching mind maps and next-step planning |
| `projectiX` | Project planning | Gantt task scheduling, dependencies, and milestones |

---

## 2. Agentic Tools (`codingagentlib`)

### A. File Discovery, Reading & Search
| Tool | Permission | Detailed Description | SDK Availability |
| --- | --- | --- | --- |
| `list_files` | `read` | Recursively walks the workspace (skipping `.git`, `node_modules`, `.venv`, symlinks, and private state dirs). Accepts optional `path` (subdirectory), `cursor`/`offset`, and `limit` (1–500). Returns `{ files, nextCursor/nextOffset, total, done }`. | Python, JS (`LocalRuntime`), Rust |
| `find_files` | `read` | Glob-based file discovery (`pattern`, default `*`) within an optional `path` subdirectory, with `offset` and `limit` (1–1000). Matches against both relative paths and basenames when `pattern` has no `/`. | Python, JS (`LocalRuntime`), Rust |
| `read_file` | `read` | Reads a UTF-8 file in bounded character pages (`path`, `offset` default 0, `limit` default 12,000, max 64,000). Returns `{ text, hash, offset, nextOffset, done, totalCharacters }`; the SHA-256 `hash` is used for optimistic concurrency on edits. | Python, JS (`LocalRuntime`), Rust |
| `read_files` | `read` | Batch-reads 1–16 UTF-8 files (`files: [{ path, offset?, limit? }]` or `paths`) within a 64,000-character combined budget. Marks overflow entries as `skipped: true` with `truncated: true`. | Python, JS (`LocalRuntime`), Rust |
| `parallel_read` | `read` | Executes 1–8 independent read-only tool calls (`read_file`, `list_files`, `find_files`, `search`/`search_text`, `grep_search`) in one turn, returning per-item `{ ok, result/error }` receipts in request order. | Python, JS (`LocalRuntime`), Rust |
| `search` / `search_text` | `read` | Literal substring search across non-ignored workspace text files (`query`, optional `path`, `cursor`/`offset`, `limit`). Returns `{ path, line, excerpt/text }` matches. | Python (`search`), JS (`LocalRuntime`), Rust (`search_text`) |
| `grep_search` | `read` | Workspace text search with `query`, optional `path` subdirectory, `include` glob filter (e.g. `*.rs`), `caseSensitive` boolean (default `true`), `offset`, and `limit` (1–1000). | Python, JS (`LocalRuntime`), Rust |
| `read_image` | `read` | Reads a workspace image (`.png`, `.jpg`, `.jpeg`, `.webp`, `.gif` up to 8 MB) and returns `{ path, mimeType, bytes, sha256, dataUrl }` for multimodal inspection. | Python, JS (`LocalRuntime`), Rust |

### B. Code Navigation & Diagnostics
| Tool | Permission | Detailed Description | SDK Availability |
| --- | --- | --- | --- |
| `code_symbols` | `read` | Extracts symbol declarations (`fn`, `struct`, `enum`, `trait`, `impl`, `mod`, `class`, `interface`, `type`) from a file or workspace (`path`, `query`, `offset`/`cursor`, `limit`). Python uses AST/TypeScript bindings; Rust uses prefix scanning across `.rs/.py/.js/.ts/.cjs/.mjs/.tsx/.jsx/.go/.java`. | Python (AST/TS), JS (`LocalRuntime`), Rust |
| `code_definition` | `read` | Resolves the identifier at 1-based `(path, line, column)` to matching workspace symbol definitions (`{ path, kind, name, line, text }`). | Python (AST/TS), JS (`LocalRuntime`), Rust |
| `code_references` | `read` | Finds references to the symbol at 1-based `(path, line, column)` across workspace source files, returning `{ path, line, column, text }` locations. | Python (AST/TS), JS (`LocalRuntime`), Rust |
| `code_diagnostics` | `read` | Runs non-executing syntax/compiler diagnostics on `path` (`node --check` for JS/CJS/MJS, `python3 -m py_compile` for Python, and structural delimiter/string-literal checks in Rust; TS/AST diagnostics in Python). | Python, JS (`LocalRuntime`), Rust |

### C. File Editing & Recovery
| Tool | Permission | Detailed Description | SDK Availability |
| --- | --- | --- | --- |
| `write_file` | `edits` | Atomically creates or overwrites a UTF-8 file under 2 MB (`path`, `content`, `expectedHash`). Existing files require the current SHA-256; new files require `"missing"`. Records a session backup before writing. | Python, JS (`LocalRuntime`), Rust |
| `replace_text` | `edits` | Replaces an exact literal `find` string with `replacement` in `path`, guarded by `expectedHash` and an exact occurrence `count` (default 1). Rejects ambiguous or missing matches. | Python, JS (`LocalRuntime`), Rust |
| `apply_edits` | `edits` | Applies 1–32 non-overlapping `{ find, replacement, count? }` edits against the immutable original snapshot of `path` (`expectedHash` guarded). Rejects overlaps, wrong counts, or unknown preview flags before writing. | Python, JS (`LocalRuntime`), Rust |
| `apply_patch` | `edits` | Parses and applies Codex-style multi-file unified patches (`*** Begin Patch`, `*** Add File:`, `*** Update File:` with `@@` hunks, `*** Delete File:`, `*** End Patch`). Validates all paths and hunks before backing up and committing atomically. | Python, JS (`LocalRuntime`), Rust |
| `delete_file` | `edits` | Deletes a single regular file (`path`, `expectedHash` guarded) after saving a session recovery copy. Directories cannot be deleted. | Python, JS (`LocalRuntime`), Rust |
| `restore_file` | `edits` | Restores a file modified or deleted by file tools in the current session from its recorded backup (`path`, `expectedHash` guarded). | Python, JS (`LocalRuntime`), Rust |
| `changes` | `read` | Compares the current workspace file manifest against the session's initial manifest, reporting `added`, `modified`, and `deleted` paths (including command-side changes). | Python, JS (`LocalRuntime`), Rust |

### D. Git Inspection (Read-Only)
| Tool | Permission | Detailed Description | SDK Availability |
| --- | --- | --- | --- |
| `git_status` | `read` | Runs `git status --porcelain=v1 -b` in the workspace root and returns `{ branch, clean, total, entries: [{ status, path }] }`. | Python, JS (`LocalRuntime`), Rust |
| `git_diff` | `read` | Runs `git diff` with optional `staged: true` and `path` filter, returning character-paged diff output (`text`, `offset`, `nextOffset`, `done`, `staged`). | Python, JS (`LocalRuntime`), Rust |
| `git_log` | `read` | Runs `git log --oneline -n <limit>` (`limit` 1–200, default 20; optional `path` filter) and returns character-paged commit history. | Python, JS (`LocalRuntime`), Rust |

### E. Commands, Interactive Processes & Scripts
| Tool | Permission | Detailed Description | SDK Availability |
| --- | --- | --- | --- |
| `run_command` | `commands` | Executes an allowlisted executable with literal `args` array (no shell interpolation), relative `cwd`, optional `stdin`, and bounded `timeout`. Returns `{ jobId, exitCode, resolvedExecutable, stdout, stderr, stdoutSha256, stderrSha256, timedOut, cancelled }`. | Python, JS (`LocalRuntime`), Rust |
| `read_command_output` | `read` | Reads retained `stdout` or `stderr` logs for a `jobId` in character pages (`offset`, `limit`), allowing inspection of full output beyond inline previews. | Python, JS (`LocalRuntime`), Rust |
| `start_process` | `commands` | Spawns an allowlisted interactive child process (`command`, `args`, `cwd`) with piped `stdin`/`stdout`/`stderr` (max 16 concurrent) and returns `{ processId, command, resolvedExecutable }`. | Python, JS (`LocalRuntime`), Rust |
| `write_stdin` | `commands` | Writes `input` text and/or closes `stdin` (`eof: true`) on a running `processId`, waits up to `waitMs` (0–5000 ms, default 200 ms), and drains `{ running, exitCode, stdout, stderr }`. | Python, JS (`LocalRuntime`), Rust |
| `stop_process` | `commands` | Force-terminates an active interactive process by `processId` and cleans up its pipes, returning `{ processId, stopped: true, exitCode }`. | Python, JS (`LocalRuntime`), Rust |
| `list_scripts` | `read` | Lists session-private managed scripts stored outside the project source tree. | Python, JS (`LocalRuntime`), Rust |
| `read_script` | `read` | Reads a session-private managed script in character pages (`path`, `offset`, `limit`). | Python, JS (`LocalRuntime`), Rust |
| `write_script` | `edits` | Creates or updates a session-private managed script (`path`, `content` under 2 MB). | Python, JS (`LocalRuntime`), Rust |
| `delete_script` | `edits` | Deletes a session-private managed script by `path`. | Python, JS (`LocalRuntime`), Rust |
| `run_script` | `commands` | Executes a session-private managed script using an allowlisted interpreter (`command`, `args`, `cwd`, `timeout`). | Python, JS (`LocalRuntime`), Rust |
| `python_env` | mixed | Manages isolated `.venv` environments under `.suite-agent/pyenvs/` (`list`, `status`, `create`, `install`, `uninstall`, `packages`, `freeze`, `remove`), preferring `uv` with `venv`+`pip` fallback. | Python, JS (`LocalRuntime`) |
| `script_run` | `commands` | Runs a managed, inline, or `libraryId` script inside a managed Python venv with PEP 723 dependency bootstrap, `agent_io` structured I/O, and optional `ScriptLibrary` capture. | Python, JS (`LocalRuntime`) |
| `script_library` | mixed | Searches, reads, saves, updates, deletes, exports/imports, and inspects revision/run history for reusable workspace scripts. | Python, JS (`LocalRuntime`) |
| `python_tools`, `python_tool_save`, `python_target_save` | mixed | Inspects and saves parameterized Python library recipes (`python_tool_save`) and pinned input targets (`python_target_save`); `prepare` stages scripts without executing them. | Python, JS (`LocalRuntime`) |

### F. Web, Knowledge, Memory, Skills, Workflows & Delegation
| Tool | Permission | Detailed Description | SDK Availability |
| --- | --- | --- | --- |
| `web_fetch` | `read` | SSRF-guarded `https://`-only fetch (blocks `http://`, `localhost`, `.local`/`.internal`, and private/loopback/link-local IPs; 10s timeout, 256 KB cap). Strips HTML tags and returns character-paged text. | Python, JS (`LocalRuntime`), Rust |
| `web_search` | `read` | Runs an `https://` web search (`query`, `limit` 1–10) and returns `{ title, url, snippet }` results. | Python, JS (`LocalRuntime`), Rust |
| `discover_tools` | `read` | Searches available tool names, descriptions, permission categories, and JSON schemas by `query` keywords or exact `names` list. | Python, JS (`LocalRuntime`), Rust |
| `catalog_search`, `catalog_fetch`, `catalog_read` | `read` | Searches shared/app-specific skill catalog documents, indexes known HTTPS directory references, and reads pinned skill content in pages without executing it. | Python, JS (`LocalRuntime`) |
| `spawn_agent` | `read` (capped) | Spawns a bounded child `ReactAgent` on the workspace (`goal`, optional `allowEdits`, `allowCommands`, `maxSteps` 1–15). Child permissions are capped by the parent session and recursion is capped at depth 2. | Python (`ReactAgent`) |
| `project_knowledge` | `read` | Queries or refreshes the project's automatically derived ontology and dependency graph (`action: "query"\|"refresh"`, `query`, `hops`, `limit`). | Python, JS (`LocalRuntime`), Rust |
| `read_project_instructions` | `read` | Reads scoped `AGENTS.override.md` / `AGENTS.md` files from workspace root down to `path`, returning exact contents, scope, and SHA-256 without granting permissions. | Python, JS (`LocalRuntime`), Rust |
| `memory_store`, `memory_read`, `memory_list`, `memory_search`, `memory_delete`, `memory_reindex` | `edits`/`read` | Session-scoped local SQLite vector memory for storing, searching, paging, deleting, and reindexing notes/chunks. | Python, JS (`LocalRuntime`), Rust (core set) |
| `memory_remember`, `memory_recall`, `memory_forget`, `memory_manage`, `scratchpad` | `read`/`edits` | `MemoryManager` durable typed memories (`fact`, `lesson`, `episode`, `preference`, `procedure`, `note`) with importance/recency/TTL/consolidation plus per-run `scratchpad` key/value state. | Python, JS (`LocalRuntime`) |
| `memory_struct`, `memory_graph`, `memory_research` | `read`/`edits` | `UnifiedMemorySuite`: **StructMem** schema-validated records (`memory_struct`), **egGENT** / **A-MEM** / **MAGMA** 4-view graph memory (`memory_graph`), and **GAM** iterative multi-hop retrieval (`memory_research`). | Python, JS (`LocalRuntime`) |
| `skill_save`, `skill_read`, `skill_list`, `skill_search`, `skill_history`, `skill_reset` | `edits`/`read` | Creates, searches, reads, and manages versioned workspace/session `SKILL.md` procedures guarded by `expectedRevision` and session evidence. | Python, JS (`LocalRuntime`), Rust (core set) |
| `workflow_save`, `workflow_read`, `workflow_list`, `workflow_run`, `workflow_history`, `workflow_compare`, `workflow_preflight`, `workflow_continue`, `workflow_status`, `workflow_abandon` | `edits`/`read`/`commands` | Defines, validates (`preflight`), diffs (`compare`), runs, pauses/continues, and inspects reusable multi-step tool workflows (`suite-tool-workflow/v1` and `v2`). | Python, JS (`LocalRuntime`), Rust (core set) |
| `read_history`, `read_context`, `read_project_memory`, `package_results` | `read` | Recovers full session events omitted during compaction (`read_history`), original browser context snapshots (`read_context`), approved project-memory notes (`read_project_memory`), and builds a session audit ZIP (`package_results`). | Python, JS (`LocalRuntime`), Rust |
| `read_current_project`, `apply_project` | browser | Browser-bridge tools in `shared-agent/ui.js`: `read_current_project` reads the live app document and SHA-256 snapshot; `apply_project` applies validated `changes` (`codeiX`) or full native documents with Undo support. | Browser host (`shared-agent/`) |

---

## 3. Browser App AI Modes (`shared-ai/` vs. `shared-agent/`)

Browser apps separate lightweight **AI chat** from the full **Coding agent**:

1. **App AI Chat (`shared-ai/chat.js`) — No workspace tools**
   - Uses a single-turn structured JSON proposal contract (`shared-ai/protocol.js`) over `POST /api/chat`.
   - Sends the app's `document`, `selection`, `attachments`, `contextSchema`, `proposalSchema`, and `responseSchema` via `window.SuiteAgentAdapter`.
   - Receives `{ answer, summary, proposal, questions?, comments? }`, validates `proposal` through `SuiteAgentAdapter.validate(...)`, and requires user confirmation in the **Review proposed edit** dialog (`#sai-review`) with Undo support before mutating the live document.

2. **In-App Coding Agent (`shared-agent/ui.js`) — Browser bridge + Python relay tools**
   - Connects to the Python relay (`codingagentlib/python/agent_runtime.py`) for all workspace, git, script, memory, skill, workflow, and web tools listed in Section 2.
   - Adds 2 in-page browser-bridge tools handled by `projectBridge.act`:
     - `read_current_project` *(requires `allowProjectContext`)*: Reads the live open app document/context and its SHA-256 snapshot hash.
     - `apply_project` *(requires `allowProjectContext` + `allowProjectEdits` + `allowEdits`)*: Applies validated `changes` (`codeiX`) or a full native `document` (other apps) with Undo support.

---

## 4. VS Code Extension (`codingagentlib/vscode/`, RabbitHole)
- Uses the native Rust `codingagent-worker` binary (`codingagentlib/rust/`) over JSON-lines stdio.
- **Execution Modes** ([execution-mode.cjs](file:///development/singlepageapps/codingagentlib/vscode/src/execution-mode.cjs)):
  - **Build mode**: Full toolset subject to `allowEdits`, `allowCommands`, and per-action review policies.
  - **Plan mode**: Restricts execution to the read-only `reads` allowlist (`list_files`, `find_files`, `read_file`, `read_files`, `parallel_read`, `search_text`, `grep_search`, `code_symbols`, `code_definition`, `code_references`, `code_diagnostics`, `read_image`, `web_fetch`, `web_search`, `git_status`, `git_diff`, `git_log`, `discover_tools`, and read-only memory/skill/workflow/history tools).

---

## 5. Per-App Document & Data Structures

Each browser app exposes its native document structure via `SuiteAgentAdapter.snapshot()` / `SuiteAgentAdapter.schema` (used by `shared-ai/chat.js` proposals and `read_current_project` / `apply_project` in `shared-agent/ui.js`):

| App | Schema / Snapshot Source | Top-Level Data Structure |
| --- | --- | --- |
| `markiX` | [markiX/model.js](file:///development/singlepageapps/markiX/model.js) | `{ format: "markix-project", version: 1, name, syntax, source }` |
| `formiX` | [formiX/model.js](file:///development/singlepageapps/formiX/model.js) | `{ format: "formix-project", version: 1, name, activeId, formulas: [...], settings }` |
| `trackiX` | [trackiX/model.js](file:///development/singlepageapps/trackiX/model.js) | `{ kind, version, name, projectKey, sprints: [{ id, name, state, ... }], issues: [{ id, key, type, summary, status, priority, comments?, ... }] }` |
| `cncfiX` | [cncfiX/model.js](file:///development/singlepageapps/cncfiX/model.js) | `{ format, version, name, categories: [{ id, name, color }], subcategories: [{ id, categoryId, name }], items: [{ id, name, categoryId, subcategoryId, maturity, oss?, homepage?, repo?, description?, notes? }], settings }` |
| `schematiX` | [schematiX/ai-adapter.js](file:///development/singlepageapps/schematiX/ai-adapter.js) | `{ format: "schematix-project", version: 1, name, sources: [...], schemas: [...], ontology, nodes: [...], edges: [...] }` |
| `mergiX` | [mergiX/ai-adapter.js](file:///development/singlepageapps/mergiX/ai-adapter.js) | `{ format: "mergix-...", version, name, mode, labels, sides, results }` with file entries `{ path, sourcePath?, kind: "text"\|"binary"\|"deleted", content?, data?, resolved?, accepted?, origin?, choices? }` |
| `rstiX` | [rstiX/ai-adapter.js](file:///development/singlepageapps/rstiX/ai-adapter.js) | `{ format: "rstix-project", version: 1, name, files: [{ path, content, source? }], positions: { [needId]: { x, y } }, repositories?: [...] }` |
| `mockiX` | [mockiX/model.js](file:///development/singlepageapps/mockiX/model.js) | `{ version: 1, name, style?, screens: [...], components?: [...], flows?: [...] }` (pixel coordinates per screen, no HTML/scripts/URLs) |
| `shelliX` | [shelliX/app.js](file:///development/singlepageapps/shelliX/app.js) | Command-driven agent loop over relay session state (`environment: { commands, commandPolicy, cwd, timeout, shell, interactive }`), no document schema |
| `colabriX` | [colabriX/model.js](file:///development/singlepageapps/colabriX/model.js) | `{ version: 1, id, name, background, ...collections (notes/cards/frames/connectors/comments), voting, timer }` |
| `designiX` | [designiX/model.js](file:///development/singlepageapps/designiX/model.js) | `{ version: 1, name, width, height, pages: [...], assets: [...], brand }` |
| `photiX` | [photiX/app.js](file:///development/singlepageapps/photiX/app.js) | `{ version: 1, name, width, height, image, operations: [...] }` |
| `vidiX` | [vidiX/model.js](file:///development/singlepageapps/vidiX/model.js) | `{ name, width, height, fps, duration, background, clips: [...] }` |
| `architeX` | [architex/ai-adapter.js](file:///development/singlepageapps/architex/ai-adapter.js), [architex/model.js](file:///development/singlepageapps/architex/model.js) | AI adapter: `{ metamodel: { name, components, dependencies }, instanceModel: { instances, connections }, ruleLibrary }`; workspace model: `{ version, name, components, dependencies, ... }` |
| `graphiX` | [graphiX/ai-adapter.js](file:///development/singlepageapps/graphiX/ai-adapter.js) | `{ name, svg }` (static sanitized SVG document) |
| `textiX` | [textiX/ai-adapter.js](file:///development/singlepageapps/textiX/ai-adapter.js) | `{ name, html, embeds? / embeddedReferences? }` (sanitized rich-text HTML body) |
| `sheetiX` | [sheetiX/ai-adapter.js](file:///development/singlepageapps/sheetiX/ai-adapter.js) | `{ name, sheets: [{ id, name, rows, cols, cells: { [ref]: { value, formula?, style?, ... } } }] }` |
| `codeiX` | [codeiX/app.js](file:///development/singlepageapps/codeiX/app.js) | `{ project: { files: [{ path, content, ... }], ... }, active, tabs: [...] }`; `apply_project` accepts `{ changes: [{ path, action: "write"\|"delete", content? }] }` |
| `appiX` | [appiX/project.js](file:///development/singlepageapps/appiX/project.js), [appiX/designer-model.js](file:///development/singlepageapps/appiX/designer-model.js) | `{ name, brief, html, css, js, designer?: { version, state, nodes, flows } }` |
| `automatextiX` | [automatextiX/engine.js](file:///development/singlepageapps/automatextiX/engine.js) | `{ version: 1, name, nodes: [{ id, type, name, x, y, config }], edges: [{ id, source, target, port: "out"\|"true"\|"false" }] }` |
| `reportiX` | [reportiX/ai-adapter.js](file:///development/singlepageapps/reportiX/ai-adapter.js) | `{ report: { title, subtitle, executiveSummary, sections, visuals, limitations, conclusion } }` (plus snapshot context `{ query, researchQuestion, brief, sources, ... }`) |
| `presentiX` | [presentiX/project.js](file:///development/singlepageapps/presentiX/project.js) | `{ name, width, height, slides: [...], appearanceImport? }` |
| `sketchiX` | [sketchiX/model.js](file:///development/singlepageapps/sketchiX/model.js) | `{ name, width, height, nodes: [...], edges: [...] }` |
| `mindiX` | [mindiX/model.js](file:///development/singlepageapps/mindiX/model.js) | `{ name, layout, nodes: [...], relationships?: [{ id, source, target, label, ... }] }` |
| `projectiX` | [projectiX/model.js](file:///development/singlepageapps/projectiX/model.js) | `{ name, start, tasks: [...] }` |
