const assert = require("node:assert/strict"),
  { chromium } = require("playwright"),
  fs = require("node:fs/promises"),
  os = require("node:os"),
  path = require("node:path"),
  { spawn } = require("node:child_process");
(async () => {
  const folder = await fs.mkdtemp(path.join(os.tmpdir(), "office-catalogue-")),
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
    for (const tool of ["textiX", "sheetiX"]) {
      const p = await browser.newPage({
          viewport: { width: 1500, height: 1100 },
        }),
        errors = [];
      p.on("pageerror", (e) => errors.push(e.message));
      await p.goto(base + "/" + tool + "/");
      await p.waitForFunction(() =>
        document.querySelector("#office-catalogue-open"),
      );
      const all = await p.evaluate(async (tool) => {
        const catalog = tool === "textiX" ? TextixCatalogue : SheetixCatalogue;
        for (const t of catalog.templates)
          await SuiteWorkspaceAdapter.validate(
            catalog.create(t.id),
            SuiteWorkspaceAdapter.snapshot(),
          );
        return catalog.templates.length;
      }, tool);
      assert.equal(all, 8);
      await p.locator("#office-catalogue-open").click();
      assert.equal(await p.locator("[data-office-template]").count(), 8);
      assert.equal(await p.locator("[data-office-layout]").count(), 3);
      const snapshot = () => p.evaluate(() => SuiteWorkspaceAdapter.snapshot());
      const initial = await snapshot();
      const first = p.locator("[data-office-template]").first();
      await first
        .getByRole("button", { name: "Preview replace", exact: true })
        .click();
      await p.waitForFunction(
        () => !document.querySelector("#sw-review").hidden,
      );
      assert.deepEqual(await snapshot(), initial);
      await p.locator("#sw-apply").click();
      await p.waitForFunction(() =>
        document.querySelector("#sw-status").textContent.includes("Updated"),
      );
      const replaced = await snapshot();
      await first
        .getByRole("button", { name: "Preview extend", exact: true })
        .click();
      await p.waitForFunction(
        () => !document.querySelector("#sw-review").hidden,
      );
      await p.locator("#sw-apply").click();
      await p.waitForFunction(() =>
        document.querySelector("#sw-status").textContent.includes("Updated"),
      );
      const extended = await snapshot();
      if (tool === "textiX")
        assert.ok(extended.html.length > replaced.html.length);
      else {
        assert.equal(extended.sheets.length, 4);
        assert.equal(
          await p.evaluate(() => {
            const b = SuiteWorkspaceAdapter.snapshot();
            return SheetixFormula.evaluator(b).get(b.sheets[3], "B3");
          }),
          2310,
        );
      }
      await first
        .getByRole("button", { name: "Save editable copy", exact: true })
        .click();
      await p.waitForFunction(() =>
        document.querySelector("#st-list").textContent.includes("copy"),
      );
      let row = p.locator("#st-list .sw-item").first();
      await row
        .getByRole("button", { name: "Edit metadata", exact: true })
        .click();
      await p.locator("#sw-close").click();
      if (tool === "textiX")
        await p.locator("#editor").fill("Edited catalogue version");
      else {
        await p.locator('td[data-ref="B2"]').click();
        await p.locator("#formula").fill("7777");
        await p.locator("#formula").press("Enter");
      }
      const edited = await snapshot();
      await p.locator("#office-catalogue-open").click();
      await p.locator("#st-update-content").click();
      await p.waitForFunction(() =>
        document
          .querySelector("#st-status")
          .textContent.includes("content updated"),
      );
      const saved = await p.evaluate(
        async (tool) => (await SuiteTemplates.list(tool))[0],
        tool,
      );
      assert.deepEqual(saved.document, edited);
      await p.locator("#oc-tab-layouts").click();
      await p
        .locator("[data-office-layout]")
        .first()
        .getByRole("button", { name: "Edit layout", exact: true })
        .click();
      await p.locator("#oc-name").fill("My editable brand");
      await p.locator("#oc-headerFill").fill("#224466");
      await p.locator("#oc-save").click();
      await p.waitForFunction(() =>
        document
          .querySelector("#oc-status")
          .textContent.includes("New layout saved"),
      );
      assert.equal(await p.locator("[data-office-layout]").count(), 4);
      await p
        .locator("[data-office-layout]")
        .filter({ hasText: "My editable brand" })
        .getByRole("button", { name: "Edit layout", exact: true })
        .click();
      await p.locator("#oc-headerFill").fill("#335577");
      await p.locator("#oc-update").click();
      await p.waitForFunction(
        () =>
          document.querySelector("#oc-status").textContent ===
          "Saved layout updated.",
      );
      await p.locator("#oc-preview").click();
      await p.waitForFunction(
        () => !document.querySelector("#sw-review").hidden,
      );
      assert.deepEqual(await snapshot(), edited);
      await p.locator("#sw-apply").click();
      await p.waitForFunction(() =>
        document.querySelector("#sw-status").textContent.includes("Updated"),
      );
      const styled = await snapshot();
      if (tool === "textiX") {
        assert.equal(
          await p.evaluate(() => {
            const d = new DOMParser().parseFromString(
              SuiteWorkspaceAdapter.snapshot().html,
              "text/html",
            );
            return d.body.textContent;
          }),
          "Edited catalogue version",
        );
        assert.match(styled.html, /font-family/);
      } else
        for (let i = 0; i < edited.sheets.length; i++)
          for (const [address, cell] of Object.entries(edited.sheets[i].cells))
            assert.equal(styled.sheets[i].cells[address].value, cell.value);
      const download = p.waitForEvent("download");
      await p.locator("#oc-export").click();
      const layout = JSON.parse(
        await fs.readFile(await (await download).path(), "utf8"),
      );
      assert.equal(layout.tool, tool);
      assert.equal(layout.properties.headerFill, "#335577");
      const before = await snapshot();
      await p.locator("#oc-tab-saved").click();
      await p
        .locator("#st-list .sw-item")
        .first()
        .getByRole("button", { name: "Preview extend template", exact: true })
        .click();
      await p.waitForFunction(
        () => !document.querySelector("#sw-review").hidden,
      );
      assert.deepEqual(await snapshot(), before);
      await p.locator("#sw-discard").click();
      await p
        .locator("#oc-file")
        .setInputFiles({
          name: "wrong.layout.json",
          mimeType: "application/json",
          buffer: Buffer.from(
            JSON.stringify({
              ...layout,
              tool: tool === "textiX" ? "sheetiX" : "textiX",
            }),
          ),
        });
      await p.waitForFunction(
        () => document.querySelector("#oc-file").value === "",
      );
      assert.deepEqual(await snapshot(), before);
      await p.reload();
      await p.locator("#office-catalogue-open").click();
      await p.waitForFunction(() =>
        document
          .querySelector("#oc-layouts")
          .textContent.includes("My editable brand"),
      );
      assert.equal(await p.locator("[data-office-layout]").count(), 4);
      assert.equal(
        await p.evaluate(
          async (tool) => (await SuiteTemplates.list(tool)).length,
          tool,
        ),
        1,
      );
      await p.locator("#oc-tab-saved").click();
      const beforeDuplicate = await snapshot();
      await p
        .locator("#st-list .sw-item")
        .first()
        .getByRole("button", { name: "Duplicate saved template", exact: true })
        .click();
      await p.waitForFunction(() =>
        document
          .querySelector("#st-status")
          .textContent.includes("Template duplicated"),
      );
      assert.equal(
        await p.evaluate(
          async (tool) => (await SuiteTemplates.list(tool)).length,
          tool,
        ),
        2,
      );
      assert.deepEqual(await snapshot(), beforeDuplicate);
      await p.locator("#oc-tab-saved").focus();
      await p.keyboard.press("ArrowLeft");
      assert.equal(
        await p.locator("#oc-tab-layouts").getAttribute("aria-selected"),
        "true",
      );
      await p.keyboard.press("ArrowLeft");
      assert.equal(
        await p.locator("#oc-tab-templates").getAttribute("aria-selected"),
        "true",
      );
      await p.locator("#oc-query").fill("no-matching-catalogue-item");
      assert.match(
        await p.locator("#oc-templates").textContent(),
        /No templates match/,
      );
      assert.match(await p.locator("#oc-count").textContent(), /^0 built-in/);
      await p.locator("#oc-query").fill("");
      await p.setViewportSize({ width: 390, height: 844 });
      assert.ok(
        await p
          .locator("#suite-workspace")
          .evaluate((e) => e.getBoundingClientRect().width <= innerWidth),
      );
      assert.deepEqual(errors, []);
      await p.close();
    }
    const q = await browser.newPage();
    await q.goto(base + "/textiX/");
    const linked = await q.evaluate(() => {
      const old = { name: "Keep", html: '<h1 id="section">Old</h1>' },
        added = {
          name: "New",
          html: '<h2 id="section">New</h2><p><a href="#section">Jump</a></p>',
        },
        d = SuiteOfficeCatalogue.extend("textiX", old, added),
        dom = new DOMParser().parseFromString(d.html, "text/html");
      return {
        ids: [...dom.querySelectorAll("[id]")].map((n) => n.id),
        href: dom.querySelector("a").getAttribute("href"),
        name: d.name,
      };
    });
    assert.equal(new Set(linked.ids).size, 2);
    assert.equal(linked.href, "#" + linked.ids[1]);
    assert.equal(linked.name, "Keep");
    console.log(
      "PASS: native validation of 16 templates, reviewed replace/extend, cross-sheet formulas, editable saved template contents, custom layout create/update/preview/export, wrong-app import isolation, content preservation, persistence, anchor collisions and mobile catalogues.",
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
