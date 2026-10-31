const assert = require("node:assert/strict"),
  C = require("./workspace-core.js");
const before = {
    name: "Before",
    notes: "Old",
    items: [
      { id: "a", label: "A" },
      { id: "b", label: "B" },
    ],
    "a.b": { value: "original" },
  },
  after = {
    name: "After",
    notes: "New",
    items: [{ id: "a", label: "Changed" }],
    "a.b": { value: "updated" },
    extra: { label: "new" },
  };
const changes = C.diff(before, after),
  index = (path) =>
    changes.findIndex(
      (c) => JSON.stringify(c.segments) === JSON.stringify(path),
    );
const selected = C.selectChanges(before, after, [
  index(["name"]),
  index(["a.b", "value"]),
]);
assert.equal(selected.name, "After");
assert.equal(selected.notes, "Old");
assert.deepEqual(selected.items, before.items);
assert.equal(selected["a.b"].value, "updated");
assert.deepEqual(
  C.selectChanges(
    before,
    after,
    changes.map((_, i) => i),
  ),
  after,
);
assert.deepEqual(C.selectChanges(before, after, []), before);
assert.deepEqual(
  C.selectChanges(before, after, [index(["items", "1"])]).items,
  [before.items[0]],
);
assert.throws(() => C.selectChanges(before, after, [999]), /valid/);
const proto = JSON.parse(
  '{"__proto__":{"polluted":"no"},"constructor":"data"}',
);
assert.deepEqual(
  C.selectChanges(
    {},
    proto,
    C.diff({}, proto).map((_, i) => i),
  ),
  proto,
);
assert.equal({}.polluted, undefined);
assert.equal(before.name, "Before");
console.log(
  "PASS selective review: exact path segments, independent fields, array deletion, all/none equivalence, immutable inputs and prototype-safe data.",
);
const complete = C.selectChanges(before, after, [
    ...changes.map((_, i) => i),
    0,
  ]),
  unchanged = C.selectChanges(before, after, []);
complete.items[0].label = "Independent complete copy";
unchanged.items[0].label = "Independent unchanged copy";
assert.equal(after.items[0].label, "Changed");
assert.equal(before.items[0].label, "A");
assert.deepEqual(C.selectChanges({ value: 1 }, { value: 2 }, [0, 0]), {
  value: 2,
});
console.log(
  "PASS fast review paths: independent copies, duplicate selection indices and unchanged source documents.",
);
