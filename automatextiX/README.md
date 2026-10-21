# automatextiX

An n8n-inspired visual workflow builder that runs locally in your browser. Build a flow from configurable nodes, connect ports, run it manually and inspect the JSON data at every step. No build or account is required for local JSON workflows. AI calls use your configured relay; optional command steps use the local suite server.

Open `automatextiX/index.html` directly, or serve the repository with `python3 -m http.server 8000` and open `/automatextiX/`. For all call types, use `python3 server/server.py`; static hosting does not provide command execution or an AI relay.

## Build a workflow

The included [customer-follow-up example](example-workflow.json) branches two items by amount, creates different welcome messages, merges the branches and logs the result. It makes no network requests.

1. Add a step from the left library. Click a node to configure its name and settings in the inspector. Click **Save step** to commit configuration changes; unsaved form edits are not executed. Invalid JSON or configurations leave the saved step intact.
2. Activate **Connect**. Click an output and then an input port (or the reverse). Ports clear automatically after a connection. Conditions have separate true and false outputs. Connections may fan out to multiple steps. Click an edge to remove it through the inspector.
3. Drag nodes to position them. Drag the background to pan, use the wheel or buttons to zoom, and Fit to frame the flow. **Clean up** arranges the acyclic graph from left to right without node overlap. Curved edges are visual connections; crossing-free routing is not guaranteed.
4. **Run workflow** takes a snapshot of the saved flow and executes its manual trigger. Editing is blocked until the run finishes or is stopped. Select a node or execution entry to inspect its input, output, timing, status and messages. Execution logs are foldable and the panel can be resized vertically. Download run saves the complete report as JSON.
5. Use Undo/redo for edits, additions, deletions, movement and imports. Ctrl/Command Z and Ctrl/Command Shift Z work outside form fields. Node deletion also removes its connections. New workflows and successful imports can be undone.

Workflows autosave locally. History and execution results last for the current page session. Export important workflows because clearing browser storage removes the saved flow. JSON export/import preserves node positions, connections and configurations. Download schema exports the [agent-readable workflow schema](workflow.schema.json), including configuration field definitions. Runtime validation also checks JSON data, references, limits and graph cycles. Failed imports leave the current workflow intact.

On a narrow screen, the inspector opens over the graph when you select a node. Use **Close inspector** or Escape to hide it. Escape also exits Connect mode and clears pending ports.

## Nodes and data

Each step consumes an array of JSON objects. A step runs once when all its predecessor steps have been considered. It receives the concatenated active items from its incoming connections; a branch with no items is skipped. Each outgoing connection receives a copy of the corresponding output array. Multiple routes can therefore produce duplicate items when later merged.

- **Manual trigger:** starts with a JSON object or array of objects. There is at most one manual trigger. Empty work-in-progress flows may be saved, but execution requires a trigger.
- **Set fields:** supplies a JSON object whose values can contain item expressions. Keep input fields merges these top-level fields into each item; disable it to replace the item's contents. Dotted JSON keys remain literal keys, not nested assignments.
- **Condition:** reads a dotted item path and routes each item to true or false. Equality compares JSON values; numeric comparisons require numbers. Contains supports strings and arrays. Exists checks for a non-null, defined value. Comparison values are JSON: use `100`, `true` or `"VIP"` as appropriate.
- **Merge:** concatenates active incoming items; it does not join objects by a key or combine matching records.
- **HTTP request:** sends one sequential browser request per item. Configure HTTP method, URL, JSON headers/body and timeout. Results preserve input fields and add `response: {status, data}`; data is parsed as JSON when possible, otherwise text. GET omits the body; other methods send JSON. Non-2xx responses stop the run. Cookies are omitted and redirects are rejected. There are no automatic retries.
- **Delay:** pauses the current sequential run for up to 30 seconds, then forwards the items.
- **Output / log:** renders a message per item and forwards unchanged data.

