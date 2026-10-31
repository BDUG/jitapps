# codingagentlib · Native VS Code extension

A standalone VS Code coding agent built on [codingagentlib's native Rust runtime](../rust/README.md). It runs without Python, Node tool installations, the suite desktop or a relay server. VS Code's extension host provides JavaScript execution; the platform-specific native worker is bundled in the VSIX. Model requests go directly to an OpenAI-compatible chat-completions provider, or optionally to an existing suite relay.

## Build and install

Prerequisites for building from source: Node.js 22+, npm and a stable Rust/Cargo toolchain. Use the platform/architecture of the VS Code extension host. A remote SSH/container workspace runs the extension on the remote host, which needs its matching package.

```sh
cd codingagentlib/vscode
npm ci
npm run verify
npm run package -- --target linux-x64
code --install-extension codingagentlib-linux-x64-0.26.0.vsix
```

On Windows x64 use `--target win32-x64`; on macOS use `darwin-arm64` or `darwin-x64`. Build on the corresponding OS/architecture; the build script compiles and copies the host worker. This is not an automatic cross-compilation pipeline. Set `CARGO` to an absolute Cargo executable if it is not on PATH. No Rust compiler is needed to run an installed VSIX. Packages are local artifacts; the build does not publish to the Marketplace. The `bdug` publisher identifier is metadata, not a claim of Marketplace publication.

Alternatively choose **Extensions → … → Install from VSIX**. To debug from source, build the worker then launch VS Code with `code --extensionDevelopmentPath=/absolute/path/to/codingagentlib/vscode /absolute/workspace`.

## Use

1. Open and trust a filesystem workspace. For multi-root workspaces, select the root when prompted. Virtual filesystem workspaces and browser-only VS Code are unsupported.
2. Run **Coding Agent: Configure Model Provider**. Select **OpenAI-compatible provider**, enter its HTTPS chat-completions endpoint, model and API key. The key is stored in VS Code SecretStorage, separately for each provider origin. A blank key preserves a stored key; an unauthenticated local endpoint may use no key. Loopback HTTP is supported. Optional **Existing suite relay** uses its `/api/chat` endpoint and provider configuration.
3. Open **Coding Agent: Open Chat**, or select the status-bar **Coding Agent** button. Describe a goal. Edits and commands are disabled by default. To allow commands, first configure `codingagent.allowedCommands` with the exact executable names/paths you trust, then check **Allow commands**.
4. Choose **Start new run**. Review the workspace, edit permission and actual executable allowlist in VS Code's confirmation dialog. Nothing is sent to the model or edited until you approve. Save dirty files before proceeding. File-tool edits apply directly to disk after approval, and the agent observes the actual result before planning again.
5. Watch the plans, observations and foldable live trace. Questions pause the run; enter your answer and choose **Resume / send follow-up**. Runs pause after 500 steps by default, configurable to 1–500. **Stop** aborts provider requests and signals the native worker even during a command. Approval is requested again on resume, with the saved session's permissions.
6. Select a changed file for its file-tool recovery comparison. Commands/external edits without recovery images show a captured current-file snapshot with a notice; a fabricated baseline is not shown. Review the changes with your normal VS Code/Git tools.
7. Use **Export result ZIP** for files, scripts, observed evidence and logs, including after completion. **Saved sessions** loads a run from private workspace storage. Paused runs can resume after VS Code restarts; completed runs require a new run.

The extension checks Workspace Trust and uses the native executable allowlist and per-session permissions. Commands execute with the extension host account's OS permissions; the allowlist is not an OS sandbox. File tools reject traversal, symlink paths and private runtime directories. Unsaved edits in open workspace documents pause model actions so they can be saved before retrying; external processes can still modify files. Use Git/backups for recovery, especially for command side effects.

## Settings and storage

| Setting | Default | Purpose |
| --- | --- | --- |
| `codingagent.endpoint` | `https://api.openai.com/v1/chat/completions` | Full direct model URL, or relay `/api/chat`. Redirects and credentials in URLs are rejected. |
| `codingagent.model` | `gpt-4.1` | Model/deployment for OpenAI-compatible transport. |
| `codingagent.transport` | `openai` | `openai` or `relay`. No provider SDK or suite server is required for direct mode. |
| `codingagent.allowedCommands` | `[]` | Trusted executable names/paths, separate from per-run command approval. |
| `codingagent.maxSteps` | `500` | Pause interval, 1–500 planning steps. |
| `codingagent.includeDiagnostics` | `true` | Include fresh workspace diagnostics and editor metadata after run/resume approval. Changes apply on the next run/resume. |
| `codingagent.diagnosticsLimit` | `80` | Maximum diagnostics per turn, 1–200. Errors first; omission counts reported. |
| `codingagent.requestTimeoutSeconds` | `180` | Total model timeout per planning turn, including retry waits, 5–1800 seconds. |
| `codingagent.verificationCommands` | `[]` | Exact commands whose fresh successful native receipts are required for complete. Reviewed at run/resume approval. |
| `codingagent.compactHistory` | `true` | Select a retrievable model-history view while preserving the native audit. |
| `codingagent.historyBudgetCharacters` | `80000` | Soft history JSON-character budget, 8,000–500,000; preserved records may exceed it. |
| `codingagent.maxModelRetries` | `2` | Additional temporary-failure model attempts, 0–3; never tool retries. |

Provider and executable settings use VS Code's machine setting scope. The setup wizard saves provider settings to global settings; API keys stay in SecretStorage, never in the webview, workspace settings, logs or model prompt. The extension does not set an artificial output-token limit; truncated provider output is rejected before execution. Direct authentication currently uses a Bearer key and the chat-completions JSON API. Provider-specific OAuth, Azure `api-key` authentication, images, native provider tool-call protocols and streaming are not implemented.

Native sessions, scripts, recovery files, skills/workflows and tool receipts live in `<workspace>/.codingagentlib-rust/`. The directory is locked while the worker is open; another native agent cannot open that same workspace concurrently. State is local and separate from the Python runtime. Closing the chat panel leaves a running task active; **Stop** ends it, and deactivating the extension interrupts and closes its worker. A bounded panel trace is retained for display; original events remain in native sessions and ZIPs.

## Implementation and checks

- `src/extension.cjs`: VS Code commands, trust, permissions, SecretStorage, provider setup, comparisons and exports.
- `src/controller.cjs`: multi-turn model/act/observe driver, budgets, follow-ups and cancellation.
- `src/worker.cjs`: request-ID checked native subprocess transport, with out-of-band interruption.
- `media/`: theme-aware webview, nonce/CSP, text-only rendering of untrusted output; no credentials or Node integration in the panel.
- `../rust/src/bin/codingagent-worker.rs`: standalone JSON-lines bridge over the native Rust library. Worker methods `package` and `changes` inspect paused/completed sessions without changing their status.

`npm run verify` builds the release worker and runs provider tests, a mocked VS Code host test with real native execution, file permissions/step budgets, invalid-plan repair, question/resume, completed-result ZIP export and interruption of a real command. No paid model calls are made. `npm run package -- --target linux-x64` creates an installable host-specific VSIX. Actual VS Code desktop host/platform testing remains necessary; these automated tests simulate the VS Code API rather than launching an Electron Extension Development Host.

The extension uses the [native Rust tool set and limits](../rust/README.md#native-capabilities). Advanced Python/browser features are not silently substituted or advertised. The suite's browser applications and Python server remain independent of this extension.

## Version 0.2 workspace workflow

- In Explorer, right-click one or more files and choose **Coding Agent: Attach Workspace Files**. Or select text in an editor and use **Attach Editor Selection**. The panel shows removable references with their names and character counts. File references are UTF-8 snapshots with a SHA-256 digest; selections include source line ranges. They enter native session history only after run approval. The model is instructed to treat them as reference data and reread actual files before edits.
- Native session records keep approved reference snapshots, including their contents; transcript/ZIP exports can contain them. Pending references are held only in extension memory. Private state directories, `.git`, `.env*`, binary files and symlink escapes are rejected. Files are limited to 8 MB and combined references to the native transport's 12 MB input budget; attach shorter selections when needed. There is no fixed reference-count limit.
- Valid model task lists appear as a live checklist with pending, in-progress, blocked and completed states. Completed sessions disable Resume; start a new run for a new task.
- **Saved sessions** restores recent public plans, observations, questions and task progress. The most recently used session ID is remembered per workspace; reopening never automatically executes it. Run approval is required again to resume.
- **Review Workspace Changes** refreshes the change list. Filter by path or added/modified/deleted status, then select a file for its recovery comparison. **Export Run Transcript** saves the complete native session JSON independently from the result ZIP.
- **Remove Stored Provider Key** removes the current endpoint origin's credential from SecretStorage after confirmation.

The native worker and existing permissions remain authoritative. References do not expand filesystem or executable permissions. Workspace Trust, dirty-editor checks, immutable tool receipts and explicit run/resume approval apply to these additions as well.

## Version 0.3 editor-aware planning

Each approved planning turn refreshes `ideContext` from VS Code's current diagnostics, active editor/selection location and open-file metadata. Paths and locations are relative to the selected workspace and 1-based; open files include document version, language and unsaved status. Buffer contents and selected text are not collected automatically: use Attach Editor Selection for an explicit snapshot.

The start/resume confirmation shows whether diagnostics are included. Disable `codingagent.includeDiagnostics` in VS Code settings to omit the entire context; the choice is fixed for that approved run. **Editor problems** or **Coding Agent: Show Editor Problems** opens the native Problems view. The chat panel reports included/total diagnostics, errors, warnings and omissions.

Errors are prioritized before warnings, information and hints, then the active file and stable file locations. Up to 80 diagnostics (configurable to 200), 20,000 serialized diagnostic characters and 30 open-file metadata entries are included. Individual messages are capped at 1,200 characters with `messageTruncated`; omitted diagnostics/open-file counts and coverage are explicit. Private state, `.git`, `.env*`, dependency/cache directories, non-file URIs, unresolved paths and symlinks outside the root are excluded. Diagnostics can themselves quote source text; review the inclusion choice before approving a run.

Language servers may still be computing, and diagnostics do not cover every file or prove tests passed. They remain untrusted reference data, cannot add tool permissions and are not inserted as verified tool observations. Dirty-file checks still prevent actions over unsaved workspace edits. The model must reread current source and verify its changes with real tools. Context is refreshed for provider requests, not stored as a new native session event each turn; panel telemetry logs counts, not diagnostic messages. Native session/transcript exports therefore do not reproduce these transient IDE context snapshots.

Automated checks cover refreshed versions/messages, workspace/private/symlink boundaries, budgets, disabled context, cancellation during collection and the mocked VS Code host using the real native worker. They do not substitute for testing language servers in an actual VS Code desktop host.

## Version 0.4 live change review

The panel refreshes its changed-file snapshot after observed file mutations and commands, including failed commands that may have produced side effects. It clears the previous run's list when a new session starts, reports capture time and included/total counts, and refreshes again when the run stops. Native inspection currently returns up to 1,000 changes; the panel explicitly reports when more exist. Use Git or native change tools for the full workspace beyond that view. Refreshing scans the current workspace manifest and can add overhead in large projects.

Manual refresh and opening comparisons require the agent to be stopped. A comparison captures both sides as read-only VS Code text documents. Added files compare against empty text, deleted files against an empty current snapshot, and modified files against their verified recovery copy. Disk changes after opening do not silently alter the captured comparison. Unsaved buffers are not substituted for disk contents. Capture is per file, not an atomic snapshot across multiple files.

Recovery metadata must match the file path and initial manifest when available; retained bytes must match their SHA-256. Missing, damaged, mismatched or symlinked recovery files are reported rather than inventing an original. Without a usable original, an existing current file opens as a captured snapshot; a deleted file gets an explicit unavailable-original notice. Binary, invalid UTF-8, private paths and files above 8 MB cannot be compared through this text viewer. Snapshot documents share a 32 MB in-memory budget; close older comparison documents to release their stored text. These copies are not persisted as project files.

Review refresh errors appear as informational feedback and never replay an accepted edit or command. Native tool results and completion checks stay authoritative. Automated tests use a mocked VS Code host with the real native worker, plus filesystem cases for additions/deletions, corrupt backups, symlinks, binary text rejection and stable captured versions. Actual desktop-host testing remains necessary.

## Version 0.5 pause and follow-up drafts

**Pause** or **Coding Agent: Pause After Current Action** asks the controller to stop at a safe planning/action boundary. An already submitted native action finishes and its observation is retained; no next action starts. A model reply still being prepared is discarded before submission. The saved session can be resumed with a fresh turn and optional follow-up, with the usual approval dialog. Pause waits for an active model request to return (or time out); use **Stop** to abort it or interrupt an active command. Completion already accepted by the runtime remains complete. Neither pause nor interruption rolls back effects.

The composer remains editable during a run so you can prepare the next instruction. It is never sent automatically: pause, inspect the result, then choose Resume / send follow-up. Unsent draft text persists in VS Code webview state and extension workspace state under a workspace-root hash and is restored after panel reload or reopening. In a multi-root workspace, select a root before drafts can be saved. Drafts are local editor state, not encrypted SecretStorage; delete the composer text to clear that workspace's saved draft. They are not added to native session history or model requests until submitted and approved. Permission checkboxes are not restored from draft state.

Replaying historical chat no longer erases a draft. Approval clears only the unchanged text actually submitted; a newer follow-up typed while approval is pending stays in the composer. Run preparation disables duplicate submissions. Tests cover these webview-state behaviors, pause before submission, an actual native command finishing without replay on resume, and Stop overriding a requested pause.

## Version 0.6 bounded provider recovery

Temporary connection failures, HTTP 408/429/500/502/503/504, unreadable provider JSON envelopes and empty text responses can retry the **model request only**. Default: two additional attempts, controlled by `codingagent.maxModelRetries` (0 disables retries; maximum 3). Each retry uses the same reserved session/step request and unchanged context; no response is submitted to native tools until a model call succeeds. Retry telemetry shows attempt/total, wait, error classification and HTTP status, without credentials or raw provider error bodies. Extra provider calls may incur cost.

Backoff uses exponential delays with jitter, respecting longer numeric or HTTP-date Retry-After values. A server-requested wait above 30 seconds pauses with guidance to resume later rather than retrying early. The configured model timeout covers the entire turn's attempts and waits. Authentication/access errors, wrong endpoints, oversized requests and truncated output require correction instead of automatic retries. Invalid plan JSON still uses the native bounded repair path; retries do not execute fragments, rewrite identity fields or weaken native validation.

Pause prevents a further attempt once the current request/wait returns; Stop aborts waits and active model transport. Transport cancellation returns a paused/cancelled result instead of surfacing as a fresh run error. Exhausted or permanent failures preserve the native session for explicit Resume after diagnosis. This mechanism never replays agent_submit, file edits or commands. A completed action remains recorded even if a later model call fails.

Checks use simulated provider failures and the real native worker: identical request retries, Retry-After handling, privacy of telemetry, exhausted/permanent failures, pause/cancellation, visible status and a file edited exactly once across failures in multiple planning turns. No live paid provider evaluation or desktop VS Code validation is implied.

## Version 0.7 model usage and timing

The panel shows model attempts, failed attempts, retries, request time, and reported input/output tokens for the current run segment. Counts reset on Start, Resume and saved-session selection; they are not a persisted billing ledger. Model-attempt events in the live trace include per-attempt latency, recognized usage fields and a safe error classification. Provider retry wait time appears separately in retry events and is excluded from request duration.

Usage accepts numeric OpenAI-compatible prompt/completion or input/output token fields. Missing or invalid counts remain unknown, with per-field reporting coverage shown instead of assuming zero. When both input and output counts are known, a missing total is derived and marked totalDerived in the trace. Cached-input and reasoning counts are separate details already included in provider totals, never added again. Tokens reported on truncated or otherwise unusable replies are retained because generation may still have consumed usage. HTTP errors with no readable usage remain unreported.

Telemetry contains no credentials, request text, response text or arbitrary provider metadata. No price or currency is estimated. A model attempt succeeding does not mean its plan, tools or task passed validation. Telemetry observers cannot fail or retry a model request. Tests cover partial/zero/invalid usage, trace privacy, truncated responses, observer failure, panel coverage display and aggregation through the mocked VS Code host with real native execution.

## Version 0.8 selected problems to task drafts

Choose **Draft task from problems** in the panel or **Coding Agent: Draft Task From Editor Problems** in the command palette. Select one or more current workspace diagnostics in VS Code's multi-select picker. The extension appends a focused investigation/fix request to the existing composer, including selected paths, 1-based locations, source/code and document versions when available. It does not read source buffers, invoke the model, run tools, change permissions or start a run. Review the draft, then explicitly choose Start or Resume with the normal approval.

You can prepare the draft while the agent works, then Pause and review before resuming. Existing text is preserved and queued additions are acknowledged once, including panel reloads; workspace identity prevents applying them to a different root. The host retains queued text until the composer draft is saved. Cancelling the picker adds nothing.

This explicit selection works independently of automatic includeDiagnostics: disabling that setting does not disable a diagnostic task you intentionally select and submit. The collector applies the same private-path, symlink and dependency exclusions. Up to 200 diagnostics within the existing 20,000-character diagnostic budget are offered, with included/total counts visible in the picker. Selected messages remain untrusted snapshots and may be stale or truncated. The agent must reread current source and verify its edits. Native Problems view remains available for the full editor collection.

Automated checks cover selected/unselected data, duplicate selections, invalid indices, draft preservation, reload deduplication, root separation and the command/panel handoff without automatic model execution. Actual VS Code desktop validation remains pending.

## Version 0.9 task progress and handoff

The task panel summarizes completed, unfinished and blocked work and filters by status. Optional dependency labels and blocker notes appear beside each task. Missing prerequisite IDs, cycles and tasks marked active/done with unresolved prerequisites produce advisory warnings. These labels and statuses remain agent-supplied metadata: this UI does not enforce a scheduling graph, change permissions or certify execution. Native completion and verification checks remain authoritative.

**Draft unfinished work** appends non-completed tasks, dependencies, notes and plan warnings to the current composer. It preserves existing text, saves the unsent draft and never runs or submits it automatically. Review the current workspace and actual receipts before resuming. Accepted task lists restore from session history on load/resume even when the next model reply omits tasks, and authoritative host state restores the board after panel reload.

**Export task report** or **Coding Agent: Export Accepted Task Report** writes a Markdown checklist from the native session's latest accepted task list, not arbitrary webview data. Pause a running agent before exporting. The report contains task status/dependencies and advisory warnings, not full source snapshots or test evidence. Tests cover native report export, prerequisite warnings, immutable filters, unsent drafts and restoring previous tasks.

## Version 0.10 retrievable history views

Long sessions can send a smaller selected event view to the model while retaining the complete append-only native audit. `codingagent.compactHistory` enables this by default, with `codingagent.historyBudgetCharacters` set to 80,000. Short histories pass through in full. Hosts without read_history retain full history rather than hiding records the agent cannot retrieve.

The selected view preserves all user follow-up instructions, the latest user event, latest accepted task list, unresolved repair and most recent read_history reply. It then fills available budget with events from the newest 24-event window. The original goal, tools, permissions, instructions, current session ID/step and response schema stay unchanged. No source text or tool receipt is silently edited into a fabricated full observation.

A historyView supplies original event offsets for retained records and contiguous ranges for omitted records. Its small ledger points to actual latest edit/command/failure receipts and literal read_history offset/limit arguments. These are retrieval references, not automatic tool calls or verification claims. The agent should retrieve omitted originals when needed and reread current source before editing.

The panel reports retained/original event and character counts, mode and soft-budget overflow. The budget applies to event JSON characters, not model tokens, entire request size or provider capacity. Preserved records can exceed it, especially large reference attachments or history-read replies; keeping a retrieved reply whole avoids repeatedly discarding the very evidence requested. Request metadata, schemas, IDE context and historyView overhead are outside this budget. Provider context-limit errors may still require smaller explicit attachments/history pages or other user changes. Disabling compaction restores full-history requests.

Native audit, transcript export, result ZIPs, file hashes and completion gates are unchanged. No extra summarizer/model call is introduced. Tests cover exact offset coverage, immutable source histories, preserved user constraints/plans, missing retrieval fallback and a real native session retrieving an omitted attachment without losing its reply on the next turn. Actual model quality and desktop-host behavior still need evaluation.

## Version 0.11 no-progress recovery

The VS Code controller derives loopReview from the full native history before the provider's selected history view is built. It matches observations to accepted assistant actions by exact session/step call IDs and tool names, ignores duplicate/unrelated receipts and examines the latest 24 matched top-level actions since the newest user follow-up.

Before submitting another action, the controller pauses if the same executable action (tool, canonical arguments and declared checks) failed three times without a matching success or a recorded successful file/script edit. Changing error text does not evade that budget. It also detects one- through four-action cycles repeated three times with unchanged returned results. Public plan wording, task labels and command job IDs do not establish progress; changed actual output or source values do.

The guard runs only for candidate actions with current request identity and an advertised tool. Native schema, permission, revision and completion validation still apply; the guard does not repair identifiers or execute rejected replies. A guarded turn returns paused/no_progress before agent_submit and cancels the reserved native turn, keeping prior receipts for explicit Resume. No fourth tool replay or automatic rollback occurs.

A visible recovery panel offers **Draft a recovery request**. It appends receipt references and an investigation prompt to your existing draft without sending it or altering permissions. New follow-up text resets this bounded history boundary; resuming without guidance may pause again if the model proposes the same blocked action. A changed approach remains possible.

This is a heuristic over recorded top-level actions, not proof of a permanent failure or a guarantee against every loop. External edits without recorded tool receipts do not reset it automatically, longer cycles can escape detection, and repeated legitimate polling may need a different approach or explicit follow-up. Direct Rust clients retain their own controllers; this guard belongs to the VS Code JavaScript controller. Tests include a real native pause/resume session, exact receipt matching, changed results/errors, cycles, failed checks and unsent recovery drafting. Desktop-host and live-model evaluation remain pending.

## Version 0.12 configured verification checks

Define project checks in user settings. Example:

```json
{
  "codingagent.allowedCommands": ["npm"],
  "codingagent.verificationCommands": [
    {"name": "Tests", "command": "npm", "args": ["test"], "cwd": ".", "timeout": 120000},
    {"name": "Lint", "command": "npm", "args": ["run", "lint"], "timeout": 60000}
  ]
}
```

The exact normalized definitions appear in run/resume approval and are fixed for that run. Profiles do not enable commands or add allowlisted executables: check Allow commands when starting a new session and approve the actual allowlist. A saved read-only session cannot gain command permission through Resume; start a new run if needed. The agent receives the current required checks and their missing/failed/passed status, with suggested literal run_command arguments. Commands are not run automatically by the extension. A root cwd is omitted from the generated native action; other directories use normalized workspace-relative paths.

The VS Code controller requires matching native receipts for complete: same executable, argv and normalized cwd, exit zero, no timeout/cancellation, and no failed declared checks. A later matching failure replaces an earlier pass. A successful recorded file/script edit or new user follow-up invalidates earlier passes. Unknown IDs, duplicates, unrelated trivial commands and model-written summaries do not satisfy a check. Timeout is an execution budget rather than a separate command identity. Identical command definitions can share the same matching receipt.

If a valid complete reply arrives before all checks pass, the controller pauses before submitting completion. The panel lists blockers and offers an unsent verification draft. Resume after reviewing, or report an honest partial/blocked result when checks cannot run. Empty configuration preserves existing behavior. Policy snapshots enter native session history after approval; command arguments can therefore appear in transcript/ZIP exports. Model-visible reports cannot mutate the controller's private completion ledger.

This gate belongs to the VS Code JavaScript controller; direct native Rust clients retain their existing completion behavior. Native permissions, file hashes, failed-check and unfinished-task gates still apply. Freshness tracks recorded edits/instructions, not arbitrary external or command-side file changes; a zero exit is not proof of adequate test coverage or correctness. Select meaningful checks and review their results. Automated checks include actual native pause/check/resume, exact matching and freshness, stale/duplicate receipts, model metadata mutation, configuration validation and unsent recovery drafting. Desktop and live-model evaluation remain pending.

## Version 0.13 retained command output inspector

Choose **Inspect command output** in the panel or **Coding Agent: Inspect Retained Command Output** in the command palette. Pause an active run first. Choose a recorded command/script job and stdout or stderr, then use First/Previous/Next page. The job picker shows step when available, exit status, cancellation, timeout and output-limit flags. The inspector displays one 12,000-character page at a time; it never reruns a command or resumes a session.

Next uses the native nextOffset. Previous moves back by the fixed page size; switching jobs/streams starts at zero. Offsets count Unicode characters in decoded output, not bytes or JavaScript UTF-16 units. Invalid UTF-8 follows the native replacement-character decoding policy. Raw pages render as text and are not appended to the live trace or model request. They remain in panel memory while inspected and can be reopened from retained native logs.

The native read-only output method works for paused/completed sessions without adding tool receipts or changing status, step, pending turns or verification state. Human inspection is not agent verification. Only recorded jobs in the selected session can be read; unknown/cross-session IDs, invalid streams/cursors and symlinked/nonregular log files are rejected. Existing native limits remain: 8 MB retrieval per log and 32,000 characters per API page (the panel uses 12,000). Output-limit flags and missing/corrupt log errors remain visible; no unavailable text is fabricated.

Checks cover actual native Unicode/multipage stdout/stderr, paused/completed reads, unchanged session records, no command replay, cross-session and symlink rejection, inert panel text, cursor forwarding and the mocked VS Code host command path. Native Rust regressions also pass. Actual Electron/VS Code desktop validation remains pending.

## Version 0.14 session overview and handoff

Saved sessions now show native step counts, known unfinished tasks and historical failure-receipt counts, with searchable status/ID details. The currently selected session is prioritized, followed by unfinished sessions. Native sessions contain no timestamps, so the picker does not invent creation dates or sort by assumed recency.

**Session overview & handoff** refreshes after a run ends or a saved session is selected. It can also be opened through **Coding Agent: Show Session Overview**. The collapsed panel shows a deterministic snapshot of the source goal/status, recorded command/file-tool activity, last accepted task plan, recent failure references and archived verification state. Unknown/missing plans remain unknown. Old failures remain explicitly historical even when a later matching check passed. Archived verification uses the last saved approved policy, not current user settings. Paths come from file-tool receipts and do not cover every possible command/external edit.

**Draft session handoff** appends an unsent snapshot to the existing composer through the acknowledged workspace-scoped draft queue. **Export handoff Markdown** saves the same snapshot for review or transfer. Both have command-palette entries. Pause the run before manual inspection/export; creating a handoff does not resume, execute commands, alter permissions or call a model. Goal, task, question and completion-summary text may contain user/agent-provided content; no tool-output bodies, attachment bodies or command argv are copied automatically.

A resumed source session retains its full audit. A new run receives only the handoff snapshot: read_history cannot retrieve another session, and historical receipt IDs are provenance references. Review current source and current approved checks, and attach an exported source transcript if its full evidence is needed. Plan statuses and past model summaries are not verification. Completed sessions require a new run.

The overview is held in extension memory and regenerated from native history, rather than storing another source-of-truth document. Automatic overview refresh failures are advisory and do not change accepted native results. Session selection rechecks the workspace/run after the picker returns. Tests cover historical/current distinctions, privacy of copied fields, unanswered questions, corrupt/missing plan metadata, picker ordering, plain-text rendering, draft preservation and actual native host handoff/export without model calls. Desktop/live-model validation remains pending.

## Version 0.15 actionable provider recovery

After an exhausted or nonretryable model-provider failure, a recovery card offers provider setup, retry/timeout/context settings, unsent recovery notes and a diagnostic JSON export. Categories cover access rejection, rate/quota limits, connectivity/TLS, context size, truncated output, empty/unreadable envelopes and service/HTTP failures. Guidance is static, code-based advice, not an inferred root-cause diagnosis. Ordinary native/configuration errors retain their normal error path.

No recovery action automatically resumes, repeats a tool, changes permissions, weakens configured verification or applies partial text. Earlier accepted workspace effects remain. Resolve provider access/settings before explicitly resuming; recovery notes append to your existing draft and remain unsent. The card clears on a new run/session selection or Dismiss. Dismissal remains authoritative when old trace events replay.

**Export diagnostic report** or **Coding Agent: Export Provider Recovery Report** saves a whitelisted snapshot: safe error category/status/requested wait, source native session ID, current-run attempt counters and history-budget counts. Counters include earlier steps in the run, not just the failed request. The export excludes credentials, endpoint URLs, model prompts/replies, raw provider bodies, raw exception messages and command arguments. Review before sharing; this minimal report does not replace provider logs or native transcripts.

Recovery state lives in extension memory; reopening the panel during that extension lifetime restores it, while extension restart/dismissal/new sessions can clear it. Export first if it must be retained. Export captures its report before the file dialog so later state changes do not alter the selected diagnostic. Tests cover category guidance, unknown/malformed metadata, report privacy and independent advice copies, the host's actual failure/export/settings/dismiss path, unsent notes and replay-safe dismissal. Native results remain authoritative; desktop/live-provider validation remains pending.


## Version 0.16 terminal action review

Set `codingagent.commandReview` to `per-action` to review each proposed `run_command` or `run_script` before execution. The default, `run`, retains run-level approval. Start and resume confirmations show the chosen mode; changes take effect on the next approved run.

The modal shows the workspace, literal arguments, checks and an action fingerprint. **Run action** approves that exact proposal; closing the dialog declines it. **Preview & pause** opens the complete proposal as a read-only document and pauses without executing it. Proposals longer than 6,000 characters require this full preview before approval becomes available. Preview recognition lasts for the same session in the current extension controller; changed arguments require a new preview. Snapshot storage uses the existing 32 MB aggregate limit.

After a pause, explicitly resume to request a fresh plan with current turn identifiers. A preview proposal is recorded as untrusted reference data in session history and exports, including its arguments and checks. Declines retain the tool, fingerprint and reason, without copying proposal arguments. The model can change its proposal, which then requires its own approval. Stop or Pause while the modal is open prevents a late approval from executing; dismiss the modal to let the waiting run finish.

Pinned workflow execution pauses in this mode: ask the agent to propose individual command/script steps so batch execution cannot bypass review. Native permissions, executable allowlists and argument validation still apply. Reviewing arguments does not review the contents of a managed script or invoked executable, grant new permissions, provide an OS sandbox or roll back earlier actions.

The native host-only `agent_review` operation records a decision against the current reserved turn without consuming that turn. It rejects stale step identifiers and malformed audit fields. It is not a model tool, proof of human presence or an authorization mechanism; the host enforces the review policy and the native runtime separately enforces execution permissions.


## Version 0.17 elapsed-time budgets

Set `codingagent.maxRunSeconds` to an integer from 1 to 86,400 to limit the elapsed time of each approved run or resume. The default `0` disables this extra limit. The confirmation dialog and chat header show the selected value. The setting is captured before approval; changes apply to the next approval. Step budgets and individual model-request/command timeouts continue to apply independently.

The clock starts after run approval, before native session setup. It covers model retries/backoff, editor context collection, terminal review and tool execution. Each model request receives advisory remaining seconds; editing these model-visible fields cannot disable the host deadline. The approved duration is also recorded in native session history.

When time expires, the extension aborts its model-request signal, signals native command cancellation, and blocks new actions. It reports `paused · time_budget` and retains the session, prior edits, available logs and command receipts. Inspect changed files and retained command output before explicitly resuming with a fresh approved budget. Expiry never replays a rejected or interrupted proposal. Completed runs clear their timer so it cannot interrupt a later run.

This is a cooperative host control, not a hard OS deadline or rollback: an in-flight operation may finish while cancellation is delivered. Editor dialogs must be dismissed, extension-host blocking work must yield, and native cleanup must finish before the run returns. Interrupted commands can have partial side effects. If worker communication fails, inspect persisted state before assuming an action did or did not execute.


## Version 0.18 reusable AI prompt workflows

Open **Reusable AI prompt workflows** above the chat composer and choose **Use prompt workflow**, or run **Coding Agent: Use Reusable AI Prompt Workflow** from the command palette. The six bundled examples are:

| Workflow | Suggested steps |
| --- | --- |
| Diagnose and fix a bug | Reproduce, isolate the cause, apply a minimal fix, check for regressions |
| Implement a feature | Define acceptance criteria, plan dependencies, implement, verify |
| Refactor while preserving behavior | Establish a baseline, define invariants, refactor, compare behavior |
| Add meaningful regression tests | Inspect risks and current coverage, add focused cases, run and assess gaps |
| Review security and correctness | Inspect boundaries without mutations, trace evidence, prioritize findings |
| Update documentation from code | Inspect the implementation, update examples, check instructions |

Each example asks for the task, scope/constraints and verification criteria. For example, choose **Diagnose and fix a bug**, enter “Fix the empty document crash”, scope it to `textiX/`, and specify the regression check. The completed instructions append to your existing **unsent** composer draft. Edit the draft, choose Start or Resume and review the normal run approval. Cancelling selection or an input adds nothing. Acknowledged template drafts are not duplicated when the panel updates.

These are reusable instructions for the normal agent loop; they do not execute a fixed tool sequence or automatically enforce each prose stage. The security-review example requests read-only work: leave edit and command permissions disabled for a read-only run. Native permissions, verification gates, command review and run budgets continue to apply separately.

**Edit catalogue** opens `codingagent.promptWorkflows` in VS Code settings. Use **Edit in settings.json** to customize the list. The configured array replaces the examples, so copy the defaults first if you want to retain them. An empty array removes all examples. This resource-scoped setting can differ by workspace folder. Unique IDs contain lowercase letters, digits and hyphens, starting with a letter; each entry needs a title and prompt, with an optional description. Supported placeholders are `{{task}}`, `{{scope}}` and `{{verification}}`; only placeholders present in a template prompt for input. Repeated placeholders use the same value. Values are substituted once as literal text.

```json
{
  "codingagent.promptWorkflows": [
    {
      "id": "api-review",
      "title": "Review an API change",
      "description": "Compatibility, errors and observed checks",
      "prompt": "Review {{task}} within {{scope}}. Read the current API and callers. Identify compatibility and error-handling risks before proposing changes. Verify using: {{verification}}. Report evidence and unresolved questions."
    }
  ]
}
```

**Export catalogue JSON** saves the current configured catalogue as `{ "format": "codingagentlib/prompt-workflows/v1", "workflows": [...] }`. To reuse it in another workspace, copy its `workflows` array into `codingagent.promptWorkflows`. The bundled examples are also available in [prompt-workflows.json](prompt-workflows.json). No provider request is made when choosing, editing or exporting templates. Prompts and filled inputs follow the normal draft/session storage and provider-sharing behavior once submitted; do not enter credentials.


## Version 0.19 reference files across iterations

Selected reference files and selections stay in the composer after sending, so follow-up runs do not silently drop them. Remove a chip to stop attaching that selection to future runs. Attach a file again to refresh its snapshot from disk; the retained content is a snapshot, not a live filesystem view. The pending composer selection is held in extension memory; saved session snapshots remain available after an extension restart.

Explicit `reference_files` events remain complete in compacted model history, even when they exceed the soft history budget. Unchanged references reused on Resume are not appended to the native audit again. Different content is recorded as a newer snapshot; newer snapshots take precedence over older versions. Historical snapshots remain part of the saved session even after their composer chip is removed. To exclude that previous history, remove the chip and start a new run rather than resuming the old session.

The history budget is deliberately soft for explicit attachments: large references increase model-request size and remain subject to the provider's context capacity. Existing native attachment transport checks still apply. Model history compaction never substitutes a filename or compressed summary for explicitly uploaded reference content.


## Version 0.20 scoped repository guidance

Every native planning request now includes `projectInstructions`: exact repository instruction documents, directory scopes, SHA-256 hashes and source warnings. The worker reads `AGENTS.override.md` or `AGENTS.md` from the workspace root through the most recently targeted source path. It reloads them each turn; changing the guidance on disk changes the next request. A non-empty override takes precedence over the ordinary file in the same directory. Empty files fall through to the ordinary file. Root guidance applies across the workspace; deeper guidance applies only inside its subtree.

The model can call the read-only `read_project_instructions` tool with `{ "path": "src/new-file.rs" }` before moving into another subtree, including a not-yet-created target file. Discovery follows that target's ancestor directories; it does not scan every directory or read home/global instruction files. Parent traversal, private instruction paths, symlinks and non-regular files are rejected. The combined source budget is 32,768 UTF-8 bytes: documents are either included whole or explicitly reported as skipped, with a permitted `read_file` reference for oversized sources. Read warnings before assuming no rules exist.

The controller reports changed source paths and hash prefixes in chat. Turn audit events record source provenance without duplicating document bodies; full current guidance remains in model requests independently of history compaction. Repository text is below system/host and explicit user instructions. It cannot enable tools, grant executable permissions, bypass command approval or satisfy configured verification checks. Reading instructions is guidance, not evidence that a requested change works.

This implements scoped guidance inspired by [OpenAI's AGENTS.md guide](https://developers.openai.com/codex/guides/agents-md) and preserves exact instruction sources following [Anthropic's context-engineering guidance](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents). It does not implement Codex's home-directory configuration or all discovery options.


## Version 0.21 focused agent UI

The header keeps provider settings and saved sessions visible. **Tools & exports** holds less frequent inspections and downloads, while **Run details** folds model usage, context budgets and execution-policy information. Attachment actions stay beside the goal input. Tool receipts show a short outcome; **Inspect result** expands their complete plain-text JSON without truncating it. Errors, questions and completion summaries remain visible. Changed-file review opens when actual changes arrive.

The browser coding-agent panel uses the same approach: a compact goal and run-control area, visible attachment chips, closed **Input options**, folded **Live trace**, and complete tool payloads behind inspection controls. Run setup, checkpoint settings, history, focus mode and file inspection remain in **Agent tools**. Buttons for active-run actions appear when relevant. codeiX keeps its single coding-agent interface; other apps retain their Chat tab.

This is a presentation change. Existing approvals, permissions, run budgets, recovery controls, request data and tool execution checks still apply. Browser workflows and deterministic VS Code host/panel tests cover the controls; native desktop VS Code visual testing remains pending.


## Version 0.22 verification tied to source inputs

The native worker records hashes of known inspected/edited source files and managed scripts around each command. Each receipt includes `verificationBinding` with its inputs and SHA-256 digest. `verificationFreshness` in later planning requests identifies stale or unavailable inputs, and the controller explains when verification needs refreshing. The worker rechecks at completion, including changes that arrived after planning began.

A successful command whose tracked inputs changed cannot certify completion. The agent must inspect the changes and propose fresh verification under the normal command approval policy, or report partial/blocked. External edits are preserved; no old command is replayed automatically. Session restarts retain these bindings.

This complements configured verification commands and existing file hashes; it does not replace them. Tracking is limited to known file-tool inputs and scripts (256 inputs, 2 MB each), not all dependencies, shell-only edits or environment state. An unbound command has no tracked inputs. A zero exit and matching hashes do not establish test adequacy. See [source-bound verification](../README.md#source-bound-verification) for statuses and limits.


## Version 0.23 precise multi-edit calls

The native `apply_edits` tool performs 1–32 exact replacements in one existing file, guarded by its current SHA-256. Every anchor refers to the original snapshot; replacing `one` with `two` never creates a new match for a later `two` edit. Wrong counts, ambiguity, overlaps, stale hashes and unsupported preview flags reject the entire batch before writing. UTF-8 text, untouched content and original line endings are preserved.

Batch writes use existing edit permission, recovery snapshots, dirty-editor checks and post-edit file review. They invalidate prior verification receipts; the agent must run fresh configured checks afterward. No new approval bypass or execution mode is introduced. See [precise edit batches](../README.md#precise-edit-batches) for fields, limits and filesystem concurrency caveats.

### Complete-output loop evidence (v0.24)

Python and native Rust command receipts include `stdoutSha256` and `stderrSha256`: SHA-256 of the full raw log bytes, computed with bounded memory. Output previews and paging remain available. The VS Code unchanged-cycle guard compares these digests along with actual results and source bindings; changed tails beyond the preview count as changed evidence. Older paged receipts without full digests cannot establish identical output, so they do not trigger the unchanged-cycle pause. The independent repeated-failure budget still applies. Matching logs are a bounded heuristic, not proof of task progress or correctness; nondeterministic output can still evade cycle detection. No commands are replayed to calculate digests.

### Native multimodal references (v0.25)

**Attach files** accepts workspace PNG/JPEG/WebP/GIF images, WAV/MP3 audio and PDF, in addition to UTF-8 files and editor selections. It takes an explicit byte snapshot with SHA-256 provenance; media is never decoded as text or executed. Reference chips show format and byte size. Existing workspace/private-path protections and native transport budgets still apply. A file's extension selects its declared MIME type; providers validate the actual format.

Direct OpenAI-compatible and suite-relay calls send native `image_url`, `input_audio` or `file` parts with adjacent filename/provenance labels. Encoded data is omitted from the JSON context description. Text-only requests keep their original string format. References remain in saved session events across steps, compression and resumes; the latest explicitly attached snapshot of each path is the active media input, while older snapshots remain in the audit. Historical attachment metadata remains visible and must not be mistaken for the active snapshot. Removing a draft chip prevents reattaching it; it does not erase already-saved session references. Start a new run to clear that history.

Choose a model and gateway that support your input formats; some vision models cannot accept audio or PDF. This adds media **input**, not image generation or a native video decoder. The agent must still return structured text actions, and file edits still require normal permission and hash checks. Media-only output is not treated as an executable plan. Tests use controlled provider responses and real native session persistence; live-provider compatibility remains model dependent.

Multipart provider responses are accepted when explicit `text`/`output_text` blocks contain the structured agent reply. Text chunks are joined in order without inserting characters into split JSON. Image/audio blocks and refusal blocks are never parsed as actions; media-only replies fail without submitting an action, and truncated replies remain blocked. The extension does not yet preview or persist generated provider media.

### Evidence-driven model handoff (v0.26)

Configure Model Provider now supports primary, continuation and evaluator roles. The Model handoff button opens mode and role settings. Shadow mode is the default; without a continuation profile there are no extra calls. Automatic mode can switch once after a substantive workspace artifact has real execution feedback and the evaluator identifies localized remaining work. Saved model IDs, decisions and evidence survive session resume. Unsupported continuation input formats or changed role configuration pause instead of silently rerouting. See the [complete handoff guide](../MODEL_HANDOFF.md) for setup, native SDK integration, evaluation and limits. This is a prompted evaluator, not a trained AgentBaton reproduction; savings and accuracy are unmeasured.

### Responsive chat and inspection

The conversation keeps the most recent 250 cards. New messages follow the bottom only while you are reading there; **Latest message** returns to the bottom without interrupting review of older messages. Ctrl+Enter (macOS: Command+Enter) submits the draft or resumes an available session through the usual approval flow. IME composition does not submit.

Tool receipts are formatted only when **Inspect result** is expanded. The collapsed live trace does no JSON formatting; opening it shows up to 1,000 recent events within a 500,000-character display window. Receipt and trace panes scroll independently. These display limits do not change the native session audit or transcript export.

### Create a development specification

Use **Create specification** below the command input to open a questionnaire covering users/outcome, scope, constraints, acceptance criteria, verification and open questions. Only the command and answers are sent to your configured primary LLM; attachments, editor diagnostics and workspace files are not included. Generation uses the existing endpoint and stored key, makes one request with a timeout, and needs no native worker. Close cancels a pending request.

The result contains requirements with acceptance criteria, related implementation tasks and proposed verification checks. Missing decisions should remain open questions. Review and edit the draft, then choose **Use specification** to replace the command input. It does not start or resume the agent or grant permissions. The original command and questionnaire are retained in the specification as authoritative reference data. Generated text can still be wrong; resolve conflicts and assumptions before implementation.

Changing the questionnaire invalidates the generated draft. A newer command typed outside the dialog is preserved. Invalid/truncated replies and cancelled requests cannot replace the input. Commands are limited to 30,000 characters, each answer to 4,000, and model output to 60,000. The final specification must also fit the command field. Generation can incur normal provider usage.

### Long-session request preparation

Compacted model-history views now deep-copy only retained events. Omitted payloads remain in the native audit and can be retrieved with the same `read_history` offsets. The latest edit, command and failure ledger is collected backwards and stops when all three entries are found. Serialization caches are local to one preparation call, so changed events cannot reuse stale text. Pinned user instructions, attachment snapshots and the latest history-read result remain complete even above the soft budget. Full-history and disabled-compaction modes retain their existing copy behavior.

A synthetic benchmark of 1,001 events (about 16.1 million JSON characters, 80,000-character budget) measured median preparation time of 168 ms before and 80 ms after, about 2.1× faster on the development environment. This measures history preparation, not model inference or end-to-end run latency. The benchmark also compares full output equality across 400 varied history/mode cases. To reproduce from the extension directory:

```sh
git show 6c304d6:codingagentlib/vscode/src/history-context.cjs > /tmp/history-baseline.cjs
node --expose-gc scripts/benchmark-history.cjs /tmp/history-baseline.cjs
```
