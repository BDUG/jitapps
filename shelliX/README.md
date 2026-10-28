# shelliX

A command workspace with goal-driven AI chat. Open `/shelliX/` on the suite server, or launch shelliX from the desktop.

## Setup

From the repository root:

```sh
python3 server/server.py --agent-workspace /path/to/workspace \
  --agent-allow-command sh --agent-allow-command python3 --agent-allow-command git
```

Use **AI provider settings** to configure a text provider on `/relay`. shelliX uses the suite's saved relay origin and its default text provider. Manual commands do not need an AI provider. Commands use the local server runtime even if the AI relay is elsewhere. Disabling the runtime or command execution disables shelliX execution.

## Working with shelliX

- Enter a goal and select **Send & work**. The assistant chooses one tool at a time, receives actual command results, and adjusts its next step. Follow-ups and replies stay in the same session.
- To run a command manually, choose an executable and enter its arguments as a JSON string array, for example `python3` with `["-c", "print(1 + 1)"]`.
- Set a working directory relative to the server workspace. Each command starts there; changing directory inside one command does not persist. Commands do not implicitly invoke a shell. To use pipes or shell syntax, explicitly allow and select a shell, for example `bash` with `["-lc", "your command"]`.
- Inspect stdout, stderr, exit status, timeouts and cancellations. **Read remaining stdout/stderr** pages through retained logs without repeating the command. The AI has the same log-paging tool.
- **Stop** aborts the AI request and requests cancellation of the active command. Inspect retained results before continuing. shelliX never automatically replays an interrupted command whose outcome is unknown.
- The assistant pauses after 20 planning steps by default. Select **Continue** or send a follow-up to resume. It can ask for missing information, or finish with a partial/blocked explanation. Complete results require the latest command to succeed; a zero exit alone does not establish that the user's requirements were adequately tested.
- Sessions, instructions, actions and command logs are retained in the runtime's private `.suite-agent` state. Reload restores the last selected session; **Load** opens another shelliX session. **New session** starts a separate history. **Download session** exports the audit JSON; full paged logs remain on the server.

Commands run with the server account's OS permissions, including any file changes the allowed programs can perform. They are not sandboxed. Use an appropriate workspace and executable allowlist. Output and selected file/history context are sent to the configured AI provider during AI work. Tool output is displayed as plain text; it is never interpreted as browser HTML or terminal escape instructions. shelliX is a command runner, not an interactive PTY: prompts requiring stdin and persistent terminal processes are unsupported. Browser closure stops planning but does not promise cancellation of an already running server command; reopening the saved session shows retained results and offers Stop if a tool is still running.


The interface uses the suite's light surfaces, maroon actions, blue focus indicators and shared icon style. Command output and AI conversation use a monospace, Bash-style prompt. The AI input remains a natural-language goal; it is not executed as shell syntax.

When `sh` is installed, the server includes it in its default coding-agent executable list. Explicit `--agent-allow-command` flags replace that default list: include `--agent-allow-command sh` to enable shell entry with a custom list. `--agent-no-commands` and `--disable-agent` still disable execution.

Enter shell expressions in **Shell command**, for example `printf 'hello\n' | sort`. shelliX sends the exact text as `sh -c` with the selected working directory. Up/Down recalls the last 200 shell commands, restored from the selected server session after reload; history is not written to browser storage. The executable/JSON-arguments controls remain available for direct program calls when shell entry is blank. A command's `cd` does not persist across submissions; change the Working directory control instead. Allowing `sh` permits shell scripts, pipelines, redirection and programs launched by the shell, with the server account's OS permissions; child programs are not separately constrained by the executable-name allowlist. No Bash installation, interactive PTY or Bash-specific syntax is implied.


## Shell-focused agent cycle

shelliX adds its own **Inspect → Plan → Execute → Observe → Verify** policy on top of the shared validated agent runtime. Every request includes a `shellix/inspect-plan-execute-observe-verify/v1` contract, shell invocation guidance, recent command evidence, and a diagnosis/log-paging recommendation. One action executes per turn; its actual observation informs the next plan. A complete result requires successful command evidence after the latest user instruction, preventing older successful commands from satisfying a new follow-up. This is an evidence guard, not a guarantee of semantic correctness. Invalid plans, unchanged action cycles, receipt recovery and step budgets use the shared runtime safeguards.

The phase indicator and foldable **Agent activity** show public plans, actions, observations and verification status, not private model reasoning. The activity list displays the latest 100 entries in this tab; the downloaded server session retains its audit events.

The primary input runs POSIX shell expressions through `sh -c`; Enter submits. **Direct executable and JSON arguments** expands the alternative program-call controls. `help`, `history` and `clear` are local UI commands. **Clear screen** or Ctrl+L hides displayed command history without deleting its server audit. Up/Down recalls commands. Ctrl+C while the command input is focused requests cancellation; it is not a PTY signal stream. Commands requiring interactive stdin remain unsupported. **Stop** is available for cancellation regardless of focus.

If an older relay reports **Unknown app**, update and restart the server hosting the configured AI relay. shelliX now has its own editable skill profile (including planning, verification, debugging, testing and security references); an old relay missing this registration rejects the request before contacting a provider.


## Optional request / response log

