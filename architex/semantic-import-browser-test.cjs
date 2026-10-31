const assert = require("node:assert/strict"),
  { chromium } = require("playwright"),
  fs = require("node:fs/promises"),
  os = require("node:os"),
  path = require("node:path"),
  { spawn } = require("node:child_process"),
  Zip = require("./vendor/jszip.min.js");
(async () => {
  const root = path.resolve(__dirname, ".."),
    folder = await fs.mkdtemp(
      path.join(os.tmpdir(), "architex-source-import-"),
    );
  const server = spawn(
    "python3",
    [
      "server/server.py",
      "--port",
      "0",
      "--skills-offline",
      "--config",
      path.join(folder, "providers.json"),
      "--search-config",
      path.join(folder, "search.json"),
      "--agent-workspace",
      folder,
      "--agent-no-commands",
    ],
    { cwd: root, stdio: ["ignore", "pipe", "pipe"] },
  );
  let stderr = "";
  server.stderr.on("data", (v) => (stderr += v));
  const base = await new Promise((resolve, reject) => {
    let output = "";
    server.stdout.on("data", (d) => {
      output += d;
      const m = output.match(/listening on (\S+)/);
      if (m) resolve("http://" + m[1]);
    });
    server.once("exit", () => reject(Error(stderr)));
    setTimeout(() => reject(Error("Startup timeout " + stderr)), 15000).unref();
  });
  let browser;
  try {
    browser = await chromium.launch({
      executablePath: "/usr/bin/chromium",
      args: ["--no-sandbox"],
    });
    const page = await browser.newPage({
        viewport: { width: 1500, height: 1100 },
      }),
      errors = [],
      requests = [];
    page.on("pageerror", (e) => errors.push(e.message));
    let variant = "merge",
      first = true,
      seed;
    const pagedSources = new Map();
    let pagingCalls = 0;
    await page.route("**/api/chat", async (route) => {
      const body = route.request().postDataJSON();
      requests.push(body);
      if (variant === "bulk") {
        const r = JSON.parse(body.messages.at(-1).content);
        assert.equal(
          r.attachments.length,
          125,
          "Paging and filtering must not limit the imported selection",
        );
        return route.fulfill({
          json: {
            text: JSON.stringify({
              requestId: r.requestId,
              documentDigest: r.documentDigest,
              answer: "All selected sources are available.",
              summary: "Clarify bulk import",
              proposal: null,
              questions: [
                {
                  text: "Which layers should be represented?",
                  options: [{ label: "Services only" }],
                },
              ],
            }),
          },
        });
      }
      const last = body.messages.at(-1),
        control =
          typeof last.content === "string" ? JSON.parse(last.content) : null;
      if (control && ["input", "output"].includes(control.phase)) {
        pagingCalls++;
        assert.equal(
          control.attachmentContext.inline[0].content,
          "class SingleSource: pass",
        );
        const paging = {
          session: control.session,
          phase: control.phase,
          index: control.index,
          memo: "",
        };
        if (control.phase === "input") {
          const pages = pagedSources.get(control.source.resource) || [];
          pages[control.source.page] = control.source.text;
          pagedSources.set(control.source.resource, pages);
          return route.fulfill({ json: { text: JSON.stringify({ paging }) } });
        }
        const r = JSON.parse(pagedSources.get("m1").join(""));
        assert.equal(r.attachments.length, 1);
        assert.equal(r.workflow.confirmedOptions.target, "metamodel");
        const proposal = structuredClone(r.document);
        proposal.metamodel.components.push({
          ...structuredClone(seed),
          id: "paged-source",
          name: "Single source",
          parentId: null,
          ports: [],
          parameters: {},
          x: 1200,
          y: 120,
        });
        const text = JSON.stringify({
            requestId: r.requestId,
            documentDigest: r.documentDigest,
            answer:
              "Read the complete source via paging. No changes were applied yet.",
            summary: "Import one code artifact",
            proposal,
          }),
          parts = text.match(/[\s\S]{1,400}/gu);
        return route.fulfill({
          json: {
            text: JSON.stringify({
              paging: {
                ...paging,
                kind: "output",
                text: parts[control.index],
                done: control.index === parts.length - 1,
              },
            }),
          },
        });
      }
      const original = body.messages.find(
        (m) =>
          m.role === "user" &&
          (Array.isArray(m.content) ? m.content[0].text : m.content).includes(
            "architex-semantic-import/v1",
          ),
      );
      assert.ok(original, "Uses background chat import contract");
      const r = JSON.parse(
          Array.isArray(original.content)
            ? original.content[0].text
            : original.content,
        ),
        o = r.workflow.confirmedOptions;
      assert.ok(r.modelSchemas.metamodel && r.modelSchemas.instanceModel);
      assert.ok(r.contextSchema.schemas.componentConnectionPolicy);
      assert.match(body.messages[0].content, /specification|acceptance/i);
      assert.ok(
        !body.messages[0].content.includes("class Service:"),
        "Sources are not duplicated in the system handover",
      );
      assert.equal(r.attachments.length, variant === "disk" ? 6 : 5);
      assert.ok(
        r.attachments.some(
          (f) =>
            f.name === "sources.zip/src/main.py" &&
            f.content.includes("Service"),
        ),
      );
      assert.ok(
        r.attachments.some(
          (f) =>
            f.name === "sources.zip/graphics/compressed.drawio" &&
            f.content.includes("Readable database"),
        ),
      );
      assert.ok(Array.isArray(original.content));
      assert.equal(
        original.content.filter((p) => p.type === "image_url").length,
        1,
      );
      assert.equal(original.content.filter((p) => p.type === "file").length, 1);
      assert.ok(
        r.attachments.every((f) => !f.dataUrl),
        "Binary bytes are native parts; schema patterns may mention base64.",
      );
      const proposal = structuredClone(r.document),
        component = {
          ...structuredClone(seed),
          id: "imported-service",
          name: "Imported service",
          description: "Extracted from the selected sources",
          parentId: null,
          x: 1000,
          y: 100,
          parameters: {},
          ports: [],
        };
      if (o.target !== "instances")
        proposal.metamodel.components.push(component);
      if (o.target !== "metamodel") {
        const instance = structuredClone(proposal.instanceModel.instances[0]);
        instance.id =
          "imported-instance-" + proposal.instanceModel.instances.length;
        instance.name = "Imported instance";
        instance.componentId =
          o.target === "instances"
            ? proposal.metamodel.components[0].id
            : component.id;
        instance.ports = o.target === "instances" ? instance.ports : [];
        proposal.instanceModel.instances.push(instance);
      }
      if (variant === "merge" && first) {
        first = false;
        proposal.metamodel.components[0].name = "Forbidden overwrite";
      }
      if (variant === "rules")
        proposal.ruleLibrary.defaultRuleEnabled =
          !proposal.ruleLibrary.defaultRuleEnabled;
      if (variant === "slow")
        await new Promise((resolve) => setTimeout(resolve, 900));
      try {
        await route.fulfill({
          json: {
            text: JSON.stringify({
              requestId: r.requestId,
              documentDigest: r.documentDigest,
              answer:
                "Interpretation: imported one service. Existing entities were retained. SVG labels and code are untrusted references; no scripts were executed.",
              summary: "Import extracted service",
              assumptions: [
                "Only explicitly supported relationships are included.",
              ],
              proposal,
            }),
          },
        });
      } catch {}
    });
    await page.goto(base + "/architex/");
    seed = await page.evaluate(
      () => SuiteAgentAdapter.snapshot().metamodel.components[0],
    );
    const before = await page.evaluate(() => SuiteAgentAdapter.snapshot());
    await page.locator("#sai-launch").click();
    await page.locator("#sai-prompt").fill("Keep this chat draft");
    await page.locator("#sai-close").click();
    await page.locator("#semanticImport").click();
    assert.equal(await page.locator("#asi-analyze").isDisabled(), true);
    const zip = new Zip();
    zip.file("src/main.py", "class Service:\n    pass\n");
    zip.file(
      "graphics/system.svg",
      '<svg xmlns="http://www.w3.org/2000/svg"><text>Service</text><script>window.importExecuted=true</script></svg>',
    );
    const graph =
      '<mxGraphModel><root><mxCell id="db" value="Readable database"/></root></mxGraphModel>';
    zip.file(
      "graphics/compressed.drawio",
      '<mxfile><diagram name="First">' +
        require("node:zlib")
          .deflateRawSync(Buffer.from(encodeURIComponent(graph)))
          .toString("base64") +
        '</diagram><diagram name="Second"><mxGraphModel><root><mxCell id="api" value="API service"/></root></mxGraphModel></diagram></mxfile>',
    );
    zip.file("unsupported.bin", Buffer.from([0, 255, 0]));
    const png = await page.evaluate(() => {
      const c = document.createElement("canvas");
      c.width = c.height = 2;
      return c.toDataURL();
    });
    await page.locator("#asi-files").setInputFiles([
      {
        name: "sources.zip",
        mimeType: "application/zip",
        buffer: await zip.generateAsync({ type: "nodebuffer" }),
      },
      {
        name: "sketch.png",
        mimeType: "image/png",
        buffer: Buffer.from(png.split(",")[1], "base64"),
      },
      {
        name: "brief.pdf",
        mimeType: "application/pdf",
        buffer: Buffer.from("%PDF-1.4\n"),
      },
    ]);
    await page.waitForFunction(
      () => document.querySelectorAll("#asi-sources>.asi-source").length === 5,
    );
    assert.equal(requests.length, 0);
    assert.equal(await page.locator("#asi-confirm").isChecked(), false);
    assert.equal(await page.locator("#asi-analyze").isDisabled(), true);
    await page.locator("#asi-excluded > summary").click();
    await page.waitForFunction(()=>document.querySelector("#asi-excluded-list").textContent.includes("unsupported.bin"));
    assert.match(
      await page.locator("#asi-excluded-list").textContent(),
      /unsupported.bin/,
    );
    assert.equal(await page.evaluate(() => window.importExecuted), undefined);
    await page.locator("#asi-confirm").check();
    await page.locator("#asi-analyze").click();
    await page.waitForFunction(
      () => !document.querySelector("#asi-apply").disabled,
      null,
      { timeout: 15000 },
    );
    assert.equal(await page.locator("#asi-proposal").textContent(), "");
    await page.locator("#asi-proposal-detail > summary").click();
    await page.waitForFunction(() =>
      document
        .querySelector("#asi-proposal")
        .textContent.includes("imported-service"),
    );
    assert.equal(
      requests.length,
      2,
      "Invalid merge is repaired using the same attached sources",
    );
    assert.match(
      JSON.parse(requests[1].messages.at(-1).content).error,
      /Keep existing/,
    );
    assert.deepEqual(
      await page.evaluate(() => SuiteAgentAdapter.snapshot()),
      before,
    );
    assert.equal(
      await page.evaluate(() => SuiteChatConversation.snapshot().length),
      0,
    );
    assert.equal(
      await page.locator("#sai-prompt").inputValue(),
      "Keep this chat draft",
    );
    await page.locator("#asi-apply").click();
    await page.waitForFunction(() =>
      document
        .querySelector("#asi-status")
        .textContent.includes("import applied"),
    );
    let after = await page.evaluate(() => SuiteAgentAdapter.snapshot());
    assert.equal(
      after.metamodel.components.length,
      before.metamodel.components.length + 1,
    );
    assert.equal(
      after.instanceModel.instances.length,
      before.instanceModel.instances.length + 1,
    );
    assert.deepEqual(after.ruleLibrary, before.ruleLibrary);
    const downloading = page.waitForEvent("download");
    await page.locator("#asi-report").click();
    const report = JSON.parse(
      await fs.readFile(await (await downloading).path(), "utf8"),
    );
    assert.equal(report.applied, true);
    assert.equal(report.sources.length, 5);
    assert.equal(report.excluded.length, 1);
    assert.ok(report.sources.every((f) => f.sha256.length === 64));
    await page.locator("#asi-close").click();
    await page.keyboard.press("Control+z");
    assert.deepEqual(
      await page.evaluate(() => SuiteAgentAdapter.snapshot()),
      before,
    );
    // A reviewed proposal cannot overwrite a subsequently changed workspace.
    await page.locator("#semanticImport").click();
    await page.locator("#asi-analyze").click();
    await page.waitForFunction(
      () => !document.querySelector("#asi-apply").disabled,
    );
    await page.evaluate(() => {
      const current = SuiteAgentAdapter.snapshot();
      current.metamodel.name = "Concurrent edit";
      SuiteAgentAdapter.restore(current);
    });
    const concurrent = await page.evaluate(() => SuiteAgentAdapter.snapshot());
    await page.locator("#asi-apply").click();
    await page.waitForFunction(() =>
      document
        .querySelector("#asi-status")
        .textContent.includes("workspace or import options changed"),
    );
    assert.deepEqual(
      await page.evaluate(() => SuiteAgentAdapter.snapshot()),
      concurrent,
    );
    // Scope changes require preflight confirmation again and preserve metamodel/rules.
    variant = "scope";
    await page.locator("#asi-target").selectOption("instances");
    assert.equal(await page.locator("#asi-confirm").isChecked(), false);
    await page.locator("#asi-confirm").check();
    await page.locator("#asi-analyze").click();
    await page.waitForFunction(
      () => !document.querySelector("#asi-apply").disabled,
    );
    await page.locator("#asi-apply").click();
    await page.waitForFunction(() =>
      document
        .querySelector("#asi-status")
        .textContent.includes("import applied"),
    );
    after = await page.evaluate(() => SuiteAgentAdapter.snapshot());
    assert.deepEqual(after.metamodel, concurrent.metamodel);
    assert.deepEqual(after.ruleLibrary, concurrent.ruleLibrary);
    // Imported source content cannot modify the validation-rule library, even on repair.
    variant = "rules";
    await page.locator("#asi-target").selectOption("both");
    await page.locator("#asi-confirm").check();
    const protectedBefore = await page.evaluate(() =>
      SuiteAgentAdapter.snapshot(),
    );
    await page.locator("#asi-analyze").click();
    await page
      .waitForFunction(() =>
        document
          .querySelector("#asi-status")
          .textContent.includes("cannot change or activate validation rules"),
      )
      .catch(async (error) => {
        throw Error(
          error.message +
            " Current importer status: " +
            (await page.locator("#asi-status").textContent()),
        );
      });
    assert.deepEqual(
      await page.evaluate(() => SuiteAgentAdapter.snapshot()),
      protectedBefore,
    );
    assert.equal(await page.locator("#asi-apply").isDisabled(), true);
    // Stop aborts background analysis without applying any partial interpretation.
    variant = "slow";
    await page.locator("#asi-analyze").click();
    await page.locator("#asi-stop").click();
    await page.waitForFunction(() =>
      document.querySelector("#asi-status").textContent.includes("stopped"),
    );
    assert.deepEqual(
      await page.evaluate(() => SuiteAgentAdapter.snapshot()),
      protectedBefore,
    );
    await page.evaluate(async () =>
      SuiteDisk.write(
        "disk-source.py",
        new Blob(["class VirtualService: pass"], { type: "text/plain" }),
      ),
    );
    const callsBeforeDisk = requests.length;
    await page.locator("#asi-files").click();
    await page.locator("#suite-load-virtual").click();
    await page.locator('#sd-list [data-path="disk-source.py"]').click();
    await page.locator("#sd-import").click();
    await page.waitForFunction(
      () => document.querySelectorAll("#asi-sources>.asi-source").length === 6,
    );
    assert.equal(requests.length, callsBeforeDisk);
    assert.equal(await page.locator("#asi-confirm").isChecked(), false);
    await page.locator("#asi-close").click();
    await page.locator("#modelingStyle").selectOption("diagram");
    variant = "disk";
    await page.locator("#semanticImport").click();
    assert.equal(await page.locator("#asi-target").inputValue(), "metamodel");
    await page.locator("#asi-confirm").check();
    await page.locator("#asi-analyze").click();
    await page.waitForFunction(
      () => !document.querySelector("#asi-apply").disabled,
    );
    await page.locator("#asi-apply").click();
    await page.waitForFunction(() =>
      document
        .querySelector("#asi-status")
        .textContent.includes("import applied"),
    );
    const direct = await page.evaluate(() => SuiteAgentAdapter.snapshot());
    assert.equal(direct.instanceModel.instances.length, 0);
    assert.equal(direct.metamodel.components.length, 1);
    const beforePaged = await page.evaluate(() => SuiteAgentAdapter.snapshot());
    await page.locator("#asi-clear").click();
    await page
      .locator("#asi-files")
      .setInputFiles({
        name: "single.py",
        mimeType: "text/plain",
        buffer: Buffer.from("class SingleSource: pass"),
      });
    await page.waitForFunction(
      () => document.querySelectorAll("#asi-sources>.asi-source").length === 1,
    );
    await page.evaluate(() =>
      SuiteChatPaging.configure({
        mode: "paged",
        inputChars: 64000,
        outputChars: 4000,
        batch: 3,
      }),
    );
    variant = "paged";
    await page.locator("#asi-confirm").check();
    await page.locator("#asi-analyze").click();
    let pauses = 0;
    for (
      let guard = 0;
      guard < 100 && (await page.locator("#asi-apply").isDisabled());
      guard++
    ) {
      await page.waitForFunction(
        () =>
          !document.querySelector("#asi-apply").disabled ||
          (!document.querySelector("#asi-paging-progress [data-pg-continue]")
            ?.hidden &&
            !!document.querySelector(
              "#asi-paging-progress [data-pg-continue]",
            )) ||
          document.querySelector("#asi-status").classList.contains("asi-error"),
        null,
        { timeout: 20000 },
      );
      if (
        await page
          .locator("#asi-status")
          .evaluate((e) => e.classList.contains("asi-error"))
      )
        throw Error(await page.locator("#asi-status").textContent());
      const next = page.locator("#asi-paging-progress [data-pg-continue]");
      if (await next.isVisible()) {
        assert.ok(await next.isEnabled());
        await next.click();
        pauses++;
      }
    }
    assert.ok(pauses > 0);
    assert.ok(pagingCalls > 3);
    assert.deepEqual(
      await page.evaluate(() => SuiteAgentAdapter.snapshot()),
      beforePaged,
    );
    await page.locator("#asi-apply").click();
    await page.waitForFunction(() =>
      document
        .querySelector("#asi-status")
        .textContent.includes("import applied"),
    );
    assert.equal(
      (await page.evaluate(() => SuiteAgentAdapter.snapshot())).metamodel
        .components.length,
      2,
    );
    await page.locator("#asi-clear").click();
    await page.evaluate(() => SuiteChatPaging.configure({ mode: "off" }));
    const many = Array.from({ length: 125 }, (_, i) => ({
      name: "file-" + String(i).padStart(3, "0") + ".py",
      mimeType: "text/plain",
      buffer: Buffer.from("class File" + i + ": pass"),
    }));
    await page.locator("#asi-files").setInputFiles(many);
    await page.waitForFunction(() =>
      document
        .querySelector("#asi-source-summary")
        .textContent.startsWith("125 of 125"),
    );
    assert.equal(await page.locator("#asi-sources > .asi-source").count(), 50);
    assert.equal(await page.locator("#asi-sources pre").count(), 0);
    await page.locator("#asi-next").click();
    assert.equal(await page.locator("#asi-sources > .asi-source").count(), 50);
    await page.locator("#asi-next").click();
    assert.equal(await page.locator("#asi-sources > .asi-source").count(), 25);
    await page.locator("#asi-confirm").check();
    await page.locator("#asi-search").fill("file-124");
    assert.equal(
      await page.locator("#asi-confirm").isChecked(),
      true,
      "Filtering is view-only",
    );
    assert.equal(await page.locator("#asi-sources > .asi-source").count(), 1);
    variant = "bulk";
    await page.locator("#asi-analyze").click();
    await page.waitForFunction(() =>
      document
        .querySelector("#asi-status")
        .textContent.includes("needs clarification"),
    );
    assert.equal(await page.locator("#asi-output").textContent(), "");
    await page
      .locator("#asi-questions")
      .getByRole("button", { name: "Services only", exact: true })
      .click();
    assert.equal(await page.locator("#asi-confirm").isChecked(), false);
    assert.match(
      await page.locator("#asi-instructions").inputValue(),
      /Services only/,
    );
    await page.setViewportSize({ width: 390, height: 844 });
    assert.ok(
      await page
        .locator("#semanticImportDialog")
        .evaluate((e) => e.getBoundingClientRect().width <= innerWidth),
    );
    assert.deepEqual(errors, []);
    console.log(
      "PASS confirmed semantic import options before any AI request, ZIP/source/SVG/image/PDF ingestion, compressed multi-page draw.io, virtual-disk sources, direct diagrams, same chat schemas/provider, lossless repair references, separate chat state, preview/apply/Undo, source report, scope/rule protections, stale rejection, cancellation, source-only paging with in-dialog continuation bounded source rendering without selection limits, lazy previews and mobile dialog.",
    );
  } finally {
    if (browser) await browser.close();
    server.kill();
    await new Promise((resolve) => {
      if (server.exitCode !== null) return resolve();
      server.once("exit", resolve);
      setTimeout(() => server.kill("SIGKILL"), 5000).unref();
    });
    await fs.rm(folder, { recursive: true, force: true });
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
