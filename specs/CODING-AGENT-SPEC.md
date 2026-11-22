# Coding Agent & SDK Specification

## 1. Core Capabilities
- **ReAct Loop (`ReactAgent` in `codingagentlib/python/react.py`, `loop.js`)**:
  - Supports `sense -> plan -> act -> observe -> reflect -> verify` with context compaction (`compactedHistory` / `compressConversation`), deterministic `workingBrief` and `decisionGuidance`, action-cycle/stall detection, structured `repairHint` recovery, and optional multi-action turn batching (`actions: [...]`, halting immediately on failure).
- **Optional Decision Models (`codingagentlib/python/decision_model.py`, `loop.js`)**:
  - Modes: `off`, `assist` (advisory `request.decision`), `gate` (pre-execution approval/veto with rationale feedback).
- **Managed Python Virtual Environments (`codingagentlib/python/agent_pyenv.py`)**:
  - Isolated `.venv` environments under `.suite-agent/pyenvs/<name>/`.
  - Prefers `uv` (`uv venv` / `uv pip`), falling back to stdlib `venv` + `pip`.
  - Enforces host command allowlist (`resolve_command`) and PEP 508 package spec validation.
- **Script Harness & Library (`codingagentlib/python/agent_harness.py`, `codingagentlib/python/runtime_tools.py`)**:
  - `script_run` executes managed, inline, or `libraryId` scripts inside a managed virtual environment with PEP 723 dependency bootstrap, `agent_io.load_input()` / `agent_io.emit()` / `agent_io.artifact_dir()`, and `AGENT_RESULT:` parsing. `script_run` is also supported in `agent_workflows.STEP_TOOLS`.
  - `ScriptLibrary` stores versioned, searchable scripts with run statistics and automatic credential/path-screened capture.
  - Portable SDK v1 (`CoreAgent` / `create_agent` / `createAgent`) exposes generated scripts, `ScriptLibrary`, `PythonEnvironments`, `ToolLibrary`, and allowlisted programs via `runtime_tools` / `script_tools` / `program_tools` / `script_library_tools` (Python), `LocalRuntime.coreTools` / `scriptTools` / `programTools` / `toolLibrary` (JavaScript), and `core_tools` / `script_tools` / `program_tools` + `delete_script` (Rust). `providers.tool_schemas` converts `Runtime` `arguments` maps to JSON Schema `parameters`.
- **Memory Management & Architectures**:
  - `rememberSessions` is `True` by default (`Runtime`, `Agent`, `ReactAgent`, `LocalRuntime`, UI `#ag-remember-sessions`) and can be disabled per runtime or per session.
  - `MemoryManager` (`agent_memory_manager.py`): 6 kinds (`fact`, `lesson`, `episode`, `preference`, `procedure`, `note`), importance/recency/usage scoring, dedup/merge, TTL, consolidation, capacity pruning, scratchpad, and automatic episode/lesson capture.
  - `UnifiedMemorySuite` (`agent_memory_architectures.py`): **StructMem** (typed schemas), **egGENT** (episodic event-graph), **A-MEM** (Zettelkasten linked/evolving notes), **MAGMA** (4-view semantic/temporal/causal/entity graph + RRF), and **GAM** (Memorizer page store + Researcher iterative multi-hop retrieval).
- **UI & Management (`shared-agent/ui.js`)**:
  - Sessionless skill & workflow browsing/editing, skill starter templates/Markdown import/preview, workflow JSON formatting & step templates, reusable Agent Profiles (`#ag-profile` & Agents tab), Memory & Envs tab, and one-click Conversation Compression (`#ag-compress-now`).
- **SDKs (Python, JavaScript/TypeScript, Rust)**:
  - Multi-provider adapters (`openai_model`/`openAIModel`, `anthropic_model`/`anthropicModel`, `gemini_model`/`geminiModel`, `ollama_model`/`ollamaModel`, `with_retry`/`withRetry`), plus native JSON Schema tool-use adapters (`openai_tool_model`, `anthropic_tool_model`, `gemini_tool_model`, `tool_use_to_react_model`) in `providers.py`.
  - Standalone isolated packages via `codingagentlib/scripts/package_sdk.py`.
