const assert = require("node:assert/strict"),
  C = require("./review-core");
const finding = (
  code,
  message = code,
  severity = "warning",
  path = "document",
) => ({ severity, code, message, path });
const report = (findings, tool = "textiX") => ({
  format: "suite-quality-report/v1",
  tool,
  createdAt: "2026-11-08T10:00:00Z",
  findings,
  limitations: "Static evidence only.",
});
const old = report([
    finding("removed"),
    finding("kept"),
    finding("duplicate"),
    finding("duplicate"),
  ]),
  current = report([
    finding("duplicate"),
    finding("new"),
    finding("kept"),
    finding("duplicate"),
    finding("duplicate"),
  ]),
  before = JSON.stringify(old),
  after = JSON.stringify(current),
  delta = C.reviewDelta(old, current, [0, 1, 3, 3], "Previous document");
assert.deepEqual(delta.comparison.counts, { new: 2, removed: 1, unchanged: 3 });
assert.deepEqual(delta.selection, [2, 3]);
assert.equal(delta.comparison.baselineLabel, "Previous document");
assert.match(delta.comparison.note, /not verified fixed/);
assert.equal(JSON.stringify(old), before);
assert.equal(JSON.stringify(current), after);
assert.deepEqual(C.reviewDelta(null, current), {
  comparison: null,
  selection: [],
});
assert.deepEqual(C.reviewDelta(old, report([]), [1]).selection, []);
assert.equal(
  C.reviewDelta(old, report([finding("kept", "Changed wording")]), [1])
    .selection.length,
  0,
);
assert.equal(
  C.reviewDelta(old, report([finding("kept", "kept", "error")]), [1]).selection
    .length,
  0,
);
assert.equal(
  C.reviewDelta(old, report([finding("kept", "kept", "warning", "moved")]), [1])
    .selection.length,
  0,
);
assert.throws(() => C.reviewDelta(old, report([], "mockiX"), []), /this app/);
for (const indices of [[99], [-1], [0.5], ["0"], null])
  assert.throws(() => C.reviewDelta(old, current, indices), /unavailable/);
const states = delta.comparison.items
  .slice(0, current.findings.length)
  .map((f) => f.status);
assert.deepEqual(
  C.search(current, { query: "NEW document", change: "new", states }).map(
    (r) => r.index,
  ),
  [1],
);
assert.deepEqual(
  C.search(current, { query: "duplicate", change: "new", states }).map(
    (r) => r.index,
  ),
  [4],
);
assert.deepEqual(
  C.search(current, { change: "unchanged", states }).map((r) => r.index),
  [0, 2, 3],
);
assert.equal(C.search(current, { severity: "info" }).length, 0);
assert.equal(C.search(null).length, 0);
assert.throws(
  () => C.search(current, { change: "removed", states }),
  /current-finding/,
);
const big = C.reviewDelta(
  report(Array.from({ length: 200 }, (_, i) => finding("old" + i))),
  report([]),
);
assert.equal(big.comparison.counts.removed, 200);
assert.equal(big.comparison.items.length, 200);
console.log(
  "PASS: multiset review comparisons, selection remapping by exact finding and duplicate occurrence, changed/missing finding removal, wrong-app/index rejection, token/change/severity filters, immutable captures and complete large comparisons.",
);
