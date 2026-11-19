# TLAL OS · Repository Agent Instructions

This repository contains 24 local-first single-page apps, shared UI/AI/agent modules (`shared-suite/`, `shared-ai/`, `shared-agent/`), the local Python relay (`server/`), the multi-language Coding Agent SDK (`codingagentlib/` in Python, JavaScript/TypeScript, and Rust), and the optional Tauri 2 desktop shell (`desktop-tauri/`).

## Spec-Driven Development
- Read [specs/README.md](specs/README.md) and the relevant spec (`specs/SUITE-SPEC.md`, `specs/CODING-AGENT-SPEC.md`, `specs/CNCFIX-SPEC.md`) before making architectural changes.
- Update [specs/APPS-STATUS-REPORT.md](specs/APPS-STATUS-REPORT.md) with only directly observed test counts and command outputs.

## Verification Gates
- **Suite JS unit gate**: `node scripts/verify-suite.cjs`
- **Python SDK & server**: `python3 -m unittest codingagentlib.test_core codingagentlib.test_beyond_react codingagentlib.test_react codingagentlib.test_memory_architectures codingagentlib.test_memory_manager codingagentlib.test_pyenv_harness codingagentlib.test_providers server.agent_skills_test server.skill_catalog_test desktop-tauri/scripts/test_prepare.py`
- **Rust SDK**: `cargo test --locked --no-default-features --manifest-path codingagentlib/rust/Cargo.toml --test core --test beyond_react`

## Safety & Code Conventions
- Never execute untrusted imported documents, SVGs, skills, or workflows.
- Keep `shared-suite/` changes compatible with all 24 registered apps.
- Prefer small, single-purpose modules and preserve existing comments/docstrings.
