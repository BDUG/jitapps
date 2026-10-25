# Workspace coding agent

The browser-independent loop/spec helpers and Python runtime are now maintained in [`codingagentlib/`](../codingagentlib/README.md), which offers standalone Python, Node.js and Rust adapters. This folder retains UI code and CommonJS compatibility imports.

See [techniques, setup and remaining gaps](TECHNIQUES.md) for compiler navigation, learned semantic memory, independent completion review, dependency-aware plans and provider-backed evaluations.

Start with the [step-by-step walkthrough: from user input to updated workspace content](HOW-IT-WORKS.md) for the complete flow, destination choices, takeover review and an example execution trace.

Every app's AI chat has two tabs: **Chat** and **Coding agent**. Open **AI chat** and select **Coding agent** to use the runtime. Switching tabs preserves chat drafts, coding goals and sessions; a running agent continues while you view Chat. Closing the chat hides the window; reopen Coding agent to inspect or stop the run. This mode runs an iterative Sense → Plan → Act → Observe → Verify loop against a real codebase on the machine hosting the suite server. Ordinary document chat remains available.

## Start locally

From the repository root:

```sh
python3 server/server.py \
  --agent-workspace /absolute/path/to/project \
  --agent-allow-command python3 \
  --agent-allow-command node \
  --agent-allow-command git
```

Open `http://localhost:8000/codeiX/` (or another suite app). Configure a model through the desktop AI provider settings. Select the Coding agent tab, check its workspace and allowed executables, enter a goal, select edit/command permissions and start. For example: “Inspect this project, fix the incorrect addition function, create a reusable verification script and run it before and after the fix.”

Normal server startup enables the repository workspace and installed Python, Node.js, npm and Git commands. Use `--agent-workspace` to select another directory. Repeated `--agent-allow-command` flags replace the default executable list. Use `--agent-no-commands` for file tools only, or `--disable-agent` to disable the runtime entirely. The runtime API requires the hosting server's own local HTTP origin and a request header; remote-hosted frontends cannot execute local commands through it. The AI provider relay can be configured separately.

## Iteration and tools

The model receives the goal, app context and schema (when selected), runtime capabilities, tool definitions and accumulated observations. It returns one structured action per turn using [spec.js](spec.js). The runtime executes it and returns the actual result before the next model turn. Public plans, actions, exit codes and verification reports appear in the log. Private chain-of-thought is not requested.

Tools list/search/read files, create/edit/delete text files, maintain working scripts, execute allowed programs, inspect paged stdout/stderr and compare workspace changes. Existing file edits require a current SHA-256 hash. Managed scripts can be inspected and edited independently after a run. A manual terminal accepts an allowed executable, JSON argument array, working directory, stdin and timeout.

The step budget pauses rather than discarding progress. Continue, stop, answer a question, send follow-up instructions or load an existing session. Stop cancels the client loop and active command process group. Restarted server sessions load paused. Session audit logs, scripts, recovery copies and full command output persist beneath `<workspace>/.suite-agent/sessions/`; exclude this private directory from version control. Command output previews are paged, with full retained logs accessible through Read full command output. Download run log exports the session record and agent protocol.

File-tool edits are immediately applied to disk. Restore file-tool backup recovers the original file or removes a newly created file. Command side effects have no automatic rollback. codeiX offers Apply changed files to current project and a separate Review changed files flow to synchronize workspace edits into its browser project. These actions do not defer or undo earlier disk edits. Native document changes can also be applied directly as described below.

## Execution boundary

This is a trusted local development runtime, not an OS sandbox. File tools reject traversal, symlinks and private runtime/version-control paths. Allowed commands run with the server process's OS permissions: interpreters, shells and git can access resources beyond file-tool boundaries. Enable only executables needed for the task, use a dedicated workspace and OS/container isolation when appropriate, and inspect actual observations before trusting model completion claims. File/script tool writes are limited to 2 MB per write; larger text and logs can be read in pages. No live provider credentials are bundled.

## Verification

```sh
python3 -m unittest server.agent_runtime_test
node shared-agent/loop-test.cjs
node shared-agent/browser-test.cjs
```

The browser test uses a mocked model with real Python command execution and filesystem changes, including a failing check, source fix, successful rerun and editor synchronization. It requires Playwright and Chromium.

## Task progress, outcomes and observed evidence

The Coding agent tab shows a task checklist with pending, in-progress, done and
blocked states. The model supplies stable task IDs with at most one active task;
resumed sessions reconstruct the latest checklist from the saved audit events.
Checklists describe model-reported progress, not independent proof of completion.

Completion can be `complete`, `partial` or `blocked`. Unfinished reported tasks
require a partial/blocked outcome. A separate evidence summary counts actual
command exits, failures/timeouts/cancellations and tool errors, and flags file or
script edits after the latest command. The server also records command-result
counts in the completion event. An exit-zero command is evidence of execution,
not proof that every requirement was tested; model verification prose remains a
claim to inspect alongside the recorded output.

If the same tool and arguments produce the same observation three consecutive
times, a fourth identical action is replaced with a focused question before it
executes. This catches stuck inspection/error loops without automatically replaying
side effects. A deliberate user follow-up resets that guard; previous observations
remain available. Transport errors still stop the client loop rather than blindly
retrying a write or command whose server-side outcome might be uncertain.

Additional verification: `node shared-agent/progress-test.cjs`. The browser test
uses a mocked model and real temporary files/commands; no paid AI request is made.

## Live steering, gentle pause and interrupted-response recovery

During an autonomous run, type in **Goal / follow-up instructions** and choose
**Send instruction to active run**. The instruction is saved in the session audit
log. Before each action the client synchronizes new events and replans if an
instruction superseded the pending model response. The runtime checks the expected
user-instruction revision before starting a tool or accepting completion, closing
the race between the final client check and the server request. Instructions do
not rewind an action that has already started. If completion won the race, the
instruction stays in the text field and the UI asks you to resume explicitly.

**Pause after step** waits for the current planning/action step to settle, then
shows **Continue steps**. It does not kill an active command. You can send follow-up
instructions while paused; continue to apply them. **Stop agent** still requests
immediate cancellation of the client loop and command process group.

