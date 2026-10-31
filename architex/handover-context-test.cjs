const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs/promises"),
  path = require("node:path"),
  vm = require("node:vm"),
  Architex = require("./model.js");
async function handover() {
  const window = { SuiteAgentProtocol: { version: "desktop-suite-agent/v1" } },
    source = await fs.readFile(path.join(__dirname, "llm-handover.js"), "utf8");
  vm.runInNewContext(source, {
    window,
    Architex,
    URL,
    document: { baseURI: "http://local.test/architex/" },
    fetch: async (url) => ({
      ok: true,
      text: () =>
        fs.readFile(
          path.join(__dirname, url.pathname.replace("/architex/", "")),
          "utf8",
        ),
    }),
  });
  return window.ArchitexHandover;
}
test("chat handover keeps complete schemas and identifiers without duplicating user payload", async () => {
  const H = await handover(),
    request = {
      protocol: "desktop-suite-agent/v1",
      requestId: "request-1",
      documentDigest: "digest",
      document: {
        metamodel: { name: "unique-model-payload" },
        instanceModel: { instances: [] },
      },
      attachments: [
        { name: "unique.py", kind: "text", content: "unique-source-payload" },
      ],
    },
    before = JSON.stringify(request),
    rendered = await H.render(request, "validation API");
  assert.ok(rendered.includes("request-1"));
  assert.ok(rendered.includes("user message.document"));
  assert.ok(rendered.includes("instanceDataPoint"));
  assert.ok(rendered.includes("componentConnectionPolicy"));
  assert.ok(!rendered.includes("unique-source-payload"));
  assert.ok(!rendered.includes("unique-model-payload"));
  assert.equal(JSON.stringify(request), before);
});
test("standalone handover exports still embed their complete supplied context", async () => {
  const H = await handover(),
    rendered = await H.render(
      {
        format: "architex-agent-request",
        metamodel: { name: "standalone-model-payload" },
        instanceModel: { instances: [] },
      },
      "API",
    );
  assert.ok(rendered.includes("standalone-model-payload"));
});
