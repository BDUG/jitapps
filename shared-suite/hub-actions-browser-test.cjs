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
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    let aiCalls = 0,
      commandCalls = 0;
    await context.route("**/api/chat", (r) => {
      aiCalls++;
      return r.fulfill({ json: { text: "Unexpected automatic request" } });
    });
    page.on("request", (r) => {
      if (r.url().includes("/api/agent") && r.method() === "POST") {
        try {
          const body = r.postDataJSON();
          if (["run", "execute", "tool", "step"].includes(body?.op))
            commandCalls++;
        } catch {}
      }
    });
    const open = async (query) => {
      await page.locator("#suite-hub-open").click();
      await page.locator("#hub-search").fill(query);
    };
    const native = () =>
      page.evaluate(async () => {
        const a = window.SuiteWorkspaceAdapter || window.SuiteAgentAdapter;
        return a
          ? JSON.stringify(await a.snapshot())
          : document.querySelector("#shell-command")?.value || "desktop";
      });
    const actions = [
      {
        id: "tasks",
        query: "notes checklist",
        dialog: "#suite-task-board",
        close: "#tb-close",
      },
      {
        id: "review",
        query: "quality review",
        dialog: "#suite-review",
        close: "#rv-close",
      },
      {
        id: "catalogue",
        query: "native templates",
        dialog: "#suite-native-catalogue",
        close: "#nc-close",
      },
      {
        id: "workspace",
        query: "workspace commands",
        dialog: "#suite-workspace",
        close: "#sw-close",
      },
      {
        id: "disk",
        query: "virtual disk",
        dialog: "#suite-disk-dialog",
        close: "#sd-close",
      },
    ];
    await page.goto(base + "/");
    await page.waitForFunction(() => window.SuiteHub);
    const apps = await page.evaluate(() => SuiteApps.map((a) => a.id));
    assert.ok(apps.length >= 21);
    assert.equal(new Set(apps).size, apps.length);
    await open("");
    assert.equal(await page.locator("#hub-actions button").count(), 2);
    assert.equal(await page.locator("#hub-apps a").count(), apps.length);
    await page.locator("#hub-search").fill("quality review");
    assert.equal(await page.locator("#hub-actions button").count(), 0);
    assert.equal(await page.locator("#hub-apps a").count(), 0);
    await page.locator("#hub-search").fill("notes checklist");
    await page.locator("#hub-search").press("Enter");
    await page.locator("#suite-task-board").waitFor({ state: "visible" });
    await page.locator("#tb-close").click();
    for (const app of apps) {
      console.log("Workspace actions " + app);
      await page.goto(base + "/" + app + "/");
      await page.waitForFunction(
        () =>
          window.SuiteHub &&
          (window.SuiteWorkspaceAdapter?.snapshot ||
            window.SuiteAgentAdapter?.snapshot ||
            window.ShelliXDiagnostics),
      );
      await page.waitForSelector("#suite-workspace-open");
      const before = await native();
      for (const action of actions) {
        await open(action.query);
        const button = page.locator('[data-hub-action="' + action.id + '"]');
        assert.equal(await button.count(), 1, app + " " + action.id);
        assert.equal(await button.isDisabled(), false);
        if (action.id === "tasks") {
          await page.locator("#hub-search").press("ArrowDown");
          assert.equal(
            await button.evaluate((e) => e === document.activeElement),
            true,
          );
          await page.keyboard.press("ArrowUp");
          assert.equal(
            await page
              .locator("#hub-search")
              .evaluate((e) => e === document.activeElement),
            true,
          );
          await page.locator("#hub-search").press("Enter");
        } else await button.click();
        const dialog =
            app === "shelliX" && action.id === "workspace"
              ? "#shell-workspace"
              : action.dialog,
          close =
            app === "shelliX" && action.id === "workspace"
              ? "#shell-workspace-close"
              : action.close;
        await page.locator(dialog).waitFor({ state: "visible" });
        assert.equal(await page.locator("#suite-hub").isVisible(), false);
        if (action.id === "review")
          await page.waitForFunction(() =>
            document
              .querySelector("#rv-status")
              .textContent.includes("Review refreshed"),
          );
        if (action.id === "catalogue")
          await page.waitForFunction(
            () => document.querySelector("#nc-list").children.length > 0,
          );
        assert.equal(
          await native(),
          before,
          app + " " + action.id + " changed document",
        );
        await page.locator(close).click();
      }
      assert.equal(aiCalls, 0);
      assert.equal(commandCalls, 0);
    }
    // Current controls are authoritative even if their state changes after rendering.
    await open("templates");
    await page.evaluate(
      () => (document.querySelector("#suite-catalogue-open").disabled = true),
    );
    await page.locator('[data-hub-action="catalogue"]').click();
    assert.equal(await page.locator("#suite-hub").isVisible(), true);
    assert.equal(
      await page.locator('[data-hub-action="catalogue"]').isDisabled(),
      true,
    );
    assert.match(
      await page.locator("#hub-status").textContent(),
      /unavailable/,
    );
    await page.evaluate(
      () => (document.querySelector("#suite-catalogue-open").disabled = false),
    );
    await page.locator("#hub-search").fill("");
    assert.equal(
      await page.locator('[data-hub-action="catalogue"]').isDisabled(),
      false,
    );
    // Re-rendering retains result nodes so keyboard focus and pin controls stay stable.
    await page.evaluate(
      () =>
        (window.originalAction = document.querySelector(
          '[data-hub-action="tasks"]',
        )),
    );
    await page.locator("#hub-search").fill("notes checklist");
    await page.locator("#hub-search").fill("");
    assert.equal(
      await page.evaluate(
        () =>
          originalAction ===
          document.querySelector('[data-hub-action="tasks"]'),
      ),
      true,
    );
    await page.locator("#hub-search").press("ArrowDown");
    await page.keyboard.press("End");
    assert.equal(
      await page
        .locator("#hub-apps a")
        .last()
        .evaluate((e) => e === document.activeElement),
      true,
    );
    await page.keyboard.press("Home");
    assert.equal(
      await page
        .locator("#hub-actions button")
        .first()
        .evaluate((e) => e === document.activeElement),
      true,
    );
    await page.keyboard.press("ArrowUp");
    assert.equal(
      await page
        .locator("#hub-search")
        .evaluate((e) => e === document.activeElement),
      true,
    );
    await page.locator("#hub-search").fill("codeiX");
    assert.equal(await page.locator("#hub-apps a").count(), 1);
    assert.equal(await page.locator("#hub-actions button").count(), 0);
    await page.getByRole("button", { name: "Pin codeiX", exact: true }).click();
    assert.equal(
      await page
        .getByRole("button", { name: "Unpin codeiX", exact: true })
        .evaluate((e) => e === document.activeElement),
      true,
    );
    await page.locator("#hub-search").fill("templates");
    await page.setViewportSize({ width: 390, height: 844 });
    assert.ok(
      await page
        .locator("#suite-hub")
        .evaluate(
          (e) =>
            e.getBoundingClientRect().right <= innerWidth &&
            e.scrollWidth <= e.clientWidth,
        ),
    );
    await page.screenshot({ path: "/tmp/hub-actions-mobile.png" });
    assert.equal(aiCalls, 0);
    assert.equal(commandCalls, 0);
    assert.deepEqual(errors, []);
    console.log(
      "PASS: real Tasks, Review, native catalogue, document/shell Workspace and Virtual disk launches in all registered apps; desktop availability, token search, live disabled guards, unified keyboard navigation, stable result nodes, pin focus, native documents preserved, zero AI/command execution and mobile layout.",
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
