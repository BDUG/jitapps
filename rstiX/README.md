# rstiX

Browse and edit Sphinx-Needs dependencies and reStructuredText documents in the
suite's common desktop/editor UX. Start the normal suite server and open rstiX
from **Apps**. No package installation or Sphinx build is required to edit.

## GitHub source connections

Choose **GitHub repositories** and enter one `owner/repository` per line, with an
optional branch/tag/commit separated by a space. Up to eight repositories can be
scanned together. An optional access token is used for this scan only, cleared
from the form, and never saved in the project or browser storage. The local
relay reads only the fixed GitHub API endpoint; redirects and arbitrary hosts
are refused. Repositories are resolved to immutable commits before tree/blob
reads. Truncated recursive trees are walked explicitly rather than reported as
complete. Rate limits and access failures leave the current project unchanged.

Review repository selection before **Import selected repositories**. Every RST
file is included; `needs.json` adds exported needs not already present in that
repository's RST source. These extra needs become generated RST with provenance
pointing to the JSON export. Original RST files, repository/ref/commit and blob
identities survive native project export/import. Reopen the connection dialog to
scan the saved refs again. Scans replace the selected local project only after
explicit import; there is no GitHub write/push operation. Export RST ZIPs to take
local edits back to your normal repository workflow.

AI proposals preserve the imported repository manifest and file provenance,
restoring omitted metadata from the current project and rejecting invented base
commits or replacement connections. Use the scanner or an explicit native
project/workspace import to change repository origins. The selected need shows
the repository and imported base commit; edits remain local. Graph memory keeps
the full project-relative source path separately from the original repository
path (`repositoryPath`), with `reference: "repository-base"` to identify what the
commit/blob hashes describe.

Need IDs must be unique across the imported project. **Prefix need IDs per
repository** explicitly rewrites real need ID/dependency options, including
continuations, to resolve repository collisions. Source bodies and literal
examples remain unchanged; external/unresolved IDs are not invented. Long IDs
can exceed Sphinx/rstiX limits after prefixing and must be shortened explicitly.
Scanning is bounded to 500 documents, 1 MB per document, 10 MB total, 700 API
requests and 120 seconds between requests; an individual HTTP call has a
20-second timeout. Cancelling stops between requests; an in-flight HTTP call can
finish first. Exceeding a bound fails the scan instead of silently omitting
documents. UTF-8 source is required. The feature needs the local suite relay.

## Embed a dependency illustration

**Embed result** downloads a static HTML/SVG snapshot of the visible graph with
no scripts, storage, repository tokens or agent access. Serve that file and use
`<iframe sandbox src="project.dependencies.html" title="Dependencies"></iframe>`
inside another app or a report that accepts embedded HTML. **SVG result** exports
an image asset for apps that support SVG image imports. It is a presentation
snapshot; keep the native `.rstix.json` file for source editing and provenance.

## Local RST editing

- Open `.rst` files, a folder, an RST ZIP, Sphinx-Needs `needs.json`, or a native
  `.rstix.json` project. RST imports are bounded to 500 files / 10 MB, 1 MB per file.
- The sketch graph shows source-backed needs and labeled dependency curves.
  Dragging cards changes layout only. Select cards to inspect IDs, source locations,
  statuses, tags and bodies. Add dependencies in the inspector; remove outgoing
  dependencies with their × button. **Connect** links the selected source card to
  another card. Supported options: `links`, `depends_on`, `implements`, `tests`,
  `blocks`.
- **Apply need edits** updates actual RST. Unknown options/prose are preserved;
  IDs remain stable. Edit the source explicitly to rename IDs/references or change
  nested bodies. **Apply RST source** validates the entire project before replacing
  it. Duplicate IDs or malformed needs do not partially apply.
- **Dependency review** reports missing targets and cycles. A cycle can be useful
  to inspect; the app does not silently remove it or claim a Sphinx build passed.
- Search by ID/title/status/tag, filter status, arrange/zoom the graph, and use
  Undo/Redo. Browser-local saving is separate from source files on your computer.
  Download frequently; a storage-quota error leaves the current document in memory.

Source text is staged per file, and inspector fields are staged per need. File,
need and tab navigation, search and redraws preserve these edits. Selecting a
need also opens its source file. **Apply RST source** and **Apply need edits**
commit the selected draft; **Apply all pending edits** validates every pending
source/field change together. Conflicting changes to the same need field leave
all drafts intact for review. Individual discard buttons keep other drafts.
Undo/Redo, project replacement, normal exports, AI editing and memory operations
require pending edits to be applied or discarded first. Project-name edits are
validated on leaving that field; an invalid name remains a pending edit.

