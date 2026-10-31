const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs/promises"),
  path = require("node:path"),
  os = require("node:os"),
  vm = require("node:vm"),
  { createRequire } = require("node:module");
test("extension memory bridge configures and persists workspace-scoped notes without starting a worker", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "memory-host-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const workspace = path.join(root, "workspace");
  await fs.mkdir(workspace);
  const extension = path.resolve(__dirname, ".."),
    commands = new Map(),
    frames = [],
    saved = new Map();
  let receive, panel;
  const uri = (fsPath) => ({ fsPath, scheme: "file", toString: () => fsPath });
  const vscode = {
    window: {
      createOutputChannel: () => ({ appendLine() {}, dispose() {} }),
      createStatusBarItem: () => ({ show() {}, dispose() {} }),
      showErrorMessage() {},
      createWebviewPanel: () =>
        (panel = {
          webview: {
            cspSource: "vscode-webview:",
            asWebviewUri: (u) => u.fsPath,
            postMessage: (f) => frames.push(f),
            onDidReceiveMessage: (fn) => (receive = fn),
          },
          onDidDispose() {},
        }),
    },
    workspace: {
      isTrusted: true,
      workspaceFolders: [{ name: "Workspace", uri: uri(workspace) }],
      getConfiguration: () => ({ get: (k, f) => (k === "model" ? "test" : f) }),
      registerTextDocumentContentProvider: () => ({ dispose() {} }),
    },
    commands: {
      registerCommand: (k, v) => {
        commands.set(k, v);
        return { dispose() {} };
      },
    },
    Uri: { joinPath: (u, ...parts) => uri(path.join(u.fsPath, ...parts)) },
    ViewColumn: { Beside: 2 },
    StatusBarAlignment: { Right: 1 },
  };
  const context = {
    subscriptions: [],
    extensionUri: uri(extension),
    globalStorageUri: uri(path.join(root, "private")),
    workspaceState: {
      get: (k, f) => saved.get(k) ?? f,
      update: async (k, v) => saved.set(k, v),
    },
  };
  const local = createRequire(path.join(extension, "src/extension.cjs")),
    module = { exports: {} };
  vm.runInNewContext(
    await fs.readFile(path.join(extension, "src/extension.cjs"), "utf8"),
    {
      require: (name) =>
        name === "vscode"
          ? vscode
          : name === "./worker.cjs"
            ? {
                Worker: class {
                  constructor() {
                    throw Error("Memory must not start a worker");
                  }
                },
              }
            : local(name),
      module,
      exports: module.exports,
      process,
      URL,
      AbortController,
      AbortSignal,
      console,
    },
  );
  module.exports.activate(context);
  await commands.get("codingagent.open")();
  assert.match(panel.webview.html, /project-memory-ui.js/);
  let serial = 0;
  async function call(data) {
    const id = "pm-" + ++serial;
    receive({ command: "projectMemory", id, data });
    for (let i = 0; i < 100; i++) {
      const result = frames.find(
        (f) => f.kind === "projectMemoryResult" && f.id === id,
      );
      if (result) {
        if (result.error) throw Error(result.error);
        return result.result;
      }
      await new Promise((r) => setTimeout(r, 5));
    }
    throw Error("Bridge timeout");
  }
  await call({ action: "configure", project: "A", enabled: true });
  assert.equal(
    frames.filter((f) => f.kind === "state").at(-1).projectMemorySettings
      .enabled,
    true,
  );
  const note = await call({
    project: "A",
    action: "save",
    title: "Decision",
    text: "Reviewed knowledge",
    category: "decision",
  });
  assert.equal(
    (await call({ project: "A", action: "read", id: note.id })).text,
    "Reviewed knowledge",
  );
  assert.equal((await call({ project: "B", action: "list" })).total, 0);
  assert.deepEqual(await fs.readdir(workspace), []);
  assert.ok(!frames.some((f) => f.kind === "session"));
  vscode.workspace.isTrusted = false;
  await assert.rejects(call({ project: "A", action: "list" }), /Trust/);
});
