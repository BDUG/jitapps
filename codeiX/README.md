# codeiX

A VS Code-style local code workspace with a review-driven coding agent. It provides a file explorer, tabs, line numbers, basic syntax highlighting, project search, history, import/export, and a coding-agent panel connected to the existing relay and workspace runtime.

No build, account or Node runtime is required for editing. Open `codeiX/index.html` directly, or serve the repository with `python3 -m http.server 8000` and open `/codeiX/`. The existing `python3 server/server.py` command can serve this tool and supply its AI relay. ZIP support reuses the local JSZip asset in `../architex/vendor/`; keep the folders together when hosting.

## Edit a project

Select a file in Explorer to open it. Tabs switch files; × closes a tab without deleting the file. New file accepts a relative path such as `src/app.js`. Rename changes the path; it does not rewrite source imports. Delete removes a file after confirmation. Undo can restore it. Search scans project text and opens matching lines; file filtering matches paths.

The editor has line numbers, a syntax-color overlay, cursor position and byte count. Basic token highlighting recognizes comments, strings, keywords and numbers; it is not a language server or full grammar parser. Tab inserts two spaces. Ctrl/Command Z undoes, Ctrl/Command Shift Z redoes, and Ctrl/Command S saves the browser project and, when a workspace folder is connected, starts the folder save flow. Standard browser text selection, copy, paste and keyboard navigation work normally.

Changes autosave in browser storage. Undo history is limited to the current session. Export important work: clearing browser data removes the saved project, and browser storage has a size limit. Documents are written to disk only through the explicit local workspace folder save described below; they are not synced, committed or pushed. The browser editor itself has no compiler, debugger or language server. The separate coding-agent runtime can run approved commands on the server machine.

## Work on a local workspace directory

1. Serve codeiX on localhost (for example with `python3 server/server.py`) or HTTPS in a Chromium browser that supports the File System Access API.
2. Click **Open workspace folder**, choose a directory on the machine running your browser, and grant access. The directory replaces the current editor project. Export important unsaved work first.
3. Edit files normally, including with the coding agent's review/apply flow. New files, renames, deletions and Undo all change the editor project first. Browser autosave does **not** write the folder automatically.
4. Click **Save to folder** or press Ctrl/Command S. Confirm the listed writes and deletions. The folder status shows whether the current project has unsaved disk changes. Only loaded text files and files you add are eligible for writing or deletion.
5. Use **Reload folder** to discard editor changes and reread disk, or **Disconnect folder** to keep editing the browser copy without a disk connection.

Nested folders are preserved. `.git`, `node_modules`, `.venv`, `venv` and `__pycache__` are excluded; binary, invalid and oversized files are skipped and reported. Existing project limits still apply (120 text files, 1 MB each, 2 MB total); choose a smaller directory if loading exceeds them. Empty directories are not represented or removed. The directory scan is bounded to 5,000 entries and 20 levels.

Before saving, codeiX compares every affected file with its last-read contents. An external modification, removal or colliding new file stops the save instead of overwriting it. Export your editor copy before reloading if you need to merge changes. The save checks precede writing but do not lock external editors; avoid simultaneous disk edits while saving. Multiple-file saves are not atomic: if a later write fails, earlier writes may already be on disk. Undo changes the editor copy; save again to write that reversal to disk.

Directory permission and handles are session-only. Reloading the page restores the browser copy but requires choosing the folder again to reconnect; export unsaved work before reopening it. This accesses the browser machine's directory, not the relay server's filesystem. The agent receives the selected text context as before and cannot run commands or write directly to disk. Unsupported browsers can still use **Import folder** and **Export ZIP**.

## Import, export and preview

- **Import files** adds UTF-8 text files. **Import folder** preserves relative subfolders, skipping `.git` and `node_modules`. Existing paths require confirmation before replacement. Binary, invalid or oversized files are skipped and reported.
- **Open project** replaces the workspace with a codeiX JSON backup or ZIP archive of UTF-8 text files. An invalid project leaves the current workspace intact. Successful imports can be undone.
- **Export ZIP** downloads the project files with their relative paths. **Save JSON backup** also retains the project name. **Download file** downloads the active file.
- Projects support up to 120 files, 1 MB per file and 2 MB total text. Project archives are limited to 8 MB. Paths must be relative, without traversal, backslashes or empty segments.
- **HTML preview** displays only the active HTML file in a sandbox. Scripts, external resources, forms and navigation are disabled. It is a static visual check, not an application runner; neighboring CSS/JS files are not bundled into the preview.

