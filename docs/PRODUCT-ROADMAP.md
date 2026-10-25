# Iterative product-quality upgrade

This is a hobby suite, not a replacement with verified feature parity for the
commercial products below. The comparisons define user workflows to work toward;
they are not claims of compatibility, affiliation, performance or completeness.
The MIT license and project disclosure remain unchanged.

## Delivery log

| Iteration | Implemented | Verification |
| --- | --- | --- |
| 1 — Durable recovery | Automatic native-document checkpoints across all 13 apps and both sketch sub-editors; ten rolling copies, separate from thirty named points; visible errors; per-editor pause | Browser coverage for every adapter, duplicate suppression, retention, restore, busy operations and storage failures |
| 2 — Version workflows | Search/filter versions, retain an automatic checkpoint as a named copy, rename named points, compare two saved versions, export the complete comparison, review before restore | Native restore with prior-document safety copy; comparison leaves live document unchanged |
| 3 — Repeatable quality gate | One command for curated unit checks and cross-app browser workflows, with bounded execution, nonzero failure status and machine-readable evidence | `node scripts/verify-suite.cjs --browser --base-url http://127.0.0.1:8000 --report /tmp/suite-report.json` |

These iterations improve reliability and verification. They do not complete the
editing, interoperability, accessibility or collaboration milestones below.

The [recorded local verification baseline](verification-baseline.json) passed all
84 checks. Test durations describe this run; they are not product performance
benchmarks or service guarantees.

## Next app-specific iterations

Implement each row as a separate vertical slice: model and schema, editor controls,
keyboard interactions, AI proposals, native undo/recovery, import/export and tests.
A feature is complete only when its acceptance examples pass; adding a button or
listing a format is insufficient.

| App / workflow reference | Next editing milestone | Acceptance evidence needed |
| --- | --- | --- |
| Architex / architecture modeling tools | Large nested systems, port contracts and traceable requirements | Cyclic dependency and nested-port fixtures; schema-valid AI edits; metamodel/instance round-trips without ID or parameter loss; measurable layout time |
| graphiX / Inkscape and Illustrator | Direct path-node editing, snapping, alignment and reusable symbols | Drag/add/remove Bézier nodes; undo each operation; preserve transforms, gradients and internal references through SVG round-trip |
| textiX / Word and Writer | Stable document model, styles, pagination, review comments | Keyboard selection and composition tests; long document print fixtures; DOCX paragraph/list/table/image fidelity report |
| sheetiX / Excel and Calc | Relative/absolute reference fill, ranges, tables and charts | Fill/copy formula reference tests, dependency recalculation and cycle checks, keyboard range selection, XLSX workbook fixtures |
| codeiX / VS Code | Language diagnostics, project-wide navigation, diff/merge and test/debug tasks | Real local workspace fixtures, rename/reference tests, reviewable agent patches and controlled terminal execution, cancellation and conflict handling |
| appiX / visual app builders | Reusable components, data collections, structured forms and responsive constraints | Build and use a multi-screen CRUD app with validation, keyboard access and error states; verify exported SDK and local deployment |
| automatextiX / n8n | Retry/backoff, resumable runs, typed mappings and per-node debugging | Deterministic failed/retried HTTP and AI fixtures; no repeated unsafe side effects; cancellation, restart and durable run inspection |
| reportiX / research reporting tools | Evidence review, citation quality checks, incremental research and accessible visual reports | Every factual claim traces to collected evidence; changed/unavailable-source fixtures; no fabricated citations or chart data |
| presentiX / PPTx and Impress | Masters, reusable layouts, alignment, presenter controls and richer typography | Master-to-slide edits, keyboard presenting and speaker notes; PPTX fixtures covering unsupported content warnings and editable round-trips |
| sketchiX / draw.io and Visio | Obstacle-aware routing, shape libraries, constraints and nested diagrams | Routing avoids node interiors; connectors follow moves; large/nested draw.io and VSDX fixtures with explicit loss reports |
| mindiX / MindManager | Focused branch workflows, task summaries, search navigation and outline synchronization | Keyboard-only editing, expand/collapse stability, branch reorder and task rollups, image/link preservation across exports |
| projectiX / MS Project | Work calendars, critical path, baselines, resource capacity and schedule comparison | Weekend/holiday calendars; FS/SS/FF/SF and lag fixtures; critical-path oracle cases; baseline variance and MSPDI fidelity |
| vidiX / video and animation editors | Deterministic timeline, waveform/audio mixing, frame-accurate trim and robust render/export | A/V sync and frame-count fixtures, source-rate conversion, keyframe interpolation, render cancellation and explicit codec capability tests |

