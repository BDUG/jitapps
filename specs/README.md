# Spec-Driven Development (SDD)

This directory tracks formal specifications, acceptance criteria, and live verification status for the TLAL OS suite, its 24 local-first apps, the Coding Agent, and the Python / JavaScript / Rust SDKs.

## Workflow

1. **Specify** (`*-SPEC.md`): Define scope, contracts, invariants, security boundaries, and acceptance criteria before or alongside implementation.
2. **Implement**: Build against the specification without weakening existing invariants or contracts.
3. **Verify**: Execute deterministic unit, integration, and packaging checks (`node scripts/verify-suite.cjs`, `python3 -m unittest ...`, `cargo test ...`).
4. **Report** (`APPS-STATUS-REPORT.md`): Record only directly observed test commands, counts, and outcomes. Unexecuted checks (such as browser suites when Playwright is absent) must be marked explicitly rather than claimed as passing.

## Index

- [SUITE-SPEC.md](SUITE-SPEC.md) — Suite-wide architecture, security, UX, and app contract invariants across all 24 apps.
- [CODING-AGENT-SPEC.md](CODING-AGENT-SPEC.md) — Coding Agent runtime, `ReactAgent`, `uv` Python environments, `ScriptLibrary`, `MemoryManager`, `StructMem`/`egGENT`/`A-MEM`/`MAGMA`/`GAM`, conversation compression, and SDKs.
- [Coding Agent & SDK Handbook](../docs/coding-agent-book/HANDBOOK.md) — Practical cookbooks for Python, JavaScript/TypeScript, Rust, and the CLI.
- [CNCFIX-SPEC.md](CNCFIX-SPEC.md) — `cncfiX` CNCF Landscape Diagram Builder specification.
- [APPS-STATUS-REPORT.md](APPS-STATUS-REPORT.md) — Current implementation and test-verification status report for all 24 apps, server, and SDKs.
