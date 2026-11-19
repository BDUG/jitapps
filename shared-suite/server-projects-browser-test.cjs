const assert = require("node:assert/strict"),
  fs = require("node:fs/promises"),
  os = require("node:os"),
  path = require("node:path"),
  { spawn } = require("node:child_process"),
  { chromium } = require("playwright");
(async () => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), "server-projects-"));
  let child, browser;
  async function start() {
    child = spawn(
      "python3",
      [
        "-u",
        "server/server.py",
        "--port",
        "0",
        "--skills-offline",
        "--agent-no-commands",
        "--agent-workspace",
        temp,
        "--config",
        path.join(temp, "providers.json"),
        "--search-config",
        path.join(temp, "search.json"),
      ],
      { cwd: path.resolve(__dirname, ".."), stdio: ["ignore", "pipe", "pipe"] },
    );
    let errors = "";
    child.stderr.on("data", (data) => (errors += data));
    return new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(Error("Server did not start: " + errors)),
        15000,
      );
      child.once("exit", () => {
        clearTimeout(timer);
        reject(Error(errors));
      });
      child.stdout.on("data", (data) => {
        const match = String(data).match(/listening on (\S+)/);
        if (match) {
          clearTimeout(timer);
          resolve(
            match[1].startsWith("http") ? match[1] : "http://" + match[1],
          );
        }
      });
    });
  }
  try {
    let base = await start();
    browser = await chromium.launch({
      executablePath: "/usr/bin/chromium",
      args: ["--no-sandbox"],
    });
    const context = await browser.newContext(),
      errors = [];
    const apps = [
      ["schematiX", "SchematixApp"],
      ["mergiX", "MergixApp"],
      ["rstiX", "RstixApp"],
    ];
    const ids = {};
    for (const [app, global] of apps) {
      const page = await context.newPage();
      page.on("pageerror", (e) => errors.push(app + ": " + e.message));
      let renameTarget;
      page.on("dialog", (d) =>
        d.type() === "prompt"
          ? d.accept(renameTarget || d.defaultValue())
          : d.accept(),
      );
      await page.goto(base + "/" + app + "/");
      await page.waitForFunction((name) => window[name]?.serverProject, global);
      await page.evaluate((name) => window[name].serverProject.ready, global);
      if (app === "schematiX") {
        await page.locator("#files").setInputFiles({
          name: "example.json",
          mimeType: "application/json",
          buffer: Buffer.from('{"value":42}'),
        });
        await page.waitForFunction(
          () => SchematixApp.snapshot().sources.length === 1,
        );
      }
      if (app === "mergiX") {
        await page.locator("#load-demo").click();
        await page.locator("#result").fill("Unapplied merged content");
      }
      if (app === "rstiX") {
        const tree = path.join(temp, "rst-tree");
        await fs.mkdir(path.join(tree, "docs"), { recursive: true });
        await fs.writeFile(
          path.join(tree, "docs/requirements.rst"),
          await page.evaluate(() => RstixApp.snapshot().files[0].content),
        );
        await fs.writeFile(
          path.join(tree, "conf.py"),
          'extensions = ["sphinx_needs"]\n',
        );
        await fs.writeFile(
          path.join(tree, "image.bin"),
          Buffer.from([0, 255, 13, 10]),
        );
        await page.locator("#folder").setInputFiles(tree);
        await page.waitForFunction(() =>
          RstixApp.snapshot().files[0].path.includes("rst-tree/"),
        );
        await page.locator("#source-tab").click();
        await page
          .locator("#source")
          .fill(
            (await page.locator("#source").inputValue()) +
              "\nUnapplied durable source\n",
          );
      }
      await page.evaluate((name) => window[name].serverProject.save(), global);
      await page.waitForFunction(
        (name) => !window[name].serverProject.pending,
        global,
      );
      ids[app] = await page.evaluate(
        (name) => window[name].serverProject.current.id,
        global,
      );
      const project = await page.evaluate(
        async ({ app, id }) =>
          SuiteServerProjects.request(app, { action: "open", id }),
        { app, id: ids[app] },
      );
      assert.ok(project.files.length);
      assert.ok((await fs.stat(project.filesRoot)).isDirectory());
      if (app === "rstiX") {
        assert.equal(
          await fs.readFile(
            path.join(project.filesRoot, "rst-tree/conf.py"),
            "utf8",
          ),
          'extensions = ["sphinx_needs"]\n',
        );
        assert.deepEqual(
          await fs.readFile(path.join(project.filesRoot, "rst-tree/image.bin")),
          Buffer.from([0, 255, 13, 10]),
        );
      }
      if (app === "schematiX") {
        assert.equal(
          await fs.readFile(
            path.join(project.filesRoot, "imports/example.json"),
            "utf8",
          ),
          '{"value":42}',
        );
        assert.equal(project.files.length, 2);
      }
      await page.evaluate((app) => {
        const keys =
          app === "rstiX"
            ? ["rstix-project", "rstix-editor-draft/v1"]
            : app === "mergiX"
              ? ["mergix-state/v1"]
              : ["schematix-project/v1"];
        for (const key of keys) localStorage.removeItem(key);
      }, app);
      await page.reload();
      await page.waitForFunction((name) => window[name]?.serverProject, global);
      await page.evaluate((name) => window[name].serverProject.ready, global);
      assert.equal(
        await page.evaluate(
          (name) => window[name].serverProject.current?.id,
          global,
        ),
        ids[app],
        app + ": " + (await page.locator(".sp-status").textContent()),
      );
      if (app === "mergiX")
        assert.equal(
          await page.locator("#result").inputValue(),
          "Unapplied merged content",
        );
      if (app === "rstiX")
        assert.match(
          await page.locator("#source").inputValue(),
          /Unapplied durable source/,
        );
      if (app === "schematiX")
        assert.equal(
          await page.evaluate(() => SchematixApp.snapshot().sources[0].path),
          "example.json",
        );
      await page.locator(".server-projects summary").click();
      await page
        .getByRole("textbox", { name: "Project folder path" })
        .fill("empty/nested");
      await page.locator('[data-action="folder"]').click();
      await page.waitForFunction(
        (name) =>
          window[name].serverProject.current?.revision >= 2 &&
          !window[name].serverProject.pending,
        global,
      );
      renameTarget = "empty/renamed";
      await page
        .getByRole("button", { name: "Rename empty/nested", exact: true })
        .click();
      await page.waitForFunction(
        (name) => !window[name].serverProject.pending,
        global,
      );
      await page
        .getByRole("button", { name: "Delete empty/renamed", exact: true })
        .click();
      await page.waitForFunction(
        (name) => !window[name].serverProject.pending,
        global,
      );
      await page
        .getByRole("textbox", { name: "Project folder path" })
        .fill("empty/nested");
      await page.locator('[data-action="folder"]').click();
      await page.waitForFunction(
        (name) => !window[name].serverProject.pending,
        global,
      );
      if (app === "schematiX") {
        renameTarget = "evidence/docs/renamed.json.txt";
        await page
          .getByRole("button", {
            name: "Rename evidence/example.json.txt",
            exact: true,
          })
          .click();
        await page.waitForFunction(
          () => SchematixApp.snapshot().sources[0].path === "docs/renamed.json",
        );
        await page.evaluate(() => SchematixApp.serverProject.save());
      }
      const persisted = await page.evaluate(
        async ({ app, id }) =>
          SuiteServerProjects.request(app, { action: "open", id }),
        { app, id: ids[app] },
      );
      assert.ok(persisted.folders.includes("empty/nested"));
      // Reject stale writes instead of replacing files from another browser session.
      const stale = {
        action: "save",
        id: ids[app],
        expectedRevision: 1,
        name: persisted.name,
        state: persisted.state,
        files: persisted.files,
        folders: persisted.folders,
      };
      const rejection = await page.evaluate(
        async ({ app, data }) => {
          try {
            await SuiteServerProjects.request(app, data);
            return false;
          } catch (e) {
            return e.conflict;
          }
        },
        { app, data: stale },
      );
      assert.equal(rejection, true);
      await page.close();
    }
    const first = await fetch(base + "/api/projects", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Architex-Request": "1",
        Origin: "https://evil.invalid",
      },
      body: JSON.stringify({ app: "rstiX", action: "list" }),
    });
    assert.equal(first.status, 403);
    await new Promise((resolve) => {
      child.once("exit", resolve);
      child.kill("SIGTERM");
    });
    base = await start();
    for (const [app] of apps) {
      const response = await fetch(base + "/api/projects", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Architex-Request": "1",
        },
        body: JSON.stringify({ app, action: "open", id: ids[app] }),
      });
      assert.equal(response.status, 200);
      assert.ok((await response.json()).files.length);
    }
    assert.deepEqual(errors, []);
    console.log(
      "PASS: three server project roots, real files and empty folders, full drafts after browser recovery removal, revision conflicts, origin checks, server restart persistence.",
    );
  } finally {
    if (browser) await browser.close();
    if (child && child.exitCode === null)
      await new Promise((resolve) => {
        child.once("exit", resolve);
        child.kill("SIGTERM");
      });
    await fs.rm(temp, { recursive: true, force: true });
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
