const assert = require("node:assert/strict"),
  P = require("./preferences");
const empty = P.parse(null),
  before = JSON.stringify(empty),
  pinned = P.pin(empty, "builtin:blue");
assert.deepEqual(empty.pinned, []);
assert.equal(JSON.stringify(empty), before);
assert.deepEqual(pinned.pinned, ["builtin:blue"]);
assert.deepEqual(P.pin(pinned, "builtin:blue").pinned, []);
let prefs = pinned;
for (let i = 0; i < 40; i++) prefs = P.remember(prefs, "saved:" + i);
assert.equal(prefs.recent.length, 20);
assert.equal(prefs.recent[0], "saved:39");
prefs = P.remember(prefs, "saved:30");
assert.equal(prefs.recent[0], "saved:30");
assert.equal(prefs.recent.length, 20);
const entries = [
  {
    key: "saved:39",
    name: "Saved brief",
    kind: "template",
    description: "Decision log",
    tags: ["meeting"],
    origin: "Saved copy",
  },
  {
    key: "builtin:blue",
    name: "Blue layout",
    kind: "layout",
    description: "Readable",
    origin: "Built-in",
  },
  {
    key: "saved:30",
    name: "Project brief",
    kind: "template",
    description: "Project",
    origin: "Saved copy",
  },
];
const source = JSON.stringify(entries);
assert.equal(P.select(entries, prefs)[0].key, "builtin:blue");
assert.deepEqual(
  P.select(entries, prefs, { view: "pinned" }).map((e) => e.key),
  ["builtin:blue"],
);
assert.deepEqual(
  P.select(entries, prefs, { view: "recent" }).map((e) => e.key),
  ["saved:30", "saved:39"],
);
assert.equal(
  P.select(entries, prefs, { query: "meeting saved", kind: "template" })[0].key,
  "saved:39",
);
assert.equal(
  P.select(entries, prefs, { view: "pinned", kind: "template" }).length,
  0,
);
assert.equal(JSON.stringify(entries), source);
assert.throws(() => P.parse("{broken"), /unreadable/);
assert.throws(
  () => P.parse(JSON.stringify({ format: "wrong", pinned: [], recent: [] })),
  /invalid/,
);
assert.throws(
  () =>
    P.pin(
      {
        format: empty.format,
        pinned: Array.from({ length: 100 }, (_, i) => "x" + i),
        recent: [],
      },
      "new",
    ),
  /Unpin/,
);
assert.deepEqual(
  P.parse(JSON.stringify({ ...empty, pinned: ["x", "x"] })).pinned,
  ["x"],
);
console.log(
  "PASS: app view preferences, immutable pinning, bounded/deduplicated recent history, token search/kind/view filters, stable ordering and invalid-data protection.",
);

assert.deepEqual(P.setPinned(pinned, "builtin:blue", true).pinned, [
  "builtin:blue",
]);
assert.deepEqual(P.setPinned(pinned, "builtin:blue", false).pinned, []);
assert.throws(() => P.setPinned(empty, "x", "yes"), /boolean/);
