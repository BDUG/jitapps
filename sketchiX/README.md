# sketchiX

A draw.io-style diagram and sketch workspace in the agentic desktop suite. Draw shapes, connect them, arrange a process or system, and review AI-generated diagrams. Import/export draw.io, SVG, PlantUML, PowerPoint PPTX and modern Microsoft Visio VSDX. Editing and format conversion run locally in your browser, without a build or account.

## Start

From the repository root, run `python3 server/server.py`, then open `/sketchiX/` on that server (default port 8000). Keep `architex/vendor/`, `presentiX/` and `shared-ai/` alongside this folder: sketchiX reuses JSZip, the presentation package writer and shared AI chat. Direct `index.html` opening supports editing/interchange; same-origin HTTP hosting is simpler for AI.

## Draw and connect

Click a palette shape to add a rectangle, rounded rectangle, ellipse, decision diamond, database cylinder or text. Images support embedded PNG/JPEG/GIF/WebP under 3 MB each. Select and drag a shape; its corner handle resizes it. Double-click a shape to focus its label editor. The right panel controls text, geometry, colors, font size, and connection routing, arrow and dash settings.

Click **Connect**, click a source shape, then a target shape. The new connection is selected and both endpoint highlights clear. Connect stays enabled for another pair; click it again or press Escape to leave the mode. Self-connections are supported. Connections follow moved/resized endpoints. Orthogonal routes avoid intervening nodes with a simple detour; use straight routing when appropriate. This is a lightweight router, not a full obstacle-routing solver.

Shift-click shapes in the canvas or Layers for multi-selection. Ctrl/Command A selects all shapes; Ctrl/Command D duplicates the selection and its internal connections. Delete removes selected shapes/connections and incident connections; Undo restores them. Bring front/Send back change shape order. Arrow keys nudge, Shift for 10 pixels. Objects are independent top-level shapes; imported groups are flattened rather than providing nested editing.

Use Pan, Space + drag, or middle mouse to move the workspace. Wheel zooms at the pointer; Fit shows the canvas. **Clean up** orders dependency components from left to right, keeps cyclic components together in a column, avoids overlapping shapes and resets attached-edge manual waypoints. It is undoable. The right Canvas panel controls document dimensions.

Undo/Redo (Ctrl/Command Z / Shift Z) cover edits, imports, layout and applied AI proposals. History lasts for the page session. Browser autosave retains the diagram; clearing browser data removes it. Export important work, especially image-heavy diagrams that can exceed browser storage. No files are automatically written to disk.

## Format support

Choose a format beside **Export**, or use **Import**. A successful import replaces the diagram as one undoable operation. Invalid files leave it intact. The import report identifies simplifications. Keep an original copy of files from other tools; interchange is not lossless for arbitrary diagrams.

| Format | Import | Export and limits |
| --- | --- | --- |
| draw.io `.drawio` / XML | First page; uncompressed XML and compressed diagram payloads; basic shapes, labels, coordinates and attached edges. Groups/swimlanes flatten; custom shapes/styles simplify. Compressed input requires browser support for `DecompressionStream('deflate-raw')`; otherwise save uncompressed XML in draw.io. | Native editable mxGraph vertices and edges, shape geometry, labels, colors and basic routing. |
| SVG `.svg` | sketchiX SVG retains the model. Generic SVG supports rectangles, ellipses/circles, polygons approximated as diamonds, text, lines and polylines; transforms become bounding geometry. Paths, filters, external images, CSS styling and complex artwork are skipped/simplified. Lines attach to nearby node bounds when possible. | Standalone vector artwork, labels and connections with embedded editable model data. |
| PlantUML `.puml` / `.plantuml` | Local parser for common rectangle/component/node/database/usecase declarations, aliases and arrows. Supported bracket labels and simple deployment-style syntax become editable objects. Sequence/activity/class-specific constructs may be ignored and are reported. No PlantUML renderer, includes, macros or network calls run. | Valid text declarations and arrows for an external PlantUML renderer. Diagram renderers choose their own layout. sketchiX metadata retains the original positions/styles; unsupported PlantUML shape kinds use rectangles in rendered output. |
| PowerPoint `.pptx` | First slide; basic text/shapes/images and native connector references, using presentiX's parser. Masters, groups, rich formatting and other slide features can be simplified. | One editable slide with basic native shapes, text boxes, images and PowerPoint connectors. Maximum canvas 3,000 × 3,000 pixels and 200 shapes plus connection labels. Complex routes and database geometry may differ in PowerPoint. |
| Microsoft Visio `.vsdx` | First page; basic ShapeSheet geometry, text, styles and Connect relationships. Master-dependent shapes, groups, rotations, rich formatting and embedded objects may simplify to placeholders. | A native VSDX package containing editable shapes, text and Connect records. Cylinders/rounded shapes can simplify geometrically. Raster image nodes currently stop VSDX export with an explanation; use SVG/PPTX/draw.io or remove those images. Native Visio rendering has not been verified. |
| JSON | Full validated sketchiX model. | Full model backup and coding-agent interchange. |

