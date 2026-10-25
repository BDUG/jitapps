# graphiX

A standalone, local-first SVG editor with an Architex-inspired workspace. No build, package installation, account or AI service is required. Documents stay in your browser unless you export them.

Open `graphiX/index.html` directly, or serve the repository with `python3 -m http.server 8000` and open `/graphiX/`. The existing Architex server also serves this folder.

## Draw and edit

Choose Rectangle (R), Ellipse (E), Line (L), Freehand (P), or Text (T), then drag on the artboard. Hold Shift while drawing to constrain proportions. Text starts with “Your text”; edit its contents and font size in the properties panel.

Use Select (V) to click a shape or choose it in Layers. Drag to move it, drag its lower-right handle to resize, or enter exact X/Y/width/height values. Groups remain a single selectable object until ungrouped. The appearance panel controls fill, stroke, stroke width, and opacity; with nothing selected these settings apply to new shapes. The selection panel can rename and center objects. Duplicate, Delete, Send back and Bring front control objects and stacking order.

Use Pan (H), middle mouse, or Space + drag to move the workspace. The mouse wheel zooms around the pointer. Fit artboard centers the page. Edit artboard dimensions in the right panel (1–20,000 SVG units). On narrow screens the properties panel is hidden; use a wider window for detailed editing.

Undo with Ctrl/Command Z, redo with Ctrl/Command Shift Z, duplicate with Ctrl/Command D, delete with Delete/Backspace, and nudge with the arrow keys (Shift for 10 units). Escape clears selection. Undo history lasts for the current session; the current document and its name autosave locally. New drawings and imports can be undone. Export important work because clearing browser storage removes the saved drawing.

## Group and ungroup

Shift-click objects on the canvas or in Layers to add/remove them from the selection. Ctrl/Command A selects all top-level objects. Click empty canvas or press Escape to clear the selection. Multiple selected objects can move, resize, nudge, duplicate, change appearance, reorder or delete together.

The **Grouping** section in the toolbar above the canvas contains separate **Group** and **Ungroup** buttons. Group activates when at least two objects are selected; Ungroup activates when a group is selected.

Click **Group** or press **Ctrl/Command G** to combine two or more selected objects into an SVG `<g>`. The group is selected immediately, so you can move, resize, name or style it as one object. Groups can be grouped again to form nested groups. Selected objects retain their relative drawing order; the new group occupies the frontmost selected object's layer position.

Select a group and click **Ungroup**, or press **Ctrl/Command Shift G**, to release one nesting level. Released objects remain selected. Their positions, transforms and inherited fill/stroke/text styling are preserved. Grouping and ungrouping each form one Undo step and persist in local autosave and SVG export/import.

Ungrouping stops with an explanation for groups with composite opacity, clipping or masks, or groups referenced by another element (such as `<use>`). Flattening these can change the image or break references; adjust those effects/references in SVG source first. The editor selects top-level objects; ungroup to edit an individual member.

## SVG and PNG

**Import SVG** loads a file. **SVG source** displays editable markup; Apply replaces the document after parsing and sanitization. Malformed input leaves the current document intact. **Export SVG** downloads editable SVG without editor overlays. **PNG** exports a transparent raster image at the artboard size, up to 16 million pixels.

Supported imports include paths, geometric shapes, text, groups, gradients, clip paths, masks, patterns, markers, symbols and internal use references. SVG source preserves supported attributes and inline presentation styles. Scripts, event handlers, animations, foreign HTML, images, filters, external stylesheets and external resources are removed. This editor is intended for static vector artwork; it does not promise lossless editing of arbitrary SVG. External fonts are not embedded. Top-level objects and groups are selectable; use SVG source to edit nested structures and individual path control points. Transforms preserve imported rotations and scaling. Multi-selection is supported; individual path control-point editing remains available through SVG source.

## Verification

`node graphiX/browser-test.cjs` runs the functional browser checks with Playwright and Chromium. Serve the repository on port 8000 first. The test covers drawing, properties, handle resizing, undo/redo, persistence, SVG/PNG exports and sanitized input. Playwright must be available to Node and Chromium at `/usr/bin/chromium` (the same development setup as Architex).


## Tool-specific AI chat

Design and refine SVG shapes, colors, layout and typography, or ask questions about the current artwork. The assistant receives the complete SVG and selected object; proposed SVG replacements are sanitized and require review.

See the [shared AI chat guide](../shared-ai/README.md) for relay setup, context selection, attachments, review, Undo, request/schema downloads and troubleshooting.

Run `node graphiX/grouping-browser-test.cjs` for multi-selection, grouping, nested groups, transformed/styled imports, ungrouping, movement, shortcuts, history, persistence/export and protected SVG effects/references.

## Workspace extensions

Open **Workspace** beside the virtual disk controls, or press **Ctrl+K / Cmd+K**, for searchable commands, content search and reviewed bulk replacement, named recovery points, portable workspace backups, three tool-specific AI workflow drafts, document validation/insights, and coding-agent handoff ZIPs. Restores preserve a recovery point first and reject stale or invalid changes. Files can move through either local or virtual disk.

See the [workspace tools guide](../shared-suite/WORKSPACE.md) for this app’s native backup behavior, raw source/formula search, inspection measurements and interoperability limits. Workflow drafts never send an AI request automatically.

## Tool-specific productivity actions

Open **Workspace → Tool actions** for reviewed editing helpers, JSON/Markdown/CSV inventories and a tool-specific AI review draft. Changes use native validation and save recovery before application. See the [action catalog and interchange guide](../shared-suite/WORKSPACE.md#tool-actions-and-portable-inventories) for this app’s operations and limits.

Additional **Workspace → Tool actions** capability: Make artwork responsive with a preserved or dimension-derived SVG viewBox. Review the native change preview before applying; a recovery point is saved automatically.

**Productivity extension:** Replace an exact fill, stroke or gradient-stop hex color without changing SVG references. Use **Workspace → Tool actions** to review and apply native changes.

**Reusable variants:** Create a side-by-side SVG artwork variant with remapped internal IDs and gradient/mask links. Available through **Workspace → Tool actions**, with native validation, preview and recovery.

## Project ZIP

Use **Project ZIP** in the header, or **Workspace → Recovery → Import / export project ZIP**, to save and restore the complete native project. Choose Computer or Virtual disk. Imports validate and stage a review; applying preserves the previous project in Recovery. Embedded assets are included, while separate app/relay settings and external workspace files are excluded. See the [shared ZIP guide](../shared-suite/PROJECT-ZIP.md).
