const assert = require("node:assert/strict"),
  { chromium } = require("playwright"),
  fs = require("node:fs/promises"),
  os = require("node:os"),
  path = require("node:path"),
  { spawn } = require("node:child_process");
if (!process.env.CATALOGUE_GROUP) {
  const apps = Object.keys(require("./core").names);
  for (let i = 0; i < apps.length; i += 3) {
    const result = require("node:child_process").spawnSync(
      process.execPath,
      [__filename],
      {
        env: {
          ...process.env,
          CATALOGUE_GROUP: apps.slice(i, i + 3).join(","),
        },
        stdio: "inherit",
        timeout: 90000,
      },
    );
    if (result.status !== 0)
      throw Error(
        "Catalogue browser group failed: " +
          apps.slice(i, i + 3).join(",") +
          " " +
          (result.error?.message || ""),
      );
  }
  console.log(
    `PASS: all ${apps.length} native catalogues across ${Math.ceil(apps.length / 3)} isolated browser groups.`,
  );
} else {
  (async () => {
    const folder = await fs.mkdtemp(
        path.join(os.tmpdir(), "native-catalogue-"),
      ),
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
        {
          cwd: path.resolve(__dirname, "../.."),
          stdio: ["ignore", "pipe", "pipe"],
        },
      );
    let browser;
    try {
      const base = await new Promise((resolve, reject) => {
        let out = "";
        server.stdout.on("data", (d) => {
          out += d;
          const m = out.match(/listening on (\S+)/);
          if (m) resolve("http://" + m[1]);
        });
        server.on("exit", () => reject(Error("Server stopped")));
        setTimeout(() => reject(Error("Startup timeout")), 10000).unref();
      });
      browser = await chromium.launch({
        executablePath: "/usr/bin/chromium",
        args: ["--no-sandbox"],
      });
      const page = await browser.newPage({
        viewport: { width: 1600, height: 1000 },
      });
      page.setDefaultTimeout(15000);
      page.on("dialog", (d) => d.accept());
      page.on("pageerror", (e) => console.log("PAGE ERROR " + e.message));
      let ai = 0;
      await page.route("**/api/chat", (r) => {
        ai++;
        return r.fulfill({ json: { text: "No calls expected" } });
      });
      await page.goto(base + "/");
      const apps = (
        await page.evaluate(() => SuiteApps.map((a) => a.id))
      ).filter((id) => process.env.CATALOGUE_GROUP.split(",").includes(id));
      await page.close();
      for (const app of apps) {
        console.log("Catalogue browsing " + app);
        const context = await browser.newContext({
          viewport: { width: 1500, height: 1000 },
        });
        const page = await context.newPage();
        page.on("dialog", (d) => d.accept());
        await page.route("**/api/chat", (r) => {
          ai++;
          return r.fulfill({ json: { text: "No calls expected" } });
        });
        await page.goto(base + "/" + app + "/");
        await page.waitForFunction(
          () =>
            window.SuiteWorkspaceAdapter?.snapshot ||
            window.SuiteAgentAdapter?.snapshot ||
            window.ShelliXDiagnostics,
        );
        await page.locator("#suite-catalogue-open").click();
        await page
          .locator("#suite-native-catalogue")
          .waitFor({ state: "visible" });
        const before = await page.evaluate(async () => {
          const A = window.SuiteWorkspaceAdapter || window.SuiteAgentAdapter;
          return A
            ? JSON.stringify(await A.snapshot())
            : document.querySelector("#shell-command").value;
        });
        const first = page.locator("#nc-list article").first(),
          name = await first.locator("strong").textContent();
        await first.getByRole("button", { name: /^Pin / }).click();
        await page.locator("#nc-view").selectOption("pinned");
        assert.equal(await page.locator("#nc-list article").count(), 1);
        assert.equal(
          await page.locator("#nc-list article strong").textContent(),
          name,
        );
        await page.evaluate(() => {
          window.catalogueReads = 0;
          const original = SuiteTemplates.list;
          SuiteTemplates.list = (...args) => {
            window.catalogueReads++;
            return original(...args);
          };
        });
        await page.locator("#nc-query").fill("no matching entry");
        assert.equal(await page.locator("#nc-list article").count(), 0);
        await page.locator("#nc-query").fill("");
        await page.locator("#nc-kind").selectOption("layout");
        assert.equal(await page.locator("#nc-list article").count(), 0);
        await page.locator("#nc-kind").selectOption("");
        assert.equal(await page.evaluate(() => catalogueReads), 0);
        await page.locator("#nc-list article button").first().click();
        if (await page.evaluate(() => !!window.SuiteWorkspace)) {
          await page.locator("#suite-workspace").waitFor({ state: "visible" });
          await page.waitForFunction(
            () => !document.querySelector("#sw-review").hidden,
          );
          await page.locator("#sw-discard").click();
          await page.locator("#sw-close").click();
          await page.locator("#suite-catalogue-open").click();
          await page
            .locator("#suite-native-catalogue")
            .waitFor({ state: "visible" });
        }
        await page.waitForFunction(
          (app) =>
            JSON.parse(localStorage.getItem("suite-catalogue-view:" + app))
              .recent.length === 1,
          app,
        );
        await page.locator("#nc-view").selectOption("recent");
        assert.equal(await page.locator("#nc-list article").count(), 1);
        await page.locator("#nc-clear-recent").click();
        assert.equal(await page.locator("#nc-list article").count(), 0);
        const after = await page.evaluate(async () => {
          const A = window.SuiteWorkspaceAdapter || window.SuiteAgentAdapter;
          return A
            ? JSON.stringify(await A.snapshot())
            : document.querySelector("#shell-command").value;
        });
        assert.equal(after, before);
        await page.reload();
        await page.locator("#suite-catalogue-open").click();
        await page
          .locator("#suite-native-catalogue")
          .waitFor({ state: "visible" });
        await page.locator("#nc-view").selectOption("pinned");
        assert.equal(await page.locator("#nc-list article").count(), 1);
        if (app === "textiX") {
          await page.evaluate(async () => {
            const document = SuiteWorkspaceAdapter.snapshot();
            await SuiteTemplates.putMany(
              "textiX",
              Array.from({ length: 75 }, (_, i) => ({
                details: {
                  name: "Saved example " + i,
                  description: "Saved variant",
                  tags: ["topic" + i],
                },
                document,
              })),
            );
          });
          await page.locator("#nc-view").selectOption("all");
          await page.evaluate(() => SuiteCatalogue.open());
          await page.waitForFunction(() =>
            document
              .querySelector("#nc-count")
              .textContent.startsWith("79 matching"),
          );
          assert.equal(await page.locator("#nc-list article").count(), 50);
          assert.equal(
            await page.locator("#nc-saved-list article").count(),
            50,
          );
          await page.locator("#nc-more").click();
          assert.equal(await page.locator("#nc-list article").count(), 79);
          await page.locator("#nc-query").fill("topic74");
          assert.equal(await page.locator("#nc-list article").count(), 1);
          await page
            .locator("#nc-list article")
            .getByRole("button", { name: /^Pin / })
            .click();
          await page.locator("#nc-view").selectOption("pinned");
          assert.equal(await page.locator("#nc-list article").count(), 1);
          await page.evaluate(() =>
            localStorage.setItem("suite-catalogue-view:textiX", "{broken"),
          );
          await page.locator("#nc-close").click();
          await page.locator("#suite-catalogue-open").click();
          await page.waitForFunction(() =>
            document
              .querySelector("#nc-status")
              .textContent.includes("unreadable"),
          );
          assert.equal(
            await page.evaluate(() =>
              localStorage.getItem("suite-catalogue-view:textiX"),
            ),
            "{broken",
          );
          await page.locator("#nc-reset-prefs").click();
          await page.locator("#nc-query").fill("");
          await page.locator("#nc-view").selectOption("all");
          assert.equal(await page.locator("#nc-list article").count(), 50);
          assert.equal(
            await page.evaluate(
              async () => (await SuiteTemplates.list("textiX")).length,
            ),
            75,
          );
          const other = await page.context().newPage();
          await other.goto(base + "/");
          await other.evaluate(() =>
            localStorage.setItem(
              "suite-catalogue-view:textiX",
              JSON.stringify({
                format: "suite-catalogue-view/v1",
                pinned: ["builtin:blue"],
                recent: [],
              }),
            ),
          );
          await page.waitForFunction(
            () =>
              document.querySelector("#nc-list article")?.dataset
                .catalogueKey === "builtin:blue",
          );
          await page.locator("#nc-view").selectOption("pinned");
          assert.equal(await page.locator("#nc-list article").count(), 1);
          await other.evaluate(() =>
            localStorage.setItem(
              "suite-catalogue-view:shelliX",
              JSON.stringify({
                format: "suite-catalogue-view/v1",
                pinned: ["builtin:starter-0"],
                recent: [],
              }),
            ),
          );
          assert.equal(await page.locator("#nc-list article").count(), 1);
          await other.close();
          await page.evaluate(() => {
            window.originalCatalogueList = SuiteTemplates.list;
            SuiteTemplates.list = async () => {
              throw Error("Unavailable storage fixture");
            };
          });
          await page.locator("#nc-close").click();
          await page.locator("#suite-catalogue-open").click();
          await page.waitForFunction(() =>
            document
              .querySelector("#nc-status")
              .textContent.includes("Built-in entries remain available"),
          );
          await page.locator("#nc-view").selectOption("all");
          assert.equal(await page.locator("#nc-list article").count(), 4);
          await page.evaluate(
            () => (SuiteTemplates.list = window.originalCatalogueList),
          );
          if (!(await page.locator("#nc-saved").evaluate((e) => e.open)))
            await page.locator("#nc-saved>summary").click();
          await page.locator("#nc-refresh-saved").click();
          await page.waitForFunction(() =>
            document
              .querySelector("#nc-count")
              .textContent.startsWith("79 matching"),
          );
          assert.equal(await page.locator("#nc-list article").count(), 50);
          await page.setViewportSize({ width: 390, height: 844 });
          assert.ok(
            await page
              .locator("#suite-native-catalogue")
              .evaluate((e) => e.getBoundingClientRect().width <= innerWidth),
          );
          await page.screenshot({ path: "/tmp/catalogue-browsing-mobile.png" });
        }
        assert.equal(ai, 0);
        await context.close();
      }
      console.log(
        "PASS: " +
          process.env.CATALOGUE_GROUP +
          " favourites, recent previews, persistence, read-only native previews and no AI requests.",
      );
    } finally {
      await browser?.close();
      server.kill();
      await new Promise((r) => server.once("exit", r));
      await fs.rm(folder, { recursive: true, force: true });
    }
  })().catch((e) => {
    console.error(e);
    process.exitCode = 1;
  });
}