Templates use `{{ item.name }}`, `{{ item.customer.email }}` or `{{ item }}`. An exact expression preserves its JSON type, so `{"amount":"{{ item.amount }}"}` keeps a numeric amount. Embedded expressions become text, such as `"Hello {{ item.name }}"`. Paths can include array indices (`item.users.0.name`). Missing paths fail with an explanation. JavaScript, arbitrary expressions and prototype access are not evaluated.

## HTTP, execution and limits

HTTP steps make real requests only when you explicitly run the flow. Browser CORS and mixed-content rules apply; an API must allow this app's origin. Serving the app is usually easier than opening it directly with the `null` file origin. There is no CORS-bypassing proxy or credential vault. Headers and other configuration fields are stored locally and included in exports; manage their contents accordingly.

Stop cancels the active request or delay and prevents further steps. For command steps it also sends a local cancellation request; the command runner enforces its own timeout if the browser disappears. Already-completed external actions cannot be undone. A failed step stops the run; completed step logs remain available. The UI stops a run after two minutes. Requests time out individually (100–30,000 ms). Execution is sequential, so a delay or slow request holds up later nodes, including other branches.

Limits: 50 nodes, 100 edges, 200 items per step, 500 KB per step's input/output array, 500 KB per HTTP response, 100 external calls per run across HTTP, Web, AI and Command steps and 1 MB per imported workflow. Cycles and self-connections are rejected. This is not an n8n workflow-file importer and does not provide a background scheduler, public webhooks, persistent run history, an unrestricted shell node, hosted execution, credential management or exactly-once delivery. Workflows run only while this page is open.

## Verification

Run `node automatextiX/engine-test.cjs` to check execution, branching, merge, templates, cycle detection, cancellation and mocked HTTP behavior. Serve the repository on port 8000, then run `node automatextiX/browser-test.cjs` with Playwright and Chromium at `/usr/bin/chromium`, matching the other tools' development setup.

The browser test exercises the default flow, configuration, skipped branches, history, persistence, graphical port connections, cleanup, cancellation, imports/exports and schema download. It does not contact a third-party API; HTTP request behavior is tested with controlled responses.


## Tool-specific AI chat

Discuss workflow structure, debug the selected step using run details, repair data mappings or design new branches. Proposed workflow replacements are validated for configuration, references and cycles and require review. Chat never starts a workflow; apply edits only after stopping an active run.

See the [shared AI chat guide](../shared-ai/README.md) for relay setup, context selection, attachments, review, Undo, request/schema downloads and troubleshooting.

## AI, command and web call steps

Each call processes incoming items sequentially. AI steps can use multiple conversation rounds per item; other calls make one request per item. Every new call step has **Result field** and **Keep input fields** settings. The default preserves the input and adds a result under `ai`, `command` or `web`; an existing field with that name is replaced. Choose another simple field name to retain multiple call results. Disable Keep input fields to output only the result field. Outputs are normal workflow items that can feed Set, Condition, another call or Output / log.

| Step | Templated input | Default output field |
| --- | --- | --- |
| **AI chat call** | System message and prompt, e.g. `Summarize {{ item.description }}` | `item.ai.text`: raw answer; `item.ai.data`: parsed JSON when possible, otherwise the answer text |
| **Command line** | JSON argument array and standard input, e.g. `["process.py", "{{ item.ai.text }}"]`; stdin `{{ item }}` | `item.command.stdout`, `.stderr`, `.exitCode`, `.timedOut`, `.cancelled`, `.truncated` |
| **Web call** | URL, JSON headers and JSON body; exact item expressions preserve values such as numbers and nested objects | `item.web.status` and `item.web.data` (JSON when possible, otherwise text) |

The existing **HTTP request** remains compatible and continues to write `item.response`. Web calls use the same browser HTTP transport and CORS rules, with a configurable result field. They do not crawl or render websites, bypass CORS, or execute returned page scripts. Request method/body and timeout behavior match HTTP request steps.

Configure the AI relay in **AI chat → Relay**. AI call steps use its current URL and the provider configured on that relay. This is a plain chat-completion call using the step's messages; it does not invoke the workflow-editing assistant or automatically modify the flow. JSON answers, including a single JSON code fence, are parsed into `.data`. Use `.text` when you need the original response. Provider credentials remain on the relay.

