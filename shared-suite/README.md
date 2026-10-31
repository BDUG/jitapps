# Shared desktop and virtual disk

The suite desktop lives at `/` and lists all 18 applications. Each card opens an app; the small **Desktop** button in every app returns here. SVG icons are shared by the desktop cards, app headers and browser tabs.

## Save and open files

Use any normal Open, Import, Insert image or Attach files control to choose **Local disk** or **Virtual disk**. This includes dynamically created controls such as component icons and chat attachments. Folder readers preserve relative paths from either source. Canceling the source chooser leaves the content unchanged. Local workspace linking in codeiX still uses a real filesystem directory so write-back works.

1. In any app, choose **Destination: Virtual disk** beside the app’s export controls (inside Architex’s export dialog).
2. Use that app's normal export or backup button and choose its format as usual.
3. In the save dialog, choose a folder and file name, then **Save to virtual disk**. A replacement requires confirmation. Canceling leaves the disk unchanged.
4. Open another app and click **Virtual disk**. Choose the appropriate **Import into** reader, select a compatible file, and click **Import selected**. The app's existing validation, size limits, import warnings and Undo behavior still apply.
5. Switch to **Destination: Computer** to download normally. This setting is remembered separately for each app.

For complete editable backups, use each app's JSON/project/research backup format. Visual exports preserve only the information that format supports. Saving a file to the disk does not make it compatible with every app: for example, SVG can move from sketchiX to graphiX, PPTX between sketchiX and presentiX, and XLSX can move into sheetiX. App-specific JSON formats remain app-specific.

Architex has separate metamodel and instance import scopes, plus validation-rule and Sphinx RST readers. Select the intended model scope before importing. Its native compatibility checks still apply. Source files and folder trees can be imported by codeiX. The text, diagram and presentation editors also offer their image insertion readers.


## Manage the disk

- **New folder** creates folders or nested relative paths. Use folder names or the location field to navigate, and **Up** to return to a parent.
- **Upload files** copies files from your computer into the current folder. **Upload folder** preserves the entire selected directory tree.
- Folder readers such as codeiX and Architex's Sphinx RST importer offer **Import this folder**, including nested files with relative paths.
- **Download selected** downloads a single file directly; multiple files or folders are packaged as a ZIP with their paths preserved.
- **Delete selected** asks before deleting files or entire folder trees. Disk deletions have no Undo; download a backup first when needed.

## Storage behavior

The virtual disk is **IndexedDB storage in this browser profile**, shared by apps served from the **same origin** (protocol, host and port). Use the same server address for every app. Another port, `localhost` versus an IP address, another browser/profile, or another computer has a separate disk. It does not sync to the relay, server filesystem or a cloud service, and does not require AI configuration.

Files persist across reloads and tabs, including binary data such as XLSX, PPTX, PNG and ZIP. Clearing this site's browser data deletes the disk. Private browsing and browser quota/eviction policies can limit persistence. Keep downloaded backups of important work. Individual files are limited to **50 MiB**; each app may impose a smaller import limit. Storage failures are shown in the disk dialog. Concurrent file creations and stale overwrites are rejected rather than silently replacing newer data.

Serving through `python3 server/server.py` or another static web server is recommended. Direct `file://` opening does not reliably provide shared browser storage.

## Integration

`apps.js` is the common app registry and declares native file-input readers. `disk.js` exposes `SuiteDisk` (`write`, `get`, `all`, `list`, `mkdir`, `remove`, `asFile`) and stores Blobs without text conversion. `ui.js` provides navigation, disk management and import delivery to registered and dynamically discovered file-input readers. App download helpers call `SuiteDiskUI.download(anchor)` with an object-URL anchor; the computer destination keeps the existing download behavior, while the disk destination opens a save dialog. No browser globals or native download/file-picker prototypes are replaced.

To add an app, register its identity and input IDs, add an SVG icon, load the shared stylesheet/scripts in its entry point, and route its download helper through `SuiteDiskUI.download`. Provider configuration exports deliberately stay in the relay's own UI and are not copied automatically to this disk.

Run `node shared-suite/browser-test.cjs` with the suite on port 8000. It tests desktop cards/icons, all 13 apps' native imports and disk exports, binary preservation, cross-app SVG transfer, nested source imports, path validation and concurrent-write protection.

## Workflow file access

