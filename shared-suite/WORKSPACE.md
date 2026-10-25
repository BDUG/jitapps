# Workspace tools across the suite

Every editor now has **Workspace** beside the shared virtual disk controls, including codeiX, vidiX and sketchiX's two sub-editors. Use **Ctrl+K / Cmd+K** to open its command palette. The tools run locally and do not require an AI provider.

## Commands

Search for an editor action, find/replace, recovery, inspection, handoff export or another app. Press Enter to choose the first result, or use Tab to navigate. Native commands keep the editor's existing confirmations and behavior. The shortcut yields to other open dialogs. Workspace tabs support arrow keys, Home and End.

## Find and replace

Search names, labels, text, descriptions, notes and other editable text. Results show document paths and excerpts; the first 100 matches are displayed with the total count. Searches use literal text rather than regular expressions and optionally match case.

Enter replacement text and choose **Preview replacement**. Rich-text HTML and SVG use text-node replacement by default, preserving markup, attributes, links and styling. Matches remain within individual text nodes/fields; phrases split across formatting boundaries are not combined. Replacement text is inserted as text, not executable markup.

**Include raw source and formulas** also searches file contents, JavaScript, CSS, HTML/SVG source and formula strings. This is selected initially in codeiX and appiX. Raw markup replacement can change identifiers inside that markup; inspect its preview carefully. Structured IDs, paths, graph references, embedded media, imported asset metadata, evidence libraries and custom validation scripts are outside bulk replacement. A full schema/reference validation still runs before application.

Inspect changed fields, then **Apply reviewed changes**. If content has changed since the preview, application is blocked. A named recovery point is saved before replacement or restoration. Invalid edits leave the current document untouched. A storage error or full recovery store blocks application, so it cannot overwrite content without preserving the prior document.

## Named recovery points and portable backups

Under **Recovery**, name and save a point before a substantial edit. Points persist in a separate IndexedDB database in this browser and origin. Restore is previewed and validated. Download or delete individual points. Each editor has up to 30 points and each document can be at most 50 MiB; delete older points explicitly when full. Nothing is silently pruned. Browser storage quota and data clearing still apply—export important backups.

**Export workspace backup** creates a versioned JSON envelope with the exact editor identity and its native document. **Open workspace backup** accepts it from **Local disk** or **Virtual disk**, previews changes, and validates before applying. A backup for another tool or another sketchiX sub-editor is rejected. These are separate from the editor's normal interchange formats; use Workspace to open a `.workspace.json` backup. The complete document is downloadable even when long fields are shortened in the on-screen change preview.

Native content is preserved rather than approximated using an AI proposal:

- **Architex:** both models and custom rule library. New/changed scripts remain disabled; unchanged existing enabled scripts can retain their status. Normal connection/validation safeguards still apply.
- **vidiX:** full project and embedded source assets, including assets currently unused by clips. AI chat still receives media metadata through its normal adapter.
- **reportiX:** the entire research question, brief, collected source library, selections, current report, evidence snapshot, research log and research settings. Restoring does not crawl or compile a report.
- **codeiX:** complete project files. Restore disconnects a linked OS directory, following native project import; it never writes files to that directory automatically. Reconnect and explicitly write when appropriate.
- **Other editors:** their validated native editable document. Content restore uses the editor's normal history where available. A recovery copy also remains available independently of native Undo.

Restoring appiX content stops its preview; the user must run it explicitly. Restoration never starts code previews, automation runs, media exports or external commands. Existing enabled Architex validation rules still follow the editor’s normal validation lifecycle. Active editor operations, source imports/exports, network calls and gestures block replacement/restoration until finished.

## AI workflows

Each of the 13 apps has three task-specific workflows: review, extension and preparation for interchange. sketchiX's sketch/shape editors have their own three workflows. Choose **Use in chat** to append a draft to the existing prompt, preserving any text already entered. It does not send the request. Drafts include acceptance criteria and preservation/verification guidance; edit them, send them through the existing relay, then review any proposed edits as usual.

Examples include formula audits and dashboards in sheetiX, architecture impact and consistent two-model edits in Architex, evidence review in reportiX, clip timing/export budgets in vidiX, and accessible self-contained app changes in appiX. These are prompts, not claims that an AI or external operation already ran.

## Inspect and share

Inspect document size, collections, strings, embedded asset counts and native structure. Tool-specific read-only insights include:

