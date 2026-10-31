const assert = require("node:assert/strict"),
  C = require("./task-board-core"),
  N = require("./notebook-core");
const apps = [
    { id: "textiX", name: "Documents" },
    { id: "mockiX", name: "Mockups" },
    { id: "shelliX", name: "Shell" },
  ],
  a = {
    ...N.empty("textiX"),
    title: "Launch notes",
    notes: "Accessibility review",
    tasks: [
      { id: "same", text: "Proofread copy", done: false },
      { id: "done", text: "Check links", done: true },
    ],
  },
  b = {
    ...N.empty("mockiX"),
    title: "Checkout",
    tasks: [{ id: "same", text: "Refine mobile flow", done: false }],
  },
  store = new Map([
    [C.key("textiX"), JSON.stringify(a)],
    [C.key("mockiX"), JSON.stringify(b)],
    [C.key("shelliX"), "{broken"],
  ]);
const collected = C.collect(apps, (key) => store.get(key) ?? null);
assert.equal(collected.books.length, 2);
assert.equal(collected.errors.length, 1);
assert.equal(C.search(collected.books).length, 2);
assert.equal(C.search(collected.books, { status: "all" }).length, 3);
assert.equal(C.search(collected.books, { status: "done" })[0].task.id, "done");
assert.equal(
  C.search(collected.books, { query: "review proofread" })[0].tool,
  "textiX",
);
assert.equal(
  C.search(collected.books, { tool: "mockiX" })[0].task.text,
  "Refine mobile flow",
);
assert.notEqual(C.identity("textiX", "same"), C.identity("mockiX", "same"));
const book = collected.books[0],
  before = JSON.stringify(book),
  next = JSON.parse(C.toggle(book, "same", true, book.raw));
assert.equal(next.tasks[0].done, true);
assert.equal(JSON.stringify(book), before);
assert.throws(() => C.toggle(book, "same", true, "newer notebook"), /changed/);
assert.throws(() => C.toggle(book, "missing", true, book.raw), /no longer/);
assert.throws(() => C.toggle(book, "same", "yes", book.raw), /boolean/);
assert.match(C.brief(C.search(collected.books)), /not permission/);
assert.throws(() => C.brief([]), /Select/);
assert.throws(
  () =>
    C.brief([
      { app: "X", title: "Y", task: { text: "a".repeat(30000), done: false } },
    ]),
  /30,000/,
);
assert.match(
  C.markdown(C.search(collected.books, { status: "all" })),
  /- \[x\] Check links/,
);
console.log(
  "PASS: cross-app notebook search/filter, corrupt data isolation, unique task keys, nonmutating completion, stale-write rejection, bounded AI briefs and exports.",
);
const created = JSON.parse(
  C.saveTask("textiX", null, null, {
    id: "new",
    text: "  New task  ",
    create: true,
  }),
);
assert.equal(created.tasks[0].text, "New task");
assert.equal(created.tasks[0].done, false);
const edited = JSON.parse(
  C.saveTask("textiX", book.raw, book.raw, {
    id: "done",
    text: "Updated completed task",
    create: false,
  }),
);
assert.equal(edited.tasks.find((t) => t.id === "done").done, true);
assert.equal(edited.notes, book.doc.notes);
assert.equal(edited.tasks[0].text, book.doc.tasks[0].text);
assert.throws(
  () => C.saveTask("textiX", "changed", book.raw, { id: "same", text: "x" }),
  /changed/,
);
assert.throws(
  () => C.saveTask("textiX", book.raw, book.raw, { id: "missing", text: "x" }),
  /no longer/,
);
assert.throws(
  () =>
    C.saveTask("textiX", book.raw, book.raw, {
      id: "same",
      text: "x",
      create: true,
    }),
  /already exists/,
);
assert.throws(() =>
  C.saveTask("textiX", "{broken", "{broken", {
    id: "new",
    text: "x",
    create: true,
  }),
);
assert.throws(
  () =>
    C.saveTask("mockiX", book.raw, book.raw, {
      id: "new",
      text: "x",
      create: true,
    }),
  /another app/,
);
for (const text of ["   ", "x".repeat(5001)])
  assert.throws(
    () => C.saveTask("textiX", null, null, { id: "new", text, create: true }),
    /5,000/,
  );
console.log(
  "PASS: direct task creation/editing, exact source conflict checks, preserved completion/notes, corrupt/wrong-app/collision guards and bounded task text.",
);
const packet = C.worklist(C.search(collected.books, { status: "all" })),
  packetBefore = JSON.stringify(packet),
  imported = C.importWorklist(packet, "textiX", book.raw);
assert.equal(imported.added, 1);
assert.equal(imported.skipped, 2);
assert.equal(imported.doc.notes, book.doc.notes);
assert.equal(imported.doc.tasks.find((t) => t.id === "done").done, true);
assert.equal(JSON.stringify(packet), packetBefore);
assert.equal(
  C.importWorklist(packet, "textiX", JSON.stringify(imported.doc)).added,
  0,
);
const duplicateFlag = C.importWorklist(
  C.worklist([
    {
      tool: "mockiX",
      title: "Source",
      task: { id: "x", text: "Proofread copy", done: true },
    },
  ]),
  "textiX",
  book.raw,
);
assert.equal(duplicateFlag.doc.tasks[0].done, false);
assert.equal(duplicateFlag.skipped, 1);
assert.throws(
  () => C.validateWorklist({ format: "wrong", tasks: [] }),
  /worklist/,
);
assert.throws(
  () => C.importWorklist(packet, "mockiX", book.raw),
  /another app/,
);
assert.throws(() => C.importWorklist(packet, "textiX", "{broken"));
assert.throws(() => C.worklist([]), /Choose/);
assert.throws(
  () =>
    C.worklist([
      {
        tool: "x",
        title: "x",
        task: { id: "x", text: "x".repeat(5001), done: false },
      },
    ]),
  /invalid/,
);
assert.equal(C.importWorklist(packet, "shelliX", null).doc.tool, "shelliX");
console.log(
  "PASS: bounded portable worklists, additive import, exact-text duplicate skipping, original completion preserved, independent copies and wrong/corrupt destination rejection.",
);
assert.throws(
  () =>
    C.worklist(
      Array.from({ length: 130 }, (_, i) => ({
        tool: "textiX",
        title: "Unicode",
        task: { id: "t" + i, text: "🧪".repeat(2000), done: false },
      })),
    ),
  /UTF-8 bytes/,
);
