const assert = require("node:assert/strict");
const fs = require("node:fs/promises"),
  os = require("node:os"),
  path = require("node:path"),
  { spawn } = require("node:child_process");
const { chromium } = require("playwright");
const { agentControl } = require("./browser-tools.cjs");
(async () => {
  const folder = await fs.mkdtemp(path.join(os.tmpdir(), "model-team-"));
  const profiles = ["lead", "solver", "critic"].map((id) => ({
    id,
    name: id,
    provider: "openai",
    protocol: "openai",
    endpoint: "https://example.invalid/v1/chat/completions",
    model: id,
    apiKey: "fixture-key",
    upstreamProvider: "openai",
    maxTokens: 4096,
    tokenLimitEnabled: true,
    temperature: 0.2,
    inputModalities: ["text"],
  }));
  await fs.writeFile(
    path.join(folder, "providers.json"),
    JSON.stringify({
      format: "architex-relay-providers",
      version: 1,
      activeProfileId: "lead",
      profiles,
      allowedOrigins: [],
      agentHandoff: {
        mode: "off",
        primaryProfileId: "",
        continuationProfileId: "",
        detectorProfileId: "",
      },
    }),
  );
  await fs.writeFile(
    path.join(folder, "source.txt"),
    "Actual workspace evidence",
  );
  const child = spawn(
    "python3",
    [
      "server/server.py",
      "--port",
      "0",
      "--skills-offline",
      "--agent-no-commands",
      "--agent-workspace",
      folder,
      "--config",
      path.join(folder, "providers.json"),
      "--search-config",
      path.join(folder, "search.json"),
    ],
    { cwd: path.resolve(__dirname, ".."), stdio: ["ignore", "pipe", "pipe"] },
  );
  let browser,
    stderr = "";
  child.stderr.on("data", (data) => (stderr += data));
  try {
    const base = await new Promise((resolve, reject) => {
      let output = "";
      const timer = setTimeout(
        () => reject(Error(stderr || "Server startup timeout")),
        15000,
      );
      child.stdout.on("data", (data) => {
        output += data;
        const found = output.match(/listening on (\S+)/);
        if (found) {
          clearTimeout(timer);
          resolve("http://" + found[1]);
        }
      });
      child.on("exit", () => {
        clearTimeout(timer);
        reject(Error(stderr));
      });
    });
    browser = await chromium.launch({
      executablePath: "/usr/bin/chromium",
      args: ["--no-sandbox"],
    });
    const page = await browser.newPage({
        viewport: { width: 1400, height: 1000 },
      }),
      errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(base + "/relay");
    await page.waitForFunction(
      () =>
        document.querySelectorAll("[data-collaboration-profile]").length === 3,
    );
    await page.locator("#collaboration-mode").selectOption("adaptive");
    await page
      .locator("[data-collaboration-profile=solver]")
      .selectOption("solver");
    await page
      .locator("[data-collaboration-profile=critic]")
      .selectOption("critic");
    await page.locator("#saveCollaboration").click();
    await page.waitForFunction(() =>
      document
        .querySelector("#status")
        .textContent.includes("Collaboration settings saved"),
    );
    const stored = JSON.parse(
      await fs.readFile(path.join(folder, "providers.json"), "utf8"),
    );
    assert.equal(stored.agentCollaboration.members.length, 2);
    await page.reload();
    assert.equal(
      await page.locator("#collaboration-mode").inputValue(),
      "adaptive",
    );
    let solverCalls = 0,
      criticCalls = 0,
      coordinatorCalls = 0;
    await page.route("**/api/chat", async (route) => {
      const body = route.request().postDataJSON(),
        content = body.messages.at(-1).content;
      const request = JSON.parse(
        typeof content === "string"
          ? content
          : content.find((part) => part.type === "text").text,
      );
      assert.ok(body.profileRevision);
      if (body.profileId === "solver") {
        solverCalls++;
        assert.equal(request.role, "solver");
        assert.ok(request.request.responseSchema);
        assert.equal(request.discussion.length, 0);
        return route.fulfill({
          json: {
            text: JSON.stringify({
              recommendation: "Read source.txt before editing",
              checks: ["Inspect actual file contents"],
            }),
          },
        });
      }
      if (body.profileId === "critic") {
        criticCalls++;
        assert.equal(request.role, "critic");
        assert.match(
          request.discussion[0].feedback.recommendation,
          /Read source/,
        );
        return route.fulfill({
          json: {
            text: JSON.stringify({
              recommendation:
                "Confirm the observed file bytes; do not infer success",
              disagreements: ["Planning alone is not verification"],
            }),
          },
        });
      }
      assert.equal(body.profileId, "lead");
      coordinatorCalls++;
      if (coordinatorCalls === 1) {
        assert.equal(request.modelCollaboration.discussion.length, 2);
        assert.match(
          request.modelCollaboration.discussion[1].feedback.disagreements[0],
          /not verification/,
        );
      } else
        assert.ok(
          JSON.stringify(request.events).includes("Actual workspace evidence"),
        );
      const acting = coordinatorCalls === 1;
      return route.fulfill({
        json: {
          text: JSON.stringify({
            sessionId: request.sessionId,
            step: request.step,
            status: acting ? "act" : "ask",
            plan: "Use observed evidence",
            action: acting
              ? { tool: "read_file", args: { path: "source.txt" } }
              : null,
            question: "What should be changed next?",
          }),
        },
      });
    });
    await page.goto(base + "/codeiX/");
    await page.evaluate(() => {
      SuiteChatPaging.configure({ mode: "off" });
      SuiteCodingAgent.open();
    });
    await page.waitForFunction(() =>
      document.querySelector("#ag-runtime").textContent.includes("Workspace:"),
    );
    await agentControl(
      page,
      "#ag-goal",
      "fill",
      "Inspect source.txt using the model team.",
    );
    await page.locator("#ag-start").click();
    await page.locator("#ag-start-reviewed").click();
    await page.waitForFunction(
      () =>
        !SuiteCodingAgent.running() &&
        SuiteCodingAgent.session()?.status === "paused",
      null,
      { timeout: 30000 },
    );
    const session = await page.evaluate(() => SuiteCodingAgent.session());
    assert.equal(solverCalls, 1);
    assert.equal(criticCalls, 1);
    assert.equal(coordinatorCalls, 2);
    assert.equal(
      session.events.filter(
        (event) =>
          event.kind === "user" &&
          event.value.status === "model_collaboration_round",
      ).length,
      1,
    );
    assert.equal(
      session.events.filter((event) => event.kind === "observation").length,
      1,
    );
    assert.match(
      await page.locator("#ag-log").textContent(),
      /Model discussion/,
    );
    assert.deepEqual(errors, []);
    console.log(
      "PASS: saved/reloaded role settings, solver→critic→coordinator discussion, preserved schemas and real read-only execution through the normal runtime.",
    );
  } finally {
    if (browser) await browser.close();
    child.kill("SIGTERM");
    await new Promise((resolve) => {
      if (child.exitCode !== null) resolve();
      else child.once("exit", resolve);
    });
    await fs.rm(folder, { recursive: true, force: true });
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