**Binary Visio `.vsd` is not supported**; convert it to `.vsdx` in Visio first. Multi-page draw.io/Visio and multi-slide PPTX imports use their first page/slide. The original files, unsupported content and extra pages are not carried through export.

Own exports include model metadata so sketchiX can retain full semantics when reimported. A digest of the visible page/slide source and canvas information avoids stale metadata after changes to that source: changed files fall back to the native importer. Theme/master-only changes outside the hashed parts may not invalidate metadata. Metadata is validated as diagram data and is never executed.

Limits: 500 nodes, 1,000 edges, 5,000 characters per node label and 1,000 per connection label; raster images under 3 MB each and approximately 9 MB total; full model under 15 MB. Imports accept files up to 25 MB, packages up to 4,000 entries/50 MB declared expanded size and bounded diagram parent traversal. Scripts, macros, external relationships and URLs are not executed/fetched.

## AI chat

Click **Design with AI** or **AI chat**. Ask for flowcharts, system sketches, dependency diagrams, process explanations, improved labels or layout changes. The assistant receives the complete diagram, nodes, edges, styles/positions, selected objects, schema, response contract and reference attachments. Embedded images travel as JSON data URLs rather than a provider-specific vision format. The shared 600,000-character payload limit can prevent image-heavy requests; use a smaller diagram or omit context for general questions.

Only the relay URL is configured in sketchiX. Set and test the provider in the relay's `/relay` UI. Read [shared AI chat](../shared-ai/README.md) for setup, attachments, Stop, raw output, request/schema downloads and diagnostics. Live calls require valid credentials and network access from your relay machine.

The assistant proposes a complete replacement model. **Review proposed edit → Apply reviewed edit** is required; IDs, references and dimensions are validated first. Changed document snapshots block stale proposals. Native Undo and **Undo AI edit** restore applied changes. No provider can directly execute commands, run PlantUML or write external files through this editor.

## Verification

With the suite server on port 8000:

```sh
node sketchiX/model-test.cjs
python3 sketchiX/office-validation.py create
node sketchiX/interchange-test.cjs
python3 sketchiX/office-validation.py validate
node sketchiX/browser-test.cjs
```

Browser tests require Playwright and Chromium at `/usr/bin/chromium`. They exercise editing, resizing, connections, history, layout, persistence, import failure isolation, mocked AI review/apply/Undo, six format round trips, independent compressed draw.io/SVG/PlantUML and native PPTX/VSDX with metadata removed.

`office-validation.py` additionally uses Python `python-pptx` and `vsdx` (verification dependencies only) to inspect generated Office files and create independent fixtures. This validates package/relationship readability; it is not a pixel-perfect rendering test in PowerPoint, draw.io, Visio or PlantUML.

## Sketch and shape editors

Use the tabs at the top of sketchiX to switch between **Diagrams**, **Sketch editor** (`/sketchiX/sketch.html`) and **Shape editor** (`/sketchiX/shape.html`). These are independent workspaces: each has its own document, autosave, Undo/Redo and dedicated AI conversation. Open them in separate browser tabs to keep conversations open simultaneously. The original diagram remains unchanged when you draw or apply AI edits in an artwork editor.

### Draw and edit artwork

- Use **Freehand pen** to capture strokes with a mouse, pen or touch. Drag **Line**, **Rectangle**, **Ellipse**, **Polygon** or **Bézier curve** to create an object. Polygon creates an editable triangle; **Add point** adds vertices. Text places a label at its baseline anchor.
- Choose **Select / move** to select and drag an object. Control-point handles edit corners, endpoints, polygon vertices and Bézier controls directly. The point panel also offers numeric coordinates for the first 100 points; long freehand strokes display sampled handles to keep interaction usable.
- The style panel controls stroke/fill, width, opacity, text/font size and whether a stroke closes. **Erase object** removes an entire object, rather than individual parts of a stroke.
- Duplicate, delete, stacking, Undo/Redo, pointer-centered wheel zoom, Fit and Space + drag pan are supported. Escape cancels an active drawing/move. Pointer cancellation also restores the previous document.
- The canvas panel controls size and transparent/background output. **Save JSON** retains the complete editable document. SVG export contains safe vector primitives and embedded artwork data; PNG is raster output, scaled to at most 2,048 pixels per side.

