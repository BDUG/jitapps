const assert = require("node:assert/strict"),
  { chromium } = require("playwright"),
  { agentControl } = require("./browser-tools.cjs");
(async () => {
  const browser = await chromium.launch({
    executablePath: "/usr/bin/chromium",
    args: ["--no-sandbox"],
  });
  try {
    const page = await browser.newPage();
    let runs = 0;
    const text =
      "exact-receipt-marker <script>inert()</script> 🧪 " +
      "large source ".repeat(10000);
    const fixture = {
      id: "lazy-receipts",
      createdAt: new Date().toISOString(),
      goal: "Inspect only",
      status: "paused",
      tool: "textiX",
      events: Array.from({ length: 100 }, (_, i) => ({
        kind: "observation",
        value: {
          id: "read-" + i,
          tool: "read_file",
          ok: true,
          result: { text: text + i },
        },
      })),
    };
    await page.route("**/api/health", (r) =>
      r.fulfill({ json: { agentHandoff: { mode: "off" } } }),
    );
    await page.route("**/api/agent/health", (r) =>
      r.fulfill({
        json: {
          enabled: true,
          workspace: "/tmp/example",
          commands: [],
          tools: [],
        },
      }),
    );
    await page.route("**/api/agent", (r) => {
      const op = r.request().postDataJSON().op;
      if (["start", "resume", "tool", "step"].includes(op)) runs++;
      return r.fulfill({
        json:
          op === "list"
            ? { sessions: [fixture] }
            : op === "session"
              ? fixture
              : op === "changes"
                ? { changes: [] }
                : { scripts: [] },
      });
    });
    await page.goto(
      (process.env.BASE_URL || "http://127.0.0.1:8013") + "/textiX/",
    );
    await page.evaluate(() => {
      SuiteChatPaging.configure({ mode: "off" });
      SuiteCodingAgent.open();
      window.receiptFormats = 0;
      const stringify = JSON.stringify;
      JSON.stringify = function (value, ...args) {
        if (
          value?.tool === "read_file" &&
          value?.result?.text?.startsWith("exact-receipt-marker")
        )
          window.receiptFormats++;
        return stringify.call(this, value, ...args);
      };
    });
    await agentControl(page, "#ag-sessions", "selectOption", fixture.id);
    await agentControl(page, "#ag-load", "click");
    assert.equal(
      await page.locator('#ag-log [data-kind="observation"]').count(),
      100,
    );
    assert.equal(await page.evaluate(() => window.receiptFormats), 0);
    const details = page
      .locator('#ag-log [data-kind="observation"] details')
      .first();
    await details.locator("summary").click();
    await page.waitForFunction(() => window.receiptFormats === 1);
    assert.ok((await details.textContent()).includes("exact-receipt-marker"));
    assert.equal(await details.locator("script").count(), 0);
    await details.locator("summary").click();
    await details.locator("summary").click();
    assert.equal(await page.evaluate(() => window.receiptFormats), 1);
    await agentControl(page, "#ag-log-search", "fill", "exact-receipt-marker");
    assert.equal(
      await page.locator('#ag-log [data-kind="observation"]:visible').count(),
      100,
    );
    assert.equal(await page.evaluate(() => window.receiptFormats), 100);
    await agentControl(page, "#ag-log-search", "fill", "no-such-receipt");
    assert.equal(
      await page.locator('#ag-log [data-kind="observation"]:visible').count(),
      0,
    );
    assert.equal(await page.evaluate(() => window.receiptFormats), 100);
    assert.equal(runs, 0);
    console.log(
      "PASS: 100 collapsed large receipts perform zero JSON formatting; first inspection formats once; exact inert search formats remaining receipts once, reuses cached text and executes no agent actions.",
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
