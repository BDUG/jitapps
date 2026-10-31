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
      console.log("Review " + app);
      await page.goto(base + "/" + app + "/");
      await page.waitForFunction(
        () =>
          window.SuiteWorkspaceAdapter?.snapshot ||
          window.SuiteAgentAdapter?.snapshot ||
          window.ShelliXDiagnostics,
      );
      const before = await page.evaluate(() =>
        window.SuiteWorkspaceAdapter?.snapshot
          ? JSON.stringify(SuiteWorkspaceAdapter.snapshot())
          : window.SuiteAgentAdapter?.snapshot
            ? JSON.stringify(SuiteAgentAdapter.snapshot())
            : "audit",
      );
      await page.locator("#suite-review-open").click();
      await page.waitForFunction(() =>
        document
          .querySelector("#rv-status")
          ?.textContent.includes("Review refreshed"),
      );
      assert.match(
        await page.locator("#rv-context").textContent(),
        new RegExp(app === "architex" ? "architeX" : app),
      );
      assert.equal(
        await page.evaluate(() =>
          window.SuiteWorkspaceAdapter?.snapshot
            ? JSON.stringify(SuiteWorkspaceAdapter.snapshot())
            : window.SuiteAgentAdapter?.snapshot
              ? JSON.stringify(SuiteAgentAdapter.snapshot())
              : "audit",
        ),
        before,
      );
      assert.equal(aiCalls, 0);
      await page.locator("#rv-close").click();
    }
    await page.goto(base + "/mockiX/");
    await page.waitForFunction(() => window.MockixApp);
    await page.evaluate(() => {
      const p = MockixApp.snapshot();
      p.screens[0].elements.push({
        ...Mockix.component("button", p.screens[0]),
        text: "",
        fontSize: 9,
      });
      MockixApp.apply(p);
      localStorage.setItem(
        "suite-notebook-v1:mockiX",
        JSON.stringify({
          format: "suite-notebook/v1",
          tool: "mockiX",
          title: "Existing notes",
          notes: "Do not replace me",
          tasks: [{ id: "original", text: "Original task", done: true }],
        }),
      );
    });
    await page.locator("#suite-review-open").click();
    await page.waitForFunction(() =>
      document
        .querySelector("#rv-status")
        ?.textContent.includes("Review refreshed"),
    );
    await page.locator("#rv-query").fill("unlabeled-mockup-control");
    await page.locator("#rv-select").click();
    await page.locator("#rv-tasks").click();
    await page.waitForFunction(() =>
      document
        .querySelector("#rv-status")
        ?.textContent.includes("1 review tasks added"),
    );
    let saved = await page.evaluate(() =>
      JSON.parse(localStorage.getItem("suite-notebook-v1:mockiX")),
    );
    assert.equal(saved.tasks.length, 2);
    assert.equal(saved.tasks[0].done, true);
    assert.equal(saved.notes, "Do not replace me");
    await page.locator("#rv-tasks").click();
    await page.waitForFunction(() =>
      document
        .querySelector("#rv-status")
        ?.textContent.includes("0 review tasks added"),
    );
    const download = page.waitForEvent("download");
    await page.locator("#rv-export").click();
    const report = JSON.parse(
      await fs.readFile(await (await download).path(), "utf8"),
    );
    assert.ok(
      report.findings.some((f) => f.code === "unlabeled-mockup-control"),
    );
    await page.locator("#rv-export-scope").selectOption("filtered");
    const filteredDownload = page.waitForEvent("download");
    await page.locator("#rv-export").click();
    const filteredReport = JSON.parse(
      await fs.readFile(await (await filteredDownload).path(), "utf8"),
    );
    assert.equal(filteredReport.exportScope, "filtered");
    assert.equal(filteredReport.findings.length, 1);
    assert.equal(filteredReport.sourceFindingCount, report.findings.length);
    await page.locator("#rv-export-scope").selectOption("selected");
    await page.locator("#rv-export-format").selectOption("md");
    const markdownDownload = page.waitForEvent("download");
    await page.locator("#rv-export").click();
    const markdown = await fs.readFile(
      await (await markdownDownload).path(),
      "utf8",
    );
    assert.match(markdown, /Scope: selected/);
    assert.match(markdown, /unlabeled-mockup-control/);
    assert.doesNotMatch(markdown, /small-interface-text/);
    await page.locator("#rv-clear").click();
    assert.equal(await page.locator("#rv-export").isDisabled(), true);
    await page.locator("#rv-select").click();
    await page.evaluate(() => {
      const p = MockixApp.snapshot();
      p.name = "Changed after review";
      MockixApp.apply(p);
    });
    await page.locator("#rv-tasks").click();
    await page.waitForFunction(() =>
      document
        .querySelector("#rv-status")
        ?.textContent.includes("content changed"),
    );
    assert.equal(
      (
        await page.evaluate(() =>
          JSON.parse(localStorage.getItem("suite-notebook-v1:mockiX")),
        )
      ).tasks.length,
      2,
    );
    await page.locator("#rv-refresh").click();
    await page.waitForFunction(() =>
      document
        .querySelector("#rv-status")
        ?.textContent.includes("Review refreshed"),
    );
    await page.locator("#rv-select").click();
    await page.evaluate(() =>
      localStorage.setItem("suite-notebook-v1:mockiX", "{broken"),
    );
    await page.locator("#rv-tasks").click();
    await page.waitForFunction(
      () => !document.querySelector("#rv-refresh").disabled,
    );
    assert.equal(
      await page.evaluate(() =>
        localStorage.getItem("suite-notebook-v1:mockiX"),
      ),
      "{broken",
    );
    const dom = await page.evaluate(() => ({
      text: SuiteReviewCore.report("textiX", {
        name: "Doc",
        html: '<h1>Title</h1><h3>Jump</h3><a href="/x">Click here</a>',
      }),
      app: SuiteReviewCore.report("appiX", {
        name: "App",
        html: "<button></button>",
      }),
      code: SuiteReviewCore.report("codeiX", {
        name: "Site",
        files: [
          {
            path: "pages/index.html",
            content:
              '<script src="../missing.js"></script><img src="../found.png">',
          },
          { path: "found.png", content: "" },
        ],
      }),
      vector: SuiteReviewCore.report("graphiX", {
        name: "Drawing",
        svg: '<svg xmlns="http://www.w3.org/2000/svg"><title>Drawing</title><image href="https://example.invalid/image.png"/></svg>',
      }),
    }));
    assert.ok(dom.text.findings.some((f) => f.code === "heading-level-gap"));
    assert.ok(
      dom.app.findings.some((f) => f.code === "button-accessible-name"),
    );
    assert.equal(
      dom.code.findings.filter((f) => f.code === "missing-project-asset")
        .length,
      1,
    );
    assert.ok(
      dom.vector.findings.some((f) => f.code === "external-vector-image"),
    );
    await page.setViewportSize({ width: 390, height: 844 });
    assert.ok(
      await page
        .locator("#suite-review")
        .evaluate((e) => e.getBoundingClientRect().width <= innerWidth),
    );
    assert.equal(aiCalls, 0);
    console.log(
      "PASS: real read-only snapshots in all 18 apps, specific HTML/SVG checks, selected findings to existing notebook tasks, deduplication, stale-document rejection, corrupt-notebook protection, scoped JSON/Markdown export, empty-selection protection and mobile review.",
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
