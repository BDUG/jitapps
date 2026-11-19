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
- **Script Harness & Library (`codingagentlib/python/agent_harness.py`)**:
  - `script_run` executes managed, inline, or `libraryId` scripts inside a managed virtual environment with PEP 723 dependency bootstrap, `agent_io.load_input()` / `agent_io.emit()` / `agent_io.artifact_dir()`, and `AGENT_RESULT:` parsing.
  - `ScriptLibrary` stores versioned, searchable scripts with run statistics and automatic credential/path-screened capture.
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
