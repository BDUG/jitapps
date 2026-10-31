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
    "PASS: all 18 native catalogues across six isolated browser groups.",
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
        const page = await browser.newPage({
          viewport: { width: 1600, height: 1000 },
        });
        page.setDefaultTimeout(15000);
        page.on("dialog", (d) => d.accept());
        page.on("pageerror", (e) => console.log("PAGE ERROR " + e.message));
        await page.route("**/api/chat", (r) => {
          ai++;
          return r.fulfill({ json: { text: "No calls expected" } });
        });
        console.log("Catalogue " + app);
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
        assert.equal(await page.locator("#nc-list article").count(), 4);
        const result = await page.evaluate(async (app) => {
          const seeds = await (
              await fetch("../shared-suite/catalogue/seeds.json")
            ).json(),
            A = window.SuiteWorkspaceAdapter || window.SuiteAgentAdapter,
            before = A ? await A.snapshot() : null;
          for (const entry of SuiteNativeCatalogue.entries(app)) {
            if (app === "shelliX") {
              const d = SuiteNativeCatalogue.create(app, entry.id, seeds, {});
              if (!d.command || d.timeout !== 10000)
                throw Error("Invalid snippet");
              continue;
            }
            if (app === "projectiX" && entry.kind === "layout") continue;
            const candidate = SuiteNativeCatalogue.create(
              app,
              entry.id,
              seeds,
              before,
            );
            try {
              await A.validate(candidate, before);
            } catch (e) {
              throw Error(entry.id + ": " + e.message);
            }
          }
          return A
            ? JSON.stringify(await A.snapshot()) === JSON.stringify(before)
            : true;
        }, app);
        assert.equal(result, true);
        console.log("Validated " + app);
        await page.locator("#nc-query").fill("no matching entry");
        assert.equal(await page.locator("#nc-list article").count(), 0);
        await page.locator("#nc-query").fill("");
        await page.locator("#nc-list article button").first().click();
        if (app === "mockiX" || app === "shelliX") {
          await page.waitForFunction(
            () => !document.querySelector("#nc-preview").hidden,
          );
          assert.equal(await page.locator("#nc-apply").isVisible(), true);
          await page.locator("#nc-save").click();
          await page.waitForFunction(() =>
            document
              .querySelector("#nc-status")
              .textContent.includes("Editable copy saved"),
          );
          await page.locator("#nc-saved").evaluate((e) => (e.open = true));
          await page.waitForFunction(() =>
            document.querySelector("#nc-saved-list button"),
          );
          assert.ok(await page.locator("#nc-saved-list").textContent());
        } else {
          await page.locator("#suite-workspace").waitFor({ state: "visible" });
          await page.waitForFunction(
            () => !document.querySelector("#sw-review").hidden,
          );
          await page.locator("#sw-apply").click();
          await page.waitForFunction(() =>
            document
              .querySelector("#sw-status")
              .textContent.startsWith("Updated"),
          );
        }
        if (app === "mockiX" || app === "shelliX") {
          await page.locator("#nc-apply").click();
          await page.waitForFunction(
            () =>
              document
                .querySelector("#nc-status")
                .textContent.includes("applied") ||
              document
                .querySelector("#nc-status")
                .textContent.includes("Snippet loaded"),
          );
        }
        if (app === "projectiX") {
          await page.locator("#sw-close").click();
          await page.locator("#suite-catalogue-open").click();
          const before = await page.evaluate(() =>
            JSON.stringify(SuiteWorkspaceAdapter.snapshot()),
          );
          await page
            .getByRole("button", {
              name: "Preview Compact timeline",
              exact: true,
            })
            .click();
          await page.locator("#nc-apply").click();
          assert.equal(
            await page.evaluate(() =>
              JSON.stringify(SuiteWorkspaceAdapter.snapshot()),
            ),
            before,
          );
          await page.setViewportSize({ width: 390, height: 844 });
          assert.ok(
            await page
              .locator("#suite-native-catalogue")
              .evaluate((e) => e.getBoundingClientRect().width <= innerWidth),
          );
          await page.screenshot({ path: "/tmp/native-catalogue-mobile.png" });
        }
        assert.equal(ai, 0);
        console.log("Previewed " + app);
        await page.close();
      }
      console.log(
        "PASS group: " +
          process.env.CATALOGUE_GROUP +
          " native validation, explicit application, source-preserving previews and zero AI requests.",
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
