# TLAL OS Suite · Apps, Server & SDKs Status Report

**Current assessment: 2026-11-21.** Evidence below was collected from the working
tree based on `ebca7f2`, including uncommitted SDK and extension changes. Historical
entries further down retain their original scope and are not current gate totals.

The library and extension are suitable for controlled integration and supervised
pilots. All 24 apps passed the shared inventory/capability browser workflow;
selected native editing, recovery and format paths also passed. These checks do
not establish full feature parity, complete format fidelity or live-model quality.

## Current verification

| Area | Executed command | Observed result |
| --- | --- | --- |
| Suite units/integration | `node scripts/verify-suite.cjs --report /tmp/improve-suite-report.json` | **156 checks, 0 failures**, now including JavaScript protocols and evaluation fixture checks |
| Python SDK/server/packaging | Exact module list below | **88 tests run, OK (3 skipped)**; skips require a reviewed Docker/browser sandbox image |
| Rust full crate | `cargo test --locked --manifest-path codingagentlib/rust/Cargo.toml` | **61 tests passed**, 0 failures |
| Rust portable core | `cargo test --locked --no-default-features --manifest-path codingagentlib/rust/Cargo.toml --test core --test beyond_react` | **5 tests passed**, 0 failures |
| Extension release worker and tests | `npm --prefix codingagentlib/vscode run verify` | **161 tests passed**, 0 failures; rebuilt release worker. Repeated `npm test` after packaging-tool updates also passed |
| Actual VS Code host | `VSCODE_EXECUTABLE=/snap/code/current/usr/share/code/code npm --prefix codingagentlib/vscode run test:editor-host` | Passed on **VS Code 1.147.0, Linux x64**: activation/commands, actual editor diagnostics/selections, attachment commands, production controller/native verification and ZIP export |
| Extension panel browser | `CHROMIUM_PATH=/usr/bin/google-chrome node codingagentlib/vscode/test/conflict-browser.cjs` | Passed inert rendering, recovery drafts, output navigation, Plan/Build drafting and stale verification checks |
| App browser readiness | `CHROMIUM_PATH=/usr/bin/google-chrome node scripts/verify-app-readiness.cjs --report /tmp/improve-app-readiness-final.json` | **8 workflows passed, 0 failures**; includes shared coverage across **all 24 apps** |
| VSIX package | `npm --prefix codingagentlib/vscode run package -- --target linux-x64` | Built **rabbithole-linux-x64-0.30.0.vsix**, 40 archive entries; verified native platform marker, worker, generated helpers and new host modules; no test/node_modules payload |
| Packaging-tool dependencies | `npm --prefix codingagentlib/vscode audit --json` | **0 vulnerabilities reported** after updating VSCE/compatible transitive dependencies and its scoped minimatch override |
| SDK documentation | `python3 codingagentlib/scripts/check_docs_index.py` | **358 existing nonignored SDK files indexed**, matching the stated inventory; 0 broken relative links |
| Generated contracts | `python3 codingagentlib/scripts/generate_contracts.py --check` | Passed |

Browser commands above resolved Playwright through
`NODE_PATH=/home/dirk/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules`.
The app runner owns its disposable relay configuration/workspace. It ran
`inventory-fields`, `inventory`, `capabilities`, `recovery`, and the CNCF, SVG,
rich-text and spreadsheet browser tests. Coverage includes native reviewed edits
and recovery, CNCF SVG/YAML/JSON export and actual re-import, SVG sanitization and
SVG/PNG downloads, rich-text import/export, spreadsheet XLSX round-trip and atomic
invalid-import rejection. It is not an exhaustive format compatibility matrix.

Exact Python gate:

```sh
python3 -m unittest codingagentlib.test_core codingagentlib.test_beyond_react codingagentlib.test_react codingagentlib.test_memory_architectures codingagentlib.test_memory_manager codingagentlib.test_pyenv_harness codingagentlib.test_providers codingagentlib.test_react_protocols codingagentlib.test_runtime_tools codingagentlib.test_sdk_packages codingagentlib.test_extension_pack codingagentlib.test_docs_index server.agent_skills_test server.skill_catalog_test desktop-tauri/scripts/test_prepare.py
```

## Fixes and improved evidence

- Composer file mentions retain `#page=N` through resolution and native session
  transport. Invalid/unavailable pages no longer silently select another page.
- Combined text-reference previews now debit every preview from their shared
  48,000-character budget and preserve Unicode pairs. Media remains separately
  bounded; omitted text is identified explicitly.
- The default suite gate now runs `javascript/protocols-test.cjs` and the new
  evaluation fixture checker. The documentation checker enforces its actual index
  section and inventory count, rather than accepting a later stray link.
- The evaluation suite now contains five tasks, including two-module CSV/Decimal
  aggregation and large-source paginated catalog search. Reference repairs and
  negative partial repairs validate the held-out checkers. Real relay/runtime
  replay passes the multi-file and paged-source cases, independent review and
  handoff cases; the deliberate test-tampering case is correctly rejected.
  **These are deterministic replay results, not model success rates.**