| App | Additional measurements |
| --- | --- |
| Architex | Components, dependencies, instances, data connections and custom rules |
| graphiX | Vector elements, groups, paths, text and reusable references |
| textiX | Words, headings, tables, images, links and reading time |
| sheetiX | Sheets, stored cells, formulas and styled cells |
| codeiX | Files, source lines, TODO/FIXME markers and UTF-8 bytes |
| appiX | HTML/CSS/JavaScript line counts and brief words |
| automatextiX | Steps, edges, AI calls, web calls and command steps |
| reportiX | Collected/selected sources, report evidence, report presence and question words |
| presentiX | Slides, objects, images, speaker notes and text words |
| sketchiX | Nodes, connections, UML objects and images; sub-editors show artwork geometry counts |
| mindiX | Topics, primary branches, relationships, images, ownership and dates |
| projectiX | Tasks, milestones, dependencies, critical leaf tasks and calculated finish |
| vidiX | Layers, assets, duration, frame rate, GIF frame budget and resolution |

**Validate document** runs structural validation, without executing arbitrary code, external calls, workflows, previews or all domain-specific checks. Use the editor's validation/evaluation tools for those. **Export inspection report** saves the current measurements and format notes as Markdown to either disk.

**Download schemas** exports the native document contract and the tool's AI schema/context where available. Some native backup contracts are described rather than formal JSON Schemas; the tool's runtime validator remains authoritative.

**Export agent handoff ZIP** creates:

- `workspace.json`: portable native document backup.
- `agent-context.json`: context and selection according to the editor's existing AI handover policy.
- `schemas.json`: native/AI contract information.
- `AGENT-HANDOFF.md`: a spec-driven template with goal, requirements, tool instructions, acceptance/verification guidance and the return path.

Edit the goal and requirements before giving the archive to an agent. The archive is not a live chat request and contains no valid current request IDs. Provider settings and chat logs are excluded; project source and imported media can be included in the native backup. Choose the normal suite export destination for local or virtual disk delivery. Use the neighboring app links and normal compatible export formats to transfer content between different tools.

## Verify

Start the suite on port 8000, then run:

```sh
node shared-suite/workspace-core-test.cjs
node shared-suite/workspace-browser-test.cjs
node shared-suite/workspace-native-browser-test.cjs
node shared-suite/browser-test.cjs
```

The workspace browser test exercises all 13 apps and both sketchiX sub-editors: palette, validation/insights, persistent recovery and native restoration, downloadable handoffs and non-sending AI drafts. It also checks sanitized text replacement/import, stale-preview protection, cross-tool isolation, point quotas and mobile layout. Existing shared disk, AI and native editor tests remain relevant. No live provider or external execution is needed for these checks.

## Tool actions and portable inventories

Open **Workspace → Tool actions** (also available from Commands). This adds concrete editing operations for every app, alongside native inspection and AI workflows:

| App | Reviewed editing actions | Inventory contents |
| --- | --- | --- |
| architex | Categorize uncategorized definitions; fill missing connection-policy descriptions | Definitions, dependencies, instances, policy/data ports and connections |
| graphiX | Accessible SVG title/description; group top-level artwork | Vector object types, IDs, labels and styles |
| textiX | Linked table of contents; semantic first-row table headers | Headings, tables, images and links |
| sheetiX | Header-row styling; trim literal cell padding while preserving formulas | Sheet/cell addresses, raw values, formula flags and formats |
| codeiX | Final newlines; project file manifest | Paths, bytes, source lines and TODO markers |
| appiX | Add missing screen navigation; button feedback interaction | Visual components, screens, bindings and interaction counts (or source sizes) |
| automatextiX | Terminal output audit logs; disable virtual-file overwrites | Steps, edges, result fields and file mappings |
| reportiX | Select collected sources; normalize URL inputs | Source titles/URLs, selection and citation-use counts |
| presentiX | Editable slide numbers; note outlines from existing slide text | Slide titles, object/image counts and speaker notes |
| sketchiX | Reset attached edges to automatic orthogonal routing; label blank nodes | Diagram nodes and connection references |
| sketchiX sub-editors | Consistent non-text stroke widths | Artwork geometry types and stroke properties |
| mindiX | Branch color families; collapse completed branches | Topic hierarchy, owners, priorities, dates, progress and notes |
| projectiX | Duration-weighted phase progress; assign unallocated leaf tasks | Tasks, hierarchy, duration, progress, resources and dependencies |
| vidiX | Consistent fades on unlocked clips; stop layer movement | Clip ranges, source references, trim/speed, drawings and layer flags |