Expand **Request / response log** (inside the coding agent's Live trace panel, or below the shelliX conversation), then enable **Record agent requests and responses** before running. Download the JSON log at any time; **Clear log** discards it, including pending captures. Turning recording off retains captured entries and lets pending captures finish. Reloading discards the in-memory log and resets recording to off.

The log records agent browser HTTP requests/replies and agent-runtime requests/results, with session IDs, timestamps, durations, HTTP status, sanitized headers and transport errors. Invalid JSON and failed replies are retained for diagnosis. Binary downloads record metadata rather than file bytes. The shared coding agent captures each actual request/result page. When recording is enabled, `/api/chat` requests opt into relay/provider tracing: the response includes `httpTrace` with the actual augmented provider request and raw provider response, including errors and invalid JSON. Update/restart the relay to use this capability. Captures begin when enabled; earlier exchanges are not reconstructed. There is no automatic upload or browser-storage persistence.

Browser authorization/cookie headers and endpoint query strings are redacted or excluded; relay provider URLs preserve ordinary query parameters but redact credentials. Structured credential fields and provider authorization/cookie headers are redacted. Prompts, source files, tool output and free-text responses can still contain sensitive data: review downloaded logs before sharing. This log is separate from the retained server session audit and the public operation trace.


### Inspect HTTP payloads

Expand **Request / response log** inside **Live trace**, enable recording, then expand an exchange to inspect request/response headers and payloads. Search filters the captured exchanges. **Download trace** includes HTTP data alongside operation history; **Download request / response log** exports HTTP data alone. Recording remains optional and off by default. Relay/provider traces are returned only to the requesting client, are not persisted, and reflect the augmented request actually sent after skill retrieval.

Coverage includes the active coding-agent panel's runtime calls, planning, independent review, controlled-English preprocessing, individual paging exchanges, and its inline inspector. Separate browser windows and arbitrary HTTP performed inside commands/scripts are not globally intercepted. The relay captures its direct provider exchange; it cannot see a gateway's further internal calls. Cancellation/navigation may leave a pending or incomplete body capture. Bodies may still contain sensitive free text even when structured credentials are redacted. Binary downloads retain metadata rather than inline file bytes.


## Search and export command history

The command history supports **Match case**, Unicode-aware **Whole words**, and **Failed commands only**. **Export filtered history** downloads matching displayed rows as JSON with their text, failure flag, filter settings and session ID. Loaded log pages are included in displayed text; unloaded pages and rows hidden by Clear screen are outside this report. Export is read-only and never runs commands. Download session remains the complete server audit export.


**Check shell syntax** parses the current input using `sh -n -c` without executing the entered script. It preserves the input and records the syntax-check command/output in the session audit. Fix syntax errors using stderr, then run deliberately. A successful parse is not runtime verification or a safety guarantee. The normal runtime, executable allowlist and command timeout still apply.


## Reusable snippets

Expand **Reusable command snippets**, enter a name and **Save current command**. The local library retains shell text, relative working directory and timeout across sessions/reloads on this browser origin. **Load snippet** only fills the input and execution settings; it never executes the command. Inspect it, check syntax and run deliberately. Search, export, import and delete operate on saved snippets without modifying the server audit. Exported files use the shared app-scoped `suite-document-template/v1` envelope for `shelliX`; imports from another app are rejected.


Use **Use command** on a previous command result to prepare the same shell text or direct executable/JSON arguments, working directory and timeout. This never executes it. Inspect the prepared input, check syntax if appropriate, then choose Run. Reuse is blocked while an operation is active and when the original executable is no longer allowlisted.


**Prompt workflows** beside the AI goal input stores reusable instruction drafts with literal `{{input:name}}` placeholders. Workflows can be per-app or shared, edited, imported/exported and previewed. Insert appends to the AI input without sending or running anything. This is separate from command snippets and executable runtime workflows.


**Export offline review HTML** packages the displayed filtered results into a searchable, paged, print-friendly report without executing commands. **Include session audit** embeds the full current session JSON for separate extraction; otherwise only displayed rows are included. The viewer has no external dependencies or network requests and displays command text/output inertly. Native browser policy may require serving the HTML if local-file opening is blocked.


**Content hub** publishes the currently loaded, visible command results as portable text and inventory, making them accessible in other apps. It does not publish the full server audit or rerun commands. You can inspect published documents, diagrams and other references from any app and add them to a shelliX AI draft; the draft explicitly asks for options before commands or changes. Use ordinary server-session export for a complete audit. Content hub storage is local to this browser origin, and published items are independent snapshots.

## Console failures and resolution hints

Failed command/tool results include a foldable resolution card. It distinguishes missing commands/files (including exit 127), access/executable issues (126), shell/argument syntax, disk space, timeouts/cancellations, failed checks, server allowlist restrictions, relay/version/connectivity issues and authentication errors. Hints are based on recorded messages, not a confirmed root cause. **Draft resolution question** appends an unsent question to the shell chat; review it before Send & work. It runs no command, installs nothing and changes no permissions. History search/export keeps original result text separate from diagnostic guidance.

When the app receives HTML or another non-JSON API response, it now identifies the runtime/relay endpoint problem rather than showing a raw JSON parser error. Start the suite with `python3 server/server.py`; a static-only HTTP server does not provide `/api/agent`. The configured AI relay must provide `/api/chat`. Inspect the failed request in browser developer tools for its actual URL/status when diagnosing proxies, TLS or CORS. Never work around an executable restriction without the server owner's authorization.

**Read remaining stdout/stderr** now records a lightweight, server-generated `output_read` audit event with job ID, stream, actual byte offsets and completion state. The coding agent recognizes consecutive recorded page reads, so output already served through the console does not remain permanently pending in its completion ledger. No command is replayed, and no output body is duplicated into that audit event. Access receipts do not prove that a person or model understood the output; meaningful verification remains necessary. Restart the Python suite server after updating to enable these receipts.