### Enable local commands

Command execution is **disabled by default**. Start the suite with each trusted executable explicitly allowed:

```sh
python3 server/server.py --allow-workflow-command python3 --workflow-cwd /path/to/trusted/workspace
```

Repeat `--allow-workflow-command` for additional executables. The default working directory is the repository root. The executable in a command step is literal and must match an allowed name/path. Arguments are a JSON array of strings and are templated individually; an exact numeric/object template is converted to a string/JSON argument. Do not enter `python3 script.py` in Executable: use Executable `python3` and Arguments `["script.py"]`. `&&`, pipes, redirection and command substitution are literal arguments, since the server never invokes a shell.

The app checks command availability before a run, then asks you to confirm the workflow's command steps and argument templates. Review the workflow and the data supplying those templates before confirming. Allowing an interpreter such as Python permits scripts to read/write files and run other programs with the **server account's permissions**; the working directory and allowlist are not a filesystem or interpreter sandbox. Use only trusted workflows, programs and inputs. Importing or applying an AI workflow proposal never executes a command by itself.

Command endpoints require the local suite origin (`localhost`, `127.0.0.1` or IPv6 loopback), a same-origin request and the suite request header. AI relay CORS permissions do not grant access to command execution. Serve automatextiX from this same local server; a separately configured remote AI relay does not become its command server.

Commands run without a shell, with inherited server environment, a 100–30,000 ms timeout, at most 100 arguments, 64 KB each for the combined argument bytes and stdin, and 64 KB each for stdout/stderr. The server allows two simultaneous command jobs. Stop requests cancellation; timeout, cancellation or output overflow stops the run. On POSIX the runner kills the command's process group; Windows cancellation targets the launched process. Completed external effects cannot be undone. Nonzero exit codes stop the run by default and retain captured output in the failed step report; disable **Stop on nonzero exit code** to route that result onward deliberately.

### Example data chain

1. Trigger: `{"description":"A short product idea","name":"Alex"}`.
2. AI chat call: prompt `Write a one-sentence summary: {{ item.description }}`.
3. Command line: Executable `python3`, Arguments `["process.py", "{{ item.ai.text }}"]`, stdin `{{ item }}`. Place your trusted `process.py` in the configured workspace.
4. Web call: POST to your API with body `{"name":"{{ item.name }}","processed":"{{ item.command.stdout }}"}`.
5. Output / log: `Saved: {{ item.web.data.id }}`.

All inputs, resolved call results and status/timing remain visible in the execution report and its JSON download. Configuration and schemas can be exported normally, including to the shared virtual disk. Keep credentials out of workflow headers, arguments, prompts and inputs if you do not want them stored in workflow exports or run logs.

Additional verification:

```sh
node automatextiX/call-steps-test.cjs
python3 -m unittest server.workflow_commands_test server.integration_test
node automatextiX/call-steps-browser-test.cjs
```

The browser test starts a temporary local server with an explicit Python allowlist, runs a controlled fixture script, mocks AI/web responses, and verifies the complete AI → command → web chain, consent, cancellation, persistence, logs and origin/allowlist rejection. It does not call a live AI provider or third-party website.

## Use files from the shared workspace

The **List workspace files**, **Read workspace file** and **Write workspace file** steps work directly with the suite's shared **Virtual disk**. They run in the browser and need neither a command allowlist nor a filesystem permission prompt. Files written by a workflow are immediately available to the other suite apps on this same origin and browser profile.

| Step | Configuration | Output (default result field) |
| --- | --- | --- |
| **List workspace files** | Folder (empty = disk root), include subfolders, optional suffix such as `.md` | One item per matching file, with `item.file.path`, `.name`, `.type`, `.size`, `.modified`, `.revision` and `.app` |
| **Read workspace file** | Templated path and encoding: `text`, `json`, `base64` | File metadata plus `item.file.content` and `.encoding` |
| **Write workspace file** | Templated destination/content, encoding, optional MIME type, replacement setting and optional expected revision | Saved-file metadata in `item.savedFile`, including its new `.revision` |

