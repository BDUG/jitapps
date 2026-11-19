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
    page.on("dialog", (d) => d.accept());
    let aiCalls = 0;
    await context.route("**/api/chat", (route) => {
      aiCalls++;
      return route.fulfill({
        json: { text: "No automatic requests expected" },
      });
    });
    const raw = (app) =>
      page.evaluate(
        (app) => localStorage.getItem("suite-notebook-v1:" + app),
        app,
      );
    const undo = async (app, before) => {
      assert.equal(await page.locator("#tb-undo").isDisabled(), false);
      await page.locator("#tb-undo").click();
      assert.equal(await raw(app), before);
      assert.equal(await page.locator("#tb-undo").isDisabled(), true);
      assert.match(await page.locator("#tb-status").textContent(), /Undid/);
    };
    const saveTask = async (text) => {
      await page.locator("#te-text").fill(text);
      await page.locator("#te-save").click();
      await page.waitForFunction(
        () => !document.querySelector("#suite-task-editor").open,
      );
    };
    await page.goto(base + "/");
    const apps = await page.evaluate(() => SuiteApps.map((a) => a.id));
    assert.ok(apps.length >= 21);
    assert.equal(new Set(apps).size, apps.length);
    for (const app of apps) {
      console.log("Task undo " + app);
      await page.goto(base + "/" + app + "/");
      await page.waitForFunction(
        () =>
          window.SuiteWorkspaceAdapter?.snapshot ||
          window.SuiteAgentAdapter?.snapshot ||
          window.ShelliXDiagnostics,
      );
      const native = await page.evaluate(async () => {
        const a = window.SuiteWorkspaceAdapter || window.SuiteAgentAdapter;
        return a
          ? JSON.stringify(await a.snapshot())
          : document.querySelector("#command")?.value || "audit";
      });
      await page.evaluate(
        (app) =>
          localStorage.setItem(
            "suite-notebook-v1:" + app,
            JSON.stringify(
              {
                format: "suite-notebook/v1",
                tool: app,
                title: "Keep title",
                notes: "Keep notes",
                tasks: [
                  { id: "open", text: "Open task", done: false },
                  { id: "done", text: "Completed task", done: true },
                ],
              },
              null,
              2,
            ),
          ),
        app,
      );
      const before = await raw(app);
      await page.locator("#suite-tasks-open").click();
      await page.locator("#tb-app").selectOption(app);
      await page.locator("#tb-filter").selectOption("all");
      assert.equal(await page.locator("#tb-undo").isDisabled(), true);
      await page
        .getByRole("button", { name: "Edit Open task", exact: true })
        .click();
      await saveTask("Open task");
      assert.equal(await raw(app), before);
      assert.equal(await page.locator("#tb-undo").isDisabled(), true);
      await page
        .getByRole("checkbox", { name: "Complete Open task", exact: true })
        .check();
      assert.equal(JSON.parse(await raw(app)).tasks[0].done, true);
      await undo(app, before);
      await page
        .getByRole("button", { name: "Edit Completed task", exact: true })
        .click();
      await saveTask("Updated completed task");
      assert.equal(
        JSON.parse(await raw(app)).tasks[1].text,
        "Updated completed task",
      );
      assert.equal(JSON.parse(await raw(app)).tasks[1].done, true);
      await undo(app, before);
      await page.locator("#tb-add").click();
      await saveTask("New task");
      assert.equal(JSON.parse(await raw(app)).tasks.length, 3);
      await undo(app, before);
      await page.locator("#tb-file").setInputFiles({
        name: "worklist.json",
        mimeType: "application/json",
        buffer: Buffer.from(
          JSON.stringify({
            format: "suite-worklist/v1",
            tasks: [
              {
                tool: "mockiX",
                title: "Incoming work",
                task: { id: "new", text: "Imported task", done: true },
              },
            ],
          }),
        ),
      });
      await page
        .locator("#suite-worklist-import")
        .waitFor({ state: "visible" });
      assert.equal(await page.locator("#wi-app").inputValue(), app);
      await page.locator("#wi-apply").click();
      await page.waitForFunction(
        () => !document.querySelector("#suite-worklist-import").open,
      );
      assert.equal(JSON.parse(await raw(app)).tasks.length, 3);
      await undo(app, before);
      // Same-tab writes don't emit storage events; the final raw-value guard still protects them.
      await page
        .getByRole("checkbox", { name: "Complete Open task", exact: true })
        .check();
      await page.evaluate((app) => {
        const key = "suite-notebook-v1:" + app,
          doc = JSON.parse(localStorage.getItem(key));
        doc.notes = "Newer saved notes";
        localStorage.setItem(key, JSON.stringify(doc));
      }, app);
      const newer = await raw(app);
      await page.locator("#tb-undo").click();
      assert.match(
        await page.locator("#tb-status").textContent(),
        /preserve newer work/,
      );
      assert.equal(await raw(app), newer);
      assert.equal(
        await page.evaluate(async () => {
          const a = window.SuiteWorkspaceAdapter || window.SuiteAgentAdapter;
          return a
            ? JSON.stringify(await a.snapshot())
            : document.querySelector("#command")?.value || "audit";
        }),
        native,
      );
      assert.equal(aiCalls, 0);
    }
    await page.goto(base + "/");
    await page.evaluate(() =>
      localStorage.removeItem("suite-notebook-v1:textiX"),
    );
    await page.locator("#suite-tasks-open").click();
    await page.locator("#tb-app").selectOption("textiX");
    await page.locator("#tb-filter").selectOption("all");
    await page.locator("#tb-add").click();
    await saveTask("First task");
    const created = await raw("textiX");
    await page.locator("#tb-close").click();
    await page.locator("#suite-tasks-open").click();
    assert.equal(await page.locator("#tb-undo").isDisabled(), false);
    // A later failed write must preserve the previous undo record and the unsaved task text.
    await page.evaluate(() => {
      window.taskUndoSetItem = Storage.prototype.setItem;
      Storage.prototype.setItem = function (key, value) {
        if (key === "suite-notebook-v1:textiX")
          throw new DOMException("Test storage full", "QuotaExceededError");
        return window.taskUndoSetItem.call(this, key, value);
      };
    });
    await page.locator("#tb-add").click();
    await page.locator("#te-text").fill("Unsaved task");
    await page.locator("#te-save").click();
    assert.match(
      await page.locator("#te-status").textContent(),
      /storage full/,
    );
    assert.equal(await page.locator("#te-text").inputValue(), "Unsaved task");
    await page.locator("#te-cancel").click();
    assert.equal(await raw("textiX"), created);
    await page.evaluate(() => {
      Storage.prototype.setItem = window.taskUndoSetItem;
      delete window.taskUndoSetItem;
    });
    await undo("textiX", null);
    // Only the latest successful action is retained; a no-op edit doesn't consume it.
    await page.locator("#tb-add").click();
    await saveTask("First task");
    await page.locator("#tb-add").click();
    await saveTask("Second task");
    const second = await raw("textiX");
    await page
      .getByRole("button", { name: "Edit Second task", exact: true })
      .click();
    await saveTask("Second task");
    assert.equal(await raw("textiX"), second);
    await page.locator("#tb-undo").click();
    assert.deepEqual(
      JSON.parse(await raw("textiX")).tasks.map((t) => t.text),
      ["First task"],
    );
    assert.equal(await page.locator("#tb-undo").isDisabled(), true);
    // Failed undo must also retain the record for a retry.
    await page
      .getByRole("checkbox", { name: "Complete First task", exact: true })
      .check();
    const completed = await raw("textiX");
    await page.evaluate(() => {
      window.taskUndoSetItem = Storage.prototype.setItem;
      Storage.prototype.setItem = function (key, value) {
        if (key === "suite-notebook-v1:textiX")
          throw Error("Test write blocked");
        return window.taskUndoSetItem.call(this, key, value);
      };
    });
    await page.locator("#tb-undo").click();
    assert.match(
      await page.locator("#tb-status").textContent(),
      /write blocked/,
    );
    assert.equal(await raw("textiX"), completed);
    assert.equal(await page.locator("#tb-undo").isDisabled(), false);
    await page.evaluate(() => {
      Storage.prototype.setItem = window.taskUndoSetItem;
      delete window.taskUndoSetItem;
    });
    await page.locator("#tb-undo").click();
    assert.equal(JSON.parse(await raw("textiX")).tasks[0].done, false);
    // A real second window updates the board but cannot be overwritten by Undo.
    await page
      .getByRole("checkbox", { name: "Complete First task", exact: true })
      .check();
    const other = await context.newPage();
    await other.goto(base + "/");
    await other.evaluate(() => {
      const key = "suite-notebook-v1:textiX",
        d = JSON.parse(localStorage.getItem(key));
      d.notes = "Other window notes";
      localStorage.setItem(key, JSON.stringify(d));
    });
    await page.waitForFunction(() =>
      document
        .querySelector("#tb-status")
        .textContent.includes("another window"),
    );
    const external = await raw("textiX");
    await page.locator("#tb-undo").click();
    assert.match(
      await page.locator("#tb-status").textContent(),
      /preserve newer work/,
    );
    assert.equal(await raw("textiX"), external);
    await other.close();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator("#tb-undo").scrollIntoViewIfNeeded();
    assert.ok(
      await page
        .locator("#suite-task-board")
        .evaluate((e) => e.scrollWidth <= e.clientWidth),
    );
    assert.ok(
      await page
        .locator("#tb-undo")
        .evaluate((e) => e.getBoundingClientRect().right <= innerWidth),
    );
    await page.screenshot({ path: "/tmp/task-undo-mobile.png" });
    await page.locator("#tb-close").click();
    await page.reload();
    await page.locator("#suite-tasks-open").click();
    assert.equal(await page.locator("#tb-undo").isDisabled(), true);
    assert.equal(await raw("textiX"), external);
    assert.equal(aiCalls, 0);
    console.log(
      "PASS: exact undo for status, text, creation and import in all registered apps; source conflicts, new-notebook removal, no-op and failed-write preservation, failed-undo retry, cross-window protection, session lifecycle, mobile layout and native document preservation.",
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
