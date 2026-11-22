# App requirements and integration map

This map summarizes all 24 apps registered in [SuiteApps](../shared-suite/apps.js).
Use it when embedding an app, preparing a build, registering tools or deciding
which views and services a coding-agent host must provide. It describes the current
`index.html` integrations and native models; it is not a declaration that every
optional feature is required for basic editing.

For reproducible browser qualification, run
`node scripts/verify-app-readiness.cjs --report /tmp/app-readiness.json` from the
repository root with Playwright available and `CHROMIUM_PATH` set when needed.
It checks capability access across all 24 apps, selected native review/recovery
and import/export workflows. See the [current evidence and explicit coverage
limits](../specs/APPS-STATUS-REPORT.md); passing these workflows does not establish
complete format fidelity or a configured AI provider for every app.

## Read the requirements correctly

- **Native views/tools** are editor responsibilities: canvas, grid, source editor,
  inspector, validation and export. Their names below are descriptions, not new
  LLM tool names or API methods.
- **Direct scripts** are the app-specific/cross-app script tags currently loaded by
  its entry page, in source order. Keep those files and their referenced assets
  when shipping the current app. This list is not a recursively complete bundler
  manifest: workers, dynamic scripts, styles, fonts, icons and media must also be
  included. A deliberately reduced build needs separate dependency testing.
- **AI proposals (P)**: native chat adapter + shared chat, with explicit proposal
  review. This does not itself expose server file/command tools.
- **Chat + coding (C)**: the current page additionally loads the suite coding UI,
  loop and project bridge. codeiX has specialized file/project chat and review.
  Native editing still works independently of an AI model.
- **Shell (S)**: shelliX has its own command/session/agent loop and Workspace UI.
  Its read-only command inventory is separate from document edit/restore tools.

