# Shared skill vector catalog

The unified Python server starts a persistent SQLite vector store and a managed
background indexing worker. No Docker service, embedding API key, GPU or extra
Python package is required. It works for AI chat even when the coding runtime is
disabled.

```sh
python3 server/server.py
```

A bundled, attributed snapshot makes 78 complete skill documents and 1,159
skill-directory references searchable immediately. Three repositories provide
SKILL.md files; VoltAgent is a directory with links to further authors. Linkly's
llms.txt is registered as an index, not executable code. Source states, versions,
counts and failures are visible in the manager. Cached documents survive failed
updates. See [snapshot provenance and licenses](../server/skill_sources/README.md).

## Edit the set for each app

Open **Skill set** in the AI chat context row or **Agent tools → Skills**.
The desktop header also opens the manager. Select the app, then:

1. Inspect its proposed standard set. Remove entries or search and add others.
   Use **Edit instructions** on a selected entry to change its name, description
   and full Markdown procedure, or **Create custom skill** to write your own.
2. Read a skill in pages, or use **Index skill document** on a directory link.
   Indexing fetches Markdown; it does not install or execute scripts.
3. Open **Retrieval settings** to set guidance and maximum retrieved skills,
   or turn off **Use this skill set** to disable automatic retrieval for the app.
4. In the instruction editor, choose **Stage skill edits** (or Cancel edits).
   **Use indexed source** stages removal of an app-specific override.
5. Choose **Save app skill set**. Future requests use the saved revision.

Use the selected-list search and type filter to find active, disabled, edited or
custom skills. Each skill has a **Use** switch: turning it off preserves its
instructions and membership while excluding it from automatic chat/agent context
retrieval. Explicit catalog search/read tools can still inspect it. The up/down
buttons set priority when retrieval relevance scores tie; relevance remains the
main ranking criterion. **Duplicate** opens a custom copy for editing and staging.

The sticky draft indicator distinguishes saved revisions, set changes and
unstaged instruction edits. **Review changes** lists additions, removals,
activation changes, instruction edits and settings/order changes. **Discard draft**
restores the saved app set after confirmation. Controls pause during server
operations to prevent overlapping saves or accidental app switches. Disabled
states and skill order are included in export, copying and revision history.

**Propose standard set** stages the recommended set without saving it.
**Export set** and **Import set** transfer the selected app's configuration;
imports are staged for review before saving. Custom skills and edited Markdown
are included in exports, copies and saved profile history. Editing one app does
not change another app or the original indexed document. A remote source refresh
does not overwrite app-specific instructions. Each edited skill supports up to
100,000 characters; the profile accepts up to 100 unique skills and a 2 MB JSON
override payload. Empty instructions are rejected. Profiles use revision checks to
prevent overwriting concurrent edits. Missing source IDs are shown rather than
silently discarded. Use Reload after a background refresh to see current status.

The standard sets combine planning, debugging and verification with relevant
skills: domain modeling for architecture/mind maps, writing/documentation for
text/research/presentations, frontend engineering for graphics/app design,
testing/security for code/workflow tools, and task breakdown for project planning.
Document, spreadsheet, presentation, graphic, app and video tools also suggest
appropriate directory entries such as DOCX, XLSX, PPTX and Remotion. Selected
references are resolved during online refresh when their locations are supported;
ambiguous aliases remain references with a reported fetch error.

## Retrieval and agent tools

Requests identify their app independently of the model's response schema. The
relay retrieves from that app's selected skill set and inserts a separate user
reference message before the final task. Original system instructions, task IDs,
document digests and proposal schemas stay intact. App identity survives request
and result paging, including repair attempts. Report generation and workflow AI
calls also identify their apps.

The coding agent can additionally call:

- `catalog_search`: hybrid vector/title/description search over full skills or
  directory references, with pagination; app-specific and custom instructions
  participate in the coding agent's search results.
- `catalog_read`: paged full-text retrieval pinned by `contentHash`, using the
  current app's saved Markdown override when present.
- `catalog_fetch`: resolve one existing directory reference to a Markdown skill.

Workspace-local learned skills (`skill_search`, `skill_read`, `skill_save`) remain
separate. A newly indexed external skill is not automatically enabled in every
app. Select it in the relevant app set. External instructions never grant tool
permissions, change takeover policy or execute on import.

The vector model uses deterministic **256-dimensional hashed word/bigram
features** with cosine similarity, supplemented by lexical title/description
matches. Saved app edits are scored from their edited Markdown and metadata
using the same vector method. They take the place of the original procedure in
that app's retrieval. It is a local lexical vector index, not a pretrained neural semantic
embedding model. Retrieval returns bounded excerpts with provenance; agents
should read the full pinned procedure when following it. Full contents remain
available through paged reads.

Profiles and retrieval belong to the server handling the request. The unified
server shares one catalog between chat and the local coding agent. A separately
configured remote relay has its own catalog unless configured with shared
storage; edit its profiles on that relay's own origin. The management API does
not allow cross-origin configuration writes.

## Storage and refresh

By default the database is `skills/catalog.sqlite3` beside the provider config,
usually `~/.config/architex-relay/skills/catalog.sqlite3`. The database is excluded
from static file serving and agent file tools. Public seed documents contain no
provider settings or credentials.

```sh
python3 server/server.py --skills-db /path/to/private/catalog.sqlite3
python3 server/server.py --skills-offline
```

`--skills-offline` (or `SUITE_SKILLS_OFFLINE=1`) uses bundled/cached data without
network refresh or reference fetching. Online startup schedules a refresh after
three seconds, then daily. **Refresh remote sources** starts another background
refresh. Provider keys are never needed for indexing. Source fetches use HTTPS,
validate redirects/hosts, have timeouts and archive/document size limits, and
never extract or execute archive contents. Manual profile edits survive refresh.

In the current cloud environment, the outbound proxy blocks
`https://linkly.ai/skills/llms.txt`. The source is visibly unavailable, with zero
invented documents. Retry from a server with permitted outbound access. Other
source failures likewise preserve the cached index and report the error.

## Verification

```sh
python3 -m unittest server.skill_catalog_test server.skill_integration_test
node shared-suite/skills-browser-test.cjs
```

The browser check creates an isolated offline server and database. Backend tests
cover seed/defaults, app isolation, persistence/conflict detection, disabled
retrieval, ranking, exact-hash reads, safe reference resolution, failed-refresh
retention, relay injection, coding tools, private-file serving and URL guards.

## Catalog and profile management

- Filter search results by source and document kind. The manager shows total
  counts, result ranges, selected references and missing entries.
- **Add visible results** stages a page of results. **Remove missing entries**
  repairs sets whose upstream documents disappeared; saving remains explicit.
- **Copy app set** stages another app's choices and guidance in the current app.
- **Preview saved retrieval** runs a sample task against the actual saved profile
  and shows ranked excerpts and unresolved references. Save drafts first so the
  preview matches future requests.
- **Saved profile history** loads older revisions in pages. **Stage selected
  revision** fills a draft; saving creates a new revision and preserves history.
  Pre-upgrade profiles are retained as their current snapshot when first edited.
- Refresh one source from **Sources and indexing status**, or refresh all sources
  with the main button. Targeted refresh leaves other source indexes unchanged.
  **Check indexing status** updates progress without discarding a profile draft.
- Read a document forwards or backwards through pinned pages. **Download full
  skill** exports its complete Markdown using the pinned hash, rejecting a
  mid-download upstream change rather than mixing versions.

Profile history is private server-side catalog data. It contains app skill-set
settings, not provider credentials or conversation history.
