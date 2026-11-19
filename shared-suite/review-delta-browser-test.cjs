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
    page.on("dialog", (d) => d.accept());
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    let aiCalls = 0;
    await page.route("**/api/chat", (r) => {
      aiCalls++;
      return r.fulfill({ json: { text: "No automatic requests expected" } });
    });
    const ready = () =>
      page.waitForFunction(
        () =>
          window.SuiteWorkspaceAdapter?.snapshot ||
          window.SuiteAgentAdapter?.snapshot ||
          window.ShelliXDiagnostics,
      );
    const native = () =>
      page.evaluate(async () => {
        const a = window.SuiteWorkspaceAdapter || window.SuiteAgentAdapter;
        return a
          ? JSON.stringify(await a.snapshot())
          : JSON.stringify(
              (({ findings, limitations }) => ({ findings, limitations }))(
                ShelliXDiagnostics.report(),
              ),
            );
      });
    const refresh = async () => {
      await page.locator("#rv-refresh").click();
      await page.waitForFunction(
        () => !document.querySelector("#rv-refresh").disabled,
      );
    };
    const download = async (button) => {
      if (
        button === "#rv-delta-export" &&
        !(await page.locator("#rv-comparison").evaluate((e) => e.open))
      )
        await page.locator("#rv-delta-count").click();
      const d = page.waitForEvent("download");
      await page.locator(button).click();
      return JSON.parse(await fs.readFile(await (await d).path(), "utf8"));
    };
    const f = (code, message) => ({
      severity: "warning",
      code: "delta-" + code,
      path: "document." + code,
      message,
    });
    const old = [
        f("retired", "Previous finding <script>literal</script>"),
        f("kept", "Conserved review finding"),
      ],
      next = [old[1], f("new", "New finding")];
    await page.goto(base + "/");
    const apps = await page.evaluate(() => SuiteApps.map((a) => a.id));
    assert.ok(apps.length >= 21);
    assert.equal(new Set(apps).size, apps.length);
    for (const app of apps) {
      console.log("Review comparison " + app);
      await page.goto(base + "/" + app + "/");
      await ready();
      const before = await native(),
        notebook = await page.evaluate(
          (app) => localStorage.getItem("suite-notebook-v1:" + app),
          app,
        );
      await page.locator("#suite-review-open").click();
      await page.waitForFunction(() =>
        document
          .querySelector("#rv-status")
          ?.textContent.includes("Review refreshed"),
      );
      assert.equal(await page.locator("#rv-comparison").isHidden(), true);
      assert.equal(await page.locator("#rv-change").isDisabled(), true);
      assert.equal(await page.locator("#rv-delta-export").isDisabled(), true);
      // Retain native reports; add deterministic findings to exercise the shared comparison in every app.
      await page.evaluate((old) => {
        const original = SuiteReviewCore.report;
        window.deltaFixtures = old;
        SuiteReviewCore.report = (...args) => {
          const r = original(...args);
          r.findings.push(...deltaFixtures);
          r.counts = Object.fromEntries(
            ["error", "warning", "info"].map((s) => [
              s,
              r.findings.filter((f) => f.severity === s).length,
            ]),
          );
          return r;
        };
      }, old);
      await refresh();
      assert.equal(await page.locator("#rv-change").isDisabled(), false);
      await page.locator("#rv-query").fill("delta-");
      await page.locator("#rv-select").click();
      assert.match(await page.locator("#rv-count").textContent(), /2 selected/);
      await page.evaluate((next) => (window.deltaFixtures = next), next);
      await refresh();
      assert.equal(await page.locator("#rv-list article").count(), 2);
      assert.equal(
        await page
          .locator(
            'input[aria-label="Select finding delta-kept at document.kept"]',
          )
          .isChecked(),
        true,
      );
      assert.equal(
        await page
          .locator(
            'input[aria-label="Select finding delta-new at document.new"]',
          )
          .isChecked(),
        false,
      );
      assert.match(await page.locator("#rv-count").textContent(), /1 selected/);
      const comparison = await download("#rv-delta-export");
      assert.equal(comparison.format, "suite-quality-comparison/v1");
      assert.equal(comparison.tool, app);
      assert.equal(comparison.counts.new, 1);
      assert.equal(comparison.counts.removed, 1);
      assert.ok(comparison.counts.unchanged >= 1);
      assert.ok(
        comparison.items.some(
          (f) => f.code === "delta-retired" && f.status === "removed",
        ),
      );
      assert.match(comparison.note, /not verified fixed/);
      assert.equal(comparison.document, undefined);
      await page.locator("#rv-change").selectOption("new");
      assert.equal(await page.locator("#rv-list article").count(), 1);
      assert.match(
        await page.locator("#rv-list article").textContent(),
        /delta-new/,
      );
      await page.locator("#rv-export-scope").selectOption("filtered");
      const filtered = await download("#rv-export");
      assert.equal(filtered.findings.length, 1);
      assert.equal(filtered.findings[0].code, "delta-new");
      assert.equal(filtered.comparisonFilter, "new");
      assert.equal(filtered.comparedWith, comparison.baselineAt);
      if (app === "textiX") {
        await page.locator("#rv-export-format").selectOption("md");
        const mdDownload = page.waitForEvent("download");
        await page.locator("#rv-export").click();
        const md = await fs.readFile(await (await mdDownload).path(), "utf8");
        assert.match(md, /Comparison filter: newly reported/);
        assert.ok(md.includes(comparison.baselineAt));
        assert.match(md, /delta-new/);
        assert.doesNotMatch(md, /delta-retired/);
        await page.locator("#rv-export-format").selectOption("json");
      }

      await page.locator("#rv-change").selectOption("unchanged");
      assert.equal(await page.locator("#rv-list article").count(), 1);
      await page.locator("#rv-query").fill("CONSERVed kept");
      assert.equal(await page.locator("#rv-list article").count(), 1);
      await page.locator("#rv-removed").evaluate((e) => (e.open = true));
      assert.equal(await page.locator("#rv-removed-list input").count(), 0);
      assert.equal(await page.locator("#rv-removed-list script").count(), 0);
      assert.match(
        await page.locator("#rv-removed-list").textContent(),
        /<script>literal<\/script>/,
      );
      await refresh();
      const unchanged = await download("#rv-delta-export");
      assert.equal(unchanged.counts.new, 0);
      assert.equal(unchanged.counts.removed, 0);
      assert.match(await page.locator("#rv-count").textContent(), /1 selected/);
      assert.equal(await native(), before);
      assert.equal(
        await page.evaluate(
          (app) => localStorage.getItem("suite-notebook-v1:" + app),
          app,
        ),
        notebook,
      );
      assert.equal(aiCalls, 0);
    }
    // A failed capture keeps the last comparison and selection available.
    const previous = await page.locator("#rv-delta-count").textContent();
    await page.evaluate(() => {
      window.deltaReport = SuiteReviewCore.report;
      SuiteReviewCore.report = () => {
        throw Error("Test review capture failed");
      };
    });
    await refresh();
    assert.match(
      await page.locator("#rv-status").textContent(),
      /capture failed/,
    );
    assert.equal(await page.locator("#rv-delta-count").textContent(), previous);
    assert.match(await page.locator("#rv-count").textContent(), /1 selected/);
    await page.evaluate(() => {
      SuiteReviewCore.report = window.deltaReport;
      delete window.deltaReport;
    });
    // Historical findings are paged in the UI and exported in full.
    await page.evaluate(
      () =>
        (window.deltaFixtures = Array.from({ length: 150 }, (_, i) => ({
          severity: "info",
          code: "old-" + i,
          path: "document." + i,
          message: "Previous finding " + i,
        }))),
    );
    await refresh();
    await page.evaluate(() => (window.deltaFixtures = []));
    await refresh();
    await page.locator("#rv-removed").evaluate((e) => (e.open = true));
    assert.equal(await page.locator("#rv-removed-list article").count(), 100);
    await page.locator("#rv-removed-more").click();
    assert.equal(await page.locator("#rv-removed-list article").count(), 150);
    assert.equal(await page.locator("#rv-removed-more").isHidden(), true);
    assert.equal((await download("#rv-delta-export")).counts.removed, 150);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator("#rv-comparison").evaluate((e) => (e.open = false));
    await page.locator("#suite-review").evaluate((e) => (e.scrollTop = 0));
    assert.ok(
      await page
        .locator("#suite-review")
        .evaluate(
          (e) =>
            e.getBoundingClientRect().width <= innerWidth &&
            e.scrollWidth <= e.clientWidth,
        ),
    );
    await page.screenshot({ path: "/tmp/review-comparison-mobile.png" });
    await page.reload();
    await ready();
    await page.locator("#suite-review-open").click();
    await page.waitForFunction(() =>
      document
        .querySelector("#rv-status")
        ?.textContent.includes("Review refreshed"),
    );
    assert.equal(await page.locator("#rv-comparison").isHidden(), true);
    // Real native correction: label an unlabeled mockup control, without replacing the review engine.
    await page.setViewportSize({ width: 1500, height: 1000 });
    await page.goto(base + "/mockiX/");
    await page.waitForFunction(() => window.MockixApp);
    await page.evaluate(() => {
      const d = MockixApp.snapshot(),
        control = { ...Mockix.component("button", d.screens[0]), text: "" };
      window.deltaControl = control.id;
      d.screens[0].elements.push(control);
      MockixApp.apply(d);
    });
    await page.locator("#suite-review-open").click();
    await page.waitForFunction(() =>
      document
        .querySelector("#rv-status")
        ?.textContent.includes("Review refreshed"),
    );
    await page.locator("#rv-query").fill("unlabeled-mockup-control");
    await page.locator("#rv-select").click();
    await page.locator("#rv-close").click();
    await page.evaluate(() => {
      const d = MockixApp.snapshot();
      d.name = "Different document label";
      MockixApp.apply(d);
    });
    await page.locator("#suite-review-open").click();
    await page.waitForFunction(() =>
      document
        .querySelector("#rv-status")
        .textContent.includes("previous selections were cleared"),
    );
    assert.match(await page.locator("#rv-count").textContent(), /0 selected/);
    await page.locator("#rv-select").click();
    assert.match(await page.locator("#rv-count").textContent(), /1 selected/);
    await page.locator("#rv-close").click();
    await page.evaluate(() => {
      const d = MockixApp.snapshot();
      d.screens[0].elements.find((e) => e.id === deltaControl).text =
        "Save document";
      MockixApp.apply(d);
    });
    const fixed = await native();
    await page.locator("#suite-review-open").click();
    await page.waitForFunction(
      () => !document.querySelector("#rv-refresh").disabled,
    );
    const real = await download("#rv-delta-export");
    assert.ok(
      real.items.some(
        (f) => f.code === "unlabeled-mockup-control" && f.status === "removed",
      ),
    );
    assert.match(await page.locator("#rv-count").textContent(), /0 selected/);
    assert.equal(await native(), fixed);
    assert.equal(aiCalls, 0);
    assert.deepEqual(errors, []);
    console.log(
      "PASS: review comparison and selection preservation in all registered apps, multi-term/change filters, labelled scoped exports, read-only historical findings, full large exports with paged UI, failed-capture preservation, page-session reset, native correction detection and mobile layout.",
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