**Open** accepts artwork JSON or SVG exported by the corresponding artwork editor. Sketch and shape documents have distinct `kind` values and cannot accidentally replace each other. Generic SVG belongs in the diagram editor or graphiX; arbitrary SVG source is not executed or imported into these artwork editors. A sketch or shape supports 300 objects, 2,000 points per object, 20,000 points total, canvas dimensions 64–4,096 pixels, and a 1 MB validated model. Invalid imports leave the current artwork intact.

Both editors support the suite's **Exports: virtual disk** destination and **Virtual disk** native reader. Import/export formats retain their normal limitations; PNG is an output format, not an editable artwork backup.

### Dedicated AI chats

**Sketch AI chat** specializes in freehand compositions and annotations. **Shape AI chat** specializes in vector geometry, icons, styling and Bézier control points. Each sends its own complete document, selected object, strict artwork schema and response contract to the configured relay. The other workspaces are not included. Attachments, question answering, raw call output, downloadable API/schema, Stop, review-before-apply, stale-proposal protection and Undo AI edit use the shared chat workflow. A provider cannot execute code or directly save library entries. Live provider calls still require a working relay configuration.

### Reusable custom shapes

Click **Save to shape library** in either artwork editor. In the diagram workspace, choose **Custom shapes** and **Insert**. The inserted diagram object is an embedded PNG preview that supports normal movement, resizing and diagram export. The editable vector source remains in the library; **Edit source** opens it in the shape editor, where saving updates that library entry. Existing diagram copies retain their original previews. Freehand artwork can also become a reusable custom shape this way.

The library stores up to 24 entries in this browser profile. Remove entries in the library dialog; this does not remove existing diagram objects. JSON/SVG backups retain the editable artwork independently of the library. Clearing browser site data removes the library and autosaved artwork.

Run `node sketchiX/artwork-model-test.cjs` and, with the server on port 8000, `node sketchiX/artwork-browser-test.cjs` to verify model boundaries, drawing and control-point editing, SVG/PNG exchange, separate mocked AI chats, disk exchange and library-to-diagram insertion.

## UML shapes

The diagram editor's **UML SHAPES** palette adds **Class**, **Interface**, **Actor**, **Use case**, **Component**, **Package**, **Deployment node**, **Note**, **Activity**, **Initial state** and **Final state**. Add these like other shapes, then move/resize, recolor, connect, duplicate or edit them in the normal inspector. The Shape selector also converts existing nodes to UML shapes. UML nodes participate in Undo/Redo, autosave, layout, virtual-disk exchange and AI diagram edits.

Class and interface labels use a line containing `---` between compartments. For example:

```text
Order
---
+ id: String
+ total: Decimal
---
+ submit(): void
```

The first compartment is the title, followed by attributes and operations. Interfaces automatically display `«interface»`; put just the interface name in the title. Initial/final states use their standard filled/double-circle symbols; their labels are retained in the model and tooltip. Packages, components, actors, deployment nodes and folded notes have dedicated vector geometry.

SVG renders the full UML notation; JSON and own-format metadata retain exact UML types and labels through all supported exchanges. draw.io exports native actor/component/package/node/note/state symbols where supported; class/interface compartments use a labeled rectangle with a UML type marker, so their precise compartment appearance is specific to sketchiX. Plain PlantUML imports recognize the basic UML declarations and multiline class/interface member blocks; exports use corresponding declaration keywords and member compartments. Full sequence diagrams, nesting and all UML relationship semantics are not implemented. Existing connectors provide labels, direction and dashed/solid lines.

PowerPoint and Visio use simplified editable native shapes; actor anatomy, class compartment rules, component details and double-circle state notation may simplify outside sketchiX. Their embedded model restores the original UML shapes on an unchanged re-import. Prefer SVG when exact appearance matters.

Verification: `node sketchiX/uml-test.cjs` and `node sketchiX/uml-browser-test.cjs` (server on port 8000). Tests cover all eleven stencils, compartment labels, history/persistence, routing, safe text, all six interchange formats, plain PlantUML/draw.io, and mocked AI proposals using the extended schema.

Insert image accepts SVG artwork, including graphiX exports, from local or virtual disk. SVGs are converted to embedded PNGs (up to 2048 pixels per side) for reliable rendering and diagram/PowerPoint interchange. Scripts and external resources are disabled during decoding. To import editable vector elements instead, use the main diagram Import control.

## Workspace extensions

Open **Workspace** beside the virtual disk controls, or press **Ctrl+K / Cmd+K**, for searchable commands, content search and reviewed bulk replacement, named recovery points, portable workspace backups, three tool-specific AI workflow drafts, document validation/insights, and coding-agent handoff ZIPs. Restores preserve a recovery point first and reject stale or invalid changes. Files can move through either local or virtual disk.

See the [workspace tools guide](../shared-suite/WORKSPACE.md) for this app’s native backup behavior, raw source/formula search, inspection measurements and interoperability limits. Workflow drafts never send an AI request automatically.
