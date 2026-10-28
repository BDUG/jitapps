# sketchiX

A draw.io-style diagram and sketch workspace in the agentic desktop suite. Draw shapes, connect them, arrange a process or system, and review AI-generated diagrams. Import/export draw.io, SVG, PlantUML, PPTx and modern Microsoft Visio VSDX. Editing and format conversion run locally in your browser, without a build or account.

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
| PPTx `.pptx` | First slide; basic text/shapes/images and native connector references, using presentiX's parser. Masters, groups, rich formatting and other slide features can be simplified. | One editable slide with basic native shapes, text boxes, images and PPTx connectors. Maximum canvas 3,000 × 3,000 pixels and 200 shapes plus connection labels. Complex routes and database geometry may differ in PPTx. |
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

`office-validation.py` additionally uses Python `python-pptx` and `vsdx` (verification dependencies only) to inspect generated Office files and create independent fixtures. This validates package/relationship readability; it is not a pixel-perfect rendering test in PPTx, draw.io, Visio or PlantUML.

## Sketch and shape editors

Use the tabs at the top of sketchiX to switch between **Diagrams**, **Sketch editor** (`/sketchiX/sketch.html`) and **Shape editor** (`/sketchiX/shape.html`). These are independent workspaces: each has its own document, autosave, Undo/Redo and dedicated AI conversation. Open them in separate browser tabs to keep conversations open simultaneously. The original diagram remains unchanged when you draw or apply AI edits in an artwork editor.

### Draw and edit artwork

- Use **Freehand pen** to capture strokes with a mouse, pen or touch. Drag **Line**, **Rectangle**, **Ellipse**, **Polygon** or **Bézier curve** to create an object. Polygon creates an editable triangle; **Add point** adds vertices. Text places a label at its baseline anchor.
- Choose **Select / move** to select and drag an object. Control-point handles edit corners, endpoints, polygon vertices and Bézier controls directly. The point panel also offers numeric coordinates for the first 100 points; long freehand strokes display sampled handles to keep interaction usable.
- The style panel controls stroke/fill, width, opacity, text/font size and whether a stroke closes. **Erase object** removes an entire object, rather than individual parts of a stroke.
- Duplicate, delete, stacking, Undo/Redo, pointer-centered wheel zoom, Fit and Space + drag pan are supported. Escape cancels an active drawing/move. Pointer cancellation also restores the previous document.
- The canvas panel controls size and transparent/background output. **Save JSON** retains the complete editable document. SVG export contains safe vector primitives and embedded artwork data; PNG is raster output, scaled to at most 2,048 pixels per side.

**Open** accepts artwork JSON or SVG exported by the corresponding artwork editor. Sketch and shape documents have distinct `kind` values and cannot accidentally replace each other. Generic SVG belongs in the diagram editor or graphiX; arbitrary SVG source is not executed or imported into these artwork editors. A sketch or shape supports 300 objects, 2,000 points per object, 20,000 points total, canvas dimensions 64–4,096 pixels, and a 1 MB validated model. Invalid imports leave the current artwork intact.

Both editors support the suite's **Destination: Virtual disk** destination and **Virtual disk** native reader. Import/export formats retain their normal limitations; PNG is an output format, not an editable artwork backup.

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

PPTx and Visio use simplified editable native shapes; actor anatomy, class compartment rules, component details and double-circle state notation may simplify outside sketchiX. Their embedded model restores the original UML shapes on an unchanged re-import. Prefer SVG when exact appearance matters.

Verification: `node sketchiX/uml-test.cjs` and `node sketchiX/uml-browser-test.cjs` (server on port 8000). Tests cover all eleven stencils, compartment labels, history/persistence, routing, safe text, all six interchange formats, plain PlantUML/draw.io, and mocked AI proposals using the extended schema.

Insert image accepts SVG artwork, including graphiX exports, from local or virtual disk. SVGs are converted to embedded PNGs (up to 2048 pixels per side) for reliable rendering and diagram/PPTx interchange. Scripts and external resources are disabled during decoding. To import editable vector elements instead, use the main diagram Import control.

## Workspace extensions

Open **Workspace** beside the virtual disk controls, or press **Ctrl+K / Cmd+K**, for searchable commands, content search and reviewed bulk replacement, named recovery points, portable workspace backups, three tool-specific AI workflow drafts, document validation/insights, and coding-agent handoff ZIPs. Restores preserve a recovery point first and reject stale or invalid changes. Files can move through either local or virtual disk.

See the [workspace tools guide](../shared-suite/WORKSPACE.md) for this app’s native backup behavior, raw source/formula search, inspection measurements and interoperability limits. Workflow drafts never send an AI request automatically.

## Tool-specific productivity actions

