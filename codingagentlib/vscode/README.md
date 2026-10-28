# codingagentlib · Native VS Code extension

A standalone VS Code coding agent built on [codingagentlib's native Rust runtime](../rust/README.md). It runs without Python, Node tool installations, the suite desktop or a relay server. VS Code's extension host provides JavaScript execution; the platform-specific native worker is bundled in the VSIX. Model requests go directly to an OpenAI-compatible chat-completions provider, or optionally to an existing suite relay.

## Build and install

Prerequisites for building from source: Node.js 22+, npm and a stable Rust/Cargo toolchain. Use the platform/architecture of the VS Code extension host. A remote SSH/container workspace runs the extension on the remote host, which needs its matching package.

```sh
cd codingagentlib/vscode
npm ci
npm run verify
npm run package -- --target linux-x64
code --install-extension codingagentlib-linux-x64-0.2.0.vsix
```

On Windows x64 use `--target win32-x64`; on macOS use `darwin-arm64` or `darwin-x64`. Build on the corresponding OS/architecture; the build script compiles and copies the host worker. This is not an automatic cross-compilation pipeline. Set `CARGO` to an absolute Cargo executable if it is not on PATH. No Rust compiler is needed to run an installed VSIX. Packages are local artifacts; the build does not publish to the Marketplace. The `bdug` publisher identifier is metadata, not a claim of Marketplace publication.

Alternatively choose **Extensions → … → Install from VSIX**. To debug from source, build the worker then launch VS Code with `code --extensionDevelopmentPath=/absolute/path/to/codingagentlib/vscode /absolute/workspace`.

## Use

1. Open and trust a filesystem workspace. For multi-root workspaces, select the root when prompted. Virtual filesystem workspaces and browser-only VS Code are unsupported.
2. Run **Coding Agent: Configure Model Provider**. Select **OpenAI-compatible provider**, enter its HTTPS chat-completions endpoint, model and API key. The key is stored in VS Code SecretStorage, separately for each provider origin. A blank key preserves a stored key; an unauthenticated local endpoint may use no key. Loopback HTTP is supported. Optional **Existing suite relay** uses its `/api/chat` endpoint and provider configuration.
3. Open **Coding Agent: Open Chat**, or select the status-bar **Coding Agent** button. Describe a goal. Edits and commands are disabled by default. To allow commands, first configure `codingagent.allowedCommands` with the exact executable names/paths you trust, then check **Allow commands**.
4. Choose **Start new run**. Review the workspace, edit permission and actual executable allowlist in VS Code's confirmation dialog. Nothing is sent to the model or edited until you approve. Save dirty files before proceeding. File-tool edits apply directly to disk after approval, and the agent observes the actual result before planning again.
5. Watch the plans, observations and foldable live trace. Questions pause the run; enter your answer and choose **Resume / send follow-up**. Runs pause after 500 steps by default, configurable to 1–500. **Stop** aborts provider requests and signals the native worker even during a command. Approval is requested again on resume, with the saved session's permissions.
6. Select a changed file for its file-tool recovery comparison. Commands/external edits without recovery images open the current file with a notice; a fabricated baseline is not shown. Review the changes with your normal VS Code/Git tools.
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
| `codingagent.requestTimeoutSeconds` | `180` | Model request timeout, 5–1800 seconds. |

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
