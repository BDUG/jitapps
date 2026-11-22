Here is **`EXT-SPEC.md` (v1.2)**, extended with late-2026 production coding agent patterns—specifically **durable step-boundary execution**, **time-travel replay**, **code-execution tool consolidation**, **sandboxed browser verification**, **SLM cost-tier routing**, and **file-based convention over configuration**—with all code snippets omitted.

---

# `EXT-SPEC.md`: Coding Agent Extension Pack (v1.2)

## 1. Extension Constitution (Brownfield Rules)

All implementation plans, code, and tests for this extension MUST obey these constraints:

1. **Reuse Over Rewrite:** The extension MUST delegate core orchestration, LLM streaming, authentication, and MCP transport to the host SDK. Duplicating the host's execution loop or tool-dispatch engine is prohibited.
2. **Public Extension Points Only:** All integrations MUST use the host SDK's documented extension surfaces (`customAgents`, `skillDirectories`, `mcpServers`, `hooks`, and session lifecycle events). Monkey-patching host internals or forking the CLI/runtime is forbidden.
3. **Standards Over Custom Protocols:** Tool integration MUST use **MCP** and cross-agent delegation MUST use **A2A** rather than custom HTTP glue.
4. **Convention Over Configuration:** Extension capabilities (instructions, skills, agent personas, and policy rules) MUST live as ordinary, version-controlled files in predictable repository directories so teams can inspect and review them alongside application code.
5. **Zero-Regression Isolation & Graceful Degradation:** Disabling the extension MUST restore vanilla host behavior; missing optional host capabilities MUST degrade cleanly with a warning rather than crashing.

---

## 2. System Boundary: Host vs. Extension Delta

| Capability | Provided by Existing Host SDK | Added by This Extension (Delta) | Invariant (Must Not Change) |
| --- | --- | --- | --- |
| **Execution Loop & Durability** | Core Plan → Act → Observe loop, streaming, retries, and auth. | **Durable step-boundary checkpointing** for multi-hour/multi-day jobs and **time-travel replay** from any saved checkpoint. | Host's core message loop and token streaming protocol. |
| **Verification Lattice** | Basic terminal/test command execution. | Layered assurance combining deterministic tests, security scanners (SAST/IaC/secrets), **sandboxed browser/E2E verification**, and agentic spec review. | Host's built-in test runner behavior remains unmodified when extension gates are disabled. |
| **Tooling (MCP & Code Execution)** | Native MCP client lifecycle (stdio/SSE/Streamable HTTP). | Namespaced domain MCP servers with server-side filtering, plus optional **sandboxed code-action execution** (Docker/WebAssembly/E2B) to batch multi-step tool chains. | Host's built-in file, search, and terminal tools remain intact unless explicitly scoped. |
| **Multi-Agent & A2A** | Local sub-agent isolation and `subagent.*` lifecycle events. | **A2A protocol** bridge via Agent Cards, **git worktree** isolation for parallel streams, and **SLM cost-tier routing** for routine sub-tasks. | Parent session continues to receive all standard `subagent.*` telemetry events. |
| **Governance & Oversight** | Basic user permission prompts. | **Governance-by-design** policy-as-code gateway, adaptive confidence-based human escalation, and hard per-job cost/token budgets. | Plain-text CLI and headless CI clients continue to operate without interactive UI dependencies. |

---

## 3. Functional Requirements & Acceptance Criteria

### EXT-FR-1: Durable Long-Running Jobs & Time-Travel Replay

**Observable Behavior:** For tasks spanning hours or days, the extension persists session state at deterministic step boundaries so pending human approvals, container restarts, or deployments do not lose progress.

* **AC-1.1:** A session paused awaiting human approval survives a full host process restart or redeployment and resumes cleanly from the exact step boundary.
* **AC-1.2:** Operators can roll back and replay a failed or drifted agent run from any prior checkpoint without re-executing earlier verified steps.

### EXT-FR-2: Layered Verification Lattice (Including Browser & Security QC)

**Observable Behavior:** Before allowing PR creation or task completion, the extension enforces a three-tier **Verification Lattice**:

1. **Deterministic Layer:** Compilation, type checks, unit/integration tests, and linters.
2. **Browser / E2E Layer:** For frontend or web-workflow changes, a sandboxed browser agent verifies live UI flows (navigation, form submission, DOM state) like a real user.
3. **Security & Agentic QC Layer:** SAST, dependency/IaC/secret scanning, plus `@Reviewer` and `@SecurityAuditor` personas validating spec compliance and architectural consistency.

* **AC-2.1:** `onPreToolUse` blocks completion/PR tools until all configured layers of the Verification Lattice report green in the current session state.
* **AC-2.2:** Registering `@Planner`, `@Implementer`, `@Reviewer`, and `@SecurityAuditor` does not overwrite user-defined custom agents.

### EXT-FR-3: Parallel Execution with Git Worktree Isolation

**Observable Behavior:** Concurrent sub-tasks execute inside isolated **git worktrees** and branches to prevent workspace collisions, with an explicit shared-workspace mode when collaboration on a single branch is required.

* **AC-3.1:** Parallel `@Implementer` sub-agents operating on separate tasks cannot overwrite each other's uncommitted files or lock the repository index.
* **AC-3.2:** Temporary worktrees are pruned automatically on merge, abort, or crash recovery.

### EXT-FR-4: Cross-Boundary Delegation via A2A Protocol

**Observable Behavior:** External autonomous systems (e.g., enterprise security triage or cross-language backend agents) are invoked via the **Agent-to-Agent (A2A)** protocol rather than wrapped as static MCP tools.

* **AC-4.1:** Remote agent capabilities are discovered dynamically via standard **Agent Cards** and tracked through A2A's task state machine.
* **AC-4.2:** All cross-boundary A2A calls enforce authenticated identity verification (OAuth 2.0 / Bearer) to prevent impersonation.

### EXT-FR-5: Token-Efficient MCP & Sandboxed Code-Action Execution

**Observable Behavior:** The extension pairs namespaced MCP servers (supporting server-side payload filtering) with an optional **sandboxed code-action** mode (WebAssembly, Docker, or ephemeral microVM) that lets the agent execute multi-step data transformations in a single turn rather than chaining dozens of discrete JSON tool calls.

* **AC-5.1:** All extension MCP tools are namespaced to prevent collisions and filter large payloads server-side before returning them to the LLM.
* **AC-5.2:** Enabling code-action mode for batch inspection or refactoring reduces LLM round-trip calls by at least 25% compared to sequential tool calling.

### EXT-FR-6: SLM Tier Routing & Per-Job Cost Controls

**Observable Behavior:** The extension classifies sub-tasks by complexity and routes routine, well-scoped operations (e.g., boilerplate formatting, log summarization, simple test generation) to **Small Language Models (SLMs)** or fast tiers, reserving frontier reasoning models for planning and complex debugging.

* **AC-6.1:** Each agent job enforces configurable token and monetary cost ceilings; approaching the ceiling triggers a warning and exceeding it halts execution gracefully.

### EXT-FR-7: Governance-by-Design & Adaptive Human Escalation

**Observable Behavior:** Lifecycle hooks (`onPreToolUse`, `onPostToolUse`, `onErrorOccurred`) act as a **secure-by-default Agent Tool Gateway** enforcing policy-as-code, secret redaction, and adaptive human-in-the-loop escalation.

* **AC-7.1 (Policy-as-Code):** Destructive shell commands and unapproved write operations are blocked or gated before execution, with every decision written to an immutable audit trail.
* **AC-7.2 (Secret Redaction):** `onPostToolUse` scrubs API keys and tokens before outputs enter model context or telemetry.
* **AC-7.3 (Adaptive Escalation):** When the agent detects conflicting spec requirements or exceeds the retry threshold on the same verification failure, it pauses and emits a structured "ask-for-help" escalation rather than looping blindly.

### EXT-FR-8: File-Based Skills, Index-Free Search & Cross-Session Memory

**Observable Behavior:** Domain playbooks (`SKILL.md`), repo instructions, and agent definitions are discovered from version-controlled directories and paired with index-free agentic search (git history, AST/symbols, pattern search) and cross-session memory hooks (`onSessionStart` / `onSessionEnd`).