Each action prepares a native validated change preview. **Apply reviewed changes** verifies the document is still current, saves a recovery point, and applies through the existing editor adapter. Nothing executes a workflow, command, preview, network request or provider call. codeiX restores disconnect a linked local folder; explicitly reconnect before writing to it. vidiX’s fade action deliberately replaces opacity envelopes; locked layers remain unchanged. If an action has no applicable changes, the workspace reports that result. Empty source libraries and diagrams are not populated with invented information.

**Refresh inventory** shows up to 100 records; **Export inventory** includes every record in JSON, Markdown, CSV or native sheetiX workbook format through the app’s existing computer/virtual-disk destination. JSON preserves exact data types. CSV protects formula-like text with a leading apostrophe; it is a data inventory, not a formula-bearing spreadsheet. Markdown escapes cell separators and HTML and preserves multiline text. Workbook exports split into sheets of 199 records plus a header, up to 3,980 records; oversize inventories report a clear error and can use JSON/CSV. Import the workbook into sheetiX from local or virtual disk to sort, analyze or export XLSX. Native project export remains the format for lossless editing.

**Draft a tool review in AI chat** inserts a tool-specific prompt into the Chat tab. Review and send it yourself; existing context/schema, paging and proposal review remain in use. Inventory generation never sends data to a provider automatically.

Verification: `node shared-suite/capabilities-test.cjs` and, with a suite server, `BASE_URL=http://127.0.0.1:8000 node shared-suite/capabilities-browser-test.cjs`. Browser checks cover every action against native validators, reviewed application/recovery, inventory export and AI drafting across all 13 apps and both sketchiX sub-editors.

### Bulk edit

Open **Workspace → Bulk edit** to change supported scalar fields such as names,
labels, notes, descriptions and task values. Filter by field path and navigate
40 fields per page. Edits remain drafts until **Review changes**, then the normal
native validation, diff preview and recovery-point workflow applies them. If the
underlying document changes, refresh the table before reviewing.

**Export edit set** downloads a JSON field inventory (or saves to virtual disk
using the configured export destination). Keep its `format`, `tool`, `baseline` and `path`
values unchanged and edit only `value`; import through the file picker from local
or virtual disk. Value types must remain unchanged. Unknown, duplicate and
protected paths are rejected. IDs, relationships, source code, assets, validation
rules and locked objects are excluded. This is a scalar field editor; SVG artwork,
rich text structure and source code remain editable in their native editors.

### Additional native editing actions

All operations are available in **Workspace → Tool actions** and prepare native document proposals. They never execute project code, AI calls or workflows.

| App | Editing capability |
| --- | --- |
| architex | Fill unlabeled dependencies using their existing source and target component names. |
| graphiX | Make artwork responsive with a preserved or dimension-derived SVG viewBox. |
| textiX | Repair skipped heading levels while preserving text, attributes and inline formatting. |
| sheetiX | Format numeric literals while preserving formulas, explicit formats and leading-zero identifiers. |
| codeiX | Add a portable .editorconfig without replacing existing settings. |
| appiX | Generate missing form-control labels from bindings or component IDs. |
| automatextiX | Arrange acyclic workflows from left to right by their dependencies without executing steps. |
| reportiX | Select the collected evidence cited by the current report without modifying source content. |
| presentiX | Scale text across slides while preserving object geometry and speaker notes. |
| sketchiX | Snap nodes to a configurable grid; set artwork opacity in both sub-editors. |
| mindiX | Sort sibling topics alphabetically while preserving hierarchy, images and relationship styles. |
| projectiX | Scale leaf-task estimates while preserving milestones and dependency constraints. |
| vidiX | Sequence unlocked layers back-to-back, preserving sources, motion and frame drawings. |

Workflow layout rejects cycles and dangling endpoints. Typography and task scaling reject out-of-range results. Video sequencing rejects locked layers and timelines longer than 120 seconds. Responsive SVG conversion requires a viewBox or positive pixel dimensions. Source-only appiX projects remain editable in the source editor.

### Batch editing and spreadsheet transfer

