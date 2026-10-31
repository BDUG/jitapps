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
    const packet = {
      format: "suite-worklist/v1",
      tasks: [
        {
          tool: "textiX",
          title: "Source notebook",
          task: { id: "a", text: "Existing task", done: true },
        },
        {
          tool: "mockiX",
          title: "Other source",
          task: { id: "b", text: "Imported task", done: true },
        },
      ],
    };
    const upload = {
      name: "worklist.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(packet)),
    };
    for (const app of apps) {
      console.log("Worklist " + app);
      await page.goto(base + "/" + app + "/");
      await page.evaluate(
        (app) =>
          localStorage.setItem(
            "suite-notebook-v1:" + app,
            JSON.stringify({
              format: "suite-notebook/v1",
              tool: app,
              title: "Keep title",
              notes: "Keep notes",
              tasks: [{ id: "original", text: "Existing task", done: false }],
            }),
          ),
        app,
      );
      await page.locator("#suite-tasks-open").click();
      const before = await page.evaluate(
        (app) => localStorage.getItem("suite-notebook-v1:" + app),
        app,
      );
      await page.locator("#tb-file").setInputFiles(upload);
      await page
        .locator("#suite-worklist-import")
        .waitFor({ state: "visible" });
      assert.equal(await page.locator("#wi-app").inputValue(), app);
      assert.match(
        await page.locator("#wi-count").textContent(),
        /1 tasks to add · 1 identical-text/,
      );
      assert.equal(
        await page.evaluate(
          (app) => localStorage.getItem("suite-notebook-v1:" + app),
          app,
        ),
        before,
      );
      await page.locator("#wi-apply").click();
      await page.waitForFunction(
        () => !document.querySelector("#suite-worklist-import").open,
      );
      const saved = await page.evaluate(
        (app) => JSON.parse(localStorage.getItem("suite-notebook-v1:" + app)),
        app,
      );
      assert.equal(saved.tasks.length, 2);
      assert.equal(saved.tasks[0].done, false);
      assert.equal(saved.tasks[1].done, true);
      assert.equal(saved.notes, "Keep notes");
      assert.equal(saved.title, "Keep title");
      await page.locator("#tb-app").selectOption(app);
      await page.locator("#tb-filter").selectOption("all");
      await page.locator("#tb-select").click();
      const download = page.waitForEvent("download");
      await page.locator("#tb-worklist").click();
      const exported = JSON.parse(
        await fs.readFile(await (await download).path(), "utf8"),
      );
      assert.equal(exported.format, "suite-worklist/v1");
      assert.equal(exported.tasks.length, 2);
      await page.locator("#tb-file").setInputFiles(upload);
      await page
        .locator("#suite-worklist-import")
        .waitFor({ state: "visible" });
      assert.equal(await page.locator("#wi-apply").isDisabled(), true);
      await page.locator("#wi-cancel").click();
      assert.equal(aiCalls, 0);
    }
    // Stale preview refuses to overwrite a newer saved notebook.
    const next = {
      ...packet,
      tasks: [
        {
          tool: "textiX",
          title: "Source",
          task: { id: "c", text: "New incoming task", done: false },
        },
      ],
    };
    await page
      .locator("#tb-file")
      .setInputFiles({
        name: "next.json",
        mimeType: "application/json",
        buffer: Buffer.from(JSON.stringify(next)),
      });
    await page.locator("#suite-worklist-import").waitFor({ state: "visible" });
    await page.evaluate(() => {
      const key =
          "suite-notebook-v1:" + document.querySelector("#wi-app").value,
        d = JSON.parse(localStorage.getItem(key));
      d.notes = "Newer notes";
      localStorage.setItem(key, JSON.stringify(d));
    });
    await page.locator("#wi-apply").click();
    assert.match(await page.locator("#wi-status").textContent(), /changed/);
    await page.locator("#wi-cancel").click();
    await page
      .locator("#tb-file")
      .setInputFiles({
        name: "bad.json",
        mimeType: "application/json",
        buffer: Buffer.from('{"format":"wrong"}'),
      });
    await page.waitForFunction(() =>
      document
        .querySelector("#tb-status")
        .textContent.includes("Choose a suite worklist"),
    );
    assert.equal(
      await page.locator("#suite-worklist-import").isVisible(),
      false,
    );
    assert.equal(aiCalls, 0);
    console.log(
      "PASS: reviewed worklist import/export across all 18 apps, preserved title/notes/status, duplicate imports, stale-preview protection, invalid-file rejection and zero AI calls.",
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