* **AC-8.1:** Skills load via progressive disclosure only when task metadata matches; individual skills can be disabled via `disabledSkills`.
* **AC-8.2:** Repository inspection works accurately on freshly cloned, unindexed codebases.
* **AC-8.3:** Cross-session conventions injected on `onSessionStart` stay within a strict token cap, and new learnings persist asynchronously on `onSessionEnd`.

### EXT-FR-9: Interactive UI Streaming (AG-UI / A2UI) & Headless Portability

**Observable Behavior:** The extension runs identically across terminal/IDE hosts, ChatOps surfaces, and headless CI/cloud containers, emitting incremental state deltas (**AG-UI**) and optional declarative UI payloads (**A2UI**) for plan approval and diff review.

* **AC-9.1:** In headless/non-interactive mode (`interactive: false`), UI payloads are suppressed and approval-gated hooks resolve deterministically via `headlessPolicy` (`deny` by default, or `allow_allowlisted`).

---

## 4. Extension Wiring & SDK Adapter Contract

The extension exposes a **composable configuration adapter** that attaches to the existing host SDK session configuration without mutating user overrides.

### Extension Configuration Options

* **Enabled Agents:** Allowlist for bundled personas (`planner`, `implementer`, `reviewer`, `security_auditor`).
* **Durability & Checkpointing:** Storage backend for step-boundary checkpoints and replay retention policy.
* **Verification Lattice:** Required deterministic commands, optional sandboxed browser test target, and security scanner gates.
* **Worktree Isolation Policy:** Toggle and base directory for parallel git worktree creation (`isolated_per_task` vs. `shared_workspace`).
* **A2A Registry:** Trusted external Agent Card URLs and OAuth credentials.
* **Model & Cost Controls:** SLM/fast/reasoning routing rules, per-job token/cost caps, and retry escalation thresholds.
* **Headless Policy:** Deterministic fallback (`deny` or `allow_allowlisted`) for non-interactive CI/Cloud runs.
* **UI Protocol Mode:** Toggle for AG-UI state deltas and A2UI declarative payloads (`auto`, `enabled`, `disabled`).

### Adapter Interface & Lifecycle

* **Identity & Compatibility:** Exposes a unique `id`, SemVer `version`, and `compatibleHostSdkRange`.
* **Non-Destructive Composition (`apply`):** Merges extension agents, file-based skill directories, MCP servers, A2A bridges, durability middleware, and lifecycle hooks into a host `SessionConfig` while preserving user-supplied overrides at higher precedence.

---

## 5. Non-Functional Constraints

| Category | Requirement |
| --- | --- |
| **Hook Latency** | `onPreToolUse` and `onPostToolUse` hooks MUST complete in less than 50 ms (p95) for local policy and redaction checks. |
| **Context Budget** | Combined `additionalContext` from `onSessionStart` and preloaded skill metadata MUST NOT exceed 4% of the active model's context window. |
| **Sandbox Isolation** | Code-action and browser-verification runtimes MUST execute as non-root in ephemeral, network-restricted containers or WebAssembly sandboxes with strict CPU/memory/wall-clock limits. |
| **Auditability** | Every policy decision, A2A delegation, checkpoint transition, and cost-tier routing event MUST emit structured OpenTelemetry logs tagged with `extensionId`, `sessionId`, and `checkpointId`. |

---

## 6. Verification & Regression Test Strategy

1. **Composition & Regression Tests:** Verify `apply()` merges all extension surfaces without overwriting user entries, and run the host SDK baseline suite with the extension loaded vs. unloaded to confirm zero regressions.
2. **Durability & Replay Tests:** Terminate a running session mid-task while awaiting approval, restart the host process, and verify clean resume and checkpoint rollback (AC-1.1, AC-1.2).
3. **Verification Lattice & Hook Tests:** Mock tool calls to verify write blocking, secret redaction, browser/security gate enforcement, cost-cap halts, and retry-based escalation (AC-2.1, AC-6.1, AC-7.1–7.3).
4. **Parallel Worktree & Protocol Tests:** Spawn concurrent `@Implementer` sub-agents on overlapping paths to verify zero collisions and clean teardown (AC-3.1, AC-3.2), and validate MCP payload filtering, code-action call reduction, and A2A Agent Card authentication (AC-4.1, AC-5.2).