In **Workspace → Bulk edit**, expand **Batch and spreadsheet tools**. Filter by
path and text/number type, then select individual fields or **Select filtered**
(all matching pages). Selection persists across filters until **Clear selection**.
Set values, add text prefixes/suffixes, replace literal text, or scale numbers.
Mixed incompatible types reject the whole batch, preserving existing drafts.

Paste one spreadsheet column into **Spreadsheet values**, with exactly one row
per selected field in document order. Quoted cells can contain newlines or tabs.
Paste errors leave drafts unchanged. Review and apply through the native editor.

Export edit sets as JSON or spreadsheet CSV. CSV `valueJSON` contains JSON literals:
text needs double quotes, numbers do not. Leave all other columns unchanged.
The v2 format includes a SHA-256 document revision fingerprint. Import rejects
other tools, changed documents and old v1 edit sets (re-export these). Export and
revision verification require HTTPS or localhost. File pickers support local and
virtual disk, and downloads honor the app's configured export destination.

**Download field schema** exports a revision-specific JSON Schema for coding
agents, listing only editable paths and their scalar types. Domain constraints
still run through the app's native validator when preparing the review.

### Automatic recovery and saved-version comparison

**Workspace → Recovery** enables automatic local checkpoints by default. After a
change settles, the editor checkpoints at most once per thirty seconds; it also
checks periodically for programmatic edits and attempts a checkpoint when the tab
is hidden. Active gestures, AI calls and other busy operations defer capture.
**Checkpoint now** explicitly saves the current native document, even when automatic
capture is paused. Large media can consume browser storage; a checkpoint is limited
to 50 MB and failures appear next to the controls. Data at the instant of a crash
or forced close is not guaranteed to be captured.

The ten latest distinct automatic checkpoints rotate independently of the thirty
named recovery points. **Keep named copy** protects a particular checkpoint from
rotation. Rename, search and filter saved versions. Compare two versions to inspect
changed paths without modifying the live document; the screen shows the first
100 fields with shortened values, while **Export comparison** contains the full
diff. Use **Preview restore** and review/apply to restore. A safety copy of the
current document is saved first; if named recovery storage is full, free space or
export before restoring.

Recovery is stored in IndexedDB on this browser and origin. It includes native
content and embedded assets, but not provider configuration or chat history.
It is neither cross-device synchronization nor an external backup. Export valuable
work to local or virtual disk and keep an independent copy.

### Native productivity extensions

The following actions operate on native documents through the existing review, validation and recovery pipeline. They do not execute projects or contact providers.

| App | Capability |
| --- | --- |
| architex | Fill missing instance parameters from direct component defaults while preserving overrides and ports. |
| graphiX | Replace an exact fill, stroke or gradient-stop hex color without changing SVG references. |
| textiX | Create/update a deduplicated reference list from existing external document links. |
| sheetiX | Fill down or right with shifted relative formula references, preserved absolute anchors and copied styles. |
| codeiX | Generate a source TODO/FIXME task index with file and line locations. |
| appiX | Initialize missing state bound to form controls while preserving existing state values and workflows. |
| automatextiX | Insert configurable pacing delays after HTTP/web steps without changing data mappings. |
| reportiX | Deduplicate source IDs in existing report citations without changing claims or collected evidence. |
| presentiX | Fit a complete slide composition inside margins with uniform scaling and preserved image proportions. |
| sketchiX | Space diagram nodes vertically without overlaps; mirror control-point artwork in the sketch and shape sub-editors. |
| mindiX | Fill missing topic owners from the nearest assigned ancestor without replacing explicit owners. |
| projectiX | Add a zero-day finish milestone linked to terminal leaf tasks through finish-to-start constraints. |
| vidiX | Resize the full composition to a new canvas with centered letterboxing and proportional layer geometry. |

Slide fitting rejects rotated objects and unreadably small text. Video resizing
requires unlocked layers and rejects invalid output dimensions or native limits.
Workflow pacing is idempotent for already paced outputs. The finish milestone
requires terminal leaf tasks and refuses to replace an existing generated milestone.
Architecture defaults use the direct component definition; subgroup ancestry is
not treated as parameter inheritance. Artwork mirroring moves text anchors but
keeps text readable. Existing native validators enforce all collection/size limits.

### Reusable variants and structural copies

Every app now has a native variant/reuse action under **Workspace → Tool actions**.
The source document remains unchanged until Apply. Copied structures receive new
IDs, while supported internal references target the copied objects. Applying uses
the same native validator, stale-document protection and recovery pipeline.