Open **Workspace → Tool actions** for reviewed editing helpers, JSON/Markdown/CSV inventories and a tool-specific AI review draft. Changes use native validation and save recovery before application. See the [action catalog and interchange guide](../shared-suite/WORKSPACE.md#tool-actions-and-portable-inventories) for this app’s operations and limits.

Additional **Workspace → Tool actions** capability: Snap nodes to a configurable grid; set artwork opacity in both sub-editors. Review the native change preview before applying; a recovery point is saved automatically.

**Productivity extension:** Space diagram nodes vertically without overlaps; mirror control-point artwork in the sketch and shape sub-editors. Use **Workspace → Tool actions** to review and apply native changes.

**Reusable variants:** Duplicate nodes/connectors with internal endpoint remapping; copy editable artwork in both sub-editors. Available through **Workspace → Tool actions**, with native validation, preview and recovery.

## Project ZIP

Use **Project ZIP** in the header, or **Workspace → Recovery → Import / export project ZIP**, to save and restore the complete native project. Choose Computer or Virtual disk. Imports validate and stage a review; applying preserves the previous project in Recovery. Embedded assets are included, while separate app/relay settings and external workspace files are excluded. See the [shared ZIP guide](../shared-suite/PROJECT-ZIP.md).

## Goal Structuring Notation (GSN)

The **Diagrams** editor has a GSN palette for **Goal, Strategy, Solution, Context, Assumption and Justification**. Goals are rectangles; strategies are parallelograms; solutions are circles; contexts are rounded rectangles; assumptions/justifications are ellipses with A/J markers. Labels are freely editable; defaults demonstrate G1, S1, Sn1, C1, A1 and J1 identifiers. IDs in labels are display text, separate from stable internal element IDs.

1. Use **Load GSN example** for a connected starter argument (replacement is confirmed and undoable), or add stencils individually.
2. Choose **GSN Supported by** or **GSN In context of** beside Connect, activate **Connect**, then click the source goal/strategy followed by the target. Supported by uses a filled triangular arrow; In context of uses a hollow triangular arrow. Both use solid lines. Choose a connection to change its relationship in Selection.
3. In Selection, mark a goal or strategy **GSN undeveloped** to display a diamond beneath it. Move, resize, label, duplicate and undo diagrams normally.
4. **Check GSN structure** writes advisory findings to Import report: incompatible relationship endpoints, missing support links, explicitly undeveloped arguments, blank labels, and cycles in supported-by links. It does not validate evidence, establish argument completeness, or certify safety.
5. AI chat receives the GSN shapes and relationship schema. For example: “Create a GSN argument for safe shutdown, with operating context, an explicit assumption and verification evidence. Mark unsupported claims undeveloped.” Existing AI proposal review still applies.

JSON and sketchiX-generated SVG/draw.io/PlantUML/PPTx/VSDX files retain the full editable GSN model in the existing embedded backup when that backup remains intact. SVG renders the actual GSN symbols and hollow context arrows. draw.io uses portable basic geometry plus GSN type/relationship attributes; common `mxgraph.gsn.*` stencils are also recognized on import. External edits that remove these attributes may lose semantics. PlantUML, PPTx and Visio visual representations may simplify special symbols, A/J suffixes, undeveloped markers and relationship arrowheads; use SVG for faithful visual sharing and JSON for explicit native backups. This release supports the six core nodes, not GSN modules, away nodes or argument-pattern extensions.

## SysML v2 text import and export

Try the [vehicle SysML example](examples/vehicle.sysml). Select **Import** and choose `.sysml` or `.sysmlv2`, from the computer or through the suite's virtual-disk file controls. Export with **SysML v2 text** to download a `.sysml` file. This is textual structural interchange, not the SysML v2 REST API or a full SysML compiler.

Supported declarations are packages and named part, item, port, attribute, action, state, requirement and interface definitions/usages. The importer retains nesting, type references, in/out/inout direction, simple `connect a to b;` connections and `dependency from a to b;` dependencies. Scoped names, forward references and quoted names are supported. Declaration nodes are laid out as editable UML-style boxes; owning namespaces remain semantic metadata rather than physical nested containers. Inherited member endpoints such as `engine.input` are drawn at the owning usage and retained as member paths for textual export, with an explicit warning that inherited type semantics were not validated.

Select a node and expand **SysML v2 semantics** in Selection to edit its semantic name, kind, definition flag, type reference, direction and owning namespace. These fields are independent of the visible label. Enable **SysML element** to annotate a newly drawn shape. Select a connection to choose its **SysML relationship**. Duplicate remaps copied ownership and assigns a fresh semantic name; deleting a namespace promotes surviving children into the nearest surviving namespace. Undo supports these edits.

```sysml
package Example {
    port def Signal;
    part def Controller { port input : Signal; }
    part controller : Controller;
    part source;
    connect source to controller.input;
}
```

The import report lists unsupported or omitted constructs and unresolved/ambiguous endpoints. External imports are never fetched. This subset does not fully interpret inheritance, multiplicities, values/expressions, constraints, behavioral bodies, requirements satisfaction/verification, views or external standard libraries. Unsupported bodies can be omitted; keep the original source as well as a native backup. It does not establish full language conformance or model validity. Limits are 500 elements, 40 nesting levels, a bounded token budget and the native diagram size limits.

Export uses explicit fully qualified endpoints. Generic diagram nodes become uniquely named untyped part usages; their labels are included as comments. Generic links become dependencies. Connections without attached endpoints are omitted from the text with export-note comments. Semantic names must be unique within an owning namespace. Export does not attempt to infer SysML meaning from UML or GSN shapes.

A leading `// sketchix-sysml-data:` comment contains a sketchiX native backup and text-change checksum. When the text is unchanged, reimport restores exact layout, labels, IDs, styles and metadata. When text changes, sketchiX ignores the cached layout and parses the current text again. The checksum is a change detector, not a signature or trust guarantee; the native model is still structurally validated. SVG, draw.io and JSON backups also retain SysML metadata through their existing native model envelopes. Third-party tools may ignore or remove this optional comment. The AI chat schema includes SysML element/relationship metadata so reviewed proposals can preserve it.