Session synchronization fetches only events after the last received index, keeping
long-run steering traffic incremental. Full observations remain in the audit log
and model context; protocol-repair feedback remains available after synchronization.

If a tool POST loses its response, the client queries the recorded call ID instead
of repeating the write/command. Completed observations are reused; an active call
is polled for up to thirty seconds. Unknown/not-found outcomes stop the run and ask
you to inspect saved logs/workspace changes before resuming. The normal error path
requests cancellation when reconciliation cannot finish. This is response recovery,
not a transaction or rollback for arbitrary OS commands. Stop remains available
while recovery is polling.

Verify with `node shared-agent/steering-test.cjs`,
`node shared-agent/steering-browser-test.cjs` and
`python3 -m unittest server.agent_runtime_test`. The browser test drops a response
after a real file write, confirms exactly one write, supersedes an in-flight model
plan, pauses between steps and runs actual verification in a temporary workspace.

### Local vector working memory and result handoffs

Each session has persistent working memory in `<agent-workspace>/.suite-agent/memory.sqlite3`. No additional service or API key is needed. SQLite stores overlapping text chunks, provenance, metadata, and deterministic 256-dimensional hashed word/bigram vectors. Retrieval uses cosine similarity over the current session only. This is lexical retrieval, not a neural embedding service or a claim of semantic understanding. Search scans that session's vectors; very large indexes may need a dedicated backend later.

The agent receives relevant memory chunks at each planning turn, alongside its existing event history. File reads, searches, and command previews are indexed automatically. Full output remains available through the paged output tools. The agent can store decisions and use `memory_search`, `memory_list`, `memory_read`, and `memory_delete`; manual notes and search are available under **Working memory**. Reloading the same saved session retains its memory. Starting a new session does not retrieve another session's notes.

Use **Download result ZIP** during a paused run or after completion. An active run pauses at the next safe step before packaging. Alternatively, the agent can create an intermediate package with `package_results`. The download rebuilds the package to capture the latest recorded state. It includes changed files (including binary bytes), deletion records, best-effort text diffs, managed scripts, complete retained command logs, session notes, task status, and verification evidence. `manifest.json` records payload SHA-256 hashes and byte sizes; `RESULT.md` explains limitations. Files changed during packaging cause an error rather than a silently inconsistent file copy.

Packages include changed workspace files and the current browser project snapshot when app context is enabled; they are not a complete repository backup or an automatically deployed project. Diffs require available originals and omit binary/large files, whose current bytes remain included. Runtime backups, the cross-session database, and configured provider/search credential files are excluded. Outputs and changed project files may still contain private data; review before sharing. Command side effects outside tracked workspace files are not captured. No artificial archive response-size cap is added; available disk space and browser download resources still apply.

Backend verification: `python3 -m unittest server.agent_memory_test server.agent_runtime_test`. Browser verification: `node shared-agent/browser-test.cjs` (starts its own temporary local runtime; uses deterministic model responses).

### Skills learned from local problems

Open **Coding agent → Local skills** to find, read, create, edit, disable and download reusable Markdown procedures. The library is local to the configured relay-machine workspace, stored in `<agent-workspace>/.suite-agent/skills.sqlite3`. Unlike session-private working memory, enabled skills are discoverable across runs in that workspace. They are not shared automatically with other workspaces or an external service.

Before each planning turn, the agent receives relevant skill metadata using the same deterministic local lexical-vector approach as memory. It must read the full procedure with `skill_read` before adopting it. The agent instructions ask it to capture a useful lesson after solving and verifying a reusable problem, or improve an existing matching skill. Learning is an explicit, audited `skill_save` action within the normal agent loop, not a separate background model call or automatic execution. Trivial one-off work need not create a skill.

A useful procedure includes:

- **When to use:** the recurring problem and how to recognize it.
- **Prerequisites:** files, runtime, tools and conditions to check first.
- **Procedure:** adaptable steps and workspace-relative examples.
- **Verification:** meaningful commands/assertions and expected observations.
- **Pitfalls:** failed approaches, version assumptions and remaining limits.

Every save records an immutable revision, reason, source session/goal, time, and optional references to actual observations in that session. `expectedRevision: 0` creates a skill; updates require the current revision. Concurrent or stale updates are rejected. `skill_history` and exact-version `skill_read` retain earlier procedures. Read/list/search/history are paged, so full content and history remain accessible.

`evidenceCallIds` must identify successful recorded tool observations from the current session. A successful, noncancelled command with exit code 0 is labeled **observed-command-success**; otherwise the revision is **unverified**. This provenance does not certify the skill's correctness. Manual UI revisions do not fabricate verification evidence. Recheck procedures against the current codebase before running commands. Skills cannot override current user instructions or grant permissions; creating/updating/disabling a skill requires that session's edit permission. Disabled skills remain readable in the library/history but are excluded from automatic discovery.

To review or edit, start or load a session, use **Find skills** (empty query lists enabled and disabled skills), select a skill, edit its Markdown and change reason, and **Save revision**. **New skill** clears the editor for a new ID. To disable one, clear **Enabled for discovery** and save a revision. **Download SKILL.md** exports the last loaded/saved version with name/description frontmatter; save edits first. The export contains the procedure, while revision/evidence metadata remains in the library and result package.

Result ZIPs include `skills.json` and `skills/<id>/v<revision>/SKILL.md` for exact revisions read or saved during the run. Unrelated skills and the raw library database are not included. The library is skipped by ordinary project file tools and change scans. Like managed scripts, it remains accessible through its dedicated tools; commands still run with the relay process's OS permissions.

Verification: `python3 -m unittest server.agent_skills_test server.agent_memory_test server.agent_runtime_test` and `node shared-agent/skills-browser-test.cjs`. The browser test runs a real temporary runtime with deterministic model responses and actual Python checks; it does not contact a live AI provider.

### ReAct observation and completion review

The loop now supplies a deterministic `cycle` assessment on every planning turn: sense/plan/adapt/verify phase, last observation's call ID and outcome, whether verification after tracked edits is pending, and an appropriate next-step recommendation. It distinguishes tool errors, nonzero command exits, timeouts, cancellations, stale-file conflicts and permission failures. A successful HTTP/tool response does not mean the command passed. Existing full event history, memory retrieval, local skills, live steering, safe pauses and interrupted-tool recovery remain available.