- Failed evaluation runs now fetch the available final native audit after
  cancellation. A simulated provider outage after two actual tool calls verifies
  that executed work is retained in failure metrics instead of reporting zero.
- The CNCF browser test now follows the actual automatic export-dialog close and
  exercises the import paths it previously only mentioned in a comment.
- The extension README reflects RabbitHole package naming and native multimodal
  input support. Duplicate status entries were removed; older evidence is retained
  below as historical.

Remaining qualification: live external provider trials, third-party MCP/A2A
interoperability, Windows/macOS runtime/editor-host checks, installed-VSIX UI and
approval-dialog automation, and Docker sandbox acceptance were not performed in
this run. Registry/Marketplace publication is not established. The actual editor
host check uses the development extension and deterministic callbacks; its scope
must not be expanded into a claim of complete end-to-end editor/provider coverage.

## Historical evidence (not current gate totals)

**Date:** 2026-11-18  
**Verification Scope:** Automated Node.js unit/model gates, Python `unittest` suites, and Rust `cargo test` (`--test core`). Browser Playwright suites (`*-browser-test.cjs`) were not executed in this environment because the `playwright` npm package is not installed locally.

## 1. Gate Summary

| Gate | Command | Result |
| --- | --- | --- |
| Suite JS Unit Gate | `node scripts/verify-suite.cjs` | **153 checks, 0 failures** |
| Coding Agent Python SDK | `python3 -m unittest codingagentlib.test_core ... test_providers` | **41 tests, OK (1 skipped)** |
| Server & Desktop Packaging | `python3 -m unittest server.agent_* server.skill_catalog_test desktop-tauri/scripts/test_prepare.py` | **87 tests, OK** |
| Rust Core SDK | `cargo test --locked --no-default-features --manifest-path codingagentlib/rust/Cargo.toml --test core` | **4 passed, 0 failed** |

## 2. All 24 Apps Status

Every app has `index.html` (`lang="en"`), TLAL OS theme, `SuiteAgentAdapter`, `assets/icons/<app>.svg`, native prompt starters (`shared-ai/prompt-library-core.js`), workspace recipes (`shared-suite/workspace-recipes.js`), and unit + browser test suites.

| App | Category | Unit Test(s) in `verify-suite.cjs` | Status |
| --- | --- | --- | --- |
| `appiX` | UI / SPA Builder | `designer-test.cjs`, `project-test.cjs`, `rust-export-test.cjs` | Verified (Unit) |
| `architex` | Architecture Diagrams | `ai-test.cjs`, `chat-format-test.cjs`, `exposure-test.cjs`, `hierarchy-layout-test.cjs`, `layout-test.cjs`, `mermaid-test.cjs`, `port-model-test.cjs`, `rst-scope-test.cjs`, `validation-test.cjs` | Verified (Unit) |
| `automatextiX` | Workflow Automation | `ai-rounds-test.cjs`, `call-steps-test.cjs`, `engine-test.cjs`, `workspace-files-test.cjs` | Verified (Unit) |
| `cncfiX` | CNCF Landscape Studio | `model-test.cjs` (3/3 pass: schema, YAML round-trip, SVG) | Verified (Unit) |
| `codeiX` | Code Editor | `ai-exclusions-test.cjs`, `project-test.cjs`, `tauri-export-test.cjs` | Verified (Unit) |
| `colabriX` | Collaborative Whiteboard | `model-test.cjs` | Verified (Unit) |
| `designiX` | Graphic Design | `model-test.cjs` | Verified (Unit) |
| `formiX` | Formula Studio | `model-test.cjs` | Verified (Unit) |
| `graphiX` | Vector SVG Editor | `model-test.cjs` (SVG sanitization, bounds, scrubbing) | Verified (Unit) |
| `markiX` | Markdown & RST Editor | `model-test.cjs` | Verified (Unit) |
| `mergiX` | Compare & Merge | `model-test.cjs` | Verified (Unit) |
| `mindiX` | Mind Mapping | `model-test.cjs` | Verified (Unit) |
| `mockiX` | Wireframing & UI Mockups | `design-test.cjs`, `model-test.cjs` | Verified (Unit) |
| `photiX` | Image Editing | `model-test.cjs` | Verified (Unit) |
| `presentiX` | Presentations | `animation-test.cjs`, `project-test.cjs` | Verified (Unit) |
| `projectiX` | Project Planning | `model-test.cjs` | Verified (Unit) |
| `reportiX` | Research & Reports | `report-test.cjs` | Verified (Unit) |
| `rstiX` | RST & Requirements | `drafts-test.cjs`, `github-test.cjs`, `memory-session-test.cjs`, `model-test.cjs` | Verified (Unit) |
| `schematiX` | Schemas & Knowledge | `model-test.cjs` | Verified (Unit) |
| `sheetiX` | Spreadsheets | `fill-test.cjs`, `formulas-test.cjs`, `functions-test.cjs` | Verified (Unit) |
| `shelliX` | AI Shell | `cycle-test.cjs`, `resolutions-test.cjs` | Verified (Unit) |
| `sketchiX` | UML / SysML / GSN / Sketch | `artwork-model-test.cjs`, `gsn-test.cjs`, `model-test.cjs`, `sysml-test.cjs`, `uml-test.cjs` | Verified (Unit) |
| `textiX` | Rich Documents | `embedded-test.cjs` | Verified (Unit) |
| `vidiX` | Video & Motion | `designs-test.cjs`, `editing-test.cjs`, `model-test.cjs` | Verified (Unit) |

