# TLAL OS · Repository Agent Instructions

This repository contains 24 local-first single-page apps, shared UI/AI/agent modules (`shared-suite/`, `shared-ai/`, `shared-agent/`), the local Python relay (`server/`), the multi-language Coding Agent SDK (`codingagentlib/` in Python, JavaScript/TypeScript, and Rust), and the optional Tauri 2 desktop shell (`desktop-tauri/`).

## Spec-Driven Development
- Read [specs/README.md](specs/README.md) and the relevant spec (`specs/SUITE-SPEC.md`, `specs/CODING-AGENT-SPEC.md`, `specs/CNCFIX-SPEC.md`) before making architectural changes.
- Update [specs/APPS-STATUS-REPORT.md](specs/APPS-STATUS-REPORT.md) with only directly observed test counts and command outputs.

## SDK Documentation and Integration Guidance
- For app-specific views, tools, script dependencies and backend requirements, consult [codingagentlib/apps.md](codingagentlib/apps.md) and maintain its app summary when those integrations change.
- For `codingagentlib/` changes or SDK integration questions, read [codingagentlib/README.md#howto](codingagentlib/README.md#howto) first to select the browser, Node, Python, Rust, worker or editor integration. Consult only the linked detailed references relevant to the task.
- Keep the HOWTO integration cases, dependency requirements, examples and complete source-file index current when adding, removing or renaming SDK files or changing public APIs, protocols, exports or runtime requirements. Update the related README, SDK/integration reference and book examples when their described behavior changes.
- Preserve the distinction between standalone browser scripts, CommonJS/bundled modules and host-only filesystem/process code. Do not imply that all languages expose the same optional features or that a model callback grants filesystem access.
- Use the repository [SDK integration documentation skill](.agents/skills/sdk-integration-docs/SKILL.md) for this work. Agent profiles in [.agents/agents/](.agents/agents/) include documentation responsibilities; they are guidance for the host, not automatic delegation or permission grants.

## Verification Gates
- **Suite JS unit gate**: `node scripts/verify-suite.cjs`
- **Python SDK & server**: `python3 -m unittest codingagentlib.test_core codingagentlib.test_beyond_react codingagentlib.test_react codingagentlib.test_memory_architectures codingagentlib.test_memory_manager codingagentlib.test_pyenv_harness codingagentlib.test_providers server.agent_skills_test server.skill_catalog_test desktop-tauri/scripts/test_prepare.py`
- **Rust SDK**: `cargo test --locked --no-default-features --manifest-path codingagentlib/rust/Cargo.toml --test core --test beyond_react`

## Safety & Code Conventions
- Never execute untrusted imported documents, SVGs, skills, or workflows.
- Keep `shared-suite/` changes compatible with all 24 registered apps.
- Prefer small, single-purpose modules and preserve existing comments/docstrings.