Agent responses may include `expectation` (the observable result expected from an action) and `reflection: {observation, adjustment, evidenceIds}` (a concise public finding and next adjustment). Reflections are not private reasoning. Evidence IDs must exist in recorded observations; this check establishes provenance, not whether the model interpreted the evidence correctly. The UI shows these fields, observation/adaptation feedback and response-review errors.

A complete result after observed file/script edits requires a successful, noncancelled command after the most recent tracked edit when command permission and an executable are available. The browser sends premature completion back for response correction; the runtime also rejects direct premature completion calls. A later failed/timed-out/cancelled command makes verification pending again. Partial/blocked results remain possible with an honest limitation. Read-only work or sessions without command permission do not require a command. This guard cannot infer arbitrary command side effects or prove that a successful command exercised the requirements: the agent must still choose meaningful verification.

The no-progress guard detects unchanged single actions and repeating cycles of two or three actions. After three unchanged cycles, it pauses with a question before another tool execution. Different observations or advancing arguments such as page offsets count as progress; follow-up instructions reset the cycle history. Tool-response recovery still reconciles the recorded call without replaying it. Model/provider transport failures stop with their original error instead of being retried as if the response were malformed JSON; explicitly resume after inspecting the saved session.

Checks: `node shared-agent/react-test.cjs`, `node shared-agent/react-browser-test.cjs`, and `python3 -m unittest server.agent_runtime_test server.agent_memory_test server.agent_skills_test`. The browser test uses a real temporary runtime and actual failing/passing assertion commands with deterministic model responses.

### Durable planning and resume

Before each model call, the runtime allocates a unique, monotonically increasing planning step and saves a `turn` checkpoint in the session. Failed, interrupted or superseded planning calls still consume their allocated steps. Resume reads those checkpoints, rather than relying only on accepted assistant replies, so a reload does not reuse an earlier planning step or its derived tool-call ID. Older sessions without turn checkpoints continue from their recorded assistant/correction steps.

Malformed replies and rejected premature completions now save their `protocol_error` feedback in the session. Reloading and resuming retains that correction context without duplicating it during event synchronization. All three correction failures are retained if the consecutive-response repair budget is exhausted. Provider transport failures keep their original error and do not count as malformed replies. Explicit Resume starts a fresh planning turn; it does not replay the previous action.

The loop synchronizes instructions again after memory/skill retrieval and immediately after the model reply. A reply superseded by a user follow-up is discarded before schema/completion review, even if it contains malformed JSON. Instructions arriving during retrieval also trigger replanning before a provider request. New instructions reset the consecutive-response correction counter. Existing permission checks, one-tool-at-a-time execution, completion review and recorded-call recovery continue to apply.

The loaded run log distinguishes **Planning checkpoint** from an action/observation: a reserved step is not evidence that a tool ran. Checkpoints and persisted corrections are included in the existing run log/result package. This is session recovery within the runtime, not a transaction or rollback mechanism for arbitrary terminal side effects, nor a guarantee of coordinating multiple independent runtime processes against one workspace.

Checks: `node shared-agent/resume-test.cjs`, `node shared-agent/resume-browser-test.cjs`, and `python3 -m unittest server.agent_runtime_test server.agent_memory_test server.agent_skills_test`. The browser workflow exercises a malformed reply, a real HTTP provider-error response, page reload/session load, and resume with exactly one recorded source-file read.

### Machine-checked action expectations

An action can include optional declarative `checks` alongside `tool` and `args`. The runtime validates their shape **before** executing the tool, then evaluates them against the actual returned JSON result. For example:

```json
{
  "tool": "run_command",
  "args": {"command": "python3", "args": ["checks.py"]},
  "checks": [
    {"path": "/exitCode", "op": "equals", "value": 0, "label": "Verification exits successfully"},
    {"path": "/stdout", "op": "contains", "value": "verified", "label": "Expected verification output"}
  ]
}
```

Paths use RFC 6901 JSON pointers: `""` selects the whole result, `/items/0/name` selects a nested array item, `~1` escapes `/` and `~0` escapes `~`. Supported operations are:

- `equals`: deep JSON equality, keeping booleans distinct from numbers.
- `contains`: a string substring or deep-equal array member.
- `exists`: presence/absence, with a boolean `value`. A present null value is distinct from a missing path.

These are comparisons, not scripts or expressions. They use only the returned result: a file page or command preview is not the entire file/log. Use paged read tools when the required evidence lies beyond that result. Existing text `expectation` fields remain available for expectations that cannot be reduced to these operators.

Observations retain `ok` for tool execution and a separate `checks: {passed, results}` for checked expectations. Thus `ok: true` with `checks.passed: false` is possible and meaningful. The agent receives an expectation-failure assessment, sees which conditions failed, and must inspect the actual result, adjust its action or justify a corrected expectation, then rerun checked work. Failure is also shown in the run log. Unchecked actions and empty check arrays do not clear a prior failed check result.

Complete is blocked in both the loop and runtime while the most recent nonempty check set remains failed. A later passing checked action clears that guard; partial/blocked completion remains available for unresolved limitations. This is a local evidence check, not proof that the checks cover the requirements or that the agent's interpretation is correct. Meaningful verification still matters.

Checks survive session reloads and recorded-call response recovery. Result ZIPs include an `action-checks.json` report with observed check sets, pass/fail counts and latest status; the session audit retains the corresponding actions and actual tool results. A skill revision referencing a command whose checks failed is not labeled as observed command success solely because its exit code was zero.

Checks: `node shared-agent/checks-test.cjs`, `node shared-agent/checks-browser-test.cjs`, and `python3 -m unittest server.agent_checks_test server.agent_runtime_test server.agent_memory_test server.agent_skills_test`. The browser test exercises real file reads, failed/passing expectations, premature-completion review, and a dropped tool response reconciled without replay.

### Aggressive context compression

**Context → Aggressive** is the default for coding-agent model requests. **Balanced** retains larger previews and more recent events; **Off** sends the full request context. This setting affects coding-agent input only. It does not limit reply length, delete run history, or compress the state used by the runtime's permission, replay, loop-progress and completion checks.