## Use the coding agent

codeiX has one **Coding agent** panel. The standalone AI chat and Chat tab have been removed. Use **Show agent** or the **Coding agent** button to open it; the panel can still be hidden, resized or floated.

1. Start `python3 server/server.py --agent-workspace /absolute/path/to/workspace` and configure your provider in the relay settings. The runtime workspace is on the server machine; a browser workspace folder is a separate directory connection.
2. Open the coding-agent panel and check the displayed runtime workspace and permissions. Describe a goal and optionally attach reference files.
3. Review edit, command and current-project permissions, then choose **Start agent** and the takeover mode. The agent iterates through actual tool calls and observations. Commands require an enabled runtime and its executable allowlist.
4. Answer questions through the goal/follow-up input and Resume. Pause finishes the current action; Stop interrupts it. Saved sessions, traces, prompt workflows, attachments, tools and result exports remain available.
5. Review runtime changes using **Review changed files in codeiX**, or use the configured current-project takeover flow. Review and apply changes atomically; stale browser-project changes are rejected. Undo restores the previous browser project. Saving the browser workspace folder remains an explicit separate action.

Uncheck Explorer files to exclude them from coding-agent project context. Start a new agent run after changing exclusions so previous history is not reused. Attachments and project content may be sent to the configured model provider within the approved run.

## Verification

Run `node codeiX/project-test.cjs` for project/proposal validation checks. With the relay serving port 8000, run `node codeiX/browser-test.cjs` for editor operations, ZIP round-trip, static preview, relay health, absence of the old chat and preserved runtime-file review. Run `node shared-agent/context-paging-browser-test.cjs` for a real local runtime with mocked model requests, paging, file updates and cancellation.

Run `node codeiX/workspace-browser-test.cjs` against port 8000 for folder loading, explicit writes, conflicts, reload, renames, deletions and permissions. Its directory API is a fixture; native picker interaction still requires a manual browser check. No paid provider call is required by these tests.

## Workspace extensions

Open **Workspace** beside the virtual disk controls, or press **Ctrl+K / Cmd+K**, for searchable commands, content search and reviewed bulk replacement, named recovery points, portable workspace backups, three tool-specific AI workflow drafts, document validation/insights, and coding-agent handoff ZIPs. Restores preserve a recovery point first and reject stale or invalid changes. Files can move through either local or virtual disk.

See the [workspace tools guide](../shared-suite/WORKSPACE.md) for this app’s native backup behavior, raw source/formula search, inspection measurements and interoperability limits. Workflow drafts never send an AI request automatically.

## Paged AI conversations

codeiX now uses the shared [input/output paging transport](../shared-ai/PAGING.md). Its old 600,000-character chat guard and eight-message handover slice are removed: selected context and eligible conversation history can be paged, with output reassembled before file-change validation/review. Long message bodies have page controls and full-text downloads. Project/file limits remain enforced. Configure **AI paging** in the suite toolbar; Stop, retry and partial downloads do not apply incomplete file changes.

## Workspace coding agent

Use the **Coding agent** tab in AI chat for iterative code inspection, file editing, managed scripts and real terminal execution. See the [runtime setup and workflow](../shared-agent/README.md) for startup flags, permissions, session recovery and verification.

## Tool-specific productivity actions

