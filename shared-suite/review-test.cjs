const assert = require("node:assert/strict"),
  C = require("./review-core"),
  N = require("./notebook-core");
const cases = [
  [
    "architex",
    {
      metamodel: {
        name: "X",
        components: [
          { name: "Same", description: "A" },
          { name: "same", description: "B" },
        ],
      },
    },
    "repeated-component-name",
  ],
  [
    "sheetiX",
    { name: "X", sheets: [{ name: "One" }, { name: "one" }] },
    "repeated-sheet-name",
  ],
  [
    "automatextiX",
    {
      name: "X",
      nodes: [
        { id: "a", type: "trigger" },
        { id: "b", type: "action" },
        { id: "c", type: "action" },
      ],
      edges: [{ source: "b", target: "c" }],
    },
    "unreachable-workflow-step",
  ],
  [
    "reportiX",
    {
      name: "X",
      sources: [{ url: "https://a", excerpt: "X" }, { url: "https://a" }],
    },
    "duplicate-source-url",
  ],
  [
    "presentiX",
    {
      name: "X",
      slides: [
        {
          title: "One",
          elements: [{ type: "text", text: "Tiny", fontSize: 9 }],
        },
      ],
    },
    "small-interface-text",
  ],
  [
    "sketchiX",
    { name: "X", nodes: [], edges: [{ source: "a", target: "b", label: "" }] },
    "connection-without-label",
  ],
  [
    "mindiX",
    {
      name: "X",
      nodes: [
        { parent: "a", text: "X" },
        { parent: "b", text: "Y" },
        { parent: "a", text: "x" },
      ],
    },
    "repeated-sibling-topic",
  ],
  [
    "projectiX",
    {
      name: "X",
      tasks: [
        { parent: null, name: "A" },
        { parent: "a", name: "Task" },
        { parent: null, name: "B" },
        { parent: "a", name: "task" },
      ],
    },
    "repeated-sibling-task",
  ],
  [
    "vidiX",
    {
      project: { name: "X", duration: 10, clips: [{ start: 8, duration: 5 }] },
    },
    "clip-beyond-timeline",
  ],
  [
    "photiX",
    {
      name: "X",
      operations: [{ type: "text", text: "Caption", region: { height: 8 } }],
    },
    "small-caption-region",
  ],
  [
    "designiX",
    {
      name: "X",
      pages: [
        {
          name: "One",
          elements: [{ type: "text", text: "Tiny", fontSize: 8 }],
        },
      ],
    },
    "small-interface-text",
  ],
  [
    "colabriX",
    { name: "X", items: [{ type: "note", text: "" }] },
    "empty-board-note",
  ],
  [
    "mockiX",
    {
      name: "X",
      screens: [
        { id: "a", elements: [{ type: "button", text: "" }] },
        { id: "b", elements: [] },
      ],
      flow: { nodes: [{ id: "d", type: "decision" }], edges: [] },
    },
    "decision-missing-branches",
  ],
  [
    "shelliX",
    {
      audit: {
        findings: [
          {
            severity: "warning",
            code: "failed-result",
            path: "events.a",
            message: "exit 1",
          },
        ],
        limitations: "Historical results only.",
      },
    },
    "failed-result",
  ],
];
for (const [tool, doc, code] of cases) {
  const before = JSON.stringify(doc),
    r = C.report(tool, doc);
  assert.ok(
    r.findings.some((f) => f.code === code),
    tool,
  );
  assert.equal(
    Object.values(r.counts).reduce((a, b) => a + b, 0),
    r.findings.length,
  );
  assert.equal(JSON.stringify(doc), before);
}
assert.equal(
  C.report("mindiX", cases.find((c) => c[0] === "mindiX")[1]).findings.find(
    (f) => f.code === "repeated-sibling-topic",
  ).path,
  "nodes.2",
);
assert.equal(
  C.report(
    "projectiX",
    cases.find((c) => c[0] === "projectiX")[1],
  ).findings.find((f) => f.code === "repeated-sibling-task").path,
  "tasks.3",
);
const finding = {
    severity: "warning",
    code: "test",
    path: "screens.0",
    message: "Review this layout",
  },
  book = {
    ...N.empty("mockiX"),
    notes: "Keep my notes",
    tasks: [{ id: "mine", text: "My original task", done: true }],
  },
  before = JSON.stringify(book),
  first = C.toNotebook(book, "mockiX", "Checkout", [finding]),
  again = C.toNotebook(first.doc, "mockiX", "Checkout", [finding]);
