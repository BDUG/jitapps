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
    const fixture = {
      title: "Safe search",
      summary: "Read-only workspace search",
      scope: ["src/"],
      nonGoals: ["No edits"],
      constraints: ["Do not execute commands"],
      requirements: [
        {
          id: "R1",
          description: "Find matching paths",
          acceptance: ["Only matching paths are listed"],
        },
      ],
      design: ["Use existing search"],
      tasks: [{ id: "T1", title: "Inspect search", requirementIds: ["R1"] }],
      verification: [
        {
          requirementId: "R1",
          method: "Propose a fixture search",
          expected: "Matching paths",
        },
      ],
      openQuestions: ["Which file types?"],
      assumptions: [],
    };
    let calls = 0,
      mode = "ok",
      pendingRelease;
    const bodies = [];
    await page.route("**/api/chat", async (route) => {
      calls++;
      const body = route.request().postDataJSON();
      bodies.push(body);
      assert.equal(body.messages.length, 2);
      assert.equal(
        JSON.parse(body.messages[1].content).protocol,
        "codingagentlib/specification/v1",
      );
      if (mode === "hold")
        await new Promise((resolve) => (pendingRelease = resolve));
      await route
        .fulfill({
          json: {
            text: mode === "bad" ? '{"status":"act"}' : JSON.stringify(fixture),
          },
        })
        .catch(() => {});
    });
    await page.goto(base + "/codeiX/");
    await page.waitForFunction(() => window.SuiteCodingAgent);
    await page.evaluate(() => SuiteCodingAgent.open());
    await page
      .locator("#ag-goal")
      .fill("Search src/. Do not edit files or run commands.");
    await page.locator("#ag-specification").click();
    const dialog = page.locator(".ca-specification"),
      status = dialog.locator('[role="status"]');
    await dialog
      .getByLabel("Scope", { exact: true })
      .fill("Only src/. Keep existing APIs.");
    await dialog
      .getByLabel("Acceptance criteria", { exact: true })
      .fill("List matching paths without changes.");
    await dialog
      .getByRole("button", { name: "Generate specification", exact: true })
      .click();
    await page.waitForFunction(() =>
      document
        .querySelector('.ca-specification [role="status"]')
        .textContent.includes("Review and edit"),
    );
    const draft = dialog.getByLabel(
      "Generated specification · editable draft",
      { exact: true },
    );
    assert.match(await draft.inputValue(), /Do not edit files or run commands/);
    assert.equal(
      await page.locator("#ag-goal").inputValue(),
      "Search src/. Do not edit files or run commands.",
    );
    assert.equal(await page.evaluate(() => SuiteCodingAgent.session()), null);
    await draft.fill(
      (await draft.inputValue()) + "\nUser review: preserve README.\n",
    );
    await dialog
      .getByRole("button", { name: "Use specification", exact: true })
      .click();
    assert.match(
      await page.locator("#ag-goal").inputValue(),
      /User review: preserve README/,
    );
    assert.equal(await page.evaluate(() => SuiteCodingAgent.session()), null);
    assert.equal(calls, 1);
    // Invalid model output and questionnaire changes cannot overwrite the input.
    const applied = await page.locator("#ag-goal").inputValue();
    await page.locator("#ag-specification").click();
    mode = "bad";
    await dialog
      .getByRole("button", { name: "Generate specification", exact: true })
      .click();
    await status.filter({ hasText: "Specification text is missing" }).waitFor();
    assert.equal(
      await dialog
        .getByRole("button", { name: "Use specification", exact: true })
        .isDisabled(),
      true,
    );
    assert.equal(await page.locator("#ag-goal").inputValue(), applied);
    mode = "ok";
    await dialog
      .getByRole("button", { name: "Generate specification", exact: true })
      .click();
    await status.filter({ hasText: "Review and edit" }).waitFor();
    await dialog
      .getByLabel("Constraints", { exact: true })
      .fill("No dependencies");
    assert.equal(
      await dialog
        .getByRole("button", { name: "Use specification", exact: true })
        .isDisabled(),
      true,
    );
    await dialog.getByRole("button", { name: "Close", exact: true }).click();
    // Cancel a pending generation; its later response must be ignored.
    await page.locator("#ag-specification").click();
    mode = "hold";
    await dialog
      .getByRole("button", { name: "Generate specification", exact: true })
      .click();
    await page.waitForFunction(() =>
      document
        .querySelector('.ca-specification [role="status"]')
        .textContent.includes("Generating"),
    );
    while (!pendingRelease)
      await new Promise((resolve) => setTimeout(resolve, 10));
    await dialog.getByRole("button", { name: "Close", exact: true }).click();
    pendingRelease();
    assert.equal(await page.locator("#ag-goal").inputValue(), applied);
    assert.equal(await page.evaluate(() => SuiteCodingAgent.session()), null);
    // Input edited elsewhere during the dialog remains authoritative.
    mode = "ok";
    await page.locator("#ag-specification").click();
    await dialog
      .getByRole("button", { name: "Generate specification", exact: true })
      .click();
    await status.filter({ hasText: "Review and edit" }).waitFor();
    await page.locator("#ag-goal").evaluate((e) => (e.value = "Newer command"));
    await dialog
      .getByRole("button", { name: "Use specification", exact: true })
      .click();
    await status.filter({ hasText: "command input changed" }).waitFor();
    assert.equal(await page.locator("#ag-goal").inputValue(), "Newer command");
    await page.setViewportSize({ width: 390, height: 844 });
    assert.ok(
      await dialog.evaluate(
        (e) => e.getBoundingClientRect().width <= innerWidth,
      ),
    );
    await page.screenshot({ path: "/tmp/agent-specification-mobile.png" });
    assert.ok(bodies.every((b) => !JSON.stringify(b).includes('"files"')));
    console.log(
      "PASS: LLM questionnaire, editable specification, explicit application, invalid-output rejection, changed-answer/source guards, cancellation, no agent execution and mobile layout.",
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