- **ReAct Loop Protocols & Hybrid Orchestration**:
  - **MCP (`mcp_transports.py`, `rpc.py`, `server/server.py`)**: Stdio (`ShellMCP`, `MCPService`) and Streamable HTTP (`HttpMCPTransport`, `POST /api/mcp`).
  - **A2A (`a2a.py`, `server/server.py`)**: Agent2Agent `AgentCard` (`GET /.well-known/agent.json`), `A2AServer` (`POST /api/a2a` for `tasks/send`, `tasks/get`, `tasks/cancel`, `message/send`), `A2AClient`, and `a2a_delegation_tool` for nested ReAct loops.
  - **Editor / UI Streaming (`streaming.py`, `react.py`, `server/server.py`)**: SSE Data Streams (`SSEStreamBridge`), AG-UI lifecycle events (`ag_ui_events`, `POST /api/agent/stream`), and Zed ACP (`ACPServer`).
  - **OpenTelemetry GenAI Observability (`otel_genai.py`, `react.py`, `server/server.py`)**: `GenAITracer`, `ReactOtelObserver`, W3C `traceparent`, `invoke_agent` / `chat` / `execute_tool` spans, and OTLP JSON export (`GET /api/agent/otel`).
  - **Hybrid Plan-and-Execute + Reflexion + ReAct (`hybrid_agent.py`)**: `HybridPlanReflexionAgent` orchestrates dependency-ordered task plans (`planner`), per-task ReAct loops with mandatory post-failure Reflexion + memory capture, and adaptive `replanner` recovery.

## Two-view SDK example host

The standalone `codingagentlib/examples/two-views/` host supplies a shared browser
UI and independent Python, JavaScript/TypeScript SDK (Node CommonJS) and Rust
`EmbeddedAgent` implementations. Each exposes separate edit-permission tools for
an allowlisted SVG color and plain paragraph text in a styled rich-text view.
Acceptance: chat can edit either view; the bottom trace includes model requests,
responses, public steps and observations; JSON download retains all page runs.
The default model is deterministic; an optional host-side OpenAI-compatible
provider bridge enables natural-language editing without exposing credentials to
the page. Tools never execute supplied SVG/HTML. Each request starts a new bounded
SDK run with current document context. This teaching host is not a registered
suite app and does not change the shared UI architecture.

## Opt-in extension pack

[EXT-SPEC v1.2](EXT-SPEC.md) defines the extension constitution and acceptance
criteria. The [Python adapter](../codingagentlib/extension_pack/README.md) uses
public CoreAgent policies, tool callbacks, session-store/context/event contracts
without replacing the execution loop. [Requirement traceability](EXT-IMPLEMENTATION.md)
maps durability, verification, worktrees, MCP/A2A, tier routing, budgets, governance,
conventions and headless UI to implementation and observed acceptance checks.

## Readiness and regression qualification

- VS Code file mentions preserve `#page=N` through composer parsing and reference
  resolution. Page numbers are one-based in chat, zero-based in the attachment
  API; invalid or unavailable pages report an error rather than attach another page.
- Combined text-reference previews respect their character budget, preserve
  Unicode surrogate pairs and identify omitted content. Media remains unchanged.
- The default suite gate includes JavaScript protocol regression checks. Local
  protocol tests do not establish interoperability with external implementations.
- Real-model evaluations include multi-file changes and large-source inspection,
  protected fixture integrity and held-out checks. Deterministic replay verifies
  the evaluation machinery, never a model's effectiveness. Provider errors and
  timeouts retain the final available native audit for actual tool-call metrics;
  an initial session snapshot must not erase work performed before failure.
- Qualification records distinguish unit tests, actual VS Code extension-host
  execution, browser workflows, platform coverage and live-provider results.
  The status report starts with a current evidence summary; dated entries remain
  historical and must not be duplicated or presented as current qualification.