assert.equal(first.added, 1);
assert.equal(again.added, 0);
assert.equal(first.doc.tasks[0].done, true);
assert.equal(first.doc.notes, "Keep my notes");
assert.equal(JSON.stringify(book), before);
assert.throws(
  () => C.toNotebook(book, "textiX", "Other", [finding]),
  /another app/,
);
assert.throws(
  () => C.toNotebook(book, "mockiX", "X", [{ ...finding, severity: "bad" }]),
  /Invalid/,
);
console.log(
  "PASS: app-specific advisories, correct source paths, immutable reports, count integrity, historical audit scope, additive/deduplicated notebook tasks and wrong-app rejection.",
);
const exportSource = C.report("mockiX", {
  name: "X",
  screens: [
    {
      id: "a",
      elements: [
        { type: "button", text: "" },
        { type: "text", fontSize: 8, text: "Small" },
      ],
    },
    { id: "b", elements: [] },
  ],
});
const originalExport = JSON.stringify(exportSource);
const subset = C.scopedReport(exportSource, "selected", [1, 1, 0]);
assert.equal(subset.findings.length, 2);
assert.equal(subset.sourceFindingCount, exportSource.findings.length);
assert.equal(subset.exportScope, "selected");
assert.equal(
  Object.values(subset.counts).reduce((a, b) => a + b, 0),
  2,
);
assert.equal(JSON.stringify(exportSource), originalExport);
subset.findings[0].message = "Changed export";
assert.equal(JSON.stringify(exportSource), originalExport);
assert.throws(
  () => C.scopedReport(exportSource, "selected", []),
  /Select findings/,
);
assert.throws(
  () => C.scopedReport(exportSource, "filtered", [999]),
  /unavailable/,
);
assert.equal(C.scopedReport(exportSource, "filtered", []).findings.length, 0);
const md = C.markdown({
  ...C.scopedReport(exportSource, "all"),
  findings: [
    {
      severity: "warning",
      code: "literal",
      path: "x[0]",
      message: "<script>alert(1)</script>",
    },
  ],
});
assert.match(md, /\n\nScope: all/);
assert.ok(md.includes("\\<script\\>"));
assert.doesNotMatch(md, /<script>/);
console.log(
  "PASS: scoped exports retain source order/counts, independent copies, exact scope metadata, empty-selection rejection and literal-safe Markdown.",
);
const briefReport = {
  tool: "textiX",
  createdAt: "2026-10-31T00:00:00.000Z",
  limitations: "Static review only.",
  findings: [
    {
      severity: "warning",
      code: "heading",
      path: "html.h3",
      message: "Heading jump <script>data</script>",
    },
    {
      severity: "info",
      code: "link",
      path: "html.a",
      message: "Generic link label",
    },
  ],
};
const untouched = JSON.stringify(briefReport);
for (const intent of ["investigate", "improve", "verify"]) {
  const text = C.brief(briefReport, [1], intent);
  assert.ok(text.includes('"selectedFindingCount": 1'));
  assert.ok(text.includes("Generic link label"));
  assert.ok(!text.includes("Heading jump"));
  assert.ok(text.includes("untrusted reference data"));
  assert.ok(text.includes("subset of the captured review"));
}
assert.match(C.brief(briefReport, [0], "investigate"), /read-only/);
assert.match(
  C.brief(briefReport, [0], "verify"),
  /Do not modify content or run commands/,
);
assert.equal(JSON.stringify(briefReport), untouched);
assert.throws(() => C.brief(briefReport, []), /Select findings/);
assert.throws(() => C.brief(briefReport, [3]), /unavailable finding/);
assert.throws(() => C.brief(briefReport, [0], "constructor"), /Choose/);
assert.throws(
  () =>
    C.brief({ ...briefReport, findings: [{ message: "x".repeat(30000) }] }, [
      0,
    ]),
  /30,000/,
);
console.log(
  "PASS: bounded selected-finding briefs, all intents, immutable capture and invalid/empty selection protection.",
);