Open **Workspace → Tool actions** for reviewed editing helpers, JSON/Markdown/CSV inventories and a tool-specific AI review draft. Changes use native validation and save recovery before application. See the [action catalog and interchange guide](../shared-suite/WORKSPACE.md#tool-actions-and-portable-inventories) for this app’s operations and limits.

Additional **Workspace → Tool actions** capability: Add a portable .editorconfig without replacing existing settings. Review the native change preview before applying; a recovery point is saved automatically.

**Productivity extension:** Generate a source TODO/FIXME task index with file and line locations. Use **Workspace → Tool actions** to review and apply native changes.

**Reusable variants:** Copy the complete text-file tree into a new relative variant folder. Available through **Workspace → Tool actions**, with native validation, preview and recovery.

The coding-agent tab can apply validated updates directly to the open project, with stale-edit protection and **Undo project edit**. **Download result ZIP** supports paused runs and includes the browser project as well as tracked relay workspace changes. Restart the updated `server/server.py` to enable these endpoints.

## Export a Tauri v2 desktop project

Click **Tauri ZIP** beside **Export ZIP**. Choose an application name and reverse-domain identifier, then select the frontend mode:

- **Static HTML / JavaScript:** choose a loaded HTML entry. Files keep their original relative paths under `frontend/`. Existing `index.html` is preserved; if absent, a launcher is generated. Projects without HTML receive an explicitly labelled placeholder.
- **Frontend with a build step:** original files are preserved under `frontend/workspace/`. Set the output directory (for example `dist` or `build`) and the build command, which runs from the exported ZIP root. Projects with a package.json build script initially suggest this mode.

The ZIP includes a root npm project with the Tauri v2 CLI, `src-tauri` Rust sources and Cargo manifest, Tauri v2 config, core window capability, application icons, export metadata and a README. Existing workspace Cargo/package files stay inside the frontend tree and do not overwrite the desktop scaffold. Export does not execute project or build commands and does not modify the open project. The shared export destination also supports saving the ZIP to the virtual disk.

After extracting, install the [Tauri native prerequisites](https://v2.tauri.app/start/prerequisites/) for your OS, plus Rust and Node.js/npm. Run:

```sh
npm install
# Build-based frontends with package.json also need:
# npm --prefix frontend/workspace install
npm run tauri:dev
npm run tauri:build
```

The generated README provides mode-specific commands. Installer bundles appear in `src-tauri/target/release/bundle/`. Build on the target OS; signing/notarization requires your release credentials. Development in build mode compiles the frontend once and loads its generated assets; configure a devUrl and long-running beforeDevCommand for framework hot reload. Only currently loaded text workspace files are exported, so add required binary assets before building.

See [Tauri v2](https://v2.tauri.app/) for Rust commands, plugins, scoped capabilities and production CSP configuration. ZIP/configuration/icon checks run locally; native compilation requires the Rust toolchain and OS libraries.

## Project ZIP

Use **Project ZIP** in the header, or **Workspace → Recovery → Import / export project ZIP**, to save and restore the complete native project. Choose Computer or Virtual disk. Imports validate and stage a review; applying preserves the previous project in Recovery. Embedded assets are included, while separate app/relay settings and external workspace files are excluded. See the [shared ZIP guide](../shared-suite/PROJECT-ZIP.md).

For the complete coding-agent lifecycle, see [how user input becomes workspace updates](../shared-agent/HOW-IT-WORKS.md). It explains the server workspace, browser project and virtual disk, along with iterative verification, takeover review and file synchronization.

Native chat and the Coding agent tab support [multimodal references and returned media](../shared-ai/MULTIMODAL.md). Actual code changes still require the existing structured contract and validation/review.

## Install a project on the suite desktop

Choose **Add to desktop** in the header. Set the tile name, description and logo; then save it. codeiX projects require a static HTML entry point and bundled browser-compatible code. appiX uses the current generated app, including no-code designer output. The installer captures a snapshot; later editor changes are published by choosing **Update …** in the same dialog.

From the desktop tile's **App settings**, edit its metadata/logo or remove it. Standard apps are protected. The runner's **Edit source project** action loads the saved source into its original editor after confirmation. Added apps are stored only in this browser/origin, run in an isolated frame, and have optional HTTPS network access. Export the source project separately for backup. See [desktop app installation](../README.md#add-your-own-desktop-apps).

Each explorer file has an **Include … in AI context** checkbox. Clear it to exclude that file from both AI chat context (including the file manifest and active editor selection) and coding-agent browser project snapshots. The explorer marks it **AI off**. Exclusions are saved with the project, follow file renames and are undoable. AI edits cannot replace or delete excluded browser files; complete-project proposals preserve them.

Changing exclusions clears chat history and requires a new coding-agent run before resuming with the new policy. Previously submitted requests and historical server sessions cannot be retracted. These are browser project context exclusions, not OS access controls: separately authorized server-workspace tools and commands retain their permissions, and manually attached files are explicit input.

The per-file limit is **1,000,000 UTF-8 bytes** (decimal MB), not a character count. The 120-file, 2 MB total-project and 8 MB archive limits still apply. Files over 200,000 bytes use a labelled plain rendering mode to avoid expensive syntax overlays; their complete text remains editable, searchable, exportable and available to reviewed agent edits.