## 3. Coding Agent, Server & SDKs Status

- **Server (`server/server.py`)**: Hardened with `X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN`, `Referrer-Policy: same-origin`, `Permissions-Policy`. All 87 server/packaging tests pass.
- **Python SDK (`codingagentlib/python/`)**: `ReactAgent`, `PythonEnvironments` (`uv` + `venv`), `ScriptLibrary` + `script_run`, `runtime_tools` / `script_tools` / `program_tools` / `script_library_tools`, `CoreAgent.async_run`, `Runtime(..., command_wrapper=...)`, `MemoryManager`, `UnifiedMemorySuite` (`StructMem`, `egGENT`, `A-MEM`, `MAGMA`, `GAM`), `decision_model`, `rememberSessions` (default `True`), and 4 provider adapters + `with_retry` + `tool_schemas` (`arguments` fallback). 56 unit/integration tests pass (`codingagentlib.test_core`, `test_beyond_react`, `test_react`, `test_memory_architectures`, `test_memory_manager`, `test_pyenv_harness`, `test_providers`, `test_runtime_tools`, `test_sdk_packages`, `server.agent_skills_test`, `server.skill_catalog_test`, `desktop-tauri/scripts/test_prepare.py`).
- **JavaScript / TypeScript SDK (`codingagentlib/javascript/`)**: `loop.js` (`decisionModel`, `agentMemory`, `script_run` evidence), `context.js` (`compressConversation`), `providers.js` + `providers.d.ts` (OpenAI, Anthropic, Gemini, Ollama, `withRetry`, `toolSchemas`, `parseProviderResponse`, `openAIToolModel`, `anthropicToolModel`, `geminiToolModel`, `toolUseToReactModel`), `local.js` + `local.d.ts` + `index.d.ts` (`LocalRuntime.coreTools`, `scriptTools`, `programTools`, `toolLibrary`). Included in the 154-check `verify-suite.cjs` gate (0 failures).
- **Rust SDK (`codingagentlib/rust/`)**: `cargo test --locked --no-default-features --test core --test beyond_react` → 5 passed, 0 failed (`core`: 4, `beyond_react`: 1); `cargo test --locked --test native` → 17 passed, 0 failed (0 warnings; includes `delete_script`, `tools::schema`, and `core_tools`/`script_tools`/`program_tools`).
- **Standalone Packaged SDKs & Docs Index (`codingagentlib/scripts/package_sdk.py`, `check_docs_index.py`)**: `generate_contracts.py --check` passed; `check_docs_index.py` verified 329 tracked files indexed with 0 broken relative links; `codingagentlib.test_sdk_packages` passed.

## 2026-11-20 — SDK file and integration HOWTO documentation

Scope: added `codingagentlib/HOWTO.md`, linked it from the library README, and
indexed all 300 source files including the new guide. This is documentation work;
no runtime API or cross-language parity changes were made.

Directly observed checks for this update:

- Local documentation check: all 300 source paths appear in the index and every local Markdown link in the HOWTO resolves.
- HOWTO generic JavaScript example: executed with its deterministic model and real registered lookup callback; returned `complete`.
- HOWTO HTML inline example: executed with the real `EmbeddedAgent` in a JavaScript VM and mocked HTTP model replies; returned `complete`. This is not a browser rendering check or a live provider call.
- `python3 codingagentlib/scripts/generate_contracts.py --check`: passed.
- `node scripts/verify-suite.cjs`: 154 checks, 0 failures.
- `python3 -m unittest codingagentlib.test_core codingagentlib.test_beyond_react codingagentlib.test_react codingagentlib.test_memory_architectures codingagentlib.test_memory_manager codingagentlib.test_pyenv_harness codingagentlib.test_providers server.agent_skills_test server.skill_catalog_test desktop-tauri/scripts/test_prepare.py`: 47 tests, OK.
- `cargo test --locked --no-default-features --manifest-path codingagentlib/rust/Cargo.toml --test core --test beyond_react`: 4 core tests and 1 beyond-ReAct test passed. The compiler reported the existing unused `TsNode.action` field warning.
- `git diff --check`: passed for the documentation changes.

No live provider, remote MCP interoperability, browser screenshot or VSIX packaging
check was performed for this documentation update. Earlier status sections above
are historical snapshots and are not replaced by these scoped results.