| App | Reuse capability |
| --- | --- |
| architex | Duplicate the instance graph with fresh instance/connection IDs while reusing metamodel definitions and local port IDs. |
| graphiX | Create a side-by-side SVG artwork variant with remapped internal IDs and gradient/mask links. |
| textiX | Duplicate a top-level heading section, preserving plain text and remapping copied internal anchors. |
| sheetiX | Transpose a rectangular selection while copying styles and shifting formula references. |
| codeiX | Copy the complete text-file tree into a new relative variant folder. |
| appiX | Duplicate a no-code screen with copied components, parent links and component-bound workflows. |
| automatextiX | Copy non-trigger workflow steps as an inactive branch that requires explicit trigger connection. |
| reportiX | Build a follow-up research checklist from the question, selected sources and existing limitations. |
| presentiX | Duplicate an editable slide with new slide/object IDs, including images and notes. |
| sketchiX | Duplicate nodes/connectors with internal endpoint remapping; copy editable artwork in both sub-editors. |
| mindiX | Duplicate a topic branch with internal relationships and recalculate the full map layout. |
| projectiX | Duplicate a task/phase subtree with internal dependency remapping and preserved outside constraints. |
| vidiX | Repeat an entire timeline, preserving media references, clip-local frames, trim and opacity envelopes. |

Where a source ID field is empty, the action uses the first heading, initial app
screen, first mind-map branch, or first project phase/task. Enter a stable ID for
a different app screen, topic or phase; document sections use exact heading text.
Slides use one-based slide numbers. Model limits still apply; oversized copies
are rejected before application.

Copied app screens intentionally share existing state bindings. Component-bound
flows are copied; app-global load flows are not. Static navigation back to the
source screen targets its copy, while computed navigation expressions remain
unchanged. Copied workflow branches do not inherit the manual trigger or its
connections: running the original workflow skips disconnected copied steps until
you connect them. This does not create a second trigger or execute any tools.

Mind-map branch copies retain only relationships whose endpoints are both within
the copied branch; outside cross-links remain on original topics. Project subtree
copies preserve outside predecessor constraints and remap inside ones. These are
schedule variants in the same project, not resource-feasibility or baseline claims.

SVG variant creation extends the viewBox horizontally and keeps original objects
and references intact. Both versions retain clipping to their original artboard
region, so expanding the viewBox does not reveal previously off-artboard artwork. Embedded media is reused/copied as native data, with no new
network requests. Code variants preserve file contents and relative structure;
absolute imports and build configuration are not rewritten. Choose an unused
folder, then review file paths before using the variant in a runtime.

Report follow-up checklists update their own marked section in the existing brief;
collected sources, report claims and citations are unchanged. The 3,000-character
brief limit is enforced without truncation. No research or provider call runs.

### Additional native editing actions

Open **Workspace → Tool actions** to preview these operations before applying.
Native validation, stale-document checks and recovery points still apply.

| App | Added operation |
| --- | --- |
| architex | Fill empty metamodel port descriptions |
| graphiX | Round vector stroke caps and joins |
| textiX | Keep headings with following text when printing |
| sheetiX | Align numeric/text literals without changing formulas |
| codeiX | Normalize CRLF source line endings to LF |
| appiX | Expand camel-case/underscore button captions |
| automatextiX | Name unnamed workflow steps without executing them |
| reportiX | Select collected evidence with valid web URLs |
| presentiX | Emphasize matching slide titles |
| sketchiX | Apply consistent diagram label font sizes |
| mindiX | Expand all collapsed topic branches |
| projectiX | Trim resource-assignment spacing |
| vidiX | Fit timeline duration to the last layer ending |

The sketchiX artwork editors also offer text recoloring. These operations
preserve native documents and are available to the tool-review AI prompt.

Verify with `node shared-suite/extensions-browser-test.cjs` (defaults to a suite
server at port 8013; set `BASE_URL` to use another address).

Tool actions support **Find editing actions** and **Clear action search**. Search
matches every entered word against action titles and descriptions, reports the
visible count, and preserves the document and action input values.

### Reuse editing settings across documents

Open **Workspace → Tool actions → Saved editing presets**. Choose an existing
action, enter a name and its setting, and select **Save preset**. Presets keep
parameters, not a copy of the document. **Preview preset** uses the current
document and the usual native validation/recovery flow; changes apply only after
**Apply reviewed changes**.

