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
    const notebook = async () => {
      await page.locator("#suite-tasks-open").click();
      await page.locator("#tb-notes").click();
      await page.locator("#suite-notebook").waitFor({ state: "visible" });
    };
    const native = () =>
      page.evaluate(async () => {
        const a = window.SuiteWorkspaceAdapter || window.SuiteAgentAdapter;
        return a
          ? JSON.stringify(await a.snapshot())
          : document.querySelector("#command")?.value || "audit";
      });
    const primary = (app) =>
      page.evaluate(
        (app) => localStorage.getItem("suite-notebook-v1:" + app),
        app,
      );
    const draft = (app) =>
      page.evaluate(
        (app) => sessionStorage.getItem("suite-notebook-draft-v1:" + app),
        app,
      );
    const waitDraft = (app) =>
      page.waitForFunction(
        (app) =>
          sessionStorage.getItem("suite-notebook-draft-v1:" + app) !== null,
        app,
      );
    await page.goto(base + "/");
    const apps = await page.evaluate(() => SuiteApps.map((a) => a.id));
    assert.ok(apps.length >= 21);
    assert.equal(new Set(apps).size, apps.length);
    for (const app of apps) {
      console.log("Notebook draft " + app);
      await page.goto(base + "/" + app + "/");
      await page.waitForFunction(
        () =>
          window.SuiteWorkspaceAdapter?.snapshot ||
          window.SuiteAgentAdapter?.snapshot ||
          window.ShelliXDiagnostics,
      );
      await page.evaluate(
        (app) =>
          localStorage.setItem(
            "suite-notebook-v1:" + app,
            JSON.stringify(
              {
                format: "suite-notebook/v1",
                tool: app,
                title: "Saved title",
                notes: "Saved notes",
                tasks: [
                  { id: "one", text: "Existing task", done: false },
                  { id: "two", text: "Remove this task", done: true },
                ],
              },
              null,
              2,
            ),
          ),
        app,
      );
      const before = await primary(app),
        documentBefore = await native();
      await notebook();
      await page.locator("#nb-title").fill("Unsaved " + app);
      await page
        .locator("#nb-notes")
        .fill('Unsaved <script>throw Error("unsafe")</script>');
      await page
        .getByRole("button", {
          name: "Remove task Remove this task",
          exact: true,
        })
        .click();
      await page.locator("#nb-task").fill("New task");
      await page.locator("#nb-add button").click();
      await page
        .getByRole("checkbox", { name: "Complete task New task", exact: true })
        .check();
      await page
        .getByRole("textbox", { name: "Task text", exact: true })
        .first()
        .fill("");
      await waitDraft(app);
      assert.equal(await primary(app), before);
      assert.equal(await native(), documentBefore);
      // Reload immediately after a final keystroke to exercise the lifecycle flush, not just the timer.
      await page.locator("#nb-notes").fill("Latest notes " + app);
      await page.reload();
      await page.waitForFunction(
        () =>
          window.SuiteWorkspaceAdapter?.snapshot ||
          window.SuiteAgentAdapter?.snapshot ||
          window.ShelliXDiagnostics,
      );
      const afterReload = await native();
      await notebook();
      assert.match(
        await page.locator("#nb-recovery").textContent(),
        /Recovered unsaved/,
      );
      assert.equal(
        await page.locator("#nb-title").inputValue(),
        "Unsaved " + app,
      );
      assert.equal(
        await page.locator("#nb-notes").inputValue(),
        "Latest notes " + app,
      );
      const texts = page.getByRole("textbox", {
        name: "Task text",
        exact: true,
      });
      assert.equal(await texts.count(), 2);
      assert.equal(await texts.first().inputValue(), "");
      assert.equal(
        await page
          .getByRole("checkbox", {
            name: "Complete task New task",
            exact: true,
          })
          .isChecked(),
        true,
      );
      assert.equal(await primary(app), before);
      assert.equal(await native(), afterReload);
      await page.locator("#nb-save").click();
      assert.match(await page.locator("#nb-status").textContent(), /nonempty/);
      assert.equal(await primary(app), before);
      await texts.first().fill("Repaired task");
      await page.locator("#nb-save").click();
      assert.match(
        await page.locator("#nb-status").textContent(),
        /Notebook saved/,
      );
      assert.equal(await draft(app), null);
      const saved = JSON.parse(await primary(app));
      assert.equal(saved.notes, "Latest notes " + app);
      assert.equal(saved.tasks[0].text, "Repaired task");
      assert.equal(saved.tasks[1].done, true);
      await page.reload();
      await notebook();
      assert.equal(await page.locator("#nb-recovery").isHidden(), true);
      assert.equal(
        await page.locator("#nb-notes").inputValue(),
        "Latest notes " + app,
      );
      assert.equal(aiCalls, 0);
    }
    await page.goto(base + "/textiX/");
    await notebook();
    await page.locator("#nb-notes").fill("Keep this conflicting draft");
    await waitDraft("textiX");
    await page.locator("#nb-close").click();
    const other = await context.newPage();
    await other.goto(base + "/textiX/");
    assert.equal(
      await other.evaluate(() =>
        sessionStorage.getItem("suite-notebook-draft-v1:textiX"),
      ),
      null,
    );
    await other.evaluate(() => {
      const key = "suite-notebook-v1:textiX",
        d = JSON.parse(localStorage.getItem(key));
      d.notes = "Newer saved notes";
      localStorage.setItem(key, JSON.stringify(d));
    });
    const newer = await primary("textiX");
    await page.reload();
    await notebook();
    assert.equal(
      await page.locator("#nb-notes").inputValue(),
      "Keep this conflicting draft",
    );
    assert.match(
      await page.locator("#nb-recovery").textContent(),
      /Saved notes have changed/,
    );
    await page.locator("#nb-save").click();
    assert.match(
      await page.locator("#nb-status").textContent(),
      /changed in another tab/,
    );
    assert.equal(await primary("textiX"), newer);
    assert.ok(await draft("textiX"));
    await page.locator("#nb-reload").click();
    assert.equal(
      await page.locator("#nb-notes").inputValue(),
      "Newer saved notes",
    );
    assert.equal(await draft("textiX"), null);
    await other.close();
    // Corrupt recovery records are retained and cannot silently replace saved notes.
    await page.locator("#nb-close").click();
    await page.evaluate(() =>
      sessionStorage.setItem("suite-notebook-draft-v1:textiX", "{broken"),
    );
    await notebook();
    assert.match(
      await page.locator("#nb-recovery").textContent(),
      /could not be read/,
    );
    assert.equal(
      await page.locator("#nb-notes").inputValue(),
      "Newer saved notes",
    );
    await page.locator("#nb-notes").fill("In-memory repair");
    await page.locator("#nb-close").click();
    assert.equal(await draft("textiX"), "{broken");
    await notebook();
    await page.locator("#nb-reload").click();
    assert.equal(await draft("textiX"), null);
    // Storage failure leaves editing and the explicit saved-notebook action available.
    await page.evaluate(() => {
      window.draftSetItem = Storage.prototype.setItem;
      Storage.prototype.setItem = function (key, value) {
        if (this === sessionStorage) throw Error("Test session quota");
        return window.draftSetItem.call(this, key, value);
      };
    });
    await page.locator("#nb-notes").fill("Save despite unavailable recovery");
    await page.locator("#nb-close").click();
    await page.waitForFunction(() =>
      document
        .querySelector("#nb-recovery")
        .textContent.includes("recovery is unavailable"),
    );
    assert.match(
      await page.locator("#nb-recovery").textContent(),
      /recovery is unavailable/,
    );
    await notebook();
    assert.equal(
      await page.locator("#nb-notes").inputValue(),
      "Save despite unavailable recovery",
    );
    await page.locator("#nb-save").click();
    assert.equal(
      JSON.parse(await primary("textiX")).notes,
      "Save despite unavailable recovery",
    );
    await page.evaluate(() => {
      Storage.prototype.setItem = window.draftSetItem;
      delete window.draftSetItem;
    });
    // Navigation keeps drafts scoped to their app in the same tab.
    await page.locator("#nb-notes").fill("Recover after app switch");
    await page.goto(base + "/mockiX/");
    await notebook();
    assert.notEqual(
      await page.locator("#nb-notes").inputValue(),
      "Recover after app switch",
    );
    await page.goto(base + "/textiX/");
    await notebook();
    assert.equal(
      await page.locator("#nb-notes").inputValue(),
      "Recover after app switch",
    );
    await page.locator("#nb-save").click();
    // If saving succeeds but draft cleanup fails, opening again must not revive a stale version.
    await page.locator("#nb-notes").fill("Successful save with failed cleanup");
    await page.locator("#nb-close").click();
    await waitDraft("textiX");
    const retained = await draft("textiX");
    assert.ok(retained);
    await notebook();
    await page.evaluate(() => {
      window.draftRemoveItem = Storage.prototype.removeItem;
      Storage.prototype.removeItem = function (key) {
        if (this === sessionStorage) throw Error("Test cleanup denied");
        return window.draftRemoveItem.call(this, key);
      };
    });
    await page.locator("#nb-save").click();
    assert.equal(await draft("textiX"), retained);
    assert.match(
      await page.locator("#nb-recovery").textContent(),
      /could not be cleared/,
    );
    await page.reload();
    await notebook();
    assert.equal(await draft("textiX"), null);
    assert.equal(await page.locator("#nb-recovery").isHidden(), true);
    assert.equal(
      await page.locator("#nb-notes").inputValue(),
      "Successful save with failed cleanup",
    );
    await page.locator("#nb-notes").fill("Mobile draft");
    await page.locator("#nb-close").click();
    await notebook();
    await page.setViewportSize({ width: 390, height: 844 });
    assert.ok(
      await page
        .locator("#suite-notebook")
        .evaluate((e) => e.getBoundingClientRect().width <= innerWidth),
    );
    assert.ok(
      await page
        .locator("#suite-notebook")
        .evaluate((e) => e.scrollWidth <= e.clientWidth),
    );
    await page.screenshot({ path: "/tmp/notebook-draft-mobile.png" });
    assert.equal(aiCalls, 0);
    console.log(
      "PASS: all registered apps recover unsaved title, notes, task additions/removals, blank task text and completion flags after immediate refresh; saved/native documents preserved; successful save clears recovery; stale saved-version conflicts, tab/app isolation, corrupt-copy retention, storage/cleanup failures and mobile layout.",
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
