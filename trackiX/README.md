# trackiX · Agile Issue & Sprint Tracker

Local-first Jira-style issue tracker for TLAL OS with Kanban board, backlog/list view, sprint planning, story-point metrics, Undo/Redo, JSON/CSV export, shared capabilities/inventories, and reviewed AI proposals.

## Files

- [index.html](index.html): 3-pane TLAL OS shell, shared AI chat, workspace/capabilities integration.
- [model.js](model.js): `Trackix` schema, validation, sprint/issue defaults, metrics, and CSV export.
- [render.js](render.js): Kanban 5-column board and table/list renderer.
- [app.js](app.js): Interactive state, Undo/Redo, localStorage persistence, and `TrackixApp` adapter.
- [ai-adapter.js](ai-adapter.js): `SuiteAgentAdapter` registration for reviewed AI editing.
- [model-test.cjs](model-test.cjs) & [browser-test.cjs](browser-test.cjs): Deterministic model and browser tests.