Use **Edit preset** to update it or **New preset** to create another. **Export
presets** follows the shared computer/virtual-disk destination. **Import and merge
presets** accepts only the same app's presets, merges matching IDs, and preserves
unrelated entries. Invalid imports leave saved presets and documents unchanged.
Unknown actions, duplicate IDs, invalid numeric/color inputs and cross-app files
are rejected. Settings persist in this browser/origin under
`suite-action-presets-v1:<app>`; export a copy before clearing browser data.

### Ordered editing sequences

In **Workspace → Tool actions → Saved editing presets**, check **Include in sequence** for each desired preset. Use **Move up** and **Move down** to set the execution order, then **Preview selected sequence**. Each selected action receives the previous step's validated document. A failing step stops preparation and reports its name; the editor stays unchanged. Review the combined difference and choose **Apply reviewed changes** to apply once with a recovery point. A document changed during preparation requires a fresh preview.

Selection and order persist with presets and travel in their JSON export. Imported older presets start unselected. These sequences transform the current document; they do not execute app workflows, scripts, or deployment commands.

### Reusable named editing workflows

Open **Workspace → Tool actions**. Save and select presets, order their steps, then open **Reusable editing workflows** and save a workflow name. A workflow stores an independent copy of those settings; deleting or editing source presets does not affect it. **Replace steps with current selection** explicitly updates an existing workflow.

**Preview workflow** validates every step against the preceding result, reports changed fields (including no-op steps), then stages a single combined review. A failed later step leaves the live document unchanged; an active operation or a document changed during preparation blocks application. Applying uses the native shared review and automatic recovery point. These are document-editing recipes, not command-line or automation-engine workflows; preview never executes scripts or calls AI providers.

Export/import merges app-specific libraries by workflow ID. Cross-app and unavailable-action imports fail atomically. Libraries persist separately from documents and presets in this browser; clearing browser data removes them. Up to 50 workflows with 100 steps each are supported. Shared export destination and import controls allow computer or virtual disk.

All 14 apps and both additional sketchiX editors include the controls. photiX offers brightness, contrast, saturation, grayscale, inversion, blur and pixelation presets scoped to the current image selection or whole image. Native format and scope limits still apply.

### Project ZIP in every editor

Click **Project ZIP** in the app header, or **Workspace → Recovery → Import / export project ZIP**. Export to Computer or Virtual disk. Import a package for this same app, review its native-document changes, and choose **Apply reviewed changes**. A recovery point preserves the previous project. No content is applied merely by choosing a file.

All 14 apps and both additional sketchiX editors support the same versioned package contract. Embedded media, architecture models/rules, source files, spreadsheets, research libraries and other native project fields travel with their document. Separate browser/relay configuration, chats, virtual-disk files and server workspace files do not. Existing native export formats remain available. See [project ZIP format](PROJECT-ZIP.md) for scope, limits and validation.

### Pinned and recent commands

Open **Workspace → Commands** or press **Ctrl/Cmd+K** in any editor. Search with multiple words in any order (for example, `project import`), then use **Pin** beside frequent commands. Choose **Pinned commands** or **Recent commands** to narrow the list. All commands prioritizes pinned items and recent invocations. Disabled/hidden native actions are omitted, including from pinned/recent views, until available again.

Up/Down from the query focuses commands; Up/Down, Home and End navigate the result list. Enter opens the focused action, while Tab reaches its pin toggle. Pins and up to 12 recent command IDs persist separately for each editor in this browser; up to 32 commands can be pinned. **Clear recent commands** preserves pins and documents. Recents record invocation, not proof that an asynchronous native operation completed.

Each app’s native editing catalog is also searchable: **Configure edit: …** opens its settings, filters the editing panel and focuses its controls without applying a transformation. Direct commands open project ZIP import/export, shared-disk ZIP backup/restore, or the coding-agent window. They do not run an agent, apply an import or perform a backup automatically. Existing validation, reviews, run choices and recovery remain authoritative. No document content or search text is stored in command preferences.

Editing workflows can be renamed and duplicated in **Workspace → Tools → Reusable editing workflows**. Each saved step shows its action and settings, with Move up, Move down and Remove step controls. The last step cannot be removed. Changes save to this app's local workflow library without changing the document or source presets; preview the workflow to review its combined result before applying it. Exported workflow libraries retain the edited order and names.
