# codeiX

A VS Code-style local code workspace with a review-driven coding agent. It provides a file explorer, tabs, line numbers, basic syntax highlighting, project search, history, import/export, and an AI chat connected to the existing Architex relay.

No build, account or Node runtime is required for editing. Open `codeiX/index.html` directly, or serve the repository with `python3 -m http.server 8000` and open `/codeiX/`. The existing `python3 server/server.py` command can serve this tool and supply its AI relay. ZIP support reuses the local JSZip asset in `../architex/vendor/`; keep the folders together when hosting.

## Edit a project

Select a file in Explorer to open it. Tabs switch files; × closes a tab without deleting the file. New file accepts a relative path such as `src/app.js`. Rename changes the path; it does not rewrite source imports. Delete removes a file after confirmation. Undo can restore it. Search scans project text and opens matching lines; file filtering matches paths.

The editor has line numbers, a syntax-color overlay, cursor position and byte count. Basic token highlighting recognizes comments, strings, keywords and numbers; it is not a language server or full grammar parser. Tab inserts two spaces. Ctrl/Command Z undoes, Ctrl/Command Shift Z redoes, and Ctrl/Command S saves the browser project and, when a workspace folder is connected, starts the folder save flow. Standard browser text selection, copy, paste and keyboard navigation work normally.

Changes autosave in browser storage. Undo history is limited to the current session. Export important work: clearing browser data removes the saved project, and browser storage has a size limit. Documents are written to disk only through the explicit local workspace folder save described below; they are not synced, committed or pushed. There is no terminal, dependency installation, compiler, debugger, command execution or live language service.

## Work on a local workspace directory

1. Serve codeiX on localhost (for example with `python3 server/server.py`) or HTTPS in a Chromium browser that supports the File System Access API.
2. Click **Open workspace folder**, choose a directory on the machine running your browser, and grant access. The directory replaces the current editor project. Export important unsaved work first.
3. Edit files normally, including with the coding agent's review/apply flow. New files, renames, deletions and Undo all change the editor project first. Browser autosave does **not** write the folder automatically.
4. Click **Save to folder** or press Ctrl/Command S. Confirm the listed writes and deletions. The folder status shows whether the current project has unsaved disk changes. Only loaded text files and files you add are eligible for writing or deletion.
5. Use **Reload folder** to discard editor changes and reread disk, or **Disconnect folder** to keep editing the browser copy without a disk connection.

Nested folders are preserved. `.git`, `node_modules`, `.venv`, `venv` and `__pycache__` are excluded; binary, invalid and oversized files are skipped and reported. Existing project limits still apply (120 text files, 200 KB each, 2 MB total); choose a smaller directory if loading exceeds them. Empty directories are not represented or removed. The directory scan is bounded to 5,000 entries and 20 levels.

Before saving, codeiX compares every affected file with its last-read contents. An external modification, removal or colliding new file stops the save instead of overwriting it. Export your editor copy before reloading if you need to merge changes. The save checks precede writing but do not lock external editors; avoid simultaneous disk edits while saving. Multiple-file saves are not atomic: if a later write fails, earlier writes may already be on disk. Undo changes the editor copy; save again to write that reversal to disk.

Directory permission and handles are session-only. Reloading the page restores the browser copy but requires choosing the folder again to reconnect; export unsaved work before reopening it. This accesses the browser machine's directory, not the relay server's filesystem. The agent receives the selected text context as before and cannot run commands or write directly to disk. Unsupported browsers can still use **Import folder** and **Export ZIP**.

## Import, export and preview

- **Import files** adds UTF-8 text files. **Import folder** preserves relative subfolders, skipping `.git` and `node_modules`. Existing paths require confirmation before replacement. Binary, invalid or oversized files are skipped and reported.
- **Open project** replaces the workspace with a codeiX JSON backup or ZIP archive of UTF-8 text files. An invalid project leaves the current workspace intact. Successful imports can be undone.
- **Export ZIP** downloads the project files with their relative paths. **Save JSON backup** also retains the project name. **Download file** downloads the active file.
- Projects support up to 120 files, 200 KB per file and 2 MB total text. Project archives are limited to 8 MB. Paths must be relative, without traversal, backslashes or empty segments.
- **HTML preview** displays only the active HTML file in a sandbox. Scripts, external resources, forms and navigation are disabled. It is a static visual check, not an application runner; neighboring CSS/JS files are not bundled into the preview.

## Connect the coding agent

1. Start the existing relay with `python3 server/server.py`. Follow [Architex relay setup](../architex/README.md) to configure a provider in the relay's own UI.
2. Open **Relay settings** in codeiX. Set the relay origin, such as `http://127.0.0.1:8000`, save it and test the connection. HTTPS is required outside loopback HTTP. A health check confirms relay availability; configure and test the provider separately in **Provider settings**.
3. If the app and relay run on different origins, allow the app origin shown in the settings dialog in the relay's allowed-origin configuration. Direct file opening uses the `null` origin; serving the app and relay together is simpler.
4. Choose context: all files, the active file, or no file contents. The manifest of paths and byte counts is included in every request. The selected text is sent through the relay to its configured provider. Chat is retained only for the current page session; project text and the relay URL are stored locally.
5. Ask a question, request a plan, or describe a change. The agent receives a structured request containing the task, project snapshot identifier, selected files, manifest, capabilities and response schema. The protocol and instructions live in the separate [agent-spec.js](agent-spec.js) file. **Download request** and **Download agent protocol**, below the chat, export the handover and schema.
6. Read the answer and select **Review file changes** when edits are proposed. Inspect removed/added text and the complete new contents of each file. Uncheck changes you do not want, then apply the selected changes as one undoable transaction. A deleted file is shown as removed content. Large diffs use the complete-file viewer instead of an abbreviated line diff.

Agent responses cannot run commands or directly modify the workspace. Proposals require matching request/snapshot identifiers, valid paths and project limits. If the project changes after a request, applying its proposal is blocked; send a fresh request. Undo restores all files from before an applied change. If only part of a proposal is applied, ask for a new proposal for remaining changes.

**Stop** cancels the browser request; requests time out after 90 seconds. Context/conversation payloads are limited to 600,000 characters; choose less context for larger projects. The raw agent output appears below the chat. Malformed proposals are shown as failures and never applied. Plain-text answers are displayed without interpreting HTML. Agent checks and commands are suggestions until you run them in your own development environment; codeiX does not claim to execute tests.

## Verification

Run `node codeiX/project-test.cjs` for project/proposal validation checks. Serve the repository with the Architex relay on port 8000, then run `node codeiX/browser-test.cjs` with Playwright and Chromium at `/usr/bin/chromium` (the same setup as the other tools).

The browser test checks editing, history, persistence, search, files, ZIP round-trip, static preview, the real relay health endpoint and a mocked AI response through the full request/review/apply flow. It verifies atomic application, Undo and stale-response protection. It does not make a paid provider call or establish any configured provider's availability.


## Tool-specific AI chat

Reference files can now be attached below the native chat input. Use images, WAV/MP3 audio, PDFs or UTF-8 text without an application attachment count/size cap; duplicate names receive unique suffixes. Attachments and the active editor selection accompany the structured agent request without being added to the project. Existing reviewed file edits and stale-project protection remain in place.

See the [shared AI chat guide](../shared-ai/README.md) for relay setup, context selection, attachments, review, Undo, request/schema downloads and troubleshooting.

Run `node codeiX/workspace-browser-test.cjs` against the server on port 8000 for folder loading, explicit writes, conflicts, reload, renames, deletions and permission handling. This browser test uses directory API fixtures; native picker interaction requires a manual browser check.

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