## 2026-11-20 — Future SDK documentation maintenance instructions

Added the `sdk-integration-docs` repository skill and SDK Documentation Maintainer
agent profile. Root `AGENTS.md`, the four existing skills and the three existing
agent profiles now direct applicable SDK/integration work to `codingagentlib/HOWTO.md`
and require maintaining its cases, dependency boundaries and source-file index.
Agent profiles remain host guidance and do not automatically grant permissions or
start delegated agents.

Observed validation: `quick_validate.py` from the skill-creator skill passed for
all 5 repository skills; all 15 local links in root instructions, skills and agent
profiles resolved; `git diff --check` passed. This follow-up changed instructions
and profiles only; runtime gates were not repeated. The preceding HOWTO section
records the actual runtime checks performed for that documentation update.

## 2026-11-20 — Consolidated library Markdown guides

Merged the six root-level codingagentlib guides (file/integration HOWTO, portable
SDK, embedding integration, coding guide, model handoff and model collaboration)
into `codingagentlib/README.md`, and removed the standalone guide files. Rust and
VS Code retain their component READMEs. Repository links, skills and agent profiles
now point to explicit section anchors in the consolidated README.

Observed documentation checks: 613 local links resolved, all referenced merged
section anchors were present (73 explicit anchors defined), all 294 remaining
SDK source files appeared in the index, and all 42 original fenced code blocks
were preserved byte-for-byte. `git diff --check` passed. This consolidation changed
Markdown only; runtime, browser, provider and packaging checks were not repeated.
The earlier HOWTO validation entry records the executed runtime checks for the
underlying examples. The HOWTO is now a section of the library README rather than
a separate file; earlier entries above describe historical paths and counts.

## 2026-11-20 — Ignore-rule maintenance

Consolidated root ignore rules for nested dependencies, Python environments/caches,
coverage/browser reports, build outputs and conventional local relay configuration.
Environment example/sample/template files remain visible. Clarified VS Code native
worker, generated handoff copy and VSIX exclusions.

Observed validation: `git check-ignore --no-index` matched all 35 representative
generated/private paths and left all 17 representative source/template/fixture
paths visible. `git ls-files -ci --exclude-standard` returned no tracked files;
`git diff --check` passed. No runtime files changed and runtime suites were not
repeated for this ignore-rule update.

## 2026-11-20 — Capability access and field-aware inventories in all 24 apps

Implemented shared field contains/equality/empty filters, finite numeric bounds,
and stable numeric/natural sorting with missing values last. Filtered exports
include all matching rows; selection identities, stale-source checks, CSV formula
protection and AI-excluded-file guards remain in force. Wired Tool actions in
markiX, formiX, cncfiX and mockiX (23 document editors now have the panel).

Added a separate read-only shelliX command inventory that joins attempts to actual
receipts, distinguishes passed/failed/unknown outcomes, filters/sorts/pages and
exports JSON/CSV, and rejects export after the audit snapshot changes. It never
restores audit events or dispatches a command. Added native CNCF category-slot name
sorting, parser-based Markdown/RST heading inventory, hard-break/code-preserving
markup cleanup, and bounded lock-aware mockiX grid alignment.

Observed verification:

- `node scripts/verify-suite.cjs`: 154 checks, 0 failures, including expanded hub-core and capability unit checks for literal filters, finite bounds, stable identity, nonmutation, command receipt states, source preservation and bounded edits.
- `python3 -m unittest codingagentlib.test_core codingagentlib.test_beyond_react codingagentlib.test_react codingagentlib.test_memory_architectures codingagentlib.test_memory_manager codingagentlib.test_pyenv_harness codingagentlib.test_providers server.agent_skills_test server.skill_catalog_test desktop-tauri/scripts/test_prepare.py`: 47 tests, OK.
- `cargo test --locked --no-default-features --manifest-path codingagentlib/rust/Cargo.toml --test core --test beyond_react`: 5 tests passed; existing unused `TsNode.action` warning remains.
- `CHROMIUM_PATH=/usr/bin/google-chrome node shared-suite/inventory-fields-browser-test.cjs`, with Playwright resolved through the prepared runtime's `NODE_PATH`: passed across all 24 registered apps. It checks each document app's native inventory/action availability, exercises field filtering/sorting/export with deterministic inventory-provider rows, checks unchanged native documents and no unsolicited execution, and verifies native preview/Apply/recovery in the four newly wired document editors. shelliX receipt filtering/export and stale-audit protection passed with a deterministic audit snapshot.
- `shared-suite/inventory-browser-test.cjs`, with the same Chrome configuration and a private temporary server through `BASE_URL`: passed multi-page selection, full filtered export, stale-source rejection and AI-excluded-file protection.
- `shared-suite/capabilities-browser-test.cjs`, with the same Chrome/server configuration: passed native action validation/review/recovery/CSV/AI-draft checks across its 13 app pages and two sketch sub-editors, real architecture-workbook transfer into sheetiX, and safe heading-anchor handling. Updated its stale codeiX input selector and seeded the actual reportiX source fixture needed by source-dependent actions; production validation guards were not weakened.
- Desktop/mobile Chrome layout smoke checks: CNCF workspace and shell command inventory stayed within dialog width at a 390px viewport; screenshots were captured under `/tmp` and inspected. Shell inventory header/controls remain usable in the narrow layout.
- JavaScript syntax checks and `git diff --check`: passed.

