# Workspace coding agent

Every app's AI chat has a **Workspace agent** button; the desktop toolbar also offers **Coding agent**. This mode runs an iterative Sense → Plan → Act → Observe → Verify loop against a real codebase on the machine hosting the suite server. Ordinary document chat remains available.

## Start locally

From the repository root:

```sh
python3 server/server.py \
  --agent-workspace /absolute/path/to/project \
  --agent-allow-command python3 \
  --agent-allow-command node \
  --agent-allow-command git
```

Open `http://localhost:8000/codeiX/` (or another suite app). Configure a model through the desktop AI provider settings. Open Workspace agent, check its workspace and allowed executables, enter a goal, select edit/command permissions and start. For example: “Inspect this project, fix the incorrect addition function, create a reusable verification script and run it before and after the fix.”

Normal server startup enables the repository workspace and installed Python, Node.js, npm and Git commands. Use `--agent-workspace` to select another directory. Repeated `--agent-allow-command` flags replace the default executable list. Use `--agent-no-commands` for file tools only, or `--disable-agent` to disable the runtime entirely. The runtime API requires the hosting server's own local HTTP origin and a request header; remote-hosted frontends cannot execute local commands through it. The AI provider relay can be configured separately.

## Iteration and tools

The model receives the goal, app context and schema (when selected), runtime capabilities, tool definitions and accumulated observations. It returns one structured action per turn using [spec.js](spec.js). The runtime executes it and returns the actual result before the next model turn. Public plans, actions, exit codes and verification reports appear in the log. Private chain-of-thought is not requested.

Tools list/search/read files, create/edit/delete text files, maintain working scripts, execute allowed programs, inspect paged stdout/stderr and compare workspace changes. Existing file edits require a current SHA-256 hash. Managed scripts can be inspected and edited independently after a run. A manual terminal accepts an allowed executable, JSON argument array, working directory, stdin and timeout.

The step budget pauses rather than discarding progress. Continue, stop, answer a question, send follow-up instructions or load an existing session. Stop cancels the client loop and active command process group. Restarted server sessions load paused. Session audit logs, scripts, recovery copies and full command output persist beneath `<workspace>/.suite-agent/sessions/`; exclude this private directory from version control. Command output previews are paged, with full retained logs accessible through Read full command output. Download run log exports the session record and agent protocol.

File-tool edits are immediately applied to disk. Restore file-tool backup recovers the original file or removes a newly created file. Command side effects have no automatic rollback. codeiX offers a separate review to synchronize disk changes into its browser project; this review does not undo or defer disk edits. Other apps can receive generated files through Copy text to virtual disk and their existing import flows.

## Execution boundary

This is a trusted local development runtime, not an OS sandbox. File tools reject traversal, symlinks and private runtime/version-control paths. Allowed commands run with the server process's OS permissions: interpreters, shells and git can access resources beyond file-tool boundaries. Enable only executables needed for the task, use a dedicated workspace and OS/container isolation when appropriate, and inspect actual observations before trusting model completion claims. File/script tool writes are limited to 2 MB per write; larger text and logs can be read in pages. No live provider credentials are bundled.

## Verification

```sh
python3 -m unittest server.agent_runtime_test
node shared-agent/loop-test.cjs
node shared-agent/browser-test.cjs
```

The browser test uses a mocked model with real Python command execution and filesystem changes, including a failing check, source fix, successful rerun and editor synchronization. It requires Playwright and Chromium.
