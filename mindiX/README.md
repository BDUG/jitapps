# mindiX

A MindManager-style mind mapping workspace in the agentic desktop suite. Explore a central idea through hierarchical topics, organize branches, keep notes and task markers, and collaborate with a map-aware AI assistant. Export editable diagrams to draw.io, SVG and PowerPoint PPTX. No build, account or installation is needed for editing and export.

## Start

From the repository root:

```sh
python3 server/server.py
```

Open `/mindiX/` on that server (default port 8000). Keep `architex/vendor/`, `sketchiX/`, `presentiX/` and `shared-ai/` alongside this folder. mindiX reuses their ZIP, diagram and presentation export libraries. Direct `mindiX/index.html` opening supports local editing/export; same-origin hosting is recommended for AI chat.

## Build a map

- Select a topic in the canvas or outline. **＋ Child** adds a subtopic; **＋ Sibling** adds one beside the selected topic. The central topic has no siblings and cannot be deleted or reparented.
- Edit titles, detailed notes, branch colors, priority (P1–P5), progress (0–100%) and optional HTTP(S) links in the Topic panel. Color changes apply to the selected topic and its descendants. Links open only when explicitly clicked; no linked pages are fetched automatically.
- **Edit topic**, double-click, or F2 opens a title/notes dialog that also works on narrow screens. The full property panel requires a wider window.
- Choose a new **Parent topic** to move a branch. The topic itself and its descendants are excluded from the parent list, and validation rejects cycles, orphans and duplicate IDs. The whole subtree moves together.
- **↑ Earlier / ↓ Later** reorder siblings. **Duplicate branch** copies its descendants, notes and task data with new IDs. **Delete branch** confirms subtree deletion; Undo restores it.
- Collapse a branch with its small −/+ control, the outline arrow or the toolbar. Collapsed descendants remain in the model and JSON. Expand all/Collapse all help navigate larger maps. Search includes hidden topics and notes; selecting a hidden match expands its ancestors.

The map supports **Balanced**, **Right tree** and **Left tree** layouts. A main branch can explicitly choose Left/Right in Balanced mode; descendants follow their main branch. Structural changes, expansion and title changes reflow the tree. **Clean up** restores a layout with non-overlapping topic boxes and fits the map to view. Drag a topic to position its whole subtree manually; the next reflow recalculates those positions. Branch paths update as you drag.

Use Pan, Space + drag or middle mouse to pan. Wheel zooms around the pointer; Fit shows visible topics. On the canvas, Tab adds a child, Enter adds a sibling (or a child for the central topic), Shift+Tab selects the parent, arrow keys navigate, F2 edits, and Delete removes a branch. Normal keyboard input and Tab navigation still work in forms and toolbar controls.

Undo/Redo (Ctrl/Command Z / Shift Z) cover edits, branch operations, imports and AI proposals. History lasts for this page session. Maps autosave to browser storage; clearing browser data removes them. Use **Save JSON** for backups. JSON reopening preserves the complete hierarchy, notes, links, collapse state and manual positions. Invalid JSON leaves the current map intact; opening a map is undoable.

## Export

Choose **draw.io**, **SVG** or **PowerPoint PPTX**, then click **Export**. The right Export panel chooses:

- **All topics**: expands a copy of the full hierarchy and lays it out for export. The current map/collapse state is unchanged.
- **Visible topics**: exports the current visible map and manual positions.
- **Selected branch**: exports that topic and all descendants as a standalone map, including collapsed descendants.

Topic titles, branch colors, priorities/progress markers and parent-child connections become editable diagram objects. SVG is a standalone vector drawing; draw.io contains native vertices/edges; PPTX contains one editable slide with native shapes and connectors. The screen uses curved branch paths; exports use standard diagram connections. Larger maps scale to the format's canvas limits and can have small text; selected-branch exports are useful for slides.

Notes, topic URLs and mindiX-specific settings are retained in JSON backups, not in the visual exports. These exports do not replace a full mindiX backup. The diagram exports carry sketchiX-compatible metadata and can be imported into sketchiX; mindiX itself opens its JSON format. Native MindManager `.mmap` import/export is not implemented. PowerPoint rendering may vary with fonts and viewer versions; pixel-perfect rendering is not promised.