## Shared release criteria

1. **Data integrity:** importing malformed or unsupported input must preserve the
   open document. Supported native content must round-trip with stable IDs,
   references and embedded assets. Restoring a version requires a reviewed diff.
2. **Editing:** expected keyboard commands, undo/redo, selection, empty/error
   states and cancellation work for each delivered workflow. Pointer-only controls
   need keyboard alternatives and visible focus.
3. **AI:** questions do not mutate content; proposals satisfy native schemas,
   preserve unrelated objects and require review. Multi-turn and paged results
   survive tool errors and cancellation. Real-provider testing is separately gated.
4. **Interoperability:** maintain representative real files for every advertised
   format. Document supported subsets and report discarded content before import.
   A metadata payload alone does not establish native-format fidelity.
5. **Performance:** record load/edit/layout/export timings for small, medium and
   large fixtures on a stated browser and machine. Set budgets from those measured
   baselines rather than claiming unmeasured scalability.
6. **Accessibility:** test keyboard-only and screen-reader workflows, focus
   management, labels, contrast and reduced motion. Automated checks supplement
   manual verification; current browser tests are not a WCAG certification.
7. **Operations:** test storage exhaustion, interrupted work, schema migrations,
   relay unavailability and workspace conflicts. Backups must be portable; browser
   recovery is not cloud synchronization or a substitute for external backups.

## Running the current gate

From the repository root, with Node.js installed:

```sh
node scripts/verify-suite.cjs --report /tmp/suite-unit-report.json
```

For the browser gate, install Playwright/Chromium and run the suite server in a
separate terminal (no provider credentials are required):

```sh
python3 server/server.py --port 8000 --disable-agent
node scripts/verify-suite.cjs --browser --base-url http://127.0.0.1:8000 --report /tmp/suite-report.json
```

The browser tests use `/usr/bin/chromium`. The gate runs 53 curated unit scripts
and, with `--browser`, thirty-one browser scripts. Some browser scripts visit all 15
editor pages. Each child has a three-minute timeout. Failure logs, durations and
limitations are retained in the JSON report. The suite server must remain running;
the gate does not launch it or contact real AI providers. This is an initial gate,
not exhaustive product, security or external-service certification.

Use `--rust` to include Cargo compilation and an actual exported Rust-server/browser smoke test. It implies `--browser` and requires an installed Rust toolchain.

Reusable coding-agent tool workflows now support typed inputs, previous-result references, versioned workspace storage, bounded audited execution, local programs, cross-session discovery, management/import/export, interruption handling and ZIP handoff. The new browser manager test passes; backend verification includes 56 tests with twelve workflow cases.

Workflow-library follow-up: paged revision history, structural version comparison, staging historical definitions as new revisions, cloning, input defaults, static permission/allowlist preflight, and draft continuation for paused executions. Verified with 56 backend tests and the extended cross-app workflow-manager browser test.

Paging recovery now accepts fenced JSON locally and automatically repairs malformed envelopes twice per page with preserved source/control and accepted fragments. New unit and cross-app browser regressions cover malformed input/output, identifier and memo errors, source references, cancellation, manual retry and journal recovery counts. All 78 curated checks passed.

Skills, workflows and local tools now have a separate resizable management window with accessible tabs, preserved drafts and mobile layout. Final project-apply buttons are visually highlighted. Paging adds cancellable bounded network/provider retries, Retry-After handling, alternating source-read loop correction and empty-result repair. Verification: all 79 curated checks passed, including management, real local commands, reviewed merge, cross-app mobile/keyboard behavior and paging recovery.

Paged structured-result completion now validates JSON, required top-level fields and original identifiers before committing a final fragment. Corrections retain accepted pages; one bounded output restart can recover an invalid earlier prefix without repeating input ingestion. Rejected attempts remain archived. Small explicit result contracts preserve required identifiers across rolling memo compression. Verification: 80 curated checks passed, with targeted final-result and cross-app paging regressions repeated after the contract metadata addition.

Paging normalization and pause follow-up: string-aware transport trailing-comma cleanup, bare and JSON-encoded envelopes, strict unchanged identifiers/content, recovery journal normalization notes, and accepted-page batch accounting prevent pauses during correction attempts. Provider attempts remain counted separately, including failed calls. Verification: all 81 curated checks passed; the focused normalization test was also repeated after live-call counter updates.

