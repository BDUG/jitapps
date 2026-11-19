# Graphical skill flows

Open [the editor](index.html) directly, choose **Graphical skill flow** in the
shared skill catalog, or open it from the coding agent header. It uses the suite
theme and a sketch-style dependency canvas. Drag cards, edit tool arguments and
result checks, add pinned local skills, connect prerequisites, and use Undo/Redo.
The canvas supports keyboard card selection with Enter or Space.

Native `codingagentlib/skill-flow-v1` JSON preserves layout and the original
downstream skill scope. `codingagentlib/skill-flow-v2` also represents skills
scoped to the next tool steps only; older editors reject that format. Import/export of
`suite-tool-workflow/v1` (plain steps) or `suite-tool-workflow/v2` (skill pins) connects the editor to the existing coding runtime.
Whole-value `$input` and `$step` references remain data; no expression or shell
string is evaluated. `$step` dependencies participate in cycle detection even
when no arrow was drawn. New skill nodes propagate pinned ID/revision prerequisites
to downstream tool steps by default. The inspector can limit a skill to the next
tool steps on each path. Workflow imports use that narrower scope for each
declared pin, so import/export does not add requirements to later steps. The Python coding runtime checks that each skill is
still enabled and at that exact revision immediately before dispatch, including
after a pause. Skills are reference procedures; they never grant permissions.

When opened from an agent session, **Load workflow** and **Save workflow revision**
use a same-origin, per-editor bridge restricted to those two operations. The
session must remain the same and the agent must be stopped. Saving uses the
inspected revision; conflicts preserve the draft. New IDs start at revision 0.
Saving/importing/editing does not execute any step. Read the saved workflow in the
current session before an explicit `workflow_run`; executable allowlists, file
hashes, cancellation, batching and normal permissions still apply. Definitions
with skill pins use the v2 format so older runtimes reject them before execution.
Check `workflowContracts`/`workflowFeatures` in runtime health before transfer.

Library saves preserve the inspected workflow's enabled/disabled status. Use the
workflow manager to change that status explicitly. Load replies cannot replace
newer diagram edits or pending fields, and replies from a changed host session
or a newly running agent are rejected. Save acknowledgements are checked against
the submitted ID, revision, definition and status; edits made during a save remain
visible as changes to the current workflow.

An uncertain save blocks another normal save until **Load workflow** reconciles
the stored revision. If a new-ID creation was uncertain and the ID is still
missing, **Retry creation only if ID is missing** performs an explicit revision-0
write. A concurrently created/existing ID rejects that retry. These operations
never run a workflow.

The editor validates input defaults against their declared JSON types, finite
JSON values, result-check operations and RFC 6901 pointers before applying edits.
Imported sequential workflows must reference earlier steps and declared inputs.
The shared `codingagentlib/conformance/workflows-v2.json` fixtures exercise both
the graphical JavaScript importer and the Python runtime validator. Invalid
fields stay in the draft and cannot be exported or saved as a runnable workflow.

The standalone page keeps a local draft and exports JSON. Its agent-library
controls are disabled outside an agent-owned iframe. No keys or model settings
are included in exported flows. Bounds: 64 nodes, 256 explicit links, 500 KB of
JSON. The runner processes at most 16 steps per batch and may pause between them.

**Download embeddable result** creates a static HTML/SVG illustration without
scripts, storage, model calls or agent access. Serve the exported file and embed
it with `<iframe sandbox src="procedure.flow.html" title="Skill flow"></iframe>`.
Keep the native JSON alongside it when further editing is needed.

**SVG result** exports an ordinary image asset that can be imported by other
suite apps accepting SVG images. Keep source JSON for editable interchange.

## Applied values and editor drafts

Step and flow-setting edits remain drafts until **Apply step**, **Apply flow
settings**, or **Apply all pending fields** succeeds. Apply all validates every
pending value together, so a newly named input and a reference to it can be
applied atomically. Invalid JSON or dependencies preserve all field drafts and
the last applied diagram. Switching cards and moving the canvas keep drafts.
Saving/exporting, replacing the flow, and Undo/Redo ask you to apply or discard
pending fields first; they never silently export old values.

Unapplied fields are kept locally and restored after reload. Agent-hosted drafts
are scoped to the active session, separately from standalone drafts. Closing the
embedded editor explains pending-field recovery; it waits for an active library
request to finish. Library waits are bounded; a timed-out save is reported as
uncertain and must be reconciled by loading the library before retrying. Browser storage failures are visible and an applied flow can
still be downloaded. If a recovered draft belongs to a different saved base,
**Recover saved draft** lets you inspect it explicitly instead of replacing the
current flow automatically. Drafts are editing data and are never executed.
