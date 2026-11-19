# mergiX

Compare files and folders, inspect changes, and build a reviewed merge. Open [`/mergiX/`](./) through the suite server or desktop app. **Demo** provides a three-way comparison with independent changes and a conflict.

## Compare and merge

1. Import **Left sources** and **Right sources** using **Files** or **Folder**. A folder's outer directory is stripped so matching relative paths line up. Importing one file on each side pairs them even when their names differ. Each import replaces that side and resets previous merge results; Undo restores the previous comparison.
2. Choose two-way comparison, or import the optional common ancestor for a three-way merge. Browse paths, filter changes, and switch between side-by-side and unified views. Spacing and case filters affect the display; merge decisions always use exact source contents.
3. Choose a complete side or resolve individual hunks with **Use left**, **Use right**, **Use base**, or **Use both**. Three-way merging combines independent line changes and marks overlapping changes for resolution. Use both places left text before right text. **Take** an absent side records a deletion; choosing an empty hunk only removes those lines.
4. Edit a text result and click **Apply result edit**. Pending edits survive path navigation and browser recovery. Apply or discard them before replacing inputs, applying AI results, or exporting. A custom manual or AI result must be reset before using individual hunk choices.
5. Review automatic drafts and AI proposals with **Mark reviewed**. Explicit side and fully resolved hunk choices count as review. Export requires every chosen result to be resolved and reviewed.

Identical inputs and changes confined to one side of a three-way comparison are ready automatically. Binary files support byte comparison and an explicit whole-side choice. Invalid UTF-8 and files containing NUL are imported as binary, preserving their bytes. Empty files and deleted files remain distinct.

## Semantic AI comparison and merge

Configure a provider in the suite's **AI chat**, then check the paths to share. Folder imports start without checked paths. **AI compare** prepares a semantic analysis request; **AI merge** prepares a merge proposal request. Review the prompt and context, then send it through the shared chat.

Only checked text paths and their left/right/base contents and stored results enter the comparison document. Unchecked contents and binary contents are excluded. Selected binary paths are listed as excluded metadata. A two-way request omits stored base contents. Any additional attachments or context chosen in shared chat follow the chat's controls.

The host validates proposals, preserves source inputs and settings, and accepts result changes only for the checked text paths. AI changes remain unreviewed until explicitly accepted. Changing the document or selection invalidates a waiting proposal. Chat Undo restores the preceding selected results. Semantic analysis is advisory; review and test generated code in its target project.

## Save, recover, and export

- **Save comparison** downloads a native `.mergix.json` containing all imported sources and recorded results. If unapplied text drafts exist, it saves a `.mergix-draft.json` recovery bundle including those drafts and the current selection. **Open comparison** accepts both formats.
- Browser autosave retains the comparison and pending drafts locally. If an unreadable recovery or a changed saved copy is detected, it is preserved for download before explicit replacement. Storage limits can prevent autosave; use comparison backups and individual draft downloads. Cross-tab detection is best effort, so use separate saved comparisons for concurrent work.
- **Download result** exports the active reviewed file. **Export selected ZIP** exports reviewed checked files under `merged/` and a root `merge-report.json`. Intentional deletions appear in the report and do not create empty placeholder files. Applying deletions to a destination remains a separate action.
- **Report JSON** exports paths, byte sizes, statuses, and decisions without file contents. Native backups, workspace snapshots, and Project ZIP contain the full comparison, including unselected inputs; handle them accordingly.

Imports do not overwrite source files, and source contents are displayed as text. Folder comparison covers file contents and relative paths; it does not compare empty directories, permissions, symlink identity, or filesystem timestamps. Text comparison preserves UTF-8 BOMs and line endings; manual edits to CRLF results retain CRLF. Mixed line endings require inspection.

## Suite integration and limits

mergiX uses the shared application navigation, theme, virtual disk, workspace snapshots, catalogue, tasks, quality review, skills, coding agent, and AI chat. Catalogue layouts change presentation without changing input files or results. Native workspace snapshots contain the whole comparison even when AI context is limited to checked paths.

The local model allows 300 files per side, 1 MB per file, 8 MB of combined source/result data, and 16 MB of native JSON. Recovery downloads are limited to 32 MB. Line comparison uses a bounded longest-common-subsequence calculation; large differences fall back to a coarse hunk. The highlighted view shows at most 2,000 rows while full source text remains available. Three-way merging is line-based; it does not parse programming languages or prove behavioral equivalence.

## Verification

Run from the repository root:

```sh
node mergiX/model-test.cjs
node mergiX/browser-test.cjs
CATALOGUE_GROUP=mergiX node shared-suite/catalogue/browser-test.cjs
node scripts/verify-suite.cjs
```

The self-contained browser test covers folder pairing, text and binary imports, hunk and manual merging, recovery round-trips, selected semantic AI requests and proposals, stale-proposal rejection, Undo, deletion reports, ZIP bytes, native workspace snapshots, inert source rendering, and the mobile layout. AI responses in this test are deterministic fixtures.

## Python server storage

Expand **Server projects & files** to open saved projects, **Save now**, or **Save as new project**. Edits autosave after a short delay. Each project has a separate server root with revisioned files, folders and editor state; unapplied drafts are included. Use **New folder**, Rename, Delete and per-file Download in the tree. Apply or discard pending text drafts before renaming/deleting their source files. Original local imports are not overwritten. Existing native downloads, virtual disk and browser recovery remain available.

The server defaults to `projects/` beside provider settings; change `--projects-root` or its restart setting. Run the Python suite server rather than a static-only HTTP server. Check the save status before closing. Conflicting tabs must reopen or save a new copy. Server projects survive browser recovery removal and server restart. See [storage details and limits](../server/README.md#server-backed-editor-projects).

Server source files are grouped under `left/`, `right/`, and `base/`; complete merge results and pending result text are retained in the editor-state record. Source rename/delete operations preserve matching results as unreviewed manual drafts where their comparison path still exists. Results whose path disappears remain recoverable in prior server revisions.