The compressor creates a deterministic compact view of the history: recent events, recent tool observations, the latest three planning checkpoints, response corrections, and user follow-ups, plus event counts and recent observed file hashes. Long source strings, large arrays and repeated tool payloads become short previews with `$contextRef` pointers. The goal, permissions, tools, response schema, native app schemas/instructions, current tasks, and observation-derived cycle/evidence remain available. The latest retrieval result is kept intact so reading omitted evidence does not immediately hide that evidence again. Historical hashes remain historical; read current files before editing.

Aggressive mode targets roughly 24,000 serialized payload characters; Balanced targets 64,000. These are soft input-payload targets, not model token limits or output caps. Pinned instructions, schemas, user requirements and requested evidence can exceed the target. The UI reports actual payload characters, estimated tokens, reduction and target overflow. The fixed system contract is additional input; the token estimate is approximate. Tiny requests can grow slightly because the view includes retrieval metadata. No extra LLM call is used to summarize or compress.

Full original session events remain in the runtime session and result ZIP. `read_history` lists original event descriptors or reads an exact event index/JSON-pointer path in character pages. Full retained command logs still use `read_command_output`; an archived tool preview is not a full command log.

When app context is included, a run archives the original browser document in UTF-8 chunks before requesting a compressed view. Snapshots live under `.suite-agent/sessions/<session>/contexts/<sha256>.json`; `read_context` retrieves an original snapshot/path in pages, separately from actual runtime workspace files. Snapshot hashes are verified when read. Resuming can create a new snapshot while earlier references remain pinned to their old hash. **Off** still archives the source when current-project access is enabled. Cancelling a known upload cleans its temporary file; interrupted browser/process shutdown can leave an incomplete private upload, which is excluded from ZIPs. Original snapshots are included under `context/` in result packages, so review their contents before sharing.

A `$contextRef` or `$contextRemainder` is not original source. The agent instructions require retrieving the original before relying on omitted content. Memory snippets and skill metadata retain their dedicated retrieval tools. Source archives are scoped to the session; another session cannot read them by supplying a hash. All original content remains subject to available browser memory and server disk resources.

### Coding-agent request and result paging

Open **Request & result paging** within the coding-agent tab. It defaults to **Use shared paging settings**, respecting the existing relay/chat paging preference. Per-agent overrides provide **Auto**, **Always page request and result**, and **Off**, with request-page characters, requested result-page characters and a separate page-call pause interval. These settings are saved independently from shared chat settings. ReAct's step pause interval remains separate.

Compression runs first; paging transports the resulting model conversation. The paging protocol sends the source catalogue and every input resource page, maintains rolling notes, and supports rereading original pages. Reply fragments concatenate exactly into one complete agent response. The ordinary response validation, permissions and tool-action loop run only after assembly; partial JSON never executes an action. Per-page sizes are not total input/output limits. Each provider call still has its own limits, and rolling notes can lose details, so source rereads and result review remain important.

The panel reports request/result page progress for the current planning step. **Download current request**, **Download full/partial reply**, and **Download page journal** retain inspectable data for that step. Stop cancels page generation and retains accumulated fragments for download; no incomplete action is applied. The request-specific page session is kept separately from other suite chat calls. Shared paging's retry/continue controls remain available for failed pages and page-budget pauses. Paging can require multiple provider calls.

### Resizing the Chat / Coding agent window

Both tabs share one resizable shell and saved size for each app. Drag the **top-left corner** to resize a floating window in both dimensions or the **left-edge handle** to adjust width. Focus a handle and use arrow keys; Shift uses larger increments. **Expand / Restore** and **Reset size** are available in the header. Sizes are clamped to the current viewport so the controls stay reachable on mobile.

In codeiX, the left-edge handle resizes the docked column. **Float** enables two-dimensional resizing; **Dock** returns it to the editor layout. Resizing and switching tabs preserve the active conversation and agent run.

Verification: `node shared-agent/context-test.cjs`, `node shared-agent/context-paging-browser-test.cjs`, `node shared-agent/window-browser-test.cjs`, and `python3 -m unittest server.agent_context_test server.agent_checks_test server.agent_runtime_test server.agent_memory_test server.agent_skills_test`. The browser tests exercise chunked original-document archiving, reference retrieval, multi-page Unicode results, cancellation before an incomplete write, request/result downloads, and resizing on desktop/mobile.

### Direct application and result downloads

**Apply directly to current project** is enabled for new runs. It requires **Include app context** and file edits. The agent uses `read_current_project` to refresh the open document and `apply_project` to submit a validated update. Native apps use their own document validators and application path; codeiX accepts file changes or a complete project. Browser documents are separate from the relay workspace. A session from another app cannot edit the current app; start a new run there.

Updates reject stale snapshots and intervening user edits. **Undo project edit** restores the previous document if no newer edits have occurred. Recorded call IDs and application receipts prevent replay after a lost response. These observations report browser-editor application, not independent server verification. Commands still operate in the relay workspace. In codeiX, **Apply changed files to current project** explicitly copies workspace changes into the editor, with Undo; **Review changed files** remains available.

**Download result ZIP** refreshes the current browser snapshot, including after completion. `project/<app>.json` contains that document; codeiX additionally includes `project/files/` source files. `changes/` contains relay workspace changes. Downloads respect the suite export destination. Missing optional recovery originals or skill revisions produce manifest warnings instead of failing the entire package. Invalid server responses produce an actionable error rather than a corrupt ZIP. Update and restart `server/server.py` when using the new browser bridge endpoints.

### Automatic response repair

Chat (including codeiX) automatically makes up to two repair requests when JSON, proposal identifiers or native document validation fail. Each repair includes the original request and schemas, rejected output and exact validation error. Chat proposals still require review before application. The coding-agent loop supplies explicit repair metadata and retains rejected output in session feedback, including after reload; its existing three-invalid-plan stop remains in place. Repairs use the normal paging transport and Stop control. Transport/provider failures are not retried as response repairs.

A repair never bypasses permissions, stale-edit guards, schema validation or completion evidence checks. Persistent failures remain visible and leave the document unchanged. Questions and valid text answers do not trigger repair merely because they contain no edit. Rejected outputs may contain project data and are retained in the run log/package; review before sharing.

### Conversation and activity tools