Coding-agent paging recovery: recommended direct-first compressed planning, explicit paging retained, bounded protocol failures handed to direct replanning for the rest of the run, inline progress controls, manual partial takeover, and post-stop follow-up drafts. Partial text is stored as unverified repair input and never executes directly. Recovery journals survive resume. Verification: all 83 curated checks passed; focused browser tests were repeated for malformed direct repair, stopped-session recovery, journal download and mobile inline controls, with zero partial command execution.

Agent response review now parses one complete JSON object with surrounding prose, outer fences or redundant terminal closing delimiters. Quoted content remains unchanged; ambiguous/multiple objects and partial actions remain rejected for correction. Direct planning and paged completion share the parser. Older review cards are marked resolved and collapsed after a later accepted response, preserving original feedback. Verification: 84 curated checks passed, followed by focused parser, paging-recovery and reload/resume checks covering the resolved-card UI and exactly-once action execution.

All coding-agent supporting utilities now live in the dedicated Agent tools window: Run setup, Skills, Workflows, Local tools, and Files & results. The main pane retains conversation/run controls, progress and live recovery, with a new-run permission summary. Session loading and instruction drafts return to the main pane; merge remains highlighted inside Files & results. Existing browser tests navigate the visible tools tabs through a page-object helper. All 84 curated checks passed; two former-layout assertions were updated and rechecked, with original/recheck results retained in the verification report. Structural/mobile navigation checks cover all 15 editor pages.

Suite button verification: 101 curated checks passed. The gate now includes every app’s core browser workflow, vidiX creation/UX, all 15 editor pages’ shared desktop/mobile controls, new native editing operations, and coding-agent trace contracts. Fixed Architex’s unwired architecture rail control. Updated ambiguous AI proposal selectors, configurable server addresses and independent office fixtures. A stricter visible-button handler audit and desktop/disk/relay settings checks also passed. See BUTTON-VERIFICATION.md for scope and limitations.

Agent capability follow-up: deterministic working briefs pin evidence, latest instruction references, touched paths and verification freshness in each planning request. Failed command output suggestions use exact observed cursors and never execute automatically; brief downloads live in Agent tools. Every app now supports editing-action search with empty-state/reset behavior. Focused browser reruns passed across all 15 editors for shared buttons, schemas, new conversations and relay URL settings, plus native action validation, real agent execution, ReAct verification and paging recovery. Five focused unit checks passed; the verification baseline retains the original 101-check full run separately from these follow-up results.

Architex direct architecture mode: persistent Modeling mode option opens a separate component/dependency workspace without type-definition or instance creation. Independent browser storage and Undo histories preserve typed models when switching. Direct mode hides instance/policy controls, supports existing layout/connection/editing/export operations and AI editing, and rejects typed-instance imports and AI proposals. Verified with direct-mode mouse connections, cleanup, reload/switch preservation, atomic rejection and mobile configuration; normal Architex and shared-control regressions passed.

TLAL OS interface: shared palette tokens and typography, neutral panels, maroon primary actions, blue informational/focus states, restrained orange progress accents, circular outline launcher icons, clearer desktop hierarchy and reduced-motion support. Theme covers the desktop, all apps, artwork editors and relay settings without changing stored document colors. The verification baseline contains 104 passing checks: the full 103-check run, the updated primary-color regression rerun (original failure preserved), and the new 17-page theme check. See UI-STYLE.md for supplied guide, implementation notes and preview screenshots.

Project takeover policy: new agent runs require an explicit choice between reviewed takeover and direct application. The saved policy survives runtime reload and resume. Review mode gates autonomous project edits and manual codeiX workspace-file synchronization, with rejection/Stop, stale-document checks and post-review instruction/session revalidation. Schema and acceptance checks remain active. Dedicated takeover, existing project/loop/resume browser checks and 51 backend tests passed. Restart the suite server to load policy support.

Shared skill catalog: server-managed persistent SQLite vector storage, hybrid lexical/vector retrieval, startup/daily refresh, per-app editable standard sets, paged pinned reads, directory resolution, and import/export of app profiles. Bundled snapshot: 78 full skills and 1,159 references with source revisions/licenses. Chat and coding-agent requests carry app identity through paging; agent search/read/fetch tools complement local learned skills. Four GitHub sources were verified online; Linkly remains visibly proxy-blocked. All 106 curated checks passed after rechecking the updated transport assertion, together with 68 backend tests and focused UI/paging checks. See SHARED-SKILLS.md for usage, storage, provenance and limits.

