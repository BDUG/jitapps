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

// Field views retain original row identities; they never coerce or modify source data.
const rowsForFields=[{id:'a',count:10,status:'ready',text:'<script>bad()</script>'},{id:'b',count:'2',status:'draft'},{id:'c',count:2,status:'ready'},{id:'d',count:null},{id:'e',count:'not a number'},{id:'f'}];
const rowsBefore=JSON.stringify(rowsForFields);
assert.deepEqual(C.inventory(rowsForFields,{field:'status',operator:'equals',value:'READY'}).all.map(e=>e.index),[0,2]);
assert.deepEqual(C.inventory(rowsForFields,{field:'count',operator:'atLeast',value:'2'}).all.map(e=>e.index),[0,1,2]);
assert.deepEqual(C.inventory(rowsForFields,{field:'count',operator:'atMost',value:'2'}).all.map(e=>e.index),[1,2]);
assert.deepEqual(C.inventory(rowsForFields,{field:'count',operator:'empty'}).all.map(e=>e.index),[3,5]);
assert.deepEqual(C.inventory(rowsForFields,{sortKey:'count'}).all.map(e=>e.index),[1,2,0,4,3,5]);
assert.deepEqual(C.inventory(rowsForFields,{sortKey:'count',direction:'desc'}).all.map(e=>e.index),[4,0,1,2,3,5]);
assert.equal(C.inventory(rowsForFields,{field:'text',value:'<script>'}).matched,1);
assert.equal(C.inventory(rowsForFields,{field:'toString',operator:'empty'}).matched,6);
assert.equal(C.inventory(rowsForFields,{query:'ready',field:'count',operator:'atLeast',value:5}).matched,1);
assert.equal(C.inventory(rowsForFields,{sortKey:'count',limit:2,offset:2}).entries[0].index,0);
for(const value of ['', 'Infinity','NaN','not numeric'])assert.throws(()=>C.inventory(rowsForFields,{field:'count',operator:'atLeast',value}),/finite number/);
assert.throws(()=>C.inventory(rowsForFields,{operator:'eval'}),/valid inventory/);
assert.throws(()=>C.inventory(rowsForFields,{direction:'sideways'}),/valid inventory/);
assert.equal(JSON.stringify(rowsForFields),rowsBefore);
console.log('PASS: literal field filters, finite numeric bounds, stable mixed-value sorting, missing-last ordering, pagination identity and nonmutation.');