Open **Conversation tools** on the Chat tab to search complete messages (including off-page reply text, questions and options) and export Markdown or JSON. JSON retains original structured assistant content; Markdown is a readable transcript with questions, answers, feedback and proposal status. **Copy answer** copies the full answer. Use Ctrl+Enter or Command+Enter to send from the message field; Enter alone keeps a new line. These exports can include project data, so review them before sharing.

On the Coding agent tab, **Focus task** hides supporting workspace tools and session controls; **Show tools** restores them. Permissions and context live in the foldable **Run settings** beneath activity, while start, follow-up, pause and Stop remain beside the goal. Filter activity to actions/results or errors/response repairs, and search the full recorded text, including collapsed output. Long output is expandable. Reading earlier activity no longer forces scrolling to the newest event. All controls remain keyboard accessible.

### Proposal review and task handoff

Native app chat keeps the latest proposal near the composer. **Review latest proposal** opens a comparison of changed top-level fields, with full before/proposed values in expandable sections. The complete document views remain available. **Download proposed document** exports the validated candidate without applying it. **Refine proposal** drafts an editable follow-up. **Dismiss proposal** leaves the current document untouched; **Restore proposal** restores its review availability, subject to the same stale-document checks. A dismissed proposal is excluded from the pending proposal sent to the model. Editor cancellation hooks are respected before application.

The coding-agent checklist shows completed/total and blocked counts, a progress meter, filters for remaining or active/blocked work, and **Export checklist** for a Markdown handoff of all recorded tasks regardless of the current filter. These are recorded agent task statuses, not independent verification.

### Resume conversations and draft follow-ups

**Export JSON** writes a portable `suite-conversation/v1` archive. **Load conversation** in Conversation tools accepts that archive, or earlier suite conversation JSON exports, from local or virtual disk. Files must match the app and contain user/assistant messages with text and optional validated media. Loading replaces chat history while preserving the current document, attachments and unsent draft. Archived proposals, questions and statuses become reference text; loading never applies an edit or reopens an executable proposal. A new model call receives imported-history metadata and the current document as authoritative. Cross-app archives are rejected.

**Undo conversation load** restores the previous chat and queued answers before new messages have been added; it preserves your current unsent draft. Once new exchanges exist, Undo refuses to overwrite them. Export the current conversation before loading another one if you need both histories. Archives are manual files, not automatic browser persistence, and do not bundle attachment files or relay credentials. JSON exports may contain original document context in message content; review before sharing.

Suggested **Next steps** in native app chat have **Use as follow-up** buttons. The coding-agent checklist offers **Draft remaining work**, using only unfinished tasks and preserving your typed instructions. Both prepare editable prompts; neither sends a request nor executes an action automatically.

### Task presets, questions and structured handoffs

Open **Task presets and handoff** in the coding-agent tools. Built-in investigation, implementation, review, refactoring and continuation presets append editable instructions to the goal. **Save goal as preset** stores a named custom preset in this browser, shared across suite apps. A saved preset with the same name is replaced. Export/import saved presets as `suite-agent-presets/v1` JSON from local or virtual disk; imports merge by name and replace matching saved names. Built-ins cannot be deleted. Presets never change run permissions, call a model or execute tools. Saved prompts and exports can contain your task text; edit them before reuse.

An unanswered agent question appears beside the goal even after loading a session. **Draft an answer** preserves your typed instructions and adds the question with an editable answer placeholder. Review it and explicitly send/resume. A recorded follow-up clears the pending question; the existing paused-run behavior remains unchanged.

**Download handoff Markdown/JSON** reads the current session and exports its goal, follow-ups, task statuses, pending question, observation-derived recommendation, command exit results and historical failures. The JSON format is `suite-agent-handoff/v1`. Completion verification statements are labeled model-reported. Failures are historical and may have been resolved; task completion is not independent certification. Exports are point-in-time snapshots and do not stop an active run. They exclude raw source, full command logs and provider configuration; use **Download result ZIP** for full artifacts. Review the current project and evidence before continuing work elsewhere.

### Import and reconcile a handoff

**Import handoff** in Task presets and handoff accepts `suite-agent-handoff/v1` JSON from local or virtual disk. It validates source identifiers, task statuses and unique IDs, command-result types and text fields before changing the reference preview. Invalid imports preserve the previous reference and goal. The preview identifies source and current app/workspace; cross-app handoffs are allowed as historical reference. Loading never switches the workspace, loads the source session, changes permissions, injects observations or applies archived edits.

**Draft continuation from handoff** appends an editable request with normalized historical data to your existing goal. It instructs the agent to inspect the current project, resolve target ambiguity and reverify prior results. Nothing is sent until you explicitly start, resume or send instructions. Unknown fields and executable arguments in imported metadata are discarded. Imported results do not satisfy current-run verification requirements.

**Compare with loaded session** reads its latest recorded tasks and shows added, removed, changed and unchanged task metadata by ID. Matching IDs do not establish that tasks have the same meaning, and comparison never updates tasks or files. **Clear imported reference** removes the preview while preserving your goal draft and current session. References are held in this page until cleared/reloaded; exporting or sending a drafted continuation is an explicit separate action.

### Required acceptance checks for a run

Open **Run acceptance checks** in the coding-agent tools. The JSON editor prepares rules for a **new run**; no rules are enabled by default. **Example: require verify.py** prepares a rule requiring a successful managed script named `verify.py`. The agent must create/read that script and use an allowed interpreter; the example does not grant command permission. Change its name and checks to match your actual verification.

Each rule needs `id`, `title`, `tool` and a nonempty `checks` array. Optional `match` checks select tool **arguments**; result `checks` test the tool's returned JSON. Both use RFC 6901 pointers and `equals`, `contains` or `exists` comparisons, like action checks. For example:

```json
[{
  "id": "verify", "title": "Verification script succeeds", "tool": "run_script",
  "match": [{"path": "/path", "op": "equals", "value": "verify.py"}],
  "checks": [{"path": "/exitCode", "op": "equals", "value": 0},
             {"path": "/timedOut", "op": "equals", "value": false},
             {"path": "/cancelled", "op": "equals", "value": false}],
  "afterEdits": true
}]
```

