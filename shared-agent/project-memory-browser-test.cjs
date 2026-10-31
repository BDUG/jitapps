const assert = require("node:assert/strict"),
  { chromium } = require("playwright"),
  fs = require("node:fs/promises"),
  os = require("node:os"),
  path = require("node:path"),
  { spawn } = require("node:child_process");
(async () => {
  const folder = await fs.mkdtemp(path.join(os.tmpdir(), "project-memory-")),
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
        "--agent-workspace",
        folder,
        "--agent-no-commands",
        "--skills-offline",
      ],
      { cwd: path.resolve(__dirname, ".."), stdio: ["ignore", "pipe", "pipe"] },
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
      server.once("exit", () => reject(Error("Server stopped")));
      setTimeout(() => reject(Error("Startup timeout")), 10000).unref();
    });
    browser = await chromium.launch({
      executablePath: "/usr/bin/chromium",
      args: ["--no-sandbox"],
    });
    const page = await browser.newPage({
      viewport: { width: 1500, height: 1000 },
    });
    page.on("dialog", (d) => d.accept());
    let ai = 0,
      planning = false,
      recalls = 0,
      turns = 0;
    page.on("request", (r) => {
      if (r.url().endsWith("/api/agent") && r.method() === "POST") {
        const body = r.postDataJSON();
        if (
          body.op === "project_memory" &&
          body.action === "search" &&
          planning
        )
          recalls++;
      }
    });
    await page.route("**/api/chat", (r) => {
      ai++;
      if (!planning)
        return r.fulfill({ json: { text: "No model call expected" } });
      const body = r.request().postDataJSON(),
        request = JSON.parse(body.messages.at(-1).content);
      assert.ok(
        request.workingMemory.project.matches.some(
          (n) => n.title === "Pagination decision",
        ),
      );
      turns++;
      return r.fulfill({
        json: {
          text: JSON.stringify({
            sessionId: request.sessionId,
            step: request.step,
            status: turns === 1 ? "act" : "done",
            plan:
              turns === 1
                ? "Inspect local files"
                : "Report observed inspection",
            action:
              turns === 1
                ? { tool: "list_files", args: { path: ".", limit: 20 } }
                : null,
            summary: "Read-only inspection complete.",
          }),
        },
      });
    });
    await page.goto(base + "/codeiX/");
    await page.waitForFunction(() => window.SuiteCodingAgent);
    await page.evaluate(() => SuiteCodingAgent.open());
    await page.locator("#ag-task-mode").selectOption("plan");
    assert.equal(await page.locator("#ag-edits").isChecked(), false);
    assert.equal(await page.locator("#ag-commands").isChecked(), false);
    await page.locator("#ag-project-memory").click();
    await page.locator("#agent-project-memory").waitFor({ state: "visible" });
    await page.locator("#pm-project").fill("Project A");
    await page.locator("#pm-enabled").check();
    await page.locator("#pm-config").click();
    await page.waitForFunction(() =>
      document
        .querySelector("#pm-scope")
        .textContent.includes("recall enabled"),
    );
    await page.locator("#pm-new").click();
    await page.locator("#pm-title").fill("Pagination decision");
    await page.locator("#pm-category").selectOption("decision");
    await page
      .locator("#pm-text")
      .fill("Use cursor pagination. Evidence: ADR-001.");
    await page.locator("#pm-pinned").check();
    await page.locator("#pm-save").click();
    await page.waitForFunction(() =>
      document
        .querySelector("#pm-status")
        .textContent.includes("Project note saved"),
    );
    assert.ok(
      await page
        .locator("#pm-listing")
        .textContent()
        .then((t) => t.includes("Pagination decision")),
    );
    await page.locator("#pm-project").fill("Project B");
    await page.locator("#pm-config").click();
    await page.waitForFunction(() =>
      document
        .querySelector("#pm-status")
        .textContent.includes("0 saved notes"),
    );
    assert.ok(
      (await page.locator("#pm-listing").textContent()).includes(
        "No matching notes",
      ),
    );
    await page.locator("#pm-project").fill("Project A");
    await page.locator("#pm-config").click();
    await page.locator("#pm-listing button").first().click();
    await page.waitForFunction(() =>
      document.querySelector("#pm-text").value.includes("cursor pagination"),
    );
    const download = page.waitForEvent("download");
    await page.locator("#pm-export").click();
    const backup = JSON.parse(
      await fs.readFile(await (await download).path(), "utf8"),
    );
    assert.equal(backup.notes.length, 1);
    assert.equal(backup.project, "Project A");
    assert.equal(
      backup.notes[0].text,
      "Use cursor pagination. Evidence: ADR-001.",
    );
    // Concurrent changes are rejected without destroying the editor draft.
    await page.locator("#pm-text").fill("Keep this unsaved draft");
    await page.evaluate(async (note) => {
      await fetch("/api/agent", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Architex-Request": "1",
        },
        body: JSON.stringify({
          op: "project_memory",
          action: "save",
          project: "Project A",
          ...note,
          expectedRevision: note.revision,
          text: "Newer saved decision",
        }),
      });
    }, backup.notes[0]);
    await page.locator("#pm-save").click();
    await page.waitForFunction(() =>
      document.querySelector("#pm-status").textContent.includes("changed"),
    );
    assert.equal(
      await page.locator("#pm-text").inputValue(),
      "Keep this unsaved draft",
    );
    await page.setViewportSize({ width: 390, height: 844 });
    assert.ok(
      await page
        .locator("#agent-project-memory")
        .evaluate((e) => e.getBoundingClientRect().width <= innerWidth),
    );
    await page.screenshot({ path: "/tmp/project-memory-mobile.png" });
    assert.equal(ai, 0);
    await page.locator("#pm-close").click();
    await page.setViewportSize({ width: 1500, height: 1000 });
    await page.evaluate(() => SuiteChatPaging.configure({ mode: "off" }));
    planning = true;
    await page
      .locator("#ag-goal")
      .fill("Inspect current workspace files read-only.");
    await require("./browser-tools.cjs").agentControl(
      page,
      "#ag-start",
      "click",
    );
    await page.waitForFunction(
      () =>
        !SuiteCodingAgent.running() &&
        SuiteCodingAgent.session()?.status === "complete",
      null,
      { timeout: 30000 },
    );
    assert.equal(turns, 2);
    assert.equal(
      recalls,
      1,
      "Project recall is reused for unchanged intent within this approved run",
    );
    await page.locator("#ag-project-memory").click();
    await page.locator("#agent-project-memory").waitFor({ state: "visible" });
    await page.locator("#pm-capture").click();
    assert.match(await page.locator("#pm-text").inputValue(), /sourceSession/);
    assert.match(
      await page.locator("#pm-status").textContent(),
      /Nothing was saved/,
    );
    console.log(
      "PASS: opt-in project recall reaches both model turns with one indexed lookup and read-only native execution.",
    );
    console.log(
      "PASS: actual workspace project memory create/read/isolation/export/conflict guards, preserved drafts, Plan permissions, mobile UI and no AI calls during memory management.",
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
