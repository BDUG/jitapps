const assert = require("node:assert/strict"),
  C = require("./hub-core.js");
const apps = [
  {
    id: "codeiX",
    name: "codeiX",
    category: "Code editor",
    description: "Build code",
  },
  {
    id: "textiX",
    name: "textiX",
    category: "Documents",
    description: "Write reports",
  },
  {
    id: "shelliX",
    name: "shelliX",
    category: "AI shell",
    description: "Run commands",
  },
];
assert.equal(C.appSearch(apps, "code build").length, 1);
assert.equal(C.appSearch(apps, "not-found").length, 0);
assert.equal(C.appSearch(apps, "", { favorites: ["textiX"] })[0].id, "textiX");
assert.equal(C.appSearch(apps, "", { recent: ["shelliX"] })[0].id, "shelliX");
assert.deepEqual(
  C.preferences({
    density: "bad",
    favorites: ["codeiX", "codeiX", "../escape"],
    reduceMotion: "true",
  }),
  {
    version: 1,
    density: "comfortable",
    favorites: ["codeiX"],
    recent: [],
    reduceMotion: false,
  },
);
const rows = Array.from({ length: 70 }, (_, i) => ({
    id: "item-" + i,
    name: "Item " + i,
    kind: i % 2 ? "port" : "node",
    value: "Text",
  })),
  before = JSON.stringify(rows);
let page = C.inventory(rows, { query: "port Text", limit: 10, offset: 10 });
assert.equal(page.matched, 35);
assert.equal(page.entries.length, 10);
assert.equal(page.all.length, 35);
assert.equal(page.entries[0].index, 21);
assert.equal(C.inventory(rows, { query: "Item 69", offset: 200 }).offset, 0);
assert.equal(
  C.inventory(rows, { sort: "label" }).entries[2].row.name,
  "Item 2",
);
assert.equal(JSON.stringify(rows), before);
assert.throws(() => C.inventory(rows, { limit: 0 }));
assert.throws(() => C.inventory(rows, { sort: "invalid" }));
console.log(
  "PASS shared app search, favorites/recent preferences, safe settings, inventory filtering, stable selection indices, paging and nonmutation.",
);

const targets = C.actionTargets(),
  actions = C.actionSearch(targets);
assert.equal(actions.length, 5);
assert.deepEqual(
  C.actionSearch(["suite-tasks-open"], "notes checklist").map((a) => a.id),
  ["tasks"],
);
assert.deepEqual(
  C.actionSearch(targets, "QUALITY REVIEW").map((a) => a.id),
  ["review"],
);
assert.deepEqual(
  C.actionSearch(targets, "native templates").map((a) => a.id),
  ["catalogue"],
);
assert.equal(C.actionSearch(["untrusted-action"], "").length, 0);
assert.equal(C.actionSearch(["suite-tasks-open"], "quality").length, 0);
assert.equal(C.actionSearch(targets, "nothing matches").length, 0);
actions[0].target = "untrusted-action";
targets.pop();
assert.equal(C.actionTargets().length, 5);
assert.equal(C.actionSearch(C.actionTargets())[0].target, "suite-tasks-open");
console.log(
  "PASS: workspace action allowlist, available-target filtering, token/case matching and independent result metadata.",
);
