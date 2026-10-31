const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  I = require("./semantic-import.js"),
  M = require("../shared-ai/multimodal.js"),
  JSZip = require("./vendor/jszip.min.js");
const baseline = () => ({
  metamodel: {
    name: "Architecture",
    components: [
      {
        id: "service",
        name: "Service",
        description: "Keep meaning",
        parameters: { runtime: "node" },
        ports: [{ id: "port", name: "events" }],
      },
    ],
    dependencies: [],
  },
  instanceModel: {
    instances: [
      {
        id: "service-prod",
        componentId: "service",
        name: "Production",
        ports: [],
      },
    ],
    connections: [],
  },
  ruleLibrary: {
    format: "architex-validation-rules",
    version: 1,
    defaultRuleEnabled: true,
    rules: [],
  },
});
test("merge preserves stable entities and existing attributes while allowing semantic extension", () => {
  const before = baseline(),
    after = structuredClone(before);
  after.metamodel.components[0].parameters.owner = "team";
  after.metamodel.components[0].ports.push({ id: "extra", name: "new data" });
  after.metamodel.components.push({ id: "new", name: "New" });
  assert.equal(I.validatePolicy(before, after, { strategy: "merge" }), after);
  after.metamodel.components[0].name = "Incoming name";
  assert.throws(
    () => I.validatePolicy(before, after, { strategy: "merge" }),
    /Keep existing/,
  );
  assert.equal(
    I.validatePolicy(before, after, {
      strategy: "merge",
      conflicts: "incoming",
    }),
    after,
  );
  after.metamodel.components[0].ports = [];
  assert.throws(
    () =>
      I.validatePolicy(before, after, {
        strategy: "merge",
        conflicts: "incoming",
      }),
    /remove existing/,
  );
});
test("add, scope, replacement and rules constraints are enforced independently of AI claims", () => {
  const before = baseline(),
    after = structuredClone(before);
  after.metamodel.components[0].description = "Changed";
  assert.throws(
    () => I.validatePolicy(before, after, { strategy: "add" }),
    /preserve existing/,
  );
  assert.throws(
    () =>
      I.validatePolicy(before, after, {
        target: "instances",
        strategy: "replace",
      }),
    /outside/,
  );
  assert.equal(
    I.validatePolicy(before, after, {
      target: "metamodel",
      strategy: "replace",
    }),
    after,
  );
  after.ruleLibrary.defaultRuleEnabled = false;
  assert.throws(
    () => I.validatePolicy(before, after, { strategy: "replace" }),
    /validation rules/,
  );
});
test("canonical equality tolerates object key order and reports actual ID-based differences", () => {
  assert.ok(I.equal({ a: 1, b: 2 }, { b: 2, a: 1 }));
  const before = baseline(),
    after = structuredClone(before);
  after.metamodel.components.push({ id: "new", name: "New" });
  after.instanceModel.instances[0].name = "Changed";
  const diff = I.diff(before, after);
  assert.equal(diff[0].added[0].id, "new");
  assert.equal(diff[2].changed[0].before.name, "Production");
  assert.match(
    I.task({ strategy: "add", relations: "explicit" }),
    /Do not change or delete/,
  );
  assert.throws(() => I.options({ target: "unknown" }), /target/);
});
test("ZIPs, nested archives, source paths, media bytes, unsupported entries and hashes remain explicit", async () => {
  const inner = new JSZip();
  inner.file("diagram.svg", "<svg><text>Service</text></svg>");
  const zip = new JSZip();
  zip.file("src/main.rs", "fn main() {}");
  zip.file("images/screen.png", new Uint8Array([137, 80, 78, 71, 0]));
  zip.file("bad.bin", new Uint8Array([0, 255, 0]));
  zip.file("../escape.txt", "must not import");
  zip.file("nested.zip", await inner.generateAsync({ type: "uint8array" }));
  const input = new File(
    [await zip.generateAsync({ type: "uint8array" })],
    "sources.zip",
  );
  const result = await I.readSources(
    [input, new File(["%PDF"], "brief.pdf", { type: "application/pdf" })],
    { media: M, zip: JSZip },
  );
  assert.ok(
    result.items.some(
      (f) =>
        f.name === "sources.zip/src/main.rs" && f.content === "fn main() {}",
    ),
  );
  assert.ok(
    result.items.some((f) => f.name === "sources.zip/nested.zip/diagram.svg"),
  );
  assert.equal(result.items.find((f) => f.kind === "image").bytes, 5);
  assert.equal(result.items.find((f) => f.name === "brief.pdf").kind, "file");
  assert.ok(result.issues.some((f) => f.name.endsWith("bad.bin")));
  assert.ok(result.issues.some((f) => f.message.includes("Unsafe")));
  assert.ok(result.items.every((f) => f.sha256.length === 64));
});
test("cancellation discards incomplete source ingestion and does not read later files", async () => {
  const abort = new AbortController();
  abort.abort();
  await assert.rejects(
    () =>
      I.readSources([new File(["x"], "x.py")], {
        media: M,
        zip: JSZip,
        signal: abort.signal,
      }),
    /stopped/,
  );
});
test("compressed draw.io page decoding preserves graph XML and Unicode labels", async () => {
  const xml =
      '<mxGraphModel><root><mxCell id="s" value="Gateway → Database"/></root></mxGraphModel>',
    encoded = require("node:zlib")
      .deflateRawSync(Buffer.from(encodeURIComponent(xml)))
      .toString("base64");
  assert.equal(await I.decodeDrawioPage(encoded), xml);
  await assert.rejects(() => I.decodeDrawioPage("broken payload"));
});
test("source ingestion reads each file once and preserves duplicate-name snapshots", async () => {
  let reads = 0;
  const bytes = new TextEncoder().encode("class Service: pass"),
    file = {
      name: "service.py",
      size: bytes.length,
      type: "text/plain",
      arrayBuffer: async () => {
        reads++;
        return bytes.buffer;
      },
    };
  const result = await I.readSources([file, file, file], {
    media: M,
    zip: JSZip,
  });
  assert.equal(reads, 3);
  assert.equal(result.issues.length, 0);
  assert.deepEqual(
    result.items.map((f) => f.name),
    ["service.py", "service.py (2)", "service.py (3)"],
  );
  assert.ok(result.items.every((f) => f.content === "class Service: pass"));
});
test("portable paths normalize Windows separators and reject traversal and NUL", () => {
  assert.equal(I.path("src\\main.py"), "src/main.py");
  assert.throws(() => I.path("..\\outside.py"), /Unsafe/);
  assert.throws(() => I.path("bad\0name.py"), /Unsafe/);
});
test("indexed preservation rejects duplicate IDs rather than hiding modified entities", () => {
  const before = baseline(),
    after = structuredClone(before);
  after.metamodel.components.push({
    ...after.metamodel.components[0],
    name: "Other",
  });
  for (const strategy of ["merge", "add"])
    assert.throws(
      () => I.validatePolicy(before, after, { strategy }),
      /Duplicate ID/,
    );
});
