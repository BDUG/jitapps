# TLAL OS Suite Specification

## 1. Scope & Architecture
- **24 local-first single-page apps** sharing `shared-suite/` (workspace, virtual disk, Content Hub, templates, project ZIP, search/replace, quality baselines, TLAL OS theme), `shared-ai/` (provider chat, paging, multimodal, prompt library), and `shared-agent/` (coding agent UI, loop, review, inspection).
- **Local Python Relay (`server/server.py`)**: Serves all static apps, AI provider relay (`/api/chat`, `/relay`), research crawler (`/api/research`), shared skill catalog (`/api/skills`), project storage (`/api/projects`), and the Coding Agent runtime (`/api/agent`).

## 2. Invariants & Security Requirements
- **Origin & Header Hardening**: `server/server.py` sets `X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN`, `Referrer-Policy: same-origin`, and `Permissions-Policy: camera=(), microphone=(), geolocation=()` on every response.
- **No Unsolicited Execution**: Imported documents, templates, skills, workflows, and SVGs are treated as untrusted data. No `<script>`, `foreignObject`, or remote resource execution occurs on import/render.
- **Native Review & Recovery**: AI proposals and workspace edits pass through native validation (`SuiteAgentAdapter.validate`), revision checks, and undo/recovery backups.
- **App Registration Parity**: Every registered app in `shared-suite/apps.js` must have:
  - `<app>/index.html` with `lang="en"`, TLAL OS theme, and valid script/asset references
  - `assets/icons/<app>.svg`
  - 3 native starter prompts in `shared-ai/prompt-library-core.js` and recipes in `shared-suite/workspace-recipes.js`
  - Entries in `server/skill_catalog.py` and `desktop-tauri/scripts/prepare.py`
  - At least one deterministic unit test registered in `scripts/verify-suite.cjs`

## 3. Acceptance Gate
- `node scripts/verify-suite.cjs` passes with 0 failures.
- `python3 -m unittest server.skill_catalog_test desktop-tauri/scripts/test_prepare.py` passes with 0 failures.

## 4. Inventory and capability access across all apps

- All 23 document editors expose Workspace → Tool actions with native validation,
  reviewed application/recovery and portable inventories. Missing script wiring
  must not leave registered editing capabilities inaccessible.
- Inventory browsing supports literal per-field contains/equality/empty filters,
  finite numeric lower/upper bounds, and stable ascending/descending field sorting.
  Mixed/missing values and invalid numeric input are handled explicitly. Filtering,
  sorting and pagination never modify the native document.
- Filtered exports include every matching record, not only the current page.
  Existing selected-item identity, stale-snapshot checks, AI exclusions and CSV
  formula protection remain in force. Clearing a view resets its filters/sorting.
- shelliX uses its separate workspace and exposes a read-only command receipt
  inventory with equivalent filters/sorting and JSON/CSV export. Audit events and
  executable history are never rewritten or run by inventory operations.
- Acceptance: deterministic query tests cover numeric bounds, mixed values,
  literal untrusted text, stable identity and pagination; browser checks visit all
  24 apps, exercise native capability access and filter/export behavior, and assert
  no document/audit mutation or unsolicited model/command execution.

## 5. Browser readiness evidence

`node scripts/verify-app-readiness.cjs --report /tmp/app-readiness.json` runs
selected inventory, native validation/application, recovery and format workflows
against a disposable relay configuration and workspace. Playwright must be
available; `CHROMIUM_PATH` selects an installed Chromium-compatible executable.
The report preserves each workflow's actual output. This qualification is separate
from the unit gate and does not imply every feature/format or live AI integration
has been verified.
