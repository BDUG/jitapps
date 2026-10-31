const assert = require("node:assert/strict"),
  { chromium } = require("playwright"),
  fs = require("node:fs/promises"),
  os = require("node:os"),
  path = require("node:path"),
  { spawn } = require("node:child_process");
(async () => {
  const folder = await fs.mkdtemp(path.join(os.tmpdir(), "native-starters-")),
    server = spawn(
      "python3",
      [
        "server/server.py",
        "--port",
        "0",
        "--config",
        path.join(folder, "providers.json"),
        "--search-config",
        path.join(folder, "search.json"),
        "--skills-offline",
        "--disable-agent",
      ],
      { cwd: path.resolve(__dirname, ".."), stdio: ["ignore", "pipe", "pipe"] },
    );
  let stderr = "";
  server.stderr.on("data", (d) => (stderr += d));
  const base = await new Promise((resolve, reject) => {
    let out = "";
    server.stdout.on("data", (d) => {
      out += d;
      const m = out.match(/listening on (\S+)/);
      if (m) resolve("http://" + m[1]);
    });
    server.on("exit", () => reject(Error(stderr)));
    setTimeout(() => reject(Error(stderr)), 10000).unref();
  });
  const browser = await chromium.launch({
    executablePath: "/usr/bin/chromium",
    args: ["--no-sandbox"],
  });
  try {
    const page = await browser.newPage({
      viewport: { width: 1500, height: 1100 },
    });
    let calls = 0;
    await page.route("**/api/chat", (r) => {
      calls++;
      return r.fulfill({ json: { text: "No automatic requests expected" } });
    });
    await page.goto(base + "/");
    const apps = await page.evaluate(() => SuiteApps.map((a) => a.id));
    for (const app of apps) {
      console.log("Native starter " + app);
      await page.goto(base + "/" + app + "/");
      const standalone = ["mockiX", "shelliX"].includes(app);
      if (!standalone) await page.evaluate(() => SuiteCodingAgent.open());
      else if (app === "mockiX") await page.locator("#sai-launch").click();
      else await page.locator("#terminal-input-mode").selectOption("agent");
      const input =
          app === "mockiX"
            ? "#sai-prompt"
            : app === "shelliX"
              ? "#prompt"
              : "#ag-goal",
        launch = standalone
          ? "#suite-prompt-library-chat"
          : "#suite-prompt-library-agent";
      await page.locator(input).fill("Keep my existing draft");
      const before = await page.evaluate(() =>
        window.SuiteWorkspaceAdapter?.snapshot
          ? JSON.stringify(SuiteWorkspaceAdapter.snapshot())
          : window.SuiteAgentAdapter?.snapshot
            ? JSON.stringify(SuiteAgentAdapter.snapshot())
            : "shell draft",
      );
      await page.locator(launch).click();
      await page.locator("#spl-brief>summary").click();
      assert.equal(await page.locator("#spl-brief-starter option").count(), 3);
      await page.locator("#spl-body").fill("Keep my workflow text.");
      await page.locator("#spl-brief-use-starter").click();
      assert.equal(
        await page.locator("#spl-body").inputValue(),
        "Keep my workflow text.",
      );
      assert.equal(
        await page.locator(input).inputValue(),
        "Keep my existing draft",
      );
      assert.ok(
        (await page.locator("#spl-brief-acceptance").inputValue()).length > 20,
      );
      if (app === "shelliX")
        assert.equal(
          await page.locator("#spl-brief-mode").inputValue(),
          "plan",
        );
      await page.locator("#spl-brief-build").click();
      await page.locator("#spl-preview").click();
      assert.match(
        await page.locator("#spl-result").inputValue(),
        /Success criteria:/,
      );
      await page.locator("#spl-insert").click();
      assert.match(
        await page.locator(input).inputValue(),
        /^Keep my existing draft\n\nKeep my workflow text\./,
      );
      assert.equal(
        await page.evaluate(() =>
          window.SuiteWorkspaceAdapter?.snapshot
            ? JSON.stringify(SuiteWorkspaceAdapter.snapshot())
            : window.SuiteAgentAdapter?.snapshot
              ? JSON.stringify(SuiteAgentAdapter.snapshot())
              : "shell draft",
        ),
        before,
      );
      assert.equal(calls, 0);
    }
    await page.goto(base + "/mockiX/");
    await page.locator("#sai-launch").click();
    await page.locator("#sai-prompt").fill("keep");
    await page.locator("#suite-prompt-library-chat").click();
    await page
      .locator("#spl-body")
      .fill("A workflow that is too long for this composer.");
    await page.locator("#sai-prompt").evaluate((e) => (e.maxLength = 10));
    await page.locator("#spl-insert").click();
    assert.match(await page.locator("#spl-status").textContent(), /too long/);
    assert.equal(await page.locator("#sai-prompt").inputValue(), "keep");
    await page.locator("#sai-prompt").evaluate((e) => {
      e.maxLength = 100000;
      e.readOnly = true;
    });
    await page.locator("#spl-insert").click();
    assert.match(await page.locator("#spl-status").textContent(), /available/);
    assert.equal(await page.locator("#sai-prompt").inputValue(), "keep");
    await page.locator("#sai-prompt").evaluate((e) => (e.readOnly = false));
    await page.locator("#spl-name").fill("My mockup workflow");
    await page.locator("#spl-save").click();
    await page.waitForFunction(() =>
      document
        .querySelector("#spl-list")
        .textContent.includes("My mockup workflow"),
    );
    await page.locator("#spl-close").click();
    await page.reload();
    await page.locator("#sai-launch").click();
    await page.locator("#suite-prompt-library-chat").click();
    await page.waitForFunction(() =>
      document
        .querySelector("#spl-list")
        .textContent.includes("My mockup workflow"),
    );
    await page.setViewportSize({ width: 390, height: 844 });
    assert.ok(
      await page
        .locator("#suite-prompt-library")
        .evaluate((e) => e.getBoundingClientRect().width <= innerWidth),
    );
    assert.equal(calls, 0);
    console.log(
      "PASS: guided native starting points across all 18 apps, preserved documents/drafts, explicit build/preview/insert, no automatic AI calls, shell plan default, length/read-only protection, mockiX workflow persistence and mobile layout.",
    );
  } finally {
    await browser.close();
    server.kill("SIGTERM");
    await new Promise((resolve) => {
      if (server.exitCode !== null) return resolve();
      server.once("exit", resolve);
    });
    await fs.rm(folder, { recursive: true, force: true });
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