This is a shared capability improvement across the suite, not an exhaustive audit
of every native feature. Live AI/provider calls, real shell command execution,
remote interoperability and a rebuilt desktop installer were not tested here.
Earlier unrelated documentation and ignore-rule changes remain in the checkout.

## 2026-11-20 — Per-app view, tool and dependency summary

Added `codingagentlib/apps.md` with one overview row and detailed section for each
of the 24 registered apps: native views/editor responsibilities, data/format paths,
platform/backend requirements, current direct app/cross-app script dependencies
and a representative workflow. It distinguishes 4 proposal-only pages, 19 pages
loading the shared coding UI, and shelliX's separate integration. It explicitly
separates descriptive editor tools from actual advertised LLM tool names and
optional services from basic local editing requirements.

Linked the map from the library README, added it to the complete SDK source index,
and updated root instructions and the app-builder/integration-docs skills to keep
it current. Observed source-level validation: all 24 sections/profile rows matched
the app registry and entry-page coding script wiring; referenced entry-page script
paths resolved; 580 local links across the changed map/README/instructions/skills
resolved; all 295 current SDK source files were indexed. Both changed skills passed
`quick_validate.py`; `git diff --check` passed. No runtime code changed, and runtime,
provider, browser or packaging checks were not repeated for this documentation.

## Two-view SDK example verification (2026-11-21)

Scope: new standalone teaching host; existing unrelated worktree changes were
present during these commands. This is not deployment or live-provider evidence.

- `cargo build --locked --manifest-path codingagentlib/rust/Cargo.toml --example two_views`: passed; existing unused `TsNode.action` warning.
- `python3 codingagentlib/examples/two-views/verify.py`: **27 integration scenarios passed**, exercising all three language hosts through HTTP, both distinct edit tools, rejected colors, clarification, foreign-origin rejection and a local mocked chat-completions provider editing both views within three SDK steps.
- `node scripts/verify-suite.cjs`: **154 checks, 0 failures**.
- `python3 -m unittest codingagentlib.test_core codingagentlib.test_beyond_react codingagentlib.test_react codingagentlib.test_memory_architectures codingagentlib.test_memory_manager codingagentlib.test_pyenv_harness codingagentlib.test_providers server.agent_skills_test server.skill_catalog_test desktop-tauri/scripts/test_prepare.py`: **47 tests, OK**.
- `cargo test --locked --no-default-features --manifest-path codingagentlib/rust/Cargo.toml --test core --test beyond_react`: **4 core + 1 beyond_react tests passed**, no failures.
- Browser rendering, interactive download and live external model calls were not verified. Playwright was unavailable (`No Playwright` from module-resolution probe). The UI renders and exports public trace events after each bounded run returns.

## Extension Pack v1.2 verification (2026-11-21)

Implementation: [extension host](../codingagentlib/extension_pack/README.md),
[normative specification](EXT-SPEC.md), [requirement map](EXT-IMPLEMENTATION.md).
The Python adapter is opt-in and reuses public SDK configuration; it does not
change the host execution loop or imply JavaScript/Rust extension-pack parity.
Unrelated checkout changes were present during these checks.

