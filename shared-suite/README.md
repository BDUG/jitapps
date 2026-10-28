# Shared desktop and virtual disk

The suite desktop lives at `/` and lists all 17 applications. Each card opens an app; the small **Desktop** button in every app returns here. SVG icons are shared by the desktop cards, app headers and browser tabs.

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