Skill management follow-up: catalog source filters, targeted refresh, live count/range summaries, status checks that preserve drafts, bulk selection, missing-entry repair, app-set copying, saved retrieval previews and versioned profile history. Historical settings stage a draft and save as a new revision. Reader supports previous/next pages and full pinned Markdown downloads. Search/profile responses discard stale requests. Verified with 70 backend tests and the expanded isolated browser workflow, including source filter isolation, staged restore, app copying, long-document download and mobile/origin checks.

codeiX Tauri v2 export: dedicated Tauri ZIP dialog for static HTML and build-based frontends, preserving loaded source files and existing Cargo/package configs under the frontend tree. Generated ZIP contains Rust library/binary/build script, Tauri v2 config/capabilities, cross-platform icons, npm CLI scripts and mode-specific build instructions. Verified with unit and real browser ZIP/disk/mobile tests, existing codeiX regression, independent Cargo TOML parsing and PNG checks. Native compilation is not claimed because this environment lacks Rust/native prerequisites.

Cross-app editing presets: every editor can save an existing action and its settings, edit/delete the preset, preview on the current document, and import/export app-specific parameter sets. Validation rejects unknown actions, invalid basic input types, duplicate IDs and cross-app imports; import merges atomically. Preset application uses existing native validation, explicit review and recovery. Verification: 108 full regression checks passed with zero failures, plus 70 backend tests and focused preset CRUD/export/import/persistence/mobile checks on all 15 editor pages. graphiX/presentiX tests also apply actual reviewed transforms. Live providers and native Tauri compilation remain outside this gate.

### photiX image workflows

Added an agentic raster editor with reviewed region-scoped recipes, shared chat and virtual disk. Provider-backed image tools support masked fill/removal, expansion preserving original pixels, image generation, references, harmonization, transparency requests and variations. Local crop/rotate/flip/upscale are previewed. The separate server-owned image provider has redacted settings, protected credential storage and exact-origin controls. Targeted browser pixel tests and real HTTP fixture-provider tests pass; live generative quality and Photoshop parity are not asserted.

### Suite-wide reusable editing workflows

All 16 editor pages now support named native-editing workflow libraries with independent saved settings, explicit step replacement, app-specific atomic import/export, per-step change reports and one reviewed application. photiX participates with region-scoped effect presets and inventory export. Browser checks cover each page's persistence, portability and mobile dialog width, plus actual SVG/image applications and a failing later step that cannot modify the live document.

### Optional Tauri 2 complete desktop

Added a native wrapper for the full desktop and 14 apps, with public-asset staging, platform sidecar freezing, private persistent configuration/workspace paths, process-bound readiness, occupied-port failure and graceful lifecycle control. Native builds are available through a manual cross-platform CI workflow. Actual frozen Linux HTTP/lifecycle tests and schema validation passed; native Rust compilation and WebView execution require the target-platform toolchains. Browser deployment remains supported.

### TLAL OS style-guide alignment

Bundled licensed Inter for offline interface typography, completed the spacing tokens, and aligned relay/photiX controls, the launcher icon, README illustration and native startup screen with the supplied palette and hierarchy. User artwork, document typography and source monospace styles stay separate. Visual browser checks pass across 18 pages; README screenshots were refreshed for the desktop and 14 apps. The original master logo was not supplied, so the wordmark remains the brand identifier.

### Portable native project ZIPs

All 14 apps and both additional sketchiX editors now export/import versioned project ZIPs through local or virtual disk. Native validation, a combined review, revision guards and recovery protect import. Archives retain embedded media and native fields; app/relay configuration and unrelated files stay separate. Tests pass for all 16 editor pages, with real downloads, local/disk restores, corrupt imports, source-image changes, embedded video-project assets and busy/stale guards.

### Whole shared-disk ZIP backups

The desktop and all apps now export the entire virtual disk and preview/restore versioned or ordinary ZIP archives. Backups retain bytes, empty folders, MIME types, timestamps and app ownership. Keep/overwrite merges and explicitly confirmed full replacement run atomically with a disk-revision guard. Tests cover stale/conflicting changes and rollback after simulated quota failure, plus existing per-app ZIP/navigation regression.

### Suite-wide command navigation

All 16 editor pages now support persistent command pins, recent invocations, multiword search, filtered views and keyboard result navigation. Stable command IDs retain preferences when labels change; unavailable native actions stay hidden. Direct shortcuts open project/disk ZIP controls and the coding-agent UI without automatically executing those actions.
