const assert = require("node:assert/strict"),
  { chromium } = require("playwright"),
  fs = require("node:fs/promises"),
  os = require("node:os"),
  path = require("node:path"),
  { spawn } = require("node:child_process");
(async () => {
  const folder = await fs.mkdtemp(path.join(os.tmpdir(), "suite-tasks-")),
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
      const match = out.match(/listening on (\S+)/);
      if (match) resolve("http://" + match[1]);
    });
    server.on("exit", () => reject(Error(stderr)));
    setTimeout(() => reject(Error(stderr)), 10000).unref();
  });
  const browser = await chromium.launch({
    executablePath: "/usr/bin/chromium",
    args: ["--no-sandbox"],
  });
  try {
    const context = await browser.newContext({
        viewport: { width: 1500, height: 1000 },
      }),
      page = await context.newPage();
    page.on("dialog", (dialog) => dialog.accept());
    let aiCalls = 0;
    await page.route("**/api/chat", (route) => {
      aiCalls++;
      return route.fulfill({
        json: { text: "No automatic requests expected" },
      });
    });
    await page.goto(base + "/");
    const apps = await page.evaluate(() => SuiteApps.map((a) => a.id));
    assert.equal(apps.length, 18);
    const names = await page.evaluate(() =>
      Object.fromEntries(SuiteApps.map((a) => [a.id, a.name])),
    );
    await page.evaluate(() => {
      for (const app of SuiteApps)
        localStorage.setItem(
          "suite-notebook-v1:" + app.id,
          JSON.stringify({
            format: "suite-notebook/v1",
            tool: app.id,
            title: app.name + " project",
            notes: "Cross-app review notes",
            tasks: [
              { id: "shared", text: "Review " + app.name, done: false },
              { id: "done", text: "Prepare " + app.name, done: true },
            ],
          }),
        );
    });
    for (const app of apps) {
      console.log("Checking " + app);
      await page.goto(base + "/" + app + "/");
      await page.locator("#suite-tasks-open").click();
      await page.locator("#suite-task-board").waitFor({ state: "visible" });
      assert.match(
        await page.locator("#tb-count").textContent(),
        /18 matching tasks/,
      );
      await page.locator("#tb-app").selectOption(app);
      assert.equal(await page.locator("#tb-list article").count(), 1);
      await page.locator('#tb-list input[aria-label^="Complete"]').click();
      assert.equal(await page.locator("#tb-list article").count(), 0);
      await page.locator("#tb-filter").selectOption("done");
      assert.equal(await page.locator("#tb-list article").count(), 2);
      await page
        .locator(
          '#tb-list input[aria-label="Complete Review ' + names[app] + '"]',
        )
        .click();
      await page.locator("#tb-filter").selectOption("open");
      await page.locator("#tb-select").click();
      await page.locator("#tb-ai").click();
      const input =
        app === "codeiX"
          ? "#ag-goal"
          : app === "shelliX"
            ? "#prompt"
            : "#sai-prompt";
      assert.match(
        await page.locator(input).inputValue(),
        new RegExp("Review " + names[app]),
      );
      if (app === "shelliX")
        assert.equal(await page.locator("#agent-input").isVisible(), true);
      assert.equal(aiCalls, 0);
    }
    await page.goto(base + "/mockiX/");
    await page.locator("#suite-tasks-open").click();
    await page.locator("#tb-notes").click();
    await page.locator("#suite-notebook").waitFor({ state: "visible" });
    await page.locator("#nb-notes").fill("Keep this local draft");
    await page.locator("#nb-close").click();
    await page.locator("#suite-tasks-open").click();
    await page.locator("#tb-query").fill("Review mockiX");
    await page.locator("#tb-select").click();
    await page
      .locator("#sai-prompt")
      .evaluate((input) => (input.value = "Keep my existing prompt"));
    await page.locator("#tb-ai").click();
    assert.match(
      await page.locator("#sai-prompt").inputValue(),
      /^Keep my existing prompt\n\nUse this cross-app/,
    );
    assert.match(
      await page.locator("#sai-prompt").inputValue(),
      /Review mockiX/,
    );
    assert.equal(aiCalls, 0);
    await page.locator("#sai-close").click();
    await page.locator("#suite-tasks-open").click();
    const another = await page.context().newPage();
    await another.goto(base + "/");
    await another.evaluate(() => {
      const key = "suite-notebook-v1:mockiX",
        d = JSON.parse(localStorage.getItem(key));
      d.tasks[0].text = "Updated elsewhere";
      localStorage.setItem(key, JSON.stringify(d));
    });
    await page.waitForFunction(() =>
      document
        .querySelector("#tb-status")
        .textContent.includes("another window"),
    );
    await page.locator("#tb-query").fill("Updated elsewhere");
    assert.equal(await page.locator("#tb-list article").count(), 1);
    const download = page.waitForEvent("download");
    await page.locator("#tb-export").click();
    assert.match(
      await fs.readFile(await (await download).path(), "utf8"),
      /Updated elsewhere/,
    );
    await page.locator("#tb-close").click();
    await page.locator("#suite-notebook-open").click();
    await page.locator("#nb-save").click();
    assert.match(
      await page.locator("#nb-status").textContent(),
      /changed|another/i,
    );
    await page.locator("#nb-close").click();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.bringToFront();
    await page.keyboard.press("Alt+Shift+T");
    await page.locator("#suite-task-board").waitFor({ state: "visible" });
    assert.ok(
      await page
        .locator("#suite-task-board")
        .evaluate((e) => e.getBoundingClientRect().width <= innerWidth),
    );
    await page.locator('#tb-list input[aria-label^="Select"]').focus();
    await page.keyboard.press("Space");
    assert.match(await page.locator("#tb-count").textContent(), /1 selected/);
    await page.keyboard.press("Space");
    assert.match(await page.locator("#tb-count").textContent(), /0 selected/);
    assert.equal(aiCalls, 0);
    console.log(
      "PASS: all 18 apps open the shared dashboard, completion persists, mockiX notes fallback, additive AI brief without calls, cross-window refresh, notebook conflict protection, Markdown export and mobile keyboard access.",
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