Limits: 200 topics, one central topic, at most 30 ancestor levels, title up to 200 characters, notes up to 10,000 per topic, and 2.5 MB per map JSON. The full map is included in AI context by default, so long notes can exceed the shared chat's 600,000-character request limit.

## AI chat

Click **Think with AI** or **AI chat**. Brainstorm a subject, break down a project, deepen a selected branch, organize ideas, summarize notes or ask questions about the map. The assistant receives the full hierarchy, titles, notes, links, styles, tasks, collapse state, selected topic/descendant IDs, schemas and reference attachments.

Only the relay URL is configured in mindiX; configure providers and credentials in the relay's `/relay` UI. See [shared AI chat](../shared-ai/README.md) for setup, attachments, raw output, request/schema downloads, Stop and provider diagnostics. Live calls need valid provider credentials and network access from your relay.

Proposals replace the complete map and require **Review proposed edit → Apply reviewed edit**. The schema/hierarchy and matching request identifiers are checked, and stale proposals are blocked after independent edits. Applying AI changes reflows the map; proposed positions do not override the layout algorithm. Native Undo and **Undo AI edit** can restore the previous map, including its manual positions. Questions do not alter it. The agent cannot execute scripts or browse topic links through this editor.

## Verification

With the suite server running on port 8000:

```sh
node mindiX/model-test.cjs
node mindiX/browser-test.cjs
```

The browser test uses Playwright, Chromium at `/usr/bin/chromium`, and Python `python-pptx` for independent PPTX inspection (test dependencies only). Checks cover hierarchy safety, non-overlapping layouts, collapse/export scopes, topic notes/tasks, reparenting, keyboard shortcuts, dialog editing, dragging, history/persistence, three actual downloads and editable diagram round trips, invalid imports, and mocked AI review/apply/Undo. Shared chat tests also cover stale proposals. Tests do not make paid provider calls or certify rendering in native MindManager/PowerPoint.

### Branch relationships and tasks

Select a topic, choose a target and label in **Relationships**, then click **Add relationship**. Styled arrows connect ideas across branches (dashed by default); remove them using ×. Relationships are included in JSON, draw.io, SVG and PowerPoint exports when both endpoints are included in the chosen scope. Duplicating a branch copies its internal relationships; deleting a branch removes its incident relationships. Undo restores both.

Assign an **Owner** and **Due date** in the Topic panel. These fields are retained in JSON and provided to the AI alongside the full map and relationship schema. Hover over a topic to see its task details. Visual exports retain priority/progress labels; use JSON for complete task details and notes.

Hold **Alt** while dragging a topic onto another topic to move its whole branch under the target. A green border marks a valid target. The central topic and descendants of the dragged topic cannot become drop targets. An invalid drop leaves the map unchanged. Ordinary dragging moves a branch freely; Escape is available for normal navigation, and pointer cancellation restores the original positions. Reparenting, relationships and task edits support Undo/Redo.

Run `node mindiX/capabilities-test.cjs` against the development server on port 8000 to check relationships, task persistence, cross-format exports, reparenting, Undo and canceled drags.


### Topic images and connection styling

Select a topic and choose an image under **Topic image**. PNG, JPEG, WebP and GIF uploads up to 5 MB are converted to an embedded PNG thumbnail, at most 256 × 256 pixels, preserving proportions with transparent padding. Animated images use a still frame. **Remove image** clears it; Undo restores it. Remote image URLs and SVG uploads are not supported. Imported embedded raster data is limited to 750 KB per topic, and the existing 2.5 MB map limit still applies.

Use **Incoming branch line** to set the selected topic's connection to its parent: color, solid/dashed/dotted style and width (1–10). The central topic has no incoming line. Topic fill/border color remains separate. **Relationships** provides defaults for new cross-topic connections and controls on each existing relationship for its color/style/width.

JSON, local saves and AI proposals retain image and line settings. SVG, draw.io and PowerPoint exports embed images and retain connection styling; images and labels are separate editable objects inside the exported topic outline. Existing exporter shape limits still apply, so image topics count as three shapes and relationship labels add shapes; use a branch/visible scope for large PPTX maps. Older maps default to solid branch lines using topic colors and dashed purple relationships.

Run `node mindiX/images-lines-browser-test.cjs` against port 8000 for image upload/removal/Undo, line styling, reload persistence and inspection of exported SVG/draw.io/PPTX image and line data.