No app requires `javascript/embedded.js` merely because it is written in HTML.
The shipped apps use the suite integrations described here. `EmbeddedAgent` is a
smaller alternative for a new host that supplies its own UI, tools and transport;
see the [SDK integration HOWTO](README.md#howto).

## Shared services and UI building blocks

| Layer | What the app/host needs | When required |
| --- | --- | --- |
| Native editing | App entry HTML/styles, local models/renderers and their dependencies; browser APIs for its media | Always for that app's editor; Node/Python execution is not automatically required. |
| Suite navigation/files | `shared-suite/apps.js`, `ui.js`, `disk.js`, theme and icons | Shipped desktop navigation, computer/virtual-disk import/export. Same-origin browser IndexedDB is separate from server files. |
| Document Workspace | Workspace core/store/adapters/UI, native snapshot/validate/restore integration, recipes/quality/capability modules | All 23 document editors: review, recovery, inventory and export. Additional editing/bulk/template modules vary by page. |
| Inventory views | `capabilities.js`, `capabilities-ui.js`, dynamically loaded `inventory-browser.js` and Hub query helpers | Document field filters/sorting/selection/full filtered export. shelliX uses `command-inventory.js` with the shared query/export helpers. |
| Native AI chat | `shared-ai` protocol, multimodal/paging helpers and chat host; app schema/context/validation/apply callbacks | Optional AI proposals. Provider credentials belong in the backend, not generated HTML. |
| Suite coding tab | Coding spec/loop/context/planning/check/review modules, `shared-agent` UI/model transport and project bridge | Only C-profile pages as wired today. Advertised tools and permissions come from the configured runtime, not this document. |
| Local coding runtime | Python relay/runtime and configured workspace | Real server file inspection/edits/scripts/commands; commands also require executable allowlist and session permission. |
| Packaging | ZIP/vendor/format modules referenced by the app and shared project/file layers | Native project bundles and selected interchange formats; keep a native backup for lossless editing. |
| External integrations | Image provider, search/crawl, GitHub, collaboration, Drive or host toolchains as configured | Only when that operation is used. Generating configuration/scaffolds is not running, building, deploying or publishing them. |

## Per-app overview

| App | Profile | Native views to provide | Main editor tools |
| --- | --- | --- | --- |
| [markiX](../markiX/README.md) | P | Document navigation/outline; source editor; visual/split preview; export dialog | Source-preserving Markdown/RST parsing, supported visual block edits, headings, links and code blocks |
| [formiX](../formiX/README.md) | P | Formula list; LaTeX editor; vector preview; formula properties; export dialog | Formula selection/reordering, symbol/template insertion, MathJax rendering, formula notes and style settings |
| [cncfiX](../cncfiX/README.md) | P | Category/subcategory structure; landscape canvas; item inspector; export dialog | Category/item CRUD, maturity filtering, catalog insertion, SVG layout, category-slot name sorting |
| [schematiX](../schematiX/README.md) | C | Source evidence list; schema/ontology panels; knowledge sketch; selected-node inspector; export controls | Import examples/ZIP, infer candidate structures, edit ontology and graph, preserve source provenance, export graph/schema data |
| [mergiX](../mergiX/README.md) | C | Left/right/base input panes; comparison/path list; diff/hunk view; merge-result editor | Text/binary/folder comparison, three-way planning, hunk choice, manual result edit, explicit acceptance and export |
| [rstiX](../rstiX/README.md) | C | RST file browser/editor; needs list; selected need; dependency graph/review; project ontology/knowledge graph | Parse RST and exported needs, edit dependency options, drafts, graph navigation, project-memory sessions and GitHub import |
| [mockiX](../mockiX/README.md) | P | Component palette; screen canvas/prototype; screen/layer list; selected-component inspector; flow editor | Screen/component CRUD, prototype targets, reusable components, design colors, flow graphs and bounded lock-aware grid alignment |
| [shelliX](../shelliX/README.md) | S | Runtime/session setup; terminal/output log; command editor; agent-goal mode; snippets; history search; command inventory | Literal executable/argv or allowed `sh -c`, syntax checks, stop, session loading, receipt inspection, snippets and read-only inventory export |
| [colabriX](../colabriX/README.md) | C | Board canvas; creation palette; object/layer properties; comments; frame presentation; collaboration controls | Notes/cards/frames, connectors, comments, layout, image sanitization, local board management and optional paired collaboration |
| [designiX](../designiX/README.md) | C | Template/start panel; page canvas; layers/properties; assets/brand kit; typography; export/design preview | Pages, text/shapes/images, alignment, brand settings, SVG rendering and raster/PDF export paths |
| [photiX](../photiX/README.md) | C | Image canvas; region selection; recipe/edit controls; text chat; generative-image previews | Decode pixels, deterministic region edits, operation recipe, undo/redo, flatten/export and optional image/mask generation |
| [vidiX](../vidiX/README.md) | C | Media/library; timeline/layers; preview canvas; clip/motion properties; vector/frame drawing; export controls | Asset loading, trim/speed/layer timing, motion/fades, drawing frames, playback and supported animation/video export |
| [architex](../architex/README.md) | C | Metamodel tree; instance model; architecture canvas; ports/connections; rule editor/results; export/import dialogs | Component/type and instance editing, policy/data ports, graph layout, dependency validation, scoped interchange and explicitly managed rule evaluation |
| [graphiX](../graphiX/README.md) | C | SVG artwork canvas; source editor; selection/properties; drawing controls | SVG parsing/sanitization, vector editing, source changes, accessibility description, grouping and color/geometry transforms |
| [textiX](../textiX/README.md) | C | Rich document editor; formatting/outline controls; find/replace; embedded-content catalog; import/export dialogs | Sanitize/edit HTML, headings/tables/links/images, embedded project references, DOCX/PDF import/export and document recovery |
| [sheetiX](../sheetiX/README.md) | C | Sheet tabs; cell grid; formula bar; function help; formatting/fill controls; find/import/export | Cell addressing and selection, formula calculation, styles/number formats, relative/absolute fill, sheet operations and XLSX exchange |
| [codeiX](../codeiX/README.md) | C | Project explorer/tabs; code editor; sandboxed HTML preview; chat/coding tab; proposed-file review; local-workspace controls | Validated file/project edits, AI exclusions, native file review, sandbox preview, optional directory write-back and Tauri export |
| [appiX](../appiX/README.md) | C | Source/visual app editor; screens/components; state/bindings/interactions; live preview; build/export/deploy controls | Validated app source and designer model, UI SDK rendering, screen/state flows, sandboxed preview, static/native export scaffolds |
| [automatextiX](../automatextiX/README.md) | C | Workflow canvas; node palette; selected-step configuration; run status/logs; results | Workflow DAG editing, connections/mappings, explicit run/stop, data transforms and configured file/AI/web/command steps |
| [reportiX](../reportiX/README.md) | C | Research query/brief; source library; selection; research log; report/evidence preview; search settings; chat | Collect evidence, select sources, maintain source IDs/citations, generate/review reports and inspect limitations |
| [presentiX](../presentiX/README.md) | C | Slide list; slide canvas; object/typography properties; speaker notes; animation/presentation view; import/export | Slide/object editing, images/text/shapes, animation, notes, presentation playback and PPTX/package exchange |
| [sketchiX](../sketchiX/README.md) | C | Diagram canvas; node/edge inspector; shape palette/library; UML/SysML/GSN modes; separate sketch and shape-editor pages | Typed diagrams, connectors/routing, layout, freehand/vector artwork, reusable shapes and diagram/presentation interchange |
| [mindiX](../mindiX/README.md) | C | Mind-map canvas; topic editor; branch navigation; topic properties/images; relationships; outline/export | Topic tree editing, collapse/expand/layout, owners/progress/dates, cross-links, images and outline/diagram interchange |
| [projectiX](../projectiX/README.md) | C | Task table; Gantt timeline; task details; dependency/resource controls; import/export | Task hierarchy, duration/progress/milestones, predecessor constraints, phase rollups, resource assignments and schedule interchange |
| [trackiX](../trackiX/README.md) | C | Sprints & backlog sidebar; 5-column Kanban board & list view; issue inspector & comments; import/export | Epics, stories, tasks, bugs, subtasks, sprints, story points, blockers, Undo/Redo, CSV/JSON export and capability actions |

## Per-app dependencies, data and workflows

The common layers above are not repeated in each direct-script list. The shared
sheetiX fill helper used by some generic editing actions belongs to that shared
Workspace stack; it does not mean those apps require the sheetiX editor UI.

### markiX

- **Views:** Document navigation/outline; source editor; visual/split preview; export dialog.
- **Native tools:** Source-preserving Markdown/RST parsing, supported visual block edits, headings, links and code blocks.
- **Data/export requirements:** Native markup project; Markdown/RST source; document exports.
- **Services and platform:** No backend for editing. Text provider/relay only for AI proposals.
- **Direct app/format scripts:** [model.js](../markiX/model.js), [app.js](../markiX/app.js), [ai-adapter.js](../markiX/ai-adapter.js).
- **Example:** Draft an RST guide, inspect headings in inventory, review a prose cleanup and export source.

### formiX

- **Views:** Formula list; LaTeX editor; vector preview; formula properties; export dialog.
- **Native tools:** Formula selection/reordering, symbol/template insertion, MathJax rendering, formula notes and style settings.
- **Data/export requirements:** Native formula notebook; LaTeX snippets/document; SVG.
- **Services and platform:** Bundled MathJax (`math-config.js`, `vendor/tex-svg.js`) for formula rendering; relay/provider only for AI.
- **Direct app/format scripts:** [math-config.js](../formiX/math-config.js), [vendor/tex-svg.js](../formiX/vendor/tex-svg.js), [model.js](../formiX/model.js), [render.js](../formiX/render.js), [app.js](../formiX/app.js), [ai-adapter.js](../formiX/ai-adapter.js).
- **Example:** Edit a matrix, preview its SVG, label untitled formulas through reviewed Tool actions and export LaTeX.

### cncfiX

- **Views:** Category/subcategory structure; landscape canvas; item inspector; export dialog.
- **Native tools:** Category/item CRUD, maturity filtering, catalog insertion, SVG layout, category-slot name sorting.
- **Data/export requirements:** Native JSON; CNCF landscape YAML; SVG with editable metadata; raster export where supported.
- **Services and platform:** No server for native layout/export. Text relay/provider only for AI proposals.
- **Direct app/format scripts:** [model.js](../cncfiX/model.js), [render.js](../cncfiX/render.js), [app.js](../cncfiX/app.js), [ai-adapter.js](../cncfiX/ai-adapter.js).
- **Example:** Build a cloud-native stack, filter inventory to sandbox items, review name ordering and export landscape YAML.

### schematiX

- **Views:** Source evidence list; schema/ontology panels; knowledge sketch; selected-node inspector; export controls.
- **Native tools:** Import examples/ZIP, infer candidate structures, edit ontology and graph, preserve source provenance, export graph/schema data.
- **Data/export requirements:** Native schema/ontology/graph project; source examples/ZIP; JSON-LD/Turtle/mind-map exchanges described in the app guide.
- **Services and platform:** Local inference/import works without LLM. Optional server-project integration and AI/coding services require the relay.
- **Direct app/format scripts:** [../architex/vendor/jszip.min.js](../architex/vendor/jszip.min.js), [../mindiX/model.js](../mindiX/model.js), [model.js](../schematiX/model.js), [import.js](../schematiX/import.js), [app.js](../schematiX/app.js), [ai-adapter.js](../schematiX/ai-adapter.js).
- **Example:** Import examples, inspect inferred nodes and cite their source paths before accepting an ontology edit.

### mergiX

- **Views:** Left/right/base input panes; comparison/path list; diff/hunk view; merge-result editor.
- **Native tools:** Text/binary/folder comparison, three-way planning, hunk choice, manual result edit, explicit acceptance and export.
- **Data/export requirements:** Native comparison project; files/folders/ZIP; merged file outputs.
- **Services and platform:** No backend for local comparison. Optional AI semantic comparison and coding tab use relay/provider/runtime.
- **Direct app/format scripts:** [../architex/vendor/jszip.min.js](../architex/vendor/jszip.min.js), [model.js](../mergiX/model.js), [app.js](../mergiX/app.js), [ai-adapter.js](../mergiX/ai-adapter.js).
- **Example:** Compare two folders, filter inventory to unresolved results, review individual hunks and export accepted files.

### rstiX

- **Views:** RST file browser/editor; needs list; selected need; dependency graph/review; project ontology/knowledge graph.
- **Native tools:** Parse RST and exported needs, edit dependency options, drafts, graph navigation, project-memory sessions and GitHub import.
- **Data/export requirements:** RST source/folders; exported needs JSON; project/ZIP; graph and ontology exchanges.
- **Services and platform:** Local RST editing needs no provider. GitHub discovery/import uses its configured network/backend path; coding/project-memory services use the relay.
- **Direct app/format scripts:** [../architex/vendor/jszip.min.js](../architex/vendor/jszip.min.js), [../architex/sphinx-rst.js](../architex/sphinx-rst.js), [model.js](../rstiX/model.js), [drafts.js](../rstiX/drafts.js), [memory-session.js](../rstiX/memory-session.js), [app.js](../rstiX/app.js), [github.js](../rstiX/github.js), [github-ui.js](../rstiX/github-ui.js), [ai-adapter.js](../rstiX/ai-adapter.js).
- **Example:** Load a needs project, inspect dependencies, edit source options and export source with provenance intact.

### mockiX

- **Views:** Component palette; screen canvas/prototype; screen/layer list; selected-component inspector; flow editor.
- **Native tools:** Screen/component CRUD, prototype targets, reusable components, design colors, flow graphs and bounded lock-aware grid alignment.
- **Data/export requirements:** Native wireframe JSON/project backup; previews/exports documented by the app.
- **Services and platform:** Local wireframing needs no server-side execution. Text relay/provider only for AI proposals.
- **Direct app/format scripts:** [model.js](../mockiX/model.js), [design.js](../mockiX/design.js), [app.js](../mockiX/app.js), [design-ui.js](../mockiX/design-ui.js), [ai-adapter.js](../mockiX/ai-adapter.js).
- **Example:** Build a mobile checkout, test screen links, preview grid alignment and export the native editable project.

### shelliX

- **Views:** Runtime/session setup; terminal/output log; command editor; agent-goal mode; snippets; history search; command inventory.
- **Native tools:** Literal executable/argv or allowed `sh -c`, syntax checks, stop, session loading, receipt inspection, snippets and read-only inventory export.
- **Data/export requirements:** Retained server session/audit; filtered history; offline review; command inventory JSON/CSV.
- **Services and platform:** Python relay coding runtime is required to actually run commands. Executable allowlist and session command permission apply. AI provider is additionally required only for agent goals.
- **Direct app/format scripts:** [cycle.js](../shelliX/cycle.js), [resolutions.js](../shelliX/resolutions.js), [app.js](../shelliX/app.js), [snippets.js](../shelliX/snippets.js), [workspace.js](../shelliX/workspace.js), [command-inventory.js](../shelliX/command-inventory.js).
- **Example:** Run an approved check explicitly, filter command receipts by nonzero exit code and export the failed attempts without replaying them.

### colabriX

- **Views:** Board canvas; creation palette; object/layer properties; comments; frame presentation; collaboration controls.
- **Native tools:** Notes/cards/frames, connectors, comments, layout, image sanitization, local board management and optional paired collaboration.
- **Data/export requirements:** Native board/project ZIP; SVG and visual exports described in the app guide.
- **Services and platform:** Local board editing uses browser storage. Work together requires the configured magic-wormhole transport and pairing; AI/coding features use the relay.
- **Direct app/format scripts:** [../architex/vendor/jszip.min.js](../architex/vendor/jszip.min.js), [../graphiX/svg-clean.js](../graphiX/svg-clean.js), [model.js](../colabriX/model.js), [collaboration.js](../colabriX/collaboration.js), [templates.js](../colabriX/templates.js), [render.js](../colabriX/render.js), [app.js](../colabriX/app.js), [ai-adapter.js](../colabriX/ai-adapter.js), [workspace-actions.js](../colabriX/workspace-actions.js), [wormhole.js](../colabriX/wormhole.js).
- **Example:** Arrange workshop notes into frames, review comments and share a portable project ZIP or explicitly pair another participant.

### designiX

- **Views:** Template/start panel; page canvas; layers/properties; assets/brand kit; typography; export/design preview.
- **Native tools:** Pages, text/shapes/images, alignment, brand settings, SVG rendering and raster/PDF export paths.
- **Data/export requirements:** Native design project/ZIP; SVG and image/PDF exports.
- **Services and platform:** Local design/rendering works without AI. Browser image/font/export support is needed for the chosen output; AI/coding uses relay services.
- **Direct app/format scripts:** [../architex/vendor/jszip.min.js](../architex/vendor/jszip.min.js), [../graphiX/svg-clean.js](../graphiX/svg-clean.js), [model.js](../designiX/model.js), [templates.js](../designiX/templates.js), [render.js](../designiX/render.js), [export.js](../designiX/export.js), [app.js](../designiX/app.js), [ai-adapter.js](../designiX/ai-adapter.js), [workspace-actions.js](../designiX/workspace-actions.js).
- **Example:** Create a campaign page, inspect layer positions, preserve embedded assets and export an editable backup plus a flattened preview.

### photiX

- **Views:** Image canvas; region selection; recipe/edit controls; text chat; generative-image previews.
- **Native tools:** Decode pixels, deterministic region edits, operation recipe, undo/redo, flatten/export and optional image/mask generation.
- **Data/export requirements:** Native source-plus-recipe JSON; PNG/JPEG/WebP; project backup.
- **Services and platform:** Browser Canvas/image decoding for native edits. Generative edits separately require an image provider configured on the relay; text AI and coding are distinct optional paths.
- **Direct app/format scripts:** [../architex/vendor/jszip.min.js](../architex/vendor/jszip.min.js), [model.js](../photiX/model.js), [app.js](../photiX/app.js), [generative.js](../photiX/generative.js), [workspace-actions.js](../photiX/workspace-actions.js).
- **Example:** Apply a region correction locally; for generation request variations, inspect the previews and apply one explicitly.

### vidiX

- **Views:** Media/library; timeline/layers; preview canvas; clip/motion properties; vector/frame drawing; export controls.
- **Native tools:** Asset loading, trim/speed/layer timing, motion/fades, drawing frames, playback and supported animation/video export.
- **Data/export requirements:** Native project with assets; GIF/animated SVG/PNG; browser-supported video exports.
- **Services and platform:** Browser codecs, media decoding/canvas and supported recording/export APIs determine media support. Text AI/coding is optional; loading the SDK does not add a transcoder.
- **Direct app/format scripts:** [vendor/omggif.js](../vidiX/vendor/omggif.js), [../graphiX/svg-clean.js](../graphiX/svg-clean.js), [model.js](../vidiX/model.js), [app.js](../vidiX/app.js), [editing.js](../vidiX/editing.js), [frames.js](../vidiX/frames.js), [ux.js](../vidiX/ux.js), [ai-adapter.js](../vidiX/ai-adapter.js), [designs.js](../vidiX/designs.js), [design-ui.js](../vidiX/design-ui.js).
- **Example:** Sequence imported clips, inspect durations in inventory, preserve locked layers and export a supported animation format.

### architex

- **Views:** Metamodel tree; instance model; architecture canvas; ports/connections; rule editor/results; export/import dialogs.
- **Native tools:** Component/type and instance editing, policy/data ports, graph layout, dependency validation, scoped interchange and explicitly managed rule evaluation.
- **Data/export requirements:** Metamodel/instance JSON and YAML; XLSX; draw.io/Mermaid/RST and other scoped exchanges in the app guide.
- **Services and platform:** Vendored YAML, ExcelJS, ELK and JSZip support the corresponding local features. AI/coding, remote services and explicitly chosen runtime operations need their backends.
- **Direct app/format scripts:** [vendor/js-yaml.min.js](../architex/vendor/js-yaml.min.js), [vendor/exceljs.min.js](../architex/vendor/exceljs.min.js), [vendor/elk.bundled.js](../architex/vendor/elk.bundled.js), [vendor/jszip.min.js](../architex/vendor/jszip.min.js), [sphinx-rst.js](../architex/sphinx-rst.js), [exchange-scope.js](../architex/exchange-scope.js), [mermaid-parser.js](../architex/mermaid-parser.js), [mermaid.js](../architex/mermaid.js), [interchange.js](../architex/interchange.js), [graph-layout.js](../architex/graph-layout.js), [validation.js](../architex/validation.js), [model.js](../architex/model.js), [app.js](../architex/app.js), [rule-library.js](../architex/rule-library.js), [scripting-guide.js](../architex/scripting-guide.js), [rule-examples.js](../architex/rule-examples.js), [rules-ui.js](../architex/rules-ui.js), [ai-core.js](../architex/ai-core.js), [schema-bundle.js](../architex/schema-bundle.js), [llm-handover.js](../architex/llm-handover.js), [chat-format.js](../architex/chat-format.js), [ai-adapter.js](../architex/ai-adapter.js), [semantic-import.js](../architex/semantic-import.js), [semantic-import-ui.js](../architex/semantic-import-ui.js), [panels.js](../architex/panels.js).
- **Example:** Define component ports, connect instances, run the intended validation scope and export the matching model rather than replacing unrelated scopes.

### graphiX

- **Views:** SVG artwork canvas; source editor; selection/properties; drawing controls.
- **Native tools:** SVG parsing/sanitization, vector editing, source changes, accessibility description, grouping and color/geometry transforms.
- **Data/export requirements:** SVG artwork/native backup; rendered image exports documented by the app.
- **Services and platform:** Browser SVG/Canvas for native rendering/export. AI/coding uses relay/provider/runtime only when selected.
- **Direct app/format scripts:** [svg-clean.js](../graphiX/svg-clean.js), [app.js](../graphiX/app.js), [ai-adapter.js](../graphiX/ai-adapter.js).
- **Example:** Select a rectangle, change its fill through the native editor or reviewed project bridge, then export SVG.

### textiX

- **Views:** Rich document editor; formatting/outline controls; find/replace; embedded-content catalog; import/export dialogs.
- **Native tools:** Sanitize/edit HTML, headings/tables/links/images, embedded project references, DOCX/PDF import/export and document recovery.
- **Data/export requirements:** Native rich document/HTML; DOCX; PDF; embedded project content.
- **Services and platform:** Vendored Mammoth/docx/PDF/html2pdf and browser layout support the corresponding format paths. Native text editing requires no provider; AI/coding is optional.
- **Direct app/format scripts:** [../architex/vendor/jszip.min.js](../architex/vendor/jszip.min.js), [vendor/mammoth.browser.min.js](../textiX/vendor/mammoth.browser.min.js), [vendor/docx.js](../textiX/vendor/docx.js), [docx.js](../textiX/docx.js), [vendor/pdf.min.js](../textiX/vendor/pdf.min.js), [vendor/html2pdf.bundle.min.js](../textiX/vendor/html2pdf.bundle.min.js), [pdf.js](../textiX/pdf.js), [embedded-core.js](../textiX/embedded-core.js), [app.js](../textiX/app.js), [ai-adapter.js](../textiX/ai-adapter.js), [catalogue.js](../textiX/catalogue.js), [embedded.js](../textiX/embedded.js).
- **Example:** Draft a document, create linked contents, inspect external links and export DOCX/PDF while retaining the native editable backup.

### sheetiX

- **Views:** Sheet tabs; cell grid; formula bar; function help; formatting/fill controls; find/import/export.
- **Native tools:** Cell addressing and selection, formula calculation, styles/number formats, relative/absolute fill, sheet operations and XLSX exchange.
- **Data/export requirements:** Native workbook JSON; XLSX; tabular exchanges documented by the app.
- **Services and platform:** Bundled formula engine and vendored ExcelJS for workbook behavior/XLSX. Text AI/coding is optional; formula support is the implemented local subset.
- **Direct app/format scripts:** [../architex/vendor/exceljs.min.js](../architex/vendor/exceljs.min.js), [functions.js](../sheetiX/functions.js), [formulas.js](../sheetiX/formulas.js), [app.js](../sheetiX/app.js), [functions-ui.js](../sheetiX/functions-ui.js), [ai-adapter.js](../sheetiX/ai-adapter.js), [fill-ui.js](../sheetiX/fill-ui.js), [catalogue.js](../sheetiX/catalogue.js).
- **Example:** Fill a column with relative formulas, inspect raw inventory values, then export XLSX or a formula-protected data inventory.

### codeiX

- **Views:** Project explorer/tabs; code editor; sandboxed HTML preview; chat/coding tab; proposed-file review; local-workspace controls.
- **Native tools:** Validated file/project edits, AI exclusions, native file review, sandbox preview, optional directory write-back and Tauri export.
- **Data/export requirements:** Native multi-file project/ZIP; static app bundle; optional desktop project export.
- **Services and platform:** Local editing/preview needs browser sandbox support. Filesystem write-back needs a user-selected supported directory handle. AI/coding and real tests/commands require relay/provider/runtime permissions.
- **Direct app/format scripts:** [../architex/vendor/jszip.min.js](../architex/vendor/jszip.min.js), [agent-spec.js](../codeiX/agent-spec.js), [project.js](../codeiX/project.js), [tauri-export.js](../codeiX/tauri-export.js), [app.js](../codeiX/app.js), [local-workspace.js](../codeiX/local-workspace.js), [tauri-ui.js](../codeiX/tauri-ui.js).
- **Example:** Edit a local SPA, review generated file changes, preview it in the sandbox and explicitly reconnect/write back to the linked directory.

### appiX

- **Views:** Source/visual app editor; screens/components; state/bindings/interactions; live preview; build/export/deploy controls.
- **Native tools:** Validated app source and designer model, UI SDK rendering, screen/state flows, sandboxed preview, static/native export scaffolds.
- **Data/export requirements:** Native app project; HTML/CSS/JS bundle; Rust/static-host deployment scaffolds.
- **Services and platform:** Preview needs the browser sandbox and app UI SDK. Real native builds/deployments need the chosen external toolchain/service; generating a scaffold does not deploy it. AI/coding uses relay services.
- **Direct app/format scripts:** [../architex/vendor/jszip.min.js](../architex/vendor/jszip.min.js), [designer-model.js](../appiX/designer-model.js), [ui-sdk.js](../appiX/ui-sdk.js), [project.js](../appiX/project.js), [app.js](../appiX/app.js), [designer.js](../appiX/designer.js), [designer-patterns.js](../appiX/designer-patterns.js), [designer-plus.js](../appiX/designer-plus.js), [designer-refine.js](../appiX/designer-refine.js), [rust-export.js](../appiX/rust-export.js), [deploy.js](../appiX/deploy.js), [ai-adapter.js](../appiX/ai-adapter.js).
- **Example:** Create two screens with state bindings, review navigation changes, test the preview and export a static bundle or build scaffold.

### automatextiX

- **Views:** Workflow canvas; node palette; selected-step configuration; run status/logs; results.
- **Native tools:** Workflow DAG editing, connections/mappings, explicit run/stop, data transforms and configured file/AI/web/command steps.
- **Data/export requirements:** Native workflow JSON/schema; generated result files.
- **Services and platform:** Editing and pure local transforms need no provider. Each executed step needs its own service: virtual disk, AI relay, web access or approved server command runner. Imported workflows do not execute automatically.
- **Direct app/format scripts:** [engine.js](../automatextiX/engine.js), [app.js](../automatextiX/app.js), [ai-adapter.js](../automatextiX/ai-adapter.js).
- **Example:** Build a file → transform → file workflow, inspect mappings, run it explicitly and review retained step results.

### reportiX

- **Views:** Research query/brief; source library; selection; research log; report/evidence preview; search settings; chat.
- **Native tools:** Collect evidence, select sources, maintain source IDs/citations, generate/review reports and inspect limitations.
- **Data/export requirements:** Native research backup; structured report/evidence; offline review and app export formats.
- **Services and platform:** Existing research can be edited locally. New crawling/research and configured Google search require relay/network/search settings; report generation requires an AI provider.
- **Direct app/format scripts:** [report-core.js](../reportiX/report-core.js), [agent-spec.js](../reportiX/agent-spec.js), [app.js](../reportiX/app.js), [ai-adapter.js](../reportiX/ai-adapter.js).
- **Example:** Collect sources, select cited evidence, inspect unsupported claims and preserve source IDs when editing the report.

### presentiX

- **Views:** Slide list; slide canvas; object/typography properties; speaker notes; animation/presentation view; import/export.
- **Native tools:** Slide/object editing, images/text/shapes, animation, notes, presentation playback and PPTX/package exchange.
- **Data/export requirements:** Native presentation/project ZIP; PPTX; rendered outputs documented by the app.
- **Services and platform:** Vendored JSZip and local presentation/PPTX modules for package exchange; browser rendering/media for playback. AI/coding is optional.
- **Direct app/format scripts:** [../architex/vendor/jszip.min.js](../architex/vendor/jszip.min.js), [animation.js](../presentiX/animation.js), [project.js](../presentiX/project.js), [pptx.js](../presentiX/pptx.js), [app.js](../presentiX/app.js), [ai-adapter.js](../presentiX/ai-adapter.js).
- **Example:** Build a slide deck, add editable slide numbers, review speaker notes and export PPTX plus the native backup.

### sketchiX

- **Views:** Diagram canvas; node/edge inspector; shape palette/library; UML/SysML/GSN modes; separate sketch and shape-editor pages.
- **Native tools:** Typed diagrams, connectors/routing, layout, freehand/vector artwork, reusable shapes and diagram/presentation interchange.
- **Data/export requirements:** Native diagram/artwork/shape projects; SVG; supported PPTX/draw.io and model exchanges.
- **Services and platform:** Local model/routing/IO modules and cross-app presentation packages support native interchange. AI/coding and external runtime features are optional.
- **Direct app/format scripts:** [../architex/vendor/jszip.min.js](../architex/vendor/jszip.min.js), [../presentiX/animation.js](../presentiX/animation.js), [../presentiX/project.js](../presentiX/project.js), [../presentiX/pptx.js](../presentiX/pptx.js), [uml.js](../sketchiX/uml.js), [gsn.js](../sketchiX/gsn.js), [sysml.js](../sketchiX/sysml.js), [model.js](../sketchiX/model.js), [io.js](../sketchiX/io.js), [app.js](../sketchiX/app.js), [shape-library.js](../sketchiX/shape-library.js), [ai-adapter.js](../sketchiX/ai-adapter.js).
- **Example:** Model a system, inspect dangling relationships, create a reusable shape in the shape editor and export SVG.

### mindiX

- **Views:** Mind-map canvas; topic editor; branch navigation; topic properties/images; relationships; outline/export.
- **Native tools:** Topic tree editing, collapse/expand/layout, owners/progress/dates, cross-links, images and outline/diagram interchange.
- **Data/export requirements:** Native mind map; supported outline/diagram/SVG/presentation exports.
- **Services and platform:** Local mind-map model plus sketch/presentation interchange helpers. Browser image support for topic media; relay/provider/runtime only for optional AI/coding.
- **Direct app/format scripts:** [../architex/vendor/jszip.min.js](../architex/vendor/jszip.min.js), [../presentiX/animation.js](../presentiX/animation.js), [../presentiX/project.js](../presentiX/project.js), [../presentiX/pptx.js](../presentiX/pptx.js), [../sketchiX/sysml.js](../sketchiX/sysml.js), [../sketchiX/model.js](../sketchiX/model.js), [../sketchiX/io.js](../sketchiX/io.js), [model.js](../mindiX/model.js), [app.js](../mindiX/app.js), [ai-adapter.js](../mindiX/ai-adapter.js).
- **Example:** Organize a topic tree, filter inventory by owner/progress and export the chosen branch or complete map.

### projectiX

- **Views:** Task table; Gantt timeline; task details; dependency/resource controls; import/export.
- **Native tools:** Task hierarchy, duration/progress/milestones, predecessor constraints, phase rollups, resource assignments and schedule interchange.
- **Data/export requirements:** Native project plan; supported spreadsheet/diagram/presentation exchanges.
- **Services and platform:** Local scheduling/model/IO code; ExcelJS and cross-app diagram/presentation helpers for corresponding exports. AI/coding is optional.
- **Direct app/format scripts:** [../architex/vendor/jszip.min.js](../architex/vendor/jszip.min.js), [../architex/vendor/exceljs.min.js](../architex/vendor/exceljs.min.js), [../presentiX/animation.js](../presentiX/animation.js), [../presentiX/project.js](../presentiX/project.js), [../presentiX/pptx.js](../presentiX/pptx.js), [../sketchiX/sysml.js](../sketchiX/sysml.js), [../sketchiX/model.js](../sketchiX/model.js), [../sketchiX/io.js](../sketchiX/io.js), [model.js](../projectiX/model.js), [io.js](../projectiX/io.js), [app.js](../projectiX/app.js), [ai-adapter.js](../projectiX/ai-adapter.js).
- **Example:** Plan dependent tasks, roll up phase progress, inspect incomplete tasks with numeric filters and export the plan.

### trackiX

- **Views:** Sprints & backlog sidebar; 5-column Kanban board and sortable list view; issue inspector & comments; JSON/CSV export dialog.
- **Native tools:** Epics, stories, tasks, bugs, subtasks, sprints, story points, blockers, Undo/Redo, capability inventory/actions and JSON/CSV export.
- **Data/export requirements:** `trackix-project` JSON and CSV issue inventory.
- **Services and platform:** Browser localStorage and shared AI/workspace/capabilities scripts; AI/coding is optional.
- **Direct app/format scripts:** [model.js](../trackiX/model.js), [render.js](../trackiX/render.js), [app.js](../trackiX/app.js), [ai-adapter.js](../trackiX/ai-adapter.js).
- **Example:** Create sprint issues, triage unassigned or high-priority backlog items via capabilities, inspect blockers, and export CSV/JSON.

## Agent tool contracts: what each integration must supply

| Operation | Required host support | App-specific condition |
| --- | --- | --- |
| Read open editor state | Current native snapshot and schema/context | C-profile `read_current_project` reads the browser project, not a server directory. P-profile chat serializes its own request context. |
| Apply to open editor | Native validation, current snapshot/revision check, reviewed application and Undo/recovery | C-profile `apply_project` must match the current app and snapshot. Most native apps need a complete document; codeiX can accept guarded project file changes. Never guess a schema from another app. |
| Query app objects | Native selection/inventory APIs, stable IDs and links | SVG shape IDs, sheet/cell addresses, task/need references, source citation IDs, layer IDs and screen targets have different semantics. |
| Read/edit server files | Runtime file tools such as `read_file` and guarded `apply_edits` | Only when the configured workspace is the intended target; changing a server file does not update an already open native project. |
| Execute verification | Explicit runtime tools, permissions and actual command receipts | Required for claims about real executed tests/builds; a UI preview or a proposed test command is not that evidence. |
| Use skills / agent profiles | Scoped guidance and actual advertised skill/library tools; host-selected roles | Skills and profile descriptions do not grant filesystem access or start delegated agents. Read pinned procedures before reuse. |
| Ask questions / deliver results | UI to display questions, public progress, tool receipts, reviewed proposals and final status | Preserve partial/blocked/paused outcomes. An inventory export or JSON completion summary is not automatically an applied native document. |

The [SVG walkthrough](../docs/coding-agent-book/SVG-EDITING.md) demonstrates the
difference between a source-file edit and an editor project takeover. For exact
request/response envelopes, use the [README protocol and embedding sections](README.md#integration)
and the currently advertised schema. This table describes host responsibilities;
it does not advertise extra tools to a running model.

## Views that are shared, optional or app-specific

- **Shared document views:** Workspace commands, find/replace, recovery,
  AI workflows, inspect/share and Tool actions; dialogs are created by shared code
  and may not appear as static sections in the app's HTML.
- **Shared optional coding views:** model/runtime settings, task checklist, operation
  trace, tool outputs, questions/follow-ups, project/file review and result downloads.
  Loading the coding UI does not mean a configured provider or runtime is available.
- **App-specific subviews:** diagram vs metamodel/instance scope; source vs rich
  document; timeline vs frame drawing; screen prototype vs design flow; citations
  vs collected evidence. Preserve the selected scope when routing tools/results.
- **Shell views:** command editor, agent-goal input, runtime/sessions, output/history,
  snippets and command inventory. Restoring a document or selecting inventory rows
  must never be translated into replaying terminal history.

## Maintain this map

Check [apps.js](../shared-suite/apps.js), the relevant `<app>/index.html`, native
model/adapter and its README when adding an app, a view, a format or a backend.
Keep actual script loading order and dynamically loaded helpers in mind. Update
this summary and the [SDK source-file index](README.md#howto-complete-source-file-index)
when adding/removing files under `codingagentlib/`. Profile C means the coding UI
is loaded in the entry page, not that all optional SDK features are implemented
by the app or by every language runtime.

Validation for this document is source-level: app coverage, profile/script-tag
checks, link resolution and index coverage. Existing runtime/browser test evidence
lives in [the status report](../specs/APPS-STATUS-REPORT.md); documenting a format or
service here does not establish a new live integration or end-to-end test result.

## Standalone two-view SDK teaching host

[Two-view example](examples/two-views/README.md) is separate from the 24 registered
suite apps. It displays a fixed SVG circle and styled rich-text note with distinct
`svg_color` and `rich_text` edit tools, chat and a bottom trace/export panel.
Python, Node (JavaScript/TypeScript SDK) and native Rust implement the handlers
independently. Python serves the common page; a configured OpenAI-compatible
endpoint enables natural-language chat, otherwise deterministic commands run locally.
No suite AI adapter, imported document execution or filesystem tools are involved.
