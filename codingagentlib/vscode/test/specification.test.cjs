const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  C = require("../media/specification.js"),
  { complete } = require("../src/provider.cjs");
const fixture = () => ({
  title: "Safe file search",
  summary: "Find matching files without changing them.",
  scope: ["Workspace search"],
  nonGoals: ["No edits"],
  constraints: ["Do not execute commands"],
  requirements: [
    {
      id: "R1",
      description: "Return matching paths",
      acceptance: ["A query returns matching workspace paths."],
    },
  ],
  design: ["Use existing search UI."],
  tasks: [
    { id: "T1", title: "Inspect search integration", requirementIds: ["R1"] },
  ],
  verification: [
    {
      requirementId: "R1",
      method: "Propose a known fixture search",
      expected: "Only matching paths appear.",
    },
  ],
  openQuestions: ["Which file types?"],
  assumptions: [],
});
module.exports = { fixture };
test("specification preserves original command/answers with traceable requirements and planned checks", () => {
  const source = C.input("Search files. Do not edit anything.", {
      scope: "Only src/",
    }),
    spec = fixture(),
    before = JSON.stringify(spec),
    text = C.markdown(
      C.parse("```json\n" + JSON.stringify(spec) + "\n```"),
      source,
    );
  assert.match(text, /Search files. Do not edit anything./);
  assert.match(text, /Only src\//);
  assert.match(text, /R1/);
  assert.match(text, /T1 \(R1\)/);
  assert.match(text, /not executed/);
  assert.match(text, /Which file types/);
  assert.equal(JSON.stringify(spec), before);
});
test("invalid specification data cannot masquerade as an executable plan", () => {
  for (const value of [
    "",
    "not json",
    '{"status":"act","action":{"tool":"run_command"}}',
  ])
    assert.throws(() => C.parse(value));
  for (const change of [
    (s) => s.requirements.push({ ...s.requirements[0] }),
    (s) => (s.requirements[0].acceptance = []),
    (s) => (s.tasks[0].requirementIds = ["R2"]),
    (s) => (s.verification = []),
    (s) => (s.verification[0].requirementId = "R2"),
    (s) =>
      s.requirements.push({
        id: "R2",
        description: "Uncovered",
        acceptance: ["Check it"],
      }),
  ]) {
    const s = fixture();
    change(s);
    assert.throws(() => C.parse(s));
  }
  assert.throws(() => C.input(""), /Enter a command/);
  assert.throws(() => C.input("x".repeat(30001)), /30,000/);
  assert.throws(() => C.input("ok", { scope: "x".repeat(4001) }), /4,000/);
  assert.throws(() => C.parse("x".repeat(60001)), /60,000/);
});
test("specification provider purpose uses configured credentials without tool protocol or attachments", async () => {
  const source = C.input("Search files"),
    request = {
      purpose: "specification",
      instructions: C.instructions,
      specification: source,
    };
  const result = await complete(
    {
      endpoint: "https://model.example/chat",
      transport: "openai",
      model: "configured",
    },
    "secret-header",
    request,
    undefined,
    async (url, init) => {
      const body = JSON.parse(init.body);
      assert.equal(body.model, "configured");
      assert.equal(init.headers.Authorization, "Bearer secret-header");
      assert.equal(body.messages[0].content, C.instructions.join("\n"));
      assert.ok(
        !body.messages[0].content.includes("Use exactly the sessionId"),
      );
      assert.ok(!init.body.includes("secret-header"));
      assert.deepEqual(
        JSON.parse(body.messages[1].content).specification,
        source,
      );
      assert.ok(!("tools" in body));
      return new Response(
        JSON.stringify({
          choices: [{ message: { content: JSON.stringify(fixture()) } }],
        }),
      );
    },
  );
  assert.equal(C.parse(result).requirements[0].id, "R1");
});
test("VS Code host generates without constructing a worker and cancels pending model requests", async (t) => {
  const fs = require("node:fs"),
    path = require("node:path"),
    vm = require("node:vm"),
    { createRequire } = require("node:module"),
    root = path.resolve(__dirname, "..");
  const frames = [],
    commands = new Map();
  let receive,
    panel,
    providerCalls = 0,
    mode = "ok",
    heldSignal;
  const uri = (p) => ({ fsPath: p, toString: () => p }),
    vscode = {
      window: {
        createOutputChannel: () => ({ appendLine() {}, dispose() {} }),
        createStatusBarItem: () => ({ show() {}, dispose() {} }),
        showErrorMessage() {},
        createWebviewPanel: () =>
          (panel = {
            webview: {
              cspSource: "vscode-webview:",
              asWebviewUri: (u) => u.fsPath,
              postMessage: (m) => frames.push(m),
              onDidReceiveMessage: (fn) => (receive = fn),
            },
            onDidDispose() {},
          }),
      },
      workspace: {
        isTrusted: true,
        workspaceFolders: [],
        getConfiguration: () => ({
          get: (k, f) =>
            ({
              endpoint: "https://model.example/chat",
              model: "configured",
              transport: "openai",
              requestTimeoutSeconds: 10,
            })[k] ?? f,
        }),
        registerTextDocumentContentProvider: () => ({ dispose() {} }),
      },
      commands: {
        registerCommand: (k, v) => {
          commands.set(k, v);
          return { dispose() {} };
        },
      },
      Uri: { joinPath: (u, ...p) => uri(path.join(u.fsPath, ...p)) },
      ViewColumn: { Beside: 2 },
      StatusBarAlignment: { Right: 1 },
    };
  const context = {
    subscriptions: [],
    extensionUri: uri(root),
    secrets: {
      get: async (key) => {
        assert.equal(key, "providerKey:https://model.example");
        return "stored-secret";
      },
    },
  };
  const local = createRequire(path.join(root, "src/extension.cjs")),
    module = { exports: {} },
    provider = require("../src/provider.cjs");
  vm.runInNewContext(
    fs.readFileSync(path.join(root, "src/extension.cjs"), "utf8"),
    {
      module,
      exports: module.exports,
      process,
      URL,
      AbortController,
      AbortSignal,
      console,
      require: (name) =>
        name === "vscode"
          ? vscode
          : name === "./handoff.cjs"
            ? {}
            : name === "./worker.cjs"
              ? {
                  Worker: class {
                    constructor() {
                      throw Error("Specification must not construct a worker");
                    }
                  },
                }
              : name === "./provider.cjs"
                ? {
                    ...provider,
                    completeWithRetry: async (c, key, request, signal) => {
                      providerCalls++;
                      assert.equal(key, "stored-secret");
                      assert.equal(c.maxModelRetries, 0);
                      assert.equal(request.purpose, "specification");
                      assert.ok(!("events" in request));
                      if (mode === "hold") {
                        heldSignal = signal;
                        await new Promise((resolve, reject) =>
                          signal.addEventListener(
                            "abort",
                            () => reject(Error("Stopped")),
                            { once: true },
                          ),
                        );
                      }
                      return fixture();
                    },
                  }
                : local(name),
    },
  );
  module.exports.activate(context);
  await commands.get("codingagent.open")();
  assert.ok(panel.webview.html.includes("specification-ui.js"));
  assert.ok(panel.webview.html.includes("create-specification"));
  const wait = async (fn) => {
    for (let i = 0; i < 100; i++) {
      if (fn()) return;
      await new Promise((r) => setTimeout(r, 5));
    }
    throw Error("Host response timeout");
  };
  receive({
    command: "specificationGenerate",
    id: "spec-1",
    source: C.input("Read files only"),
  });
  await wait(() =>
    frames.some((f) => f.kind === "specificationResult" && f.id === "spec-1"),
  );
  assert.equal(
    frames.find((f) => f.kind === "specificationResult").result.requirements[0]
      .id,
    "R1",
  );
  assert.equal(providerCalls, 1);
  assert.ok(!frames.some((f) => f.kind === "session"));
  mode = "hold";
  receive({
    command: "specificationGenerate",
    id: "spec-2",
    source: C.input("Next spec"),
  });
  await wait(() => heldSignal);
  receive({
    command: "specificationGenerate",
    id: "spec-3",
    source: C.input("Duplicate"),
  });
  await wait(() => frames.some((f) => f.id === "spec-3"));
  assert.match(
    frames.find((f) => f.id === "spec-3").error,
    /Finish the active/,
  );
  assert.equal(providerCalls, 2);
  receive({ command: "specificationCancel", id: "spec-2" });
  await wait(() => frames.some((f) => f.id === "spec-2"));
  assert.equal(heldSignal.aborted, true);
  assert.match(frames.find((f) => f.id === "spec-2").error, /Stopped/);
  assert.equal(
    frames.filter((f) => f.kind === "state").at(-1).preparing,
    false,
  );
});
