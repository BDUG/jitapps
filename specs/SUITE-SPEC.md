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