Each step supports a configurable **Result field** and **Keep input fields**, just like call steps. The existing-path dropdown copies a disk file/folder path into the inspector; click **Save step** to commit it. Templates such as `{{ item.file.path }}` let a listed file flow directly into a read step.

- **Text** reads strict UTF-8. A text write stores a string as-is, or serializes an exact object/array expression as formatted JSON text.
- **JSON** reads parsed JSON into `.content`. A write accepts an exact expression such as `{{ item.ai.data }}` or a JSON template such as `{"answer":"{{ item.ai.text }}"}`. Exact expressions inside that JSON retain their data types. Malformed JSON fails before any file is written.
- **Base64** carries binary content as standard padded base64, without a data-URL prefix. A read → base64 write round trip preserves the bytes. Use a MIME template such as `{{ item.file.type }}` to retain the original type.

The optional MIME type accepts templates. When empty it defaults to `text/plain`, `application/json` or `application/octet-stream` according to the chosen write encoding. Parent folders are created automatically. Relative paths use `/`; absolute paths, `..`, backslashes and empty segments are rejected.

### Read, adapt and write back

For a new output file, connect:

1. Trigger with `{"path":"notes/source.md"}`.
2. Read workspace file: Path `{{ item.path }}`, encoding `text`.
3. AI chat call: Prompt `Improve this Markdown: {{ item.file.content }}`.
4. Write workspace file: Path `notes/revised.md`, Content `{{ item.ai.text }}`, encoding `text`, MIME `text/markdown`.

To replace the source deliberately, use destination `{{ item.file.path }}`, enable **Allow replacement of an existing file**, and set **Expected revision** to `{{ item.file.revision }}`. The write fails if another app/tab changed or removed that file after it was read. With replacement disabled, an existing file is left intact. Leaving Expected revision empty permits an explicitly enabled replacement without a revision check.

For command processing, pass `{{ item.file.content }}` as command stdin or an argument, then save `{{ item.command.stdout }}`. A virtual path is **not an OS filesystem path** and is not mounted into the command server. Web calls can send file contents in their JSON body and save `{{ item.web.data }}` as JSON. Normal provider/network/command setup still applies to those steps.

A ready-to-import, offline example is [workspace-file-roundtrip.json](examples/workspace-file-roundtrip.json). Upload [workspace-input.json](examples/workspace-input.json) to the virtual disk root, import the workflow and run it. It reads the JSON, adds a `processed` flag and saves `results/workspace-output.json`, without AI or network calls. Remove/rename that output before rerunning, or explicitly enable replacement.

### File limits and run behavior

Workflow reads/writes support **300,000 bytes per file** so file content can fit in JSON items. The virtual disk's larger general file limit remains unchanged. The existing **500 KB total item-array limit per step** and **200 items per step** still apply: large folder batches or retaining both source content and a large AI answer can exceed these limits. Adjust the suffix/folder filter and Keep input fields settings as needed. Binary file content must use base64; no Office/document parsing is performed by the file steps themselves.

File contents become part of run inputs/outputs and downloaded reports. Passing them to AI or Web nodes sends them to the service configured for that node. Disk-only operations make no external calls.

Writes commit **per file**, not as a transaction over the whole run. A later failure or Stop does not undo files already saved; completed write receipts remain in the failed/canceled step report. Stop aborts a pending disk transaction when it has not committed. Workflow Undo changes the workflow definition, not the files it has already written. Download important backups through the virtual disk UI.

Verification: `node automatextiX/workspace-files-test.cjs` and `node automatextiX/workspace-files-browser-test.cjs` (suite served on port 8000). Tests cover JSON/binary content, real disk → mocked AI → disk, opening the generated file in textiX, recursive enumeration, path/size guards, create-only and stale-revision protection, partial write receipts and cancellation.

## Multi-round AI conversations

An **AI chat call** can now run a bounded conversation per incoming item:

