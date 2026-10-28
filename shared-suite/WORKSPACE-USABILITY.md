# Workspace navigation and inventory browsing

## All 17 apps

Use **Apps** in the app header, or **Alt+Shift+P**, to open **Apps & display**. Search names, categories and capability descriptions. Pin favorites with the star; favorites come first, followed by recently visited tools. Links use the suite's local app routes. Switching the current tab is blocked while the current editor/coding agent is busy; stop the operation first. Ctrl/Cmd-click or middle-click can open another app in a new tab while preserving the active run. Installed custom project apps remain available through the desktop's own management interface.

**Display preferences & keyboard help** offers comfortable/compact control density and reduced interface motion. Preferences are shared by suite tabs on the same browser origin. They do not rewrite app documents, alter artwork colors, or disable video/presentation animations. Reset restores the default display preferences while retaining pinned apps. If browser storage is unavailable, preferences work only in the current tab.

Compact density is optional; it reduces chrome padding. The default comfortable mode remains unchanged. The dialog supports narrow windows, native keyboard focus trapping, labeled controls and Escape. It does not take over a shortcut while another native dialog is open. Workspace commands remain Ctrl/Cmd+K where the editor supports them.

## Native document inventories

Open **Workspace → Tool actions → Refresh inventory**. The browser uses each editor's native inventory extractor, including architecture components/ports, SVG shapes, document paragraphs/headings/links, spreadsheet cells/formulas, source files, no-code nodes, workflow steps, report sources, presentation slides/objects, sketch objects/connections, mind-map topics, project tasks, video clips, image edit steps, design pages/layers and whiteboard objects/discussions.

- Search across record values using one or more terms. Every term must match.
- Sort by document order, label/name, or type/kind without modifying the native document.
- Page through 25 records at a time. Original record indices remain stable across search and sort for selection.
- Select records on any page. Selection remains while filtering; the count makes off-page selections visible. Clear selection explicitly or refresh the inventory.
- Choose **All current items**, **Filtered items** or **Selected items** as the export scope. Existing JSON, Markdown, formula-safe CSV and sheetiX-workbook export formats still apply. Filtering exports every matching record, not just the displayed page.
- **Draft AI request for selected items** copies the selected records as reference data into the app's chat prompt. It does not call a provider, apply an edit or change the document. Review the draft and ensure document context is enabled before requesting changes. CodeiX rejects this shortcut if any selected file is excluded from AI context.

Refreshing resets selection and captures the latest document. If the document changes, scoped exports and selected-item AI drafts require a new refresh rather than silently using stale records. All-items export always reads the current native document. Raw JSON preview is collapsed to keep the panel readable.

## shelliX history

Search commands, loaded stdout/stderr and conversation text with the history search field. **Failed commands only** filters command results by tool error, nonzero exit, timeout or cancellation; it does not delete events or hide relevant chat replies. Search covers currently loaded output, including pages expanded with **Read remaining stdout/stderr**. It does not claim to search output pages that have not been retrieved. Clearing filters restores the retained session display. Command execution, permissions, timeouts, session export and audit events are unchanged.

## Checks

`node shared-suite/hub-core-test.cjs` checks preference normalization, app search, stable inventory indices, sorting/paging and nonmutation.

Against a running suite server: `BASE_URL=http://127.0.0.1:8000 node shared-suite/hub-browser-test.cjs` covers all 17 entry points, saved display preferences/favorites, editor inventories and selected-item prompt drafting. `shelliX/browser-test.cjs` starts its own temporary runtime and verifies actual commands, history filters and the existing session workflow.

`shared-suite/inventory-browser-test.cjs` verifies multi-page selection, complete filtered exports, stale-snapshot rejection and codeiX AI-exclusion protection.