Rules evaluate the **latest matching recorded observation**. A missing observation is pending, a failed tool/check is failed, and a later recorded file/script/project edit makes an older result stale when `afterEdits` is true (the default). Reverification can pass again. An unrelated command or a model's claim cannot satisfy a specifically matched rule. `afterEdits:false` explicitly allows a prior result to remain eligible across recorded edits. A check compares returned values/pages; it does not prove the command tested the intended requirement, certify an entire file, or detect unobserved external edits. Browser-project results remain browser-reported.

Rules are saved at session creation and stay fixed on resume. Preparing/importing another profile cannot weaken a saved run. Both the client completion review and relay enforce them: a complete outcome is refused while any rule is unmet; partial or blocked outcomes remain available with an explanation. New clients require an updated relay advertising acceptance support before starting a nonempty-rule run.

Profiles export/import as `suite-agent-acceptance/v1` JSON (`format` plus `rules`) via local or virtual disk. Imports prepare the new-run editor only. **Download run acceptance report** reads the saved rules and relay evaluation. Result ZIPs include `acceptance.json`; the audit completion event also records the report. Full rules and derived status are supplied to each agent planning request and retained through context compression. No scripts or expressions are evaluated by these comparisons.

### Inspect workspace changes and export file patches

Each **Workspace changes** entry now offers **Inspect change** in every app's coding-agent tab. These are already-applied workspace edits; review does not defer them. Review shows the current workspace/path and hash, with paged UTF-8 before/after text. **Next page / Previous page** navigate the full content without a total preview-size cap. Binary files are identified rather than decoded as text. Pause an active loop after its current step before inspecting; paused and completed sessions can be reviewed without resuming or enabling edits. Reviewing creates no tool observations, applies no changes and does not satisfy acceptance checks.

The baseline is explicit: an available file-tool recovery copy was captured immediately before the first file-tool edit. Earlier command or external changes may already be in that copy. A newly added file may instead have known initial absence. If no original text is available for a modified/deleted file, the viewer says so and disables patch export. A binary recovery copy has no text preview; Result ZIP contains current changed bytes, not private recovery originals.

**Download file patch** exports a complete unified text patch from the stated baseline to the captured current revision. It honors the suite's Computer/Virtual disk export destination. Empty additions/deletions, quoted Unicode paths and missing final newlines are supported. These are content patches, not a repository-wide diff or a permissions/metadata backup; empty-file patches use regular-file mode 100644. Inspect the baseline and use `git apply --check file.patch` against your intended target before applying. Export never applies the patch.

Current-file and recovery-copy hashes guard subsequent pages and patch downloads. If either changes, the viewer refuses the operation; close it and **Refresh artifacts** to inspect the new revision. This provides consistent captured content, not a lock against later filesystem edits. Update/restart the relay and **Check runtime** if its change-review capability is unavailable. Private paths and symlinks follow the existing workspace boundary.

### Reusable local tools and workflows

Open **Coding agent → Agent tools → Workflows**. This workspace-local library is shared across apps and sessions using the same relay workspace. A single-step workflow acts as a reusable tool; longer workflows chain existing file, managed-script and local-program tools. The agent searches the library each turn, reads applicable revisions before reuse, and is instructed to save useful verified sequences automatically.

Use **New** for an editable example, choose an ID and **Save revision**. Saved revisions are immutable; edits and enabling/disabling create a new revision with optimistic conflict checks. **Find / refresh** lists enabled and disabled entries. JSON import stages a draft; save it explicitly. Export supports the computer or virtual disk. **Draft reuse request** adds a request to the goal field; send/resume to run it. **Inspect session executions** shows actual progress and child call IDs. Library storage is `<agent-workspace>/.suite-agent/workflows.sqlite3`; browser task presets and Markdown local skills remain separate.

Definitions use `suite-tool-workflow/v1` with `name`, `description`, typed `inputs`, and ordered `steps` containing `id`, `tool`, `args`, and optional result `checks`. A whole argument value `{"$input":"file"}` supplies a named input. `{"$step":"read","path":"/text"}` supplies a previous tool result field using an RFC 6901 JSON pointer. Types are preserved; there is no string interpolation or expression evaluation. See **New** for an example passing file text as a literal argument to Python. Adapt `python3` to an executable on the runtime allowlist. For reusable generated scripts, include `write_script` in the workflow before `run_script`; session script storage alone does not make scripts available in another session.

The agent tools are `workflow_list`, `workflow_read`, `workflow_save`, `workflow_run`, `workflow_continue`, `workflow_status`, and `workflow_abandon`. Run requires a revision already read in that session. Each step retains current file/command permissions, executable allowlists, working-directory restrictions, hashes, timeouts, and action/observation audit. Runs pause in batches (default four, maximum sixteen steps per call). New instructions pause before the next step. Nonzero exits, failed checks and cancellation stop execution. Only paused executions can continue; interrupted executions never replay automatically after restart. Abandonment requires a reason and does not undo side effects. Inspect program output pagination before treating a preview as complete.

Result ZIPs include referenced exact workflow revisions in `workflows.json` and execution inputs/results in `workflow-executions.json`. Historical evidence records observed successful sequences; it does not certify different inputs or environments. Avoid storing secrets in definitions or inputs. Restart the updated server to enable this library.

Context compression is enabled with **Aggressive**, **Balanced**, and **Off** modes. It retains workflow status summaries even when older observations are omitted, and keeps the latest workflow definition/status retrieval intact for the next planning turn. Full original observations remain accessible through paged `read_history`; compressed previews are never complete source files.

The workflow manager also offers **Revision history** (paged), **Compare revisions**, **Stage restore**, and **Clone as new tool**. Comparison shows changed JSON paths and before/after values. Restoring stages the selected historical definition against the latest revision; **Save revision** creates a new version and keeps all earlier versions. Concurrent saves still require a refresh when revisions conflict.

**Fill input defaults** preserves values already entered. **Validate & check permissions** checks the draft schema, input types/defaults, edit/command permissions, and static executable names without running steps or changing files. A passing report is not a dry run: dynamic arguments, file paths, expected hashes, installed programs and actual outcomes remain runtime checks. The corresponding agent tools are `workflow_history`, `workflow_compare`, and `workflow_preflight`. Paused execution entries offer **Draft continuation**, which asks the agent to inspect saved results and continue that execution rather than replay completed steps.