`automatextiX` can list, read and write this disk with native workflow steps. Paths and contents accept incoming-item templates, enabling file → AI/command/web → file pipelines. These are browser disk operations, independent of the optional OS command runner. File replacement is disabled by default; revision-checked write-back is available. See the [workflow file guide](../automatextiX/README.md#use-files-from-the-shared-workspace) for encodings, the 300 KB workflow file limit and completed-write behavior. `SuiteDisk.write` also accepts an optional `AbortSignal` to abort an uncommitted write.

vidiX accepts project JSON bundles and video/GIF/SVG/image media through separate import targets. Its GIF, animated SVG, PNG and browser-supported video exports can also be saved to this disk; other apps must support the exported format to consume it.

## Workspace productivity tools

Every editor now has **Workspace** and the Ctrl/Cmd+K palette, with reviewed find/replace, named recovery points, portable backups, app-specific AI workflows, document insights, inspection reports and agent handoff ZIPs. See the [complete workspace guide](WORKSPACE.md). Recovery storage is separate from the shared virtual disk; portable backups and handoffs can be exported to either disk.

## Whole virtual-disk ZIP backup and restore

Open **Virtual disk → Disk ZIP backup · all folders** from the desktop or any app. **Export disk ZIP** downloads every file and folder to your computer, regardless of the current folder or selection. The versioned backup preserves binary bytes, empty folders, MIME types, timestamps and app ownership. It contains `files/` plus `.tlal-virtual-disk.json` metadata.

Choose **Import disk ZIP** to load a local archive, or select one existing ZIP on the disk and choose **Import selected ZIP**. Import validates the archive and shows counts, size and matching existing paths without writing anything. Choose a policy:

- **Keep existing files (merge)** is the default. Existing same-path files survive; new files/folders are added.
- **Overwrite matching files (merge)** replaces same-path files and keeps unrelated entries.
- **Replace entire disk** discards entries not in the archive. An explicit confirmation is required before this destructive policy runs. Export a backup first if those entries matter.

Click **Apply disk restore** to commit, or **Discard restore**. A single IndexedDB transaction applies the whole restore; validation conflicts, quota errors and storage failures roll it back. If the disk changed since preview, import again. File/folder type conflicts and files occupying parent-folder paths are rejected during a merge; rename conflicts or explicitly choose replacement. New file revisions prevent stale readers from silently writing over restored files.

Conventional ZIPs, including folder ZIPs created by **Download selected**, are also supported. Their directory tree and bytes are preserved; common MIME types are inferred from extensions, and app ownership is unknown. The root filename `.tlal-virtual-disk.json` is reserved for versioned backup metadata; a same-named disk file is preserved safely beneath `files/` in a full backup.

Limits: 50 MiB per file, 200 MiB per compressed archive and total expanded content, and 10,000 restored entries. Larger disks can be transferred in smaller selections. UTF-8 paths and single-disk ZIPs are supported; multi-volume/ZIP64 and encrypted archives are not. Raw paths, normalized aliases, duplicates, sizes and CRCs are checked; members are read as data, never extracted to the OS or executed. Browser storage quota still applies.

A disk ZIP contains **all virtual-disk files**, including configuration exports you explicitly stored there. It does not separately collect editor autosaves, relay configuration/keys, chat histories, app preferences or server workspace files from their own storage. Use each app’s **Project ZIP** for its current unsaved/native project, and separate configuration exports for provider settings. Backups are portable between browser profiles and the Tauri WebView.

Verification: `node shared-suite/disk-zip-test.cjs` and `BASE_URL=http://127.0.0.1:8000 node shared-suite/disk-zip-browser-test.cjs`. The browser test exercises merge/overwrite/replace, cancelled confirmation, binary and empty-folder restoration, stale previews, file/folder conflicts, simulated quota rollback, invalid archives, ZIPs already on disk and cross-app access.

colabriX provides a local whiteboard with workshop controls and native project recovery.

## Installed project apps

`installed-apps.js` keeps custom codeiX/appiX app packages in a separate IndexedDB store with revision-checked writes. `project-app-ui.js` provides installation and metadata/logo editing. The desktop merges these tiles into the immutable standard app registry for display, without modifying `SuiteApps`. `app.html` / `installed-runner.js` launch a saved package in an opaque-origin sandbox. No generated script is inserted into the desktop's own document. Removing a tile deletes its package but never removes a standard app or source editor project.

Run `node shared-suite/installed-apps-browser-test.cjs` to verify installation, static asset bundling, sandboxing, updates, source reopening, logo edits, removal and standard-app protection.

## Share between PCs

Use **Share between PCs** for bidirectional magic-wormhole file queues. colabriX **Work together** uses the same transport with one master and one participant. See [setup and limits](WORMHOLE.md).


## Search and review across apps

Document apps expose **Workspace → Find & replace**. Use **Whole words** for Unicode-aware literal matching, **Match case**, and **Field path contains** to scope results and replacement previews to particular native fields (for example `notes`, `nodes` or `html`). Whole-word matching treats letters, numbers, combining marks and underscore as word characters; `task` does not match `task_name`. This is literal search, not executable regular expressions.

Results page through all matches in groups of 50 rather than stopping at the first 100. **Export search report** refreshes the search against the current document and exports every match with its field path, position and excerpt, plus query/options and app identity. The normal export destination applies. Reports contain document excerpts; they are diagnostics, not editable document backups. Changing search options clears old results until you search again.

**Preview replacement** applies the same word/case/field scope. It preserves the existing native validation, reviewed diff, stale-document checks and recovery point before applying. Normal text mode keeps structured IDs, asset data and file paths outside bulk replacement and changes markup text nodes rather than link attributes. **Include raw source and formulas** deliberately includes raw markup/code/formulas and can change their identifiers; review carefully.

shelliX has equivalent case/whole-word filters in **Commands & results**, plus **Export filtered history**. Its JSON export includes only currently loaded, displayed command rows that match the filters, including any loaded output pages. Clearing the screen affects this view, not the retained server audit. It never reruns a command; use Download session for the complete saved session audit.


## Read-only document preflight

In each document app, open **Workspace → Inspect & share → Document preflight**. **Run preflight** performs native structural validation on a copy, then advisory tool-specific checks. Filter by errors, warnings or information, download a JSON report, or choose **Draft fixes in AI chat**. The draft is not sent automatically and document changes retain normal review. Running preflight never edits the document, executes code/workflows or contacts a provider. Reports are refreshed before export/drafting, with a stale-document check.

Checks cover architecture policy-port descriptions; SVG accessible descriptions; HTML image alt attributes and internal anchors; formula error tokens; TODO/FIXME markers and empty code files; isolated workflow steps; report source selection; empty slides, speaker notes and simple canvas bounds; isolated diagram nodes; empty mind-map topics; unassigned project tasks; missing video assets and GIF frame guidance; empty image captions/design pages; and unresolved collaboration comments. Informational reminders point to native architecture validation, formula calculation, workflow tests, preview execution and evidence review.

These checks are deliberately advisory and incomplete: they do not evaluate formulas, execute JavaScript, certify accessibility, verify facts, calculate rotated geometry, guarantee export fidelity or prove that an application is correct. Empty alt attributes can intentionally mark decorative images. A report with no findings is not certification. Existing exports are not blocked automatically.

shelliX provides **Check shell syntax**, which invokes allowed `sh -n -c` with the current text and working directory. The entered script is parsed without execution and remains in the input. Output is retained in the normal server session audit. This requires the command runtime and an allowlisted `sh`; syntax success does not verify behavior, dependencies or side effects of a later execution.


## Reusable document templates

Open **Workspace → Templates** in any document app. Give the current native document a name, description and comma-separated tags, then **Save current as new template**. Templates persist in a separate browser IndexedDB library for this origin and app; recovery retention never removes them. Search metadata, edit a selected template's metadata, export an individual template, import a compatible template, or delete a saved template without changing the open document.

**Preview template** uses native schema validation and the ordinary document-change review. Applying replaces the current document, preserving a recovery point first; it is not an object merge. Native IDs, markup, formulas, code, project settings and embedded media are retained through the app's own document schema. Validation, stale-document checks, native import safety and workspace-disconnect behavior still apply. Previewing does not run app code, workflows, commands or AI.

Portable files use `suite-document-template/v1` with an exact app identity, metadata and `document`. Import creates a separate saved copy and validates it for this app; it never applies automatically. Use local or virtual disk through the normal file controls and export destination. Template bodies may contain project data, media or scripts; inspect before sharing. Browser storage clearing removes this local library; keep exported copies. Storage is bounded by browser quota rather than a rolling retention policy.

shelliX offers **Reusable command snippets**. Save current shell text plus working directory and timeout, then load it into the input in a later session. Loading is text/configuration only: use Check shell syntax or Run command explicitly after inspection. Snippets can be imported/exported as app-scoped template files and searched or deleted. Command history and server session audits remain separate.


## Selective change review

All document apps' shared workspace previews now let you select individual changed fields. **Select all/none**, checkboxes and 50-field pages cover every change, including large templates, imports and bulk edits. All fields start selected to preserve existing behavior. Export selected changes with exact path segments, before/after values and presence flags; this diagnostic report is not an automatically executable patch.

**Apply reviewed changes** builds the selected result from the captured original, validates it using the native app schema, checks the document has not changed, and saves the ordinary recovery point before restoration. Dependent array/graph changes may need to be selected together. Invalid partial selections are rejected. If native normalization adjusts additional fields, a new preview requires another review instead of silently applying those adjustments. Field paths containing dots are handled through exact path segments; no string-path evaluation is used. Selecting only a document's `html`/`svg`/source field still accepts that whole field, not individual words inside it.

The selection controls are disabled during application; keyboard focus and review scroll are retained when toggling fields. Native import safety, runtime/workspace disconnects and existing execution permissions remain unchanged. This does not add selective approval to the separate AI proposal or coding-agent takeover dialogs.

shelliX command results now have **Use command**. It fills the original executable, arguments or `sh -c` text, working directory and timeout for inspection. Nothing runs automatically. Commands whose executable is no longer allowed cannot be reused through this control; active operations must finish first.


## Portable offline review reports

In document apps, choose **Workspace → Inspect & share → Export offline review HTML**. The self-contained report combines native inventory, metrics and advisory preflight findings. Search the inventory, page through every item, filter findings by severity, download report JSON or print all items matching the current filters. It uses no external libraries, fonts, media or network requests; the included viewer script implements only these review controls.

By default the report contains inventory/diagnostics, not the complete project. **Include native backup** embeds the full workspace envelope, including code and media when present. **Extract workspace backup** downloads the original envelope for review/import in the corresponding app. The backup stays JSON data; it is never executed in the report. Reports can contain project content, file names, references or command output, so inspect before sharing. Normal local/virtual export destinations apply.

The report is a structural review artifact, not a pixel-perfect rendering, editable project, accessibility certification or proof of correctness. Native markup/code is displayed as text. It escapes embedded data and uses a restrictive CSP that blocks external connections and unapproved scripts. Open the downloaded HTML in a browser that permits local HTML documents, or serve the file as static content if local-file policy blocks it. Browser print/export behavior varies; the report's before/after-print handlers include all inventory matches rather than only the visible 100-item page.

shelliX offers **Export offline review HTML** for the currently loaded filtered history. **Include session audit** optionally embeds its complete current public session JSON, extractable separately. This preserves the distinction between displayed rows and a saved audit and never reruns a command. The report does not load missing log pages or establish that failed work was later fixed.


## Cross-app Content hub

The hub also manages **collections** across every app and the desktop:

- Tick item checkboxes to build a reusable selection. Selections survive filter, sort and page changes within the current page session; the count explicitly includes hidden selected items. **Select matching items** selects every search/source match, including other pages. **Clear selection** resets it. Selection is separate from the single item being inspected and does not change project content.
- Sort by newest/oldest publication date, name or source app. The list shows 20 items per page. Publication date is the original snapshot date, not the last metadata edit.
- **Export selected collection** exports all checked items across filters/pages. **Export filtered collection** continues to export every matching item regardless of checkboxes or the current page. Neither action silently truncates content.
- Choose **Integration options**, **Compare references** or **Plan improvements**, then **Draft AI from selected** to append a multi-source reference bundle to the current app's unsent chat draft. References retain source names, local content IDs and publication dates. Existing draft text is preserved. This action does not send a message, start a coding agent, execute source instructions or edit documents. The desktop can select/export collections; open an app to draft an AI request.
- AI bundles contain portable text and inventory, not native snapshots or image payloads. codeiX file exclusions are reapplied for each reference. Selected items are reread from storage before export/drafting; a missing item stops the action and asks for a refresh. Images can still be attached separately through the existing visual-preview action.


- Edit the selected published item's name and comma-separated tags with **Save name and tags**. Its local ID stays stable; the original app document is unchanged.
- Search with multiple words (all words must occur somewhere in the name, source app, tags or text). Matching is case-insensitive and normalizes Unicode width variants. Combine search with the source-app filter.
- **Export filtered collection** downloads every currently matching item, including optional native snapshots and visuals, as one `suite-content-collection/v1` JSON file. Clear both filters to back up the entire hub. The existing item export still exports just the selected item.
- **Import item or collection** accepts either format through the usual local/virtual-disk file controls. Collection imports validate every packet before saving and use a single storage transaction: a malformed item or storage failure leaves no partial collection. Imports add fresh copies with new local IDs; they do not overwrite existing items, apply projects, or start AI requests. Reimporting intentionally creates duplicates.

Collections may contain full source code, embedded media and project settings when native snapshots were included. Keep exported files with the same care as project backups. Collections are JSON exchanges, separate from project ZIP and virtual-disk ZIP backups. Native schemas are checked when preparing an integration in the destination app, rather than when archiving a collection.


**Content hub** is available on the desktop and in every app. It turns an explicitly published snapshot into shared, searchable content on this browser origin; it is separate from virtual-disk files, templates, automatic recovery and server workspaces.

1. Open an app and select **Content hub**. Name/tag the content, choose whether to include its native snapshot and an available visual preview, then **Publish current content**. The current document is not changed. shelliX publishes loaded, visible command results rather than its complete server audit.
2. Open the hub from another app or the desktop. Search portable text, names, tags and source-app labels. Inspect text, inventory, optional raster preview and read-only native JSON. Published items survive reloads while browser storage is retained.
3. Choose **Open in selected app** to open a destination tab with this item selected. The `hubItem` link is local to this browser origin and item ID; it does not contain the document and will not work elsewhere without importing the content file.
4. Choose a supported integration mode, then **Preview integration**. Native validation, selective change review, stale-document checks and recovery apply before any change. Native mode replaces with a same-app snapshot; reference/image modes append, except photiX's explicitly labelled image replacement. Unsupported native routes still support an unsent AI-reference draft.
5. **Draft integration in AI chat** adds untrusted reference text/inventory and provenance to a draft without sending. **Attach visual to AI draft** passes the raster preview to the app's existing attachment reader when supported, without sending. Imported reference instructions are not system policy and do not bypass schema, review or runtime permissions.

Supported direct reference targets:

| Target | Reference integration |
| --- | --- |
| textiX | Append an escaped text section with source metadata. |
| sheetiX | Add inventory worksheets; headers and values protect formula-like strings. |
| codeiX | Add a uniquely named Markdown reference file. |
| mindiX | Add a topic branch with reference notes. |
| presentiX | Add a reference slide. |
| sketchiX | Add a text node. |
| colabriX | Add board text beside existing content. |
| designiX | Add a reference page. |
| graphiX | Add a vector text annotation. |
| photiX | Append an editable caption operation. |

Flattened raster previews can be inserted as native image content in textiX, graphiX, presentiX, sketchiX, mindiX, designiX and colabriX, or opened as an image replacement in photiX. Native limits may reject large references/images; nothing is silently truncated. Other apps can use the source as an AI draft/reference or import a downloaded preview through their normal media reader.

Visual capture is available for graphiX, sketchiX, mindiX, designiX, colabriX, photiX and vidiX. It uses official SVG exports/renderers or current raster canvases. Previews are flattened PNGs capped at 1600 pixels on each axis; designiX uses its first page, vidiX its current preview frame without audio. Capture can be omitted when unavailable or unsafe and reports the reason. SVG scripts, foreign content, external resources and embedded CSS are omitted/rejected for safe capture; the scope note identifies CSS normalization. Preview fidelity is not guaranteed, while the optional native snapshot remains the editable representation.

Publishing is explicit and creates copies, not live synchronization, remote collaboration or updates in other apps. Source labels/IDs are provenance hints, not authenticated signatures. Deleting a published copy never edits its source or destination; existing imported content remains independent. Full native snapshots can include embedded media, code and settings: inspect before sharing. CodeiX AI-excluded file bodies remain in an explicitly included native backup, but are omitted from generated reference text; the hub's AI draft also omits their inventory rows and never sends the native document automatically.

### Exchange schema and JavaScript integration

**Download exchange schema** describes `suite-content-item/v1`: source app/name/time, native document or null, inventory, portable text, tags and optional embedded raster preview. Export/import creates portable content files using normal local/virtual disk controls. Imported copies get local IDs; original IDs are retained as provenance. Browser-origin storage is not a server API or an access-control boundary against other same-origin scripts.

Every app exposes:

```js
const items = await SuiteContentHub.list();
const content = await SuiteContentHub.read(items[0].id); // complete published snapshot
const proposal = await SuiteContentHub.prepare(items[0].id, 'reference');
await SuiteWorkspace.review(proposal, 'Integrate shared content'); // still needs Apply
```

`list()` returns metadata, `read(id)` returns the typed packet, `prepare(id, mode)` validates a candidate without mutating the document, `schema()` returns the exchange schema and `open()` opens the hub. Modes are `native`, `reference` and, when available, `image`; supported modes depend on source/target representations. `prepare` is unavailable on the desktop and shelliX, which do not have native document targets. Keep native limits, stale-state handling and user review in custom integrations; this API does not execute code or bypass approval. Cross-browser or programmatic clients can exchange JSON files using the downloadable schema instead of accessing browser IndexedDB directly.

## Quality baselines

In each document app, open **Workspace → Inspect & share → Document preflight → Quality baseline**. In shelliX, use **Quality baseline** in the Commands & results controls. This tool compares advisory reports without editing documents, running commands, starting AI or changing validation rules.

1. Name the baseline and **Capture current baseline**. Native apps run their existing structural/static preflight; shelliX summarizes failures in the loaded session audit.
2. Export the baseline JSON if you want to keep it after a reload. Baselines are held in this page's memory, not silently stored with the project. Import supports the suite's local/virtual-disk file controls and checks the exact app/editor type.
3. Edit the document normally, reopen the dialog and **Refresh comparison**. Findings appear as **New**, **Unchanged** or **No longer reported**. Filter these categories and browse 20 findings per page. Counts and exports include the full comparison.
4. **Export comparison** refreshes the current report before downloading it. **Draft comparison in AI chat** also refreshes first, then appends an unsent, explanation-first request preserving the existing chat draft. It does not apply fixes or execute commands. codeiX blocks this AI draft while current files are AI-excluded; use local report review/export instead.

Comparisons match severity, code, path and message, preserving duplicate occurrences. A severity/message/path change can appear as one removed and one new finding; reordered indexed objects can also move findings. No longer reported does not prove fixed, and native preflight does not establish semantic correctness, accessibility certification or runtime behavior. Compare the intended project, scope and baseline label. Native backup content, source code and media are not included in baseline packets; finding messages may contain paths or document text.

shelliX compares the loaded session's audit, independently of screen/history filters. Earlier failed results remain recorded after successful retries, so the tool is primarily useful for identifying new failures since a baseline. Changing sessions or loading different history can remove findings without repairing anything. The report carries that limitation.

JavaScript hosts can use `SuiteQualityBaseline.pack(label, report)`, `unpack(packet, app)` and `compare(baseline, currentReport)`. Native document apps additionally expose read-only `await SuiteWorkspace.preflight()`. Packets use `suite-quality-baseline/v1` and comparisons use `suite-quality-comparison/v1`; imports validate report fields and recompute counts.

## Additional native editing actions

Open **Workspace → Tool actions** and search for the action below. Each prepares a candidate using native validation; inspect the diff and choose **Apply reviewed changes** to update the document with a recovery point. No action below starts AI, previews application JavaScript, executes automation steps or runs Git. Saved action presets and editing workflows can reuse these operations.

| App | Added operation |
| --- | --- |
| architeX | Set component theme color, preserving categories and relationships. |
| graphiX | Keep geometric stroke widths constant when scaled. |
| textiX | Add column scopes to first-row table headers; preserve explicit row scopes. Safe table `scope` attributes now survive native editing/import. |
| sheetiX | Compact empty unformatted cell records, retaining formatted blanks and formulas. |
| codeiX | Add portable `.gitattributes`; an existing file is never replaced. |
| appiX | Add editable headings to visual screens without one. |
| automatextiX | Snap step positions to a chosen grid without changing flow logic. |
| reportiX | Append actual collected source IDs/titles/URLs to the brief, without changing evidence or report content. Oversized indexes are rejected rather than truncated. |
| presentiX | Set slide backgrounds across the deck, preserving objects, notes and animation. |
| sketchiX | Set connection weights while retaining GSN/SysML metadata. Sketch/shape editors can snap control points to a grid. |
| mindiX | Assign an owner only to unowned non-root topics. |
| projectiX | Group root tasks under a new summary phase without changing existing task IDs or dependencies. |
| vidiX | Left-align unlocked layers while preserving horizontal travel, timing and frames. Native coordinate limits still apply. |
| photiX | Soften existing tonal/blur/pixel adjustment strengths; preserve source image, regions, ordering, captions and fills. Pixelation blends toward its minimum block size. |
| designiX | Set line height across unlocked text layers while preserving fonts and geometry. |
| colabriX | Snap unlocked, ungrouped, unframed items to a grid without moving frames. |

The newer image/design/board action registries now compose shared operations with their existing app-specific actions. This retains existing actions and makes the additional operations visible to the UI, presets and workflows.

shelliX has **Check snippet syntax** on each reusable snippet. This explicitly invokes the permitted `sh -n` parser using the snippet's saved directory/timeout, preserves the current command draft, and does not execute the snippet body. It requires an enabled sh executable and an idle runtime. A syntax pass is not evidence of functional correctness.

## Workspace notes and tasks

Every editor, both sketch variants and shelliX offer **Workspace → Notes & tasks**. A notebook has a title, freeform notes and editable checklist tasks. Save persists it per app on this browser origin; it is shared across that app's projects, not embedded in native documents. Export JSON for portable reuse or Markdown for a readable checklist. Imports use the existing local/virtual disk picker and require preview plus explicit Merge or Replace. Merge preserves the receiving app/title, combines notes, deduplicates identical task IDs and rejects conflicting task IDs. Replace takes imported content and assigns the receiving app.

Draft AI request appends notes and unfinished tasks to the existing composer without sending it. Checked tasks are omitted and do not establish verification. codeiX blocks drafting when the project has AI exclusions. Notes are user-provided reference data and can contain sensitive information; review the draft before sending. No file contents, credentials or native document snapshots are copied into exports automatically.

Save detects a changed stored notebook before replacing it. Export a conflicting draft, then use Reload saved notes to deliberately discard it and load the saved copy. This is a browser-storage check, not transactional multi-user collaboration. Browser data clearing removes saved notebooks; export backups. Unsaved drafts survive closing/reopening the notes window in the same page, but not page reload.


## Tasks across all apps

The **Tasks** button in every app and on the desktop opens a suite-wide dashboard (Alt+Shift+T when another dialog is not active). It reads the existing saved app notebooks on this browser origin. Search task text, notebook titles and notes; filter by app or unfinished/completed status. Counts cover all matches; large lists page in batches of 100. Select filtered tasks across app filters, clear the selection, or export the filtered work list as Markdown.

Completion checkboxes save back to the original notebook. They do not edit native app documents or run tasks. A changed saved notebook is rejected before a dashboard write; cross-window storage events refresh the dashboard. This is the same browser-storage conflict check used by notebook editing, not transactional multiplayer collaboration. Corrupt/unreadable notebooks are reported separately so other app tasks remain available.

**Current app notes** opens the existing notebook editor, including a direct fallback in mockiX. Unsaved notebook drafts remain in that editor and are not silently merged with task dashboard changes. If the stored notebook changed, export the draft or deliberately reload the saved copy.

**Draft AI brief** appends selected tasks, their source apps and notebook titles to the current app's composer. It preserves the existing draft and never sends a request or starts a command. codeiX uses its coding-agent goal field; shelliX uses its goal composer; other apps use the shared AI chat. Briefs are capped at 30,000 characters. Review sensitive task text before sending it to your configured provider. Task completion flags are notes, not verification evidence.

Notebooks, dashboard status and selection are separate from native document content. Only saved notes appear; changing or clearing browser storage affects availability. Export important notebooks or work lists for backup.

## Review current work

Every app has a **Review** button for a read-only, app-specific review of its current snapshot. Existing preflight findings are retained, and additional checks cover:

| App | Additional review focus |
| --- | --- |
| architeX | Repeated component labels and missing purpose descriptions |
| graphiX | Network-dependent image references in SVG |
| textiX | Heading-level gaps and generic link labels |
| appiX | Heading/link clarity and buttons without accessible names |
| sheetiX | Repeated sheet names |
| codeiX | Missing local script, stylesheet and image files referenced by HTML |
| automatextiX | Steps unreachable from a recorded manual trigger |
| reportiX | Repeated source URLs and missing retained excerpts |
| presentiX | Repeated slide titles and small text |
| sketchiX | Unlabeled diagram connections |
| mindiX | Repeated sibling topic labels |
| projectiX | Repeated sibling task names |
| vidiX | Clips extending beyond the recorded project duration |
| photiX | Very small caption regions |
| designiX | Repeated page names and small text |
| colabriX | Empty note/text items |
| mockiX | Unreachable prototype screens, unlabeled controls, small text and decisions with too few branches |
| shelliX | Existing loaded-session audit findings, including historical failed results and checks |

These checks are advisory heuristics. A repeated label, unlinked screen or unlabeled connection may be intentional. Text sizes use canvas pixels, not a guarantee about final viewing conditions. HTML asset checks only inspect static local references; they do not build or execute a project, resolve dynamic assets, or validate external services. A clean review does not establish correctness, accessibility compliance or successful command execution. Shell history retains earlier failures even after retries; it is not a current test verdict.

Filter findings by severity or search their message, code and location. Lists page in batches of 100; selection can span filters and pages. **Export review JSON** saves the captured report without embedding the source document. Reports can still contain source labels and paths; inspect them before sharing.

**Add selected as notebook tasks** appends chosen findings to the app's existing notebook. It preserves existing notes, tasks and completion flags. Re-adding the same finding for the same named document does not duplicate or reopen its existing task. Findings are not automatically fixed or marked complete. App notebooks remain shared across the app's projects; give projects descriptive names to make review tasks distinguishable.

If the current content changed after capture, refresh the review before adding tasks. An invalid saved notebook is left untouched rather than replaced. An already open notebook's unsaved draft is not modified; its normal conflict check applies if review tasks changed the saved notebook. New tasks appear in **Tasks** and can later be included in an explicitly prepared AI draft. Reviewing, exporting and adding tasks send no AI requests and run no commands.

## textiX and sheetiX catalogues

Both office apps expose **Templates & layouts** inside their respective Templates panel. Each includes eight native templates and three content-preserving layouts, with reviewed replace/extend actions and editable browser-local copies. Saved template entries can now update their native contents from the current editor, not just metadata. Saved variants can also extend the current document/workbook. Layout definitions have a separate app-scoped library, editable properties and portable layout JSON; they do not masquerade as replacement documents. See the [textiX catalogue guide](../textiX/README.md#document-templates-and-layout-catalogue) and [sheetiX catalogue guide](../sheetiX/README.md#workbook-templates-and-layout-catalogue).


Office catalogue navigation now separates built-in documents, layouts and saved variants into accessible tabs, with compact template cards, result counts and explicit empty states. Saved textiX/sheetiX templates can be duplicated without changing the open document. The recent shared catalogue, review, task and prompt-workflow source modules and regression tests have been reformatted for readability; no runtime formatting dependency is added.

Work-review exports now have explicit **All findings**, **Filtered findings** and **Selected findings** scopes, in JSON or Markdown. Scoped JSON retains the capture timestamp, includes the original finding count, recomputes counts for the exported subset and labels the scope. Filtered/selected exports also state that omitted findings are not represented; compare only equivalent review scopes. Markdown escapes source text as literal content. Empty selections cannot be exported. Exports do not change the captured review, notebook tasks or current document. The review count distinguishes matching findings, currently displayed findings and the selection across filters.

## Follow up on review findings

In **Review**, select findings and choose a follow-up goal:

- **Investigate** prepares a read-only assessment of actionable, intentional and unsupported findings.
- **Improve** asks for focused native improvements, preserving unrelated content and using the app's normal review and permission flow.
- **Verify** prepares a verification plan and evidence assessment without modifying content or executing commands.

**Draft in AI chat** appends the selected findings, capture timestamp, limitations and source count to the current app's existing composer. The composer opens for review; nothing is sent automatically. **Export AI brief** downloads the same standalone Markdown brief without changing the composer. Both actions require an unchanged source snapshot. Selection is preserved across filters, so check the selection count before drafting. Only the selected finding records are copied; the native document is not embedded.

All 18 apps use their existing AI interface, including the codeiX agent and shelliX agent mode. Read-only/busy inputs and composer size limits reject drafting without replacing existing text. Briefs are limited to 30,000 characters. codeiX projects with AI-excluded files block both AI-brief actions; local review JSON/Markdown exports remain available. Review any finding text for sensitive information before sending it to a provider. Advisory findings are untrusted reference data, not commands or proof that a defect exists.

## Capture and edit tasks from any app

The shared **Tasks** dashboard now includes **Add task**. Choose any of the 18 apps, enter a task and save it directly to that app's browser notebook. The current app or app filter is selected initially; on the desktop you can choose any app. If no notebook exists, saving creates an empty app notebook with the new task. New tasks start unfinished. Search/status filters still apply, so a saved task may be outside the current view.

Each task also has **Edit task**. The editor preserves its ID, completion status, notebook title, notes and other tasks. Existing tasks stay in their original app; editing does not move them. Cancel and Escape discard editor changes. Task text is limited to 5,000 characters.

Saving checks that the target notebook still matches the version captured when the editor opened (or when a new-task target was chosen). A changed, corrupt or wrong-app notebook is left untouched; rejected saves keep the text draft so it can be copied before reopening. This check is not a transactional multi-user lock. Open notebook editors retain their unsaved drafts and use their existing conflict checks when saving. No native document, command, AI request or project file is changed by dashboard task editing. Export notebooks to back up browser-local work.

## Portable worklists and cross-app handoffs

In **Tasks**, select tasks across filters and choose **Export selected JSON**. The `suite-worklist/v1` file includes each task's source app, notebook title, ID, text and completion flag. It excludes notebook notes and native documents. Existing filtered Markdown export remains available. Review task text and titles before sharing.

**Import worklist** accepts a worklist from the local or suite virtual-disk picker. Choose any destination app and review the source-task preview and added/skipped counts before choosing **Import reviewed tasks**. Only the first 20 source tasks are displayed; counts cover the whole file. Import creates a notebook if absent, otherwise preserves its title, notes, task IDs and completion flags. New tasks get unique destination IDs and retain their imported completion flags. Task text is compared after trimming surrounding whitespace; identical text is skipped, including duplicates inside the incoming file; existing completion status wins. This is a task-copy workflow, not synchronization or evidence that work was verified.

The preview must still match the saved destination notebook when applying. Changed, corrupt or wrong-app notebooks are not overwritten; select the destination again to refresh the preview after reviewing its current content. Cancel or Escape leaves storage unchanged. Imports and exports do not send AI requests, run commands or modify native documents. Existing open notebook drafts remain separate and will detect the saved change through their usual conflict checks.

Worklists accept at most 1,000 tasks and 1,000,000 UTF-8 bytes, with at most 5,000 characters per task. Only explicitly selected tasks are exported. App notebooks remain browser-local; retain exported files for portable backups.
