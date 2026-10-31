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
    for (const app of apps) {
      console.log("Task editing " + app);
      await page.goto(base + "/" + app + "/");
      await page.waitForFunction(
        () =>
          window.SuiteWorkspaceAdapter?.snapshot ||
          window.SuiteAgentAdapter?.snapshot ||
          window.ShelliXDiagnostics,
      );
      const before = await page.evaluate(async () => {
        const a = window.SuiteWorkspaceAdapter || window.SuiteAgentAdapter;
        return a ? JSON.stringify(await a.snapshot()) : "audit";
      });
      await page.evaluate(
        (app) =>
          localStorage.setItem(
            "suite-notebook-v1:" + app,
            JSON.stringify({
              format: "suite-notebook/v1",
              tool: app,
              title: "Existing notebook",
              notes: "Preserve these notes",
              tasks: [{ id: "completed", text: "Completed task", done: true }],
            }),
          ),
        app,
      );
      await page.locator("#suite-tasks-open").click();
      await page.locator("#tb-app").selectOption(app);
      await page.locator("#tb-add").click();
      assert.equal(await page.locator("#te-app").inputValue(), app);
      await page.locator("#te-text").fill("New task for " + app);
      await page.locator("#te-save").click();
      await page.waitForFunction(
        () => !document.querySelector("#suite-task-editor").open,
      );
      let saved = await page.evaluate(
        (app) => JSON.parse(localStorage.getItem("suite-notebook-v1:" + app)),
        app,
      );
      assert.equal(saved.tasks.length, 2);
      assert.equal(saved.tasks[1].done, false);
      assert.equal(saved.notes, "Preserve these notes");
      await page.locator("#tb-filter").selectOption("all");
      await page
        .getByRole("button", { name: "Edit Completed task", exact: true })
        .click();
      assert.equal(await page.locator("#te-app").isDisabled(), true);
      await page.locator("#te-text").fill("Updated completed task");
      await page.locator("#te-save").click();
      await page.waitForFunction(
        () => !document.querySelector("#suite-task-editor").open,
      );
      saved = await page.evaluate(
        (app) => JSON.parse(localStorage.getItem("suite-notebook-v1:" + app)),
        app,
      );
      assert.deepEqual(saved.tasks[0], {
        id: "completed",
        text: "Updated completed task",
        done: true,
      });
      await page
        .getByRole("button", {
          name: "Edit Updated completed task",
          exact: true,
        })
        .click();
      await page.locator("#te-text").fill("Stale edit must not save");
      await page.evaluate((app) => {
        const key = "suite-notebook-v1:" + app,
          d = JSON.parse(localStorage.getItem(key));
        d.notes = "Newer saved notes";
        localStorage.setItem(key, JSON.stringify(d));
      }, app);
      await page.locator("#te-save").click();
      assert.match(await page.locator("#te-status").textContent(), /changed/);
      assert.equal(
        await page.locator("#te-text").inputValue(),
        "Stale edit must not save",
      );
      await page.locator("#te-cancel").click();
      assert.equal(
        await page.evaluate(async () => {
          const a = window.SuiteWorkspaceAdapter || window.SuiteAgentAdapter;
          return a ? JSON.stringify(await a.snapshot()) : "audit";
        }),
        before,
      );
      assert.equal(aiCalls, 0);
    }
    await page.goto(base + "/");
    await page.evaluate(() => {
      localStorage.removeItem("suite-notebook-v1:textiX");
      localStorage.setItem("suite-notebook-v1:mockiX", "{broken");
    });
    await page.locator("#suite-tasks-open").click();
    await page.locator("#tb-add").click();
    await page.locator("#te-app").selectOption("mockiX");
    assert.equal(await page.locator("#te-save").isDisabled(), true);
    await page.locator("#te-app").selectOption("textiX");
    await page.locator("#te-text").fill("First notebook task");
    await page.locator("#te-save").click();
    await page.waitForFunction(
      () => !document.querySelector("#suite-task-editor").open,
    );
    const created = await page.evaluate(() =>
      JSON.parse(localStorage.getItem("suite-notebook-v1:textiX")),
    );
    assert.equal(created.tasks[0].text, "First notebook task");
    assert.equal(
      await page.evaluate(() =>
        localStorage.getItem("suite-notebook-v1:mockiX"),
      ),
      "{broken",
    );
    await page.locator("#tb-add").click();
    await page.setViewportSize({ width: 390, height: 844 });
    assert.ok(
      await page
        .locator("#suite-task-editor")
        .evaluate((e) => e.getBoundingClientRect().width <= innerWidth),
    );
    await page.screenshot({ path: "/tmp/task-editor-mobile.png" });
    assert.equal(aiCalls, 0);
    console.log(
      "PASS: task creation/editing in all 18 apps, native document preservation, completed flags/notes retained, stale-save rejection with draft preservation, new notebooks from desktop, corrupt-target recovery and mobile layout.",
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