Skills, reusable workflows and local tools now live in a separate resizable management window opened from **Agent tools** in the coding-agent header. Its tabs support arrow-key navigation, Escape closes the window, and editing preserves the main chat/run state. Local tools include session working scripts and the allowlisted manual terminal. Workflow reuse drafts close the manager and return focus to the goal field. Workspace change review is in **Agent tools → Files & results**; final apply/merge buttons are highlighted, with the existing validation and Undo behavior unchanged.


### Reliable coding-agent paging and partial recovery

**Recommended** mode now tries the compressed planning request directly, regardless of the shared chat input-size threshold. A provider output-limit response can still switch to paging. **Always page** explicitly uses the paging protocol; **Direct only** disables it. Existing saved choices are retained, so select Recommended if you previously chose Always page or inherited shared settings. Each model/provider still has its own context and output limits.

Paging progress and recovery controls now appear inline below the run status. Repeated protocol failures automatically hand retained text to fresh direct planning and use direct recovery for the remainder of that run. **Use partial reply** does the same manually while paging is active or paused. The partial reply becomes recorded correction input, not an assistant action or an execution observation. The agent must produce a fresh response with current session/step identifiers and pass its normal validation, permissions and completion checks before taking any action. A failed direct repair reports the actual error rather than recursively repaging forever. User Stop takes precedence over takeover.

After stopping incomplete paging, **Use retained partial as follow-up** preserves the text in an editable follow-up draft and selects Recommended mode. It does not execute or resume the agent. Review the draft, then use **Resume / send follow-up**. The current browser session retains partial data and recovery journals; download them before reloading. Journal downloads remain available after the fresh planning call. **Options for next run** opens the coding agent’s own paging controls rather than unrelated shared settings.

Response review accepts one complete agent JSON object with harmless surrounding prose, an outer JSON code fence, or redundant closing delimiters after the object. Parsing preserves quoted text and escapes. Multiple objects, competing actions, extra code blocks and incomplete JSON remain rejected and enter bounded automatic correction. Paged completion uses the same parser as direct planning; identifiers, tool arguments, permissions and completion checks still run afterward. Raw provider replies remain in the response/repair records where applicable.

When a later planning response is accepted, earlier response-review cards are marked **resolved** and their original feedback is collapsed. This describes response acceptance only, not task completion or successful command execution. Unresolved feedback remains visible.


### All coding-agent utilities in Agent tools

Open **Agent tools** in the coding-agent header. The dedicated window contains:

| Tab | Utilities |
| --- | --- |
| Run setup | Runtime check, saved sessions, permissions, context/compression, pause interval, paging settings and acceptance criteria |
| Skills | Discover, edit, version and export reusable skills |
| Workflows | Reusable executable workflows, task presets, remaining-work drafts and handoff import/export |
| Local tools | Working scripts, manual terminal, working memory and command-output inspection |
| Files & results | Changed-file inspection, refresh/review/merge, run log, result ZIP, checklist and request/reply/journal downloads |

The main pane keeps the goal, run controls, questions, progress, live paging recovery and conversation log. A compact summary shows new-run permissions; saved sessions retain their original permissions. Loading a session or drafting instructions returns to the main pane. Final merge remains highlighted inside Files & results. Moving controls does not start work or change permissions.

### Live operation trace

The coding-agent pane shows **Live trace** with the current operation and elapsed
seconds, including provider waits, memory/skill/workflow lookup, tool execution,
recorded-call recovery, pauses and completion persistence. Expand **Operation
history** for timestamps, planning step, tool name, duration and outcome. Follow
latest operation controls scrolling. This is observable execution activity and
public plans; it does not expose private model reasoning or tool arguments.
Trace observer failures cannot interrupt or replay an operation. Failed tool
observations are marked failed even when the transport request succeeds.

Check the operation boundary contract with `node shared-agent/trace-test.cjs`.

The trace also includes runtime synchronization and response-repair persistence.
Filter the history to failures, model requests, or tools/recovery, or download
its operation metadata as JSON. Downloads cover the current in-memory run;
the saved session log remains the durable execution record. Collapsed history
never scrolls the page. Timeouts, cancellation, nonzero exits and failed result
checks are failures even when transport succeeds. Planning requests include
recent failure call IDs and available output job IDs for targeted diagnosis.

### Evidence-based working brief

Each model request includes `workingBrief`, built from recorded events rather
than generated recollections. It tracks the latest 20 touched paths (with the
complete touched-path count), the last command’s actual outcome and whether it
ran after the latest edit, the latest follow-up event, and suggested read-only
inspections for failed command output. Inspection cursors advance only from
matching successful output reads; completed streams disappear and a later
successful command clears older failure suggestions. The brief supplements the
full history and current `changes` result; it never executes tools or proves
that a test covers the user’s requirements.

This supports evidence-based context engineering, just-in-time retrieval,
verification after edits, and diagnosis before retries in the existing ReAct
loop. Existing schema validation, permissions, checkpointed execution, user
steering and completion gates continue to apply. A summary appears above the
activity log; **Agent tools → Files & results → Download working brief** exports
the current ledger. `node shared-agent/brief-test.cjs` covers its contract.

### Choose project takeover review before a run

**Start new agent run** first asks whether project takeovers need human review:

- **Review before applying** validates the proposed document, shows the current
  and proposed documents, and waits for **Apply reviewed changes**, **Reject
  changes**, or **Stop run**. Rejection/Escape leaves the project unchanged.
- **Apply without review** applies through the native editor after its normal
  structural and stale-edit checks.
- **Cancel** keeps the goal and starts no run.

The run’s `reviewProjectEdits` policy persists in its saved session and survives
resume. Reviewed applications recheck the latest instructions, session state and
current document before changing it. Receipt recovery does not replay an applied
edit. Explicit codeiX workspace-file synchronization follows the same policy.
Review mode applies to each takeover into the open project; it does not defer
or undo runtime filesystem edits or command effects. Required structural/schema
checks and acceptance rules are never disabled by this choice.

Restart `server/server.py` and reload the app after upgrading this feature.

### External shared skill catalog