- `TLAL_EXTENSION_SANDBOX_IMAGE=$(docker image inspect tlal-extension-sandbox:test --format '{{.Id}}') python3 -m unittest codingagentlib.test_extension_pack -v`: **23 tests, OK**, no skips (final run: 29.702 s). Includes host conformance with the adapter loaded/unloaded, exact approval resume, SIGKILL lease recovery, checkpoint branching, current-source/session verification gates, redaction/append-only audit, token/monetary ceilings and restart lineage, concurrent Git indexes and crash cleanup, authenticated A2A card/task state transitions, progressive skills/fresh-clone inspection/memory caps, headless UI suppression and local policy/redaction p95 <50 ms assertion.
- Real Docker image used: `sha256:8dc5129dd71f20392ead4cb2d477471071d66239a00e923a577aefaaa4a28d1f`, built with `codingagentlib/extension_pack/sandbox-image/Dockerfile` and the available reviewed development base. Runtime UID 65534, network none, no-new-privileges, dropped capabilities, read-only root/source and resource limits remained enabled.
- Real sandbox code-action benchmark: **5 sequential model calls vs. 2 consolidated calls (60% reduction)** with equal outputs. Checked non-root UID, no-new-privileges, memory ceiling, blocked external network and rejected source writes.
- Real Chromium/WebDriver flow in that container: **6 checks passed** (navigation, SVG edit, form submission, rich-text DOM, trace, export payload). Docker is the isolation boundary; Chromium's nested sandbox was disabled because the container forbids its setuid/user-namespace setup. No browser ran on the host. This supplies browser evidence for the earlier two-view example.
- `node scripts/verify-suite.cjs`: **154 checks, 0 failures**.
- `python3 -m unittest codingagentlib.test_core codingagentlib.test_beyond_react codingagentlib.test_react codingagentlib.test_memory_architectures codingagentlib.test_memory_manager codingagentlib.test_pyenv_harness codingagentlib.test_providers server.agent_skills_test server.skill_catalog_test desktop-tauri/scripts/test_prepare.py`: **47 tests, OK** (final run: 40.862 s).
- `cargo test --locked --no-default-features --manifest-path codingagentlib/rust/Cargo.toml --test core --test beyond_react`: **4 core + 1 beyond_react passed**. Existing unused `TsNode.action` warning remains.
- `python3 codingagentlib/scripts/generate_contracts.py --check`: passed; public SDK wire contracts unchanged.
- `PYTHONPATH=. python3 codingagentlib/examples/extension_pack_demo.py`: passed. Actual MCP read, verification pause, real Git diff check and normal SDK resume reached `complete`; 13 retained checkpoints and valid audit chain.
- `python3 -m pip wheel --no-deps --no-build-isolation --wheel-dir /tmp/tlal-extension-wheel ./codingagentlib`: passed. Final wheel SHA-256 `fdde3ac5e8b184a819039d1edabe0f92d561b868f5d7cb70da9528c44af92c6f`; isolated import outside the checkout found extension version 1.2.0 and bundled policy/skill resources. **22** added extension source/document files are indexed; changed extension/spec links resolve.

Evidence boundaries: scanner commands and Reviewer/SecurityAuditor callbacks are
trusted host integrations; missing receipts block completion and are not reported
as scans having passed. The tests do not establish external OAuth-provider trust,
provider billing correctness, cloud redeployment, third-party host compatibility,
or restoration of arbitrary external side effects. Checkpoint replay restores
agent state; the host restores matching source/artifact snapshots before writes.
Local SQL/hash-chain audit protection needs a trusted remote/WORM sink against a
privileged attacker replacing the entire state database. No publishing or push
was performed.

## Agent library documentation refresh (2026-11-21)

Documentation-only refresh: HOWTO selection cases for the Python extension pack
and cross-language two-view UI; handbook lifecycle/message walkthroughs;
extension exports/defaults/hooks/troubleshooting; Rust host dependency boundary;
and detailed source-index responsibilities. Corrected the retry description to
match raised callback errors and documented explicit wiring for failed check
values. Runtime source was unchanged in this refresh.

Observed checks:

- SDK inventory comparison against existing nonignored Git files: **326 files**, complete source-index coverage.
- Relative-link check across the five edited SDK/handbook guides: **398 targets resolved**; all **4 new navigation anchors** resolved.
- `PYTHONPATH=. python3 codingagentlib/examples/extension_pack_demo.py`: passed; normal completion, 13 checkpoints, valid audit chain.
- `python3 codingagentlib/examples/two-views/verify.py`: **27 integration scenarios passed** for Python, JavaScript and Rust, deterministic and mocked-provider modes.
- Focused `git diff --check`: passed for edited tracked documentation. Full runtime/browser/live-provider gates were not rerun for this documentation-only refresh; earlier results above retain their original scope.

## SDK Parity, TypeScript Typings, HTTP MCP & Packaging Refresh (2026-11-21)

Scope: added native Rust provider adapters and tool-use normalization (`codingagentlib/rust/src/providers.rs`, `codingagentlib/rust/tests/providers.rs`), Streamable HTTP MCP transport in JavaScript (`httpMcpTransport` in `codingagentlib/javascript/mcp-transports.js`), TypeScript declaration files for the remaining `codingagentlib/javascript/` exports (`adapters.d.ts`, `beyond-react.d.ts`, `embedded.d.ts`, `extensions.d.ts`, `integration.d.ts`, `mcp-transports.d.ts`, `state-machine.d.ts`, `tool-routing.d.ts`, `tree-search.d.ts`, updated `index.d.ts`), and packaging/type-entry updates in `codingagentlib/scripts/package_sdk.py`, plus source-index updates in `codingagentlib/README.md`.

Observed checks:

- `python3 codingagentlib/scripts/check_docs_index.py`: **OK: 340 tracked files indexed, 0 broken relative links**.
- `python3 codingagentlib/scripts/generate_contracts.py --check`: passed.
- `python3 codingagentlib/scripts/package_sdk.py --out /tmp/sdk-test-parity`: passed.
- `node codingagentlib/javascript/mcp-transports-test.cjs`: passed (including `httpMcpTransport` `Mcp-Session-Id` and endpoint validation).
- `node scripts/verify-suite.cjs`: **154 checks, 0 failures**.
- `cargo test --locked --no-default-features --manifest-path codingagentlib/rust/Cargo.toml --test core --test beyond_react --test providers`: **7 passed, 0 failed** (`core`: 4, `beyond_react`: 1, `providers`: 2).
- `cargo test --locked --manifest-path codingagentlib/rust/Cargo.toml`: **52 passed, 0 failed** across all unit and integration test targets (0 warnings).
- `python3 -m unittest codingagentlib.test_core codingagentlib.test_beyond_react codingagentlib.test_react codingagentlib.test_memory_architectures codingagentlib.test_memory_manager codingagentlib.test_pyenv_harness codingagentlib.test_providers codingagentlib.test_react_protocols codingagentlib.test_runtime_tools codingagentlib.test_sdk_packages server.agent_skills_test server.skill_catalog_test desktop-tauri/scripts/test_prepare.py`: **63 tests, OK**.

## VS Code Extension: Skills, Agents, Guardrails, `/` Commands & `@` Mentions (2026-11-21)

Scope: added `codingagentlib/vscode/src/agent-library.cjs` (workspace `.agents/skills/*/SKILL.md` and `.extension/skills/*/SKILL.md` discovery/matching, built-in and workspace `.agents/agents/*.md` / `.extension/agents/*.md` persona selection, destructive command guardrails, and secret redaction), `codingagentlib/vscode/src/chat-commands.cjs` (`/goal`, `/plan`, `/build`, `/review`, `/skills`, `/agents`, `/tools`, `/memory`, `/help` and `@selection`, `@problems`, `@changes`, `@workspace`, `@file:`, `@skill:`, `@agent:`, `@memory:`), composer autocomplete menu in `codingagentlib/vscode/media/panel.js` + `panel.css`, and integration in `codingagentlib/vscode/src/controller.cjs` and `extension.cjs`, plus `codingagentlib/vscode/test/chat-commands-and-library.test.cjs`.

Observed checks:

- `npm --prefix codingagentlib/vscode test`: **158 tests, 158 passed, 0 failed**.
- `python3 codingagentlib/scripts/check_docs_index.py`: **OK: 354 tracked files indexed, 0 broken relative links**.
- `node scripts/verify-suite.cjs`: **154 checks, 0 failures**.
- `git diff --check`: **passed**.

## Multi-File & Large-Content Paging Across Agent Library, VS Code & Apps AI Chat (2026-11-21)

Scope: added batch `read_files` with per-file `offset`/`limit` paging and a 64,000-character combined budget in both Python (`codingagentlib/python/agent_runtime.py`) and Rust (`codingagentlib/rust/src/tools.rs`), surrogate-safe text attachment paging (`paginateText`, `summarizeAttachments`, `readAttachmentPage` with `@file:path#page=N`) in `codingagentlib/vscode/src/attachments.cjs` and `extension.cjs`, and multimodal-preserving large-text paging + `manifest.files.totalCharacters`/`totalPages` summaries in `shared-ai/paging.js`, plus `agent-library.cjs`/`chat-commands.cjs` bundling in `codingagentlib/scripts/package_sdk.py`.

Observed checks:

- `node scripts/verify-suite.cjs`: **154 checks, 0 failures** (including `shared-ai/paging-test.cjs` and `shared-ai/multimodal-test.cjs`).
- `npm --prefix codingagentlib/vscode run verify` & `npm --prefix codingagentlib/vscode test`: **159 tests, 159 passed, 0 failed**.
- `cargo test --locked --manifest-path codingagentlib/rust/Cargo.toml --test native`: **18 passed, 0 failed** (`read_files_paging_and_batch_budget` included).
- `python3 -m unittest codingagentlib.test_core codingagentlib.test_beyond_react codingagentlib.test_react codingagentlib.test_memory_architectures codingagentlib.test_memory_manager codingagentlib.test_pyenv_harness codingagentlib.test_providers codingagentlib.test_react_protocols codingagentlib.test_runtime_tools codingagentlib.test_sdk_packages server.agent_skills_test server.skill_catalog_test desktop-tauri/scripts/test_prepare.py`: **64 tests, OK**.
- `python3 codingagentlib/scripts/check_docs_index.py`: **OK: 354 tracked files indexed, 0 broken relative links**.
- `python3 codingagentlib/scripts/generate_contracts.py --check`: **passed**.

## All-App Capabilities Expansion & `trackiX` Jira-Style App (2026-11-21)

Scope: expanded `shared-suite/capabilities.js` so all 25 registered apps expose at least two non-executing productivity actions (adding new actions for `schematiX`, `mergiX`, `rstiX`, `mockiX`, `photiX`, `colabriX`, `designiX`, `shelliX`, and `projectiX`, plus `trackiX` inventory and 3 actions), and created `trackiX/` (`index.html`, `style.css`, `model.js`, `render.js`, `app.js`, `ai-adapter.js`, `README.md`, `model-test.cjs`, `browser-test.cjs`) and `assets/icons/trackiX.svg` with full registrations in `shared-suite/apps.js`, `shared-suite/workspace-recipes.js`, `shared-ai/prompt-library-core.js`, `server/skill_catalog.py`, `desktop-tauri/scripts/prepare.py`, `scripts/verify-suite.cjs`, and `codingagentlib/apps.md`.