- **Conversation rounds:** 1–10. Existing workflows without this setting use one round.
- **Prompt:** the first user message.
- **Follow-up prompt:** used for subsequent rounds, with all earlier user/assistant messages in the request. It supports ordinary item templates, `{{ item.iteration.round }}`, `{{ item.iteration.total }}`, `{{ item.iteration.previousText }}` and the latest result such as `{{ item.ai.text }}`. `item.iteration` exists while evaluating prompts/stop values, rather than becoming a downstream item field.
- **Previous history:** `[]` starts fresh. Use an exact template such as `{{ item.ai.history }}` to continue another AI step's conversation. Literal history is a JSON array of alternating `{ "role": "user" | "assistant", "content": "…" }` messages, ending with an assistant reply; system instructions are supplied separately by the current step.
- **Finish early:** optionally enter a result path such as `data.done` and a JSON comparison value such as `true`. The engine checks each reply's parsed result and stops when they match. A missing path does not match. This checks supplied JSON data, not independent proof that an answer is correct; the model must be prompted to return the expected field.

The final result keeps **`.text` and `.data`** and adds **`.roundsCompleted`**, **`.history`** and **`.historyDropped`** under the configured result field (`ai` by default). Downstream steps receive the final reply, not one output item per round. Run logs expose round progress and completed replies. If a later round fails or is canceled, the last completed reply stays in the step report, while dependent steps do not run.

Each input item gets a separate conversation. Runs start fresh unless history is explicitly supplied. To continue across separate runs, save `{{ item.ai.history }}` as JSON with a Write workspace file step, then read it in another run and set Previous history to `{{ item.file.content }}`. The workflow-editing sidebar chat is separate from these execution conversations.

History retains up to **80 user/assistant messages** (40 complete turns). When a new round would exceed that count, the oldest complete turns are removed; `.historyDropped` reports the number removed by this step. Seeded history is limited to 400 KB; a complete round request is limited to 500 KB, and the usual 500 KB step-output limit still applies to replies plus returned history. Prefer focused prompts over including the entire item/history twice. Every round counts toward the **100 external-call run limit**. The timeout is **per round**; the UI's two-minute total run timeout remains in force. Stop cancels the active request and prevents later rounds. Commands and web calls are not automatically repeated by an AI round; the workflow graph remains acyclic.

Example: import [iterative-ai-chat.json](examples/iterative-ai-chat.json), configure your AI relay, then Run workflow. It drafts and refines a plan for up to three rounds, optionally finishes early on `data.done: true`, and saves the final reply/history to `results/iterative-plan.json`. Each round makes a real provider request when run. The output file is create-only by default.

Additional checks: `node automatextiX/ai-rounds-test.cjs` and `node automatextiX/ai-rounds-browser-test.cjs` (server on port 8000). These verify history delivery, item isolation, follow-up templates, bounded rounds, early completion, cross-node continuation, cancellation, run limits, inspector persistence and compatibility with older single-round workflows using mocked AI responses.

## Workspace extensions

Open **Workspace** beside the virtual disk controls, or press **Ctrl+K / Cmd+K**, for searchable commands, content search and reviewed bulk replacement, named recovery points, portable workspace backups, three tool-specific AI workflow drafts, document validation/insights, and coding-agent handoff ZIPs. Restores preserve a recovery point first and reject stale or invalid changes. Files can move through either local or virtual disk.

See the [workspace tools guide](../shared-suite/WORKSPACE.md) for this app’s native backup behavior, raw source/formula search, inspection measurements and interoperability limits. Workflow drafts never send an AI request automatically.

## Paged AI steps

AI workflow calls use the shared [paging transport](../shared-ai/PAGING.md) in the browser. Source conversations can be read in pages and long responses are reassembled before typed results pass downstream. The AI-call transport's former 500 KB request/response guard is removed; workflow item, history, file and web-response limits still apply to their own data types. AI timeouts apply per provider call during paging, allowing batch pauses and longer overall operations. Configure **AI paging** in the suite toolbar; no incomplete output is passed to the next step.
