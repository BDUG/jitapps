<p align="center">
  <img src="assets/agentic-desktop-suite.svg" alt="Coding Agent SDKs, RabbitHole VS Code Extension & TLAL OS Exemplary Apps" width="920">
</p>

# Coding Agent Platform · VS Code Extension, Multi-Language SDKs & Exemplary Apps

A local-first coding-agent platform consisting of:

1. **[RabbitHole VS Code Extension (`codingagentlib/vscode/`)](#vscode-extension--rabbithole)** — A standalone native coding agent for VS Code powered by a bundled Rust worker (`codingagent-worker`), requiring neither Python nor an external server.
2. **[Multi-Language Coding Agent SDKs (`codingagentlib/`)](#coding-agent-sdks--python-javascripttypescript-rust)** — Feature-parity **Python**, **JavaScript/TypeScript**, and **Native Rust** SDKs for building ReAct, beyond-ReAct, and embedded coding agents with guarded workspace execution, layered memory, research/RAG pipelines, and MCP/A2A/OTel interoperability.
3. **[24 Exemplary Single-Page Apps (`TLAL OS`)](#exemplary-implementations--the-24-local-first-apps)** — Twenty-four local-first browser/Tauri applications demonstrating how to embed the coding agent, shared AI chat, virtual disk, and reviewed native editing across code, diagrams, documents, media, workflows, and research.

[VS Code Extension](#vscode-extension--rabbithole) · [Coding Agent SDKs](#coding-agent-sdks--python-javascripttypescript-rust) · [Research & RAG](#internet-research--rag-module) · [Exemplary Apps (24)](#exemplary-implementations--the-24-local-first-apps) · [Build & Verify](#build-and-verification) · [SDK Handbook](docs/coding-agent-book/HANDBOOK.md) · [Specs](specs/README.md)

---

## Project disclosure and license

This is a personal hobby project for learning, experimentation and enjoyment to validate the following [hypothesis](https://medium.com/@dirk.bangel/just-in-time-app-afterthought-d6b7a402ff91). It is not developed for commercial purposes or offered as a commercial product.

The [MIT License](LICENSE) permits commercial use. The disclosure describes the project’s development purpose and adds no restrictions to that license. Bundled dependencies and skill documents retain their respective licenses. Feature coverage and file fidelity vary by app and format.

---

## VS Code Extension · RabbitHole

The **[RabbitHole VS Code extension](codingagentlib/vscode/README.md)** packages the native Rust worker (`codingagent-worker`) directly into a `.vsix` bundle. No Python runtime or suite server is needed.

### Highlights

- **Direct Provider or Optional Relay**: Connect to any OpenAI-compatible endpoint (API keys stored in VS Code `SecretStorage`) or an existing local suite relay.
- **Plan / Build Execution Modes**: `plan` mode restricts the agent to read-only inspection (`read_file`, `code_symbols`, `web_search`, `rag_search`, etc.); `build` mode enables approved edits and commands.
- **Resource Browser (`⊞`)**: Inspect **Memory**, **Skills**, **Agents**, **Tools**, and **Workflows** in a tabbed drawer, search across items, **disable/enable per session**, set the active session agent persona, and **edit instructions/memory inline** per session.
- **Context Compression (`⊟`)**: One-click history compaction (`HistoryContext`) with live event/character budget tracking and exact `read_history` retrieval offsets.
- **Multimodal & Document Attachments**: Attach text/code files, `.pptx`, `.docx`, `.xlsx`, `.pdf`, `.svg`, and `.png`/`.jpeg` images directly to chat; office/PDF/SVG files are extracted to text for model processing while images are sent as native media parts.
- **Default `nodejs` & `python3` Tools**: Execute inline snippets (`code`) or workspace scripts (`path`) under `allowCommands` and `allowedCommands` guardrails.
- **Research & RAG Configuration**: Configure `codingagent.research.*` and `codingagent.research.rag.*` directly in VS Code settings for bounded web research and state-of-the-art RAG database queries.
- **Guardrails & Lifecycle**: Per-action terminal review (`codingagent.commandReview`), verification command binding, LoopGuard, workspace snapshots with rollback, `spawn_agent` subagents, `decisionMode` (`auto` / `assist` / `gate`), model handoff (`shadow` / `auto`), and exportable result ZIPs.

### Build & Package VSIX

```sh
./build.sh vscode --install-deps   # omit --install-deps after first run
# Output: dist/vscode/codingagentlib-<target>-<version>.vsix
```

See [codingagentlib/vscode/README.md](codingagentlib/vscode/README.md) for all commands, settings, and architecture details.

---

## Coding Agent SDKs · Python, JavaScript/TypeScript, Rust

[`codingagentlib/`](codingagentlib/README.md) provides a unified, protocol-driven coding agent runtime across three languages:

| SDK | Package / Crate | Runtime & Highlights | Guide |
| --- | --- | --- | --- |
| **Python** | `codingagentlib` (`python3 -m pip install ./codingagentlib`) | Full `Runtime`, `Agent`, `ReactAgent`, beyond-ReAct orchestrators, `uv` `PythonEnvironments`, `ScriptLibrary`, 5 memory architectures, `internet_research`, MCP/A2A/SSE/OTel | [Python & HOWTO](codingagentlib/README.md#howto) |
| **JavaScript / TypeScript** | `codingagentlib` (`npm test` / CommonJS & browser ESM) | Portable `core.js` loop, `LocalRuntime` adapter (`coreTools`, `programTools`, `scriptTools`), `internet-research.js` + `.d.ts`, `handoff.js`, `decision-model.js`, browser/Node parity | [JS/TS Reference](codingagentlib/README.md#howto) |
| **Native Rust** | `codingagentlib` (`codingagentlib/rust/Cargo.toml`) | Standalone native `Runtime`, `Agent`, AST/symbol navigation, `research` & RAG adapters, `beyond_react` (`StateGraph`, `TreeSearch`, `Agentless`), zero Python/Node dependency | [Rust Crate](codingagentlib/rust/README.md) |

### Core SDK Capabilities

- **ReAct & Beyond-ReAct Orchestrators**: `ReactAgent`, `TreeSearchAgent`, `CodeActAgent` / `CodeActREPL`, `AgentlessPipeline`, `StateGraph`, `PlannerExecutorAgent`, `HybridPlanReflexionAgent`, `MultiAgentOrchestrator`, and `ReflexionLoop`.
- **Default Tools & Dynamic Tool Creation**:
  - Workspace & code intelligence: `read_file`, `read_files`, `parallel_read`, `apply_edits`, `apply_patch`, `code_symbols`, `code_definition`, `code_references`, `code_diagnostics`, `git_status`/`git_diff`/`git_log`.
  - Execution & custom tools: default `nodejs` and `python3` tools, `run_command`, `run_script`, `start_process`/`write_stdin`/`stop_process`, and dynamic reusable tools (`tool_save`, `tool_list`, `tool_read`, `tool_run`, `python_tool_save`, `workflow_save`).
- **Layered & Graph Memory**: `MemoryManager`, `StructMemStore`, `EggentEpisodicGraph`, `AMemNetwork`, `MagmaMultiGraph`, `GamMemoryEngine`, and `ProjectKnowledge` ontology/dependency graphs.
- **Model Routing & Supervision**: `decisionMode` (`auto` / `assist` / `gate`), `ModelHandoff`, `create_model_mosaic`, and `independentReview`.
- **Interoperability & Telemetry**: MCP stdio/HTTP clients and servers, A2A delegation, ACP / SSE / AG-UI streaming, and OpenTelemetry GenAI tracing.

### Quickstart

```sh
# Python SDK & CLI
python3 -m pip install ./codingagentlib
python3 -m codingagentlib --workspace /absolute/path/to/workspace

# Native Rust SDK (no Python required)
cargo test --locked --manifest-path codingagentlib/rust/Cargo.toml

# Build distributable SDK packages
./build.sh sdks --install-deps
```

### Embedded Two-View SDK Example (`EmbeddedAgent`)

The [two-views example](codingagentlib/examples/two-views/README.md) runs a shared browser UI backed interchangeably by `EmbeddedAgent` in **Python**, **JavaScript/TypeScript**, or **Native Rust**:

```sh
python3 codingagentlib/examples/two-views/serve.py python      # or: javascript | rust
```

Open **http://127.0.0.1:8765** (set `TWO_VIEWS_MODEL_URL`, `TWO_VIEWS_MODEL`, and optional `TWO_VIEWS_API_KEY` for live OpenAI-compatible models; deterministic fixture mode works offline).

---

## Internet Research & RAG Module

All three SDKs and the VS Code extension include an isolated **Research Module** designed to keep raw web/database payloads out of the primary coding context window:

- **`web_search` & `web_fetch`**: SSRF-guarded (`ERR_BLOCKED_URL` on loopback/private/link-local/cloud metadata IPs and non-HTTPS schemes, max 3 validated redirects), clean HTML-to-Markdown/code/text extraction, and BM25 heading-chunked `focus_truncate` (`max_chars` up to 25,000).
- **`rag_search` (State-of-the-Art RAG Backends)**: Optional querying of **Qdrant**, **Pinecone**, **Weaviate**, **Chroma**, **Milvus**, **pgvector**, **Elasticsearch**, **OpenSearch**, **LanceDB**, **FAISS**, and **custom** HTTP endpoints in `hybrid`, `dense`, `sparse`, or `rerank` mode, with optional `/v1/embeddings` query vector resolution.
- **Context Firewall (`summarize_research` & `run_research`)**: Wraps retrieved chunks in `<untrusted_web_content>` / `<untrusted_rag_content>` delimiters, filters prompt-injection directives, enforces hard `max_tool_calls` budgets (`partial_budget_exhausted`), and distills 1–5 sources into a typed `ResearchBrief`.

---

## Exemplary Implementations · The 24 Local-First Apps

This repository also ships **24 local-first single-page apps (`TLAL OS`)** as exemplary end-to-end applications built around the Coding Agent SDK, shared AI chat (`shared-ai/`), shared workspace/virtual disk (`shared-suite/`), and the local Python relay (`server/`).

### Get Started with the Exemplary Suite

```sh
git clone https://github.com/BDUG/singlepageapps.git
cd singlepageapps
python3 server/server.py
```

Open **http://127.0.0.1:8000/** for the desktop launcher and **http://127.0.0.1:8000/relay** to configure AI providers.

| App | Open | Main capabilities |
| --- | --- | --- |
| **[codeiX](codeiX/README.md)** | [/codeiX/](codeiX/) | Project files, code search/editing, local-workspace integration, coding-agent execution (`nodejs`, `python3`, `run_command`), and source/Tauri 2 ZIP export. |
| **[shelliX](shelliX/README.md)** | [/shelliX/](shelliX/) | Goal-driven AI shell with allowlisted server commands, retained stdout/stderr, history search, and saved sessions. |
| **[automatextiX](automatextiX/README.md)** | [/automatextiX/](automatextiX/) | Visual automation pipelines connecting transforms, AI calls, virtual-disk files, web requests, and allowed local commands. |
| **[reportiX](reportiX/README.md)** | [/reportiX/](reportiX/) | Source discovery, public-page crawling, source libraries, cited comparison reports, and SVG charts. |
| **[appiX](appiX/README.md)** | [/appiX/](appiX/) | Generate SPAs, design screens and logic, preview safely, and export standalone apps or a Rust Cargo project. |
| **[architeX](architex/README.md)** | [/architex/](architex/) | Metamodels, instance graphs, nested components, directional ports, validation, and draw.io/SVG/Mermaid/PlantUML/XLSX/RST interchange. |
| **[schematiX](schematiX/README.md)** | [/schematiX/](schematiX/) | Derive schemas from examples, edit ontologies and knowledge graphs, and exchange JSON-LD, Turtle, SVG, and mind maps. |
| **[mergiX](mergiX/README.md)** | [/mergiX/](mergiX/) | Compare text/binary files and folders, review line hunks, three-way merge, and semantic AI merge proposals. |
| **[rstiX](rstiX/README.md)** | [/rstiX/](rstiX/) | Browse/edit Sphinx-Needs and RST files, sketch dependency graphs, and import pinned GitHub repositories. |
| **[cncfiX](cncfiX/README.md)** | [/cncfiX/](cncfiX/) | CNCF landscape diagram builder with categories, maturity levels, catalog, and SVG/PNG/YAML/JSON export. |
| **[markiX](markiX/README.md)** | [/markiX/](markiX/) | Visual and source editing for Markdown and reStructuredText with outline, templates, and MD/RST/HTML export. |
| **[formiX](formiX/README.md)** | [/formiX/](formiX/) | Formula notebooks with live LaTeX previews, templates, symbols, and SVG/LaTeX/JSON export. |
| **[colabriX](colabriX/README.md)** | [/colabriX/](colabriX/) | Collaborative whiteboards with notes, shapes, connectors, frames, voting, timers, and magic-wormhole sharing. |
| **[designiX](designiX/README.md)** | [/designiX/](designiX/) | Multi-page graphic design with templates, brand kits, layers, and SVG/PNG/WebP/PDF export. |
| **[graphiX](graphiX/README.md)** | [/graphiX/](graphiX/) | Editable SVG shapes, paths, text, groups, layers, and SVG/PNG export. |
| **[photiX](photiX/README.md)** | [/photiX/](photiX/) | Raster-image effects, selections, and generative fill/expansion/editing via OpenAI-compatible image endpoints. |
| **[sketchiX](sketchiX/README.md)** | [/sketchiX/](sketchiX/) | Connected diagrams, UML/SysML/GSN modes, and draw.io/SVG/PlantUML/PPTX/VSDX interchange. |
| **[mindiX](mindiX/README.md)** | [/mindiX/](mindiX/) | Hierarchical mind maps with notes, task metadata, and JSON/draw.io/SVG/PPTX export. |
| **[projectiX](projectiX/README.md)** | [/projectiX/](projectiX/) | Tasks, milestones, dependencies, resources, Gantt scheduling, and MS Project XML/XLSX/SVG export. |
| **[textiX](textiX/README.md)** | [/textiX/](textiX/) | Rich text documents with headings, tables, embedded snapshots, and DOCX/PDF/HTML/Markdown interchange. |
| **[presentiX](presentiX/README.md)** | [/presentiX/](presentiX/) | Slide decks with speaker notes, presentation mode, and PPTX interchange. |
| **[sheetiX](sheetiX/README.md)** | [/sheetiX/](sheetiX/) | Spreadsheets with formulas, multiple sheets, sorting, and XLSX/CSV/JSON interchange. |
| **[vidiX](vidiX/README.md)** | [/vidiX/](vidiX/) | Layered timelines, clips, drawing frames, motion presets, and animated GIF/SVG/video export. |
| **[mockiX](mockiX/README.md)** | [/mockiX/](mockiX/) | Wireframes, reusable components, user-flow maps, clickable prototypes, and SVG/HTML export. |

### Screenshots

[![TLAL OS desktop application launcher](assets/screenshots/desktop.png)](assets/screenshots/desktop.png)

| | |
| --- | --- |
| **[codeiX](codeiX/README.md)**<br>[![codeiX workspace](assets/screenshots/codeiX.png)](assets/screenshots/codeiX.png) | **[shelliX](shelliX/README.md)**<br>[![shelliX AI shell](assets/screenshots/shelliX.png)](assets/screenshots/shelliX.png) |
| **[architeX](architex/README.md)**<br>[![architeX workspace](assets/screenshots/architex.png)](assets/screenshots/architex.png) | **[graphiX](graphiX/README.md)**<br>[![graphiX workspace](assets/screenshots/graphiX.png)](assets/screenshots/graphiX.png) |
| **[colabriX](colabriX/README.md)**<br>[![colabriX whiteboard](assets/screenshots/colabriX.png)](assets/screenshots/colabriX.png) | **[designiX](designiX/README.md)**<br>[![designiX workspace](assets/screenshots/designiX.png)](assets/screenshots/designiX.png) |
| **[photiX](photiX/README.md)**<br>[![photiX workspace](assets/screenshots/photiX.png)](assets/screenshots/photiX.png) | **[sketchiX](sketchiX/README.md)**<br>[![sketchiX workspace](assets/screenshots/sketchiX.png)](assets/screenshots/sketchiX.png) |
| **[mindiX](mindiX/README.md)**<br>[![mindiX workspace](assets/screenshots/mindiX.png)](assets/screenshots/mindiX.png) | **[projectiX](projectiX/README.md)**<br>[![projectiX workspace](assets/screenshots/projectiX.png)](assets/screenshots/projectiX.png) |
| **[textiX](textiX/README.md)**<br>[![textiX workspace](assets/screenshots/textiX.png)](assets/screenshots/textiX.png) | **[presentiX](presentiX/README.md)**<br>[![presentiX workspace](assets/screenshots/presentiX.png)](assets/screenshots/presentiX.png) |
| **[sheetiX](sheetiX/README.md)**<br>[![sheetiX workspace](assets/screenshots/sheetiX.png)](assets/screenshots/sheetiX.png) | **[vidiX](vidiX/README.md)**<br>[![vidiX workspace](assets/screenshots/vidiX.png)](assets/screenshots/vidiX.png) |
| **[appiX](appiX/README.md)**<br>[![appiX workspace](assets/screenshots/appiX.png)](assets/screenshots/appiX.png) | **[automatextiX](automatextiX/README.md)**<br>[![automatextiX workspace](assets/screenshots/automatextiX.png)](assets/screenshots/automatextiX.png) |
| **[reportiX](reportiX/README.md)**<br>[![reportiX workspace](assets/screenshots/reportiX.png)](assets/screenshots/reportiX.png) | **[markiX](markiX/README.md)**<br>[![markiX markup studio](assets/screenshots/markiX.png)](assets/screenshots/markiX.png) |
| **[formiX](formiX/README.md)**<br>[![formiX formula studio](assets/screenshots/formiX.png)](assets/screenshots/formiX.png) | **[cncfiX](cncfiX/README.md)**<br>[![cncfiX CNCF landscape studio](assets/screenshots/cncfiX.png)](assets/screenshots/cncfiX.png) |
| **[mergiX](mergiX/README.md)**<br>[![mergiX compare and merge](assets/screenshots/mergiX.png)](assets/screenshots/mergiX.png) | **[mockiX](mockiX/README.md)**<br>[![mockiX wireframe studio](assets/screenshots/mockiX.png)](assets/screenshots/mockiX.png) |
| **[rstiX](rstiX/README.md)**<br>[![rstiX RST and requirements](assets/screenshots/rstiX.png)](assets/screenshots/rstiX.png) | **[schematiX](schematiX/README.md)**<br>[![schematiX schema studio](assets/screenshots/schematiX.png)](assets/screenshots/schematiX.png) |

### Optional Tauri 2 Desktop

Package the desktop launcher, all 24 exemplary apps, and a frozen Python server sidecar with [`desktop-tauri/`](desktop-tauri/README.md):

```sh
./build.sh desktop --install-deps
```

---

## Build and Verification

```sh
# Build & test VS Code extension (.vsix in dist/vscode/)
./build.sh vscode

# Build Python & JS/TS SDK packages (dist/)
./build.sh sdks

# Rust SDK (portable core & full native runtime)
cargo test --locked --no-default-features --manifest-path codingagentlib/rust/Cargo.toml --test core --test beyond_react
cargo test --locked --manifest-path codingagentlib/rust/Cargo.toml --lib --test native

# Python SDK & server tests
python3 -m unittest discover -s codingagentlib -t . -p 'test_*.py'
python3 -m unittest discover -s server -t . -p '*_test.py'

# JavaScript SDK & Suite checks
node --test codingagentlib/javascript/internet-research-test.cjs
node codingagentlib/javascript/core-test.cjs
node scripts/verify-suite.cjs
```

Further documentation: [Coding Agent & SDK Handbook](docs/coding-agent-book/HANDBOOK.md) · [Coding Agent How-to Book](docs/coding-agent-book/README.md) · [Server Guide](server/README.md) · [Shared Suite Guide](shared-suite/README.md) · [Building Guide](docs/BUILDING.md) · [Specs](specs/README.md)
