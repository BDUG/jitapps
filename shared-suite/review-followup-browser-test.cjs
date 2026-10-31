const assert = require("node:assert/strict"),
  { chromium } = require("playwright"),
  fs = require("node:fs/promises"),
  os = require("node:os"),
  path = require("node:path"),
  { spawn } = require("node:child_process");
(async () => {
  const folder = await fs.mkdtemp(path.join(os.tmpdir(), "suite-review-")),
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
      viewport: { width: 1500, height: 1000 },
    });
    let aiCalls = 0;
    await page.route("**/api/chat", (r) => {
      aiCalls++;
      return r.fulfill({ json: { text: "No requests expected" } });
    });
    await page.goto(base + "/");
    const apps = await page.evaluate(() => SuiteApps.map((a) => a.id));
    for (const app of apps) {
      console.log("Review follow-up " + app);
      await page.goto(base + "/" + app + "/");
      await page.waitForFunction(
        () =>
          window.SuiteWorkspaceAdapter?.snapshot ||
          window.SuiteAgentAdapter?.snapshot ||
          window.ShelliXDiagnostics,
      );
      await page.locator("#suite-review-open").click();
      await page.waitForFunction(() =>
        document
          .querySelector("#rv-status")
          ?.textContent.includes("Review refreshed"),
      );
      // Exercise native snapshot and composer routing with one deterministic advisory.
      await page.evaluate(() => {
        const original = SuiteReviewCore.report;
        SuiteReviewCore.report = (...args) => {
          const r = original(...args);
          r.findings.push({
            severity: "info",
            code: "followup-fixture",
            path: "document",
            message: "Check review follow-up fixture",
          });
          r.counts.info++;
          return r;
        };
      });
      await page.locator("#rv-refresh").click();
      await page.waitForFunction(
        () => !document.querySelector("#rv-refresh").disabled,
      );
      await page.locator("#rv-query").fill("followup-fixture");
      await page.locator("#rv-select").click();
      const selector =
        app === "codeiX"
          ? "#ag-goal"
          : app === "shelliX"
            ? "#prompt"
            : "#sai-prompt";
      await page.locator(selector).evaluate((e) => {
        e.value = "Preserve existing draft";
        e.dispatchEvent(new Event("input", { bubbles: true }));
      });
      const before = await page.evaluate(async () => {
        const adapter =
          window.SuiteWorkspaceAdapter || window.SuiteAgentAdapter;
        return adapter
          ? JSON.stringify(await adapter.snapshot())
          : JSON.stringify(
              (({ findings, limitations }) => ({ findings, limitations }))(
                ShelliXDiagnostics.report(),
              ),
            );
      });
      await page.locator("#rv-intent").selectOption("verify");
      const download = page.waitForEvent("download");
      await page.locator("#rv-brief").click();
      const text = await fs.readFile(await (await download).path(), "utf8");
      assert.match(text, /Do not modify content or run commands/);
      assert.match(text, /followup-fixture/);
      assert.equal(
        await page.locator(selector).inputValue(),
        "Preserve existing draft",
      );
      // Read-only and exact maxlength guards leave the existing composer intact.
      await page.locator(selector).evaluate((e) => (e.readOnly = true));
      await page.locator("#rv-draft").click();
      await page.waitForFunction(() =>
        document
          .querySelector("#rv-status")
          .textContent.includes("Finish the active operation"),
      );
      await page.locator(selector).evaluate((e) => {
        e.readOnly = false;
        e.dataset.oldMax = e.maxLength;
        e.maxLength = e.value.length + 1;
      });
      await page.locator("#rv-draft").click();
      await page.waitForFunction(() =>
        document.querySelector("#rv-status").textContent.includes("too long"),
      );
      assert.equal(
        await page.locator(selector).inputValue(),
        "Preserve existing draft",
      );
      await page.locator(selector).evaluate((e) => {
        const max = Number(e.dataset.oldMax);
        if (max < 0) e.removeAttribute("maxlength");
        else e.maxLength = max;
      });
      await page.locator("#rv-draft").click();
      await page.waitForFunction(
        () => !document.querySelector("#suite-review").open,
      );
      assert.match(
        await page.locator(selector).inputValue(),
        /^Preserve existing draft\n\n## Review follow-up: verify/,
      );
      assert.ok(await page.locator(selector).isVisible());
      const after = await page.evaluate(async () => {
        const adapter =
          window.SuiteWorkspaceAdapter || window.SuiteAgentAdapter;
        return adapter
          ? JSON.stringify(await adapter.snapshot())
          : JSON.stringify(
              (({ findings, limitations }) => ({ findings, limitations }))(
                ShelliXDiagnostics.report(),
              ),
            );
      });
      assert.equal(after, before);
      assert.equal(aiCalls, 0);
    }
    // codeiX exclusion metadata blocks both AI preparation paths.
    await page.goto(base + "/codeiX/");
    await page.waitForFunction(() => window.SuiteWorkspaceAdapter?.snapshot);
    await page.locator("#suite-review-open").click();
    await page.waitForFunction(() =>
      document
        .querySelector("#rv-status")
        ?.textContent.includes("Review refreshed"),
    );
    await page.evaluate(() => {
      const original = SuiteWorkspaceAdapter.snapshot;
      SuiteWorkspaceAdapter.snapshot = () => ({
        ...original(),
        aiExcluded: ["private.txt"],
      });
      const report = SuiteReviewCore.report;
      SuiteReviewCore.report = (...args) => {
        const r = report(...args);
        r.findings.push({
          severity: "info",
          code: "private-fixture",
          path: "private.txt",
          message: "Private reference",
        });
        r.counts.info++;
        return r;
      };
    });
    await page.locator("#rv-refresh").click();
    await page.waitForFunction(
      () => !document.querySelector("#rv-refresh").disabled,
    );
    await page.locator("#rv-select").click();
    for (const id of ["rv-draft", "rv-brief"]) {
      await page.locator("#" + id).click();
      await page.waitForFunction(() =>
        document
          .querySelector("#rv-status")
          .textContent.includes("AI-excluded"),
      );
    }
    // Changing the captured source rejects drafting before touching the composer.
    await page.evaluate(() => {
      const original = SuiteWorkspaceAdapter.snapshot;
      SuiteWorkspaceAdapter.snapshot = () => ({
        ...original(),
        name: "Changed after capture",
      });
    });
    await page.locator("#rv-draft").click();
    await page.waitForFunction(() =>
      document
        .querySelector("#rv-status")
        .textContent.includes("changed after this review"),
    );
    await page.setViewportSize({ width: 390, height: 844 });
    assert.ok(
      await page
        .locator("#suite-review")
        .evaluate((e) => e.getBoundingClientRect().width <= innerWidth),
    );
    await page.screenshot({ path: "/tmp/review-followup-mobile.png" });
    assert.equal(aiCalls, 0);
    console.log(
      "PASS: follow-up briefs in all 18 native app composers, independent exports, preserved drafts/documents, read-only and size guards, codeiX exclusions and zero AI requests.",
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