The server's [shared vector catalog](../docs/SHARED-SKILLS.md) supplements learned
workspace skills. **Agent tools → Skills → Skill set** edits the app-specific
selected set. The relay supplies relevant excerpts automatically; the agent can
use `catalog_search`, `catalog_read` and `catalog_fetch` for further retrieval.
Documents retain source URLs and content hashes. They are untrusted reference
data and cannot change run permissions or project takeover review requirements.

### Missing archived app context

A missing context snapshot now produces `context_snapshot_missing` with a recovery instruction rather than a raw filesystem error. The browser re-uploads retained bytes only for that exact snapshot, then automatically retries the read-only `read_context` call once under a fresh call ID. The real retry result drives the cycle state, so a recovered read leaves Adapt. If its HTTP response is lost, the recorded retry is reconciled without replaying it. Historical/foreign hashes are never silently replaced with the latest document. If the original is unavailable, the cycle exposes **Refresh current context & resume**. Stop the active run first, then use this action to archive the current editor and resume with explicit follow-up guidance. It requires the matching app and a run with app-context access enabled. Historical hashes remain missing; the action never replaces their contents. Agents can also use `read_current_project` and replan against its returned snapshot. Update and restart the server and reload the app to enable this recovery. No mutation tools are replayed.

The coding agent pauses every **500 planning steps** by default and waits for **Continue steps**. Change **Pause every** to a value from 1 to 500 for shorter review intervals. Completion, questions, errors and manual stops can end or pause a run earlier. This interval is separate from request/result paging and local tool workflow batch sizes.

**Browse intermediate files** opens a separate read-only window for the loaded session. Browse server workspace files or session working scripts, filter by path, load more file listings, and page through UTF-8 text. Refresh manually or enable five-second refresh. The viewer works during a run and after it stops without executing agent tools or adding model observations. File contents are live reads, not an atomic snapshot; a changed hash between pages requires refreshing from the beginning. Binary files are not previewed. Unsaved app-only edits remain in the app. Restart the server after upgrading to enable workspace file listing.

Enable **Convert input to ASD-STE100 style** below the goal for an optional AI-assisted rewrite before starting, resuming with new instructions, or sending live follow-ups. The original remains authoritative; protected technical text must remain unchanged. See [input conversion](../shared-ai/INPUT-STE.md) for scope, persistence, additional provider calls and compliance limits.

## Recover rejected planning responses

A response must echo the **current** `sessionId` and numeric `step` exactly. The model now receives those values as per-turn JSON Schema `const` fields in both the request and system contract. Repair requests repeat the current values and warn against copying an earlier reply's identifiers. Every retry reserves a fresh runtime step, so a repair's step normally differs from the rejected reply's step. A string such as `"12"` is not the number `12`.

After three invalid replies, the agent pauses and shows **Agent response needs attention**, rather than leaving only an error message. The panel displays expected/received identifiers and their JSON types. It offers:

| Option | Result |
| --- | --- |
| **Retry from saved state** | Resume the same session, synchronize history/current app context, reserve a new turn and request a new plan. Existing run permissions and completion requirements stay in force. |
| **Retry without paging** | Do the same with direct provider requests for this resumed run. This can help when a paged reply repeats an older response; it does not increase the provider's context window or guarantee a valid answer. It leaves the saved paging preference unchanged. |
| **Add guidance** | Focus the follow-up editor with suggested identifier guidance when the field is empty. Edit it, then use Resume / send follow-up to submit it. |
| **Prepare a fresh run** | Populate an empty goal field from the original goal. Review the goal, workspace changes and permissions, then explicitly start a new run. The old session and existing file changes remain. |
| **Inspect rejected reply and diagnostics** | Read the exact rejected reply, expected/received identifiers and the original error; optionally download diagnostics. This does not apply or execute the reply. |
| **Check AI provider settings** | Open the relay's provider UI to inspect configuration or select a provider/model with better structured-output behavior. |

Retry buttons preserve any unsent draft instead of silently submitting it. Recovery options also appear when loading a saved session with an unresolved rejected reply. A subsequently accepted plan clears the panel; the original feedback remains in the audit log.

No recovery option rewrites a mismatched identifier to execute an old reply, and rejected actions are never replayed. Earlier **accepted** actions may already have changed files; a protocol pause does not undo them. Review file changes before starting over. Diagnostics can contain project/context data and model output, so review them before sharing. A provider that repeatedly ignores the structured contract may still need a configuration/model change or more precise instructions.

## Multimodal reference files and output

The goal editor accepts image/audio/PDF/text references and offers a response modality selector. Input files persist in the saved run and are sent as native provider parts. Output media is retained in the activity log and can be downloaded, saved to the virtual disk, or explicitly reused. A media-only reply pauses without executing tools; choose Text / structured edits and resume. See the [multimodal guide](../shared-ai/MULTIMODAL.md).

### Inspect files during a run

Choose **Inspect run files** in the coding-agent header to open a separate read-only dialog. It works while an agent tool or command is running and keeps the selected run fixed until you reopen it for another run.

- Browse **Added**, **Changed** and **Removed** workspace files, filter by path/status, and see totals. These are net differences from the session's initial manifest, including command and external edits; a file restored to its initial contents disappears from the list. Managed working scripts still have their separate intermediate-file browser.
- Live refresh polls every five seconds. Turn it off for manual snapshots. Updated selected files return to their first content page; unchanged selections retain their page. Read races show a refresh message rather than mixing revisions.
- Inspect paged before/after content or a unified diff and download a file patch. Recovery copies are captured before the first file-tool edit, so earlier command edits may already be in them. Command-only changes can lack original text; binary/unavailable baselines are labeled and have no text patch. Live patches for files above 2 MB are omitted; paged content and result ZIP remain available.
- Inspection never applies a proposal, executes a tool, pauses the run, or restores/deletes files. Browser-only app edits/proposals are separate and remain in their native editor/takeover review. Closing the dialog cancels inspection requests and polling, not the agent.

The read-only `inspect_preview` and `inspect_patch` operations preserve current-file and recovery-copy hash guards while allowing active-tool inspection. Existing paused change-review operations retain their active-tool guard. Restart the server after updating to enable the new operations.

Checks: `python3 -m unittest server.agent_review_test` and `node shared-agent/inspect-browser-test.cjs`. The browser check runs a real temporary local command while inspecting changes, and verifies filters, pagination, diff export, stale-read recovery, deletion/binary states and mobile layout.
