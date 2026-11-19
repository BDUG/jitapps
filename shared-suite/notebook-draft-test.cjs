const assert = require("node:assert/strict"),
  N = require("./notebook-core");
const original = {
    ...N.empty("textiX"),
    title: "Draft",
    notes: "Unsaved <script>literal</script>",
    tasks: [
      { id: "blank", text: "", done: false },
      { id: "spaces", text: "  ", done: true },
      { id: "kept", text: "Keep task", done: false },
    ],
  },
  before = JSON.stringify(original),
  base = JSON.stringify(N.empty("textiX"), null, 2);
const raw = N.draft(base, original),
  recovered = N.readDraft(raw, "textiX");
assert.deepEqual(recovered.doc, original);
assert.equal(recovered.baseRaw, base);
assert.equal(JSON.stringify(original), before);
assert.ok(Number.isFinite(Date.parse(recovered.updatedAt)));
assert.equal(N.readDraft(N.draft(null, original), "textiX").baseRaw, null);
recovered.doc.tasks[0].text = "independent";
assert.equal(N.readDraft(raw, "textiX").doc.tasks[0].text, "");
assert.throws(() => N.validate(original), /nonempty/);
assert.throws(
  () =>
    N.draft(base, {
      ...original,
      tasks: [original.tasks[0], original.tasks[0]],
    }),
  /unique/,
);
assert.throws(() => N.readDraft(raw, "mockiX"), /another app/);
assert.throws(() => N.readDraft("{broken", "textiX"));
const packet = JSON.parse(raw);
for (const change of [
  { format: "wrong" },
  { baseRaw: {} },
  { updatedAt: "bad date" },
  { doc: { ...original, tool: "mockiX" } },
  { doc: { ...original, notes: 8 } },
]) {
  assert.throws(() =>
    N.readDraft(JSON.stringify({ ...packet, ...change }), "textiX"),
  );
}
assert.throws(() => N.draft(undefined, original), /Invalid/);
assert.throws(
  () => N.draft(null, { ...original, notes: "😀".repeat(250000) }),
  /1 MB/,
);
assert.equal(
  N.readDraft(N.draft(null, { ...original, secret: "strip" }), "textiX").doc
    .secret,
  undefined,
);
assert.equal(
  N.readDraft(JSON.stringify({ ...packet, secret: "strip" }), "textiX").secret,
  undefined,
);
console.log(
  "PASS: exact notebook drafts, incomplete tasks, per-app isolation, immutable copies, original save version, metadata stripping, corrupt record rejection and UTF-8 size bounds.",
);