Observed checks:

- `node trackiX/model-test.cjs`: **passed**.
- `node shared-suite/capabilities-test.cjs`: **passed** (all 25 registered `SuiteApps` expose `>= 2` actions and inventories).
- `node shared-ai/native-starters-test.cjs`: **passed** (3 actionable native starting points for each of 25 apps).
- `node scripts/verify-suite.cjs`: **158 checks, 0 failures** (including `trackiX/model-test.cjs`).
- `python3 -m unittest server.skill_catalog_test desktop-tauri/scripts/test_prepare.py`: **20 tests, OK** (25 registered apps).
- `git diff --check`: **passed**.
- `git diff --check`: passed.

Remaining boundaries: live external LLM provider calls, remote MCP/A2A interoperability, registry publishing (`"published": false`), and Windows/macOS Rust runtime execution were not exercised in this environment.

## Cross-Language Protocols & Observability Parity (2026-11-21)

Scope: added A2A (`agentCard`/`agent_card`, `A2AServer`, `A2AClient`, `a2aDelegationTool`), SSE/AG-UI/Zed ACP streaming (`formatSse`/`format_sse`, `agUiEvents`/`ag_ui_events`, `SSEStreamBridge`, `ACPServer`), and OpenTelemetry GenAI semantic conventions (`TraceContext`, `GenAISpan`, `GenAITracer`, `ReactOtelObserver` / OTLP JSON export) to both JavaScript/TypeScript (`codingagentlib/javascript/a2a.js`, `streaming.js`, `otel-genai.js`, `.d.ts` files, `protocols-test.cjs`) and Rust (`codingagentlib/rust/src/a2a.rs`, `streaming.rs`, `otel_genai.rs`, `tests/protocols.rs`), plus `agent-protocols` / `codingagentprotocols` in `codingagentlib/scripts/package_sdk.py` and `codingagentlib/test_sdk_packages.py`.

Observed checks:

- `python3 codingagentlib/scripts/check_docs_index.py`: **OK: 351 tracked files indexed, 0 broken relative links**.
- `python3 codingagentlib/scripts/generate_contracts.py --check`: **passed**.

## All-App Capabilities Expansion & `trackiX` Jira-Style App (2026-11-21)

Scope: expanded `shared-suite/capabilities.js` so all 25 registered apps expose at least two non-executing productivity actions (adding new actions for `schematiX`, `mergiX`, `rstiX`, `mockiX`, `photiX`, `colabriX`, `designiX`, `shelliX`, and `projectiX`, plus `trackiX` inventory and 3 actions), and created `trackiX/` (`index.html`, `style.css`, `model.js`, `render.js`, `app.js`, `ai-adapter.js`, `README.md`, `model-test.cjs`, `browser-test.cjs`) and `assets/icons/trackiX.svg` with full registrations in `shared-suite/apps.js`, `shared-suite/workspace-recipes.js`, `shared-ai/prompt-library-core.js`, `server/skill_catalog.py`, `desktop-tauri/scripts/prepare.py`, `scripts/verify-suite.cjs`, and `codingagentlib/apps.md`.

Observed checks:

- `node trackiX/model-test.cjs`: **passed**.
- `node shared-suite/capabilities-test.cjs`: **passed** (all 25 registered `SuiteApps` expose `>= 2` actions and inventories).
- `node shared-ai/native-starters-test.cjs`: **passed** (3 actionable native starting points for each of 25 apps).
- `node scripts/verify-suite.cjs`: **158 checks, 0 failures** (including `trackiX/model-test.cjs`).
- `python3 -m unittest server.skill_catalog_test desktop-tauri/scripts/test_prepare.py`: **20 tests, OK** (25 registered apps).
- `git diff --check`: **passed**.
- `node codingagentlib/javascript/protocols-test.cjs`: **passed**.
- `node scripts/verify-suite.cjs`: **154 checks, 0 failures**.
- `cargo test --locked --no-default-features --manifest-path codingagentlib/rust/Cargo.toml --test core --test beyond_react --test providers --test protocols`: **10 passed, 0 failed** (`core`: 4, `beyond_react`: 1, `providers`: 2, `protocols`: 3).
- `cargo test --locked --manifest-path codingagentlib/rust/Cargo.toml`: **55 passed, 0 failed** across all unit and integration test targets (0 warnings).
- `python3 -m unittest codingagentlib.test_core codingagentlib.test_beyond_react codingagentlib.test_react codingagentlib.test_memory_architectures codingagentlib.test_memory_manager codingagentlib.test_pyenv_harness codingagentlib.test_providers codingagentlib.test_react_protocols codingagentlib.test_runtime_tools codingagentlib.test_sdk_packages server.agent_skills_test server.skill_catalog_test desktop-tauri/scripts/test_prepare.py`: **63 tests, OK**.