Draft recovery is saved locally when browser storage permits. Reload restores a
draft only when its applied base matches. Otherwise **Recover saved draft** is
an explicit restore with an Undo checkpoint. Unreadable recovery text and drafts
for another base are protected until you recover or discard them; **Download
saved recovery** keeps the original copy. Observed changes to project/recovery
storage from another tab stop an overwrite and retain the local editor state.
The status explains when browser recovery is unavailable.

**Download draft** / **Open draft** exchange `rstix-editor-draft/v1` recovery JSON
containing the applied project and pending fields (30 MB maximum). This differs
from an applied `.rstix.json` project. **Download draft source** saves the current
raw text even if it cannot yet pass project validation. A failed or superseded
asynchronous import preserves the editor's current project and drafts. Native
project/RST exports contain applied, validated data.

**Save project** preserves source and graph layout. **RST ZIP** exports RST files
only; imported non-RST assets and `conf.py` are not included. **needs.json** exports
the parsed need fields and supported dependency options; use native/RST exports
when preserving arbitrary custom options is important. Existing newline style is
retained by need edits. Source imports do not execute directives, include files,
raw content, Python or configuration.

**Project memory** derives a project ontology/knowledge graph from the open RST
document. Download graph and ontology separately, load either for inspection, or
save/load a selected project scope through the local agent backend. Loading memory
does not rewrite RST documents. The server validates an import and checks the
current revision before saving it. Memory is reference data, not authorization or
verification. Unapplied file imports remain temporary until explicitly saved in
agent memory; the native document keeps its source/layout separately.

Memory requests pin the selected project and the last reviewed server revision.
Load existing memory before replacing it; **Use open RST graph** restores the
source-derived preview while keeping that reviewed revision. A concurrent change
causes a conflict rather than replacing newer memory. Changing scope or source,
closing the panel, or reaching the 15-second operation limit rejects stale
responses. A save with an uncertain outcome must be reconciled by loading that
scope before retrying. Pending operations disable memory controls, and unapplied
RST edits must be applied before opening the panel. The preview shows the
revision and bounded node/link samples; downloads contain the complete graph.

The suite provides navigation, virtual disk, sharing, workspace recovery,
templates/catalogues, notes/tasks, review and AI chat with native proposal review.
AI requires a separately configured provider. Native catalogue templates are
editable illustrations. The coding-agent workspace is separate from browser-local
RST files; project-context actions use the shared reviewed/native editing contract.

Checks: `node rstiX/model-test.cjs`; with the server running,
`node rstiX/browser-test.cjs`. The browser test covers graphical/source edits,
Undo/Redo, portable documents, graph/ontology downloads, actual scoped agent-memory
save/load, atomic invalid imports and mobile width without calling an AI provider.
`node rstiX/memory-session-test.cjs` and `node rstiX/memory-browser-test.cjs`
cover concurrent revisions, request scoping, stale reads and uncertain saves.
`node rstiX/drafts-test.cjs` and `node rstiX/drafts-browser-test.cjs` cover draft
recovery, combined edits, conflicts, quota rescue, observed cross-tab changes,
guarded imports, source navigation and export/Undo protection.

Repository/flow/mosaic integration checks: `node rstiX/github-test.cjs`,
`python3 -m unittest server.github_rst_test codingagentlib.test_mosaic_graph`,
and `node rstiX/extensions-browser-test.cjs` (starts its own local relay). These
use deterministic GitHub/provider fixtures; private-repository credentials and
live model quality are not exercised.

## Python server storage

Expand **Server projects & files** to open saved projects, **Save now**, or **Save as new project**. Edits autosave after a short delay. Each project has a separate server root with revisioned files, folders and editor state; unapplied drafts are included. Use **New folder**, Rename, Delete and per-file Download in the tree. Apply or discard pending text drafts before renaming/deleting their source files. Original local imports are not overwritten. Existing native downloads, virtual disk and browser recovery remain available.

The server defaults to `projects/` beside provider settings; change `--projects-root` or its restart setting. Run the Python suite server rather than a static-only HTTP server. Check the save status before closing. Conflicting tabs must reopen or save a new copy. Server projects survive browser recovery removal and server restart. See [storage details and limits](../server/README.md#server-backed-editor-projects).

Folder and ZIP imports keep non-RST assets (including `conf.py` and binary images) beside editable RST files on the server. Assets remain data and are never executed. RST ZIP export and native project JSON include them; source edits and Undo/Redo retain their matching asset set.
